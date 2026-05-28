import type { GenerationJob, KieAspectRatio, KieResolution } from "./types";

const CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask";
const RECORD_INFO_URL = "https://api.kie.ai/api/v1/jobs/recordInfo";
const BASE64_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-base64-upload";
const URL_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-url-upload";
const STREAM_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-stream-upload";
const MODEL = "gpt-image-2-image-to-image";
const SEEDANCE_2_FAST_MODEL = "bytedance/seedance-2-fast";

type KieRecordInfo = {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
    state?: string;
    resultJson?: string;
    failMsg?: string;
    failCode?: string;
  };
};

type KieFileUploadResponse = {
  success?: boolean;
  code?: number;
  msg?: string;
  data?: {
    downloadUrl?: string;
    fileName?: string;
    filePath?: string;
    fileSize?: number;
    mimeType?: string;
    uploadedAt?: string;
  };
};

type KieUploadFile = Blob | ArrayBuffer | Uint8Array;

function getKieApiKey() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("KIE_API_KEY is not configured.");
  return apiKey;
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, timeoutMs = 30000) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...(options.headers ?? {}),
          Connection: "keep-alive",
          "Accept-Encoding": "gzip, deflate",
        },
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 5000)));
    }
  }
  throw lastError;
}

export async function uploadKieImage(dataUrl: string, fileName: string, uploadPath = "rivora/references") {
  return uploadKieBase64File({ base64Data: dataUrl, fileName, uploadPath });
}

function readKieUploadDownloadUrl(payload: KieFileUploadResponse) {
  const downloadUrl = payload.data?.downloadUrl;
  if (!payload.success || (payload.code !== undefined && payload.code !== 200) || typeof downloadUrl !== "string") {
    throw new Error(payload.msg || "KIE upload did not return a download URL.");
  }
  return downloadUrl;
}

export async function uploadKieBase64File(input: {
  base64Data: string;
  uploadPath: string;
  fileName?: string;
}) {
  const response = await fetchWithRetry(BASE64_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKieApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      base64Data: input.base64Data,
      uploadPath: input.uploadPath,
      ...(input.fileName ? { fileName: input.fileName } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`KIE upload failed: ${response.status} ${await response.text()}`);
  }
  return readKieUploadDownloadUrl(await response.json());
}

export async function uploadKieUrlFile(input: {
  fileUrl: string;
  uploadPath: string;
  fileName?: string;
}) {
  const response = await fetchWithRetry(URL_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKieApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileUrl: input.fileUrl,
      uploadPath: input.uploadPath,
      ...(input.fileName ? { fileName: input.fileName } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`KIE URL upload failed: ${response.status} ${await response.text()}`);
  }
  return readKieUploadDownloadUrl(await response.json());
}

export async function uploadKieStreamFile(input: {
  file: KieUploadFile;
  uploadPath: string;
  fileName?: string;
}) {
  const formData = new FormData();
  const file =
    input.file instanceof Blob
      ? input.file
      : new Blob([input.file instanceof Uint8Array ? new Uint8Array(input.file) : input.file]);
  if (input.fileName) formData.set("file", file, input.fileName);
  else formData.set("file", file);
  formData.set("uploadPath", input.uploadPath);
  if (input.fileName) formData.set("fileName", input.fileName);

  const response = await fetchWithRetry(STREAM_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKieApiKey()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`KIE stream upload failed: ${response.status} ${await response.text()}`);
  }
  return readKieUploadDownloadUrl(await response.json());
}

export async function createKieImageTask(input: {
  prompt: string;
  inputUrls: string[];
  aspectRatio: KieAspectRatio;
  resolution: KieResolution;
  callBackUrl?: string;
}) {
  const response = await fetchWithRetry(CREATE_TASK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKieApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      ...(input.callBackUrl ? { callBackUrl: input.callBackUrl } : {}),
      input: {
        prompt: input.prompt,
        input_urls: input.inputUrls.slice(0, 16),
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`KIE task creation failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  const taskId = payload?.data?.taskId;
  if (payload?.code !== 200 || typeof taskId !== "string") {
    throw new Error(payload?.msg || "KIE task creation did not return a taskId.");
  }
  return taskId;
}

export async function createKieSeedanceVideoTask(input: {
  prompt: string;
  referenceImageUrls: string[];
  aspectRatio: "1:1" | "16:9" | "9:16";
  resolution: "480p" | "720p";
  duration: number;
  callBackUrl?: string;
}) {
  const response = await fetchWithRetry(CREATE_TASK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKieApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SEEDANCE_2_FAST_MODEL,
      ...(input.callBackUrl ? { callBackUrl: input.callBackUrl } : {}),
      input: {
        prompt: input.prompt,
        reference_image_urls: input.referenceImageUrls.filter(Boolean).slice(0, 9),
        resolution: input.resolution,
        aspect_ratio: input.aspectRatio,
        duration: input.duration,
        generate_audio: true,
        web_search: false,
        nsfw_checker: true,
      },
    }),
  }, 5, 30000);

  if (!response.ok) {
    throw new Error(`KIE Seedance task creation failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  const taskId = payload?.data?.taskId;
  if (payload?.code !== 200 || typeof taskId !== "string") {
    throw new Error(payload?.msg || "KIE Seedance task creation did not return a taskId.");
  }
  return taskId;
}

export function getKieCallbackUrl() {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/api/kie/callback` : undefined;
}

export function normalizeKieRecordInfo(payload: KieRecordInfo) {
  const state = payload.data?.state?.toLowerCase() ?? "processing";
  const status: GenerationJob["status"] =
    state === "success" || state === "fail" || state === "waiting" ? state : "processing";
  let resultUrl: string | undefined;
  if (state === "success" && payload.data?.resultJson) {
    const parsed = JSON.parse(payload.data.resultJson);
    if (Array.isArray(parsed?.resultUrls) && typeof parsed.resultUrls[0] === "string") {
      resultUrl = parsed.resultUrls[0];
    } else if (typeof parsed?.video_url === "string") {
      resultUrl = parsed.video_url;
    } else if (typeof parsed?.url === "string") {
      resultUrl = parsed.url;
    } else if (Array.isArray(parsed?.videos) && typeof parsed.videos[0] === "string") {
      resultUrl = parsed.videos[0];
    }
  }

  return {
    taskId: payload.data?.taskId,
    status,
    resultUrl,
    error: payload.data?.failMsg || payload.data?.failCode,
  };
}

export async function getKieImageStatus(taskId: string) {
  const response = await fetchWithRetry(`${RECORD_INFO_URL}?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getKieApiKey()}`,
    },
  }, 3, 15000);

  if (!response.ok) {
    throw new Error(`KIE status check failed: ${response.status} ${await response.text()}`);
  }
  const payload = (await response.json()) as KieRecordInfo;
  if (payload.code !== 200) throw new Error(payload.msg || "KIE status check failed.");

  return normalizeKieRecordInfo(payload);
}

export const getKieTaskStatus = getKieImageStatus;
