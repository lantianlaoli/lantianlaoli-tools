import type { ShenzhenExpoHunterJob } from "./types";

const globalForExpoHunter = globalThis as typeof globalThis & {
  _rivoraExpoHunterStore?: Map<string, ShenzhenExpoHunterJob>;
};

const store =
  globalForExpoHunter._rivoraExpoHunterStore ??
  new Map<string, ShenzhenExpoHunterJob>();
globalForExpoHunter._rivoraExpoHunterStore = store;

export function generateJobId(): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `expo_hunter_${Date.now()}_${suffix}`;
}

export function addJob(job: ShenzhenExpoHunterJob): void {
  store.set(job.id, job);
}

export function getJob(jobId: string): ShenzhenExpoHunterJob | undefined {
  return store.get(jobId);
}

export function updateJob(
  jobId: string,
  updater: (job: ShenzhenExpoHunterJob) => ShenzhenExpoHunterJob,
): ShenzhenExpoHunterJob | undefined {
  const current = store.get(jobId);
  if (!current) return undefined;
  const updated = updater(current);
  store.set(jobId, updated);
  return updated;
}
