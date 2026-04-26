import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function safeName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "generated-image";
}

function extensionFromContentType(contentType: string | null) {
  if (contentType?.includes("jpeg")) return "jpg";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  return "png";
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const rawUrl = params.get("url")?.trim();
    const requestedName = params.get("name")?.trim() || "generated-image";
    if (!rawUrl) {
      return NextResponse.json({ error: "url is required." }, { status: 400 });
    }

    const imageUrl = new URL(rawUrl);
    if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
      return NextResponse.json({ error: "Only http and https image URLs are supported." }, { status: 400 });
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${response.status} ${response.statusText}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const extension = extensionFromContentType(contentType);
    const fileName = safeName(requestedName.replace(/\.[a-z0-9]+$/i, ""));
    const bytes = await response.arrayBuffer();

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}.${extension}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[image/download]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download image." },
      { status: 500 }
    );
  }
}
