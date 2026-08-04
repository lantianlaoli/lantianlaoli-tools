import { NextResponse } from "next/server";
import { createEcommerceStoryboardJob } from "@/lib/ecommerce-storyboards-workflow";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      productSkuDataUrl?: unknown;
      manufacturerReferenceDataUrls?: unknown;
      productViewDataUrls?: unknown;
      personImageUrl?: unknown;
    };
    const productSkuDataUrl =
      typeof body.productSkuDataUrl === "string" ? body.productSkuDataUrl : "";
    const manufacturerReferenceDataUrls = Array.isArray(
      body.manufacturerReferenceDataUrls,
    )
      ? body.manufacturerReferenceDataUrls.filter(
          (url): url is string =>
            typeof url === "string" && Boolean(url.trim()),
        )
      : [];
    const productViewDataUrls = Array.isArray(body.productViewDataUrls)
      ? body.productViewDataUrls.filter(
          (url): url is string =>
            typeof url === "string" && Boolean(url.trim()),
        )
      : [];
    const resolvedProductSkuDataUrl = productSkuDataUrl || productViewDataUrls[0] || "";
    if (!resolvedProductSkuDataUrl)
      return NextResponse.json(
        { error: "A SKU image or front product view is required." },
        { status: 400 },
      );
    if (!productViewDataUrls[0])
      return NextResponse.json(
        { error: "The front product view is required." },
        { status: 400 },
      );
    const job = await createEcommerceStoryboardJob({
      productSkuDataUrl: resolvedProductSkuDataUrl,
      manufacturerReferenceDataUrls,
      productViewDataUrls,
      personImageUrl:
        typeof body.personImageUrl === "string"
          ? body.personImageUrl
          : undefined,
    });
    return NextResponse.json(
      { success: true, jobId: job.id, job },
      { status: 202 },
    );
  } catch (error) {
    console.error("[ecommerce-assets/storyboards/create]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create storyboard images.",
      },
      { status: 500 },
    );
  }
}
