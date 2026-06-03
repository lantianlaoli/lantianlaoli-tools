import { NextResponse } from "next/server";
import { createKieImageTask, getKieCallbackUrl, uploadKieImage } from "@/lib/kie";
import { setStoredJobStatus } from "@/lib/job-store";
import type { GenerationJob, KieAspectRatio, KieResolution } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_LOCAL_IMAGES = 4;
const MAX_LOCAL_IMAGE_BYTES = 10 * 1024 * 1024;
const LOCAL_IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/;
const KIE_ASPECT_RATIOS = new Set<KieAspectRatio>(["auto", "1:1", "9:16", "16:9", "4:3", "3:4"]);
const KIE_RESOLUTIONS = new Set<KieResolution>(["1K", "2K", "4K"]);

class LocalImageValidationError extends Error {}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function decodedBase64ByteLength(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function sanitizeFileName(value: string, index: number) {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  return sanitized || `local-reference-${index + 1}.png`;
}

function validateOutputSize(aspectRatio: KieAspectRatio, resolution: KieResolution) {
  if (!KIE_ASPECT_RATIOS.has(aspectRatio)) return "Invalid output aspect ratio.";
  if (!KIE_RESOLUTIONS.has(resolution)) return "Invalid output resolution.";
  if (aspectRatio === "auto" && resolution !== "1K") return "Auto aspect ratio only supports 1K resolution.";
  if (aspectRatio === "1:1" && resolution === "4K") return "1:1 aspect ratio does not support 4K resolution.";
  return "";
}

async function uploadLocalImages(
  localImages: Array<{ fileName?: string; dataUrl?: string }> | undefined
) {
  if (!localImages?.length) return [];
  if (localImages.length > MAX_LOCAL_IMAGES) {
    throw new LocalImageValidationError(`Upload up to ${MAX_LOCAL_IMAGES} local reference images.`);
  }

  return Promise.all(
    localImages.map(async (image, index) => {
      const dataUrl = image.dataUrl?.trim() ?? "";
      const match = dataUrl.match(LOCAL_IMAGE_DATA_URL_PATTERN);
      if (!match) {
        throw new LocalImageValidationError("Local reference images must be PNG, JPG, or WEBP data URLs.");
      }
      if (decodedBase64ByteLength(match[2]) > MAX_LOCAL_IMAGE_BYTES) {
        throw new LocalImageValidationError("Each local reference image must be 10MB or smaller.");
      }
      return uploadKieImage(dataUrl, sanitizeFileName(image.fileName ?? "", index), "lantian-tools/edit-uploads");
    })
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      job?: GenerationJob;
      refinement?: string;
      resultUrl?: string;
      localImages?: Array<{ fileName?: string; dataUrl?: string }>;
      aspectRatio?: KieAspectRatio;
      resolution?: KieResolution;
    };
    const job = body.job;
    const resultUrl = body.resultUrl?.trim() || job?.resultUrl?.trim();
    const refinement = body.refinement?.trim();
    const aspectRatio = body.aspectRatio ?? job?.aspectRatio;
    const resolution = body.resolution ?? job?.resolution;

    if (!job?.rowId || !job.taskId) {
      return NextResponse.json({ error: "A completed generation job is required." }, { status: 400 });
    }
    if (!resultUrl || !isHttpUrl(resultUrl)) {
      return NextResponse.json({ error: "A valid current result image URL is required." }, { status: 400 });
    }
    if (!refinement) {
      return NextResponse.json({ error: "Refinement text is required." }, { status: 400 });
    }
    if (!aspectRatio || !resolution) {
      return NextResponse.json({ error: "Output size is required." }, { status: 400 });
    }
    const sizeError = validateOutputSize(aspectRatio, resolution);
    if (sizeError) {
      return NextResponse.json({ error: sizeError }, { status: 400 });
    }

    const localImageUrls = await uploadLocalImages(body.localImages);
    const prompt = [
      job.prompt,
      "",
      "Refinement request:",
      refinement,
      "",
      "Use the provided current generated image as the primary visual base. Preserve the product identity and update only what is needed to satisfy the refinement request.",
      localImageUrls.length
        ? "Use the uploaded local image references as additional visual guidance for product, object, or style changes. If the user asks to replace an element, use those references for the replacement while keeping the current image composition coherent."
        : "",
    ].join("\n");

    const taskId = await createKieImageTask({
      prompt,
      inputUrls: [resultUrl, ...localImageUrls],
      aspectRatio,
      resolution,
      callBackUrl: getKieCallbackUrl(),
    });

    await setStoredJobStatus({
      taskId,
      status: "waiting",
      updatedAt: new Date().toISOString(),
      source: "polling",
    });

    const replacementJob: GenerationJob = {
      ...job,
      taskId,
      status: "waiting",
      prompt,
      aspectRatio,
      resolution,
      resultUrl: undefined,
      error: undefined,
    };

    return NextResponse.json({ job: replacementJob });
  } catch (error) {
    if (error instanceof LocalImageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[generate/regenerate]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start regeneration." },
      { status: 500 }
    );
  }
}
