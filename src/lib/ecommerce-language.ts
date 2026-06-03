import type { EcommerceTextLanguage } from "./types";

export const ECOMMERCE_LANGUAGE_STORAGE_KEY = "lantian-tools:ecommerce-text-language";
export const LEGACY_ECOMMERCE_LANGUAGE_STORAGE_KEY = "rivora:ecommerce-text-language";

export const LANTIAN_TOOLS_LANGUAGE_CHANGE_EVENT = "lantian-tools-language-change";

export function normalizeEcommerceTextLanguage(value: unknown): EcommerceTextLanguage {
  return value === "zh" ? "zh" : "en";
}

export function readStoredEcommerceTextLanguage(storage: Storage): EcommerceTextLanguage {
  const current = storage.getItem(ECOMMERCE_LANGUAGE_STORAGE_KEY);
  if (current) return normalizeEcommerceTextLanguage(current);

  const legacy = storage.getItem(LEGACY_ECOMMERCE_LANGUAGE_STORAGE_KEY);
  if (legacy) {
    storage.setItem(ECOMMERCE_LANGUAGE_STORAGE_KEY, legacy);
    return normalizeEcommerceTextLanguage(legacy);
  }

  return "zh";
}
