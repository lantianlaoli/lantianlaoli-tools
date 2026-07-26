import { NextResponse } from "next/server";
import { analyzeEcommerceCopy, ECOMMERCE_REFERENCE_ROLE_MAX_COUNTS } from "@/lib/ecommerce-assets";

export const runtime = "nodejs";
export const maxDuration = 120;

function validateReferences(value: unknown) {
  if (!Array.isArray(value)) return "Manufacturer reference groups are required.";
  const groups = new Map<string, string[]>();
  for (const group of value as Array<{ role?: string; dataUrls?: unknown }>) {
    if (group?.role) groups.set(group.role, Array.isArray(group.dataUrls) ? group.dataUrls.filter((url): url is string => typeof url === "string" && Boolean(url.trim())) : []);
  }
  for (const [role, urls] of groups) {
    const max = ECOMMERCE_REFERENCE_ROLE_MAX_COUNTS[role as keyof typeof ECOMMERCE_REFERENCE_ROLE_MAX_COUNTS];
    if (max !== undefined && urls.length > max) return `${role} reference group accepts up to ${max} image(s).`;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { productSkuDataUrls?: unknown; manufacturerReferenceGroups?: unknown };
    const skuUrls = Array.isArray(body.productSkuDataUrls) ? body.productSkuDataUrls.filter((url): url is string => typeof url === "string" && Boolean(url.trim())) : [];
    if (!skuUrls.length) return NextResponse.json({ error: "At least one product SKU image is required." }, { status: 400 });
    const referenceError = validateReferences(body.manufacturerReferenceGroups);
    if (referenceError) return NextResponse.json({ error: referenceError }, { status: 400 });

    const groups = body.manufacturerReferenceGroups as Array<{ role: string; dataUrls: string[] }>;
    const manufacturerReferenceImageUrls = { main: [], scene: [], detail: [], variant: [] } as Record<"main" | "scene" | "detail" | "variant", string[]>;
    for (const group of groups) manufacturerReferenceImageUrls[group.role as keyof typeof manufacturerReferenceImageUrls] = group.dataUrls;
    const result = await analyzeEcommerceCopy({ skuImageUrls: skuUrls, manufacturerReferenceImageUrls });
    return NextResponse.json({ success: true, slots: result.slots, usedFallback: result.usedFallback });
  } catch (error) {
    console.error("[ecommerce-assets/analyze]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to analyze product copy." }, { status: 500 });
  }
}
