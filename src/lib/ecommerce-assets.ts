import { callOpenRouter } from "./openrouter";
import type {
  EcommerceCreativeBrief,
  EcommerceImageSlot,
  EcommerceManufacturerPromoAnalysis,
  EcommerceTextLanguage,
} from "./types";

type PromptSlot = Pick<EcommerceImageSlot, "kind" | "index" | "title" | "prompt">;

function languageInstruction(textLanguage: EcommerceTextLanguage) {
  if (textLanguage === "zh") {
    return [
      "使用简洁中文可见文案。文字必须少、短、易读，不要大段说明，不要中英混排。",
      "所有新增或叠加的可见文字必须是简体中文，包括标题、标签、卖点、对比文案、说明、口号和装饰性小字。",
      "不要生成英文营销文案，例如 English headings, labels, slogans, captions, comparison labels, or lifestyle taglines.",
      "产品照片中原本存在的英文 logo、印花或包装文字可以保留；不要把它当作新增营销文案翻译或替换。",
    ].join(" ");
  }
  return "Use concise English text only. Keep visible text minimal, short, readable, and accurately spelled. Preserve any original product logo, print, or packaging text from the reference photo.";
}

function sellingPointText(brief: EcommerceCreativeBrief) {
  return brief.sellingPoints.filter(Boolean).slice(0, 5).join("; ") || "clean product presentation";
}

export function fallbackEcommerceBrief(textLanguage: EcommerceTextLanguage): EcommerceCreativeBrief {
  return {
    productCategory: textLanguage === "zh" ? "电商产品" : "ecommerce product",
    productIdentity:
      textLanguage === "zh"
        ? "用户上传照片中的真实产品，保持外观、比例、材质、颜色和可识别细节"
        : "the real product from the uploaded photo, preserving appearance, proportions, materials, colors, and recognizable details",
    materialsAndColors: textLanguage === "zh" ? "根据产品照片判断" : "infer from the product photo",
    sellingPoints:
      textLanguage === "zh"
        ? ["真实产品外观", "干净高级视觉", "突出核心卖点"]
        : ["true product appearance", "clean premium visuals", "clear selling points"],
    designLanguage:
      textLanguage === "zh"
        ? "干净、高级、留白充足的电商视觉，少文字，统一字体和柔和光影"
        : "clean premium ecommerce visuals with generous whitespace, minimal text, one font family, and soft studio lighting",
    carouselDirection:
      textLanguage === "zh"
        ? "统一风格的 1:1 轮播图，先白底主图，再展示场景和卖点"
        : "consistent 1:1 carousel images: white-background main image first, then hero and benefit visuals",
    detailDirection:
      textLanguage === "zh"
        ? "统一风格的 1:1 详情图，展示卖点、材质、使用场景和信任感"
        : "consistent 1:1 detail images showing benefits, materials, use cases, and trust cues",
    videoDirection:
      textLanguage === "zh"
        ? "15 秒 1:1 电商广告短片，产品展示、细节、卖点和最终英雄镜头"
        : "15-second 1:1 ecommerce ad with product reveal, macro details, benefits, and final hero shot",
  };
}

function normalizeBrief(value: Partial<EcommerceCreativeBrief> | null, textLanguage: EcommerceTextLanguage): EcommerceCreativeBrief {
  const fallback = fallbackEcommerceBrief(textLanguage);
  return {
    productCategory: value?.productCategory || fallback.productCategory,
    productIdentity: value?.productIdentity || fallback.productIdentity,
    materialsAndColors: value?.materialsAndColors || fallback.materialsAndColors,
    sellingPoints: Array.isArray(value?.sellingPoints) && value.sellingPoints.length ? value.sellingPoints : fallback.sellingPoints,
    designLanguage: value?.designLanguage || fallback.designLanguage,
    carouselDirection: value?.carouselDirection || fallback.carouselDirection,
    detailDirection: value?.detailDirection || fallback.detailDirection,
    videoDirection: value?.videoDirection || fallback.videoDirection,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function normalizeManufacturerPromoAnalysis(value: Partial<EcommerceManufacturerPromoAnalysis> | null): EcommerceManufacturerPromoAnalysis {
  const hierarchy = (value?.visualHierarchy ?? {}) as Partial<EcommerceManufacturerPromoAnalysis["visualHierarchy"]>;
  return {
    productSubject: value?.productSubject || "the product shown in the manufacturer promotional image",
    visualHierarchy: {
      primaryText: hierarchy.primaryText || "",
      secondaryText: stringArray(hierarchy.secondaryText),
      specs: stringArray(hierarchy.specs),
      badges: stringArray(hierarchy.badges),
      logoText: stringArray(hierarchy.logoText),
      decorativeText: stringArray(hierarchy.decorativeText),
      layout: hierarchy.layout || "infer from the source image",
    },
    productVisuals: value?.productVisuals || "infer product shape, materials, color, and visible details from the source image",
    keyMessages: stringArray(value?.keyMessages),
    rewriteGuidance: value?.rewriteGuidance || "preserve the product and redesign the promotional image according to the user's requirements",
  };
}

export async function analyzeProductForEcommerceAssets(
  productImageUrls: string[],
  textLanguage: EcommerceTextLanguage,
  customRequirements?: string
): Promise<EcommerceCreativeBrief> {
  const viewLabels = ["front view", "side view", "back view"];
  const imageContent = productImageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));
  const imageDescriptions = productImageUrls.map((_, i) => viewLabels[i] ?? `photo ${i + 1}`).join(", ");

  const response = await callOpenRouter<Partial<EcommerceCreativeBrief>>(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Analyze the uploaded product photos for an ecommerce image and video asset generator.",
              `The user provided ${productImageUrls.length} product photo(s): ${imageDescriptions}.`,
              "Return ONLY a JSON object (no markdown, no explanation) with these fields:",
              "productCategory, productIdentity, materialsAndColors, sellingPoints, designLanguage, carouselDirection, detailDirection, videoDirection.",
              "The creative direction must be clean, premium, low-text, product-led, and suitable for marketplace carousel/detail images.",
              "Use all views to build a comprehensive understanding of the product's shape, materials, and features.",
              textLanguage === "zh"
                ? "Write the returned creative fields in Simplified Chinese. All newly generated visible marketing text in assets must be Simplified Chinese. Existing product logo/print/package text visible in the reference photo may remain unchanged."
                : "Write the returned creative fields in English. All newly generated visible marketing text in assets must be English.",
              customRequirements ? `\nUser custom requirements (MUST follow when generating all assets): ${customRequirements}` : "",
            ].join("\n"),
          },
          ...imageContent,
        ],
      },
    ]
  );
  const brief = normalizeBrief(response, textLanguage);
  if (customRequirements) brief.customRequirements = customRequirements;
  return brief;
}

export async function analyzeManufacturerPromoForEcommerceAssets(
  imageUrl: string,
  textLanguage: EcommerceTextLanguage
): Promise<EcommerceManufacturerPromoAnalysis> {
  const response = await callOpenRouter<Partial<EcommerceManufacturerPromoAnalysis>>(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Analyze this manufacturer promotional product image for an ecommerce carousel redesign workflow.",
              "Return ONLY a JSON object (no markdown, no explanation) with:",
              "productSubject, productVisuals, keyMessages, rewriteGuidance, and visualHierarchy.",
              "visualHierarchy must include: primaryText, secondaryText, specs, badges, logoText, decorativeText, layout.",
              "Extract text according to visual hierarchy, not as a flat OCR list. Distinguish main headline, subheadlines, parameter/spec text, badges, logo/brand marks, decorative text, and the overall layout structure.",
              "Do not invent text that is not visible. Summarize visual product details needed to preserve the source product.",
              textLanguage === "zh"
                ? "Write explanatory fields in Simplified Chinese when useful, but preserve original visible text exactly inside hierarchy fields."
                : "Write explanatory fields in English, but preserve original visible text exactly inside hierarchy fields.",
            ].join("\n"),
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ]
  );
  return normalizeManufacturerPromoAnalysis(response);
}

export function fallbackManufacturerPromoAnalysis(textLanguage: EcommerceTextLanguage): EcommerceManufacturerPromoAnalysis {
  if (textLanguage === "zh") {
    return {
      productSubject: "原厂家宣传图中的产品,保持外观、比例、材质和可识别细节",
      visualHierarchy: {
        primaryText: "",
        secondaryText: [],
        specs: [],
        badges: [],
        logoText: [],
        decorativeText: [],
        layout: "从原图推断",
      },
      productVisuals: "从原厂家宣传图推断产品形状、材质、颜色和可见细节",
      keyMessages: [],
      rewriteGuidance: "保留产品,按用户风格与文案选择要求重新设计宣传图",
    };
  }
  return {
    productSubject: "the product in the original manufacturer promotional image, preserving appearance, proportions, materials, and recognizable details",
    visualHierarchy: {
      primaryText: "",
      secondaryText: [],
      specs: [],
      badges: [],
      logoText: [],
      decorativeText: [],
      layout: "infer from the source image",
    },
    productVisuals: "infer product shape, materials, color, and visible details from the source manufacturer promo image",
    keyMessages: [],
    rewriteGuidance: "preserve the product and redesign the promotional image according to the user's style and copy-selection requirements",
  };
}

export function getPetReplacementNote(lang: EcommerceTextLanguage): string {
  if (lang === "zh") {
    return [
      "第一步:仔细看原图,只在原图中真实存在一只猫(照片里活体的、真实的猫,不是插画、不是卡通形象、不是 logo 上的小图、不是产品印花上的猫、不是品牌吉祥物)时,才进行替换。",
      "其他情况一律不替换:原图里没有猫、有插画里的猫、有卡通猫、有其他动物(狗、兔子、鸟、鱼等)、有品牌吉祥物猫,都不要替换,最终图里也不得出现任何用户提供的猫,直接保留原图中的产品外观、包装、构图和文字。",
      "如果确认要替换(原图里真实存在的猫),仅替换那只猫,使用用户提供的宠物参考照中的猫作为身份来源。替换时保留原猫所在位置、姿势、比例、视角和视线,不要把猫放到产品本身上,不要覆盖产品,不要改变产品外观、材质、包装或品牌信息。宠物参考照只用于替换原图中的真实猫,不要影响产品本身,也不要影响产品上的 logo、文字、角标、参数、装饰带等任何元素。",
    ].join(" ");
  }
  return [
    "Step 1: Look carefully at the source image. Replacement only happens if the source image contains a real, photogenic cat (a living cat in the photo — not an illustration, not a cartoon cat, not a small cat in a logo, not a printed cat on the product, not a brand mascot).",
    "In every other case, do not replace anything: if there is no cat, or there is an illustrated cat, or a cartoon cat, or any other animal (dog, rabbit, bird, fish, etc.), or a brand-mascot cat, keep the product, packaging, composition, and text exactly as they appear in the source. Do not introduce the user's cat in the final output.",
    "If you confirm replacement is needed (a real cat is actually present in the source), replace only that cat with the cat shown in the user-provided pet reference photos. Preserve the original cat's position, pose, scale, viewpoint, and gaze. Do not place the pet on the product itself, do not cover the product, and do not change the product's appearance, materials, packaging, or any branding information. The pet reference photos are used solely to replace the real cat; they must not alter the product or touch any logo, text, badge, spec, or decorative band on the product.",
  ].join(" ");
}

export function buildManufacturerPromoCarouselPrompt(input: {
  analysis: EcommerceManufacturerPromoAnalysis;
  customRequirements?: string;
  textLanguage: EcommerceTextLanguage;
  sourceIndex: number;
  petReplacementNote?: string;
}) {
  const hierarchy = input.analysis.visualHierarchy;
  const customRequirements = input.customRequirements?.trim()
    || (input.textLanguage === "zh"
      ? "重新设计为干净、高级、适合电商轮播图的视觉风格。"
      : "Redesign into a clean premium ecommerce carousel style.");

  const petLine = input.petReplacementNote
    ? `\nPet replacement rule (MUST follow): ${input.petReplacementNote}`
    : "";

  return [
    "Create one redesigned ecommerce carousel image using the uploaded manufacturer promotional image as the source reference.",
    `Source image number: ${input.sourceIndex + 1}.`,
    "Use image-to-image mode. Preserve the real product identity, shape, materials, proportions, colors, packaging, logo placement if present, and recognizable details from the source image.",
    "Do not copy the original crowded layout. Rebuild the visual composition according to the user's style and copy-selection requirements.",
    `Product subject: ${input.analysis.productSubject}.`,
    `Product visuals to preserve: ${input.analysis.productVisuals}.`,
    `Key messages extracted from source: ${input.analysis.keyMessages.join("; ") || "infer from the source image"}.`,
    "视觉层级解析 / Visual hierarchy extracted from source:",
    `- Main headline / 主标题: ${hierarchy.primaryText || "none detected"}`,
    `- Secondary text / 副标题: ${hierarchy.secondaryText.join("; ") || "none detected"}`,
    `- Specs / 参数: ${hierarchy.specs.join("; ") || "none detected"}`,
    `- Badges / 角标: ${hierarchy.badges.join("; ") || "none detected"}`,
    `- Logo or brand text / logo或品牌字样: ${hierarchy.logoText.join("; ") || "none detected"}`,
    `- Decorative text / 装饰性文字: ${hierarchy.decorativeText.join("; ") || "none detected"}`,
    `- Layout / 版式结构: ${hierarchy.layout}`,
    `Rewrite guidance from analysis: ${input.analysis.rewriteGuidance}.`,
    `User style and copy-selection requirements (MUST follow): ${customRequirements}`,
    languageInstruction(input.textLanguage),
    "Keep the final image clean, premium, legible, and product-led. Avoid dense copy, fake certifications, fake logos, watermarks, QR codes, prices, and unrelated props.",
    petLine,
  ].filter(Boolean).join("\n");
}

function viewReferenceNote(numViews: number) {
  if (numViews <= 1) return "";
  return numViews === 3
    ? "Three product reference images are provided: front view, side view, and back view. Use all views together to build a complete 3D understanding of the product shape, depth, materials, and features. The front view is the primary reference; side and back views ensure accuracy from every angle."
    : `Multiple product reference images (${numViews}) are provided. Use all views together to fully understand the product shape, materials, and features.`;
}

function customRequirementsBlock(customRequirements?: string) {
  if (!customRequirements?.trim()) return "";
  return `\nUser custom requirements (MUST follow): ${customRequirements.trim()}`;
}

function defaultCarouselRequirementsBlock(customRequirements?: string) {
  if (customRequirements?.trim()) return "";
  return "默认生成要求：轮播图不要出现产品本身之外的修饰性文字、说明性文字、参数文字、引导文字、箭头或标签。";
}

function baseImagePrompt(brief: EcommerceCreativeBrief, textLanguage: EcommerceTextLanguage, numViews = 1) {
  return [
    `Create one finished ecommerce product image using the uploaded product photo${numViews > 1 ? "s" : ""} as the identity reference.`,
    viewReferenceNote(numViews),
    "Canvas/aspect ratio: 1:1.",
    "Preserve the exact product identity, proportions, materials, colors, structure, logo placement if present, and recognizable details from every visible angle.",
    "Use one unified design language across the full carousel and detail image set.",
    `Product category: ${brief.productCategory}.`,
    `Product identity: ${brief.productIdentity}.`,
    `Materials and colors: ${brief.materialsAndColors}.`,
    `Selling points: ${sellingPointText(brief)}.`,
    `Design language: ${brief.designLanguage}.`,
    languageInstruction(textLanguage),
    "Keep the overall image clean, premium, spacious, and product-led.",
    "Do not add fake brand logos, dense copy, clutter, watermarks, QR codes, pricing, badges, or unrelated props.",
    customRequirementsBlock(brief.customRequirements),
  ].filter(Boolean).join("\n");
}

export function buildEcommerceImagePrompts(
  brief: EcommerceCreativeBrief,
  textLanguage: EcommerceTextLanguage,
  numViews = 1
): PromptSlot[] {
  const base = baseImagePrompt(brief, textLanguage, numViews);
  return [
    {
      kind: "carousel",
      index: 1,
      title: textLanguage === "zh" ? "白底主图" : "White Background",
      prompt: [
        base,
        defaultCarouselRequirementsBlock(brief.customRequirements),
        "Image role: carousel image 1.",
        "Use a pure white background, centered product, realistic soft shadow, accurate product scale, marketplace-ready composition.",
        "No headline, no decorative scene, no lifestyle background, and no large text.",
      ].filter(Boolean).join("\n"),
    },
    {
      kind: "carousel",
      index: 2,
      title: textLanguage === "zh" ? "卖点展示" : "Hero Benefit",
      prompt: [
        base,
        defaultCarouselRequirementsBlock(brief.customRequirements),
        `Carousel direction: ${brief.carouselDirection}.`,
        "Image role: carousel image 2. Create a premium hero composition that introduces the strongest selling point with very short text.",
      ].filter(Boolean).join("\n"),
    },
    {
      kind: "carousel",
      index: 3,
      title: textLanguage === "zh" ? "使用场景" : "Lifestyle Scene",
      prompt: [
        base,
        defaultCarouselRequirementsBlock(brief.customRequirements),
        `Carousel direction: ${brief.carouselDirection}.`,
        "Image role: carousel image 3. Show the product in a clean use-context or studio scene that matches the same design system.",
      ].filter(Boolean).join("\n"),
    },
    {
      kind: "carousel",
      index: 4,
      title: textLanguage === "zh" ? "材质细节" : "Material Close-up",
      prompt: [
        base,
        defaultCarouselRequirementsBlock(brief.customRequirements),
        `Carousel direction: ${brief.carouselDirection}.`,
        "Image role: carousel image 4. Use macro or close-up composition to showcase material quality, texture, craftsmanship, or fine details of the product.",
      ].filter(Boolean).join("\n"),
    },
    {
      kind: "carousel",
      index: 5,
      title: textLanguage === "zh" ? "功能演示" : "Feature in Action",
      prompt: [
        base,
        defaultCarouselRequirementsBlock(brief.customRequirements),
        `Carousel direction: ${brief.carouselDirection}.`,
        "Image role: carousel image 5. Show the product being used or in action — convey functionality, movement, or dynamic energy while keeping the composition premium and clean.",
      ].filter(Boolean).join("\n"),
    },
    {
      kind: "carousel",
      index: 6,
      title: textLanguage === "zh" ? "核心优势" : "Key Differentiator",
      prompt: [
        base,
        defaultCarouselRequirementsBlock(brief.customRequirements),
        `Carousel direction: ${brief.carouselDirection}.`,
        "Image role: carousel image 6. Highlight the product's unique advantage or differentiator — what sets it apart from competitors. Use comparison cues, before/after hints, or a bold visual statement.",
      ].filter(Boolean).join("\n"),
    },
    {
      kind: "detail",
      index: 1,
      title: textLanguage === "zh" ? "卖点总览" : "Benefits Overview",
      prompt: [
        base,
        `Detail direction: ${brief.detailDirection}.`,
        "Image role: detail image 1. Highlight the top benefits with minimal callouts and strong product focus.",
      ].join("\n"),
    },
    {
      kind: "detail",
      index: 2,
      title: textLanguage === "zh" ? "材质工艺" : "Material & Craft",
      prompt: [
        base,
        `Detail direction: ${brief.detailDirection}.`,
        "Image role: detail image 2. Use macro/detail composition to explain materials, craftsmanship, texture, or functional structure.",
      ].join("\n"),
    },
    {
      kind: "detail",
      index: 3,
      title: textLanguage === "zh" ? "尺寸规格" : "Size & Specs",
      prompt: [
        base,
        `Detail direction: ${brief.detailDirection}.`,
        "Image role: detail image 3. Present product dimensions, weight, capacity, or technical specifications in a clean infographic style with minimal labels.",
      ].join("\n"),
    },
    {
      kind: "detail",
      index: 4,
      title: textLanguage === "zh" ? "场景展示" : "Use Case Showcase",
      prompt: [
        base,
        `Detail direction: ${brief.detailDirection}.`,
        "Image role: detail image 4. Show the product in a real-life usage scenario — where and how the target customer would use it. Keep it aspirational yet authentic.",
      ].join("\n"),
    },
    {
      kind: "detail",
      index: 5,
      title: textLanguage === "zh" ? "信任背书" : "Trust & Social Proof",
      prompt: [
        base,
        `Detail direction: ${brief.detailDirection}.`,
        "Image role: detail image 5. Build purchase confidence with trust cues — ratings, certifications, awards, or a clean reliability message without clutter.",
      ].join("\n"),
    },
    {
      kind: "detail",
      index: 6,
      title: textLanguage === "zh" ? "包装配件" : "Package & Accessories",
      prompt: [
        base,
        `Detail direction: ${brief.detailDirection}.`,
        "Image role: detail image 6. Show the product with its packaging, included accessories, or unboxing experience to convey completeness and value.",
      ].join("\n"),
    },
  ];
}

export function buildEcommerceStoryboardPrompt(
  brief: EcommerceCreativeBrief,
  textLanguage: EcommerceTextLanguage,
  numViews = 1
) {
  return [
    `Create a square 15-second ecommerce ad storyboard image for the uploaded product${numViews > 1 ? " from multiple angles" : ""}.`,
    "Canvas/aspect ratio: 1:1.",
    numViews > 1
      ? "Multiple product reference images are provided (front, side, back views). Use all views to accurately represent the product from different angles throughout the storyboard beats."
      : "Use the product photo as the strict identity reference and preserve the exact product.",
    `Visible text language: ${textLanguage === "zh" ? "中文" : "English"}.`,
    languageInstruction(textLanguage),
    "Storyboard structure: 6 clean beats in a grid: product reveal, macro detail, core benefit, use context, premium hero motion, final hero shot.",
    `Product category: ${brief.productCategory}.`,
    `Product identity: ${brief.productIdentity}.`,
    `Selling points: ${sellingPointText(brief)}.`,
    `Design language: ${brief.designLanguage}.`,
    `Video direction: ${brief.videoDirection}.`,
    "Keep typography sparse and polished. Do not add fake logos, dense text, prices, watermarks, or unrelated props.",
    customRequirementsBlock(brief.customRequirements),
  ].join("\n");
}

export function buildEcommerceVideoPrompt(brief: EcommerceCreativeBrief, textLanguage: EcommerceTextLanguage, numViews = 1) {
  const prompt = [
    numViews > 1
      ? "Create a 15-second square ecommerce product advertisement using the provided product photos (front, side, and back views) and storyboard image as visual references."
      : "Create a 15-second square ecommerce product advertisement using the provided product photo and storyboard image as visual references.",
    numViews > 1
      ? "Use reference-image generation mode. Multiple angles of the product are provided — use them all to accurately animate the product from different perspectives: reveal, rotate, and showcase the product from multiple sides."
      : "Use reference-image generation mode. Preserve the exact product appearance, proportions, materials, color, and recognizable details.",
    "Animate through these beats: product reveal, macro detail, core selling point, clean use context, premium hero motion, final hero shot.",
    `Visible text and any generated audio language: ${textLanguage === "zh" ? "Chinese" : "English"}.`,
    languageInstruction(textLanguage),
    `Product category: ${brief.productCategory}.`,
    `Selling points: ${sellingPointText(brief)}.`,
    `Design language: ${brief.designLanguage}.`,
    `Video direction: ${brief.videoDirection}.`,
    "Use clean studio lighting, smooth camera motion, premium ecommerce pacing, and minimal on-screen text.",
    "Do not invent a different product, fake logo, price, watermark, or unrelated props.",
    customRequirementsBlock(brief.customRequirements),
  ].join(" ");

  return prompt.length > 1800 ? `${prompt.slice(0, 1797)}...` : prompt;
}
