import { NextResponse } from "next/server";
import { createKieImageTask } from "@/lib/kie";
import type { EcommerceAssetsJob, KieAspectRatio, KieResolution } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const KIE_ASPECT_RATIOS = new Set<KieAspectRatio>(["auto", "1:1", "9:16", "16:9", "4:3", "3:4"]);
const KIE_RESOLUTIONS = new Set<KieResolution>(["1K", "2K", "4K"]);

function normalizeAspectRatio(value: unknown): KieAspectRatio {
  return typeof value === "string" && KIE_ASPECT_RATIOS.has(value as KieAspectRatio)
    ? (value as KieAspectRatio)
    : "1:1";
}

function normalizeResolution(value: unknown): KieResolution {
  return typeof value === "string" && KIE_RESOLUTIONS.has(value as KieResolution)
    ? (value as KieResolution)
    : "1K";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: EcommerceAssetsJob; slotId?: string };
    const job = body.job;
    const slotId = body.slotId?.trim();
    if (!job || !slotId) {
      return NextResponse.json({ error: "job and slotId are required." }, { status: 400 });
    }

    const slot = [...job.carouselImages, ...job.detailImages].find((candidate) => candidate.id === slotId);
    if (!slot) {
      return NextResponse.json({ error: "Image slot was not found." }, { status: 404 });
    }
    if (!slot.prompt?.trim()) {
      return NextResponse.json({ error: "Image slot prompt is required." }, { status: 400 });
    }

    const productImageUrls = job.sourceMode === "manufacturer-promos"
      ? typeof slot.sourceIndex === "number" && job.manufacturerPromoImageUrls?.[slot.sourceIndex]
        ? [job.manufacturerPromoImageUrls[slot.sourceIndex]]
        : []
      : job.productImageUrls?.length
        ? job.productImageUrls
        : job.productImageUrl
          ? [job.productImageUrl]
          : [];
    if (!productImageUrls.length) {
      return NextResponse.json({ error: "Product image URLs are required." }, { status: 400 });
    }

    const petImageUrls = job.sourceMode === "manufacturer-promos"
      && job.petReplacement?.petImageUrls?.length === 3
      ? job.petReplacement.petImageUrls
      : [];
    const brandLogoUrl = job.sourceMode === "manufacturer-promos"
      && job.brandLogo?.enabled
      && job.brandLogo.logoImageUrl
      ? job.brandLogo.logoImageUrl
      : "";
    const inputUrls = [
      ...productImageUrls,
      ...(brandLogoUrl ? [brandLogoUrl] : []),
      ...petImageUrls,
    ];

    const taskId = await createKieImageTask({
      prompt: slot.prompt,
      inputUrls,
      aspectRatio: normalizeAspectRatio(job.imageAspectRatio),
      resolution: normalizeResolution(job.imageResolution),
    });

    return NextResponse.json({ taskId });
  } catch (error) {
    console.error("[ecommerce-assets/retry]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry image generation." },
      { status: 500 }
    );
  }
}
