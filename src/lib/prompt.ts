import type { ParsedWorkbook, ParsedWorkbookRow } from "./types";

export function buildGenerationPrompt(workbook: ParsedWorkbook, row: ParsedWorkbookRow) {
  const title = workbook.product.title || "Product";
  const description = workbook.product.description || "No product description provided.";
  const visibleText = row.copyText || "No visible text requested.";
  const style = row.style || "Follow the row requirement and reference photos.";

  return [
    "Create one polished commercial product image in English.",
    "",
    "Product context:",
    `- Product title: ${title}`,
    `- Product description: ${description}`,
    "",
    "Reference image roles:",
    "- The first product photos show the user's actual product. Preserve the product identity, proportions, material, colors, recognizable details, and functional structure.",
    "- The competitor/reference photos show composition, angle, scene, lighting, or visual effects to borrow. Do not copy competitor branding or turn the user's product into the competitor product.",
    "",
    "Current row requirement:",
    row.requirement || "Use the references to create a clear product marketing image.",
    "",
    "Required visible title/text in the image:",
    visibleText,
    "",
    "Style direction:",
    style,
    "",
    "Language and text rules:",
    "- Default all visible text in the generated image to English only.",
    "- Translate Chinese marketing copy into concise natural English unless the row explicitly asks to preserve non-English text.",
    "- Keep on-image text short, readable, correctly spelled, and integrated into the layout.",
    "- Use only English-language fonts in the generated image.",
    "- Use a single consistent font family across all text elements in every generated image.",
    "",
    "Representation rules:",
    "- All human figures, characters, and people in the generated image must be Caucasian/European with Western features.",
    "- Do not include any East Asian, Asian, African, or other non-European demographic representation in people.",
    "- This applies to models, hand models, lifestyle subjects, and any human figures.",
    "",
    "Output requirements:",
    `- Canvas/aspect ratio target: ${row.aspectRatio}.`,
    `- Requested output quality/resolution tier: ${row.resolution}.`,
    "- Make the product the clear hero.",
    "- Produce a finished advertising image, not a collage of references.",
  ].join("\n");
}
