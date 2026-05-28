import { NextResponse } from "next/server";
import { addExpoAtlasJob } from "@/lib/expo-company-atlas-store";
import { createExpoAtlasJob } from "@/lib/expo-company-atlas-workflow";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      files?: Array<{ fileName?: string; dataUrl?: string }>;
      title?: string;
      imageAspectRatio?: unknown;
      imageResolution?: unknown;
    };
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0) {
      return NextResponse.json({ error: "At least one image is required." }, { status: 400 });
    }

    const job = await createExpoAtlasJob({
      files,
      title: body.title,
      imageAspectRatio: body.imageAspectRatio,
      imageResolution: body.imageResolution,
    });
    await addExpoAtlasJob(job);

    return NextResponse.json({ success: true, jobId: job.id, job }, { status: 202 });
  } catch (error) {
    console.error("[expo-company-atlas/create]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create expo company atlas job." },
      { status: 500 }
    );
  }
}

