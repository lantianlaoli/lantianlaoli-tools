import { NextResponse } from "next/server";
import { regenerateEcommerceStyleImage } from "@/lib/ecommerce-style-images-workflow";
import type { EcommerceStyleImageJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: EcommerceStyleImageJob; slotId?: string; skuIndex?: number; refinement?: string };
    if (!body.job || !body.slotId) return NextResponse.json({ error: "job and slotId are required." }, { status: 400 });
    const result = await regenerateEcommerceStyleImage({ job: body.job, slotId: body.slotId, skuIndex: body.skuIndex ?? 0, refinement: body.refinement });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ecommerce-assets/style-images/regenerate]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to regenerate SKU style image." }, { status: 500 });
  }
}
