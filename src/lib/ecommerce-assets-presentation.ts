import type { EcommerceAssetsJob } from "./types";

export function getEcommerceCarouselProgress(job: EcommerceAssetsJob | null) {
  const slots = job?.carouselImages ?? [];
  return { completed: slots.filter((slot) => slot.status === "success").length, total: slots.length || 9 };
}
