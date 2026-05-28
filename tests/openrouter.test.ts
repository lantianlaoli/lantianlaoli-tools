import assert from "node:assert/strict";
import { test } from "node:test";
import { callOpenRouter, type OpenRouterMessage } from "../src/lib/openrouter";

test("callOpenRouter sends only OPENROUTER_MODEL as the model parameter", async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;
  const originalOpenRouterVisionModel = process.env.OPENROUTER_VISION_MODEL;
  let requestBody: Record<string, unknown> | undefined;

  process.env.OPENROUTER_API_KEY = "test-openrouter";
  process.env.OPENROUTER_MODEL = "qwen/qwen3.7-max";
  process.env.OPENROUTER_VISION_MODEL = "google/gemini-2.5-flash";

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
    requestBody = JSON.parse(await request.text());
    return new Response(
      JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 1,
        model: "qwen/qwen3.7-max",
        system_fingerprint: "test",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: JSON.stringify({ ok: true }) },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const messages: OpenRouterMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this image." },
          { type: "image_url", image_url: { url: "https://cdn.example.com/photo.jpg" } },
        ],
      },
    ];

    const result = await callOpenRouter<{ ok: boolean }>(messages, { type: "json_object" });

    assert.deepEqual(result, { ok: true });
    assert.equal(requestBody?.model, "qwen/qwen3.7-max");
    assert.notEqual(requestBody?.model, process.env.OPENROUTER_VISION_MODEL);
    assert.deepEqual(requestBody?.response_format, { type: "json_object" });
    assert.deepEqual(requestBody?.messages, [
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this image." },
          { type: "image_url", image_url: { url: "https://cdn.example.com/photo.jpg" } },
        ],
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
    if (originalOpenRouterVisionModel === undefined) delete process.env.OPENROUTER_VISION_MODEL;
    else process.env.OPENROUTER_VISION_MODEL = originalOpenRouterVisionModel;
  }
});

test("callOpenRouter fails fast when OPENROUTER_MODEL is missing", async () => {
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;

  process.env.OPENROUTER_API_KEY = "test-openrouter";
  delete process.env.OPENROUTER_MODEL;

  try {
    await assert.rejects(
      () => callOpenRouter([{ role: "user", content: "Return JSON." }], { type: "json_object" }),
      /OPENROUTER_MODEL is not configured/
    );
  } finally {
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
  }
});
