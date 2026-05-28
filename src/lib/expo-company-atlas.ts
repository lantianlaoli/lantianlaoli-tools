import { callOpenRouter } from "./openrouter";
import type {
  ExpoAtlasCompany,
  ExpoAtlasContact,
  ExpoAtlasJob,
  ExpoAtlasPhoto,
  ExpoAtlasProduct,
  ExpoPhotoKind,
} from "./types";

export type ExpoAnalysisPhotoInput = {
  id: string;
  fileName: string;
  sourceUrl: string;
  previewUrl?: string;
};

type RawExpoAnalysis = {
  companies?: Array<{
    name?: string;
    intro?: string;
    photoIds?: string[];
    products?: Array<Partial<ExpoAtlasProduct>>;
    contact?: ExpoAtlasContact;
    notes?: string;
  }>;
  photos?: Array<{
    id?: string;
    kind?: string;
    summary?: string;
    extractedText?: string[];
  }>;
};

type RawSingleCompanyAnalysis = {
  name?: string;
  intro?: string;
  products?: Array<Partial<ExpoAtlasProduct>>;
  contact?: ExpoAtlasContact;
  notes?: string;
  photos?: Array<{
    id?: string;
    kind?: string;
    summary?: string;
    extractedText?: string[];
  }>;
};

const PHOTO_KINDS = new Set<ExpoPhotoKind>(["company_intro", "product", "contact", "mixed", "unknown"]);

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function uniqueStrings(values: unknown, limit = 8) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean))).slice(0, limit);
}

function photoKind(value: unknown): ExpoPhotoKind {
  return typeof value === "string" && PHOTO_KINDS.has(value as ExpoPhotoKind) ? (value as ExpoPhotoKind) : "unknown";
}

function productId(companyIndex: number, productIndex: number) {
  return `product_${companyIndex + 1}_${productIndex + 1}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function companyId(index: number) {
  return `company_${index + 1}`;
}

export function fallbackExpoAtlasCompany(photos: ExpoAnalysisPhotoInput[]): ExpoAtlasCompany {
  return {
    id: "company_1",
    name: "待整理企业",
    intro: "暂时未能稳定识别企业信息，请根据原始照片手动补充企业简介。",
    products: [
      {
        id: "product_1_1",
        name: "待整理产品",
        description: "请从上传的传单或产品册中补充产品名称、用途和核心卖点。",
        highlights: [],
      },
    ],
    contact: {
      raw: "请从联系方式照片中补充电话、邮箱、网址、地址或联系人。",
    },
    photoIds: photos.map((photo) => photo.id),
    notes: "自动分析失败后创建的兜底企业。",
  };
}

export function normalizeExpoAnalysis(
  analysis: RawExpoAnalysis | null | undefined,
  photos: ExpoAnalysisPhotoInput[]
): Pick<ExpoAtlasJob, "photos" | "companies"> {
  const knownPhotoIds = new Set(photos.map((photo) => photo.id));
  const photoAnalysis = new Map((analysis?.photos ?? []).map((photo) => [photo.id, photo]));
  const normalizedPhotos: ExpoAtlasPhoto[] = photos.map((photo) => {
    const found = photoAnalysis.get(photo.id);
    return {
      id: photo.id,
      fileName: photo.fileName,
      sourceUrl: photo.sourceUrl,
      previewUrl: photo.previewUrl,
      kind: photoKind(found?.kind),
      summary: cleanText(found?.summary, "等待人工整理照片内容。"),
      extractedText: uniqueStrings(found?.extractedText, 20),
      generationStatus: "waiting",
      enhancedStatus: "waiting",
    };
  });

  const companies = (analysis?.companies ?? []).map((company, companyIndex): ExpoAtlasCompany => {
    const productInputs = Array.isArray(company.products) && company.products.length ? company.products : [{}];
    const photoIds = Array.isArray(company.photoIds)
      ? company.photoIds.filter((id): id is string => typeof id === "string" && knownPhotoIds.has(id))
      : [];

    return {
      id: companyId(companyIndex),
      name: cleanText(company.name, `未命名企业 ${companyIndex + 1}`),
      intro: cleanText(company.intro, "请补充企业简介。"),
      products: productInputs.map((product, productIndex) => ({
        id: cleanText(product.id, productId(companyIndex, productIndex)),
        name: cleanText(product.name, `产品 ${productIndex + 1}`),
        description: cleanText(product.description, "请补充产品描述。"),
        highlights: uniqueStrings(product.highlights, 6),
      })),
      contact: {
        phone: cleanText(company.contact?.phone) || undefined,
        email: cleanText(company.contact?.email) || undefined,
        website: cleanText(company.contact?.website) || undefined,
        address: cleanText(company.contact?.address) || undefined,
        person: cleanText(company.contact?.person) || undefined,
        social: cleanText(company.contact?.social) || undefined,
        raw: cleanText(company.contact?.raw) || undefined,
      },
      photoIds,
      notes: cleanText(company.notes) || undefined,
    };
  });

  const assigned = new Set(companies.flatMap((company) => company.photoIds));
  const unassigned = photos.map((photo) => photo.id).filter((id) => !assigned.has(id));
  if (companies.length === 0) {
    companies.push(fallbackExpoAtlasCompany(photos));
  } else if (unassigned.length > 0) {
    companies.push({
      ...fallbackExpoAtlasCompany(photos.filter((photo) => unassigned.includes(photo.id))),
      id: companyId(companies.length),
    });
  }

  return { photos: normalizedPhotos, companies: companies.filter((company) => company.photoIds.length > 0) };
}

function normalizeProducts(products: unknown, companyIndex = 0) {
  const productInputs = Array.isArray(products) && products.length ? products : [{}];
  return productInputs.map((product: Partial<ExpoAtlasProduct>, productIndex) => ({
    id: cleanText(product.id, productId(companyIndex, productIndex)),
    name: cleanText(product.name, `产品 ${productIndex + 1}`),
    description: cleanText(product.description, "请补充产品描述。"),
    highlights: uniqueStrings(product.highlights, 6),
  }));
}

export function normalizeSingleExpoCompanyAnalysis(input: {
  companyId: string;
  userCompanyName?: string;
  analysis?: RawSingleCompanyAnalysis | null;
  photos: ExpoAnalysisPhotoInput[];
}): { company: ExpoAtlasCompany; photos: ExpoAtlasPhoto[] } {
  const photoAnalysis = new Map((input.analysis?.photos ?? []).map((photo) => [photo.id, photo]));
  const photos: ExpoAtlasPhoto[] = input.photos.map((photo) => {
    const found = photoAnalysis.get(photo.id);
    return {
      id: photo.id,
      fileName: photo.fileName,
      sourceUrl: photo.sourceUrl,
      previewUrl: photo.previewUrl,
      kind: photoKind(found?.kind),
      summary: cleanText(found?.summary, "等待人工整理照片内容。"),
      extractedText: uniqueStrings(found?.extractedText, 20),
      generationStatus: "waiting",
      enhancedStatus: "waiting",
    };
  });
  const aiName = cleanText(input.analysis?.name);
  const userName = cleanText(input.userCompanyName);
  const name = userName || aiName || "待整理企业";
  return {
    photos,
    company: {
      id: input.companyId,
      name,
      suggestedName: userName && aiName && userName !== aiName ? aiName : undefined,
      intro: cleanText(input.analysis?.intro, "请补充企业简介。"),
      products: normalizeProducts(input.analysis?.products),
      contact: {
        phone: cleanText(input.analysis?.contact?.phone) || undefined,
        email: cleanText(input.analysis?.contact?.email) || undefined,
        website: cleanText(input.analysis?.contact?.website) || undefined,
        address: cleanText(input.analysis?.contact?.address) || undefined,
        person: cleanText(input.analysis?.contact?.person) || undefined,
        social: cleanText(input.analysis?.contact?.social) || undefined,
        raw: cleanText(input.analysis?.contact?.raw) || undefined,
      },
      photoIds: photos.map((photo) => photo.id),
      parseStatus: "parsed",
      notes: cleanText(input.analysis?.notes) || undefined,
    },
  };
}

export async function analyzeExpoCompanyPhotos(photos: ExpoAnalysisPhotoInput[]) {
  const content = photos.flatMap((photo, index) => [
    {
      type: "text" as const,
      text: `Photo ${index + 1}: id=${photo.id}, fileName=${photo.fileName}`,
    },
    {
      type: "image_url" as const,
      image_url: { url: photo.sourceUrl },
    },
  ]);

  const analysis = await callOpenRouter<RawExpoAnalysis>(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "你是展会资料整理助手。请阅读用户上传的展会传单、产品册和现场照片，按企业进行聚类并抽取结构化信息。",
              "照片文件名可能没有意义，必须根据图片内容判断。",
              "返回 ONLY JSON，不要 markdown。JSON 结构：",
              "{",
              '  "photos": [{"id":"photo_1","kind":"company_intro|product|contact|mixed|unknown","summary":"中文摘要","extractedText":["可读文字"]}],',
              '  "companies": [{"name":"企业名","intro":"企业简介","photoIds":["photo_1"],"products":[{"name":"产品名","description":"产品描述","highlights":["卖点"]}],"contact":{"phone":"","email":"","website":"","address":"","person":"","social":"","raw":""},"notes":""}]',
              "}",
              "要求：企业名不确定时用最可能名称；不要虚构参数、认证、价格或联系方式；产品可有多个；联系方式缺失时留空。",
            ].join("\n"),
          },
          ...content,
        ],
      },
    ],
    { type: "json_object" }
  );

  return normalizeExpoAnalysis(analysis, photos);
}

export async function analyzeSingleExpoCompanyPhotos(input: {
  companyId: string;
  companyName?: string;
  photos: ExpoAnalysisPhotoInput[];
}) {
  const content = input.photos.flatMap((photo, index) => [
    {
      type: "text" as const,
      text: `Photo ${index + 1}: id=${photo.id}, fileName=${photo.fileName}`,
    },
    {
      type: "image_url" as const,
      image_url: { url: photo.sourceUrl },
    },
  ]);

  const analysis = await callOpenRouter<RawSingleCompanyAnalysis>(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "你是展会资料整理助手。用户已经按公司分好了照片；本次输入只属于同一家公司。",
              input.companyName?.trim()
                ? `用户填写的公司名称是：${input.companyName.trim()}。除非图片明确显示另一个更准确名称，否则保留用户填写名称。`
                : "请从图片中识别公司名称；如果无法确认，名称留为待整理企业。",
              "请从图片中整理企业简介、多个产品、联系方式和每张照片摘要。",
              "返回 ONLY JSON，不要 markdown。JSON 结构：",
              "{",
              '  "name":"企业名",',
              '  "intro":"企业简介",',
              '  "products":[{"name":"产品名","description":"产品描述","highlights":["卖点"]}],',
              '  "contact":{"phone":"","email":"","website":"","address":"","person":"","social":"","raw":""},',
              '  "photos":[{"id":"photo_1","kind":"company_intro|product|contact|mixed|unknown","summary":"中文摘要","extractedText":["可读文字"]}],',
              '  "notes":""',
              "}",
              "要求：只基于图片可见内容，不要虚构参数、认证、价格、联系方式或合作关系；缺失字段留空或写待补充；产品可有多个。",
            ].join("\n"),
          },
          ...content,
        ],
      },
    ],
    { type: "json_object" }
  );

  return normalizeSingleExpoCompanyAnalysis({
    companyId: input.companyId,
    userCompanyName: input.companyName,
    analysis,
    photos: input.photos,
  });
}

function contactLines(contact: ExpoAtlasContact) {
  return [
    contact.person ? `- 联系人：${contact.person}` : "",
    contact.phone ? `- 电话：${contact.phone}` : "",
    contact.email ? `- 邮箱：${contact.email}` : "",
    contact.website ? `- 网站：${contact.website}` : "",
    contact.address ? `- 地址：${contact.address}` : "",
    contact.social ? `- 社媒：${contact.social}` : "",
    contact.raw ? `- 其他：${contact.raw}` : "",
  ].filter(Boolean);
}

export function buildExpoImagePrompt(input: {
  company: ExpoAtlasCompany;
  photo: ExpoAtlasPhoto;
}) {
  const productText = input.company.products
    .map((product) => `${product.name}: ${product.description}${product.highlights.length ? `（${product.highlights.join("、")}）` : ""}`)
    .join("\n");

  return [
    "Create one polished visual image for a professional Chinese exhibition sharing article, using the uploaded brochure/photo as the factual source and visual reference.",
    "Keep the real company/product identity, names, logos, device shapes, printed materials, technical claims, and visible contact information accurate. Do not invent specifications, certifications, awards, prices, contact details, or partnerships.",
    "Visual style: consistent premium expo media card, clean dark charcoal or white studio base, lime accent lines, crisp product/brochure focus, high readability, modern AI/drone/embodied-intelligence industry feeling.",
    "Use concise Simplified Chinese visible text only. Avoid dense paragraphs. Keep typography clean and aligned.",
    `Company: ${input.company.name}.`,
    `Company intro: ${input.company.intro}.`,
    productText ? `Products:\n${productText}` : "",
    `Photo role: ${input.photo.kind}.`,
    `Photo summary: ${input.photo.summary}.`,
    input.photo.extractedText.length ? `Visible source text:\n${input.photo.extractedText.join("\n")}` : "",
    "Output must be presentation-ready, visually rich, and consistent with the other company images in the same atlas.",
  ].filter(Boolean).join("\n");
}

export function buildExpoCompanyMarkdown(company: ExpoAtlasCompany, photos: ExpoAtlasPhoto[], language?: string) {
  const companyPhotos = photos.filter((photo) => company.photoIds.includes(photo.id));
  const enhanced = companyPhotos.filter((photo) => photo.enhancedUrl);
  const products = company.products.length ? company.products : [];
  const contacts = contactLines(company.contact);

  const isZh = language === "zh";
  const labels = isZh ? {
    overview: "企业简介",
    products: "核心产品",
    contact: "联系方式",
    photos: "PPT 高清图片",
    summaries: "原始资料摘要",
    notes: "备注",
    tbd: "待补充。",
    noPhotos: "暂无照片。",
  } : {
    overview: "Company Overview",
    products: "Core Products",
    contact: "Contact Information",
    photos: "PPT-ready HD Images",
    summaries: "Photo Summaries",
    notes: "Notes",
    tbd: "TBD.",
    noPhotos: "No photos yet.",
  };

  return [
    `# ${company.name}`,
    "",
    `## ${labels.overview}`,
    company.intro || labels.tbd,
    "",
    `## ${labels.products}`,
    products.length
      ? products
          .map((product) => {
            const highlights = product.highlights.length ? `\n  - ${isZh ? "卖点" : "Highlights"}：${product.highlights.join(isZh ? "、" : ", ")}` : "";
            return `- **${product.name}**：${product.description || labels.tbd}${highlights}`;
          })
          .join("\n")
      : `- ${labels.tbd}`,
    "",
    `## ${labels.contact}`,
    contacts.length ? contacts.join("\n") : `- ${labels.tbd}`,
    "",
    `## ${labels.photos}`,
    enhanced.length
      ? enhanced.map((photo) => `![${company.name} - ${photo.fileName}](${photo.enhancedUrl})`).join("\n\n")
      : (isZh ? "待生成。" : "Pending."),
    "",
    `## ${labels.summaries}`,
    companyPhotos.length
      ? companyPhotos.map((photo) => `- ${photo.fileName}：${photo.summary || (isZh ? "待整理。" : "TBD.")}（${photo.kind}）`).join("\n")
      : `- ${labels.noPhotos}`,
    company.notes ? `\n## ${labels.notes}\n${company.notes}` : "",
  ].filter((line) => line !== undefined).join("\n");
}

export function refreshExpoMarkdown(job: ExpoAtlasJob): ExpoAtlasJob {
  // Only preserve existing markdown; don't auto-generate on every refresh.
  return {
    ...job,
    companies: job.companies.map((company) => ({
      ...company,
      markdown: company.markdown || undefined,
    })),
  };
}

export function mergeExpoCompanyParseResult(input: {
  job: ExpoAtlasJob;
  companyId: string;
  company: ExpoAtlasCompany;
  photos: ExpoAtlasPhoto[];
}) {
  const parsedPhotoIds = new Set(input.photos.map((photo) => photo.id));
  return refreshExpoMarkdown({
    ...input.job,
    status: "ready",
    photos: [...input.job.photos.filter((photo) => !parsedPhotoIds.has(photo.id)), ...input.photos],
    companies: input.job.companies.map((company) =>
      company.id === input.companyId
        ? {
            ...input.company,
            parseStatus: input.company.parseStatus ?? "parsed",
          }
        : company
    ),
    updatedAt: Date.now(),
  });
}

export function expoAtlasOverallStatus(job: ExpoAtlasJob): ExpoAtlasJob["status"] {
  if (job.error) return "failed";
  const generatedPhotos = job.photos.filter((photo) => photo.generationTaskId || photo.generatedUrl || photo.generationStatus !== "waiting");
  if (generatedPhotos.length === 0) return job.status === "analyzing" ? "analyzing" : "ready";
  const allTerminal = generatedPhotos.every((photo) => photo.generationStatus === "success" || photo.generationStatus === "fail");
  if (!allTerminal) return "generating";
  return generatedPhotos.some((photo) => photo.generationStatus === "fail") ? "failed" : "completed";
}

const MARKDOWN_LANG_LABELS: Record<string, string> = {
  en: "English",
  zh: "简体中文",
  ja: "日本語",
  ko: "한국어",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
};

export function getMarkdownLanguages() {
  return Object.entries(MARKDOWN_LANG_LABELS).map(([code, label]) => ({ code, label }));
}

export async function generateExpoCompanyMarkdown(input: {
  company: ExpoAtlasCompany;
  photos: ExpoAtlasPhoto[];
  language: string;
}) {
  const langLabel = MARKDOWN_LANG_LABELS[input.language] || input.language;
  const companyPhotos = input.photos.filter((photo) => input.company.photoIds.includes(photo.id));

  // Build photo references with index-based placeholders the AI can use inline
  const photoRefs = companyPhotos
    .map((photo, index) => ({
      index: index + 1,
      placeholder: `{{IMG_${index + 1}}}`,
      url: photo.enhancedUrl || photo.sourceUrl,
      enhancedUrl: photo.enhancedUrl,
      fileName: photo.fileName,
      summary: photo.summary,
      kind: photo.kind,
    }))
    .filter((ref) => ref.url);

  const contextParts = [
    `Company name: ${input.company.name || "Unknown"}`,
    `Company intro: ${input.company.intro || "N/A"}`,
    input.company.products.length
      ? `Products:\n${input.company.products
          .map((product) => `- ${product.name}: ${product.description || ""}${product.highlights.length ? ` [Highlights: ${product.highlights.join(", ")}]` : ""}`)
          .join("\n")}`
      : "",
    input.company.contact
      ? `Contact: ${[
          input.company.contact.person ? `Person: ${input.company.contact.person}` : "",
          input.company.contact.phone ? `Phone: ${input.company.contact.phone}` : "",
          input.company.contact.email ? `Email: ${input.company.contact.email}` : "",
          input.company.contact.website ? `Website: ${input.company.contact.website}` : "",
          input.company.contact.address ? `Address: ${input.company.contact.address}` : "",
          input.company.contact.raw ? `Other: ${input.company.contact.raw}` : "",
        ].filter(Boolean).join("; ")}`
      : "",
    input.company.notes ? `Additional notes: ${input.company.notes}` : "",
  ].filter(Boolean);

  // Build image URL blocks from enhanced/source photos for multimodal context
  const imageUrlBlocks = photoRefs.map((ref) => ({
    type: "image_url" as const,
    image_url: { url: ref.url! },
  }));

  // Build photo reference guide for the AI
  const photoGuide = photoRefs
    .map((ref) => `${ref.placeholder}: "${ref.fileName}" (kind: ${ref.kind}, summary: ${ref.summary || "See image"})`)
    .join("\n");

  const analysis = await callOpenRouter<{ markdown: string }>(
    [
      {
        role: "system",
        content: `You are a professional exhibition copywriter. You MUST write ALL output in ${langLabel}. Never respond in Chinese or any other language unless the target language IS that language. Output only a JSON object: {"markdown": "..."}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `IMPORTANT: You MUST write the ENTIRE response in ${langLabel}. Every heading, paragraph, and bullet point must be in ${langLabel}. Do NOT write any Chinese, Japanese, or other language unless the target language IS that language.`,
              "",
              `You are a professional exhibition copywriter. Write a polished, publication-ready company introduction in ${langLabel} with photos embedded at relevant positions.`,
              "",
              "CRITICAL — Photo embedding instructions:",
              "You have access to photos shown below. Insert photo placeholders at NATURAL positions in the text where each image would enhance the reading experience.",
              `Use these exact placeholders: ${photoRefs.map((r) => r.placeholder).join(", ")}`,
              "- Place product photos near the product descriptions they illustrate.",
              "- Place company intro/brochure photos near the company overview section.",
              "- Place contact photos near the contact information section.",
              "- Each placeholder should be on its own line, optionally preceded by a brief caption like:",
              "  `*Caption text.*`",
              "  `{{IMG_1}}`",
              "- Do NOT group all photos at the end — distribute them naturally throughout the document.",
              "- Use each photo at most once. You don't have to use every photo if it doesn't fit.",
              "",
              "Photo reference guide:",
              photoGuide,
              "",
              "Requirements:",
              "- Output ONLY valid Markdown, no wrapping explanations or code fences.",
              `- ALL content MUST be written in ${langLabel}. This is the most important rule.`,
              "- Do NOT invent specifications, certifications, awards, prices, or partnerships not present in the data or photos.",
              "- Keep contact details accurate; do not fabricate phone numbers, emails, or addresses.",
              "- Structure: company name as H1, then sections for company overview, core products, contact information.",
              "- Use bullet lists for products and contact details.",
              "- Keep a confident, professional B2B exhibition tone.",
              "",
              "Company data (note: this data may be in Chinese, but your response MUST be in " + langLabel + "):",
              contextParts.join("\n\n"),
            ].join("\n"),
          },
          ...imageUrlBlocks,
        ],
      },
    ],
    { type: "json_object" }
  );

  let baseMarkdown = analysis?.markdown?.trim() || buildExpoCompanyMarkdown(input.company, input.photos, input.language);

  // Replace {{IMG_N}} placeholders with actual markdown image syntax
  for (const ref of photoRefs) {
    const imgMarkdown = `![${ref.fileName}](${ref.enhancedUrl || ref.url})`;
    baseMarkdown = baseMarkdown.replaceAll(ref.placeholder, imgMarkdown);
  }

  return baseMarkdown;
}

/** Simple markdown-to-HTML converter for rendering generated markdown. */
export function renderMarkdownToHtml(md: string): string {
  let html = md
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headings
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");

  // Images (must come before links to avoid conflict with ![alt](url) syntax)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded-lg border border-white/10 my-3" loading="lazy" />');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Unordered list items
  html = html.replace(/^[\t ]*[-*+] (.+)$/gm, "<li>$1</li>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Horizontal rules
  html = html.replace(/^---+/gm, "<hr>");

  // Paragraphs: wrap remaining non-empty, non-tag lines
  html = html.replace(/^(?!<[houl]|<li|<hr)(.+)$/gm, "<p>$1</p>");

  // Collapse empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");

  // Restore unescaped HTML in code blocks (simplified)
  return html;
}

const ENHANCE_LANG_LABELS: Record<string, string> = {
  en: "English",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  de: "German",
  fr: "French",
  es: "Spanish",
};

export function buildExpoPhotoEnhancePrompt(input: {
  photo: ExpoAtlasPhoto;
  language: string;
}) {
  const langLabel = ENHANCE_LANG_LABELS[input.language] || input.language;

  return [
    "You are a professional presentation designer. Take this exhibition photo and recreate it as a clean, slide-ready image suitable for direct insertion into a corporate PowerPoint presentation.",
    "",
    "CRITICAL REQUIREMENTS:",
    "- Remove ALL camera/photo artifacts: no background environment, no hands holding paper, no table surfaces, no shadows cast by objects, no perspective distortion from camera angle.",
    "- Present the content as a clean, flat-lay or isolated product/document shot on a pure white or very light neutral background.",
    "- Straighten any skewed text or images. Make all content perfectly aligned and orthographic (straight-on view).",
    "- Translate ALL visible text to " + langLabel + ". Keep company names, brand names, and proper nouns accurate.",
    "- Keep all factual information accurate: product names, specifications, contact details, numerical data. Do NOT invent or modify any factual content.",
    "- Use professional, clean typography appropriate for " + langLabel + " business presentations.",
    "- High resolution, sharp text, crisp product images, clean vector-like quality.",
    "- The final image should look like a professionally designed slide element, not a photograph.",
    "",
    "Photo summary: " + (input.photo.summary || "No summary available"),
    input.photo.extractedText.length
      ? "Original text found in photo:\n" + input.photo.extractedText.map((t) => `- ${t}`).join("\n")
      : "",
    "Photo kind: " + input.photo.kind,
  ].filter(Boolean).join("\n");
}
