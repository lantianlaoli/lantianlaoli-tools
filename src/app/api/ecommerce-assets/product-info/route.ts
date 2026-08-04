import { NextResponse } from "next/server";
import { generateProductInfo } from "@/lib/ecommerce-product-info";
import type { EcommerceCarouselRole } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function normalizeGroups(value: unknown) {
  const groups: Record<EcommerceCarouselRole, string[]> = {
    main: [],
    scene: [],
    detail: [],
    variant: [],
  };
  if (!Array.isArray(value)) return groups;
  for (const item of value as Array<{ role?: string; dataUrls?: unknown }>) {
    if (!item?.role || !(item.role in groups)) continue;
    groups[item.role as EcommerceCarouselRole] = Array.isArray(item.dataUrls)
      ? item.dataUrls.filter(
          (url): url is string =>
            typeof url === "string" && Boolean(url.trim()),
        )
      : [];
  }
  return groups;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      kind?: unknown;
      productSkuDataUrls?: unknown;
      manufacturerReferenceGroups?: unknown;
      styleGuide?: unknown;
    };
    const kind =
      body.kind === "all"
        ? "all"
        : body.kind === "brief"
          ? "brief"
          : body.kind === "title"
            ? "title"
            : null;
    const skuImageUrls = Array.isArray(body.productSkuDataUrls)
      ? body.productSkuDataUrls.filter(
          (url): url is string =>
            typeof url === "string" && Boolean(url.trim()),
        )
      : [];
    const manufacturerReferenceImageUrls = normalizeGroups(
      body.manufacturerReferenceGroups,
    );
    const referenceImageCount = Object.values(
      manufacturerReferenceImageUrls,
    ).flat().length;
    if (!kind)
      return NextResponse.json(
        { error: "kind must be title, brief, or all." },
        { status: 400 },
      );
    if (!referenceImageCount)
      return NextResponse.json(
        {
          error:
            "At least one manufacturer reference image is required for product information.",
        },
        { status: 400 },
      );
    const result = await generateProductInfo({
      kind,
      skuImageUrls,
      manufacturerReferenceImageUrls,
      styleGuide:
        typeof body.styleGuide === "string" ? body.styleGuide : undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[ecommerce-assets/product-info]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate product information.",
      },
      { status: 500 },
    );
  }
}
