import JSZip from "jszip";
import { NextResponse } from "next/server";
import type { EcommerceAssetsJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: EcommerceAssetsJob };
    if (!body.job) return NextResponse.json({ error: "job is required." }, { status: 400 });
    const zip = new JSZip();
    const manifest = body.job.carouselImages.map((slot) => ({ id: slot.id, role: slot.role, title: slot.title, url: slot.resultUrl ?? null }));
    for (const [index, slot] of body.job.carouselImages.entries()) {
      if (!slot.resultUrl) continue;
      const response = await fetch(slot.resultUrl);
      if (!response.ok) continue;
      zip.file(`${String(index + 1).padStart(2, "0")}-${slot.role}-${slot.index}.png`, await response.arrayBuffer());
    }
    zip.file("manifest.json", JSON.stringify({ brand: "CHUB TWO", slots: manifest }, null, 2));
    const archive = await zip.generateAsync({ type: "uint8array" });
    return new Response(archive as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="tiktok-shop-carousel-${body.job.id}.zip"`,
      },
    });
  } catch (error) {
    console.error("[ecommerce-assets/zip]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create ZIP." }, { status: 500 });
  }
}
