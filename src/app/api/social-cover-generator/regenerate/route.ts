import { NextResponse } from "next/server";
import { buildSocialCoverRegenerationPrompt } from "@/lib/social-cover-generator-workflow";
import { createKieImageTask, uploadKieImage } from "@/lib/kie";
import type { SocialCoverJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_LOCAL_IMAGES = 4;
const MAX_LOCAL_IMAGE_BYTES = 10 * 1024 * 1024;
const LOCAL_IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i;

function decodedBase64ByteLength(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

async function uploadLocalImages(localImages: Array<{ fileName?: string; dataUrl?: string }> | undefined) {
  if (!localImages?.length) return [];
  if (localImages.length > MAX_LOCAL_IMAGES) {
    throw new Error(`Upload up to ${MAX_LOCAL_IMAGES} reference images.`);
  }
  return Promise.all(
    localImages.map((image, index) => {
      const dataUrl = image.dataUrl?.trim() ?? "";
      const match = dataUrl.match(LOCAL_IMAGE_DATA_URL_PATTERN);
      if (!match) throw new Error("Reference images must be PNG, JPG, or WEBP data URLs.");
      if (decodedBase64ByteLength(match[2]) > MAX_LOCAL_IMAGE_BYTES) {
        throw new Error("Each reference image must be 10MB or smaller.");
      }
      return uploadKieImage(dataUrl, image.fileName ?? `social-cover-ref-${index + 1}.png`, "lantian-tools/social-cover-edit");
    })
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      job?: SocialCoverJob;
      slotId?: string;
      resultUrl?: string;
      refinement?: string;
      localImages?: Array<{ fileName?: string; dataUrl?: string }>;
    };
    if (!body.job || !body.slotId?.trim()) {
      return NextResponse.json({ error: "job and slotId are required." }, { status: 400 });
    }
    if (!body.resultUrl?.trim()) {
      return NextResponse.json({ error: "resultUrl is required." }, { status: 400 });
    }
    if (!body.refinement?.trim()) {
      return NextResponse.json({ error: "refinement is required." }, { status: 400 });
    }

    const slot = body.job.slots.find((candidate) => candidate.id === body.slotId);
    if (!slot) return NextResponse.json({ error: "Cover slot was not found." }, { status: 404 });
    const localImageUrls = await uploadLocalImages(body.localImages);
    const prompt = buildSocialCoverRegenerationPrompt({ slot, refinement: body.refinement });
    const taskId = await createKieImageTask({
      prompt,
      inputUrls: [body.resultUrl, ...localImageUrls],
      aspectRatio: slot.aspectRatio,
      resolution: body.job.options.resolution,
    });

    return NextResponse.json({ success: true, taskId, prompt });
  } catch (error) {
    console.error("[social-cover-generator/regenerate]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate social cover." },
      { status: 500 }
    );
  }
}
