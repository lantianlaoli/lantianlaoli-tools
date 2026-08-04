import { callOpenRouter, type OpenRouterMessage } from "./openrouter";
import type {
  EcommerceStoryboardSellingPoint,
  EcommerceStoryboardStage,
  EcommerceStoryboardStoryPlan,
  EcommerceStoryboardSlot,
} from "./types";

export const STORYBOARD_COUNT = 3;

const FALLBACK_SELLING_POINTS: EcommerceStoryboardSellingPoint[] = [
  {
    id: "point-1",
    title: "Portable everyday design",
    description:
      "Show how the product fits naturally into a young person's daily routine.",
  },
  {
    id: "point-2",
    title: "Tactile product details",
    description:
      "Show one real material, control, structure, or interaction detail.",
  },
  {
    id: "point-3",
    title: "Simple use in real life",
    description:
      "Show one practical use moment that is supported by the source images.",
  },
];

const FALLBACK_STAGES: Array<{
  id: string;
  stage: EcommerceStoryboardStage;
  sellingPoint: EcommerceStoryboardSellingPoint;
  transitionFromPrevious: string;
  transitionToNext: string;
}> = [
  {
    id: "stage-1",
    stage: "opening",
    sellingPoint: FALLBACK_SELLING_POINTS[0],
    transitionFromPrevious: "Open naturally with the creator noticing the product.",
    transitionToNext: "Carry the same product and hand movement into the next shot.",
  },
  {
    id: "stage-2",
    stage: "continuation",
    sellingPoint: FALLBACK_SELLING_POINTS[1],
    transitionFromPrevious: "Continue directly from the opening interaction.",
    transitionToNext: "Keep the same setting and move from detail to practical use.",
  },
  {
    id: "stage-3",
    stage: "closing",
    sellingPoint: FALLBACK_SELLING_POINTS[2],
    transitionFromPrevious: "Continue the same use moment without resetting the scene.",
    transitionToNext: "End with a natural satisfied reaction and a clear product hero moment.",
  },
];

function imageParts(urls: string[]) {
  return urls.filter(Boolean).map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));
}

export function normalizeStoryboardSellingPoints(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item, index) => ({
      id: `point-${index + 1}`,
      title: typeof item.title === "string" ? item.title.trim() : "",
      description:
        typeof item.description === "string" ? item.description.trim() : "",
    }))
    .filter((item) => item.title && item.description)
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.title.toLowerCase() === item.title.toLowerCase(),
        ) === index,
    )
    .slice(0, STORYBOARD_COUNT);
  return normalized.length === STORYBOARD_COUNT
    ? normalized
    : FALLBACK_SELLING_POINTS;
}

function cleanBrandName(value: string, fallback: string) {
  const cleaned = value.replace(/CHUB\s*TWO/gi, "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

const DESCRIPTION_MIN_LENGTH = 240;
const DESCRIPTION_MAX_LENGTH = 360;

function normalizeDescription(
  value: string,
  input: { productName: string; painPoint: string; solutionAngle: string },
) {
  const cleaned = cleanBrandName(value, "");
  if (cleaned.length >= DESCRIPTION_MIN_LENGTH && cleaned.length <= DESCRIPTION_MAX_LENGTH)
    return cleaned;
  const fallback = cleanBrandName(
    `If your ${input.productName} setup keeps getting in the way, this is the small upgrade that makes everyday use feel easier. Built for people who want a cleaner, more comfortable routine, it helps turn ${input.painPoint.toLowerCase()} into a simple moment that fits naturally into work, study, travel, or downtime. ${input.solutionAngle} See how the product moves from a quick first touch to a useful part of your day, without adding clutter or asking you to change your whole setup.`,
    "A practical everyday upgrade that turns a common setup problem into a simpler, more comfortable routine.",
  );
  if (fallback.length <= DESCRIPTION_MAX_LENGTH) return fallback;
  return `${fallback.slice(0, DESCRIPTION_MAX_LENGTH - 1).trimEnd()}…`;
}

function normalizeHashtags(value: unknown) {
  const hashtags = Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => `#${item.replace(/^#+/, "").replace(/\s+/g, "")}`)
        .filter((item, index, all) => item.length > 1 && all.indexOf(item) === index)
        .slice(0, 5)
    : [];
  const fallback = [
    "#ProductFinds",
    "#EverydayGadget",
    "#UGCReview",
    "#SmartDesign",
    "#DailyCarry",
  ];
  return [...hashtags, ...fallback].slice(0, 5);
}

export function normalizeStoryboardStoryPlan(
  value: unknown,
  productName = "the product",
): EcommerceStoryboardStoryPlan {
  const source = value && typeof value === "object" ? value : {};
  const record = source as Record<string, unknown>;
  const rawStages = Array.isArray(record.stages) ? record.stages : [];
  const stages = rawStages
    .map((item, index) => {
      const stage = item && typeof item === "object" ? item : {};
      const stageRecord = stage as Record<string, unknown>;
      const fallback = FALLBACK_STAGES[index];
      const point = stageRecord.sellingPoint;
      const pointRecord = point && typeof point === "object" ? point : stageRecord;
      const pointData = pointRecord as Record<string, unknown>;
      const title = typeof pointData.title === "string" ? pointData.title.trim() : "";
      const description =
        typeof pointData.description === "string" ? pointData.description.trim() : "";
      return {
        id: `stage-${index + 1}`,
        stage:
          stageRecord.stage === "continuation" || stageRecord.stage === "closing"
            ? stageRecord.stage
            : fallback.stage,
        sellingPoint: {
          id: `point-${index + 1}`,
          title: title || fallback.sellingPoint.title,
          description: description || fallback.sellingPoint.description,
        },
        transitionFromPrevious:
          typeof stageRecord.transitionFromPrevious === "string"
            ? stageRecord.transitionFromPrevious.trim()
            : fallback.transitionFromPrevious,
        transitionToNext:
          typeof stageRecord.transitionToNext === "string"
            ? stageRecord.transitionToNext.trim()
            : fallback.transitionToNext,
      };
    })
    .slice(0, STORYBOARD_COUNT);
  const finalStages = stages.length === STORYBOARD_COUNT ? stages : FALLBACK_STAGES;
  const normalizedProductName = cleanBrandName(
    typeof record.productName === "string" ? record.productName : productName,
    productName,
  );
  const targetAudience = cleanBrandName(
    typeof record.targetAudience === "string" ? record.targetAudience : "",
    "Young people who want everyday tech to feel easier and more enjoyable.",
  );
  const buyerPainPoint = cleanBrandName(
    typeof record.buyerPainPoint === "string" ? record.buyerPainPoint : "",
    "an awkward, cluttered, or inconvenient everyday setup",
  );
  const solutionAngle = cleanBrandName(
    typeof record.solutionAngle === "string" ? record.solutionAngle : "",
    "It gives that repeated daily moment a simpler, more considered solution.",
  );
  return {
    productName: normalizedProductName,
    targetAudience,
    buyerPainPoint,
    solutionAngle,
    title: cleanBrandName(
      typeof record.title === "string" ? record.title : "",
      `The simpler way to use your ${normalizedProductName}`,
    ),
    description: normalizeDescription(
      typeof record.description === "string" ? record.description : "",
      { productName: normalizedProductName, painPoint: buyerPainPoint, solutionAngle },
    ),
    hashtags: normalizeHashtags(record.hashtags),
    setting:
      typeof record.setting === "string" && record.setting.trim()
        ? record.setting.trim()
        : "One consistent everyday setting with natural UGC lighting.",
    continuity:
      typeof record.continuity === "string" && record.continuity.trim()
        ? record.continuity.trim()
        : "Keep the same person, product orientation, wardrobe, background, and light across all three 15-second sections.",
    visualStyle:
      typeof record.visualStyle === "string" && record.visualStyle.trim()
        ? record.visualStyle.trim()
        : "Authentic, energetic, minimal UGC product demonstration.",
    stages: finalStages,
  };
}

export async function analyzeStoryboardStory(input: {
  productSkuImageUrl: string;
  productViewImageUrls: string[];
  manufacturerReferenceImageUrls: string[];
}) {
  const fallback = normalizeStoryboardStoryPlan(
    {},
    "the product",
  );
  const message: OpenRouterMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: [
          "Analyze the product SKU, product front/side/back views, and manufacturer reference images for one continuous 45-second English UGC short film.",
          "Before writing any copy, identify the real target buyer, their repeated usage habit, the frustration or purchase hesitation they have, and the concrete product capability that resolves it. Base this analysis on visible product evidence and manufacturer copy.",
          "Create exactly 3 connected stages of 15 seconds each: opening, continuation, and closing.",
          "Use only verifiable product names, visible selling points, real scenes, and real use cases from the references.",
          "The second stage must continue the first stage's setting, action, and product state. The third stage must continue the second and close the story naturally.",
          "Generate one English title without CHUB TWO. Make it a scenario-led solution to the buyer's pain point, with a curiosity hook and a real product or long-tail use keyword; do not write a generic product label or keyword stack.",
          "Generate one natural English description without CHUB TWO, approximately 300 characters long (acceptable range 240-360 characters). Start from the buyer's real frustration and usage habit, then show how the product fits into a believable everyday moment and resolves that friction.",
          "Return exactly 5 relevant English hashtags as an array; they will be displayed on one horizontal line.",
          "Do not invent specifications, certifications, features, or scenes. Return JSON only with productName, targetAudience, buyerPainPoint, solutionAngle, title, description, hashtags, setting, continuity, visualStyle, and stages[].",
          'Each stages[] item must contain stage, sellingPoint:{title,description}, transitionFromPrevious, transitionToNext.',
        ].join("\n"),
      },
      ...imageParts([
        input.productSkuImageUrl,
        ...input.productViewImageUrls,
        ...input.manufacturerReferenceImageUrls,
      ]),
    ],
  };
  try {
    const result = await callOpenRouter<Record<string, unknown>>(
      [message],
      { type: "json_object" },
    );
    return normalizeStoryboardStoryPlan(result, fallback.productName);
  } catch (error) {
    console.warn("[ecommerce-assets/storyboards] Falling back to story plan:", error);
    return fallback;
  }
}

export async function analyzeStoryboardSellingPoints(input: {
  productSkuImageUrl: string;
  manufacturerReferenceImageUrls: string[];
}) {
  const story = await analyzeStoryboardStory({
    productSkuImageUrl: input.productSkuImageUrl,
    productViewImageUrls: [],
    manufacturerReferenceImageUrls: input.manufacturerReferenceImageUrls,
  });
  return story.stages.map((stage) => stage.sellingPoint);
}

export function buildStoryboardImagePrompt(input: {
  slot: EcommerceStoryboardSlot;
  storyPlan?: EcommerceStoryboardStoryPlan;
}) {
  const point = input.slot.sellingPoint;
  const story = input.storyPlan;
  return [
    "Create one finished 9:16 English product storyboard sheet for CHUB TWO.",
    "Use the first input image as the primary SKU reference and the second input image as the only person reference. The next product-view images, when provided, follow this order: front, side, back. They are authoritative appearance references: preserve the product's exact shape, proportions, controls, materials, colors, and construction. Use the remaining manufacturer reference image(s) as factual visual guidance for the actual scene, shot, product use, and visible details. Recreate a believable scene that matches those references; do not invent a different use case.",
    `This storyboard focuses on exactly one selling point: ${point.title}. ${point.description}`,
    story
      ? `Story stage: ${input.slot.stage || "opening"}. Shared setting: ${story.setting}. Shared continuity rule: ${story.continuity}. Visual style: ${story.visualStyle}. Transition from previous stage: ${input.slot.transitionFromPrevious || "Begin naturally."} Transition to next stage: ${input.slot.transitionToNext || "Continue the same action."}`
      : "Keep this storyboard visually compatible with the other two 15-second stages.",
    "Use a consistent professional storyboard layout: white background, thick black grid lines, six numbered rows, and five aligned columns.",
    "Column 1: circled shot number. Column 2: a believable visual frame illustration. Column 3: English Scene / Shot description. Column 4: English Camera / Movement description. Column 5: English Sound / Music / Voice-over description. Make the audio direction lively and natural: authentic human speech, energetic conversational delivery, realistic product handling sounds, and an upbeat but restrained music bed.",
    "In every spoken line, voice-over, dialogue, and Sound / Voice-over cell, refer to the product only by its verified product name or a natural generic product name from the manufacturer references. Never say or write the store name CHUB TWO in any dialogue or voice-over.",
    "Add a black footer bar with the English title, Duration: 15 seconds, Format: 9:16, Style: premium realistic product creator, and concise production notes.",
    "Keep the layout, typography hierarchy, grid, lighting language, person identity, and product identity consistent across all three storyboard sheets.",
    "English only. Do not add a logo, other SKU, manufacturer image, extra person, unsupported claim, or decorative clutter.",
  ].join("\n");
}

export function buildStoryboardVideoPrompt(input: {
  slot: EcommerceStoryboardSlot;
  storyPlan?: EcommerceStoryboardStoryPlan;
}) {
  const story = input.storyPlan;
  return [
    "Create a 15-second vertical 9:16 authentic UGC product video in English for CHUB TWO.",
    "Use reference image 1 as the storyboard structure, reference image 2 as the exact first SKU product, the following product-view references in front/side/back order as authoritative appearance references, and the final person reference as the fixed person. Keep the same person and product consistent throughout. Preserve the product's exact shape, proportions, controls, materials, colors, and construction from the SKU and product-view references.",
    `Focus only on this selling point: ${input.slot.sellingPoint.title}. ${input.slot.sellingPoint.description}`,
    story
      ? `This is the ${input.slot.stage || "opening"} section of one 45-second UGC story. Shared setting: ${story.setting}. Shared continuity rule: ${story.continuity}. Visual style: ${story.visualStyle}. Transition from previous section: ${input.slot.transitionFromPrevious || "Begin naturally."} Transition to next section: ${input.slot.transitionToNext || "Continue the same action."}`
      : "Keep this 15-second video visually compatible with the other two sections.",
    "Animate the six storyboard beats as a coherent sequence: lively product introduction, tactile close-up interaction, clear product use, one satisfying detail moment, a confident hero display, and a natural closing beat.",
    "Use an authentic person with energetic conversational delivery, natural human voice-over, realistic product handling sounds, light ambient sound, and upbeat but restrained music. The creator should sound like a real person speaking directly to viewers, with clear spontaneous delivery and human energy. Keep the product visually dominant.",
    "All spoken lines must use the verified product name or a natural generic product name, never the store name CHUB TWO. Do not mention the store name in dialogue, voice-over, or captions.",
    "English only. Do not add other products, other people, logos, unsupported text, pets, or unrelated props.",
  ].join("\n");
}

export function buildStoryboardCoverPrompt(input: {
  storyPlan: EcommerceStoryboardStoryPlan;
}) {
  return [
    "Create one finished 9:16 English short-video cover image for an authentic UGC product video.",
    "Use the provided product and person references to create a realistic, premium but natural UGC frame. Use an Apple-inspired minimalist art direction: pure white background, crisp black typography, precise spacing, restrained visual hierarchy, and no decorative styling.",
    "Make every permitted element large and visually decisive. The single title must be an oversized black headline that fills most of the upper half of the frame, using strong readable type, tight composition, and line breaks that use the available width. Do not shrink the title into a small caption.",
    "Make the person and the single product large in the lower half, with the product clearly readable and occupying substantial frame area. Fill the 9:16 canvas with the title, person, and product; leave only intentional minimal margins and no obvious empty space.",
    `Render exactly this short-video title as the only new text, large and prominent: ${input.storyPlan.title}`,
    "Do not render CHUB TWO, a store name, manufacturer logo, watermark, specification wall, extra product, decorative cards, or unrelated props.",
    "Use English only, 9:16 vertical composition, strong click appeal, concise typography, natural human energy, and accurate product appearance.",
  ].join("\n");
}
