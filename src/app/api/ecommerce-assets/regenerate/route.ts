import { NextResponse } from "next/server";
import { createKieImageTask, uploadKieImage } from "@/lib/kie";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_LOCAL_IMAGES = 4;
const MAX_LOCAL_IMAGE_BYTES = 10 * 1024 * 1024;
const LOCAL_IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/;

function decodedBase64ByteLength(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

async function uploadLocalImages(
  localImages: Array<{ fileName?: string; dataUrl?: string }> | undefined
) {
  if (!localImages?.length) return [];
  if (localImages.length > MAX_LOCAL_IMAGES) {
    throw new Error(`Upload up to ${MAX_LOCAL_IMAGES} reference images.`);
  }
  return Promise.all(
    localImages.map(async (image, index) => {
      const dataUrl = image.dataUrl?.trim() ?? "";
      const match = dataUrl.match(LOCAL_IMAGE_DATA_URL_PATTERN);
      if (!match) throw new Error("Reference images must be PNG, JPG, or WEBP data URLs.");
      if (decodedBase64ByteLength(match[2]) > MAX_LOCAL_IMAGE_BYTES) {
        throw new Error("Each reference image must be 10MB or smaller.");
      }
      return uploadKieImage(dataUrl, image.fileName ?? `ref-${index}.png`, "lantian-tools/ecommerce-edit");
    })
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      resultUrl?: string;
      refinement?: string;
      localImages?: Array<{ fileName?: string; dataUrl?: string }>;
    };

    const { prompt, resultUrl, refinement } = body;
    // TODO(v2): thread pet replacement context (job.petReplacement.petImageUrls) and brand logo (job.brandLogo.logoImageUrl) into the regenerate call for manufacturer-promo slots.
    if (!prompt) return NextResponse.json({ error: "Original prompt is required." }, { status: 400 });
    if (!resultUrl) return NextResponse.json({ error: "Current result URL is required." }, { status: 400 });
    if (!refinement?.trim()) return NextResponse.json({ error: "Refinement text is required." }, { status: 400 });

    const localImageUrls = await uploadLocalImages(body.localImages);

    const combinedPrompt = [
      prompt,
      "",
      "Refinement request:",
      refinement.trim(),
      "",
      "Use the provided current generated image as the primary visual base. Preserve the product identity and update only what is needed to satisfy the refinement request.",
      localImageUrls.length
        ? "Use the uploaded reference image(s) as additional visual guidance for the requested changes."
        : "",
    ].join("\n");

    const taskId = await createKieImageTask({
      prompt: combinedPrompt,
      inputUrls: [resultUrl, ...localImageUrls],
      aspectRatio: "1:1",
      resolution: "1K",
    });

    return NextResponse.json({ taskId });
  } catch (error) {
    console.error("[ecommerce-assets/regenerate]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start regeneration." },
      { status: 500 }
    );
  }
}
