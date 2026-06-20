import {
  buildSocialCoverPrompt,
  buildSocialCoverSlots,
  buildSocialCoverTitleSet,
  normalizeSocialCoverOptions,
} from "./social-cover-generator";
import { createKieImageTask, getKieImageStatus, uploadKieImage } from "./kie";
import type {
  KieResolution,
  SocialCoverAspectRatio,
  SocialCoverCreateRequest,
  SocialCoverJob,
  SocialCoverSlot,
  SocialCoverSlotStatus,
} from "./types";

function generateSocialCoverJobId() {
  return `social_cover_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isTerminal(status: SocialCoverSlotStatus) {
  return status === "success" || status === "fail";
}

function overallStatus(job: SocialCoverJob): SocialCoverJob["status"] {
  if (job.error) return "failed";
  if (!job.slots.length) return "failed";
  const allDone = job.slots.every((slot) => isTerminal(slot.status));
  if (!allDone) return "processing";
  return job.slots.some((slot) => slot.status === "fail") ? "failed" : "completed";
}

async function createSlotTask(input: {
  prompt: string;
  personImageUrl: string;
  productOrLogoImageUrl: string;
  aspectRatio: SocialCoverAspectRatio;
  resolution: KieResolution;
}) {
  return createKieImageTask({
    prompt: input.prompt,
    inputUrls: [input.personImageUrl, input.productOrLogoImageUrl],
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
  });
}

export async function createSocialCoverJob(input: SocialCoverCreateRequest): Promise<SocialCoverJob> {
  const title = input.title?.trim() ?? "";
  if (!title) throw new Error("title is required.");

  const options = normalizeSocialCoverOptions(input);
  const jobId = generateSocialCoverJobId();
  const now = Date.now();

  const [personImageUrl, productOrLogoImageUrl] = await Promise.all([
    uploadKieImage(input.personImageDataUrl, `person-${jobId}.jpg`, "lantian-tools/social-cover-generator"),
    uploadKieImage(input.productOrLogoImageDataUrl, `product-logo-${jobId}.png`, "lantian-tools/social-cover-generator"),
  ]);
  const titleResult = await buildSocialCoverTitleSet(title);
  const slotCount = options.languages.reduce(
    (count, language) => count + options.aspectRatiosByLanguage[language].length * options.variantsPerGroup,
    0
  );
  const emptyTaskIds = new Array(slotCount).fill("");
  const slots = buildSocialCoverSlots({
    options,
    titles: titleResult.titles,
    sourceTitle: title,
    styleGuide: input.styleGuide,
    taskIds: emptyTaskIds,
  });

  const taskIds: string[] = [];
  for (const slot of slots) {
    const taskId = await createSlotTask({
      prompt: slot.prompt,
      personImageUrl,
      productOrLogoImageUrl,
      aspectRatio: slot.aspectRatio,
      resolution: options.resolution,
    });
    taskIds.push(taskId);
  }

  return {
    id: jobId,
    status: "processing",
    sourceTitle: title,
    titles: titleResult.titles,
    titleFallback: titleResult.fallback,
    styleGuide: input.styleGuide,
    options,
    personImageUrl,
    productOrLogoImageUrl,
    slots: slots.map((slot, index) => ({ ...slot, taskId: taskIds[index] ?? slot.taskId })),
    createdAt: now,
    updatedAt: Date.now(),
  };
}

async function refreshSlot(slot: SocialCoverSlot): Promise<SocialCoverSlot> {
  if (isTerminal(slot.status) || !slot.taskId) return slot;
  let status: Awaited<ReturnType<typeof getKieImageStatus>>;
  try {
    status = await getKieImageStatus(slot.taskId);
  } catch {
    return slot;
  }
  if (status.status === "success") {
    return { ...slot, status: "success", resultUrl: status.resultUrl };
  }
  if (status.status === "fail") {
    return { ...slot, status: "fail", error: status.error || "Cover generation failed." };
  }
  return { ...slot, status: status.status };
}

export async function refreshSocialCoverJob(currentJob: SocialCoverJob): Promise<SocialCoverJob> {
  const slots = await Promise.all(currentJob.slots.map(refreshSlot));
  const updated = {
    ...currentJob,
    slots,
    updatedAt: Date.now(),
  };
  return { ...updated, status: overallStatus(updated) };
}

export async function retrySocialCoverSlot(input: {
  job: SocialCoverJob;
  slotId: string;
}) {
  const slot = input.job.slots.find((candidate) => candidate.id === input.slotId);
  if (!slot) throw new Error("Cover slot was not found.");
  if (slot.status !== "fail") {
    throw new Error("Only failed system slots can be retried without credits.");
  }
  if (!input.job.personImageUrl || !input.job.productOrLogoImageUrl) {
    throw new Error("Hosted source image URLs are required.");
  }
  const retryOfTaskId = slot.taskId;
  const taskId = await createSlotTask({
    prompt: slot.prompt,
    personImageUrl: input.job.personImageUrl,
    productOrLogoImageUrl: input.job.productOrLogoImageUrl,
    aspectRatio: slot.aspectRatio,
    resolution: input.job.options.resolution,
  });
  return {
    taskId,
    retryOfTaskId,
    creditCharged: false,
    billingMode: "system-retry-no-credit" as const,
  };
}

export function buildSocialCoverRegenerationPrompt(input: {
  slot: SocialCoverSlot;
  refinement: string;
}) {
  return [
    input.slot.prompt,
    "",
    "Refinement request:",
    input.refinement.trim(),
    "",
    "Use the current generated cover as the primary visual base. Preserve the person identity, product/logo identity, aspect ratio, title language, and overall campaign style. Change only what is needed to satisfy the refinement request.",
  ].join("\n");
}

export { buildSocialCoverPrompt, normalizeSocialCoverOptions };
