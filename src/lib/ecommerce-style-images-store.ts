import type { EcommerceStyleImageJob } from "./types";

const styleImageJobs = new Map<string, EcommerceStyleImageJob>();

export function generateEcommerceStyleImageJobId() {
  return `style_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function addEcommerceStyleImageJob(job: EcommerceStyleImageJob) {
  styleImageJobs.set(job.id, job);
}

export function getEcommerceStyleImageJob(jobId: string) {
  return styleImageJobs.get(jobId);
}

export function updateEcommerceStyleImageJob(jobId: string, updater: (job: EcommerceStyleImageJob) => EcommerceStyleImageJob) {
  const current = styleImageJobs.get(jobId);
  if (!current) return undefined;
  const updated = updater({ ...current, updatedAt: Date.now() });
  styleImageJobs.set(jobId, updated);
  return updated;
}
