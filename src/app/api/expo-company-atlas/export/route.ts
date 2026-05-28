import JSZip from "jszip";
import { NextResponse } from "next/server";
import { buildExpoCompanyMarkdown } from "@/lib/expo-company-atlas";
import type { ExpoAtlasJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function safeName(value: string) {
  return value.replace(/[^a-z0-9\u4e00-\u9fa5._-]+/gi, "-").replace(/^-+|-+$/g, "") || "company";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: ExpoAtlasJob; companyId?: string; format?: "markdown" | "zip" };
    if (!body.job) {
      return NextResponse.json({ error: "job is required." }, { status: 400 });
    }
    const companies = body.companyId
      ? body.job.companies.filter((company) => company.id === body.companyId)
      : body.job.companies;
    if (companies.length === 0) {
      return NextResponse.json({ error: "No companies matched the export request." }, { status: 404 });
    }

    const markdownFiles = companies.map((company) => ({
      fileName: `${safeName(company.name)}.md`,
      markdown: company.markdown || buildExpoCompanyMarkdown(company, body.job!.photos),
    }));

    if (body.format !== "zip") {
      return NextResponse.json({ success: true, files: markdownFiles });
    }

    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ exportedAt: new Date().toISOString(), jobId: body.job.id }, null, 2));
    for (const file of markdownFiles) zip.file(file.fileName, file.markdown);
    const archive = await zip.generateAsync({ type: "arraybuffer" });

    return new Response(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="expo-company-atlas.zip"',
      },
    });
  } catch (error) {
    console.error("[expo-company-atlas/export]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export expo company atlas." },
      { status: 500 }
    );
  }
}

