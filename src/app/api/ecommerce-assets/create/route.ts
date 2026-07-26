import { NextResponse } from "next/server";
import { ECOMMERCE_REFERENCE_ROLE_MAX_COUNTS, getEcommerceCarouselSlots } from "@/lib/ecommerce-assets";
import { createEcommerceAssetsJob } from "@/lib/ecommerce-assets-workflow";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      productSkuDataUrls?: string[];
      primarySkuIndex?: number;
      manufacturerReferenceGroups?: unknown;
      selectedCopyBySlot?: Record<string, { id: string; title: string; subtitle: string }>;
    };
    const validUrls = (body.productSkuDataUrls ?? []).filter(Boolean);
    if (!validUrls.length) return NextResponse.json({ error: "At least one product SKU image is required." }, { status: 400 });
    if (!Array.isArray(body.manufacturerReferenceGroups)) return NextResponse.json({ error: "Manufacturer reference groups are required." }, { status: 400 });

    const groups = new Map<string, string[]>();
    for (const group of body.manufacturerReferenceGroups as Array<{ role?: string; dataUrls?: unknown }>) {
      if (group?.role) groups.set(group.role, Array.isArray(group.dataUrls) ? group.dataUrls.filter((url): url is string => typeof url === "string" && Boolean(url.trim())) : []);
    }
    for (const [role, urls] of groups) {
      const max = ECOMMERCE_REFERENCE_ROLE_MAX_COUNTS[role as keyof typeof ECOMMERCE_REFERENCE_ROLE_MAX_COUNTS];
      if (max !== undefined && urls.length > max) return NextResponse.json({ error: `${role} reference group accepts up to ${max} image(s).` }, { status: 400 });
    }

    const selectedCopyBySlot = body.selectedCopyBySlot ?? {};
    const referenceCounts = { scene: groups.get("scene")?.length ?? 0, detail: groups.get("detail")?.length ?? 0, variant: 1 } as const;
    const requiredSlotIds = getEcommerceCarouselSlots(referenceCounts).map((slot) => slot.id);
    if (requiredSlotIds.some((slotId) => !selectedCopyBySlot[slotId]?.title?.trim() || !selectedCopyBySlot[slotId]?.subtitle?.trim())) {
      return NextResponse.json({ error: "Select one English title and subtitle proposal for every generated carousel image." }, { status: 400 });
    }

    const job = await createEcommerceAssetsJob({
      productSkuDataUrls: validUrls,
      primarySkuIndex: body.primarySkuIndex,
      manufacturerReferenceGroups: body.manufacturerReferenceGroups,
      selectedCopyBySlot,
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
