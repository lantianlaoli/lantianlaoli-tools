import JSZip from "jszip";
import { NextResponse } from "next/server";
import type { GenerationJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function safeName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "image";
}

function extensionFromContentType(contentType: string | null) {
  if (contentType?.includes("jpeg")) return "jpg";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  return "png";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jobs?: GenerationJob[] };
    const jobs = body.jobs ?? [];
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ exportedAt: new Date().toISOString(), jobs }, null, 2));

    for (const job of jobs) {
      if (!job.resultUrl) continue;
      try {
        const response = await fetch(job.resultUrl);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const contentType = response.headers.get("content-type");
        const ext = extensionFromContentType(contentType);
        const bytes = await response.arrayBuffer();
        zip.file(`images/row-${job.rowNumber}-${safeName(job.sequence || job.rowId)}.${ext}`, bytes);
      } catch (error) {
        zip.file(
          `errors/row-${job.rowNumber}.txt`,
          `Failed to fetch ${job.resultUrl}\n${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const archive = await zip.generateAsync({ type: "arraybuffer" });
    return new Response(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="generated-images.zip"',
      },
    });
  } catch (error) {
    console.error("[export/zip]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export zip." },
      { status: 500 }
    );
  }
}
