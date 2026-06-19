import JSZip from "jszip";
import { NextResponse } from "next/server";
import { buildSocialCoverFileNameMap } from "@/lib/social-cover-generator";
import type { SocialCoverJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function safeName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "social-cover";
}

function extensionFromContentType(contentType: string | null) {
  if (contentType?.includes("jpeg")) return "jpg";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  return "png";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: SocialCoverJob };
    if (!body.job) {
      return NextResponse.json({ error: "job is required." }, { status: 400 });
    }
    const zip = new JSZip();
    const successfulSlots = body.job.slots.filter((slot) => slot.status === "success" && slot.resultUrl);
    const fileNameMap = buildSocialCoverFileNameMap(body.job);
    const exportedFiles: Record<string, string> = {};

    for (const slot of successfulSlots) {
      try {
        const response = await fetch(slot.resultUrl!);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const contentType = response.headers.get("content-type");
        const bytes = await response.arrayBuffer();
        const ext = extensionFromContentType(contentType);
        const fileName = `${safeName(fileNameMap[slot.id] ?? slot.id)}.${ext}`;
        exportedFiles[slot.id] = fileName;
        zip.file(`covers/${fileName}`, bytes);
      } catch (error) {
        const errorName = `${safeName(fileNameMap[slot.id] ?? slot.id)}.txt`;
        exportedFiles[slot.id] = `errors/${errorName}`;
        zip.file(`errors/${errorName}`, `Failed to fetch ${slot.resultUrl}\n${error instanceof Error ? error.message : String(error)}`);
      }
    }

    zip.file("manifest.json", JSON.stringify({
      exportedAt: new Date().toISOString(),
      job: body.job,
      files: exportedFiles,
    }, null, 2));

    const archive = await zip.generateAsync({ type: "arraybuffer" });
    return new Response(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="social-covers.zip"',
      },
    });
  } catch (error) {
    console.error("[social-cover-generator/zip]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export social cover zip." },
      { status: 500 }
    );
  }
}
