import { z } from "zod";

export const REVIEWZON_MAX_ROWS_PER_BATCH = 100;

export const importedReviewRowSchema = z.object({
  id: z.string().min(1),
  asin: z.string().trim().min(1),
  content: z.string().trim().min(1),
  sellingPoints: z.array(z.string().trim().min(1)).default([]),
});

export const reviewFeedbackPointSchema = z.object({
  text: z.string().trim().min(1),
  theme: z.string().trim().min(1),
});

export const reviewExtractedRowSchema = importedReviewRowSchema.extend({
  pros: z.array(reviewFeedbackPointSchema).default([]),
  cons: z.array(reviewFeedbackPointSchema).default([]),
});

export const reviewThemeSummarySchema = z.object({
  topPros: z.array(z.string().trim().min(1)).max(5).default([]),
  topCons: z.array(z.string().trim().min(1)).max(5).default([]),
});

export const reviewMappedRowSchema = importedReviewRowSchema.extend({
  positiveSlots: z.array(z.string()).length(5).default(["", "", "", "", ""]),
  negativeSlots: z.array(z.string()).length(5).default(["", "", "", "", ""]),
});

export const reviewBatchRequestSchema = z.object({
  rows: z.array(importedReviewRowSchema).min(1).max(REVIEWZON_MAX_ROWS_PER_BATCH),
});

export const analyzeProgressEventSchema = z.object({
  type: z.literal("progress"),
  total: z.number().int().min(0),
  completed: z.number().int().min(0),
});

export const analyzeSummaryEventSchema = reviewThemeSummarySchema.extend({
  type: z.literal("summary"),
});

export const analyzeChunkEventSchema = z.object({
  type: z.literal("chunk"),
  rows: z.array(reviewMappedRowSchema),
});

export const analyzeDoneEventSchema = z.object({
  type: z.literal("done"),
  total: z.number().int().min(0),
  completed: z.number().int().min(0),
});

export const analyzeErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string().min(1),
});

export const analyzeStreamEventSchema = z.discriminatedUnion("type", [
  analyzeProgressEventSchema,
  analyzeSummaryEventSchema,
  analyzeChunkEventSchema,
  analyzeDoneEventSchema,
  analyzeErrorEventSchema,
]);

export type ImportedReviewRow = z.infer<typeof importedReviewRowSchema>;
export type ReviewFeedbackPoint = z.infer<typeof reviewFeedbackPointSchema>;
export type ReviewExtractedRow = z.infer<typeof reviewExtractedRowSchema>;
export type ReviewThemeSummary = z.infer<typeof reviewThemeSummarySchema>;
export type ReviewMappedRow = z.infer<typeof reviewMappedRowSchema>;
export type AnalyzeStreamEvent = z.infer<typeof analyzeStreamEventSchema>;

const asinHeaderAliases = [
  "asin",
  "asinid",
  "productid",
  "itemid",
  "skuasin",
  "产品id",
  "产品asin",
  "商品asin",
  "商品id",
];

const contentHeaderAliases = [
  "content",
  "text",
  "body",
  "review",
  "reviewtext",
  "reviewbody",
  "reviewcontent",
  "comment",
  "comments",
  "feedback",
  "reviewcomment",
  "reviewdetail",
  "评论内容",
  "评论正文",
  "评论文本",
  "评论详情",
  "内容",
  "评价内容",
  "评价正文",
  "买家评论",
  "买家反馈",
  "评论",
  "评价",
];

const sellingPointHeaderAliases = [
  "sellingpoints",
  "sellingpoint",
  "bulletpoints",
  "bulletpoint",
  "highlights",
  "highlight",
  "keypoints",
  "usp",
  "usps",
  "产品卖点",
  "卖点",
  "核心卖点",
];

export function normalizeReviewzonHeader(input: string): string {
  return input
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function mapReviewzonHeaderKey(input: string): "asin" | "content" | "sellingPoints" | null {
  const key = normalizeReviewzonHeader(input);

  if (asinHeaderAliases.includes(key) || (key.includes("asin") && !key.includes("rating"))) {
    return "asin";
  }

  if (
    contentHeaderAliases.includes(key) ||
    key.includes("review") ||
    key.includes("comment") ||
    key.includes("feedback") ||
    key.includes("评论") ||
    key.includes("评价")
  ) {
    return "content";
  }

  if (
    sellingPointHeaderAliases.includes(key) ||
    key.includes("sellingpoint") ||
    key.includes("bulletpoint") ||
    key.includes("highlight") ||
    key.includes("卖点")
  ) {
    return "sellingPoints";
  }

  return null;
}

export function normalizeReviewzonTokenList(input: string): string[] {
  return input
    .split(/[\n;,，；]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getReviewzonCellText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function isBlankReviewzonRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => getReviewzonCellText(value) === "");
}

export function getRecognizedReviewzonHeaders(rows: Record<string, unknown>[]) {
  const headers = new Set<"asin" | "content" | "sellingPoints">();

  for (const row of rows) {
    for (const rawKey of Object.keys(row)) {
      const mappedKey = mapReviewzonHeaderKey(rawKey);
      if (mappedKey) headers.add(mappedKey);
    }
  }

  return headers;
}

export function transformReviewzonSheetRows(rows: Record<string, unknown>[]): ImportedReviewRow[] {
  return rows
    .filter((row) => !isBlankReviewzonRow(row))
    .map((row, index) => {
      const normalized: Partial<Record<"asin" | "content" | "sellingPoints", string>> = {};

      for (const [rawKey, rawValue] of Object.entries(row)) {
        const mappedKey = mapReviewzonHeaderKey(rawKey);
        if (mappedKey) normalized[mappedKey] = getReviewzonCellText(rawValue);
      }

      return {
        id: `row-${index + 1}`,
        asin: normalized.asin ?? "",
        content: normalized.content ?? "",
        sellingPoints: normalizeReviewzonTokenList(normalized.sellingPoints ?? ""),
      };
    })
    .filter((row) => row.asin || row.content);
}

export function validateReviewzonRows(rows: ImportedReviewRow[]) {
  if (rows.length === 0) {
    throw new Error("没有解析到有效评论，请检查文件内容。");
  }

  if (rows.length > REVIEWZON_MAX_ROWS_PER_BATCH) {
    throw new Error(`当前版本单次最多处理 ${REVIEWZON_MAX_ROWS_PER_BATCH} 条评论，请拆分文件后重试。`);
  }

  const invalidRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.asin.trim() === "" || row.content.trim() === "");

  if (invalidRows.length > 0) {
    const rowNumbers = invalidRows
      .slice(0, 5)
      .map(({ index }) => index + 2)
      .join(", ");
    throw new Error(`以下行缺少 asin 或 content：第 ${rowNumbers} 行。`);
  }
}

export function importReviewzonRows(rows: Record<string, unknown>[]) {
  const recognizedHeaders = getRecognizedReviewzonHeaders(rows);
  if (!recognizedHeaders.has("asin") || !recognizedHeaders.has("content")) {
    throw new Error("没有识别到 asin / content 表头。请确认第一行就是表头。");
  }

  const transformedRows = transformReviewzonSheetRows(rows);
  validateReviewzonRows(transformedRows);
  return transformedRows;
}

export function dedupeReviewzonFeedbackPoints(values: ReviewFeedbackPoint[]): ReviewFeedbackPoint[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = `${normalizeReviewzonCanonicalKey(value.theme)}::${normalizeReviewzonCanonicalKey(value.text)}`;

    if (!value.text.trim() || !value.theme.trim() || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function normalizeReviewzonCanonicalKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\n\r\t]+/g, "")
    .replace(/[()（）[\]【】'",.:;!?，。；：、/\\-]/g, "");
}

