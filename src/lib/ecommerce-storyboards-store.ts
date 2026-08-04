import type { EcommerceStoryboardJob } from "./types";

const storyboardJobs = new Map<string, EcommerceStoryboardJob>();

export function generateEcommerceStoryboardJobId() {
  return `storyboard_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function addEcommerceStoryboardJob(job: EcommerceStoryboardJob) {
  storyboardJobs.set(job.id, job);
}

export function updateEcommerceStoryboardJob(
  jobId: string,
  updater: (job: EcommerceStoryboardJob) => EcommerceStoryboardJob,
) {
  const current = storyboardJobs.get(jobId);
  if (!current) return undefined;
  const updated = updater({ ...current, updatedAt: Date.now() });
  storyboardJobs.set(jobId, updated);
  return updated;
}
