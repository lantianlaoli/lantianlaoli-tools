import { NextResponse } from "next/server";
import { createKieImageTask, getKieCallbackUrl, uploadKieImage } from "@/lib/kie";
import { buildGenerationPrompt } from "@/lib/prompt";
import { setStoredJobStatus } from "@/lib/job-store";
import { getStoredWorkbook } from "@/lib/workbook-store";
import type { GenerationJob, ParsedWorkbook, ParsedWorkbookRow, WorkbookImage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function dedupeImages(images: WorkbookImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = `${image.id}:${image.fileName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workbook?: ParsedWorkbook;
      includeMainImageRow?: boolean;
      rowIds?: string[];
    };
    let workbook = body.workbook;
    if (body.workbook?.workbookId) {
      const storedWorkbook = getStoredWorkbook(body.workbook.workbookId);
      if (!storedWorkbook) {
        return NextResponse.json(
          { error: "Uploaded workbook data expired. Please upload the XLSX again." },
          { status: 410 }
        );
      }
      workbook = storedWorkbook;
    }
    if (!workbook) {
      return NextResponse.json({ error: "Parsed workbook payload is required." }, { status: 400 });
    }

    const selectedIds = new Set(body.rowIds ?? []);
    const rows: ParsedWorkbookRow[] = [
      ...(body.includeMainImageRow && workbook.mainImageRow ? [workbook.mainImageRow] : []),
      ...workbook.rows,
    ].filter((row) => selectedIds.size === 0 || selectedIds.has(row.id));

    if (!rows.length) {
      return NextResponse.json({ error: "No generation rows selected." }, { status: 400 });
    }

    const jobs: GenerationJob[] = [];
    const callBackUrl = getKieCallbackUrl();
    const uploadedUrls = new Map<string, Promise<string>>();

    function uploadReference(image: WorkbookImage, fileName: string) {
      const key = `${image.id}:${image.fileName}`;
      const cachedUpload = uploadedUrls.get(key);
      if (cachedUpload) return cachedUpload;
      const upload = uploadKieImage(image.dataUrl, fileName, "rivora/references");
      uploadedUrls.set(key, upload);
      return upload;
    }

    for (const row of rows) {
      const prompt = buildGenerationPrompt(workbook, row);
      const references = dedupeImages([...workbook.product.images, ...row.referenceImages]).slice(0, 16);
      if (!references.length) {
        jobs.push({
          rowId: row.id,
          rowNumber: row.rowNumber,
          sequence: row.sequence,
          taskId: "",
          status: "fail",
          error: "No reference images available for this row.",
          prompt,
          aspectRatio: row.aspectRatio,
          resolution: row.resolution,
          sourceRow: row.source,
        });
        continue;
      }

      const inputUrls = await Promise.all(
        references.map((image, index) =>
          uploadReference(image, `row-${row.rowNumber}-ref-${index + 1}-${image.fileName}`)
        )
      );

      const taskId = await createKieImageTask({
        prompt,
        inputUrls,
        aspectRatio: row.aspectRatio,
        resolution: row.resolution,
        callBackUrl,
      });
      await setStoredJobStatus({
        taskId,
        status: "waiting",
        updatedAt: new Date().toISOString(),
        source: "polling",
      });

      jobs.push({
        rowId: row.id,
        rowNumber: row.rowNumber,
        sequence: row.sequence,
        taskId,
        status: "waiting",
        prompt,
        aspectRatio: row.aspectRatio,
        resolution: row.resolution,
        sourceRow: row.source,
      });
    }

    return NextResponse.json({ jobs, callBackUrl: callBackUrl ?? null });
  } catch (error) {
    console.error("[generate/start]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start generation." },
      { status: 500 }
    );
  }
}
