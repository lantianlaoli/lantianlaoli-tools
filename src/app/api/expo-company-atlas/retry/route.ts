import { NextResponse } from "next/server";
import { addExpoAtlasJob, getExpoAtlasJob } from "@/lib/expo-company-atlas-store";
import { startExpoAtlasGeneration } from "@/lib/expo-company-atlas-workflow";
import type { ExpoAtlasJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jobId?: string; job?: ExpoAtlasJob; photoId?: string };
    const current = body.job ?? (body.jobId ? await getExpoAtlasJob(body.jobId) : undefined);
    const photoId = body.photoId?.trim();
    if (!current || !photoId) {
      return NextResponse.json({ error: "job/jobId and photoId are required." }, { status: 400 });
    }
    if (!current.photos.some((photo) => photo.id === photoId)) {
      return NextResponse.json({ error: "Photo was not found." }, { status: 404 });
    }

    const resetJob: ExpoAtlasJob = {
      ...current,
      photos: current.photos.map((photo) =>
        photo.id === photoId
          ? { ...photo, generationStatus: "waiting", generationTaskId: undefined, generatedUrl: undefined, enhancedStatus: "waiting", enhancedTaskId: undefined, enhancedUrl: undefined, error: undefined }
          : photo
      ),
    };
    const job = await startExpoAtlasGeneration({ job: resetJob, photoId });
    await addExpoAtlasJob(job);

    return NextResponse.json({ success: true, jobId: job.id, job }, { status: 202 });
  } catch (error) {
    console.error("[expo-company-atlas/retry]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry expo company atlas image." },
      { status: 500 }
    );
  }
}

