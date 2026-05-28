import { NextResponse } from "next/server";
import { addExpoAtlasJob, getExpoAtlasJob } from "@/lib/expo-company-atlas-store";
import { refreshExpoAtlasJob } from "@/lib/expo-company-atlas-workflow";
import type { ExpoAtlasJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jobId?: string; job?: ExpoAtlasJob };
    const current = body.job ?? (body.jobId ? await getExpoAtlasJob(body.jobId) : undefined);
    if (!current) {
      return NextResponse.json({ error: "job or jobId is required." }, { status: 400 });
    }

    const job = await refreshExpoAtlasJob(current);
    await addExpoAtlasJob(job);

    return NextResponse.json({ success: true, jobId: job.id, job });
  } catch (error) {
    console.error("[expo-company-atlas/status]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to refresh expo company atlas status." },
      { status: 500 }
    );
  }
}

