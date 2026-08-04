import {
  CHUB_TWO_MAIN_COMPOSITION_URL,
  ECOMMERCE_CAROUSEL_ROLES,
  buildEcommerceCarouselPrompts,
  CHUB_TWO_DEFAULT_STYLE_GUIDE,
  CHUB_TWO_DEFAULT_GENERATION_CONFIG,
} from "./ecommerce-assets";
import { generateEcommerceAssetsJobId } from "./ecommerce-assets-store";
import { createKieImageTask, getKieImageStatus, uploadKieImage } from "./kie";
import type {
  EcommerceAssetsJob,
  EcommerceCarouselRole,
  EcommerceCopyProposal,
  EcommerceManufacturerReferenceGroup,
  EcommerceSlotStatus,
  EcommerceGenerationConfig,
} from "./types";

function isTerminal(status: EcommerceSlotStatus) {
  return status === "success" || status === "fail";
}

function normalizeReferenceGroups(
  value: unknown,
): Record<EcommerceCarouselRole, string[]> {
  const groups: Record<EcommerceCarouselRole, string[]> = {
    main: [],
    scene: [],
    detail: [],
    variant: [],
  };
  if (!Array.isArray(value)) return groups;
  for (const item of value as EcommerceManufacturerReferenceGroup[]) {
    if (!item || !ECOMMERCE_CAROUSEL_ROLES.includes(item.role)) continue;
    groups[item.role] = Array.isArray(item.dataUrls)
      ? item.dataUrls.filter(
          (url): url is string =>
            typeof url === "string" && Boolean(url.trim()),
        )
      : [];
  }
  return groups;
}

async function uploadGroup(dataUrls: string[], prefix: string, jobId: string) {
  return Promise.all(
    dataUrls.map((dataUrl, index) =>
      uploadKieImage(
        dataUrl,
        `${prefix}-${index + 1}-${jobId}.jpg`,
        "lantian-tools/ecommerce-assets",
      ),
    ),
  );
}

export async function createEcommerceAssetsJob(input: {
  productSkuDataUrls: string[];
  primarySkuIndex?: number;
  manufacturerReferenceGroups: unknown;
  selectedCopyBySlot: Record<string, EcommerceCopyProposal>;
  styleGuide?: string;
  generationConfig?: EcommerceGenerationConfig;
}) {
  const jobId = generateEcommerceAssetsJobId();
  const productDataUrls = input.productSkuDataUrls.filter(Boolean);
  const primarySkuIndex = Math.min(
    Math.max(input.primarySkuIndex ?? 0, 0),
    productDataUrls.length - 1,
  );
  const referenceGroups = normalizeReferenceGroups(
    input.manufacturerReferenceGroups,
  );
  const now = Date.now();

  const uploadedSkuUrls = await Promise.all(
    productDataUrls.map((dataUrl, index) =>
      uploadKieImage(
        dataUrl,
        `chub-two-sku-${index + 1}-${jobId}.jpg`,
        "lantian-tools/ecommerce-assets",
      ),
    ),
  );
  const productSkuImageUrls = [
    uploadedSkuUrls[primarySkuIndex],
    ...uploadedSkuUrls.filter((_, index) => index !== primarySkuIndex),
  ];
  const manufacturerReferenceImageUrls = {
    main: await uploadGroup(
      referenceGroups.main,
      "chub-two-main-reference",
      jobId,
    ),
    scene: await uploadGroup(
      referenceGroups.scene,
      "chub-two-scene-reference",
      jobId,
    ),
    detail: await uploadGroup(
      referenceGroups.detail,
      "chub-two-detail-reference",
      jobId,
    ),
    variant: await uploadGroup(
      referenceGroups.variant,
      "chub-two-variant-reference",
      jobId,
    ),
  } satisfies Record<EcommerceCarouselRole, string[]>;
  const generationConfig = {
    ...CHUB_TWO_DEFAULT_GENERATION_CONFIG,
    ...input.generationConfig,
    styleGuide:
      input.styleGuide?.trim() ||
      input.generationConfig?.styleGuide ||
      CHUB_TWO_DEFAULT_STYLE_GUIDE,
  } satisfies EcommerceGenerationConfig;
  const personImageUrl = generationConfig.person.imageUrl;
  const selectedCopyBySlot = input.selectedCopyBySlot;
  const styleGuide = input.styleGuide?.trim() || CHUB_TWO_DEFAULT_STYLE_GUIDE;
  const prompts = buildEcommerceCarouselPrompts({
    skuImageCount: productSkuImageUrls.length,
    primarySkuIndex: 0,
    selectedCopyBySlot,
    manufacturerReferenceCountByRole: {
      scene: manufacturerReferenceImageUrls.scene.length,
      detail: manufacturerReferenceImageUrls.detail.length,
      variant: manufacturerReferenceImageUrls.variant.length,
    },
    styleGuide,
    generationConfig,
  });

  const slots = await Promise.all(
    prompts.map(async (promptSlot) => {
      const roleReferences = manufacturerReferenceImageUrls[promptSlot.role];
      const inputUrls =
        promptSlot.role === "main"
          ? [
              productSkuImageUrls[0],
              generationConfig.mainComposition.imageUrl,
              ...(promptSlot.usePerson ? [personImageUrl] : []),
            ]
          : [
              generationConfig.logo.imageUrl,
              ...(promptSlot.role === "variant" ? productSkuImageUrls : []),
              ...roleReferences,
            ];
      const taskId = await createKieImageTask({
        prompt: promptSlot.prompt,
        inputUrls,
        aspectRatio: "1:1",
        resolution: "1K",
      });
      return { ...promptSlot, taskId, status: "waiting" as const };
    }),
  );

  const job: EcommerceAssetsJob = {
    id: jobId,
    status: "processing",
    textLanguage: "en",
    imageResolution: "1K",
    imageAspectRatio: "1:1",
    styleGuide,
    productSkuImageUrls,
    primarySkuIndex: 0,
    manufacturerReferenceImageUrls,
    brandLogo: { enabled: true, logoImageUrl: generationConfig.logo.imageUrl },
    generationConfig,
    personImageUrl,
    carouselImages: slots,
    createdAt: now,
    updatedAt: Date.now(),
  };
  return job;
}

async function refreshSlot(slot: EcommerceAssetsJob["carouselImages"][number]) {
  if (isTerminal(slot.status)) return slot;
  try {
    const status = await getKieImageStatus(slot.taskId);
    if (status.status === "success")
      return {
        ...slot,
        status: "success" as const,
        resultUrl: status.resultUrl,
      };
    if (status.status === "fail")
      return {
        ...slot,
        status: "fail" as const,
        error: status.error || "Image generation failed.",
      };
    return { ...slot, status: status.status };
  } catch {
    return slot;
  }
}

export async function refreshEcommerceAssetsJob(
  currentJob: EcommerceAssetsJob,
): Promise<EcommerceAssetsJob> {
  const carouselImages = await Promise.all(
    currentJob.carouselImages.map(refreshSlot),
  );
  const status = carouselImages.every((slot) => isTerminal(slot.status))
    ? carouselImages.some((slot) => slot.status === "fail")
      ? "failed"
      : "completed"
    : "processing";
  return { ...currentJob, carouselImages, status, updatedAt: Date.now() };
}

export function getSlotReferenceUrls(
  job: EcommerceAssetsJob,
  slot: EcommerceAssetsJob["carouselImages"][number],
) {
  return slot.role === "main"
    ? [
        ...job.productSkuImageUrls.slice(0, 1),
        job.generationConfig?.mainComposition.imageUrl ??
          CHUB_TWO_MAIN_COMPOSITION_URL,
        ...(slot.usePerson && job.personImageUrl ? [job.personImageUrl] : []),
      ]
    : [
        ...(job.brandLogo?.enabled ? [job.brandLogo.logoImageUrl] : []),
        ...(slot.role === "variant" ? job.productSkuImageUrls : []),
        ...(job.manufacturerReferenceImageUrls[slot.role] ?? []),
      ];
}
