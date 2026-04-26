import type { GenerationJob, KieAspectRatio, KieResolution } from "./types";

const CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask";
const RECORD_INFO_URL = "https://api.kie.ai/api/v1/jobs/recordInfo";
const UPLOAD_URL = "https://kieai.redpandaai.co/api/file-base64-upload";
const MODEL = "gpt-image-2-image-to-image";

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

export async function uploadKieImage(dataUrl: string, fileName: string, uploadPath = "copy-competitors/references") {
  const response = await fetchWithRetry(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getKieApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      base64Data: dataUrl,
      uploadPath,
      fileName,
    }),
  });

  if (!response.ok) {
    throw new Error(`KIE upload failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  const downloadUrl = payload?.data?.downloadUrl;
  if (!payload?.success || typeof downloadUrl !== "string") {
    throw new Error(payload?.msg || "KIE upload did not return a download URL.");
  }
  return downloadUrl;
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

export function getKieCallbackUrl() {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/api/generate/webhook` : undefined;
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
