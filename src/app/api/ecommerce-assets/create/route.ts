import { NextResponse } from "next/server";
import { createEcommerceAssetsJob } from "@/lib/ecommerce-assets-workflow";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sourceMode?: unknown;
      productPhotoDataUrls?: string[];
      productPhotoDataUrl?: string;
      manufacturerPromoDataUrls?: string[];
      petPhotoDataUrls?: { front?: string | null; side?: string | null; back?: string | null };
      petReplacementEnabled?: boolean;
      customRequirements?: string;
      textLanguage?: unknown;
      imageResolution?: string;
      imageAspectRatio?: string;
      videoAspectRatio?: string;
      videoResolution?: string;
      assetScope?: unknown;
      assetScopes?: unknown;
    };
    const sourceMode = body.sourceMode === "manufacturer-promos" ? "manufacturer-promos" : "product-photos";

    const productPhotoDataUrls = body.productPhotoDataUrls && body.productPhotoDataUrls.length > 0
      ? body.productPhotoDataUrls
      : body.productPhotoDataUrl
        ? [body.productPhotoDataUrl]
        : [];

    const validUrls = productPhotoDataUrls.filter(Boolean);
    const manufacturerPromoDataUrls = (body.manufacturerPromoDataUrls ?? []).filter(Boolean);
    const petPhotoDataUrls = body.petPhotoDataUrls && (
      body.petPhotoDataUrls.front
      || body.petPhotoDataUrls.side
      || body.petPhotoDataUrls.back
    )
      ? {
          front: body.petPhotoDataUrls.front ?? null,
          side: body.petPhotoDataUrls.side ?? null,
          back: body.petPhotoDataUrls.back ?? null,
        }
      : undefined;
    const petReplacementEnabled = body.petReplacementEnabled === true && Boolean(petPhotoDataUrls);
    if (sourceMode === "manufacturer-promos") {
      if (manufacturerPromoDataUrls.length === 0) {
        return NextResponse.json({ error: "At least one manufacturerPromoDataUrl is required." }, { status: 400 });
      }
      if (manufacturerPromoDataUrls.length > 6) {
        return NextResponse.json({ error: "Upload up to 6 manufacturer promo images." }, { status: 400 });
      }
      if (petReplacementEnabled && (!petPhotoDataUrls?.front || !petPhotoDataUrls.side || !petPhotoDataUrls.back)) {
        return NextResponse.json(
          { error: "Pet replacement requires front, side, and back pet photos." },
          { status: 400 },
        );
      }
    } else if (validUrls.length === 0) {
      return NextResponse.json({ error: "At least one productPhotoDataUrl is required." }, { status: 400 });
    }

    const job = await createEcommerceAssetsJob({
      sourceMode,
      productPhotoDataUrls: validUrls,
      manufacturerPromoDataUrls,
      petPhotoDataUrls,
      petReplacementEnabled,
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
