import { NextResponse } from "next/server";
import { createEcommerceStyleImageJob } from "@/lib/ecommerce-style-images-workflow";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      productSkuDataUrls?: unknown;
      skuFileNames?: unknown;
      styleGuide?: unknown;
    };
    const productSkuDataUrls = Array.isArray(body.productSkuDataUrls)
      ? body.productSkuDataUrls.filter(
          (url): url is string =>
            typeof url === "string" && Boolean(url.trim()),
        )
      : [];
    if (!productSkuDataUrls.length)
      return NextResponse.json(
        { error: "At least one product SKU image is required." },
        { status: 400 },
      );
    const skuFileNames = Array.isArray(body.skuFileNames)
      ? body.skuFileNames.filter(
          (name): name is string => typeof name === "string",
        )
      : undefined;
    const job = await createEcommerceStyleImageJob({
      productSkuDataUrls,
      skuFileNames,
      styleGuide:
        typeof body.styleGuide === "string" ? body.styleGuide : undefined,
    });
    return NextResponse.json(
      { success: true, jobId: job.id, job },
      { status: 202 },
    );
  } catch (error) {
    console.error("[ecommerce-assets/style-images/create]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create SKU style images.",
      },
      { status: 500 },
    );
  }
}
