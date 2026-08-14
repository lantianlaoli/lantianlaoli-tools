import type { EcommerceCarouselRole, EcommerceHistoryRecord } from "./types";

export const ECOMMERCE_HISTORY_STORAGE_KEY = "chub-two-ecommerce-history";
export const ECOMMERCE_HISTORY_LIMIT = 30;

export function normalizeEcommerceHistory(value: unknown): EcommerceHistoryRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is EcommerceHistoryRecord => Boolean(item && typeof item === "object"))
    .map((record) => {
      const source = record.source as unknown as {
        skuImageUrls?: string[];
        productViewImageUrls?: string[];
        manufacturerReferenceImageUrls?: Partial<
          Record<EcommerceCarouselRole, string[]>
        >;
      } | undefined;
      return {
        ...record,
        source: {
          skuImageUrls: source?.skuImageUrls || [],
          productViewImageUrls: source?.productViewImageUrls || [],
          manufacturerReferenceImageUrls: {
            ...(source?.manufacturerReferenceImageUrls || {}),
            main: source?.manufacturerReferenceImageUrls?.main || [],
            scene: source?.manufacturerReferenceImageUrls?.scene || [],
            detail: source?.manufacturerReferenceImageUrls?.detail || [],
            variant: source?.manufacturerReferenceImageUrls?.variant || [],
          },
        },
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, ECOMMERCE_HISTORY_LIMIT);
}

export function saveEcommerceHistory(records: EcommerceHistoryRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ECOMMERCE_HISTORY_STORAGE_KEY,
      JSON.stringify(records.slice(0, ECOMMERCE_HISTORY_LIMIT)),
    );
  } catch {
    // History is supplemental; a full or unavailable browser store must not
    // interrupt generation results.
  }
}
