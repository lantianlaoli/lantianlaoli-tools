const STEADY_REDDIT_BASE = "https://api.steadyapi.com";

class NonRetryableSteadyApiError extends Error {}

function getSteadyApiKey(): string {
  const apiKey = process.env.STEADY_API_KEY;
  if (!apiKey) throw new Error("STEADY_API_KEY is not configured. Add it to your .env file.");
  return apiKey;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  timeoutMs = 30000,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const message = `Steady API request failed: ${response.status} ${await response.text()}`;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new NonRetryableSteadyApiError(message);
        }
        throw new Error(message);
      }
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (error instanceof NonRetryableSteadyApiError) {
        throw error;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastError;
}

async function fetchFromSteady(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, STEADY_REDDIT_BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetchWithRetry(url.toString(), {
    headers: {
      Authorization: `Bearer ${getSteadyApiKey()}`,
      Accept: "application/json",
    },
  });

  return response.json();
}

type SteadyListing<T> =
  | { meta?: unknown; body?: T[] }
  | { success?: boolean; data?: Record<string, T[]> }
  | T[];

function listingItems<T>(payload: SteadyListing<T>, legacyKey: string): T[] {
  if (Array.isArray(payload)) return payload;
  if ("body" in payload && Array.isArray(payload.body)) return payload.body;
  const legacyItems = "data" in payload ? payload.data?.[legacyKey] : undefined;
  return Array.isArray(legacyItems) ? legacyItems : [];
}

type RawSubredditData = {
  display_name_prefixed?: string;
  display_name?: string;
  subreddit?: string;
  title?: string;
  public_description?: string;
  subscribers?: number;
};

type RawPostData = {
  title?: string;
  selftext?: string;
  body?: string;
  author?: string;
  subreddit_name_prefixed?: string;
  subreddit?: string;
  created_utc?: number;
  created?: number;
  score?: number;
  ups?: number;
  num_comments?: number;
  comments?: number;
  permalink?: string;
  url?: string;
  url_overridden_by_dest?: string;
  thumbnail?: string;
  preview?: {
    enabled?: boolean;
    images?: Array<{
      source?: { url?: string; width?: number; height?: number };
      resolutions?: Array<{ url?: string; width?: number; height?: number }>;
    }>;
  };
};

type RawPostItem = {
  kind?: string;
  data?: RawPostData;
} & RawPostData;

type RawPostResponse = {
  success: boolean;
  data: {
    cursor?: string;
    posts: Array<{ kind: string; data: RawPostData }>;
  };
};

type RawCommentData = {
  body?: string;
  selftext?: string;
  author?: string;
  subreddit_name_prefixed?: string;
  subreddit?: string;
  created_utc?: number;
  created?: number;
  score?: number;
  ups?: number;
  permalink?: string;
  url?: string;
  link_permalink?: string;
  link_url?: string;
  link_title?: string;
  title?: string;
};

type RawCommentItem = {
  kind?: string;
  data?: RawCommentData;
} & RawCommentData;

type RawCommentResponse = {
  success: boolean;
  data: {
    cursor?: string;
    comments: Array<{ kind: string; data: RawCommentData }>;
  };
};

function normalizeListingPostItem(item: RawPostItem): { kind: string; data: RawPostData } {
  return {
    kind: item.kind ?? "t3",
    data: item.data ?? item,
  };
}

function normalizeListingCommentItem(item: RawCommentItem): { kind: string; data: RawCommentData } {
  return {
    kind: item.kind ?? "t1",
    data: item.data ?? item,
  };
}

export async function searchPosts(query: string): Promise<RawPostResponse> {
  const payload = (await fetchFromSteady("/v1/reddit/search", {
    search: query,
    filter: "posts",
    timeFilter: "year",
    sortType: "relevance",
  })) as SteadyListing<RawPostItem>;

  return {
    success: true,
    data: {
      posts: listingItems(payload, "posts").map(normalizeListingPostItem),
    },
  };
}

export async function searchComments(query: string): Promise<RawCommentResponse> {
  const payload = (await fetchFromSteady("/v1/reddit/search", {
    search: query,
    filter: "comments",
    timeFilter: "year",
    sortType: "relevance",
  })) as SteadyListing<RawCommentItem>;

  return {
    success: true,
    data: {
      comments: listingItems(payload, "comments").map(normalizeListingCommentItem),
    },
  };
}

export function buildRedditPermalink(permalink: string): string {
  if (!permalink) return "";
  if (/^https?:\/\//i.test(permalink)) return permalink;
  const cleaned = permalink.replace(/^\/?(r\/)/, "/$1");
  return `https://reddit.com${cleaned}`;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function prefixedSubreddit(raw: { subreddit_name_prefixed?: string; subreddit?: string }): string {
  if (raw.subreddit_name_prefixed) return raw.subreddit_name_prefixed;
  if (!raw.subreddit) return "";
  return raw.subreddit.startsWith("r/") ? raw.subreddit : `r/${raw.subreddit}`;
}

function extractPostImages(raw: RawPostData): string[] {
  const images: string[] = [];
  const previewImages = raw.preview?.images;
  if (previewImages) {
    for (const img of previewImages) {
      const url = img.source?.url;
      if (url) {
        images.push(decodeHtmlEntities(url));
      }
    }
  }
  for (const candidate of [raw.url_overridden_by_dest, raw.thumbnail, raw.url]) {
    if (!candidate) continue;
    const dest = decodeHtmlEntities(candidate);
    if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(dest) && !images.includes(dest)) {
      images.push(dest);
    }
  }
  return images;
}

export function normalizeSubreddit(raw: RawSubredditData, relevanceScore: number) {
  const displayName = raw.display_name_prefixed ?? raw.display_name ?? raw.subreddit ?? "";
  const name = displayName && !displayName.startsWith("r/") ? `r/${displayName}` : displayName;
  return {
    name,
    title: raw.title ?? name,
    description: raw.public_description ?? "",
    subscribers: raw.subscribers ?? 0,
    relevanceScore: Math.min(1, Math.max(0, relevanceScore)),
  };
}

export type NormalizedPostResult = {
  lead?: {
    title: string;
    selftext: string;
    author: string;
    subreddit: string;
    createdUtc: number;
    score: number;
    numComments: number;
    permalink: string;
    url: string;
  };
  photo?: {
    url: string;
    postTitle: string;
    postPermalink: string;
    author: string;
    subreddit: string;
  };
  images: string[];
};

export type NormalizedCommentResult = {
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  createdUtc: number;
  score: number;
  permalink: string;
  url: string;
  postTitle: string;
  postPermalink: string;
};

export function normalizePost(raw: RawPostData): NormalizedPostResult {
  const permalink = buildRedditPermalink(raw.permalink ?? raw.url ?? "");
  const title = raw.title ?? "";
  const selftext = raw.selftext ?? raw.body ?? "";
  const author = raw.author ?? "[deleted]";
  const subreddit = prefixedSubreddit(raw);
  const url = raw.url ?? permalink;

  const images = extractPostImages(raw);

  const base = {
    title,
    selftext,
    author,
    subreddit,
    permalink,
  };

  const lead = {
    ...base,
    createdUtc: raw.created_utc ?? raw.created ?? 0,
    score: raw.score ?? raw.ups ?? 0,
    numComments: raw.num_comments ?? raw.comments ?? 0,
    url,
  };

  const photo =
    images.length > 0
      ? {
          url: images[0],
          postTitle: title,
          postPermalink: permalink,
          author,
          subreddit,
        }
      : undefined;

  return { lead, photo, images };
}

export function normalizeComment(raw: RawCommentData): NormalizedCommentResult {
  const permalink = buildRedditPermalink(raw.permalink ?? raw.url ?? "");
  const postPermalink = buildRedditPermalink(raw.link_permalink ?? raw.link_url ?? raw.url ?? "");
  const body = raw.body ?? raw.selftext ?? "";
  const postTitle = raw.link_title ?? raw.title ?? "Reddit comment";

  return {
    title: postTitle,
    selftext: body,
    author: raw.author ?? "[deleted]",
    subreddit: prefixedSubreddit(raw),
    createdUtc: raw.created_utc ?? raw.created ?? 0,
    score: raw.score ?? raw.ups ?? 0,
    permalink,
    url: permalink,
    postTitle,
    postPermalink,
  };
}
