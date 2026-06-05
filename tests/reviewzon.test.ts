import assert from "node:assert/strict";
import { test } from "node:test";

import { POST as analyzeReviews } from "../src/app/api/reviewzon/analyze-reviews/route";
import {
  analyzeStreamEventSchema,
  importReviewzonRows,
  mapReviewzonHeaderKey,
  reviewBatchRequestSchema,
  transformReviewzonSheetRows,
} from "../src/lib/reviewzon";
import {
  canonicalizeReviewzonTheme,
  postProcessReviewzonExtractedRow,
} from "../src/lib/reviewzon-ai";

async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const line = block.split("\n").find((value) => value.startsWith("data: "));
      assert.ok(line);
      return analyzeStreamEventSchema.parse(JSON.parse(line.slice("data: ".length)));
    });
}

test("Reviewzon header aliases recognize English, Chinese, and separator variants", () => {
  assert.equal(mapReviewzonHeaderKey("ASIN"), "asin");
  assert.equal(mapReviewzonHeaderKey("sku_asin"), "asin");
  assert.equal(mapReviewzonHeaderKey("评论 内容"), "content");
  assert.equal(mapReviewzonHeaderKey("review_text"), "content");
  assert.equal(mapReviewzonHeaderKey("selling_points"), "sellingPoints");
  assert.equal(mapReviewzonHeaderKey("核心卖点"), "sellingPoints");
  assert.equal(mapReviewzonHeaderKey("rating"), null);
});

test("Reviewzon row transform filters blanks and splits selling points", () => {
  const rows = transformReviewzonSheetRows([
    {
      ASIN: "B001",
      "Review Text": "Redness reduced.",
      "Selling Points": "Anti itch; Natural, Easy use",
    },
    { ASIN: "", "Review Text": "", "Selling Points": "" },
  ]);

  assert.deepEqual(rows, [
    {
      id: "row-1",
      asin: "B001",
      content: "Redness reduced.",
      sellingPoints: ["Anti itch", "Natural", "Easy use"],
    },
  ]);
});

test("Reviewzon import rejects missing required columns and invalid rows", () => {
  assert.throws(
    () => importReviewzonRows([{ ASIN: "B001", Rating: 5 }]),
    /没有识别到 asin \/ content 表头/,
  );
  assert.throws(
    () => importReviewzonRows([{ ASIN: "B001", content: "" }]),
    /缺少 asin 或 content/,
  );
});

test("Reviewzon request schema caps a batch at 100 rows", () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    id: `row-${index + 1}`,
    asin: `B${index}`,
    content: "Good product.",
    sellingPoints: [],
  }));

  assert.equal(reviewBatchRequestSchema.safeParse({ rows }).success, false);
});

test("Reviewzon canonicalization maps common pros, cons, and dedupes points", () => {
  assert.equal(canonicalizeReviewzonTheme("easy to apply", "pros", []), "易于使用");
  assert.equal(canonicalizeReviewzonTheme("leaking bottle", "cons", []), "包装破损");
  assert.equal(canonicalizeReviewzonTheme("anti itch", "pros", ["Anti Itch"]), "Anti Itch");

  const row = postProcessReviewzonExtractedRow({
    id: "row-1",
    asin: "B001",
    content: "It was easy to apply and easy to use. Bottle leaked.",
    sellingPoints: [],
    pros: [
      { text: "easy to apply", theme: "easy to apply" },
      { text: "easy to apply", theme: "easy to use" },
    ],
    cons: [{ text: "Bottle leaked", theme: "leaking bottle" }],
  });

  assert.deepEqual(row.pros, [{ text: "easy to apply", theme: "易于使用" }]);
  assert.deepEqual(row.cons, [{ text: "Bottle leaked", theme: "包装破损" }]);
});

test("POST /api/reviewzon/analyze-reviews rejects non-JSON and invalid bodies", async () => {
  const nonJson = await analyzeReviews(
    new Request("http://localhost:3000/api/reviewzon/analyze-reviews", {
      method: "POST",
      body: "not-json",
    }),
  );
  assert.equal(nonJson.status, 400);
  assert.deepEqual(await nonJson.json(), { error: "Request body must be valid JSON." });

  const invalid = await analyzeReviews(
    new Request("http://localhost:3000/api/reviewzon/analyze-reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: [{ id: "row-1", asin: "", content: "Good" }] }),
    }),
  );
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "Invalid request body.");
});

test("POST /api/reviewzon/analyze-reviews returns valid SSE events", async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;

  process.env.OPENROUTER_API_KEY = "test-openrouter";
  process.env.OPENROUTER_MODEL = "google/gemini-test";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 1,
        model: "google/gemini-test",
        system_fingerprint: "test",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                r: [
                  {
                    id: "row-1",
                    p: [{ t: "redness reduced", n: "reduced redness" }],
                    c: [{ t: "leaky pump", n: "leaking bottle" }],
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    const response = await analyzeReviews(
      new Request("http://localhost:3000/api/reviewzon/analyze-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: [
            {
              id: "row-1",
              asin: "B001",
              content: "Redness reduced, but the pump leaked.",
              sellingPoints: [],
            },
          ],
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");

    const events = await readSseEvents(response);
    assert.deepEqual(
      events.map((event) => event.type),
      ["progress", "progress", "summary", "chunk", "done"],
    );
    assert.deepEqual(events[2], {
      type: "summary",
      topPros: ["瘙痒减轻"],
      topCons: ["包装破损"],
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
  }
});
