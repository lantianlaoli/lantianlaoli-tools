import { z } from "zod";

import { callOpenRouter } from "@/lib/openrouter";
import {
  dedupeReviewzonFeedbackPoints,
  importedReviewRowSchema,
  normalizeReviewzonCanonicalKey,
  reviewExtractedRowSchema,
  reviewMappedRowSchema,
  reviewThemeSummarySchema,
  type AnalyzeStreamEvent,
  type ImportedReviewRow,
  type ReviewExtractedRow,
  type ReviewFeedbackPoint,
  type ReviewMappedRow,
  type ReviewThemeSummary,
} from "@/lib/reviewzon";

const reviewChunkPointSchema = z.object({
  t: z.string().default(""),
  n: z.string().default(""),
});

const reviewChunkResultSchema = z.object({
  id: z.string(),
  p: z.array(reviewChunkPointSchema).default([]),
  c: z.array(reviewChunkPointSchema).default([]),
});

const reviewChunkResponseSchema = z.object({
  r: z.array(reviewChunkResultSchema),
});

const ANALYSIS_CONCURRENCY = 4;
const MAX_CHUNK_ROWS = 24;
const TARGET_PROMPT_BUDGET = 12500;
const MIN_CHUNK_ROWS = 1;
const EMIT_CHUNK_SIZE = 20;

const POSITIVE_SYNONYM_RULES: Array<[RegExp, string]> = [
  [/(odorless|no\s*smell|not\s*smelly|mild\s*smell|气味温和|没味道|无异味)/i, "气味好闻"],
  [/(palatable|dog\s+likes|likes\s+the\s+taste|easy\s+to\s+eat|适口性好|爱吃|愿意吃|好喂食)/i, "适口性好"],
  [/(easy\s+to\s+use|easy\s+to\s+apply|easy\s+to\s+administer|user[-\s]?friendly|易于使用|使用方便|好操作|易用性|使用体验|用户友好|便利性|使用简便|操作方便|方便量取|好上手|好喂|易于管理)/i, "易于使用"],
  [/(reduced\s+redness|less\s+itch|less\s+irritation|anti[-\s]?inflamm|红肿减轻|止痒|刺激感降低|舒缓炎症)/i, "瘙痒减轻"],
  [/(effective|worked|works\s+well|helped|有效|效果明显|效果显著|有改善|症状缓解|疗效|治疗效果|产品效果|产品功效|^效果$)/i, "有效果"],
  [/(no\s+side\s+effects|without\s+issues|无副作用|没有不良反应|温和不刺激)/i, "无副作用"],
  [/(good\s+value|worth\s+the\s+money|值这个价|性价比高|划算|性价比|值得买)/i, "性价比高"],
  [/(vitamin|probiotic|natural|成分|益生菌|维生素|天然配方|天然成分|原料)/i, "成分天然"],
  [/(flavor|taste|smell|培根味|味道|气味|闻起来)/i, "气味好闻"],
  [/(effect|worked|helped|improvement|改善|缓解|好转|起作用|有效|疗效|治疗效果|产品效果|产品功效|^效果$)/i, "有效果"],
];

const NEGATIVE_SYNONYM_RULES: Array<[RegExp, string]> = [
  [/(not\s+effective|didn.?t\s+work|ineffective|没效果|无改善|效果不佳|没用|^效果$)/i, "没有效果"],
  [/(broken|damaged|leak|leaking|package.*damag|包装破损|破损|漏液|碎了)/i, "包装破损"],
  [/(debris|floater|foreign\s+object|impurit|杂质|异物|漂浮物|^质量$)/i, "产品有杂质"],
  [/(side\s+effect|reaction|unsafe|worse|安全性担忧|安全性|安全问题|安全隐患|不良反应|更严重|不适|^副作用$)/i, "引起不适"],
  [/(bad\s+smell|strong\s+odor|气味刺鼻|味道难闻|难闻|臭|^味道$|^气味$)/i, "气味难闻"],
  [/(hard\s+to\s+use|messy|difficult\s+to\s+apply|难用|操作麻烦|使用体验|体验差|不方便)/i, "使用不便"],
  [/(slow|takes\s+too\s+long|见效慢|起效慢)/i, "见效慢"],
  [/(false\s+claim|misleading|虚假声明|宣传不符|不像宣传那样|夸大宣传|^宣传$)/i, "虚假宣传"],
];

const GENERIC_THEME_PATTERNS = [
  /总体评价|整体评价|整体感受|overall|general feedback|总体印象/i,
  /产品很棒|great product|excellent product|worth a try|值得一试/i,
  /^背景$/i,
];

const KNOWN_CANONICAL_THEMES = new Set([
  "有效果",
  "瘙痒减轻",
  "气味好闻",
  "适口性好",
  "易于使用",
  "成分天然",
  "无副作用",
  "性价比高",
  "没有效果",
  "引起不适",
  "气味难闻",
  "包装破损",
  "产品有杂质",
  "使用不便",
  "见效慢",
  "虚假宣传",
]);

type ChunkTaskResult = {
  index: number;
  rows: ReviewExtractedRow[];
};

function estimateRowPromptSize(row: ImportedReviewRow): number {
  return row.content.length + row.asin.length + row.sellingPoints.join(",").length + 40;
}

function buildAdaptiveChunks(rows: ImportedReviewRow[]): ImportedReviewRow[][] {
  const chunks: ImportedReviewRow[][] = [];
  let currentChunk: ImportedReviewRow[] = [];
  let currentBudget = 0;

  for (const row of rows) {
    const rowBudget = estimateRowPromptSize(row);
    const shouldFlush =
      currentChunk.length >= MAX_CHUNK_ROWS ||
      (currentChunk.length >= MIN_CHUNK_ROWS && currentBudget + rowBudget > TARGET_PROMPT_BUDGET);

    if (shouldFlush) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBudget = 0;
    }

    currentChunk.push(row);
    currentBudget += rowBudget;
  }

  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

function buildChunkReviewPrompt(rows: ImportedReviewRow[]): string {
  const payload = rows.map((row) => ({
    i: row.id,
    a: row.asin,
    c: row.content,
    s: row.sellingPoints,
  }));

  return [
    "你是 Reviewzon 评论结构化引擎，只返回合法 JSON。",
    "任务：逐条抽取评论中的好评点和差评点，并为每个点给一个稳定的中文主题标签。",
    "规则：",
    "1. 只写用户真实体验，不写官方卖点和推测。",
    "2. 每个反馈点都要尽量短，必须是该条评论里的真实表达。",
    "3. 主题标签必须是稳定、可复用的中文短标签。",
    "4. 无意义评论或无对应反馈时返回空数组。",
    '5. 只返回 {"r":[{"id":"...","p":[{"t":"反馈短语","n":"主题标签"}],"c":[{"t":"反馈短语","n":"主题标签"}]}]}',
    "",
    JSON.stringify(payload),
  ].join("\n");
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getBigrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  const bigrams = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    bigrams.add(value.slice(index, index + 2));
  }
  return bigrams;
}

function getSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  if (left.includes(right) || right.includes(left)) return 0.88;

  const leftBigrams = getBigrams(left);
  const rightBigrams = getBigrams(right);
  let matches = 0;
  for (const value of leftBigrams) {
    if (rightBigrams.has(value)) matches += 1;
  }

  return matches / Math.max(leftBigrams.size, rightBigrams.size);
}

function matchSellingPoint(label: string, sellingPoints: string[]): string | null {
  if (sellingPoints.length === 0) return null;

  const normalizedLabel = normalizeReviewzonCanonicalKey(label);
  let bestMatch: { value: string; score: number } | null = null;

  for (const sellingPoint of sellingPoints) {
    const normalizedSellingPoint = normalizeReviewzonCanonicalKey(sellingPoint);
    const similarity = getSimilarity(normalizedLabel, normalizedSellingPoint);

    if (
      normalizedLabel === normalizedSellingPoint ||
      normalizedLabel.includes(normalizedSellingPoint) ||
      normalizedSellingPoint.includes(normalizedLabel)
    ) {
      return sellingPoint;
    }

    if (similarity >= 0.62 && (!bestMatch || similarity > bestMatch.score)) {
      bestMatch = { value: sellingPoint, score: similarity };
    }
  }

  return bestMatch?.value ?? null;
}

function applyRuleBasedCanonical(label: string, rules: Array<[RegExp, string]>): string | null {
  const normalized = normalizeWhitespace(label);
  for (const [pattern, canonical] of rules) {
    if (pattern.test(normalized)) return canonical;
  }
  return null;
}

function humanizeLabel(label: string): string {
  const normalized = normalizeWhitespace(label);
  if (!normalized) return "";

  if (/^[a-z0-9\s-]+$/i.test(normalized)) {
    return normalized.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  return normalized;
}

function shouldDiscardTheme(label: string): boolean {
  return GENERIC_THEME_PATTERNS.some((pattern) => pattern.test(label));
}

export function canonicalizeReviewzonTheme(
  label: string,
  type: "pros" | "cons",
  sellingPoints: string[],
  cache = new Map<string, string>(),
): string {
  const normalized = normalizeWhitespace(label);
  const cacheKey = `${type}:${normalizeReviewzonCanonicalKey(normalized)}`;

  if (!normalized) return "";

  const existing = cache.get(cacheKey);
  if (existing) return existing;

  const mappedSellingPoint = type === "pros" ? matchSellingPoint(normalized, sellingPoints) : null;
  const ruled = applyRuleBasedCanonical(normalized, type === "pros" ? POSITIVE_SYNONYM_RULES : NEGATIVE_SYNONYM_RULES);
  const canonical = mappedSellingPoint ?? ruled ?? humanizeLabel(normalized);

  if (shouldDiscardTheme(canonical)) return "";
  if (!mappedSellingPoint && !ruled && canonical.length <= 2 && !KNOWN_CANONICAL_THEMES.has(canonical)) return "";

  cache.set(cacheKey, canonical);
  return canonical;
}

function cleanFeedbackPoint(point: { t: string; n: string }): ReviewFeedbackPoint | null {
  const text = normalizeWhitespace(point.t);
  const theme = normalizeWhitespace(point.n);
  if (!text || !theme) return null;
  return { text, theme };
}

export function postProcessReviewzonExtractedRow(row: ReviewExtractedRow): ReviewExtractedRow {
  const positiveCache = new Map<string, string>();
  const negativeCache = new Map<string, string>();

  const pros = dedupeReviewzonFeedbackPoints(
    row.pros
      .map((point) => ({
        text: normalizeWhitespace(point.text),
        theme: canonicalizeReviewzonTheme(point.theme, "pros", row.sellingPoints, positiveCache),
      }))
      .filter((point) => point.text && point.theme),
  );

  const cons = dedupeReviewzonFeedbackPoints(
    row.cons
      .map((point) => ({
        text: normalizeWhitespace(point.text),
        theme: canonicalizeReviewzonTheme(point.theme, "cons", row.sellingPoints, negativeCache),
      }))
      .filter((point) => point.text && point.theme),
  );

  return reviewExtractedRowSchema.parse({ ...row, pros, cons });
}

function countThemes(rows: ReviewExtractedRow[], type: "pros" | "cons"): Array<[string, number]> {
  const counter = new Map<string, number>();

  for (const row of rows) {
    const uniqueThemes = new Set((type === "pros" ? row.pros : row.cons).map((point) => point.theme));
    for (const theme of uniqueThemes) {
      counter.set(theme, (counter.get(theme) ?? 0) + 1);
    }
  }

  return [...counter.entries()].sort((left, right) => right[1] - left[1]);
}

function findBestThemeMatch(theme: string, availableThemes: string[]): string | null {
  const normalizedTheme = normalizeReviewzonCanonicalKey(theme);
  let bestMatch: { theme: string; score: number } | null = null;

  for (const candidate of availableThemes) {
    const normalizedCandidate = normalizeReviewzonCanonicalKey(candidate);
    if (
      normalizedTheme === normalizedCandidate ||
      normalizedTheme.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedTheme)
    ) {
      return candidate;
    }

    const score = getSimilarity(normalizedTheme, normalizedCandidate);
    if (score >= 0.66 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { theme: candidate, score };
    }
  }

  return bestMatch?.theme ?? null;
}

function mapPointsToThemes(points: ReviewFeedbackPoint[], themes: string[]): Record<string, string> {
  const matches: Record<string, string> = {};

  for (const point of points) {
    const theme = findBestThemeMatch(point.theme, themes);
    if (theme && !matches[theme]) matches[theme] = point.text;
  }

  return matches;
}

function buildFixedSlots(points: ReviewFeedbackPoint[], themes: string[]): [string, string, string, string, string] {
  const matches = mapPointsToThemes(points, themes);
  const slots = Array.from({ length: 5 }, (_, index) => {
    const theme = themes[index];
    return theme && matches[theme] ? theme : "";
  });

  return [slots[0] ?? "", slots[1] ?? "", slots[2] ?? "", slots[3] ?? "", slots[4] ?? ""];
}

export function buildReviewzonFallbackSummary(rows: ReviewExtractedRow[]): {
  summary: ReviewThemeSummary;
  mappedRows: ReviewMappedRow[];
} {
  const topPros = countThemes(rows, "pros").map(([theme]) => theme).slice(0, 5);
  const topCons = countThemes(rows, "cons").map(([theme]) => theme).slice(0, 5);
  const summary = reviewThemeSummarySchema.parse({ topPros, topCons });
  const mappedRows = rows.map((row) =>
    reviewMappedRowSchema.parse({
      ...row,
      positiveSlots: buildFixedSlots(row.pros, summary.topPros),
      negativeSlots: buildFixedSlots(row.cons, summary.topCons),
    }),
  );

  return { summary, mappedRows };
}

async function analyzeReviewChunk(rows: ImportedReviewRow[]): Promise<ReviewExtractedRow[]> {
  const parsed = await callOpenRouter<z.infer<typeof reviewChunkResponseSchema>>(
    [
      {
        role: "system",
        content: "你负责把评论转成结构化用户反馈。只能返回 JSON，不能解释，不能输出 markdown。",
      },
      {
        role: "user",
        content: buildChunkReviewPrompt(rows),
      },
    ],
    { type: "json_object" },
  );
  const response = reviewChunkResponseSchema.parse(parsed);
  const parsedById = new Map(response.r.map((row) => [row.id, row]));

  return rows.map((row) => {
    const matched = parsedById.get(row.id);
    if (!matched) throw new Error(`Missing result for row ${row.id}`);

    return postProcessReviewzonExtractedRow(
      reviewExtractedRowSchema.parse({
        ...row,
        pros: matched.p.map(cleanFeedbackPoint).filter((point): point is ReviewFeedbackPoint => point !== null),
        cons: matched.c.map(cleanFeedbackPoint).filter((point): point is ReviewFeedbackPoint => point !== null),
      }),
    );
  });
}

async function analyzeChunkWithFallback(rows: ImportedReviewRow[]): Promise<ReviewExtractedRow[]> {
  if (rows.length === 1) {
    try {
      return await analyzeReviewChunk(rows);
    } catch {
      return rows.map((row) => reviewExtractedRowSchema.parse({ ...row, pros: [], cons: [] }));
    }
  }

  try {
    return await analyzeReviewChunk(rows);
  } catch {
    const midpoint = Math.ceil(rows.length / 2);
    const [left, right] = [rows.slice(0, midpoint), rows.slice(midpoint)];
    const [leftResults, rightResults] = await Promise.all([analyzeChunkWithFallback(left), analyzeChunkWithFallback(right)]);
    return [...leftResults, ...rightResults];
  }
}

function raceInFlight(inFlight: Map<number, Promise<ChunkTaskResult>>): Promise<ChunkTaskResult> {
  return Promise.race([...inFlight.entries()].map(([index, task]) => task.then((result) => ({ ...result, index }))));
}

export async function* analyzeReviewzonBatchStream(rows: ImportedReviewRow[]): AsyncGenerator<AnalyzeStreamEvent> {
  const parsedRows = rows.map((row) => importedReviewRowSchema.parse(row));
  const chunks = buildAdaptiveChunks(parsedRows);
  const total = parsedRows.length;
  let completed = 0;
  let nextChunkIndex = 0;
  const inFlight = new Map<number, Promise<ChunkTaskResult>>();
  const extractedRows = new Map<string, ReviewExtractedRow>();

  yield { type: "progress", total, completed };

  const launchChunk = (chunkIndex: number) => {
    const chunkRows = chunks[chunkIndex];
    if (!chunkRows) return;
    const task = analyzeChunkWithFallback(chunkRows).then((chunkResults) => ({
      index: chunkIndex,
      rows: chunkResults,
    }));
    inFlight.set(chunkIndex, task);
  };

  while (nextChunkIndex < chunks.length && inFlight.size < Math.min(ANALYSIS_CONCURRENCY, chunks.length)) {
    launchChunk(nextChunkIndex);
    nextChunkIndex += 1;
  }

  while (inFlight.size > 0) {
    const result = await raceInFlight(inFlight);
    inFlight.delete(result.index);
    completed += result.rows.length;

    for (const row of result.rows) extractedRows.set(row.id, row);
    yield { type: "progress", total, completed };

    if (nextChunkIndex < chunks.length) {
      launchChunk(nextChunkIndex);
      nextChunkIndex += 1;
    }
  }

  const orderedRows = parsedRows
    .map((row) => extractedRows.get(row.id))
    .filter((row): row is ReviewExtractedRow => row !== undefined);
  const { summary, mappedRows } = buildReviewzonFallbackSummary(orderedRows);

  yield { type: "summary", topPros: summary.topPros, topCons: summary.topCons };

  for (let index = 0; index < mappedRows.length; index += EMIT_CHUNK_SIZE) {
    yield { type: "chunk", rows: mappedRows.slice(index, index + EMIT_CHUNK_SIZE) };
  }

  yield { type: "done", total, completed: mappedRows.length };
}

