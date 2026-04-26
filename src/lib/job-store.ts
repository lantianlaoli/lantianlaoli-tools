import type { GenerationJob } from "./types";

export type StoredJobStatus = Pick<GenerationJob, "status" | "resultUrl" | "error"> & {
  taskId: string;
  updatedAt: string;
  source: "webhook" | "polling";
};

const globalForJobs = globalThis as typeof globalThis & {
  copyCompetitorsJobStore?: Map<string, StoredJobStatus>;
};

const store = globalForJobs.copyCompetitorsJobStore ?? new Map<string, StoredJobStatus>();
globalForJobs.copyCompetitorsJobStore = store;

export function setStoredJobStatus(status: StoredJobStatus) {
  store.set(status.taskId, status);
}

export function getStoredJobStatus(taskId: string) {
  return store.get(taskId);
}
