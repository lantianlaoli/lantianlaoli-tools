import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as checkCodexResetNotices } from "../src/app/api/codex-reset-notifier/check/route";
import { POST as sendCodexResetNoticeEmailRoute } from "../src/app/api/codex-reset-notifier/email/route";
import {
  buildCodexResetEmailContent,
  normalizeCodexResetEmailRecipients,
} from "../src/lib/codex-reset-email";
import {
  buildCodexResetSearchQuery,
  buildOAuth1AuthorizationHeader,
  DEFAULT_CODEX_RESET_ACCOUNTS,
  DEFAULT_CODEX_RESET_EMAIL_RECIPIENTS,
  fetchCodexResetNotices,
  normalizeCodexResetNotices,
} from "../src/lib/codex-reset-notifier";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function withXEnv() {
  const original = {
    X_API_KEY: process.env.X_API_KEY,
    X_API_SECRET: process.env.X_API_SECRET,
    X_CONSUMER_KEY: process.env.X_CONSUMER_KEY,
    X_CONSUMER_SECRET: process.env.X_CONSUMER_SECRET,
    X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
    X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET,
  };
  process.env.X_API_KEY = "test-api-key";
  process.env.X_API_SECRET = "test-api-secret";
  delete process.env.X_CONSUMER_KEY;
  delete process.env.X_CONSUMER_SECRET;
  process.env.X_ACCESS_TOKEN = "test-access-token";
  process.env.X_ACCESS_TOKEN_SECRET = "test-access-secret";
  return () => {
    restoreEnv("X_API_KEY", original.X_API_KEY);
    restoreEnv("X_API_SECRET", original.X_API_SECRET);
    restoreEnv("X_CONSUMER_KEY", original.X_CONSUMER_KEY);
    restoreEnv("X_CONSUMER_SECRET", original.X_CONSUMER_SECRET);
    restoreEnv("X_ACCESS_TOKEN", original.X_ACCESS_TOKEN);
    restoreEnv("X_ACCESS_TOKEN_SECRET", original.X_ACCESS_TOKEN_SECRET);
  };
}

test("OAuth 1.0a header contains required fields and is stable with fixed nonce", () => {
  const credentials = {
    apiKey: "api-key",
    apiSecret: "api-secret",
    accessToken: "access-token",
    accessTokenSecret: "access-secret",
  };
  const queryParams = {
    query: "(from:thsottiaux) reset -is:retweet",
    max_results: "10",
  };

  const first = buildOAuth1AuthorizationHeader(
    "GET",
    "https://api.x.com/2/tweets/search/recent",
    queryParams,
    credentials,
    { nonce: "fixed-nonce", timestamp: "1234567890" },
  );
  const second = buildOAuth1AuthorizationHeader(
    "GET",
    "https://api.x.com/2/tweets/search/recent",
    queryParams,
    credentials,
    { nonce: "fixed-nonce", timestamp: "1234567890" },
  );

  assert.equal(first, second);
  assert.match(first, /^OAuth /);
  assert.match(first, /oauth_consumer_key="api-key"/);
  assert.match(first, /oauth_nonce="fixed-nonce"/);
  assert.match(first, /oauth_signature_method="HMAC-SHA1"/);
  assert.match(first, /oauth_timestamp="1234567890"/);
  assert.match(first, /oauth_token="access-token"/);
  assert.match(first, /oauth_signature="/);
});

test("missing X env vars return a clear configuration error", async () => {
  const originalFetch = globalThis.fetch;
  const original = {
    X_API_KEY: process.env.X_API_KEY,
    X_API_SECRET: process.env.X_API_SECRET,
    X_CONSUMER_KEY: process.env.X_CONSUMER_KEY,
    X_CONSUMER_SECRET: process.env.X_CONSUMER_SECRET,
    X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
    X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET,
  };
  delete process.env.X_API_KEY;
  delete process.env.X_API_SECRET;
  delete process.env.X_CONSUMER_KEY;
  delete process.env.X_CONSUMER_SECRET;
  delete process.env.X_ACCESS_TOKEN;
  delete process.env.X_ACCESS_TOKEN_SECRET;
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };

  try {
    await assert.rejects(
      () => fetchCodexResetNotices(),
      /X API OAuth 1\.0a credentials are not configured: X_API_KEY or X_CONSUMER_KEY, X_API_SECRET or X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("X_API_KEY", original.X_API_KEY);
    restoreEnv("X_API_SECRET", original.X_API_SECRET);
    restoreEnv("X_CONSUMER_KEY", original.X_CONSUMER_KEY);
    restoreEnv("X_CONSUMER_SECRET", original.X_CONSUMER_SECRET);
    restoreEnv("X_ACCESS_TOKEN", original.X_ACCESS_TOKEN);
    restoreEnv("X_ACCESS_TOKEN_SECRET", original.X_ACCESS_TOKEN_SECRET);
  }
});

test("OAuth 1.0a credentials accept X consumer key aliases", async () => {
  const originalFetch = globalThis.fetch;
  const original = {
    X_API_KEY: process.env.X_API_KEY,
    X_API_SECRET: process.env.X_API_SECRET,
    X_CONSUMER_KEY: process.env.X_CONSUMER_KEY,
    X_CONSUMER_SECRET: process.env.X_CONSUMER_SECRET,
    X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
    X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET,
  };
  delete process.env.X_API_KEY;
  delete process.env.X_API_SECRET;
  process.env.X_CONSUMER_KEY = "consumer-key";
  process.env.X_CONSUMER_SECRET = "consumer-secret";
  process.env.X_ACCESS_TOKEN = "access-token";
  process.env.X_ACCESS_TOKEN_SECRET = "access-secret";

  let capturedAuthorization = "";
  globalThis.fetch = async (_input, init) => {
    capturedAuthorization = String(new Headers(init?.headers).get("authorization"));
    return new Response(JSON.stringify({ data: [], meta: { result_count: 0 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await fetchCodexResetNotices();
    assert.match(capturedAuthorization, /oauth_consumer_key="consumer-key"/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("X_API_KEY", original.X_API_KEY);
    restoreEnv("X_API_SECRET", original.X_API_SECRET);
    restoreEnv("X_CONSUMER_KEY", original.X_CONSUMER_KEY);
    restoreEnv("X_CONSUMER_SECRET", original.X_CONSUMER_SECRET);
    restoreEnv("X_ACCESS_TOKEN", original.X_ACCESS_TOKEN);
    restoreEnv("X_ACCESS_TOKEN_SECRET", original.X_ACCESS_TOKEN_SECRET);
  }
});

test("search query includes monitored accounts, keywords, and retweet exclusion", () => {
  const query = buildCodexResetSearchQuery({
    accounts: DEFAULT_CODEX_RESET_ACCOUNTS,
    keywords: ["codex reset", "reset", "banked reset", "usage limit", "limits"],
  });

  assert.match(query, /from:thsottiaux/);
  assert.match(query, /from:sama/);
  assert.match(query, /from:OpenAI/);
  assert.match(query, /from:benedictk__/);
  assert.match(query, /"codex reset"/);
  assert.match(query, /"banked reset"/);
  assert.match(query, /"usage limit"/);
  assert.match(query, /-is:retweet/);
});

test("email recipients default to the test recipient and filter invalid addresses", () => {
  assert.deepEqual(DEFAULT_CODEX_RESET_EMAIL_RECIPIENTS, ["1695219012@qq.com"]);
  assert.deepEqual(
    normalizeCodexResetEmailRecipients([" USER@Example.com ", "bad", "1695219012@qq.com"]),
    ["user@example.com", "1695219012@qq.com"],
  );
});

test("Codex reset email content includes notice links and escaped text", () => {
  const content = buildCodexResetEmailContent([
    {
      id: "email-1",
      text: "Codex reset <script>alert(1)</script>",
      authorId: "u1",
      username: "benedictk__",
      name: "Benedict",
      createdAt: "2026-07-02T10:00:00.000Z",
      url: "https://x.com/benedictk__/status/email-1",
      matchedKeywords: ["reset"],
    },
  ]);

  assert.match(content.subject, /@benedictk__/);
  assert.match(content.html, /https:\/\/x\.com\/benedictk__\/status\/email-1/);
  assert.match(content.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(content.text, /Codex reset/);
});

test("POST /api/codex-reset-notifier/email sends Resend email", async () => {
  const originalFetch = globalThis.fetch;
  const original = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
  };
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM = "Codex Reset <notice@example.com>";
  let capturedUrl = "";
  let capturedAuthorization = "";
  let capturedBody = "";
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedAuthorization = String(new Headers(init?.headers).get("authorization"));
    capturedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ data: { id: "email-id" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await sendCodexResetNoticeEmailRoute(
      new Request("http://localhost:3000/api/codex-reset-notifier/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipients: ["1695219012@qq.com"],
          notices: [{
            id: "10",
            text: "Banked reset is available for Codex users.",
            authorId: "u1",
            username: "OpenAI",
            name: "OpenAI",
            createdAt: "2026-06-30T12:00:00.000Z",
            url: "https://x.com/OpenAI/status/10",
            matchedKeywords: ["banked reset"],
          }],
        }),
      }),
    );
    const payload = await response.json();
    const body = JSON.parse(capturedBody);

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.id, "email-id");
    assert.equal(capturedUrl, "https://api.resend.com/emails");
    assert.equal(capturedAuthorization, "Bearer test-resend-key");
    assert.deepEqual(body.to, ["1695219012@qq.com"]);
    assert.equal(body.from, "Codex Reset <notice@example.com>");
    assert.match(body.subject, /Codex reset notice/);
    assert.match(body.html, /Banked reset/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("RESEND_API_KEY", original.RESEND_API_KEY);
    restoreEnv("RESEND_FROM", original.RESEND_FROM);
  }
});

test("X API response normalizes to Codex reset notices", () => {
  const notices = normalizeCodexResetNotices(
    {
      data: [
        {
          id: "1",
          text: "Codex reset is rolling out with banked reset support.",
          author_id: "u1",
          created_at: "2026-06-30T12:00:00.000Z",
        },
      ],
      includes: {
        users: [{ id: "u1", username: "thsottiaux", name: "Tibo" }],
      },
    },
    { keywords: ["codex reset", "banked reset"] },
  );

  assert.equal(notices.length, 1);
  assert.equal(notices[0].id, "1");
  assert.equal(notices[0].username, "thsottiaux");
  assert.equal(notices[0].name, "Tibo");
  assert.equal(notices[0].url, "https://x.com/thsottiaux/status/1");
  assert.deepEqual(notices[0].matchedKeywords, ["codex reset", "banked reset"]);
});

test("normalization deduplicates tweet ids and filters unrelated posts", () => {
  const notices = normalizeCodexResetNotices(
    {
      data: [
        {
          id: "1",
          text: "Codex reset now.",
          author_id: "u1",
          created_at: "2026-06-30T12:00:00.000Z",
        },
        {
          id: "1",
          text: "Codex reset duplicate.",
          author_id: "u1",
          created_at: "2026-06-30T12:01:00.000Z",
        },
        {
          id: "2",
          text: "Shipping a different feature today.",
          author_id: "u1",
          created_at: "2026-06-30T12:02:00.000Z",
        },
      ],
      includes: {
        users: [{ id: "u1", username: "OpenAI", name: "OpenAI" }],
      },
    },
    { keywords: ["reset"] },
  );

  assert.equal(notices.length, 1);
  assert.equal(notices[0].id, "1");
});

test("POST /api/codex-reset-notifier/check calls X recent search and returns notices", async () => {
  const originalFetch = globalThis.fetch;
  const restore = withXEnv();
  let capturedUrl = "";
  let capturedAuthorization = "";
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedAuthorization = String(new Headers(init?.headers).get("authorization"));
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "10",
            text: "Banked reset is available for Codex users.",
            author_id: "u1",
            created_at: "2026-06-30T12:00:00.000Z",
          },
        ],
        includes: {
          users: [{ id: "u1", username: "OpenAI", name: "OpenAI" }],
        },
        meta: { result_count: 1 },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-rate-limit-limit": "60",
          "x-rate-limit-remaining": "59",
          "x-rate-limit-reset": "1780000000",
        },
      },
    );
  };

  try {
    const response = await checkCodexResetNotices(
      new Request("http://localhost:3000/api/codex-reset-notifier/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: { keywords: ["banked reset"], maxResults: 10 } }),
      }),
    );
    const payload = await response.json();
    const url = new URL(capturedUrl);

    assert.equal(response.status, 200);
    assert.equal(url.origin + url.pathname, "https://api.x.com/2/tweets/search/recent");
    assert.match(url.searchParams.get("query") ?? "", /from:thsottiaux/);
    assert.equal(url.searchParams.get("tweet.fields"), "created_at,author_id,conversation_id,public_metrics");
    assert.equal(url.searchParams.get("expansions"), "author_id");
    assert.equal(url.searchParams.get("user.fields"), "username,name,verified");
    assert.match(capturedAuthorization, /^OAuth /);
    assert.equal(payload.success, true);
    assert.equal(payload.notices.length, 1);
    assert.equal(payload.notices[0].id, "10");
    assert.equal(payload.rateLimit.remaining, "59");
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});
