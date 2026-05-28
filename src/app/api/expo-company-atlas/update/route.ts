import { NextResponse } from "next/server";
import { refreshExpoMarkdown } from "@/lib/expo-company-atlas";
import { addExpoAtlasJob, sanitizeExpoAtlasJob } from "@/lib/expo-company-atlas-store";
import type { ExpoAtlasJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: ExpoAtlasJob };
    if (!body.job) {
      return NextResponse.json({ error: "job is required." }, { status: 400 });
    }
    if (!Array.isArray(body.job.companies) || body.job.companies.length === 0) {
      return NextResponse.json({ error: "At least one company is required." }, { status: 400 });
    }

    const job = sanitizeExpoAtlasJob(
      refreshExpoMarkdown({ ...body.job, status: body.job.status === "analyzing" ? "ready" : body.job.status, updatedAt: Date.now() })
    );
    await addExpoAtlasJob(job);

    return NextResponse.json({ success: true, jobId: job.id, job });
  } catch (error) {
    console.error("[expo-company-atlas/update]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update expo company atlas job." },
      { status: 500 }
    );
  }
}
