import { callOpenRouter, type OpenRouterMessage } from "./openrouter";
import { CHUB_TWO_DEFAULT_STYLE_GUIDE } from "./ecommerce-assets";
import type {
  EcommerceCarouselRole,
  EcommerceProductBrief,
  EcommerceProductTitleProposal,
} from "./types";

export const CHUB_TWO_BRIEF_INTRO =
  "CHUB TWO creates AI-inspired gadgets with high emotional value, high playability, and beautiful design. We believe everyday tech should not only be useful, but also enjoyable to use every day.";

export const BRIEF_TEMPLATE = `# What does CHUB TWO sell?

${CHUB_TWO_BRIEF_INTRO}

# Made for [a real audience and use context]

[Explain how the product helps in this context and answer the buyer's concern.]

# Built for [a second real context]

[Explain the practical value without unsupported claims.]

# Great for [a third real audience or context]

[Explain why this audience would want it.]

# Designed for Everyday Use

[List only visible or source-supported product features.]

# How to Use

[Give concise, evidence-based usage steps.]`;

function imageParts(urls: string[]) {
  return urls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));
}

const SKU_ID_STOP_WORDS = new Set([
  "SKU",
  "PRODUCT",
  "IMAGE",
  "IMG",
  "PHOTO",
  "VARIANT",
  "STYLE",
  "FINAL",
]);

function fallbackSkuId(sourceName: string | undefined, index: number) {
  const words = (sourceName ?? "")
    .replace(/\.[^.]+$/, "")
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.trim().toUpperCase())
    .filter(
      (word) => word && !SKU_ID_STOP_WORDS.has(word) && !/^\d+$/.test(word),
    );
  return (
    words.length >= 2
      ? words.slice(0, 3)
      : ["PRODUCT", "VARIANT", String(index + 1)]
  ).join("-");
}

function normalizeSkuId(value: unknown, fallback: string) {
  const normalized =
    typeof value === "string"
      ? value
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
      : "";
  if (/^(SKU|PRODUCT|IMAGE|IMG|PHOTO|VARIANT|STYLE)-\d+$/.test(normalized)) {
    return fallback;
  }
  return normalized.split("-").filter(Boolean).length >= 2
    ? normalized
    : fallback;
}

export async function generateSkuIds(input: {
  skuImageUrls: string[];
  sourceNames?: string[];
}) {
  const fallbacks = input.skuImageUrls.map((_, index) =>
    fallbackSkuId(input.sourceNames?.[index], index),
  );
  try {
    const message: OpenRouterMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "Analyze each uploaded SKU product image and create one concise SKU ID for each image in the same order.",
            "Each ID must contain 1–2 meaningful English product keywords plus the visible color or variant difference when supported by the image.",
            "Use uppercase letters and hyphens only. Format example: IPHONE-CASE-BLUE. Do not use SKU-1, SKU-2, image numbers, generic labels, or long descriptions. Do not invent a color that is not visible.",
            `Return JSON only: {\"ids\":[\"KEYWORD-KEYWORD-COLOR\", ...]}. Return exactly ${input.skuImageUrls.length} IDs in image order.`,
          ].join("\n"),
        },
        ...imageParts(input.skuImageUrls),
      ],
    };
    const result = await callOpenRouter<{ ids?: unknown }>([message], {
      type: "json_object",
    });
    const ids = Array.isArray(result.ids) ? result.ids : [];
    return {
      ids: fallbacks.map((fallback, index) =>
        normalizeSkuId(ids[index], fallback),
      ),
      usedFallback: false,
    };
  } catch (error) {
    console.warn("[ecommerce-assets/sku-ids] Falling back:", error);
    return { ids: fallbacks, usedFallback: true };
  }
}

export function buildProductInfoPrompt(input: {
  kind: "title" | "brief" | "all";
  skuImageCount: number;
  manufacturerReferenceImageCount: number;
  styleGuide?: string;
}) {
  const styleGuide = input.styleGuide?.trim() || CHUB_TWO_DEFAULT_STYLE_GUIDE;
  const common = [
    "You are the CHUB TWO product information strategist.",
    `Analyze ${input.skuImageCount} SKU image(s) and ${input.manufacturerReferenceImageCount} manufacturer reference image(s).`,
    "First read visible Chinese or English source copy in the manufacturer images, including product names, headlines, feature claims, scenarios, model labels, and specifications. The variant/specification image is generated from SKU photos, not from a manufacturer variant reference.",
    "Use only facts supported by the uploaded images. Never invent a feature, specification, certification, performance number, material, or usage instruction.",
    `Apply this editable style guide: ${styleGuide}`,
    "All generated copy must be in English.",
  ];
  if (input.kind === "title" || input.kind === "all") {
    const titleInstructions = [
      "Generate exactly one final product title.",
      "The title must begin exactly with CHUB TWO｜ and contain at least 40 characters in total.",
      "After the brand prefix, include the strongest real long-tail product keyword phrase from the manufacturer copy. Keep it concise and readable; do not keyword-stuff.",
    ];
    if (input.kind === "all") {
      return [
        ...common,
        ...titleInstructions,
        "Also generate one finished product brief in the exact QA structure below.",
        "Every section title must be a Markdown H1 beginning with #. Keep the first H1 and the CHUB TWO brand introduction exactly as provided.",
        "Replace every bracketed instruction with product-specific content based on the evidence. Choose three realistic young-consumer use contexts that address purchase doubts.",
        "Use a young Xiaohongshu-style tone: short, warm, conversational paragraphs with clear line breaks and a sense of discovery. Do not use emojis; keep it polished, minimal, and easy to paste into an ecommerce editor.",
        "The Designed for Everyday Use section must contain concise feature lines. The How to Use section must contain only supported steps.",
        `Template:\n${BRIEF_TEMPLATE}`,
        'Return JSON only: {"proposals":[{"id":"title-1","title":"CHUB TWO｜...","rationale":"..."}],"brief":{"content":"..."}}. Return exactly one proposal.',
      ].join("\n");
    }
    return [
      ...common,
      ...titleInstructions,
      'Return JSON only: {"proposals":[{"id":"title-1","title":"CHUB TWO｜...","rationale":"..."}]}. Return exactly one proposal.',
    ].join("\n");
  }
  return [
    ...common,
    "Write one finished product brief using the exact QA structure below.",
    "Every section title must be a Markdown H1 beginning with #. Keep the first H1 and the CHUB TWO brand introduction exactly as provided.",
    "Replace every bracketed instruction with product-specific content based on the evidence. Choose three realistic young-consumer use contexts that address purchase doubts such as portability, ease of use, everyday usefulness, or fit for work/study/travel when supported.",
    "Use a young Xiaohongshu-style tone: short, warm, conversational paragraphs with clear line breaks and a sense of discovery. Do not use emojis; keep it polished, minimal, and easy to paste into an ecommerce editor.",
    "The Designed for Everyday Use section must contain concise feature lines. The How to Use section must contain only supported steps.",
    `Template:\n${BRIEF_TEMPLATE}`,
    'Return JSON only: {"content":"..."}.',
  ].join("\n");
}

function fallbackTitles(): EcommerceProductTitleProposal[] {
  return [
    {
      id: "title-1",
      title:
        "CHUB TWO｜Compact Portable Everyday Tech Gadget for Travel and Work",
      rationale:
        "A single evidence-safe fallback title with a practical long-tail phrase and more than 40 characters.",
    },
  ];
}

export function normalizeProductTitles(
  value: unknown,
): EcommerceProductTitleProposal[] {
  const proposals = Array.isArray(value) ? value : [];
  const normalized = proposals
    .filter(
      (item): item is { id?: unknown; title?: unknown; rationale?: unknown } =>
        Boolean(item && typeof item === "object"),
    )
    .map((item, index) => ({
      id:
        typeof item.id === "string" && item.id.trim()
          ? item.id.trim()
          : `title-${index + 1}`,
      title: typeof item.title === "string" ? item.title.trim() : "",
      rationale:
        typeof item.rationale === "string" ? item.rationale.trim() : undefined,
    }))
    .filter((item) => item.title.startsWith("CHUB TWO｜"))
    .slice(0, 3);
  return normalized.length === 1 && normalized[0].title.length >= 40
    ? normalized
    : fallbackTitles();
}

export function normalizeProductBrief(value: unknown): EcommerceProductBrief {
  const content =
    typeof value === "object" &&
    value &&
    typeof (value as { content?: unknown }).content === "string"
      ? (value as { content: string }).content.trim()
      : "";
  const stripEmoji = (text: string) =>
    text
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/[ \t]+$/gm, "");
  const normalizedContent = content
    .split("\n")
    .map((line) => {
      const cleanedLine = stripEmoji(line);
      const text = cleanedLine.trim().replace(/^#{1,6}\s*/, "");
      if (
        /^(What does CHUB TWO sell\?|Made for\b|Built for\b|Great for\b|Designed for Everyday Use\b|How to Use\b)/i.test(
          text,
        )
      )
        return `# ${text}`;
      return cleanedLine;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    content: normalizedContent.startsWith("# What does CHUB TWO sell?")
      ? normalizedContent
      : stripEmoji(BRIEF_TEMPLATE),
  };
}

export async function generateProductInfo(input: {
  kind: "title" | "brief" | "all";
  skuImageUrls: string[];
  manufacturerReferenceImageUrls: Record<EcommerceCarouselRole, string[]>;
  styleGuide?: string;
}) {
  const referenceUrls = Object.values(
    input.manufacturerReferenceImageUrls,
  ).flat();
  const message: OpenRouterMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: buildProductInfoPrompt({
          kind: input.kind,
          skuImageCount: input.skuImageUrls.length,
          manufacturerReferenceImageCount: referenceUrls.length,
          styleGuide: input.styleGuide,
        }),
      },
      ...imageParts([...input.skuImageUrls, ...referenceUrls]),
    ],
  };
  try {
    const result = await callOpenRouter<{
      proposals?: EcommerceProductTitleProposal[];
      content?: string;
      brief?: { content?: string };
    }>([message], { type: "json_object" });
    return input.kind === "title"
      ? {
          kind: input.kind,
          proposals: normalizeProductTitles(result.proposals),
          usedFallback: false,
        }
      : input.kind === "brief"
        ? {
            kind: input.kind,
            brief: normalizeProductBrief(result),
            usedFallback: false,
          }
        : {
            kind: input.kind,
            proposals: normalizeProductTitles(result.proposals),
            brief: normalizeProductBrief(result.brief),
            usedFallback: false,
          };
  } catch (error) {
    console.warn(
      `[ecommerce-assets/product-info/${input.kind}] Falling back:`,
      error instanceof Error ? error.message : error,
    );
    return input.kind === "title"
      ? { kind: input.kind, proposals: fallbackTitles(), usedFallback: true }
      : input.kind === "brief"
        ? {
            kind: input.kind,
            brief: normalizeProductBrief({}),
            usedFallback: true,
          }
        : {
            kind: input.kind,
            proposals: fallbackTitles(),
            brief: normalizeProductBrief({}),
            usedFallback: true,
          };
  }
}

export function buildStyleImagePrompt(input: {
  skuIndex: number;
  skuId?: string;
  styleGuide?: string;
  compositionReferenceUrl?: string;
}) {
  return input.compositionReferenceUrl
    ? [
        "Create one premium 1:1 SKU product image.",
        "Reference image 1 is the current SKU. Use it for the product's exact shape, color, material, and variant only.",
        "Reference image 2 is the strict composition master. Match its camera angle, product placement, scale, rotation, framing, background, lighting, and shadow exactly; it is a layout reference only.",
        "The shared setup is an approximately 45-degree overhead product view. Do not copy the master product or its color. If the current SKU is black, render it black; if it is another color, preserve that color exactly.",
        input.skuId ? `Current SKU: ${input.skuId}.` : "",
        "Product only: no person, logo, text, props, extra products, pets, or watermarks. Do not change the camera angle.",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Create the first premium 1:1 SKU ${input.skuIndex + 1} product image and establish the master composition for all later SKUs.`,
        "Use the uploaded SKU product image for exact product identity, color, material, and variant.",
        "Use a fixed approximately 45-degree overhead view, consistent orientation, centered framing, white background, soft studio shadow, and high-end product photography.",
        "Product only: no person, logo, text, props, extra products, pets, or watermarks.",
        input.skuId ? `Current SKU: ${input.skuId}.` : "",
      ]
        .filter(Boolean)
        .join("\n");
}
