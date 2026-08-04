import {
  createKieImageTask,
  getKieImageStatus,
  uploadKieImage,
  uploadKieUrlFile,
} from "./kie";
import {
  buildStyleImagePrompt,
  generateSkuIds,
} from "./ecommerce-product-info";
import {
  addEcommerceStyleImageJob,
  generateEcommerceStyleImageJobId,
  updateEcommerceStyleImageJob,
} from "./ecommerce-style-images-store";
import type {
  EcommerceStyleImageJob,
  EcommerceStyleImageSlot,
  EcommerceSlotStatus,
} from "./types";

function isTerminal(status: EcommerceSlotStatus) {
  return status === "success" || status === "fail";
}

function isRetryableImageFetchError(error?: string) {
  return Boolean(
    error && /image fetch failed|fetch failed|error code:\s*400/i.test(error),
  );
}

export async function createEcommerceStyleImageJob(input: {
  productSkuDataUrls: string[];
  skuFileNames?: string[];
  styleGuide?: string;
}) {
  const jobId = generateEcommerceStyleImageJobId();
  const styleGuide = input.styleGuide?.trim() ?? "";
  const skuIdsResult = await generateSkuIds({
    skuImageUrls: input.productSkuDataUrls.filter(Boolean),
    sourceNames: input.skuFileNames,
  });
  const sourceSkuUrls = await Promise.all(
    input.productSkuDataUrls
      .filter(Boolean)
      .map((dataUrl, index) =>
        uploadKieImage(
          dataUrl,
          `chub-two-style-sku-${index + 1}-${jobId}.jpg`,
          "lantian-tools/ecommerce-style-images",
        ),
      ),
  );
  const slots = sourceSkuUrls.map((sourceSkuImageUrl, skuIndex) => {
    const prompt = buildStyleImagePrompt({
      skuIndex,
      skuId: skuIdsResult.ids[skuIndex],
      styleGuide,
    });
    return {
      id: `style-${skuIndex + 1}`,
      skuIndex,
      sourceSkuImageUrl,
      taskId: "",
      status: "waiting" as const,
      prompt,
    } satisfies EcommerceStyleImageSlot;
  });
  const masterPrompt = slots[0].prompt;
  slots[0].taskId = await createKieImageTask({
    prompt: masterPrompt,
    inputUrls: [sourceSkuUrls[0]],
    aspectRatio: "1:1",
    resolution: "1K",
  });
  const now = Date.now();
  const job: EcommerceStyleImageJob = {
    id: jobId,
    status: "processing",
    styleGuide,
    productSkuImageUrls: sourceSkuUrls,
    skuIds: skuIdsResult.ids,
    styleImages: slots,
    createdAt: now,
    updatedAt: now,
  };
  addEcommerceStyleImageJob(job);
  return job;
}

async function refreshSlot(slot: EcommerceStyleImageSlot) {
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
        error: status.error || "Style image generation failed.",
      };
    return { ...slot, status: status.status };
  } catch {
    return slot;
  }
}

export async function refreshEcommerceStyleImageJob(
  currentJob: EcommerceStyleImageJob,
) {
  const styleImages = await Promise.all(
    currentJob.styleImages.map((slot) =>
      slot.taskId ? refreshSlot(slot) : slot,
    ),
  );
  let masterStyleImageUrl = currentJob.masterStyleImageUrl;
  if (styleImages[0]?.resultUrl && !masterStyleImageUrl) {
    try {
      masterStyleImageUrl = await uploadKieUrlFile({
        fileUrl: styleImages[0].resultUrl,
        fileName: `chub-two-style-master-${currentJob.id}.png`,
        uploadPath: "lantian-tools/ecommerce-style-images",
      });
    } catch (error) {
      console.warn(
        "[ecommerce-assets/style-images] Failed to archive master image; using result URL:",
        error,
      );
      masterStyleImageUrl = styleImages[0].resultUrl;
    }
  }
  const retryableSlot = styleImages.find(
    (slot) =>
      slot.status === "fail" &&
      isRetryableImageFetchError(slot.error) &&
      (slot.autoRetryCount ?? 0) < 1,
  );
  if (retryableSlot) {
    const compositionReferenceUrl =
      retryableSlot.skuIndex === 0 ? undefined : masterStyleImageUrl;
    const prompt = buildStyleImagePrompt({
      skuIndex: retryableSlot.skuIndex,
      skuId: currentJob.skuIds?.[retryableSlot.skuIndex],
      styleGuide: currentJob.styleGuide,
      compositionReferenceUrl,
    });
    retryableSlot.taskId = await createKieImageTask({
      prompt,
      inputUrls: [
        retryableSlot.sourceSkuImageUrl,
        ...(compositionReferenceUrl ? [compositionReferenceUrl] : []),
      ],
      aspectRatio: "1:1",
      resolution: "1K",
    });
    retryableSlot.prompt = prompt;
    retryableSlot.status = "waiting";
    retryableSlot.error = undefined;
    retryableSlot.autoRetryCount = (retryableSlot.autoRetryCount ?? 0) + 1;
  }
  const nextIndex = styleImages.findIndex((slot) => !slot.taskId);
  if (
    nextIndex >= 1 &&
    masterStyleImageUrl &&
    !styleImages.some((slot) => slot.status === "fail")
  ) {
    const nextSlot = styleImages[nextIndex];
    const prompt = buildStyleImagePrompt({
      skuIndex: nextSlot.skuIndex,
      skuId: currentJob.skuIds?.[nextSlot.skuIndex],
      styleGuide: currentJob.styleGuide,
      compositionReferenceUrl: masterStyleImageUrl,
    });
    nextSlot.taskId = await createKieImageTask({
      prompt,
      // Keep the current SKU first: KIE tends to treat the first image as the
      // primary product identity. The generated master is composition-only.
      inputUrls: [nextSlot.sourceSkuImageUrl, masterStyleImageUrl],
      aspectRatio: "1:1",
      resolution: "1K",
    });
    nextSlot.prompt = prompt;
  }
  const status = styleImages.every((slot) => isTerminal(slot.status))
    ? styleImages.some((slot) => slot.status === "fail")
      ? "failed"
      : "completed"
    : "processing";
  const updated = {
    ...currentJob,
    masterStyleImageUrl,
    styleImages,
    status,
    updatedAt: Date.now(),
  } satisfies EcommerceStyleImageJob;
  updateEcommerceStyleImageJob(updated.id, () => updated);
  return updated;
}

export async function regenerateEcommerceStyleImage(input: {
  job: EcommerceStyleImageJob;
  slotId: string;
  skuIndex: number;
  refinement?: string;
}) {
  const slot = input.job.styleImages.find(
    (candidate) => candidate.id === input.slotId,
  );
  if (!slot) throw new Error("Style image slot was not found.");
  const skuIndex = Math.min(
    Math.max(input.skuIndex, 0),
    input.job.productSkuImageUrls.length - 1,
  );
  const compositionReferenceUrl =
    input.job.masterStyleImageUrl ?? input.job.styleImages[0]?.resultUrl;
  const basePrompt = buildStyleImagePrompt({
    skuIndex,
    skuId: input.job.skuIds?.[skuIndex],
    styleGuide: input.job.styleGuide,
    compositionReferenceUrl:
      skuIndex === 0 ? undefined : compositionReferenceUrl,
  });
  const refinement = input.refinement?.trim();
  const prompt = [
    basePrompt,
    refinement
      ? `User correction request:\n${refinement}\nFollow this request precisely while preserving the fixed 45-degree overhead angle, framing, and product-only rule.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const inputUrls = [
    input.job.productSkuImageUrls[skuIndex],
    ...(skuIndex === 0 || !compositionReferenceUrl
      ? []
      : [compositionReferenceUrl]),
  ];
  const taskId = await createKieImageTask({
    prompt,
    inputUrls,
    aspectRatio: "1:1",
    resolution: "1K",
  });
  return { taskId, prompt, skuIndex };
}
