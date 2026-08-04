import { NextResponse } from "next/server";
import { refreshEcommerceStoryboardJob } from "@/lib/ecommerce-storyboards-workflow";
import type { EcommerceStoryboardJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: EcommerceStoryboardJob };
    if (!body.job)
      return NextResponse.json({ error: "job is required." }, { status: 400 });
    const job = await refreshEcommerceStoryboardJob(body.job);
    return NextResponse.json({ success: true, jobId: job.id, job });
  } catch (error) {
    console.error("[ecommerce-assets/storyboards/status]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to check storyboard status.",
      },
      { status: 500 },
    );
  }
}
