import {
  analyzeExpoCompanyPhotos,
  analyzeSingleExpoCompanyPhotos,
  buildExpoImagePrompt,
  buildExpoPhotoEnhancePrompt,
  expoAtlasOverallStatus,
  fallbackExpoAtlasCompany,
  normalizeExpoAnalysis,
  normalizeSingleExpoCompanyAnalysis,
  refreshExpoMarkdown,
} from "./expo-company-atlas";
import {
  generateExpoAtlasJobId,
} from "./expo-company-atlas-store";
import { createKieImageTask, getKieImageStatus, uploadKieImage } from "./kie";
import type {
  ExpoAtlasCompany,
  ExpoAtlasJob,
  ExpoAtlasPhoto,
  KieResolution,
} from "./types";

export const EXPO_ATLAS_IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/;
export const EXPO_ATLAS_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function decodedBase64ByteLength(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export function validateExpoImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(EXPO_ATLAS_IMAGE_DATA_URL_PATTERN);
  if (!match) throw new Error("Images must be PNG, JPG, or WEBP data URLs.");
  if (decodedBase64ByteLength(match[2]) > EXPO_ATLAS_MAX_IMAGE_BYTES) {
    throw new Error("Each image must be 10MB or smaller.");
  }
}

function normalizeFileName(value: unknown, index: number) {
  return typeof value === "string" && value.trim() ? value.trim() : `expo-photo-${index + 1}.jpg`;
}

function normalizeAspectRatio(value: unknown): ExpoAtlasJob["imageAspectRatio"] {
  return value === "4:3" || value === "16:9" ? value : "1:1";
}

function normalizeResolution(value: unknown): KieResolution {
  return value === "2K" || value === "4K" ? value : "1K";
}

function safeIdPart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "company";
}

function companyForPhoto(companies: ExpoAtlasCompany[], photoId: string) {
  return companies.find((company) => company.photoIds.includes(photoId));
}

async function refreshPhoto(photo: ExpoAtlasPhoto): Promise<ExpoAtlasPhoto> {
  if (!photo.generationTaskId || photo.generationStatus === "success" || photo.generationStatus === "fail") {
    return photo;
  }
  let status: Awaited<ReturnType<typeof getKieImageStatus>> | undefined;
  try {
    status = await getKieImageStatus(photo.generationTaskId);
  } catch {
    return photo;
  }
  if (status.status === "success") {
    return {
      ...photo,
      generationStatus: "success",
      generatedUrl: status.resultUrl,
      error: undefined,
    };
  }
  if (status.status === "fail") {
    return {
      ...photo,
      generationStatus: "fail",
      error: status.error || "Image generation failed.",
    };
  }
  return { ...photo, generationStatus: status.status };
}

export async function createExpoAtlasJob(input: {
  files: Array<{ fileName?: string; dataUrl?: string }>;
  title?: string;
  imageAspectRatio?: unknown;
  imageResolution?: unknown;
}) {
  if (!input.files.length) throw new Error("At least one image is required.");
  const jobId = generateExpoAtlasJobId();
  const now = Date.now();
  const uploaded = await Promise.all(
    input.files.map(async (file, index) => {
      const dataUrl = file.dataUrl?.trim() ?? "";
      validateExpoImageDataUrl(dataUrl);
      const fileName = normalizeFileName(file.fileName, index);
      const sourceUrl = await uploadKieImage(dataUrl, `${jobId}-${index + 1}-${fileName}`, "lantian-tools/expo-company-atlas");
      return {
        id: `photo_${index + 1}`,
        fileName,
        sourceUrl,
      };
    })
  );

  let normalized: Pick<ExpoAtlasJob, "photos" | "companies">;
  let error: string | undefined;
  try {
    normalized = await analyzeExpoCompanyPhotos(uploaded);
  } catch (analysisError) {
    error = analysisError instanceof Error ? analysisError.message : "OpenRouter analysis failed.";
    normalized = normalizeExpoAnalysis({ companies: [fallbackExpoAtlasCompany(uploaded)] }, uploaded);
  }

  const job: ExpoAtlasJob = refreshExpoMarkdown({
    id: jobId,
    status: "ready",
    title: input.title?.trim() || "展会企业图鉴",
    imageAspectRatio: normalizeAspectRatio(input.imageAspectRatio),
    imageResolution: normalizeResolution(input.imageResolution),
    photos: normalized.photos,
    companies: normalized.companies,
    error,
    persistence: "memory",
    createdAt: now,
    updatedAt: now,
  });

  return job;
}

export async function parseExpoAtlasCompany(input: {
  companyId: string;
  companyName?: string;
  files: Array<{ id?: string; fileName?: string; dataUrl?: string; previewUrl?: string }>;
}) {
  if (!input.companyId?.trim()) throw new Error("companyId is required.");
  if (!input.files.length) throw new Error("At least one image is required.");
  const idPart = safeIdPart(input.companyId);
  const uploaded = await Promise.all(
    input.files.map(async (file, index) => {
      const dataUrl = file.dataUrl?.trim() ?? "";
      validateExpoImageDataUrl(dataUrl);
      const fileName = normalizeFileName(file.fileName, index);
      const sourceUrl = await uploadKieImage(dataUrl, `${idPart}-${index + 1}-${fileName}`, "lantian-tools/expo-company-atlas");
      return {
        id: file.id?.trim() || `${idPart}_photo_${index + 1}`,
        fileName,
        sourceUrl,
      };
    })
  );

  try {
    return await analyzeSingleExpoCompanyPhotos({
      companyId: input.companyId,
      companyName: input.companyName,
      photos: uploaded,
    });
  } catch (error) {
    const normalized = normalizeSingleExpoCompanyAnalysis({
      companyId: input.companyId,
      userCompanyName: input.companyName,
      photos: uploaded,
      analysis: {
        name: input.companyName || "待整理企业",
        intro: "请根据上传照片补充企业简介。",
        products: [{ name: "待整理产品", description: "请根据上传照片补充产品描述。", highlights: [] }],
        contact: { raw: "请根据上传照片补充联系方式。" },
        notes: error instanceof Error ? error.message : "资料解析失败。",
      },
    });
    return {
      ...normalized,
      company: {
        ...normalized.company,
        parseStatus: "failed" as const,
        parseError: error instanceof Error ? error.message : "资料解析失败。",
      },
    };
  }
}

export async function startExpoAtlasGeneration(input: {
  job: ExpoAtlasJob;
  companyId?: string;
  photoId?: string;
}) {
  const targetCompanies = input.companyId
    ? input.job.companies.filter((company) => company.id === input.companyId)
    : input.job.companies;
  const targetCompanyIds = new Set(targetCompanies.map((company) => company.id));

  const photos = await Promise.all(
    input.job.photos.map(async (photo) => {
      const company = companyForPhoto(targetCompanies, photo.id);
      if (!company || !targetCompanyIds.has(company.id)) return photo;
      if (input.photoId && photo.id !== input.photoId) return photo;
      if (!photo.sourceUrl) return { ...photo, generationStatus: "fail" as const, error: "Source image URL is missing." };
      if (photo.generationStatus === "processing") return photo;

      const prompt = buildExpoImagePrompt({ company, photo });
      const taskId = await createKieImageTask({
        prompt,
        inputUrls: [photo.sourceUrl],
        aspectRatio: input.job.imageAspectRatio,
        resolution: input.job.imageResolution,
      });

      return {
        ...photo,
        generationTaskId: taskId,
        generationStatus: "processing" as const,
        generationPrompt: prompt,
        generatedUrl: undefined,
        error: undefined,
      };
    })
  );

  const updated = refreshExpoMarkdown({
    ...input.job,
    photos,
    status: "generating",
    updatedAt: Date.now(),
  });

  return { ...updated, status: expoAtlasOverallStatus(updated) };
}

export async function refreshExpoAtlasJob(job: ExpoAtlasJob) {
  const photos = await Promise.all(job.photos.map(async (photo) => {
    const refreshed = await refreshPhoto(photo);
    return refreshEnhancedPhoto(refreshed);
  }));
  const updated = refreshExpoMarkdown({
    ...job,
    photos,
    updatedAt: Date.now(),
  });
  return { ...updated, status: expoAtlasOverallStatus(updated) };
}

async function refreshEnhancedPhoto(photo: ExpoAtlasPhoto): Promise<ExpoAtlasPhoto> {
  if (!photo.enhancedTaskId || photo.enhancedStatus === "success" || photo.enhancedStatus === "fail") {
    return photo;
  }
  let status: Awaited<ReturnType<typeof getKieImageStatus>> | undefined;
  try {
    status = await getKieImageStatus(photo.enhancedTaskId);
  } catch {
    return photo;
  }
  if (status.status === "success") {
    return {
      ...photo,
      enhancedStatus: "success",
      enhancedUrl: status.resultUrl,
      error: undefined,
    };
  }
  if (status.status === "fail") {
    return {
      ...photo,
      enhancedStatus: "fail",
      error: status.error || "Photo enhancement failed.",
    };
  }
  return { ...photo, enhancedStatus: status.status };
}

export async function startExpoPhotoEnhancement(input: {
  job: ExpoAtlasJob;
  language: string;
  companyId?: string;
  photoId?: string;
}) {
  const targetCompanies = input.companyId
    ? input.job.companies.filter((company) => company.id === input.companyId)
    : input.job.companies;
  const targetCompanyIds = new Set(targetCompanies.map((company) => company.id));

  const photos = await Promise.all(
    input.job.photos.map(async (photo) => {
      const company = input.job.companies.find((c) => c.photoIds.includes(photo.id));
      if (!company || !targetCompanyIds.has(company.id)) return photo;
      if (input.photoId && photo.id !== input.photoId) return photo;
      if (!photo.sourceUrl) return { ...photo, enhancedStatus: "fail" as const, error: "Source image URL is missing." };
      if (photo.enhancedStatus === "processing") return photo;

      const prompt = buildExpoPhotoEnhancePrompt({ photo, language: input.language });
      const taskId = await createKieImageTask({
        prompt,
        inputUrls: [photo.sourceUrl],
        aspectRatio: input.job.imageAspectRatio,
        resolution: input.job.imageResolution,
      });

      return {
        ...photo,
        enhancedTaskId: taskId,
        enhancedStatus: "processing" as const,
        enhancedPrompt: prompt,
        enhancedUrl: undefined,
        error: undefined,
      };
    })
  );

  const updated = refreshExpoMarkdown({
    ...input.job,
    photos,
    updatedAt: Date.now(),
  });

  return updated;
}
