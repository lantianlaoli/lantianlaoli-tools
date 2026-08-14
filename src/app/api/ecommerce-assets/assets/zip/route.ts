import JSZip from "jszip";
import { NextResponse } from "next/server";
import type { EcommerceAssetsJob, EcommerceStyleImageJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      carouselJob?: EcommerceAssetsJob | null;
      styleJob?: EcommerceStyleImageJob | null;
    };
    if (!body.carouselJob && !body.styleJob)
      return NextResponse.json({ error: "At least one completed image job is required." }, { status: 400 });

    const zip = new JSZip();
    const carouselManifest = body.carouselJob?.carouselImages.map((slot) => ({
      id: slot.id,
      role: slot.role,
      title: slot.title,
      url: slot.resultUrl ?? null,
    })) ?? [];
    const styleManifest = body.styleJob?.styleImages.map((slot) => ({
      id: slot.id,
      skuIndex: slot.skuIndex,
      skuId: body.styleJob?.skuIds?.[slot.skuIndex] ?? `SKU-${slot.skuIndex + 1}`,
      url: slot.resultUrl ?? null,
    })) ?? [];

    for (const [index, slot] of (body.carouselJob?.carouselImages ?? []).entries()) {
      if (!slot.resultUrl) continue;
      const response = await fetch(slot.resultUrl);
      if (response.ok)
        zip.file(`carousel/${String(index + 1).padStart(2, "0")}-${slot.role}-${slot.index}.png`, await response.arrayBuffer());
    }
    for (const [index, slot] of (body.styleJob?.styleImages ?? []).entries()) {
      if (!slot.resultUrl) continue;
      const response = await fetch(slot.resultUrl);
      if (response.ok) {
        const skuId = body.styleJob?.skuIds?.[slot.skuIndex] ?? `SKU-${slot.skuIndex + 1}`;
        zip.file(`sku/${String(index + 1).padStart(2, "0")}-${skuId}.png`, await response.arrayBuffer());
      }
    }
    zip.file("manifest.json", JSON.stringify({ brand: "CHUB TWO", carousel: carouselManifest, sku: styleManifest }, null, 2));
    const archive = await zip.generateAsync({ type: "uint8array" });
    return new Response(archive as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=\"tiktok-shop-image-assets.zip\"",
      },
    });
  } catch (error) {
    console.error("[ecommerce-assets/assets/zip]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to export image assets." }, { status: 500 });
  }
}
