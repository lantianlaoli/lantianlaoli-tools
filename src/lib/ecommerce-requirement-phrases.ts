export const REQUIREMENT_PHRASES_STORAGE_KEY = "lantian-tools:ecommerce-requirement-phrases";
export const LEGACY_REQUIREMENT_PHRASES_STORAGE_KEY = "rivora:ecommerce-requirement-phrases";

const LEGACY_CAROUSEL_NO_TEXT_PHRASE = "轮播图不要出现产品本身之外的文字、引导说明、箭头或标签";
const SPLIT_CAROUSEL_NO_TEXT_PHRASES = [
  "轮播图不要出现产品本身之外的文字",
  "轮播图不要出现引导说明、箭头或标签",
];

export const DEFAULT_REQUIREMENT_PHRASES = [
  ...SPLIT_CAROUSEL_NO_TEXT_PHRASES,
  "画面保持极简高级，减少装饰元素",
  "不要出现价格、促销角标、二维码、水印",
  "突出产品真实材质和细节，不改变产品外观",
  "视频里尽量少文字，只保留必要中文卖点",
];

type ParsedRequirementPhrases = {
  phrases: string[];
  shouldPersist: boolean;
};

function cleanPhrase(value: string) {
  return value.trim();
}

function normalizePhraseList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const phrase = cleanPhrase(item);
    if (!phrase) continue;
    const phrases = phrase === LEGACY_CAROUSEL_NO_TEXT_PHRASE ? SPLIT_CAROUSEL_NO_TEXT_PHRASES : [phrase];
    for (const nextPhrase of phrases) {
      if (seen.has(nextPhrase)) continue;
      seen.add(nextPhrase);
      normalized.push(nextPhrase);
    }
  }

  return normalized;
}

function hasLegacyPhrase(value: unknown) {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && cleanPhrase(item) === LEGACY_CAROUSEL_NO_TEXT_PHRASE);
}

export function parseStoredRequirementPhrases(raw: string | null): ParsedRequirementPhrases {
  if (!raw) {
    return { phrases: DEFAULT_REQUIREMENT_PHRASES, shouldPersist: true };
  }

  try {
    const stored = JSON.parse(raw);
    const parsed = normalizePhraseList(stored);
    if (!parsed.length) {
      return { phrases: DEFAULT_REQUIREMENT_PHRASES, shouldPersist: true };
    }
    return { phrases: parsed, shouldPersist: hasLegacyPhrase(stored) };
  } catch {
    return { phrases: DEFAULT_REQUIREMENT_PHRASES, shouldPersist: true };
  }
}

export function readStoredRequirementPhrases(storage: Storage): ParsedRequirementPhrases {
  const current = storage.getItem(REQUIREMENT_PHRASES_STORAGE_KEY);
  if (current) return parseStoredRequirementPhrases(current);

  const legacy = storage.getItem(LEGACY_REQUIREMENT_PHRASES_STORAGE_KEY);
  if (legacy) {
    storage.setItem(REQUIREMENT_PHRASES_STORAGE_KEY, legacy);
    return parseStoredRequirementPhrases(legacy);
  }

  return parseStoredRequirementPhrases(null);
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
