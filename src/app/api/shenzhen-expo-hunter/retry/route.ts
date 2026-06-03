import { NextResponse } from "next/server";
import { retryExpoHunterExpo } from "@/lib/shenzhen-expo-hunter-workflow";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jobId?: string; expoId?: string };

    if (!body.jobId) {
      return NextResponse.json(
        { error: "Missing jobId." },
        { status: 400 },
      );
    }

    if (!body.expoId) {
      return NextResponse.json(
        { error: "Missing expoId." },
        { status: 400 },
      );
    }

    const job = await retryExpoHunterExpo(body.jobId, body.expoId);

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error("[shenzhen-expo-hunter/retry]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry expo." },
      { status: 500 },
    );
  }
}
