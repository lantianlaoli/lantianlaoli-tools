import { NextResponse } from "next/server";
import { createExpoHunterJob } from "@/lib/shenzhen-expo-hunter-workflow";
import type { ShenzhenExpoHunterSearchSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      imageDataUrl?: string;
      settings?: Partial<ShenzhenExpoHunterSearchSettings>;
    };

    if (!body.imageDataUrl) {
      return NextResponse.json(
        { error: "Please upload a schedule image." },
        { status: 400 },
      );
    }

    const job = await createExpoHunterJob({
      imageDataUrl: body.imageDataUrl,
      settings: body.settings,
    });

    return NextResponse.json(
      { success: true, jobId: job.id, job },
      { status: 202 },
    );
  } catch (error) {
    console.error("[shenzhen-expo-hunter/create]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create job." },
      { status: 500 },
    );
  }
}
