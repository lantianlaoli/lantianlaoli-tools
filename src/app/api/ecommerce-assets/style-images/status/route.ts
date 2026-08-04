import { NextResponse } from "next/server";
import { refreshEcommerceStyleImageJob } from "@/lib/ecommerce-style-images-workflow";
import type { EcommerceStyleImageJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { job?: EcommerceStyleImageJob };
    if (!body.job) return NextResponse.json({ error: "job is required." }, { status: 400 });
    const job = await refreshEcommerceStyleImageJob(body.job);
    return NextResponse.json({ success: true, jobId: job.id, job });
  } catch (error) {
    console.error("[ecommerce-assets/style-images/status]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to check SKU style image status." }, { status: 500 });
  }
}
