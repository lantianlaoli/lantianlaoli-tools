import { callOpenRouter, type OpenRouterMessage } from "./openrouter";
import type {
  EcommerceCarouselRole,
  EcommerceCopyProposal,
  EcommerceImageSlot,
  EcommerceSlotCopyOptions,
} from "./types";

export const CHUB_TWO_LOGO_URL = "https://i.postimg.cc/fLDVv53S/8bc7417a-5846-424c-8b81-401a42d87339.png";
export const CHUB_TWO_PERSON_URL = "https://i.postimg.cc/gknHRkbY/Screen-Shot-2026-06-16-152220-854.png";
export const CHUB_TWO_MAIN_COMPOSITION_URL = "https://i.postimg.cc/GtqBSY09/7604c462-8537-4270-ae35-0646cce18859.png";
export const CHUB_TWO_DEFAULT_STYLE_GUIDE = "CHUB TWO brand direction. Apple-like restraint with a futuristic, youthful feel for young consumers. Use a white background, black typography, English only, 1:1 square composition, 1K quality, and fill the frame with the product or relevant scene without obvious empty space. Keep the visual system extremely minimalist: one clear product focus, one short headline, one short subtitle, and only the fixed CHUB TWO logo where applicable. Avoid decorative clutter, mini-cards, icon grids, specification walls, extra products, unrelated props, pets, prices, QR codes, and copied manufacturer logos or watermarks.";
export const ECOMMERCE_CAROUSEL_ROLE_COUNTS: Record<EcommerceCarouselRole, number> = { main: 1, scene: 4, detail: 3, variant: 1 };
export const ECOMMERCE_REFERENCE_ROLE_MAX_COUNTS: Partial<Record<EcommerceCarouselRole, number>> = { scene: 4, detail: 3, variant: 1 };
export const ECOMMERCE_CAROUSEL_ROLES: EcommerceCarouselRole[] = ["main", "scene", "detail", "variant"];

const ROLE_TITLES: Record<EcommerceCarouselRole, string> = {
  main: "Main Image (White Background)",
  scene: "Scene Image",
  detail: "Detail & Benefit Image",
  variant: "Variant & Specification Image",
};

const ROLE_GUIDANCE: Record<EcommerceCarouselRole, string> = {
  main: "Pure white background. The headline and subheadline occupy the upper-left half. The person and the single primary SKU product occupy the lower-right half, with the person large in frame and reaching forward with the right hand. Never show a second SKU.",
  scene: "Show one distinct believable futuristic lifestyle use scene for young consumers. Keep the product dominant and make the use case immediately understandable.",
  detail: "Use a tight, filled composition to show one distinct material, structure, function, or benefit. Do not invent features that are not visible in the references.",
  variant: "Clearly compare the actual SKU differences in color, form, bundle, or specification using a clean, minimal comparison composition and no unsupported claims.",
};

export function getEcommerceCarouselSlots(referenceCounts: Partial<Record<EcommerceCarouselRole, number>> = {}) {
  return ECOMMERCE_CAROUSEL_ROLES.flatMap((role) =>
    Array.from({ length: role === "main" ? 1 : role === "variant" ? 1 : Math.min(Math.max(referenceCounts[role] ?? 0, 0), ECOMMERCE_CAROUSEL_ROLE_COUNTS[role]) }, (_, offset) => ({
      id: `${role}-${offset + 1}`,
      role,
      index: offset + 1,
      title: role === "main" ? ROLE_TITLES[role] : `${ROLE_TITLES[role]} ${offset + 1}`,
    }))
  );
}

export function buildEcommerceCopyAnalysisPrompt(input: {
  skuImageCount: number;
  manufacturerReferenceImageCount: number;
  referenceCounts: Partial<Record<EcommerceCarouselRole, number>>;
  styleGuide?: string;
}) {
  const sceneCount = input.referenceCounts.scene ?? 0;
  const detailCount = input.referenceCounts.detail ?? 0;
  const styleGuide = input.styleGuide?.trim() || CHUB_TWO_DEFAULT_STYLE_GUIDE;
  return [
    "You are the copy strategist for CHUB TWO, a youth-focused product brand.",
    `Analyze ${input.skuImageCount} product SKU image(s) and ${input.manufacturerReferenceImageCount} scene/detail/variant manufacturer reference image(s).`,
    "First inspect every manufacturer reference image for visible source copy: Chinese or English headlines, subheadlines, feature claims, benefit phrases, model names, labels, badges, and specification wording. Treat that source copy as the starting brief for the rewrite, not as decoration to ignore.",
    "Translate and consolidate the manufacturer copy internally, then rewrite its real selling points into concise English copy with CHUB TWO's futuristic, youthful, premium Apple-like tone. Preserve the original meaning and product facts while making the language sharper for young consumers; do not blindly copy awkward wording or invent claims.",
    "Extract only product facts, names, model labels, visible functions, materials, colors, SKU differences, and manufacturer selling points that are supported by the images.",
    `Create exactly three English title/subtitle proposals for each generated TikTok Shop carousel slot: 1 main image, ${sceneCount} scene image(s), ${detailCount} detail/benefit image(s), and 1 variant/specification image. Do not create slots for missing scene or detail references.`,
    `Apply this editable style guide to every proposal: ${styleGuide}`,
    "Base every proposal on the relevant manufacturer source copy and visible product evidence. Main-1 should synthesize the strongest overall product promise from the available source copy. Scene slots should rewrite different use-case or lifestyle messages from the scene references. Detail slots should rewrite different feature or benefit messages from the detail references. Variant slots should explain only real SKU differences found in the SKU images or variant references.",
    "The first SKU is the only product reference for the main image. Create the main image from that SKU, the fixed person reference, the strongest supported manufacturer message, and the selected title. The variant slot must use all SKU differences when supported. Scene and detail slots must have distinct topics and must not reuse the same title direction across slots.",
    "Never invent specifications, certifications, performance numbers, prices, medical claims, or unsupported features.",
    "Return JSON only in this shape: {\"slots\":[{\"slotId\":\"main-1\",\"proposals\":[{\"id\":\"main-1-1\",\"title\":\"...\",\"subtitle\":\"...\"}]}]}. Include only the generated slot IDs and include every generated slot ID.",
  ].join("\n");
}

function roleFallback(role: EcommerceCarouselRole, index: number): EcommerceCopyProposal[] {
  const prefix = role === "main" ? "main" : `${role}-${index}`;
  const content: Record<EcommerceCarouselRole, Array<[string, string]> | Record<number, Array<[string, string]>>> = {
    main: [["Meet the next move", "Designed for your everyday edge."], ["Control your flow", "A smarter form for a faster life."], ["Built for what is next", "Focused design. Instant impact."]],
    scene: {
      1: [["Make space for focus", "A clean setup for the moments that matter."], ["Power your next move", "Designed to keep your day in motion."], ["Your desk, reimagined", "Less clutter. More control."]],
      2: [["Built into the rhythm", "Smart utility for everyday momentum."], ["One move ahead", "A focused tool for a faster routine."], ["Keep your flow", "Simple power for the way you work."]],
      3: [["Ready when you are", "A refined companion for modern spaces."], ["Less noise, more signal", "Technology that stays out of the way."], ["Turn on the future", "Designed for the next generation of desks."]],
    },
    detail: {
      1: [["Every detail has a reason", "Refined materials. Clear function."], ["Precision, made visible", "See the construction behind the form."], ["Form follows focus", "Nothing extra. Everything intentional."]],
      2: [["Small form. Serious intent.", "Designed around the details that matter."], ["The power is in the build", "A closer look at what makes it work."], ["Clean outside. Smart inside.", "Engineering shaped for everyday use."]],
      3: [["See the difference", "Precision you can feel and trust."], ["Designed to stay clear", "Every surface and edge has a purpose."], ["The detail that changes everything", "A closer look at real product value."]],
    },
    variant: {
      1: [["Choose your signal", "Compare the details. Find your fit."], ["Your setup, your way", "A clear look at every real option."], ["One form, different modes", "Find the configuration that fits."]],
      2: [["More than one way forward", "Explore the available configurations."], ["Built to match your setup", "Compare the real differences at a glance."], ["Pick your next move", "The right variant for your daily rhythm."]],
    },
  };
  const entries = Array.isArray(content[role]) ? content[role] as Array<[string, string]> : content[role][index] ?? content[role][1];
  return entries.map(([title, subtitle], proposalIndex) => ({ id: `${prefix}-${proposalIndex + 1}`, title, subtitle }));
}

export function fallbackEcommerceCopyOptions(referenceCounts: Partial<Record<EcommerceCarouselRole, number>> = {}): EcommerceSlotCopyOptions[] {
  return getEcommerceCarouselSlots(referenceCounts).map((slot) => ({ ...slot, slotId: slot.id, proposals: roleFallback(slot.role, slot.index) }));
}

function imageParts(urls: string[]) {
  return urls.map((url) => ({ type: "image_url" as const, image_url: { url } }));
}

export async function analyzeEcommerceCopy(input: {
  skuImageUrls: string[];
  manufacturerReferenceImageUrls: Record<EcommerceCarouselRole, string[]>;
  styleGuide?: string;
}) {
  const referenceCounts = {
    scene: input.manufacturerReferenceImageUrls.scene?.length ?? 0,
    detail: input.manufacturerReferenceImageUrls.detail?.length ?? 0,
    variant: 1,
  } satisfies Partial<Record<EcommerceCarouselRole, number>>;
  const referenceUrls = ECOMMERCE_CAROUSEL_ROLES.flatMap((role) => input.manufacturerReferenceImageUrls[role] ?? []);
  const message: OpenRouterMessage = {
    role: "user",
    content: [
      { type: "text", text: buildEcommerceCopyAnalysisPrompt({ skuImageCount: input.skuImageUrls.length, manufacturerReferenceImageCount: referenceUrls.length, referenceCounts, styleGuide: input.styleGuide }) },
      ...imageParts([...input.skuImageUrls, ...referenceUrls]),
    ],
  };
  try {
    const result = await callOpenRouter<{ slots?: EcommerceSlotCopyOptions[] }>([message], { type: "json_object" });
    const slots = normalizeCopyOptions(result.slots, referenceCounts);
    return { slots, usedFallback: false };
  } catch (error) {
    console.warn("[ecommerce-assets/analyze] Falling back to deterministic copy options:", error instanceof Error ? error.message : error);
    return { slots: fallbackEcommerceCopyOptions(referenceCounts), usedFallback: true };
  }
}

export function normalizeCopyOptions(value: unknown, referenceCounts: Partial<Record<EcommerceCarouselRole, number>> = {}): EcommerceSlotCopyOptions[] {
  const candidates = Array.isArray(value) ? value : [];
  const seenByRole = new Map<EcommerceCarouselRole, Set<string>>();
  return getEcommerceCarouselSlots(referenceCounts).map((slot) => {
    const candidate = candidates.find((item) => (item as { slotId?: unknown })?.slotId === slot.id) as Partial<EcommerceSlotCopyOptions> | undefined;
    const proposals = Array.isArray(candidate?.proposals)
      ? candidate.proposals.filter((proposal): proposal is EcommerceCopyProposal => Boolean(proposal && typeof proposal.title === "string" && typeof proposal.subtitle === "string" && proposal.title.trim() && proposal.subtitle.trim())).slice(0, 3).map((proposal, index) => ({ id: typeof proposal.id === "string" && proposal.id.trim() ? proposal.id : `${slot.id}-${index + 1}`, title: proposal.title.trim(), subtitle: proposal.subtitle.trim() }))
      : [];
    const signature = proposals.map((proposal) => `${proposal.title}|${proposal.subtitle}`).join("\n");
    const seen = seenByRole.get(slot.role) ?? new Set<string>();
    const normalizedProposals = proposals.length === 3 && !seen.has(signature) ? proposals : roleFallback(slot.role, slot.index);
    seen.add(normalizedProposals.map((proposal) => `${proposal.title}|${proposal.subtitle}`).join("\n"));
    seenByRole.set(slot.role, seen);
    return { ...slot, slotId: slot.id, proposals: normalizedProposals };
  });
}

export function buildEcommerceCarouselPrompts(input: {
  skuImageCount: number;
  primarySkuIndex: number;
  selectedCopyBySlot: Record<string, EcommerceCopyProposal>;
  manufacturerReferenceCountByRole: Partial<Record<EcommerceCarouselRole, number>>;
  styleGuide?: string;
}): Array<Pick<EcommerceImageSlot, "id" | "role" | "index" | "title" | "prompt" | "usePerson" | "selectedCopy">> {
  const styleGuide = input.styleGuide?.trim() || CHUB_TWO_DEFAULT_STYLE_GUIDE;
  return getEcommerceCarouselSlots(input.manufacturerReferenceCountByRole).map((slot) => {
    const selectedCopy = input.selectedCopyBySlot[slot.id];
    const usePerson = slot.id === "main-1";
    const prompt = [
      "Create one finished 1:1 TikTok Shop carousel image for CHUB TWO in image-to-image mode.",
      slot.role === "main"
        ? `Use only SKU ${input.primarySkuIndex + 1} as the product image reference to create the original white-background hero image. Use the fixed CHUB TWO main-image case at ${CHUB_TWO_MAIN_COMPOSITION_URL} as a strict composition and layout reference: preserve its white background, large English headline block in the upper-left half, and large person/product arrangement in the lower-right half. Replace only the product with SKU ${input.primarySkuIndex + 1} and replace the headline/subheadline with the selected copy. Do not show or imply any other SKU, and do not copy the case image's product, text, or brand marks.`
        : slot.role === "variant"
          ? `Use all ${input.skuImageCount} SKU product reference image(s), with SKU ${input.primarySkuIndex + 1} as the primary product reference, to preserve exact identity and show real SKU differences.`
          : `Use only the ${input.manufacturerReferenceCountByRole[slot.role] ?? 0} uploaded manufacturer reference image(s) for this role. If none were uploaded, create the image from the written role direction without inventing unsupported product claims.`,
      `Image role: ${slot.title}. ${ROLE_GUIDANCE[slot.role]}`,
      slot.role === "scene" || slot.role === "detail" ? `This is ${slot.role} slot ${slot.index}; make its visual topic and composition distinct from the other ${slot.role} slots.` : "",
      `English headline to render accurately: ${selectedCopy?.title ?? ""}`,
      `English subheadline to render accurately: ${selectedCopy?.subtitle ?? ""}`,
      `Editable style guide: ${styleGuide}`,
      usePerson ? `Use the fixed CHUB TWO person reference from ${CHUB_TWO_PERSON_URL}. The person is mandatory in the main image, positioned on the right, with the right hand reaching forward and holding the product.` : "Do not use the fixed CHUB TWO person reference in this image.",
      slot.role === "main" ? "Do not add the CHUB TWO logo to the first white-background main image." : "Use the CHUB TWO logo from the fixed reference URL in the top-left corner. Keep its shape, text, and colors accurate without covering the product or headline.",
      "Use English only for all newly rendered text. Render only one headline and one short subheadline. Ignore and remove every logo, watermark, corner badge, label, or text copied from manufacturer reference images; the only allowed added logo is the fixed CHUB TWO logo. Do not create icon grids, mini-cards, spec walls, callout bubbles, multiple product duplicates, extra captions, unrelated props, pets, prices, QR codes, or decorative filler.",
    ].filter(Boolean).join("\n");
    return { ...slot, prompt, usePerson, selectedCopy };
  });
}

export function getBrandLogoNote() {
  return `Use the CHUB TWO logo from ${CHUB_TWO_LOGO_URL} in the top-left corner. Keep it accurate and do not cover the product or headline.`;
}
