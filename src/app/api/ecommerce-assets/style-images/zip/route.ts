import JSZip from "jszip";
import { NextResponse } from "next/server";
import type { EcommerceStyleImageJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: EcommerceStyleImageJob };
    if (!body.job)
      return NextResponse.json({ error: "job is required." }, { status: 400 });
    const zip = new JSZip();
    const manifest = body.job.styleImages.map((slot) => ({
      id: slot.id,
      skuId:
        body.job?.skuIds?.[slot.skuIndex] ??
        `PRODUCT-VARIANT-${slot.skuIndex + 1}`,
      skuIndex: slot.skuIndex,
      status: slot.status,
      url: slot.resultUrl ?? null,
    }));
    for (const [index, slot] of body.job.styleImages.entries()) {
      if (!slot.resultUrl) continue;
      const skuId =
        body.job.skuIds?.[slot.skuIndex] ??
        `PRODUCT-VARIANT-${slot.skuIndex + 1}`;
      const response = await fetch(slot.resultUrl);
      if (!response.ok) continue;
      zip.file(
        `${String(index + 1).padStart(2, "0")}-${skuId}.png`,
        await response.arrayBuffer(),
      );
    }
    zip.file(
      "manifest.json",
      JSON.stringify({ brand: "CHUB TWO", styleImages: manifest }, null, 2),
    );
    const archive = await zip.generateAsync({ type: "uint8array" });
    return new Response(archive as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="chub-two-style-images-${body.job.id}.zip"`,
      },
    });
  } catch (error) {
    console.error("[ecommerce-assets/style-images/zip]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create ZIP.",
      },
      { status: 500 },
    );
  }
}
