import { NextResponse } from "next/server";
import { createEcommerceStoryboardVideo } from "@/lib/ecommerce-storyboards-workflow";
import type { EcommerceStoryboardJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      job?: EcommerceStoryboardJob;
      slotId?: unknown;
    };
    if (!body.job || typeof body.slotId !== "string")
      return NextResponse.json(
        { error: "job and slotId are required." },
        { status: 400 },
      );
    const result = await createEcommerceStoryboardVideo({
      job: body.job,
      slotId: body.slotId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[ecommerce-assets/storyboards/video/create]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create storyboard video.",
      },
      { status: 500 },
    );
  }
}
