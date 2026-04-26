import { NextResponse } from "next/server";
import { createKieImageTask, getKieCallbackUrl } from "@/lib/kie";
import { setStoredJobStatus } from "@/lib/job-store";
import type { GenerationJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      job?: GenerationJob;
      refinement?: string;
      resultUrl?: string;
    };
    const job = body.job;
    const resultUrl = body.resultUrl?.trim() || job?.resultUrl?.trim();
    const refinement = body.refinement?.trim();

    if (!job?.rowId || !job.taskId) {
      return NextResponse.json({ error: "A completed generation job is required." }, { status: 400 });
    }
    if (!resultUrl || !isHttpUrl(resultUrl)) {
      return NextResponse.json({ error: "A valid current result image URL is required." }, { status: 400 });
    }
    if (!refinement) {
      return NextResponse.json({ error: "Refinement text is required." }, { status: 400 });
    }

    const prompt = [
      job.prompt,
      "",
      "Refinement request:",
      refinement,
      "",
      "Use the provided current generated image as the primary visual base. Preserve the product identity and update only what is needed to satisfy the refinement request.",
    ].join("\n");

    const taskId = await createKieImageTask({
      prompt,
      inputUrls: [resultUrl],
      aspectRatio: job.aspectRatio,
      resolution: job.resolution,
      callBackUrl: getKieCallbackUrl(),
    });

    setStoredJobStatus({
      taskId,
      status: "waiting",
      updatedAt: new Date().toISOString(),
      source: "polling",
    });

    const replacementJob: GenerationJob = {
      ...job,
      taskId,
      status: "waiting",
      prompt,
      resultUrl: undefined,
      error: undefined,
    };

    return NextResponse.json({ job: replacementJob });
  } catch (error) {
    console.error("[generate/regenerate]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start regeneration." },
      { status: 500 }
    );
  }
}
