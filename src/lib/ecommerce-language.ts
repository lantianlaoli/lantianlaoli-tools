import type { EcommerceTextLanguage } from "./types";

export const ECOMMERCE_LANGUAGE_STORAGE_KEY = "rivora:ecommerce-text-language";

export function normalizeEcommerceTextLanguage(value: unknown): EcommerceTextLanguage {
  return value === "zh" ? "zh" : "en";
}
