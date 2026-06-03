import { NextResponse } from "next/server";
import { getJob } from "@/lib/shenzhen-expo-hunter-store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jobId?: string };

    if (!body.jobId) {
      return NextResponse.json(
        { error: "Missing jobId." },
        { status: 400 },
      );
    }

    const job = getJob(body.jobId);
    if (!job) {
      return NextResponse.json(
        { error: "Job not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error("[shenzhen-expo-hunter/status]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get job status." },
      { status: 500 },
    );
  }
}
