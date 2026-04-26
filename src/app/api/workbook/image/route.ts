import { NextResponse } from "next/server";
import { findStoredWorkbookImage } from "@/lib/workbook-store";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const workbookId = params.get("workbookId");
  const imageId = params.get("imageId");
  if (!workbookId || !imageId) {
    return NextResponse.json({ error: "workbookId and imageId are required." }, { status: 400 });
  }

  const image = findStoredWorkbookImage(workbookId, imageId);
  if (!image) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const [, base64Data = ""] = image.dataUrl.split(",", 2);
  const bytes = Buffer.from(base64Data, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
