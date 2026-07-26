import { NextResponse } from "next/server";
import { buildEcommerceCarouselPrompts } from "@/lib/ecommerce-assets";
import { createKieImageTask } from "@/lib/kie";
import { getSlotReferenceUrls } from "@/lib/ecommerce-assets-workflow";
import type { EcommerceAssetsJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      job?: EcommerceAssetsJob;
      slotId?: string;
      skuIndex?: number;
      title?: string;
      subtitle?: string;
      refinement?: string;
    };
    const job = body.job;
    const slotId = body.slotId?.trim();
    const title = body.title?.trim();
    const subtitle = body.subtitle?.trim();
    const refinement = body.refinement?.trim() ?? "";
    if (!job || !slotId || !title || !subtitle) return NextResponse.json({ error: "job, slotId, title, and subtitle are required." }, { status: 400 });
    const slot = job.carouselImages.find((candidate) => candidate.id === slotId);
    if (!slot) return NextResponse.json({ error: "Image slot was not found." }, { status: 404 });
    const skuIndex = Math.min(Math.max(body.skuIndex ?? 0, 0), job.productSkuImageUrls.length - 1);
    const referenceCounts = {
      scene: job.manufacturerReferenceImageUrls.scene?.length ?? 0,
      detail: job.manufacturerReferenceImageUrls.detail?.length ?? 0,
      variant: 1,
    } as const;
    const prompts = buildEcommerceCarouselPrompts({
      skuImageCount: job.productSkuImageUrls.length,
      primarySkuIndex: skuIndex,
      selectedCopyBySlot: { [slot.id]: { id: `${slot.id}-regenerated`, title, subtitle } },
      manufacturerReferenceCountByRole: referenceCounts,
      styleGuide: job.styleGuide,
    });
    const promptSlot = prompts.find((candidate) => candidate.id === slot.id);
    if (!promptSlot) return NextResponse.json({ error: "Image slot configuration was not found." }, { status: 400 });
    const inputUrls = slot.role === "main"
      ? [job.productSkuImageUrls[skuIndex], ...getSlotReferenceUrls(job, { ...slot, usePerson: true }).filter((url) => !job.productSkuImageUrls.includes(url))]
      : [job.productSkuImageUrls[skuIndex], ...(job.manufacturerReferenceImageUrls[slot.role] ?? []), ...(job.brandLogo?.enabled ? [job.brandLogo.logoImageUrl] : [])];
    const refinementInstruction = refinement
      ? [
        "User's correction request for this regeneration:",
        refinement,
        "Follow this correction request precisely. Fix only the requested problems while preserving the selected product identity, fixed CHUB TWO direction, and the image role.",
      ].join("\n")
      : "";
    const taskId = await createKieImageTask({
      prompt: [promptSlot.prompt, refinementInstruction].filter(Boolean).join("\n\n"),
      inputUrls: [slot.resultUrl, ...inputUrls].filter((url): url is string => Boolean(url)),
      aspectRatio: "1:1",
      resolution: "1K",
    });

    return NextResponse.json({ taskId, prompt: [promptSlot.prompt, refinementInstruction].filter(Boolean).join("\n\n"), selectedCopy: { id: `${slot.id}-regenerated`, title, subtitle }, skuIndex });
  } catch (error) {
    console.error("[ecommerce-assets/regenerate]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start regeneration." },
      { status: 500 }
    );
  }
}
