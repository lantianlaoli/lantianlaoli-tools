import { getRedisClient } from "./redis";
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

const STATUS_TTL_SECONDS = 60 * 60 * 24 * 7;

function statusKey(taskId: string) {
  return `kie:task-status:${taskId}`;
}

export async function setStoredJobStatus(status: StoredJobStatus) {
  store.set(status.taskId, status);
  const redis = getRedisClient();
  if (redis) {
    await redis.set(statusKey(status.taskId), status, { ex: STATUS_TTL_SECONDS });
  }
}

export async function getStoredJobStatus(taskId: string) {
  const redis = getRedisClient();
  if (redis) {
    const status = await redis.get<StoredJobStatus>(statusKey(taskId));
    if (status) {
      store.set(taskId, status);
      return status;
    }
  }
  return store.get(taskId);
}
