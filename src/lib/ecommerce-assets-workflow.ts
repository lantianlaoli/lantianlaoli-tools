import {
  analyzeProductForEcommerceAssets,
  buildEcommerceImagePrompts,
  buildEcommerceStoryboardPrompt,
  buildEcommerceVideoPrompt,
  fallbackEcommerceBrief,
} from "./ecommerce-assets";
import {
  generateEcommerceAssetsJobId,
} from "./ecommerce-assets-store";
import { normalizeEcommerceTextLanguage } from "./ecommerce-language";
import {
  createKieImageTask,
  createKieSeedanceVideoTask,
  getKieTaskStatus,
  uploadKieImage,
} from "./kie";
import type {
  EcommerceAssetsJob,
  EcommerceCreativeBrief,
  EcommerceImageSlot,
  EcommerceSlotStatus,
  EcommerceTextLanguage,
  KieAspectRatio,
  KieResolution,
} from "./types";

function isTerminal(status: EcommerceSlotStatus) {
  return status === "success" || status === "fail";
}

function overallStatus(job: EcommerceAssetsJob): EcommerceAssetsJob["status"] {
  const imageSlots = [...job.carouselImages, ...job.detailImages];
  const allDone = imageSlots.every((slot) => isTerminal(slot.status)) && isTerminal(job.video.status);
  if (allDone) return imageSlots.some((slot) => slot.status === "fail") || job.video.status === "fail" ? "failed" : "completed";
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
}) {
  const promptSlots = buildEcommerceImagePrompts(input.brief, input.textLanguage, input.productImageUrls.length);
  const slots: EcommerceImageSlot[] = [];

  for (const promptSlot of promptSlots) {
    const taskId = await createKieImageTask({
      prompt: promptSlot.prompt,
      inputUrls: input.productImageUrls,
      aspectRatio: input.imageAspectRatio,
      resolution: input.imageResolution,
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

export async function createEcommerceAssetsJob(input: {
  productPhotoDataUrls: string[];
  customRequirements?: string;
  textLanguage?: unknown;
  imageResolution?: string;
  imageAspectRatio?: string;
  videoAspectRatio?: string;
  videoResolution?: string;
}) {
  const textLanguage = normalizeEcommerceTextLanguage(input.textLanguage);
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
    status: "preparing",
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
    const viewLabels = ["front", "side", "back"];
    const uploadResults = await Promise.all(
      input.productPhotoDataUrls.map((dataUrl, i) =>
        uploadKieImage(dataUrl, `ecommerce-product-${viewLabels[i] ?? i}-${jobId}.jpg`, "rivora/ecommerce-assets")
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

    const imageSlots = await createImageSlots({ brief, productImageUrl, productImageUrls, textLanguage, imageResolution, imageAspectRatio });
    const storyboardPrompt = buildEcommerceStoryboardPrompt(brief, textLanguage, productImageUrls.length);
    const storyboardTaskId = await createKieImageTask({
      prompt: storyboardPrompt,
      inputUrls: productImageUrls,
      aspectRatio: videoAspectRatio,
      resolution: imageResolution,
    });

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
        prompt: buildEcommerceVideoPrompt(brief, textLanguage, productImageUrls.length),
      },
      updatedAt: Date.now(),
    };
    return job;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create ecommerce assets job.";
    throw error;
  }
}

async function refreshImageSlot(slot: EcommerceImageSlot): Promise<EcommerceImageSlot> {
  if (isTerminal(slot.status) || !slot.taskId) return slot;
  const status = await getKieTaskStatus(slot.taskId);
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

  if (video.storyboardTaskId && !video.storyboardUrl && video.status !== "fail") {
    const storyboardStatus = await getKieTaskStatus(video.storyboardTaskId);
    if (storyboardStatus.status === "success" && storyboardStatus.resultUrl) {
      video = { ...video, storyboardUrl: storyboardStatus.resultUrl, status: "processing" };
    } else if (storyboardStatus.status === "fail") {
      video = { ...video, status: "fail", error: storyboardStatus.error || "Storyboard generation failed." };
    } else {
      video = { ...video, status: storyboardStatus.status };
    }
  }

  if (
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
    });
    video = { ...video, taskId, status: "processing" };
  } else if (video.taskId && !isTerminal(video.status)) {
    const videoStatus = await getKieTaskStatus(video.taskId);
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
