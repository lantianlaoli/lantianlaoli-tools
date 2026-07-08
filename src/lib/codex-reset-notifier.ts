import { createHmac, randomBytes } from "node:crypto";
import type {
  CodexResetNotice,
  CodexResetNotifierResponse,
  CodexResetNotifierSettings,
} from "./types";

const X_RECENT_SEARCH_URL = "https://api.x.com/2/tweets/search/recent";

export const DEFAULT_CODEX_RESET_ACCOUNTS = ["thsottiaux", "sama", "OpenAI", "benedictk__"];
export const DEFAULT_CODEX_RESET_EMAIL_RECIPIENTS = ["1695219012@qq.com"];
export const DEFAULT_CODEX_RESET_KEYWORDS = [
  "codex reset",
  "reset",
  "banked reset",
  "usage limit",
  "limits",
];

const DEFAULT_MAX_RESULTS = 25;
const MAX_RESULTS_LIMIT = 100;

type XOAuthCredentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

type OAuthHeaderOptions = {
  nonce?: string;
  timestamp?: string;
};

type XRecentSearchUser = {
  id?: string;
  name?: string;
  username?: string;
};

type XRecentSearchTweet = {
  id?: string;
  text?: string;
  author_id?: string;
  created_at?: string;
};

type XRecentSearchPayload = {
  data?: XRecentSearchTweet[];
  includes?: {
    users?: XRecentSearchUser[];
  };
  meta?: {
    result_count?: number;
  };
};

export function normalizeCodexResetSettings(
  settings?: Partial<CodexResetNotifierSettings>,
): CodexResetNotifierSettings {
  const accounts = normalizeList(settings?.accounts, DEFAULT_CODEX_RESET_ACCOUNTS)
    .map((account) => account.replace(/^@/, ""))
    .filter(Boolean);
  const keywords = normalizeList(settings?.keywords, DEFAULT_CODEX_RESET_KEYWORDS);
  const maxResults = Math.min(
    MAX_RESULTS_LIMIT,
    Math.max(10, Math.floor(Number(settings?.maxResults ?? DEFAULT_MAX_RESULTS))),
  );

  return {
    accounts: accounts.length ? accounts : DEFAULT_CODEX_RESET_ACCOUNTS,
    keywords: keywords.length ? keywords : DEFAULT_CODEX_RESET_KEYWORDS,
    maxResults,
  };
}

function normalizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .map((item) => String(item).trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

export function buildCodexResetSearchQuery(settings?: Partial<CodexResetNotifierSettings>): string {
  const normalized = normalizeCodexResetSettings(settings);
  const accountQuery = normalized.accounts.map((account) => `from:${account}`).join(" OR ");
  const keywordQuery = normalized.keywords.map(formatSearchKeyword).join(" OR ");
  return `(${accountQuery}) (${keywordQuery}) -is:retweet`;
}

function formatSearchKeyword(keyword: string): string {
  const cleaned = keyword.trim().replace(/"/g, "");
  return /\s/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

function getXOAuthCredentials(): XOAuthCredentials {
  const credentials = {
    apiKey: firstConfiguredEnv("X_API_KEY", "X_CONSUMER_KEY"),
    apiSecret: firstConfiguredEnv("X_API_SECRET", "X_CONSUMER_SECRET"),
    accessToken: process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  };
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => envNameForCredential(key));
  if (missing.length > 0) {
    throw new Error(`X API OAuth 1.0a credentials are not configured: ${missing.join(", ")}.`);
  }
  return credentials as XOAuthCredentials;
}

function firstConfiguredEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function envNameForCredential(key: string): string {
  if (key === "apiKey") return "X_API_KEY or X_CONSUMER_KEY";
  if (key === "apiSecret") return "X_API_SECRET or X_CONSUMER_SECRET";
  if (key === "accessToken") return "X_ACCESS_TOKEN";
  return "X_ACCESS_TOKEN_SECRET";
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildOAuth1AuthorizationHeader(
  method: string,
  url: string,
  queryParams: Record<string, string>,
  credentials: XOAuthCredentials,
  options: OAuthHeaderOptions = {},
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: options.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: options.timestamp ?? Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };
  const signatureParams = { ...queryParams, ...oauthParams };
  const normalizedParams = Object.entries(signatureParams)
    .map(([key, value]) => [percentEncode(key), percentEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(normalizedParams),
  ].join("&");
  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessTokenSecret)}`;
  const oauthSignature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  return `OAuth ${Object.entries({ ...oauthParams, oauth_signature: oauthSignature })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`;
}

function buildRecentSearchParams(settings: CodexResetNotifierSettings): Record<string, string> {
  return {
    query: buildCodexResetSearchQuery(settings),
    "tweet.fields": "created_at,author_id,conversation_id,public_metrics",
    expansions: "author_id",
    "user.fields": "username,name,verified",
    max_results: String(settings.maxResults),
  };
}

export function normalizeCodexResetNotices(
  payload: XRecentSearchPayload,
  settings?: Partial<CodexResetNotifierSettings>,
): CodexResetNotice[] {
  const normalizedSettings = normalizeCodexResetSettings(settings);
  const usersById = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));
  const seen = new Set<string>();

  return (payload.data ?? [])
    .flatMap((tweet): CodexResetNotice[] => {
      if (!tweet.id || !tweet.text || seen.has(tweet.id)) return [];
      seen.add(tweet.id);
      const matchedKeywords = findMatchedKeywords(tweet.text, normalizedSettings.keywords);
      if (matchedKeywords.length === 0) return [];
      const user = usersById.get(tweet.author_id);
      const username = user?.username ?? "unknown";
      return [{
        id: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id ?? "",
        username,
        name: user?.name ?? username,
        createdAt: tweet.created_at ?? "",
        url: `https://x.com/${username}/status/${tweet.id}`,
        matchedKeywords,
      }];
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function findMatchedKeywords(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();
  return keywords.filter((keyword) => {
    const normalized = keyword.trim().toLowerCase();
    return normalized.length > 0 && lowerText.includes(normalized);
  });
}

export async function fetchCodexResetNotices(
  settings?: Partial<CodexResetNotifierSettings>,
): Promise<CodexResetNotifierResponse> {
  const normalizedSettings = normalizeCodexResetSettings(settings);
  const queryParams = buildRecentSearchParams(normalizedSettings);
  const url = new URL(X_RECENT_SEARCH_URL);
  Object.entries(queryParams).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: buildOAuth1AuthorizationHeader(
        "GET",
        X_RECENT_SEARCH_URL,
        queryParams,
        getXOAuthCredentials(),
      ),
      Accept: "application/json",
    },
  });

  const checkedAt = new Date().toISOString();
  const rateLimit = {
    limit: response.headers.get("x-rate-limit-limit") ?? undefined,
    remaining: response.headers.get("x-rate-limit-remaining") ?? undefined,
    reset: response.headers.get("x-rate-limit-reset") ?? undefined,
  };

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`X API request failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as XRecentSearchPayload;
  return {
    success: true,
    notices: normalizeCodexResetNotices(payload, normalizedSettings),
    checkedAt,
    rateLimit,
  };
}
