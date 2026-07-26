import { NextResponse } from "next/server";
import { createKieImageTask } from "@/lib/kie";
import { getSlotReferenceUrls } from "@/lib/ecommerce-assets-workflow";
import type { EcommerceAssetsJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: EcommerceAssetsJob; slotId?: string };
    const job = body.job;
    const slotId = body.slotId?.trim();
    if (!job || !slotId) {
      return NextResponse.json({ error: "job and slotId are required." }, { status: 400 });
    }

    const slot = job.carouselImages.find((candidate) => candidate.id === slotId);
    if (!slot) {
      return NextResponse.json({ error: "Image slot was not found." }, { status: 404 });
    }
    if (!slot.prompt?.trim()) {
      return NextResponse.json({ error: "Image slot prompt is required." }, { status: 400 });
    }

    const inputUrls = getSlotReferenceUrls(job, slot);
    if (!inputUrls.length) {
      return NextResponse.json({ error: "Product image URLs are required." }, { status: 400 });
    }

    const taskId = await createKieImageTask({
      prompt: slot.prompt,
      inputUrls,
      aspectRatio: "1:1",
      resolution: "1K",
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
