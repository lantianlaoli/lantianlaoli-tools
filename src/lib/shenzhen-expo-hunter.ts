import type {
  ExpoHunterExpo,
  ExpoHunterLead,
  ExpoHunterSubreddit,
  ExpoHunterPhoto,
  ExpoHunterIndustryIntel,
  ExpoHunterComment,
  ExpoHunterDiscussion,
  ExpoHunterSubredditDiscussionGroup,
  ShenzhenExpoHunterSearchSettings,
} from "./types";
import { normalizeComment, normalizePost } from "./steady-reddit";
import { callOpenRouter } from "./openrouter";

type RawSubredditData = {
  display_name_prefixed?: string;
  title?: string;
  public_description?: string;
  subscribers?: number;
};

type RawPostData = {
  title?: string;
  selftext?: string;
  author?: string;
  subreddit_name_prefixed?: string;
  created_utc?: number;
  score?: number;
  num_comments?: number;
  permalink?: string;
  url?: string;
  url_overridden_by_dest?: string;
  preview?: {
    enabled?: boolean;
    images?: Array<{
      source?: { url?: string; width?: number; height?: number };
      resolutions?: Array<{ url?: string; width?: number; height?: number }>;
    }>;
  };
};

type RawCommentData = {
  body?: string;
  author?: string;
  subreddit_name_prefixed?: string;
  created_utc?: number;
  score?: number;
  permalink?: string;
  link_permalink?: string;
  link_title?: string;
};

export const PURCHASE_INTENT_WORDS = [
  "supplier",
  "manufacturer",
  "factory",
  "OEM",
  "ODM",
  "catalog",
  "product sheet",
  "looking for",
  "where to buy",
  "wholesale",
  "bulk",
  "quote",
  "sample",
  "MOQ",
  "shipping",
  "sourcing",
  "import",
  "distributor",
  "supply chain",
  "trade show",
];

export const REMOTE_EXPO_INTENT_WORDS = [
  "can't attend",
  "cannot attend",
  "couldn't attend",
  "unable to attend",
  "not able to attend",
  "wish I could go",
  "wish I could attend",
  "anyone going",
  "if anyone is going",
  "can someone share",
  "please share",
  "booth photos",
  "show floor",
  "catalog",
  "catalogue",
  "product catalog",
  "product catalogue",
  "brochure",
  "flyer",
  "leaflet",
  "pamphlet",
  "handout",
  "photos",
  "pictures",
  "video",
  "livestream",
  "现场照片",
  "产品册",
  "宣传册",
  "传单",
  "资料",
];

export const RECENT_DISCUSSION_WINDOW_DAYS = 183;
const RECENT_DISCUSSION_WINDOW_SECONDS = RECENT_DISCUSSION_WINDOW_DAYS * 24 * 60 * 60;

const INDUSTRY_KEYWORD_MAP: Record<string, string[]> = {
  electronics: ["electronics", "electronic", "consumer electronics", "gadget", "PCB", "component", "电子", "元器件", "半导体", "芯片"],
  apparel: ["clothing", "apparel", "garment", "textile", "fashion", "服装", "纺织", "服饰", "时装"],
  toy: ["toy", "plush", "action figure", "educational toy", "玩具", "玩偶", "公仔"],
  furniture: ["furniture", "home decor", "interior", "furnishing", "家具", "家居", "装饰"],
  gift: ["gift", "premium", "novelty", "souvenir", "礼品", "赠品", "纪念品"],
  hardware: ["hardware", "tool", "machinery", "industrial", "五金", "工具", "机械"],
  packaging: ["packaging", "printing", "label", "box", "包装", "印刷", "标签"],
  automotive: ["auto parts", "car accessory", "automotive", "汽车", "配件", "车品"],
  medical: ["medical device", "healthcare", "surgical", "diagnostic", "医疗", "器械", "诊断"],
  beauty: ["cosmetics", "beauty", "skincare", "personal care", "美容", "化妆", "护肤"],
  sports: ["sports", "outdoor", "fitness", "camping", "运动", "户外", "健身", "野营"],
  lighting: ["LED", "lighting", "lamp", "illumination", "照明", "灯饰", "LED灯"],
};

export function extractIndustryKeywords(name: string, location?: string): string[] {
  const text = `${name} ${location ?? ""}`.toLowerCase();

  const matched: string[] = [];
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        matched.push(industry);
        break;
      }
    }
  }

  if (matched.length === 0) {
    matched.push("general");
  }

  return matched;
}

export const SCHEDULE_OCR_PROMPT = [
  "You are an expo schedule OCR assistant. Analyze this image of an expo schedule and extract every expo listed.",
  "For each expo, return:",
  "- name: the full expo/event name (keep original language)",
  "- date: the date or date range (e.g. \"2026-06-15\", \"2026-06-15 ~ 2026-06-18\", \"June 15-18, 2026\")",
  "- location: the venue/city (e.g. \"深圳会展中心\", \"Shenzhen Convention Center\")",
  "",
  "Return a JSON object with this shape:",
  '{ "expos": [{ "name": "...", "date": "...", "location": "..." }, ...] }',
  "If you cannot read the schedule, return { \"expos\": [] }.",
  "Only return valid JSON, no markdown fences or extra text.",
].join("\n");

type RawExpoOcrResult = {
  expos?: Array<{ name?: string; date?: string; location?: string }>;
};

export async function parseExpoScheduleFromImage(
  imageDataUrl: string,
): Promise<ExpoHunterExpo[]> {
  const messages = [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: SCHEDULE_OCR_PROMPT },
        { type: "image_url" as const, image_url: { url: imageDataUrl } },
      ],
    },
  ];

  const result = await callOpenRouter<RawExpoOcrResult>(messages, {
    type: "json_object",
  });

  if (!result.expos || result.expos.length === 0) {
    return [];
  }

  return result.expos
    .filter((e) => e.name && e.name.trim().length > 1)
    .map((e) => {
      const name = (e.name ?? "").trim();
      const date = (e.date ?? "").trim() || undefined;
      const location = (e.location ?? "").trim() || undefined;
      return {
        id: `expo_${Math.random().toString(36).slice(2, 10)}`,
        name,
        date,
        location,
        industryKeywords: extractIndustryKeywords(name, location),
      };
    });
}

export function parseExpoSchedule(text: string): ExpoHunterExpo[] {
  if (!text || !text.trim()) return [];

  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const expos: ExpoHunterExpo[] = [];

  for (const line of lines) {
    const cleaned = line
      .replace(/^\|?\s*/, "")
      .replace(/\s*\|?\s*$/, "")
      .replace(/\s*\|\s*/g, " | ");

    const expo = parseExpoLine(cleaned);
    if (expo) {
      expos.push(expo);
    }
  }

  return expos;
}

function parseExpoLine(line: string): ExpoHunterExpo | null {
  if (line.length < 3) return null;

  const parts = line.split(/\s*\|\s*/);

  let name = "";
  let date = "";
  let location = "";
  let rawParts: string[];

  if (parts.length >= 3) {
    rawParts = parts;
  } else {
    rawParts = line.split(/\s{2,}/);
  }

  if (rawParts.length >= 3) {
    name = rawParts[0].trim();
    date = rawParts[1].trim();
    location = rawParts[2].trim();
  } else if (rawParts.length === 2) {
    name = rawParts[0].trim();
    date = rawParts[1].trim();
  } else {
    name = rawParts[0].trim();
  }

  if (!name) return null;

  const dateMatch = date.match(
    /(\d{4}[./-]\d{1,2}[./-]\d{1,2})|(\d{1,2}[./-]\d{1,2}[./-]\d{4})|(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日?)/,
  );
  const extractedDate = dateMatch ? dateMatch[0] : undefined;

  if (extractedDate) {
    date = extractedDate;
  }

  const keywords = extractIndustryKeywords(name, location);

  return {
    id: `expo_${Math.random().toString(36).slice(2, 10)}`,
    name,
    date: date || undefined,
    location: location || undefined,
    industryKeywords: keywords,
  };
}

export function generateSearchQueries(
  expo: ExpoHunterExpo,
  depth: "precise" | "broad",
): string[] {
  const queries: string[] = [];

  const baseTerms: string[] = [expo.name];

  for (const kw of expo.industryKeywords) {
    if (kw !== "general" && !baseTerms.some((t) => t.toLowerCase().includes(kw))) {
      baseTerms.push(kw);
    }
  }

  const purchaseWords =
    depth === "precise"
      ? PURCHASE_INTENT_WORDS.slice(0, 8)
      : PURCHASE_INTENT_WORDS;

  for (const base of baseTerms.slice(0, 4)) {
    const term = base.toLowerCase().trim();
    for (const intent of purchaseWords) {
      queries.push(`${term} ${intent}`);
    }
    for (const intent of REMOTE_EXPO_INTENT_WORDS.slice(0, depth === "precise" ? 12 : REMOTE_EXPO_INTENT_WORDS.length)) {
      queries.push(`${term} ${intent}`);
    }
  }

  return [...new Set(queries)];
}

export function scoreSubreddit(raw: RawSubredditData, keywords: string[]): number {
  let score = 0;
  const text = `${raw.title ?? ""} ${raw.public_description ?? ""}`.toLowerCase();

  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      score += 0.2;
    }
  }

  const subscribers = raw.subscribers ?? 0;
  if (subscribers > 100000) score += 0.15;
  else if (subscribers > 10000) score += 0.1;
  else if (subscribers > 1000) score += 0.05;

  if (raw.title && raw.public_description) score += 0.05;

  return Math.min(1, score);
}

function matchedDiscussionKeywords(content: string, keywords: string[]): string[] {
  const lower = content.toLowerCase();
  return [...PURCHASE_INTENT_WORDS, ...REMOTE_EXPO_INTENT_WORDS, ...keywords].filter((word) =>
    lower.includes(word.toLowerCase()),
  );
}

export function scoreLead(
  post: {
    title: string;
    selftext: string;
    score: number;
    numComments: number;
  },
  keywords: string[],
  hasImages: boolean,
): number {
  let score = 0;
  const content = `${post.title} ${post.selftext}`.toLowerCase();

  for (const kw of keywords) {
    if (content.includes(kw.toLowerCase())) {
      score += 0.15;
    }
  }

  for (const intent of PURCHASE_INTENT_WORDS) {
    if (content.includes(intent.toLowerCase())) {
      score += 0.1;
    }
  }

  if (post.score > 100) score += 0.1;
  else if (post.score > 10) score += 0.05;

  if (post.numComments > 50) score += 0.08;
  else if (post.numComments > 10) score += 0.04;

  if (hasImages) score += 0.05;

  return Math.min(1, score);
}

export type ClassifiedPost =
  | { type: "lead"; lead: ExpoHunterLead }
  | { type: "photo"; photo: ExpoHunterPhoto }
  | { type: "intel"; intel: ExpoHunterIndustryIntel }
  | { type: "skip" };

export function classifyPost(
  raw: RawPostData,
  keywords: string[],
): ClassifiedPost {
  const normalized = normalizePost(raw);
  const { lead, photo, images } = normalized;

  if (!lead) return { type: "skip" };

  const contentText = `${lead.title} ${lead.selftext}`.toLowerCase();
  const hasPurchaseIntent = PURCHASE_INTENT_WORDS.some((w) =>
    contentText.includes(w.toLowerCase()),
  );
  const hasIndustryKeyword = keywords.some((kw) =>
    contentText.includes(kw.toLowerCase()),
  );

  const confidence = scoreLead(lead, keywords, images.length > 0);

  if (hasPurchaseIntent && confidence > 0.15) {
    return {
      type: "lead",
      lead: {
        ...lead,
        sourceType: "post",
        matchedKeywords: matchedDiscussionKeywords(contentText, keywords),
        confidence,
      },
    };
  }

  if (photo && (hasIndustryKeyword || confidence > 0.1)) {
    return { type: "photo", photo };
  }

  if (hasIndustryKeyword && confidence > 0.05) {
    return {
      type: "intel",
      intel: {
        ...lead,
        sourceType: "post",
        matchedKeywords: matchedDiscussionKeywords(contentText, keywords),
        confidence,
      },
    };
  }

  return { type: "skip" };
}

export function classifyComment(
  raw: RawCommentData,
  keywords: string[],
): ExpoHunterComment | null {
  const normalized = normalizeComment(raw);
  const contentText = `${normalized.title} ${normalized.selftext}`.toLowerCase();
  const matchedKeywords = matchedDiscussionKeywords(contentText, keywords);
  const hasRemoteExpoIntent = REMOTE_EXPO_INTENT_WORDS.some((word) =>
    contentText.includes(word.toLowerCase()),
  );
  const hasIndustryKeyword = keywords.some((kw) =>
    contentText.includes(kw.toLowerCase()),
  );
  const confidence = Math.min(
    1,
    matchedKeywords.length * 0.12 +
      (hasRemoteExpoIntent ? 0.25 : 0) +
      (hasIndustryKeyword ? 0.1 : 0) +
      (normalized.score > 10 ? 0.05 : 0),
  );

  if (!hasRemoteExpoIntent && confidence < 0.2) {
    return null;
  }

  return {
    sourceType: "comment",
    title: normalized.title,
    selftext: normalized.selftext,
    author: normalized.author,
    subreddit: normalized.subreddit,
    createdUtc: normalized.createdUtc,
    score: normalized.score,
    numComments: 0,
    permalink: normalized.permalink,
    url: normalized.url,
    postTitle: normalized.postTitle,
    postPermalink: normalized.postPermalink,
    matchedKeywords,
    confidence,
  };
}

export function deduplicateLeads(posts: ExpoHunterLead[]): ExpoHunterLead[] {
  const seen = new Set<string>();
  const result: ExpoHunterLead[] = [];
  for (const post of posts) {
    const key = post.permalink || post.url;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(post);
    }
  }
  return result;
}

export function deduplicateSubreddits(
  subs: ExpoHunterSubreddit[],
): ExpoHunterSubreddit[] {
  const seen = new Set<string>();
  const result: ExpoHunterSubreddit[] = [];
  for (const sub of subs) {
    if (!seen.has(sub.name)) {
      seen.add(sub.name);
      result.push(sub);
    }
  }
  return result;
}

export function deduplicatePhotos(photos: ExpoHunterPhoto[]): ExpoHunterPhoto[] {
  const seen = new Set<string>();
  const result: ExpoHunterPhoto[] = [];
  for (const photo of photos) {
    const key = photo.url;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(photo);
    }
  }
  return result;
}

export function deduplicateIntel(intel: ExpoHunterIndustryIntel[]): ExpoHunterIndustryIntel[] {
  const seen = new Set<string>();
  const result: ExpoHunterIndustryIntel[] = [];
  for (const item of intel) {
    const key = item.permalink || item.url;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function deduplicateComments(comments: ExpoHunterComment[]): ExpoHunterComment[] {
  const seen = new Set<string>();
  const result: ExpoHunterComment[] = [];
  for (const comment of comments) {
    const key = comment.permalink || `${comment.author}:${comment.createdUtc}:${comment.selftext}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(comment);
    }
  }
  return result;
}

export function isRecentRedditDiscussion(createdUtc: number, nowMs = Date.now()): boolean {
  if (!Number.isFinite(createdUtc) || createdUtc <= 0) return false;
  const cutoffUtc = Math.floor(nowMs / 1000) - RECENT_DISCUSSION_WINDOW_SECONDS;
  return createdUtc >= cutoffUtc;
}

export function groupDiscussionsBySubreddit(
  discussions: ExpoHunterDiscussion[],
): ExpoHunterSubredditDiscussionGroup[] {
  const grouped = new Map<string, ExpoHunterDiscussion[]>();

  for (const discussion of discussions) {
    const subreddit = discussion.subreddit || "unknown";
    const current = grouped.get(subreddit) ?? [];
    current.push(discussion);
    grouped.set(subreddit, current);
  }

  return Array.from(grouped.entries())
    .map(([subreddit, items]) => ({
      subreddit,
      discussions: items.sort((a, b) => b.createdUtc - a.createdUtc),
    }))
    .sort((a, b) => {
      const countDiff = b.discussions.length - a.discussions.length;
      if (countDiff !== 0) return countDiff;
      return b.discussions[0].createdUtc - a.discussions[0].createdUtc;
    });
}

export const DEFAULT_SEARCH_SETTINGS: ShenzhenExpoHunterSearchSettings = {
  maxSubreddits: 5,
  maxPosts: 30,
  depth: "precise",
};

export function mergeSearchSettings(
  partial?: Partial<ShenzhenExpoHunterSearchSettings>,
): ShenzhenExpoHunterSearchSettings {
  return { ...DEFAULT_SEARCH_SETTINGS, ...(partial ?? {}) };
}
