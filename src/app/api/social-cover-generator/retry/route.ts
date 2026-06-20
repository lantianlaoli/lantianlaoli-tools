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

    const slot = body.job.slots.find((candidate) => candidate.id === body.slotId?.trim());
    if (!slot) {
      return NextResponse.json({ error: "Cover slot was not found." }, { status: 404 });
    }
    if (slot.status !== "fail") {
      return NextResponse.json(
        { error: "Only failed system slots can be retried without credits." },
        { status: 400 }
      );
    }

    const retry = await retrySocialCoverSlot({ job: body.job, slotId: body.slotId.trim() });
    return NextResponse.json({ success: true, ...retry });
  } catch (error) {
    console.error("[social-cover-generator/retry]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry social cover slot." },
      { status: 500 }
    );
  }
}
