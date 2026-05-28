import { NextResponse } from "next/server";
import { addExpoAtlasJob, getExpoAtlasJob } from "@/lib/expo-company-atlas-store";
import { startExpoPhotoEnhancement } from "@/lib/expo-company-atlas-workflow";
import type { ExpoAtlasJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      jobId?: string;
      job?: ExpoAtlasJob;
      language?: string;
      companyId?: string;
      photoId?: string;
    };
    const current = body.job ?? (body.jobId ? await getExpoAtlasJob(body.jobId) : undefined);
    if (!current) {
      return NextResponse.json({ error: "job or jobId is required." }, { status: 400 });
    }
    const language = body.language?.trim();
    if (!language) {
      return NextResponse.json({ error: "language is required." }, { status: 400 });
    }

    const job = await startExpoPhotoEnhancement({
      job: current,
      language,
      companyId: body.companyId,
      photoId: body.photoId,
    });
    await addExpoAtlasJob(job);

    return NextResponse.json({ success: true, jobId: job.id, job }, { status: 202 });
  } catch (error) {
    console.error("[expo-company-atlas/enhance-photos]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start photo enhancement." },
      { status: 500 }
    );
  }
}
