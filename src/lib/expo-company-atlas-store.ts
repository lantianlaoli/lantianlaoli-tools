import { getRedisClient } from "./redis";
import type { ExpoAtlasJob, ExpoAtlasPhoto } from "./types";

const globalForExpoAtlas = globalThis as typeof globalThis & {
  lantianToolsExpoCompanyAtlasStore?: Map<string, ExpoAtlasJob>;
};

const store = globalForExpoAtlas.lantianToolsExpoCompanyAtlasStore ?? new Map<string, ExpoAtlasJob>();
globalForExpoAtlas.lantianToolsExpoCompanyAtlasStore = store;

const JOB_TTL_SECONDS = 60 * 60 * 24 * 30;

function jobKey(jobId: string) {
  return `expo-company-atlas:job:${jobId}`;
}

export function generateExpoAtlasJobId() {
  return `expo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function sanitizeExpoAtlasJob(job: ExpoAtlasJob): ExpoAtlasJob {
  return {
    ...job,
    photos: job.photos.map((photo) => {
      const rest = { ...photo } as ExpoAtlasPhoto & { dataUrl?: string };
      delete rest.dataUrl;
      if (rest.previewUrl?.startsWith("data:") || rest.previewUrl?.startsWith("blob:")) {
        delete rest.previewUrl;
      }
      return rest;
    }),
  };
}

export function isExpoAtlasRedisAvailable() {
  return Boolean(getRedisClient());
}

export async function addExpoAtlasJob(job: ExpoAtlasJob) {
  const sanitized = sanitizeExpoAtlasJob(job);
  store.set(sanitized.id, sanitized);
  const redis = getRedisClient();
  if (redis) await redis.set(jobKey(sanitized.id), sanitized, { ex: JOB_TTL_SECONDS });
}

export async function getExpoAtlasJob(jobId: string) {
  const redis = getRedisClient();
  if (redis) {
    const job = await redis.get<ExpoAtlasJob>(jobKey(jobId));
    if (job) {
      store.set(job.id, job);
      return job;
    }
  }
  return store.get(jobId);
}

export async function updateExpoAtlasJob(jobId: string, updater: (job: ExpoAtlasJob) => ExpoAtlasJob) {
  const current = await getExpoAtlasJob(jobId);
  if (!current) return undefined;
  const updated = updater({ ...current, updatedAt: Date.now() });
  await addExpoAtlasJob(updated);
  return updated;
}
