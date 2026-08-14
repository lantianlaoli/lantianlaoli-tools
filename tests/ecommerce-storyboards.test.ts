import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStoryboardCoverPrompt,
  buildStoryboardImagePrompt,
  buildStoryboardVideoPrompt,
  normalizeStoryboardStoryPlan,
  normalizeStoryboardSellingPoints,
} from "../src/lib/ecommerce-storyboards";
import { createKieSeedance2MiniVideoTask } from "../src/lib/kie";
import { POST as createStoryboard } from "../src/app/api/ecommerce-assets/storyboards/create/route";

const slot = {
  id: "storyboard-1",
  index: 0,
  sellingPoint: {
    id: "point-1",
    title: "Portable everyday design",
    description: "Show the product fitting naturally into a daily routine.",
  },
  manufacturerReferenceImageUrls: ["manufacturer-scene.jpg"],
  taskId: "task-1",
  status: "waiting" as const,
  prompt: "",
};

test("storyboard selling points normalize to three distinct safe points", () => {
  const points = normalizeStoryboardSellingPoints([
    { title: "Portable", description: "Easy to carry." },
    { title: "portable", description: "Duplicate should be removed." },
    { title: "Tactile controls", description: "A visible control detail." },
  ]);
  assert.equal(points.length, 3);
  assert.equal(
    new Set(points.map((point) => point.title.toLowerCase())).size,
    3,
  );
});

test("story plan normalizes three connected stages, a clean title, and five hashtags", () => {
  const plan = normalizeStoryboardStoryPlan({
    productName: "CHUB TWO Desk Fan",
    title: "Meet Your New Summer Essential",
    description: "A real-life cooling routine from first touch to final setup.",
    hashtags: ["#PortableFan", "#PortableFan", "#DeskCooling", "#UGC", "#Summer", "#Extra"],
    setting: "A bright desk beside a window.",
    continuity: "The same creator keeps the fan in hand and then places it on the desk.",
    stages: [
      { stage: "opening", sellingPoint: { title: "Portable cooling", description: "Carry it outside." }, transitionFromPrevious: "Start.", transitionToNext: "Keep holding it." },
      { stage: "continuation", sellingPoint: { title: "Desk setup", description: "Place it on a desk." }, transitionFromPrevious: "Place the same product down.", transitionToNext: "Adjust the angle." },
      { stage: "closing", sellingPoint: { title: "Adjustable airflow", description: "Change the direction." }, transitionFromPrevious: "Continue the adjustment.", transitionToNext: "End naturally." },
    ],
  });
  assert.equal(plan.stages.length, 3);
  assert.equal(plan.stages[1].stage, "continuation");
  assert.equal(plan.hashtags.length, 5);
  assert.equal(plan.hashtags.join(" ").includes("\n"), false);
  assert.ok(plan.description.length >= 240);
  assert.ok(plan.description.length <= 360);
  assert.ok(plan.buyerPainPoint);
  assert.ok(plan.solutionAngle);
  assert.doesNotMatch(plan.title, /CHUB TWO/i);
  assert.doesNotMatch(plan.description, /CHUB TWO/i);
});

test("storyboard prompts enforce English, 9:16, one selling point, and source references", () => {
  const imagePrompt = buildStoryboardImagePrompt({ slot });
  const videoPrompt = buildStoryboardVideoPrompt({ slot });
  assert.match(imagePrompt, /9:16/);
  assert.match(imagePrompt, /six numbered rows/);
  assert.match(imagePrompt, /five aligned columns/);
  assert.match(imagePrompt, /English only/);
  assert.match(imagePrompt, /exactly one selling point/);
  assert.match(imagePrompt, /manufacturer reference image/);
  assert.match(imagePrompt, /front, side, back/);
  assert.match(imagePrompt, /verified product name/);
  assert.match(imagePrompt, /never say or write the store name CHUB TWO/i);
  assert.doesNotMatch(imagePrompt, /ASMR/);
  assert.match(videoPrompt, /15-second vertical 9:16/);
  assert.match(videoPrompt, /authentic UGC/);
  assert.doesNotMatch(videoPrompt, /ASMR|whisper|soft breathing/i);
  assert.match(videoPrompt, /same person and product/);
  assert.match(videoPrompt, /never the store name CHUB TWO/i);
  assert.match(videoPrompt, /Portable everyday design/);
});

test("story analysis prompt starts from buyer pain and asks for a concise scenario solution", () => {
  const plan = normalizeStoryboardStoryPlan({
    productName: "Phone Stand",
    targetAudience: "Young mobile workers",
    buyerPainPoint: "A phone that keeps slipping out of view",
    solutionAngle: "A compact stand keeps the screen visible without desk clutter.",
    title: "Keep Your Phone In View Without The Desk Clutter",
    description:
      "When your phone keeps slipping flat or disappearing under notebooks, this compact stand gives it a stable place in your daily setup. Keep the screen visible while you work, study, or follow a recipe, then fold it away when the moment is over.",
    hashtags: ["#PhoneStand", "#DeskSetup", "#HandsFreeViewing", "#StudyEssentials", "#WorkFromHome"],
    stages: [
      { stage: "opening", sellingPoint: { title: "Visible screen", description: "Keep the screen in view." } },
      { stage: "continuation", sellingPoint: { title: "Foldable setup", description: "Fold it away." } },
      { stage: "closing", sellingPoint: { title: "Everyday carry", description: "Take it with you." } },
    ],
  });
  assert.match(plan.title, /phone|stand|desk|view/i);
  assert.ok(plan.description.length >= 240);
  assert.ok(plan.description.length <= 360);
  assert.equal(plan.hashtags.join(" ").split("\n").length, 1);
});

test("storyboard cover prompt renders one clean title without the store name", () => {
  const prompt = buildStoryboardCoverPrompt({
    storyPlan: normalizeStoryboardStoryPlan({
      title: "The Pocket Fan I Actually Carry",
      stages: [
        { stage: "opening", sellingPoint: { title: "Portable", description: "Carry it." } },
        { stage: "continuation", sellingPoint: { title: "Quiet", description: "Use it." } },
        { stage: "closing", sellingPoint: { title: "Flexible", description: "Set it down." } },
      ],
    }),
  });
  assert.match(prompt, /3:4/);
  assert.match(prompt, /The Pocket Fan I actually Carry/i);
  assert.match(prompt, /pure white background/i);
  assert.match(prompt, /oversized black headline/i);
  assert.match(prompt, /no obvious empty space/i);
  assert.match(prompt, /Do not render CHUB TWO/);
  assert.match(prompt, /adult male creator/i);
  assert.match(prompt, /must be male/i);
});

test("storyboard video prompt requires an adult male creator and male voice", () => {
  const prompt = buildStoryboardVideoPrompt({ slot, storyPlan: normalizeStoryboardStoryPlan({}) });
  assert.match(prompt, /adult male voice/i);
  assert.match(prompt, /never use a woman/i);
});

test("storyboard create rejects a missing first SKU", async () => {
  const response = await createStoryboard(
    new Request("http://localhost/api/ecommerce-assets/storyboards/create", {
      method: "POST",
      body: JSON.stringify({ manufacturerReferenceDataUrls: [] }),
      headers: { "Content-Type": "application/json" },
    }),
  );
  assert.equal(response.status, 400);
});

test("storyboard create requires the front product view", async () => {
  const response = await createStoryboard(
    new Request("http://localhost/api/ecommerce-assets/storyboards/create", {
      method: "POST",
      body: JSON.stringify({
        productSkuDataUrl: "data:image/png;base64,sku",
        productViewDataUrls: [],
      }),
      headers: { "Content-Type": "application/json" },
    }),
  );
  assert.equal(response.status, 400);
});

test("Seedance 2 Mini uses fixed storyboard video settings", async () => {
  const previousKey = process.env.KIE_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.KIE_API_KEY = "test-key";
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({ code: 200, data: { taskId: "mini-task" } }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const taskId = await createKieSeedance2MiniVideoTask({
      prompt: "Authentic UGC product interaction",
      referenceImageUrls: ["storyboard.png", "sku.png", "person.png"],
    });
    assert.equal(taskId, "mini-task");
    assert.equal(requestBody?.model, "bytedance/seedance-2-mini");
    const input = requestBody?.input as Record<string, unknown>;
    assert.equal(input.resolution, "720p");
    assert.equal(input.aspect_ratio, "9:16");
    assert.equal(input.duration, 15);
    assert.equal(input.generate_audio, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = previousKey;
  }
});
