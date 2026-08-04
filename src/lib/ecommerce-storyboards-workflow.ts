import { CHUB_TWO_PERSON_URL } from "./ecommerce-assets";
import {
  createKieImageTask,
  createKieSeedance2MiniVideoTask,
  getKieImageStatus,
  uploadKieImage,
  uploadKieUrlFile,
} from "./kie";
import {
  addEcommerceStoryboardJob,
  generateEcommerceStoryboardJobId,
  updateEcommerceStoryboardJob,
} from "./ecommerce-storyboards-store";
import {
  analyzeStoryboardStory,
  buildStoryboardCoverPrompt,
  buildStoryboardImagePrompt,
  buildStoryboardVideoPrompt,
  STORYBOARD_COUNT,
} from "./ecommerce-storyboards";
import type {
  EcommerceSlotStatus,
  EcommerceStoryboardJob,
  EcommerceStoryboardSlot,
} from "./types";

function isTerminal(status: EcommerceSlotStatus) {
  return status === "success" || status === "fail";
}

export async function createEcommerceStoryboardJob(input: {
  productSkuDataUrl: string;
  productViewDataUrls: string[];
  manufacturerReferenceDataUrls: string[];
  personImageUrl?: string;
}) {
  if (!input.productSkuDataUrl)
    throw new Error("The first SKU image is required.");
  if (!input.productViewDataUrls[0])
    throw new Error("The front product view is required.");
  const jobId = generateEcommerceStoryboardJobId();
  const productSkuImageUrl = await uploadKieImage(
    input.productSkuDataUrl,
    `chub-two-storyboard-sku-1-${jobId}.jpg`,
    "lantian-tools/ecommerce-storyboards",
  );
  const productViewImageUrls = await Promise.all(
    input.productViewDataUrls.map((dataUrl, index) =>
      uploadKieImage(
        dataUrl,
        `chub-two-storyboard-product-view-${index + 1}-${jobId}.jpg`,
        "lantian-tools/ecommerce-storyboards",
      ),
    ),
  );
  let personImageUrl = input.personImageUrl || CHUB_TWO_PERSON_URL;
  try {
    personImageUrl = await uploadKieUrlFile({
      fileUrl: personImageUrl,
      fileName: `chub-two-storyboard-person-${jobId}.png`,
      uploadPath: "lantian-tools/ecommerce-storyboards",
    });
  } catch (error) {
    console.warn(
      "[ecommerce-assets/storyboards] Using configured person URL:",
      error,
    );
  }
  const storyPlan = await analyzeStoryboardStory({
    productSkuImageUrl,
    productViewImageUrls,
    manufacturerReferenceImageUrls: input.manufacturerReferenceDataUrls,
  });
  const sellingPoints = storyPlan.stages.map((stage) => stage.sellingPoint);
  const manufacturerReferenceImageUrls = await Promise.all(
    input.manufacturerReferenceDataUrls.map((dataUrl, index) =>
      uploadKieImage(
        dataUrl,
        `chub-two-storyboard-reference-${index + 1}-${jobId}.jpg`,
        "lantian-tools/ecommerce-storyboards",
      ),
    ),
  );
  const slots = storyPlan.stages
    .slice(0, STORYBOARD_COUNT)
    .map((stagePlan, index) => {
      const referenceUrls = manufacturerReferenceImageUrls.length
        ? [
            manufacturerReferenceImageUrls[
              index % manufacturerReferenceImageUrls.length
            ],
          ]
        : [];
      const slot = {
        id: `storyboard-${index + 1}`,
        index,
        stage: stagePlan.stage,
        sellingPoint: stagePlan.sellingPoint,
        transitionFromPrevious: stagePlan.transitionFromPrevious,
        transitionToNext: stagePlan.transitionToNext,
        manufacturerReferenceImageUrls: referenceUrls,
        taskId: "",
        status: "waiting" as const,
        prompt: "",
      } satisfies EcommerceStoryboardSlot;
      slot.prompt = buildStoryboardImagePrompt({ slot, storyPlan });
      return slot;
    });
  const coverPrompt = buildStoryboardCoverPrompt({ storyPlan });
  const coverTask = {
    taskId: "",
    status: "waiting" as const,
    prompt: coverPrompt,
  };
  await Promise.all(
    [
      ...slots.map(async (slot) => {
        slot.taskId = await createKieImageTask({
          prompt: slot.prompt,
          inputUrls: [
            productSkuImageUrl,
            personImageUrl,
            ...productViewImageUrls,
            ...(slot.manufacturerReferenceImageUrls || []),
          ],
          aspectRatio: "9:16",
          resolution: "1K",
        });
      }),
      (async () => {
        coverTask.taskId = await createKieImageTask({
          prompt: coverTask.prompt,
          inputUrls: [
            productSkuImageUrl,
            ...productViewImageUrls,
            personImageUrl,
          ],
          aspectRatio: "9:16",
          resolution: "1K",
        });
      })(),
    ],
  );
  const now = Date.now();
  const job: EcommerceStoryboardJob = {
    id: jobId,
    status: "processing",
    productSkuImageUrl,
    productViewImageUrls,
    personImageUrl,
    manufacturerReferenceImageUrls,
    storyPlan,
    title: storyPlan.title,
    description: storyPlan.description,
    hashtags: storyPlan.hashtags,
    cover: coverTask,
    sellingPoints,
    slots,
    createdAt: now,
    updatedAt: now,
  };
  addEcommerceStoryboardJob(job);
  return job;
}

async function refreshSlot(slot: EcommerceStoryboardSlot) {
  if (!slot.taskId || isTerminal(slot.status)) return slot;
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
        error: status.error || "Storyboard image generation failed.",
      };
    return { ...slot, status: status.status };
  } catch (error) {
    return {
      ...slot,
      status: "fail" as const,
      error:
        error instanceof Error
          ? error.message
          : "Storyboard status check failed.",
    };
  }
}

async function refreshCover(
  cover: NonNullable<EcommerceStoryboardJob["cover"]>,
) {
  if (!cover.taskId || isTerminal(cover.status)) return cover;
  try {
    const status = await getKieImageStatus(cover.taskId);
    if (status.status === "success")
      return { ...cover, status: "success" as const, resultUrl: status.resultUrl };
    if (status.status === "fail")
      return {
        ...cover,
        status: "fail" as const,
        error: status.error || "Storyboard cover generation failed.",
      };
    return { ...cover, status: status.status };
  } catch (error) {
    return {
      ...cover,
      status: "fail" as const,
      error: error instanceof Error ? error.message : "Cover status check failed.",
    };
  }
}

export async function refreshEcommerceStoryboardJob(
  job: EcommerceStoryboardJob,
) {
  const slots = await Promise.all(job.slots.map(refreshSlot));
  const cover = job.cover ? await refreshCover(job.cover) : undefined;
  const status = slots.every((slot) => isTerminal(slot.status)) &&
    (!cover || isTerminal(cover.status))
    ? slots.some((slot) => slot.status === "fail")
      ? "failed"
      : "completed"
    : "processing";
  const updated = {
    ...job,
    slots,
    cover,
    status,
    updatedAt: Date.now(),
  } satisfies EcommerceStoryboardJob;
  updateEcommerceStoryboardJob(updated.id, () => updated);
  return updated;
}

export async function createEcommerceStoryboardVideo(input: {
  job: EcommerceStoryboardJob;
  slotId: string;
}) {
  const slot = input.job.slots.find(
    (candidate) => candidate.id === input.slotId,
  );
  if (!slot?.resultUrl)
    throw new Error("A completed storyboard image is required.");
  const prompt = buildStoryboardVideoPrompt({
    slot,
    storyPlan: input.job.storyPlan,
  });
  const taskId = await createKieSeedance2MiniVideoTask({
    prompt,
    referenceImageUrls: [
      slot.resultUrl,
      input.job.productSkuImageUrl,
      ...(input.job.productViewImageUrls || []),
      input.job.personImageUrl,
    ],
  });
  const updatedJob = {
    ...input.job,
    slots: input.job.slots.map((candidate) =>
      candidate.id === slot.id
        ? {
            ...candidate,
            video: { taskId, status: "processing" as const, prompt },
          }
        : candidate,
    ),
    updatedAt: Date.now(),
  } satisfies EcommerceStoryboardJob;
  updateEcommerceStoryboardJob(input.job.id, () => updatedJob);
  return { taskId, prompt, job: updatedJob };
}

export async function regenerateEcommerceStoryboardMetadata(
  job: EcommerceStoryboardJob,
) {
  const story = await analyzeStoryboardStory({
    productSkuImageUrl: job.productSkuImageUrl,
    productViewImageUrls: job.productViewImageUrls || [],
    manufacturerReferenceImageUrls: job.manufacturerReferenceImageUrls || [],
  });
  const storyPlan = job.storyPlan
    ? {
        ...job.storyPlan,
        productName: story.productName,
        targetAudience: story.targetAudience,
        buyerPainPoint: story.buyerPainPoint,
        solutionAngle: story.solutionAngle,
        title: story.title,
        description: story.description,
        hashtags: story.hashtags,
      }
    : story;
  const coverPrompt = buildStoryboardCoverPrompt({ storyPlan });
  const coverTaskId = await createKieImageTask({
    prompt: coverPrompt,
    inputUrls: [
      job.productSkuImageUrl,
      ...(job.productViewImageUrls || []),
      job.personImageUrl,
    ],
    aspectRatio: "9:16",
    resolution: "1K",
  });
  const updated = {
    ...job,
    storyPlan,
    title: story.title,
    description: story.description,
    hashtags: story.hashtags,
    cover: { taskId: coverTaskId, status: "waiting" as const, prompt: coverPrompt },
    updatedAt: Date.now(),
  } satisfies EcommerceStoryboardJob;
  updateEcommerceStoryboardJob(updated.id, () => updated);
  return updated;
}

export async function regenerateEcommerceStoryboardCover(
  job: EcommerceStoryboardJob,
) {
  if (!job.storyPlan) throw new Error("The storyboard story plan is required.");
  const prompt = buildStoryboardCoverPrompt({
    storyPlan: {
      ...job.storyPlan,
      title: job.title || job.storyPlan.title,
    },
  });
  const taskId = await createKieImageTask({
    prompt,
    inputUrls: [
      job.productSkuImageUrl,
      ...(job.productViewImageUrls || []),
      job.personImageUrl,
    ],
    aspectRatio: "9:16",
    resolution: "1K",
  });
  const updated = {
    ...job,
    cover: { taskId, status: "waiting" as const, prompt },
    updatedAt: Date.now(),
  } satisfies EcommerceStoryboardJob;
  updateEcommerceStoryboardJob(updated.id, () => updated);
  return updated;
}

export async function refreshEcommerceStoryboardVideo(
  job: EcommerceStoryboardJob,
) {
  const slots = await Promise.all(
    job.slots.map(async (slot) => {
      if (
        !slot.video ||
        slot.video.status === "success" ||
        slot.video.status === "fail"
      )
        return slot;
      try {
        const status = await getKieImageStatus(slot.video.taskId);
        return status.status === "success"
          ? {
              ...slot,
              video: {
                ...slot.video,
                status: "success" as const,
                resultUrl: status.resultUrl,
              },
            }
          : status.status === "fail"
            ? {
                ...slot,
                video: {
                  ...slot.video,
                  status: "fail" as const,
                  error: status.error || "Video generation failed.",
                },
              }
            : slot;
      } catch (error) {
        return {
          ...slot,
          video: {
            ...slot.video,
            status: "fail" as const,
            error:
              error instanceof Error
                ? error.message
                : "Video status check failed.",
          },
        };
      }
    }),
  );
  const updated = {
    ...job,
    slots,
    updatedAt: Date.now(),
  } satisfies EcommerceStoryboardJob;
  updateEcommerceStoryboardJob(updated.id, () => updated);
  return updated;
}
