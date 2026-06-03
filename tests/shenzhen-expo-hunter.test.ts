import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseExpoSchedule,
  parseExpoScheduleFromImage,
  generateSearchQueries,
  scoreLead,
  scoreSubreddit,
  classifyPost,
  deduplicateLeads,
  deduplicateSubreddits,
  deduplicatePhotos,
  deduplicateIntel,
  PURCHASE_INTENT_WORDS,
  mergeSearchSettings,
  extractIndustryKeywords,
  SCHEDULE_OCR_PROMPT,
} from "../src/lib/shenzhen-expo-hunter";
import {
  createExpoHunterJob,
  runExpoHunterExpo,
} from "../src/lib/shenzhen-expo-hunter-workflow";
import { normalizeSubreddit, normalizePost, buildRedditPermalink } from "../src/lib/steady-reddit";
import { POST as createExpoHunterRoute } from "../src/app/api/shenzhen-expo-hunter/create/route";
import { POST as runExpoHunterRoute } from "../src/app/api/shenzhen-expo-hunter/run-expo/route";

describe("parseExpoSchedule", () => {
  it("parses table format with pipe separators", () => {
    const result = parseExpoSchedule(
      "深圳国际电子展 | 2026-06-15 | 深圳会展中心\n深圳玩具展 | 2026-07-02 | 深圳国际会展中心",
    );
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "深圳国际电子展");
    assert.ok(result[0].date?.includes("2026"));
    assert.ok(result[0].location?.includes("深圳会展中心"));
    assert.ok(result[0].industryKeywords.length > 0);
  });

  it("parses multiline Chinese text without pipes", () => {
    const result = parseExpoSchedule(
      "深圳服装周  2026-07-15  深圳会展中心\n深圳家具展  2026-08-01  深圳国际会展中心",
    );
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "深圳服装周");
    assert.ok(result[1].name.includes("家具"));
  });

  it("handles missing date and location", () => {
    const result = parseExpoSchedule("深圳电子展");
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "深圳电子展");
    assert.equal(result[0].date, undefined);
    assert.equal(result[0].location, undefined);
  });

  it("handles empty input", () => {
    assert.deepEqual(parseExpoSchedule(""), []);
    assert.deepEqual(parseExpoSchedule("   \n  "), []);
  });

  it("generates unique IDs for each expo", () => {
    const result = parseExpoSchedule("A | 2026-01-01 | X\nB | 2026-02-02 | Y");
    assert.equal(result.length, 2);
    assert.notEqual(result[0].id, result[1].id);
  });

  it("extracts industry keywords from name", () => {
    const result = parseExpoSchedule("深圳国际电子元器件展 | 2026-06-15 | 深圳");
    assert.equal(result.length, 1);
    assert.ok(result[0].industryKeywords.includes("electronics"));
  });
});

describe("generateSearchQueries", () => {
  it("generates queries with intent words", () => {
    const expo = {
      id: "expo_1",
      name: "深圳电子展",
      industryKeywords: ["electronics"],
    };
    const queries = generateSearchQueries(expo, "precise");
    assert.ok(queries.length > 0);
    assert.ok(queries.some((q) => q.toLowerCase().includes("supplier")));
    assert.ok(queries.some((q) => q.toLowerCase().includes("manufacturer")));
    assert.ok(queries.some((q) => q.toLowerCase().includes("electronics")));
  });

  it("generates more queries in broad mode", () => {
    const expo = {
      id: "expo_1",
      name: "深圳电子展",
      industryKeywords: ["electronics"],
    };
    const precise = generateSearchQueries(expo, "precise");
    const broad = generateSearchQueries(expo, "broad");
    assert.ok(broad.length >= precise.length);
  });

  it("deduplicates queries", () => {
    const expo = {
      id: "expo_1",
      name: "Test Expo",
      industryKeywords: ["test"],
    };
    const queries = generateSearchQueries(expo, "precise");
    const unique = new Set(queries);
    assert.equal(queries.length, unique.size);
  });
});

describe("normalizeSubreddit", () => {
  it("extracts correct fields with score", () => {
    const raw = {
      display_name_prefixed: "r/TestSub",
      title: "Test Subreddit",
      public_description: "A subreddit for testing",
      subscribers: 5000,
    };
    const result = normalizeSubreddit(raw, 0.75);
    assert.equal(result.name, "r/TestSub");
    assert.equal(result.title, "Test Subreddit");
    assert.equal(result.description, "A subreddit for testing");
    assert.equal(result.subscribers, 5000);
    assert.equal(result.relevanceScore, 0.75);
  });

  it("handles missing fields with defaults", () => {
    const result = normalizeSubreddit({}, 0);
    assert.equal(result.name, "");
    assert.equal(result.title, "");
    assert.equal(result.description, "");
    assert.equal(result.subscribers, 0);
  });

  it("clamps relevance score to 0-1", () => {
    assert.equal(normalizeSubreddit({}, 1.5).relevanceScore, 1);
    assert.equal(normalizeSubreddit({}, -0.5).relevanceScore, 0);
  });
});

describe("normalizePost", () => {
  it("extracts lead and builds permalink", () => {
    const raw = {
      title: "Test Post",
      selftext: "This is a test",
      author: "testuser",
      subreddit_name_prefixed: "r/test",
      created_utc: 1700000000,
      score: 42,
      num_comments: 10,
      permalink: "/r/test/comments/abc123/test_post/",
      url: "https://reddit.com/r/test/comments/abc123/test_post/",
    };
    const result = normalizePost(raw);
    assert.ok(result.lead);
    assert.equal(result.lead?.title, "Test Post");
    assert.equal(result.lead?.author, "testuser");
    assert.ok(result.lead?.permalink.startsWith("https://reddit.com"));
    assert.equal(result.images.length, 0);
  });

  it("extracts preview images", () => {
    const raw = {
      title: "Image Post",
      permalink: "/r/test/comments/abc/img/",
      preview: {
        enabled: true,
        images: [
          {
            source: { url: "https://i.redd.it/abc123.jpg", width: 800, height: 600 },
          },
        ],
      },
    };
    const result = normalizePost(raw);
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0], "https://i.redd.it/abc123.jpg");
    assert.ok(result.photo);
    assert.equal(result.photo?.url, "https://i.redd.it/abc123.jpg");
  });

  it("handles missing preview gracefully", () => {
    const raw = {
      title: "No Preview",
      permalink: "/r/test/comments/abc/post/",
    };
    const result = normalizePost(raw);
    assert.equal(result.images.length, 0);
    assert.equal(result.photo, undefined);
  });

  it("decodes HTML entities in image URLs", () => {
    const raw = {
      title: "HTML Entities",
      permalink: "/r/test/comments/abc/post/",
      preview: {
        enabled: true,
        images: [
          {
            source: { url: "https://i.redd.it/test&amp;image.jpg" },
          },
        ],
      },
    };
    const result = normalizePost(raw);
    assert.ok(result.images[0].includes("&"));
    assert.equal(result.images[0], "https://i.redd.it/test&image.jpg");
  });
});

describe("buildRedditPermalink", () => {
  it("prepends reddit.com to relative paths", () => {
    assert.equal(
      buildRedditPermalink("/r/test/comments/abc/"),
      "https://reddit.com/r/test/comments/abc/",
    );
  });

  it("handles paths without leading slash", () => {
    assert.equal(
      buildRedditPermalink("r/test/comments/abc/"),
      "https://reddit.com/r/test/comments/abc/",
    );
  });

  it("returns empty string for empty input", () => {
    assert.equal(buildRedditPermalink(""), "");
  });
});

describe("scoreLead", () => {
  it("scores purchase intent posts higher than generic", () => {
    const purchasePost = {
      title: "Looking for LED supplier in Shenzhen",
      selftext: "I need to find a reliable manufacturer for LED products",
      score: 15,
      numComments: 25,
    };
    const genericPost = {
      title: "Check out this cool light",
      selftext: "Nice LED strip",
      score: 5,
      numComments: 2,
    };

    const purchaseScore = scoreLead(purchasePost, ["electronics", "LED"], true);
    const genericScore = scoreLead(genericPost, ["electronics", "LED"], false);

    assert.ok(purchaseScore > genericScore);
  });

  it("adds bonus for high engagement", () => {
    const lowEng = {
      title: "test",
      selftext: "",
      score: 1,
      numComments: 0,
    };
    const highEng = {
      title: "test",
      selftext: "",
      score: 200,
      numComments: 60,
    };
    assert.ok(scoreLead(highEng, [], false) > scoreLead(lowEng, [], false));
  });

  it("clamps to max 1", () => {
    const post = {
      title: PURCHASE_INTENT_WORDS.join(" "),
      selftext: PURCHASE_INTENT_WORDS.join(" "),
      score: 9999,
      numComments: 9999,
    };
    const s = scoreLead(post, PURCHASE_INTENT_WORDS, true);
    assert.ok(s <= 1);
  });
});

describe("scoreSubreddit", () => {
  it("scores relevant subreddit higher", () => {
    const relevant = {
      display_name_prefixed: "r/electronics",
      title: "Electronics and Gadgets",
      public_description: "Discussion about electronics manufacturing and suppliers",
      subscribers: 50000,
    };
    const irrelevant = {
      display_name_prefixed: "r/cats",
      title: "Cats",
      public_description: "Pictures of cats",
      subscribers: 1000000,
    };
    const relScore = scoreSubreddit(relevant, ["electronics", "manufacturing"]);
    const irrScore = scoreSubreddit(irrelevant, ["electronics", "manufacturing"]);
    assert.ok(relScore > irrScore);
  });
});

describe("classifyPost", () => {
  it("classifies purchase intent as lead", () => {
    const raw = {
      title: "Looking for OEM supplier in Shenzhen",
      selftext: "We need a reliable factory for bulk orders",
      author: "buyer1",
      subreddit_name_prefixed: "r/supplychain",
      created_utc: 1700000000,
      score: 25,
      num_comments: 15,
      permalink: "/r/supplychain/comments/abc/",
      url: "https://reddit.com/r/supplychain/comments/abc/",
    };
    const result = classifyPost(raw, ["manufacturing"]);
    assert.equal(result.type, "lead");
    if (result.type === "lead") {
      assert.ok(result.lead.confidence > 0);
      assert.ok(result.lead.matchedKeywords.length > 0);
    }
  });

  it("classifies posts with images as photo type", () => {
    const raw = {
      title: "Shenzhen electronics expo booth",
      selftext: "Check out this booth at the electronics fair",
      author: "user1",
      subreddit_name_prefixed: "r/electronics",
      created_utc: 1700000000,
      score: 30,
      num_comments: 5,
      permalink: "/r/electronics/comments/img/",
      url_overridden_by_dest: "https://i.redd.it/photo123.jpg",
    };
    const result = classifyPost(raw, ["electronics"]);
    assert.ok(result.type === "photo" || result.type === "intel");
  });

  it("skips irrelevant posts", () => {
    const raw = {
      title: "My cat is so cute",
      selftext: "Just wanted to share",
      author: "user1",
      subreddit_name_prefixed: "r/cats",
      created_utc: 1700000000,
      score: 1000,
      num_comments: 200,
      permalink: "/r/cats/comments/meow/",
    };
    const result = classifyPost(raw, ["electronics", "manufacturing"]);
    assert.equal(result.type, "skip");
  });
});

describe("deduplication", () => {
  it("deduplicates leads by permalink", () => {
    const leads = [
      { permalink: "https://reddit.com/a", url: "", title: "", selftext: "", author: "", subreddit: "", createdUtc: 0, score: 0, numComments: 0, matchedKeywords: [], confidence: 0 },
      { permalink: "https://reddit.com/a", url: "", title: "", selftext: "", author: "", subreddit: "", createdUtc: 0, score: 0, numComments: 0, matchedKeywords: [], confidence: 0 },
      { permalink: "https://reddit.com/b", url: "", title: "", selftext: "", author: "", subreddit: "", createdUtc: 0, score: 0, numComments: 0, matchedKeywords: [], confidence: 0 },
    ];
    assert.equal(deduplicateLeads(leads).length, 2);
  });

  it("deduplicates subreddits by name", () => {
    const subs = [
      { name: "r/test", title: "", description: "", subscribers: 0, relevanceScore: 0 },
      { name: "r/test", title: "", description: "", subscribers: 0, relevanceScore: 0 },
      { name: "r/other", title: "", description: "", subscribers: 0, relevanceScore: 0 },
    ];
    assert.equal(deduplicateSubreddits(subs).length, 2);
  });

  it("deduplicates photos by URL", () => {
    const photos = [
      { url: "https://i.redd.it/a.jpg", postTitle: "", postPermalink: "", author: "", subreddit: "" },
      { url: "https://i.redd.it/a.jpg", postTitle: "", postPermalink: "", author: "", subreddit: "" },
      { url: "https://i.redd.it/b.jpg", postTitle: "", postPermalink: "", author: "", subreddit: "" },
    ];
    assert.equal(deduplicatePhotos(photos).length, 2);
  });

  it("deduplicates intel by permalink", () => {
    const intel = [
      { title: "", selftext: "", author: "", subreddit: "", createdUtc: 0, score: 0, numComments: 0, permalink: "a", url: "", matchedKeywords: [], confidence: 0 },
      { title: "", selftext: "", author: "", subreddit: "", createdUtc: 0, score: 0, numComments: 0, permalink: "a", url: "", matchedKeywords: [], confidence: 0 },
    ];
    assert.equal(deduplicateIntel(intel).length, 1);
  });
});

describe("mergeSearchSettings", () => {
  it("returns defaults when no partial", () => {
    const result = mergeSearchSettings();
    assert.equal(result.maxSubreddits, 5);
    assert.equal(result.maxPosts, 30);
    assert.equal(result.depth, "precise");
  });

  it("merges partial overrides", () => {
    const result = mergeSearchSettings({ maxSubreddits: 10, depth: "broad" });
    assert.equal(result.maxSubreddits, 10);
    assert.equal(result.maxPosts, 30);
    assert.equal(result.depth, "broad");
  });
});

describe("extractIndustryKeywords", () => {
  it("detects electronics keywords", () => {
    const result = extractIndustryKeywords("深圳国际电子元器件展");
    assert.ok(result.includes("electronics"));
  });

  it("detects apparel keywords", () => {
    const result = extractIndustryKeywords("深圳服装博览会");
    assert.ok(result.includes("apparel"));
  });

  it("falls back to general", () => {
    const result = extractIndustryKeywords("深圳综合展");
    assert.ok(result.includes("general"));
  });
});

describe("PURCHASE_INTENT_WORDS", () => {
  it("contains key sourcing terms", () => {
    assert.ok(PURCHASE_INTENT_WORDS.includes("supplier"));
    assert.ok(PURCHASE_INTENT_WORDS.includes("OEM"));
    assert.ok(PURCHASE_INTENT_WORDS.includes("ODM"));
    assert.ok(PURCHASE_INTENT_WORDS.includes("factory"));
    assert.ok(PURCHASE_INTENT_WORDS.includes("sourcing"));
  });
});

describe("parseExpoScheduleFromImage", () => {
  function fakeChatCompletion(content: string) {
    return new Response(
      JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 1,
        model: "test-model",
        system_fingerprint: "test",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("returns empty array when OpenRouter returns no expos", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    const originalModel = process.env.OPENROUTER_MODEL;

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test-model";

    globalThis.fetch = async () => fakeChatCompletion('{"expos": []}');

    try {
      const result = await parseExpoScheduleFromImage("data:image/jpeg;base64,abc123");
      assert.equal(result.length, 0);
    } finally {
      globalThis.fetch = originalFetch as typeof globalThis.fetch;
      process.env.OPENROUTER_API_KEY = originalApiKey;
      process.env.OPENROUTER_MODEL = originalModel;
    }
  });

  it("parses expos from OpenRouter JSON response", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    const originalModel = process.env.OPENROUTER_MODEL;

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test-model";

    globalThis.fetch = async () =>
      fakeChatCompletion(
        JSON.stringify({
          expos: [
            {
              name: "深圳电子展",
              date: "2026-06-15 ~ 2026-06-18",
              location: "深圳会展中心",
            },
            {
              name: "深圳玩具展",
              date: "2026-07-02",
              location: "深圳国际会展中心",
            },
          ],
        }),
      );

    try {
      const result = await parseExpoScheduleFromImage("data:image/jpeg;base64,abc123");
      assert.equal(result.length, 2);
      assert.equal(result[0].name, "深圳电子展");
      assert.ok(result[0].date?.includes("2026"));
      assert.equal(result[0].location, "深圳会展中心");
      assert.equal(result[1].name, "深圳玩具展");
      assert.ok(result[0].industryKeywords.length > 0);
    } finally {
      globalThis.fetch = originalFetch as typeof globalThis.fetch;
      process.env.OPENROUTER_API_KEY = originalApiKey;
      process.env.OPENROUTER_MODEL = originalModel;
    }
  });

  it("filters out entries with empty names", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.OPENROUTER_API_KEY;
    const originalModel = process.env.OPENROUTER_MODEL;

    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test-model";

    globalThis.fetch = async () =>
      fakeChatCompletion(
        JSON.stringify({
          expos: [
            { name: "有效展会", date: "2026-01-01" },
            { name: "" },
            { name: "  " },
            { name: "另一个展会" },
          ],
        }),
      );

    try {
      const result = await parseExpoScheduleFromImage("data:image/jpeg;base64,abc123");
      assert.equal(result.length, 2);
      assert.equal(result[0].name, "有效展会");
      assert.equal(result[1].name, "另一个展会");
    } finally {
      globalThis.fetch = originalFetch as typeof globalThis.fetch;
      process.env.OPENROUTER_API_KEY = originalApiKey;
      process.env.OPENROUTER_MODEL = originalModel;
    }
  });
});

describe("SCHEDULE_OCR_PROMPT", () => {
  it("includes JSON output instructions", () => {
    assert.ok(SCHEDULE_OCR_PROMPT.includes("JSON"));
    assert.ok(SCHEDULE_OCR_PROMPT.includes('"expos"'));
  });
});

describe("two-step expo hunter workflow", () => {
  function fakeChatCompletion(content: string) {
    return new Response(
      JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 1,
        model: "test-model",
        system_fingerprint: "test",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  function fakeRedditResponse(url: string) {
    const recentCreatedUtc = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const oldCreatedUtc = Math.floor(Date.now() / 1000) - 45 * 24 * 60 * 60;

    if (url.includes("filter=comments")) {
      return new Response(
        JSON.stringify({
          meta: { status: 200 },
          body: [
            {
              body: "I cannot attend the Shenzhen expo. Can anyone share booth photos, product catalogs, or flyers?",
              author: "remote_buyer",
              subreddit: "electronics",
              link_title: "Shenzhen electronics expo thread",
              created_utc: recentCreatedUtc,
              score: 18,
              permalink: "/r/electronics/comments/abc/supplier/comment_1/",
              link_permalink: "/r/electronics/comments/abc/supplier/",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        meta: { status: 200 },
        body: [
          {
            title: "Looking for Shenzhen electronics supplier",
            selftext: "Need OEM factory contacts after the trade show.",
            author: "buyer_user",
            subreddit: "electronics",
            created_utc: recentCreatedUtc,
            score: 42,
            num_comments: 8,
            permalink: "/r/electronics/comments/abc/supplier/",
            url: "https://reddit.com/r/electronics/comments/abc/supplier/",
          },
          {
            title: "Old Shenzhen electronics supplier thread",
            selftext: "This supplier discussion is older than the accepted window.",
            author: "old_buyer",
            subreddit: "electronics",
            created_utc: oldCreatedUtc,
            score: 99,
            num_comments: 30,
            permalink: "/r/electronics/comments/old/supplier/",
            url: "https://reddit.com/r/electronics/comments/old/supplier/",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  function installExpoFetchMock() {
    const originalFetch = globalThis.fetch;
    const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
    const originalOpenRouterModel = process.env.OPENROUTER_MODEL;
    const originalSteadyApiKey = process.env.STEADY_API_KEY;
    const redditCalls: string[] = [];

    process.env.OPENROUTER_API_KEY = "test-openrouter";
    process.env.OPENROUTER_MODEL = "test-model";
    process.env.STEADY_API_KEY = "test-steady";

    globalThis.fetch = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://openrouter.ai/api/v1/chat/completions") {
        return fakeChatCompletion(
          JSON.stringify({
            expos: [
              {
                name: "深圳电子展",
                date: "2026-06-15 ~ 2026-06-18",
                location: "深圳会展中心",
              },
              {
                name: "深圳玩具展",
                date: "2026-07-02",
                location: "深圳国际会展中心",
              },
            ],
          }),
        );
      }
      if (url.startsWith("https://api.steadyapi.com/")) {
        redditCalls.push(url);
        return fakeRedditResponse(url);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    return {
      redditCalls,
      restore() {
        globalThis.fetch = originalFetch as typeof globalThis.fetch;
        if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
        else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
        if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
        else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
        if (originalSteadyApiKey === undefined) delete process.env.STEADY_API_KEY;
        else process.env.STEADY_API_KEY = originalSteadyApiKey;
      },
    };
  }

  it("creates a parsed job from an image without running Reddit searches", async () => {
    const mock = installExpoFetchMock();
    try {
      const job = await createExpoHunterJob({
        imageDataUrl: "data:image/jpeg;base64,abc123",
      });

      assert.equal(job.status, "parsed");
      assert.equal(job.results.length, 2);
      assert.equal(job.results.every((result) => result.status === "waiting"), true);
      assert.equal(mock.redditCalls.length, 0);
    } finally {
      mock.restore();
    }
  });

  it("runs Reddit collection for only the selected expo", async () => {
    const mock = installExpoFetchMock();
    try {
      const job = await createExpoHunterJob({
        imageDataUrl: "data:image/jpeg;base64,abc123",
      });
      const selectedExpoId = job.results[0].expo.id;

      const updated = await runExpoHunterExpo(job.id, selectedExpoId, {
        maxSubreddits: 1,
        maxPosts: 3,
        depth: "precise",
      });

      assert.equal(updated.status, "parsed");
      assert.equal(updated.results[0].status, "success");
      assert.equal(updated.results[0].subreddits.length, 1);
      assert.equal(updated.results[0].leads.length, 2);
      assert.equal(updated.results[0].discussionsBySubreddit.length, 1);
      assert.equal(updated.results[0].discussionsBySubreddit[0].subreddit, "r/electronics");
      assert.equal(updated.results[0].discussionsBySubreddit[0].discussions.length, 3);
      assert.ok(updated.results[0].discussionsBySubreddit[0].discussions.some((discussion) => discussion.sourceType === "comment"));
      assert.ok(mock.redditCalls.some((url) => url.includes("filter=comments")));
      assert.equal(updated.results[0].photos.length, 0);
      assert.equal(updated.results[1].status, "waiting");
      assert.equal(updated.results[1].leads.length, 0);
      assert.ok(mock.redditCalls.length > 0);
    } finally {
      mock.restore();
    }
  });

  it("keeps post results when Reddit comment search fails", async () => {
    const mock = installExpoFetchMock();
    const originalFetch = globalThis.fetch;
    const commentCalls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("filter=comments")) {
        commentCalls.push(url);
        return new Response("Not Found", { status: 404 });
      }
      return originalFetch(input, init);
    };

    try {
      const job = await createExpoHunterJob({
        imageDataUrl: "data:image/jpeg;base64,abc123",
      });

      const updated = await runExpoHunterExpo(job.id, job.results[0].expo.id, {
        maxSubreddits: 1,
        maxPosts: 3,
        depth: "precise",
      });

      assert.equal(updated.results[0].status, "success");
      assert.equal(updated.results[0].subreddits.length, 1);
      assert.equal(updated.results[0].leads.length, 2);
      assert.equal(updated.results[0].comments.length, 0);
      assert.ok(commentCalls.length > 0);
    } finally {
      mock.restore();
    }
  });

  it("allows a failed expo to be run again", async () => {
    const mock = installExpoFetchMock();
    try {
      const job = await createExpoHunterJob({
        imageDataUrl: "data:image/jpeg;base64,abc123",
      });
      const selectedExpoId = job.results[0].expo.id;

      delete process.env.STEADY_API_KEY;
      const failed = await runExpoHunterExpo(job.id, selectedExpoId);
      assert.equal(failed.results[0].status, "fail");

      process.env.STEADY_API_KEY = "test-steady";
      const retried = await runExpoHunterExpo(job.id, selectedExpoId);
      assert.equal(retried.results[0].status, "success");
      assert.equal(retried.results[0].leads.length, 2);
      assert.equal(retried.results[0].discussionsBySubreddit.length, 1);
    } finally {
      mock.restore();
    }
  });

  it("keeps discussions from the last six months before grouping by subreddit", async () => {
    const mock = installExpoFetchMock();
    try {
      const job = await createExpoHunterJob({
        imageDataUrl: "data:image/jpeg;base64,abc123",
      });

      const updated = await runExpoHunterExpo(job.id, job.results[0].expo.id, {
        maxSubreddits: 5,
        maxPosts: 10,
        depth: "precise",
      });

      const discussions = updated.results[0].discussionsBySubreddit.flatMap(
        (group) => group.discussions,
      );
      assert.equal(discussions.some((discussion) => discussion.title.includes("Old")), true);
      assert.equal(discussions.every((discussion) => discussion.subreddit === "r/electronics"), true);
    } finally {
      mock.restore();
    }
  });
});

function installRouteExpoFetchMock() {
  const originalFetch = globalThis.fetch;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;
  const originalSteadyApiKey = process.env.STEADY_API_KEY;
  const redditCalls: string[] = [];

  process.env.OPENROUTER_API_KEY = "test-openrouter";
  process.env.OPENROUTER_MODEL = "test-model";
  process.env.STEADY_API_KEY = "test-steady";

  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      return new Response(
        JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion",
          created: 1,
          model: "test-model",
          system_fingerprint: "test",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify({
                  expos: [
                    {
                      name: "深圳电子展",
                      date: "2026-06-15 ~ 2026-06-18",
                      location: "深圳会展中心",
                    },
                    {
                      name: "深圳玩具展",
                      date: "2026-07-02",
                      location: "深圳国际会展中心",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.startsWith("https://api.steadyapi.com/")) {
      const recentCreatedUtc = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
      const oldCreatedUtc = Math.floor(Date.now() / 1000) - 45 * 24 * 60 * 60;
      redditCalls.push(url);
      if (url.includes("filter=comments")) {
        return new Response(
          JSON.stringify({
            meta: { status: 200 },
            body: [
              {
                body: "I cannot attend the Shenzhen expo. Can anyone share booth photos, product catalogs, or flyers?",
                author: "remote_buyer",
                subreddit: "electronics",
                link_title: "Shenzhen electronics expo thread",
                created_utc: recentCreatedUtc,
                score: 18,
                permalink: "/r/electronics/comments/abc/supplier/comment_1/",
                link_permalink: "/r/electronics/comments/abc/supplier/",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          meta: { status: 200 },
          body: [
            {
              title: "Looking for Shenzhen electronics supplier",
              selftext: "Need OEM factory contacts after the trade show.",
              author: "buyer_user",
              subreddit: "electronics",
              created_utc: recentCreatedUtc,
              score: 42,
              num_comments: 8,
              permalink: "/r/electronics/comments/abc/supplier/",
              url: "https://reddit.com/r/electronics/comments/abc/supplier/",
            },
            {
              title: "Old Shenzhen electronics supplier thread",
              selftext: "This supplier discussion is older than the accepted window.",
              author: "old_buyer",
              subreddit: "electronics",
              created_utc: oldCreatedUtc,
              score: 99,
              num_comments: 30,
              permalink: "/r/electronics/comments/old/supplier/",
              url: "https://reddit.com/r/electronics/comments/old/supplier/",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  return {
    redditCalls,
    restore() {
      globalThis.fetch = originalFetch as typeof globalThis.fetch;
      if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
      if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
      else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
      if (originalSteadyApiKey === undefined) delete process.env.STEADY_API_KEY;
      else process.env.STEADY_API_KEY = originalSteadyApiKey;
    },
  };
}

describe("shenzhen expo hunter routes", () => {
  it("POST /api/shenzhen-expo-hunter/create rejects missing image", async () => {
    const response = await createExpoHunterRoute(
      new Request("http://localhost:3000/api/shenzhen-expo-hunter/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Please upload a schedule image.",
    });
  });

  it("POST /api/shenzhen-expo-hunter/create returns parsed cards without Reddit fetches", async () => {
    const mock = installRouteExpoFetchMock();
    try {
      const response = await createExpoHunterRoute(
        new Request("http://localhost:3000/api/shenzhen-expo-hunter/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageDataUrl: "data:image/jpeg;base64,abc123" }),
        }),
      );
      await Promise.resolve();

      assert.equal(response.status, 202);
      const payload = await response.json();
      assert.equal(payload.success, true);
      assert.equal(payload.job.status, "parsed");
      assert.equal(payload.job.results.length, 2);
      assert.equal(payload.job.results.every((result: { status: string }) => result.status === "waiting"), true);
      assert.equal(mock.redditCalls.length, 0);
    } finally {
      mock.restore();
    }
  });

  it("POST /api/shenzhen-expo-hunter/run-expo rejects missing ids", async () => {
    const missingJob = await runExpoHunterRoute(
      new Request("http://localhost:3000/api/shenzhen-expo-hunter/run-expo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expoId: "expo_1" }),
      }),
    );
    assert.equal(missingJob.status, 400);
    assert.deepEqual(await missingJob.json(), { error: "Missing jobId." });

    const missingExpo = await runExpoHunterRoute(
      new Request("http://localhost:3000/api/shenzhen-expo-hunter/run-expo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: "job_1" }),
      }),
    );
    assert.equal(missingExpo.status, 400);
    assert.deepEqual(await missingExpo.json(), { error: "Missing expoId." });
  });

  it("POST /api/shenzhen-expo-hunter/run-expo returns an updated job", async () => {
    const mock = installRouteExpoFetchMock();
    try {
      const job = await createExpoHunterJob({
        imageDataUrl: "data:image/jpeg;base64,abc123",
      });

      const response = await runExpoHunterRoute(
        new Request("http://localhost:3000/api/shenzhen-expo-hunter/run-expo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jobId: job.id,
            expoId: job.results[0].expo.id,
            settings: { maxSubreddits: 1, maxPosts: 1, depth: "precise" },
          }),
        }),
      );

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.success, true);
      assert.equal(payload.job.results[0].status, "success");
      assert.equal(payload.job.results[0].leads.length, 1);
      assert.equal(payload.job.results[1].status, "waiting");
    } finally {
      mock.restore();
    }
  });
});
