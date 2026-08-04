import { NextResponse } from "next/server";
import { buildStoryboardImagePrompt } from "@/lib/ecommerce-storyboards";
import { createKieImageTask } from "@/lib/kie";
import type { EcommerceStoryboardJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      job?: EcommerceStoryboardJob;
      slotId?: unknown;
    };
    const job = body.job;
    const slotId = typeof body.slotId === "string" ? body.slotId : "";
    const slot = job?.slots.find((candidate) => candidate.id === slotId);
    if (!job || !slot)
      return NextResponse.json(
        { error: "job and a valid slotId are required." },
        { status: 400 },
      );
    const prompt = buildStoryboardImagePrompt({ slot, storyPlan: job.storyPlan });
    const taskId = await createKieImageTask({
      prompt,
      inputUrls: [
        job.productSkuImageUrl,
        job.personImageUrl,
        ...(job.productViewImageUrls || []),
        ...(slot.manufacturerReferenceImageUrls || []),
      ],
      aspectRatio: "9:16",
      resolution: "1K",
    });
    return NextResponse.json({ success: true, taskId, prompt, slotId });
  } catch (error) {
    console.error("[ecommerce-assets/storyboards/regenerate]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to regenerate storyboard.",
      },
      { status: 500 },
    );
  }
}
