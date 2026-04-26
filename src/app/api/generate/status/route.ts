import { NextResponse } from "next/server";
import { getKieImageStatus } from "@/lib/kie";
import { getStoredJobStatus, setStoredJobStatus } from "@/lib/job-store";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const taskId = new URL(request.url).searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required." }, { status: 400 });
    }
    const webhookStatus = getStoredJobStatus(taskId);
    if (webhookStatus?.source === "webhook") {
      return NextResponse.json(webhookStatus);
    }

    const status = await getKieImageStatus(taskId);
    setStoredJobStatus({
      taskId,
      status: status.status,
      resultUrl: status.resultUrl,
      error: status.error,
      updatedAt: new Date().toISOString(),
      source: "polling",
    });
    return NextResponse.json(status);
  } catch (error) {
    console.error("[generate/status]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check status." },
      { status: 500 }
    );
  }
}
