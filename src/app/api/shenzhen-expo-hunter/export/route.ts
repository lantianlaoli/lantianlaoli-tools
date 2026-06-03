import { NextResponse } from "next/server";
import { getJob } from "@/lib/shenzhen-expo-hunter-store";
import { exportExpoHunterJob } from "@/lib/shenzhen-expo-hunter-workflow";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      jobId?: string;
      format?: "markdown" | "json";
    };

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

    const format = body.format === "json" ? "json" : "markdown";
    const content = exportExpoHunterJob(job, format);

    if (format === "json") {
      return new NextResponse(content, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="expo-hunter-${job.id}.json"`,
        },
      });
    }

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="expo-hunter-${job.id}.md"`,
      },
    });
  } catch (error) {
    console.error("[shenzhen-expo-hunter/export]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export." },
      { status: 500 },
    );
  }
}
