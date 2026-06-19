import { NextResponse } from "next/server";
import { refreshSocialCoverJob } from "@/lib/social-cover-generator-workflow";
import type { SocialCoverJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: SocialCoverJob };
    if (!body.job) {
      return NextResponse.json({ error: "job is required." }, { status: 400 });
    }

    const job = await refreshSocialCoverJob(body.job);
    return NextResponse.json({ success: true, jobId: job.id, job });
  } catch (error) {
    console.error("[social-cover-generator/status]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check social cover status." },
      { status: 500 }
    );
  }
}
