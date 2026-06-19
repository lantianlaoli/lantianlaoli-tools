import { callOpenRouter } from "./openrouter";
import type {
  SocialCoverAspectRatio,
  SocialCoverJob,
  SocialCoverLanguage,
  SocialCoverOptions,
  SocialCoverSlot,
  SocialCoverStylePreset,
  SocialCoverTitleSet,
} from "./types";

export const SOCIAL_COVER_STYLE_PRESETS_STORAGE_KEY = "lantian-tools:social-cover-style-presets";

export const DEFAULT_SOCIAL_COVER_STYLE_PRESETS: SocialCoverStylePreset[] = [
  {
    id: "editorial-clean",
    name: "Editorial Clean",
    prompt:
      "Premium editorial social cover, confident portrait-led composition, clean product callout, crisp typography, generous whitespace, modern magazine layout, high-end lighting.",
  },
  {
    id: "bold-launch",
    name: "Bold Launch",
    prompt:
      "High-impact launch cover with oversized headline, strong contrast, dynamic crop, product/logo as a clear secondary hero, sharp shadows, energetic but uncluttered.",
  },
  {
    id: "minimal-tech",
    name: "Minimal Tech",
    prompt:
      "Minimal tech-founder cover, refined dark neutral background, precise grid layout, subtle lime accent, product/logo integrated as a polished brand signal.",
  },
];

function normalizeSocialCoverStylePresets(value: unknown): SocialCoverStylePreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const presets: SocialCoverStylePreset[] = [];
  for (const item of value) {
    if (
      typeof item?.id !== "string"
      || typeof item?.name !== "string"
      || typeof item?.prompt !== "string"
    ) {
      continue;
    }
    const id = item.id.trim();
    const name = item.name.trim();
    const prompt = item.prompt.trim();
    if (!id || !name || !prompt || seen.has(id)) continue;
    seen.add(id);
    presets.push({ id, name, prompt });
  }
  return presets;
}

export function readStoredSocialCoverStylePresets(storage: Storage): SocialCoverStylePreset[] {
  const raw = storage.getItem(SOCIAL_COVER_STYLE_PRESETS_STORAGE_KEY);
  if (!raw) return DEFAULT_SOCIAL_COVER_STYLE_PRESETS;

  try {
    const presets = normalizeSocialCoverStylePresets(JSON.parse(raw));
    return presets.length ? presets : DEFAULT_SOCIAL_COVER_STYLE_PRESETS;
  } catch {
    return DEFAULT_SOCIAL_COVER_STYLE_PRESETS;
  }
}

export function writeStoredSocialCoverStylePresets(storage: Storage, presets: SocialCoverStylePreset[]): void {
  const normalized = normalizeSocialCoverStylePresets(presets);
  storage.setItem(
    SOCIAL_COVER_STYLE_PRESETS_STORAGE_KEY,
    JSON.stringify(normalized.length ? normalized : DEFAULT_SOCIAL_COVER_STYLE_PRESETS)
  );
}

const SOCIAL_COVER_LANGUAGES: SocialCoverLanguage[] = ["zh", "en"];
export const SOCIAL_COVER_ASPECT_RATIOS: SocialCoverAspectRatio[] = ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"];
const DEFAULT_SOCIAL_COVER_ASPECT_RATIOS: SocialCoverAspectRatio[] = ["4:3", "3:4"];

const SOCIAL_COVER_RATIO_FILE_CODES: Record<SocialCoverAspectRatio, string> = {
  auto: "auto",
  "1:1": "11",
  "4:3": "43",
  "3:4": "34",
  "16:9": "169",
  "9:16": "916",
};

const SOCIAL_COVER_LANGUAGE_FILE_CODES: Record<SocialCoverLanguage, string> = {
  zh: "cn",
  en: "en",
};

function titleSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "cover";
}

function dateCode(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "date";
  return `${date.getMonth() + 1}${date.getDate()}`;
}

export function buildSocialCoverFileBaseName(job: Pick<SocialCoverJob, "sourceTitle" | "createdAt">, slot: Pick<SocialCoverSlot, "aspectRatio" | "language">) {
  return [
    titleSlug(job.sourceTitle),
    SOCIAL_COVER_RATIO_FILE_CODES[slot.aspectRatio],
    SOCIAL_COVER_LANGUAGE_FILE_CODES[slot.language],
    dateCode(job.createdAt),
  ].join("-");
}

export function buildSocialCoverFileNameMap(job: Pick<SocialCoverJob, "sourceTitle" | "createdAt" | "slots">) {
  const seen = new Map<string, number>();
  const entries = job.slots.map((slot) => {
    const baseName = buildSocialCoverFileBaseName(job, slot);
    const count = (seen.get(baseName) ?? 0) + 1;
    seen.set(baseName, count);
    return [slot.id, count === 1 ? baseName : `${baseName}-${count}`] as const;
  });
  return Object.fromEntries(entries) as Record<string, string>;
}

function uniqueOrdered<T extends string>(values: unknown, allowed: readonly T[], fallback: T[]) {
  if (!Array.isArray(values)) return fallback;
  const selected = allowed.filter((item) => values.includes(item));
  return selected.length ? selected : fallback;
}

export function normalizeSocialCoverOptions(input: {
  languages?: unknown;
  aspectRatiosByLanguage?: unknown;
  aspectRatios?: unknown;
  variantsPerGroup?: unknown;
  resolution?: unknown;
}): SocialCoverOptions {
  const languages = uniqueOrdered(input.languages, SOCIAL_COVER_LANGUAGES, SOCIAL_COVER_LANGUAGES);
  const legacyAspectRatios = uniqueOrdered(input.aspectRatios, SOCIAL_COVER_ASPECT_RATIOS, DEFAULT_SOCIAL_COVER_ASPECT_RATIOS);
  const rawAspectRatiosByLanguage = input.aspectRatiosByLanguage && typeof input.aspectRatiosByLanguage === "object"
    ? input.aspectRatiosByLanguage as Partial<Record<SocialCoverLanguage, unknown>>
    : {};
  const aspectRatiosByLanguage = {
    zh: uniqueOrdered(rawAspectRatiosByLanguage.zh, SOCIAL_COVER_ASPECT_RATIOS, legacyAspectRatios),
    en: uniqueOrdered(rawAspectRatiosByLanguage.en, SOCIAL_COVER_ASPECT_RATIOS, legacyAspectRatios),
  };

  return {
    languages,
    aspectRatiosByLanguage,
    aspectRatios: legacyAspectRatios,
    variantsPerGroup: 1,
    resolution: "1K",
  };
}

function looksChinese(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function fallbackTitleSet(title: string): SocialCoverTitleSet {
  return {
    zh: title,
    en: title,
  };
}

function normalizeTitleSet(value: Partial<SocialCoverTitleSet> | null, sourceTitle: string): SocialCoverTitleSet {
  return {
    zh: value?.zh?.trim() || sourceTitle,
    en: value?.en?.trim() || sourceTitle,
  };
}

export async function buildSocialCoverTitleSet(sourceTitle: string): Promise<{
  titles: SocialCoverTitleSet;
  fallback: boolean;
}> {
  const title = sourceTitle.trim();
  if (!title) return { titles: fallbackTitleSet(""), fallback: true };

  try {
    const response = await callOpenRouter<Partial<SocialCoverTitleSet>>(
      [
        {
          role: "user",
          content: [
            "Rewrite this social media cover title into Simplified Chinese and concise English.",
            "Return ONLY a JSON object with keys zh and en. No markdown, no explanation.",
            "Keep the title short, punchy, readable on a thumbnail, and faithful to the source.",
            looksChinese(title)
              ? "The source title is likely Chinese; create a natural English version."
              : "The source title is likely English or another language; create a natural Simplified Chinese version.",
            `Source title: ${title}`,
          ].join("\n"),
        },
      ],
      { type: "json_object" }
    );
    return { titles: normalizeTitleSet(response, title), fallback: false };
  } catch (error) {
    console.error("[social-cover-generator] Falling back after title translation failed:", error instanceof Error ? error.message : error);
    return { titles: fallbackTitleSet(title), fallback: true };
  }
}

function languageInstruction(language: SocialCoverLanguage) {
  if (language === "zh") {
    return [
      "All newly generated visible cover text MUST be Simplified Chinese.",
      "Use the provided Chinese title exactly as the main headline unless spelling cleanup is needed.",
      "Do not add English headings, English taglines, fake UI text, random letters, lorem ipsum, QR codes, watermarks, prices, or fake certification marks.",
      "Existing text inside the uploaded product/logo reference may remain if it is part of the original mark.",
    ].join(" ");
  }
  return [
    "All newly generated visible cover text MUST be English.",
    "Use the provided English title exactly as the main headline unless spelling cleanup is needed.",
    "Do not add Chinese headings, random letters, lorem ipsum, QR codes, watermarks, prices, or fake certification marks.",
    "Existing text inside the uploaded product/logo reference may remain if it is part of the original mark.",
  ].join(" ");
}

function aspectInstruction(aspectRatio: SocialCoverAspectRatio) {
  const instructions: Record<SocialCoverAspectRatio, string> = {
    auto: "Canvas/aspect ratio: auto. Let the model choose the most natural cover composition while keeping generous safe margins for title text.",
    "1:1": "Canvas/aspect ratio: 1:1 square social cover. Use a balanced thumbnail composition with strong center hierarchy.",
    "4:3": "Canvas/aspect ratio: 4:3 horizontal social cover. Use a wide composition with the person and title balanced across the frame.",
    "3:4": "Canvas/aspect ratio: 3:4 vertical social cover. Use a tall composition with clear top-to-bottom hierarchy and safe margins.",
    "16:9": "Canvas/aspect ratio: 16:9 wide social cover. Use cinematic horizontal framing with large readable title text.",
    "9:16": "Canvas/aspect ratio: 9:16 vertical social cover. Use mobile-first vertical framing with the title and face clearly visible.",
  };
  return instructions[aspectRatio];
}

function defaultStyle(language: SocialCoverLanguage) {
  return language === "zh"
    ? "高级社媒封面，人物为主角，产品或Logo作为清晰辅助视觉，标题醒目但不拥挤，商业感强，适合小红书、视频封面和课程封面。"
    : "Premium social media cover, person-led hero composition, product or logo as a clear supporting brand signal, bold readable headline, polished commercial look.";
}

export function buildSocialCoverPrompt(input: {
  language: SocialCoverLanguage;
  aspectRatio: SocialCoverAspectRatio;
  variantIndex: number;
  title: string;
  sourceTitle: string;
  styleGuide?: string;
}) {
  const style = input.styleGuide?.trim() || defaultStyle(input.language);
  return [
    "Create one finished social media cover image using image-to-image mode.",
    "Reference image order: image 1 is the real person/portrait reference; image 2 is the product, object, logo, or brand mark reference.",
    "Preserve the person's recognizable identity, face structure, expression, hairstyle, skin tone, and clothing cues from image 1. Keep the person attractive, realistic, and not over-retouched.",
    "Preserve the product/logo/object identity, shape, colors, packaging, mark, typography, and recognizable details from image 2. If image 2 is a logo or mark, integrate it cleanly as a brand element; if it is a product/object, show it as a secondary hero.",
    aspectInstruction(input.aspectRatio),
    `Variant number: ${input.variantIndex}. Create a meaningfully different layout from other variants while keeping the same campaign identity.`,
    `Main headline/title: ${input.title}.`,
    `Original user title: ${input.sourceTitle}.`,
    `Style guidance (MUST follow): ${style}`,
    languageInstruction(input.language),
    "The final cover must look like a complete designed thumbnail: strong hierarchy, readable large title, intentional spacing, clean background, realistic lighting, no messy text, no duplicated faces, no distorted hands, no irrelevant props.",
  ].join("\n");
}

export function buildSocialCoverSlots(input: {
  options: SocialCoverOptions;
  titles: SocialCoverTitleSet;
  sourceTitle: string;
  styleGuide?: string;
  taskIds: string[];
}): SocialCoverSlot[] {
  const slots: SocialCoverSlot[] = [];
  let taskIndex = 0;
  for (const language of input.options.languages) {
    for (const aspectRatio of input.options.aspectRatiosByLanguage[language]) {
      for (let variantIndex = 1; variantIndex <= input.options.variantsPerGroup; variantIndex += 1) {
        const prompt = buildSocialCoverPrompt({
          language,
          aspectRatio,
          variantIndex,
          title: input.titles[language],
          sourceTitle: input.sourceTitle,
          styleGuide: input.styleGuide,
        });
        slots.push({
          id: `cover-${language}-${aspectRatio}-${variantIndex}`,
          language,
          aspectRatio,
          variantIndex,
          title: input.titles[language],
          taskId: input.taskIds[taskIndex] ?? "",
          status: "waiting",
          prompt,
        });
        taskIndex += 1;
      }
    }
  }
  return slots;
}
