import { NextResponse } from "next/server";
import { getKieImageStatus } from "@/lib/kie";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const taskId = new URL(request.url).searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required." }, { status: 400 });
    }
    const status = await getKieImageStatus(taskId);
    return NextResponse.json(status);
  } catch (error) {
    console.error("[generate/status]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check status." },
      { status: 500 }
    );
  }
}
