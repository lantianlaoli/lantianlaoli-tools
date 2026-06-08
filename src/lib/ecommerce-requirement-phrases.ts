import type { EcommerceTextLanguage } from "./types";

export const REQUIREMENT_PHRASES_STORAGE_KEY = "lantian-tools:ecommerce-requirement-phrases";
export const LEGACY_REQUIREMENT_PHRASES_STORAGE_KEY = "rivora:ecommerce-requirement-phrases";

function storageKeyFor(lang: EcommerceTextLanguage) {
  return `${REQUIREMENT_PHRASES_STORAGE_KEY}:${lang}`;
}

const ZH_LEGACY_CAROUSEL_NO_TEXT_PHRASE = "轮播图不要出现产品本身之外的文字、引导说明、箭头或标签";
const ZH_SPLIT_CAROUSEL_NO_TEXT_PHRASES = [
  "轮播图不要出现产品本身之外的文字",
  "轮播图不要出现引导说明、箭头或标签",
];

const EN_LEGACY_CAROUSEL_NO_TEXT_PHRASE = "Carousel images must not include text, calls-to-action, arrows, or labels beyond the product itself";
const EN_SPLIT_CAROUSEL_NO_TEXT_PHRASES = [
  "Carousel images must not include text beyond the product itself",
  "Carousel images must not include calls-to-action, arrows, or labels",
];

const LEGACY_CAROUSEL_NO_TEXT_BY_LANG: Record<EcommerceTextLanguage, { legacy: string; split: string[] }> = {
  zh: { legacy: ZH_LEGACY_CAROUSEL_NO_TEXT_PHRASE, split: ZH_SPLIT_CAROUSEL_NO_TEXT_PHRASES },
  en: { legacy: EN_LEGACY_CAROUSEL_NO_TEXT_PHRASE, split: EN_SPLIT_CAROUSEL_NO_TEXT_PHRASES },
};

const DEFAULT_REQUIREMENT_PHRASES_BY_LANG: Record<EcommerceTextLanguage, string[]> = {
  zh: [
    "Apple 极简白底黑字风格：白底、大留白、产品全身或细节特写；只保留最重要的信息，文案压缩成一句短句；文字特别大，左右或上下结构，避免参数堆叠。",
  ],
  en: [
    "Apple-style minimal white background with bold black type: white canvas, generous whitespace, full-product or detail hero shot; keep only one short headline, oversized type, side-by-side or stacked layout, no spec walls.",
  ],
};

export function getDefaultRequirementPhrases(lang: EcommerceTextLanguage): string[] {
  return [...DEFAULT_REQUIREMENT_PHRASES_BY_LANG[lang]];
}

type ParsedRequirementPhrases = {
  phrases: string[];
  shouldPersist: boolean;
};

function cleanPhrase(value: string) {
  return value.trim();
}

function normalizePhraseList(value: unknown, lang: EcommerceTextLanguage): string[] {
  if (!Array.isArray(value)) return [];
  const { legacy, split } = LEGACY_CAROUSEL_NO_TEXT_BY_LANG[lang];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const phrase = cleanPhrase(item);
    if (!phrase) continue;
    const phrases = phrase === legacy ? split : [phrase];
    for (const nextPhrase of phrases) {
      if (seen.has(nextPhrase)) continue;
      seen.add(nextPhrase);
      normalized.push(nextPhrase);
    }
  }

  return normalized;
}

function hasLegacyPhrase(value: unknown, lang: EcommerceTextLanguage) {
  const { legacy } = LEGACY_CAROUSEL_NO_TEXT_BY_LANG[lang];
  return Array.isArray(value) && value.some((item) => typeof item === "string" && cleanPhrase(item) === legacy);
}

export function parseStoredRequirementPhrases(raw: string | null, lang: EcommerceTextLanguage): ParsedRequirementPhrases {
  if (!raw) {
    return { phrases: getDefaultRequirementPhrases(lang), shouldPersist: true };
  }

  try {
    const stored = JSON.parse(raw);
    const parsed = normalizePhraseList(stored, lang);
    if (!parsed.length) {
      return { phrases: getDefaultRequirementPhrases(lang), shouldPersist: true };
    }
    return { phrases: parsed, shouldPersist: hasLegacyPhrase(stored, lang) };
  } catch {
    return { phrases: getDefaultRequirementPhrases(lang), shouldPersist: true };
  }
}

export function readStoredRequirementPhrases(storage: Storage, lang: EcommerceTextLanguage): ParsedRequirementPhrases {
  const keyed = storage.getItem(storageKeyFor(lang));
  if (keyed) return parseStoredRequirementPhrases(keyed, lang);

  // Migration: a previous version stored a single shared list under the
  // un-suffixed key. Claim it for the current language and clear the legacy
  // slot so it isn't re-imported into a different language later.
  const shared = storage.getItem(REQUIREMENT_PHRASES_STORAGE_KEY);
  if (shared) {
    const parsed = parseStoredRequirementPhrases(shared, lang);
    storage.setItem(storageKeyFor(lang), JSON.stringify(parsed.phrases));
    storage.removeItem(REQUIREMENT_PHRASES_STORAGE_KEY);
    return { ...parsed, shouldPersist: parsed.shouldPersist || true };
  }

  const legacyRivora = storage.getItem(LEGACY_REQUIREMENT_PHRASES_STORAGE_KEY);
  if (legacyRivora) {
    const parsed = parseStoredRequirementPhrases(legacyRivora, lang);
    storage.setItem(storageKeyFor(lang), JSON.stringify(parsed.phrases));
    storage.removeItem(LEGACY_REQUIREMENT_PHRASES_STORAGE_KEY);
    return { ...parsed, shouldPersist: parsed.shouldPersist || true };
  }

  return parseStoredRequirementPhrases(null, lang);
}

export function writeStoredRequirementPhrases(storage: Storage, lang: EcommerceTextLanguage, phrases: string[]): void {
  storage.setItem(storageKeyFor(lang), JSON.stringify(phrases));
}

export function appendRequirementPhrase(current: string, phrase: string) {
  const nextPhrase = cleanPhrase(phrase);
  if (!nextPhrase) return current;
  const currentValue = current.trimEnd();
  return currentValue ? `${currentValue}\n${nextPhrase}` : nextPhrase;
}

export function addRequirementPhrase(phrases: string[], phrase: string) {
  const nextPhrase = cleanPhrase(phrase);
  if (!nextPhrase || phrases.includes(nextPhrase)) return phrases;
  return [...phrases, nextPhrase];
}

export function updateRequirementPhrase(phrases: string[], index: number, phrase: string) {
  const nextPhrase = cleanPhrase(phrase);
  if (!nextPhrase) return phrases;
  if (phrases.some((item, itemIndex) => itemIndex !== index && item === nextPhrase)) return phrases;
  return phrases.map((item, itemIndex) => (itemIndex === index ? nextPhrase : item));
}

export function deleteRequirementPhrase(phrases: string[], index: number) {
  return phrases.filter((_, itemIndex) => itemIndex !== index);
}

