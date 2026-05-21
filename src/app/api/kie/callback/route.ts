import { NextResponse } from "next/server";
import { normalizeKieRecordInfo } from "@/lib/kie";
import { setStoredJobStatus } from "@/lib/job-store";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const normalized = normalizeKieRecordInfo(payload);
    if (!normalized.taskId) {
      return NextResponse.json({ error: "Callback payload did not include data.taskId." }, { status: 400 });
    }

    await setStoredJobStatus({
      taskId: normalized.taskId,
      status: normalized.status,
      resultUrl: normalized.resultUrl,
      error: normalized.error,
      updatedAt: new Date().toISOString(),
      source: "webhook",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[kie/callback]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process KIE callback." },
      { status: 500 }
    );
  }
}
