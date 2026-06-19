import { NextResponse } from "next/server";
import { retrySocialCoverSlot } from "@/lib/social-cover-generator-workflow";
import type { SocialCoverJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: SocialCoverJob; slotId?: string };
    if (!body.job || !body.slotId?.trim()) {
      return NextResponse.json({ error: "job and slotId are required." }, { status: 400 });
    }

    const taskId = await retrySocialCoverSlot({ job: body.job, slotId: body.slotId.trim() });
    return NextResponse.json({ success: true, taskId });
  } catch (error) {
    console.error("[social-cover-generator/retry]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry social cover slot." },
      { status: 500 }
    );
  }
}
