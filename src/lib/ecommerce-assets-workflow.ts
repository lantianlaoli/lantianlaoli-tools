import {
  analyzeManufacturerPromoForEcommerceAssets,
  analyzeProductForEcommerceAssets,
  buildEcommerceImagePrompts,
  buildEcommerceStoryboardPrompt,
  buildEcommerceVideoPrompt,
  buildManufacturerPromoCarouselPrompt,
  fallbackEcommerceBrief,
} from "./ecommerce-assets";
import {
  generateEcommerceAssetsJobId,
} from "./ecommerce-assets-store";
import { normalizeEcommerceTextLanguage } from "./ecommerce-language";
import {
  createKieImageTask,
  createKieSeedanceVideoTask,
  getKieCallbackUrl,
  uploadKieImage,
} from "./kie";
import { getStoredJobStatus } from "./job-store";
import type {
  EcommerceAssetScope,
  EcommerceAssetScopeOption,
  EcommerceAssetsJob,
  EcommerceCreativeBrief,
  EcommerceImageSlot,
  EcommerceSourceMode,
  EcommerceSlotStatus,
  EcommerceTextLanguage,
  KieAspectRatio,
  KieResolution,
} from "./types";

function isTerminal(status: EcommerceSlotStatus) {
  return status === "success" || status === "fail";
}

export function normalizeEcommerceAssetScope(value: unknown): EcommerceAssetScope {
  return value === "carousel" || value === "detail" || value === "video" || value === "all" ? value : "all";
}

const ALL_ASSET_SCOPE_OPTIONS: EcommerceAssetScopeOption[] = ["carousel", "detail", "video"];
const MANUFACTURER_PROMO_LIMIT = 6;

function normalizeSourceMode(value: unknown): EcommerceSourceMode {
  return value === "manufacturer-promos" ? "manufacturer-promos" : "product-photos";
}

export function normalizeEcommerceAssetScopes(value: unknown, legacyScope?: unknown): EcommerceAssetScopeOption[] {
  if (Array.isArray(value)) {
    const scopes = value.filter((scope): scope is EcommerceAssetScopeOption =>
      scope === "carousel" || scope === "detail" || scope === "video"
    );
    const uniqueScopes = ALL_ASSET_SCOPE_OPTIONS.filter((scope) => scopes.includes(scope));
    if (uniqueScopes.length > 0) return uniqueScopes;
  }

  const normalizedLegacyScope = normalizeEcommerceAssetScope(legacyScope);
  return normalizedLegacyScope === "all" ? ALL_ASSET_SCOPE_OPTIONS : [normalizedLegacyScope];
}

function primaryAssetScope(scopes: EcommerceAssetScopeOption[]): EcommerceAssetScope {
  return scopes.length === ALL_ASSET_SCOPE_OPTIONS.length ? "all" : scopes[0] ?? "all";
}

function activeScopes(job: Pick<EcommerceAssetsJob, "assetScope" | "assetScopes">): EcommerceAssetScopeOption[] {
  return job.assetScopes?.length ? job.assetScopes : normalizeEcommerceAssetScopes(undefined, job.assetScope);
}

function includesCarousel(scopes: EcommerceAssetScopeOption[]) {
  return scopes.includes("carousel");
}

function includesDetail(scopes: EcommerceAssetScopeOption[]) {
  return scopes.includes("detail");
}

function includesVideo(scopes: EcommerceAssetScopeOption[]) {
  return scopes.includes("video");
}

function overallStatus(job: EcommerceAssetsJob): EcommerceAssetsJob["status"] {
  const scopes = activeScopes(job);
  const imageSlots = [
    ...(includesCarousel(scopes) ? job.carouselImages : []),
    ...(includesDetail(scopes) ? job.detailImages : []),
  ];
  const needsVideo = includesVideo(scopes);
  const allDone = imageSlots.every((slot) => isTerminal(slot.status)) && (!needsVideo || isTerminal(job.video.status));
  if (allDone) return imageSlots.some((slot) => slot.status === "fail") || (needsVideo && job.video.status === "fail") ? "failed" : "completed";
  if (job.error) return "failed";
  return "processing";
}

async function createImageSlots(input: {
  brief: EcommerceCreativeBrief;
  productImageUrl: string;
  productImageUrls: string[];
  textLanguage: EcommerceTextLanguage;
  imageResolution: KieResolution;
  imageAspectRatio: KieAspectRatio;
  assetScopes: EcommerceAssetScopeOption[];
}) {
  const promptSlots = buildEcommerceImagePrompts(input.brief, input.textLanguage, input.productImageUrls.length).filter((slot) => {
    if (slot.kind === "carousel") return includesCarousel(input.assetScopes);
    return includesDetail(input.assetScopes);
  });
  const slots: EcommerceImageSlot[] = [];
  const callBackUrl = getKieCallbackUrl();

  for (const promptSlot of promptSlots) {
    const taskId = await createKieImageTask({
      prompt: promptSlot.prompt,
      inputUrls: input.productImageUrls,
      aspectRatio: input.imageAspectRatio,
      resolution: input.imageResolution,
      callBackUrl,
    });
    slots.push({
      id: `${promptSlot.kind}-${promptSlot.index}`,
      kind: promptSlot.kind,
      index: promptSlot.index,
      title: promptSlot.title,
      taskId,
      status: "waiting",
      prompt: promptSlot.prompt,
    });
  }

  return {
    carouselImages: slots.filter((slot) => slot.kind === "carousel"),
    detailImages: slots.filter((slot) => slot.kind === "detail"),
  };
}

async function createManufacturerPromoImageSlots(input: {
  manufacturerPromoImageUrls: string[];
  customRequirements?: string;
  textLanguage: EcommerceTextLanguage;
  imageResolution: KieResolution;
  imageAspectRatio: KieAspectRatio;
}) {
  const callBackUrl = getKieCallbackUrl();
  const results = await Promise.all(
    input.manufacturerPromoImageUrls.map(async (imageUrl, index) => {
      const analysis = await analyzeManufacturerPromoForEcommerceAssets(imageUrl, input.textLanguage);
      const prompt = buildManufacturerPromoCarouselPrompt({
        analysis,
        customRequirements: input.customRequirements,
        textLanguage: input.textLanguage,
        sourceIndex: index,
      });
      const taskId = await createKieImageTask({
        prompt,
        inputUrls: [imageUrl],
        aspectRatio: input.imageAspectRatio,
        resolution: input.imageResolution,
        callBackUrl,
      });
      const slot: EcommerceImageSlot = {
        id: `manufacturer-carousel-${index + 1}`,
        kind: "carousel",
        index: index + 1,
        sourceIndex: index,
        title: input.textLanguage === "zh" ? `厂家图 ${index + 1}` : `Manufacturer Image ${index + 1}`,
        taskId,
        status: "waiting",
        prompt,
      };
      return { slot, analysis };
    })
  );

  return {
    analyses: results.map((entry) => entry.analysis),
    carouselImages: results.map((entry) => entry.slot),
  };
}

export async function createEcommerceAssetsJob(input: {
  productPhotoDataUrls: string[];
  sourceMode?: unknown;
  manufacturerPromoDataUrls?: string[];
  customRequirements?: string;
  textLanguage?: unknown;
  imageResolution?: string;
  imageAspectRatio?: string;
  videoAspectRatio?: string;
  videoResolution?: string;
  assetScope?: unknown;
  assetScopes?: unknown;
}) {
  const textLanguage = normalizeEcommerceTextLanguage(input.textLanguage);
  const sourceMode = normalizeSourceMode(input.sourceMode);
  const assetScopes = sourceMode === "manufacturer-promos"
    ? (["carousel"] as EcommerceAssetScopeOption[])
    : normalizeEcommerceAssetScopes(input.assetScopes, input.assetScope);
  const assetScope = primaryAssetScope(assetScopes);
  const imageResolution: KieResolution = ["1K", "2K", "4K"].includes(input.imageResolution ?? "")
    ? (input.imageResolution as KieResolution)
    : "1K";
  const imageAspectRatio: KieAspectRatio = ["1:1", "4:3", "3:4", "16:9", "9:16"].includes(input.imageAspectRatio ?? "")
    ? (input.imageAspectRatio as KieAspectRatio)
    : "1:1";
  const videoAspectRatio: KieAspectRatio = ["1:1", "4:3", "3:4", "16:9", "9:16"].includes(input.videoAspectRatio ?? "")
    ? (input.videoAspectRatio as KieAspectRatio)
    : "1:1";
  const videoResolution: "480p" | "720p" = input.videoResolution === "720p" ? "720p" : "480p";
  const jobId = generateEcommerceAssetsJobId();
  const now = Date.now();
  let job: EcommerceAssetsJob = {
    id: jobId,
    sourceMode,
    status: "preparing",
    assetScope,
    assetScopes,
    textLanguage,
    customRequirements: input.customRequirements,
    imageAspectRatio,
    videoAspectRatio,
    carouselImages: [],
    detailImages: [],
    video: {
      status: "waiting",
      prompt: "",
    },
    createdAt: now,
    updatedAt: now,
  };

  try {
    if (sourceMode === "manufacturer-promos") {
      const promoDataUrls = (input.manufacturerPromoDataUrls ?? []).filter(Boolean);
      if (promoDataUrls.length === 0) {
        throw new Error("At least one manufacturerPromoDataUrl is required.");
      }
      if (promoDataUrls.length > MANUFACTURER_PROMO_LIMIT) {
        throw new Error(`Upload up to ${MANUFACTURER_PROMO_LIMIT} manufacturer promo images.`);
      }

      const manufacturerPromoImageUrls = await Promise.all(
        promoDataUrls.map((dataUrl, i) =>
          uploadKieImage(dataUrl, `manufacturer-promo-${i + 1}-${jobId}.jpg`, "lantian-tools/ecommerce-manufacturer-promos")
        )
      );
      const manufacturerSlots = await createManufacturerPromoImageSlots({
        manufacturerPromoImageUrls,
        customRequirements: input.customRequirements,
        textLanguage,
        imageResolution,
        imageAspectRatio,
      });

      return {
        ...job,
        status: "processing",
        imageResolution,
        manufacturerPromoImageUrls,
        manufacturerPromoAnalyses: manufacturerSlots.analyses,
        carouselImages: manufacturerSlots.carouselImages,
        detailImages: [],
        video: { status: "waiting", prompt: "" },
        updatedAt: Date.now(),
      };
    }

    const viewLabels = ["front", "side", "back"];
    const uploadResults = await Promise.all(
      input.productPhotoDataUrls.map((dataUrl, i) =>
        uploadKieImage(dataUrl, `ecommerce-product-${viewLabels[i] ?? i}-${jobId}.jpg`, "lantian-tools/ecommerce-assets")
      )
    );
    const productImageUrls = uploadResults;
    const productImageUrl = productImageUrls[0];
    let brief: EcommerceCreativeBrief;
    try {
      brief = await analyzeProductForEcommerceAssets(productImageUrls, textLanguage, input.customRequirements);
    } catch (error) {
      console.error("[ecommerce-assets] Falling back after product analysis failed:", error instanceof Error ? error.message : error);
      brief = fallbackEcommerceBrief(textLanguage);
    }

    const imageSlots = await createImageSlots({ brief, productImageUrl, productImageUrls, textLanguage, imageResolution, imageAspectRatio, assetScopes });
    const storyboardPrompt = includesVideo(assetScopes) ? buildEcommerceStoryboardPrompt(brief, textLanguage, productImageUrls.length) : "";
    const storyboardTaskId = storyboardPrompt
      ? await createKieImageTask({
          prompt: storyboardPrompt,
          inputUrls: productImageUrls,
          aspectRatio: videoAspectRatio,
          resolution: imageResolution,
          callBackUrl: getKieCallbackUrl(),
        })
      : undefined;

    job = {
      ...job,
      status: "processing",
      imageResolution,
      videoResolution,
      productImageUrl,
      productImageUrls,
      brief,
      ...imageSlots,
      video: {
        storyboardTaskId,
        status: "waiting",
        prompt: includesVideo(assetScopes) ? buildEcommerceVideoPrompt(brief, textLanguage, productImageUrls.length) : "",
      },
      updatedAt: Date.now(),
    };
    return job;
  } catch (error) {
    throw error;
  }
}

async function refreshImageSlot(slot: EcommerceImageSlot): Promise<EcommerceImageSlot> {
  if (isTerminal(slot.status) || !slot.taskId) return slot;
  const status = await getStoredJobStatus(slot.taskId);
  if (!status) return slot;
  if (status.status === "success") {
    return { ...slot, status: "success", resultUrl: status.resultUrl };
  }
  if (status.status === "fail") {
    return { ...slot, status: "fail", error: status.error || "Image generation failed." };
  }
  return { ...slot, status: status.status };
}

export async function refreshEcommerceAssetsJob(currentJob: EcommerceAssetsJob): Promise<EcommerceAssetsJob> {
  const carouselImages = await Promise.all(currentJob.carouselImages.map(refreshImageSlot));
  const detailImages = await Promise.all(currentJob.detailImages.map(refreshImageSlot));
  let video = { ...currentJob.video };
  const needsVideo = includesVideo(activeScopes(currentJob));

  if (needsVideo && video.storyboardTaskId && !video.storyboardUrl && video.status !== "fail") {
    const storyboardStatus = await getStoredJobStatus(video.storyboardTaskId);
    if (storyboardStatus?.status === "success" && storyboardStatus.resultUrl) {
      video = { ...video, storyboardUrl: storyboardStatus.resultUrl, status: "processing" };
    } else if (storyboardStatus?.status === "fail") {
      video = { ...video, status: "fail", error: storyboardStatus.error || "Storyboard generation failed." };
    } else if (storyboardStatus) {
      video = { ...video, status: storyboardStatus.status };
    }
  }

  if (
    needsVideo &&
    video.storyboardUrl &&
    !video.taskId &&
    video.status !== "fail" &&
    currentJob.productImageUrl
  ) {
    const productRefs = currentJob.productImageUrls && currentJob.productImageUrls.length > 0
      ? currentJob.productImageUrls
      : [currentJob.productImageUrl];
    const videoRes: "480p" | "720p" = currentJob.videoResolution === "720p" ? "720p" : "480p";
    const videoAspect = (["1:1", "16:9", "9:16"].includes(currentJob.videoAspectRatio ?? "")
      ? currentJob.videoAspectRatio!
      : "1:1") as "1:1" | "16:9" | "9:16";
    const taskId = await createKieSeedanceVideoTask({
      prompt: video.prompt,
      referenceImageUrls: [...productRefs, video.storyboardUrl],
      aspectRatio: videoAspect,
      resolution: videoRes,
      duration: 15,
      callBackUrl: getKieCallbackUrl(),
    });
    video = { ...video, taskId, status: "processing" };
  } else if (video.taskId && !isTerminal(video.status)) {
    const videoStatus = await getStoredJobStatus(video.taskId);
    if (!videoStatus) {
      const updated = {
        ...currentJob,
        carouselImages,
        detailImages,
        video,
        updatedAt: Date.now(),
      };
      return { ...updated, status: overallStatus(updated) };
    }
    if (videoStatus.status === "success" && videoStatus.resultUrl) {
      video = { ...video, status: "success", resultUrl: videoStatus.resultUrl };
    } else if (videoStatus.status === "fail") {
      video = { ...video, status: "fail", error: videoStatus.error || "Video generation failed." };
    } else {
      video = { ...video, status: videoStatus.status };
    }
  }

  const updated = {
    ...currentJob,
    carouselImages,
    detailImages,
    video,
    updatedAt: Date.now(),
  };
  return { ...updated, status: overallStatus(updated) };
}

export { normalizeEcommerceTextLanguage };
