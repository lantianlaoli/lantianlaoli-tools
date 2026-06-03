import { NextResponse } from "next/server";
import { runExpoHunterExpo } from "@/lib/shenzhen-expo-hunter-workflow";
import type { ShenzhenExpoHunterSearchSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      jobId?: string;
      expoId?: string;
      settings?: Partial<ShenzhenExpoHunterSearchSettings>;
    };

    if (!body.jobId) {
      return NextResponse.json({ error: "Missing jobId." }, { status: 400 });
    }

    if (!body.expoId) {
      return NextResponse.json({ error: "Missing expoId." }, { status: 400 });
    }

    const job = await runExpoHunterExpo(body.jobId, body.expoId, body.settings);

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error("[shenzhen-expo-hunter/run-expo]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run expo." },
      { status: 500 },
    );
  }
}
