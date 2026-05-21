import { NextResponse } from "next/server";
import { createEcommerceAssetsJob } from "@/lib/ecommerce-assets-workflow";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      productPhotoDataUrls?: string[];
      productPhotoDataUrl?: string;
      customRequirements?: string;
      textLanguage?: unknown;
      imageResolution?: string;
      imageAspectRatio?: string;
      videoAspectRatio?: string;
      videoResolution?: string;
      assetScope?: unknown;
      assetScopes?: unknown;
    };

    const productPhotoDataUrls = body.productPhotoDataUrls && body.productPhotoDataUrls.length > 0
      ? body.productPhotoDataUrls
      : body.productPhotoDataUrl
        ? [body.productPhotoDataUrl]
        : [];

    const validUrls = productPhotoDataUrls.filter(Boolean);
    if (validUrls.length === 0) {
      return NextResponse.json({ error: "At least one productPhotoDataUrl is required." }, { status: 400 });
    }

    const job = await createEcommerceAssetsJob({
      productPhotoDataUrls: validUrls,
      customRequirements: body.customRequirements,
      textLanguage: body.textLanguage,
      imageResolution: body.imageResolution,
      imageAspectRatio: body.imageAspectRatio,
      videoAspectRatio: body.videoAspectRatio,
      videoResolution: body.videoResolution,
      assetScope: body.assetScope,
      assetScopes: body.assetScopes,
    });

    return NextResponse.json({ success: true, jobId: job.id, job }, { status: 202 });
  } catch (error) {
    console.error("[ecommerce-assets/create]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create ecommerce assets job." },
      { status: 500 }
    );
  }
}
