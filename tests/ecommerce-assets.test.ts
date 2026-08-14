import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEcommerceCarouselPrompts,
  buildEcommerceCopyAnalysisPrompt,
  CHUB_TWO_DEFAULT_STYLE_GUIDE,
  CHUB_TWO_DEFAULT_GENERATION_CONFIG,
  CHUB_TWO_MAIN_COMPOSITION_URL,
  CHUB_TWO_PERSON_URL,
  fallbackEcommerceCopyOptions,
  getEcommerceCarouselSlots,
  normalizeCopyOptions,
} from "../src/lib/ecommerce-assets";
import {
  BRIEF_TEMPLATE,
  CHUB_TWO_BRIEF_INTRO,
  buildProductInfoPrompt,
  buildStyleImagePrompt,
  normalizeProductBrief,
  normalizeProductTitles,
} from "../src/lib/ecommerce-product-info";
import { POST as analyzeEcommerceAssets } from "../src/app/api/ecommerce-assets/analyze/route";
import { POST as createEcommerceAssets } from "../src/app/api/ecommerce-assets/create/route";
import { POST as productInfo } from "../src/app/api/ecommerce-assets/product-info/route";
import { POST as styleImageCreate } from "../src/app/api/ecommerce-assets/style-images/create/route";
import { normalizeEcommerceHistory } from "../src/lib/ecommerce-history";

const referenceCounts = { scene: 3, detail: 3, variant: 1 } as const;
const selectedCopy = Object.fromEntries(
  fallbackEcommerceCopyOptions(referenceCounts).map((slot) => [
    slot.slotId,
    slot.proposals[0],
  ]),
);
const group = (role: string, count: number) => ({
  role,
  dataUrls: Array.from({ length: count }, () => "data:image/png;base64,AA=="),
});

test("ecommerce history normalizes records newest first and caps the list", () => {
  const records = Array.from({ length: 32 }, (_, index) => ({
    id: `history-${index}`,
    productName: `Product ${index}`,
    skuIds: [],
    createdAt: index,
    updatedAt: index,
    status: "completed" as const,
    outputKinds: ["info" as const],
    thumbnails: [],
    snapshot: {},
  }));
  const normalized = normalizeEcommerceHistory(records);
  assert.equal(normalized.length, 30);
  assert.equal(normalized[0].id, "history-31");
  assert.equal(normalized.at(-1)?.id, "history-2");
});
const groups = [group("scene", 3), group("detail", 3), group("variant", 1)];

test("carousel slots follow uploaded references plus original main and variant images", () => {
  const slots = getEcommerceCarouselSlots(referenceCounts);
  assert.equal(slots.length, 8);
  for (const role of ["main", "scene", "detail", "variant"] as const)
    assert.equal(
      slots.filter((slot) => slot.role === role).length,
      role === "main" || role === "variant" ? 1 : referenceCounts[role],
    );
  assert.equal(slots[0].id, "main-1");
  assert.equal(slots[7].id, "variant-1");
});

test("copy analysis prompt requires three English proposals per slot", () => {
  const prompt = buildEcommerceCopyAnalysisPrompt({
    skuImageCount: 3,
    manufacturerReferenceImageCount: 7,
    referenceCounts,
  });
  assert.match(prompt, /exactly three English/);
  assert.match(prompt, /generated TikTok Shop carousel slot/);
  assert.match(prompt, /first SKU is the only product reference/);
  assert.match(prompt, /visible source copy/);
  assert.match(prompt, /manufacturer source copy/);
  assert.match(prompt, /rewrite its real selling points/);
  assert.match(prompt, /editable style guide/);
  assert.match(
    prompt,
    new RegExp(
      CHUB_TWO_DEFAULT_STYLE_GUIDE.slice(0, 30).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      ),
    ),
  );
});

test("product title prompt enforces one long-tail title", () => {
  const prompt = buildProductInfoPrompt({
    kind: "title",
    skuImageCount: 2,
    manufacturerReferenceImageCount: 4,
  });
  assert.match(prompt, /exactly one final product title/);
  assert.match(prompt, /core product keyword \+ attribute keyword/);
  assert.match(prompt, /promotion keyword/i);
  assert.match(prompt, /benefit keyword/);
  assert.match(prompt, /target audience|audience/i);
  assert.match(prompt, /never invent a discount/i);
  assert.match(prompt, /at least 40 characters/);
  assert.match(prompt, /CHUB TWO｜/);
  assert.match(prompt, /long-tail product keyword phrase/);
  assert.match(prompt, /visible Chinese or English source copy/);
});

test("product brief prompt preserves the CHUB TWO QA opening and evidence rules", () => {
  const prompt = buildProductInfoPrompt({
    kind: "brief",
    skuImageCount: 1,
    manufacturerReferenceImageCount: 3,
  });
  assert.match(prompt, /What does CHUB TWO sell\?/);
  assert.match(
    prompt,
    new RegExp(CHUB_TWO_BRIEF_INTRO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.match(prompt, /How to Use/);
  assert.match(prompt, /Never invent a feature/);
  assert.match(
    prompt,
    new RegExp(
      BRIEF_TEMPLATE.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ),
  );
  assert.match(prompt, /Every section title must be a Markdown H1/);
  assert.match(prompt, /Xiaohongshu-style tone/);
  assert.match(prompt, /Do not use emojis/);
});

test("product brief fallback starts with clean Markdown H1 headings and no emojis", () => {
  const prompt = buildProductInfoPrompt({
    kind: "brief",
    skuImageCount: 1,
    manufacturerReferenceImageCount: 0,
  });
  assert.match(prompt, /# What does CHUB TWO sell\?/);
  assert.match(prompt, /# Designed for Everyday Use/);
  assert.doesNotMatch(prompt, /✨|🌿|⚡|🎒|🧩|👇/);
});

test("product brief normalization upgrades QA section titles and removes emojis", () => {
  const brief = normalizeProductBrief({
    content:
      "What does CHUB TWO sell? ✨\n\nIntro\n\nMade for students 🎒\n\nA concise answer.",
  });
  assert.match(brief.content, /^# What does CHUB TWO sell\?/);
  assert.match(brief.content, /# Made for students/);
  assert.doesNotMatch(brief.content, /✨|🎒/);
});

test("product brief normalization removes excessive blank lines", () => {
  const brief = normalizeProductBrief({
    content:
      "# What does CHUB TWO sell?\n\n\n\nIntro\n\n\n# Made for students\n\nAnswer.",
  });
  assert.doesNotMatch(brief.content, /\n{3,}/);
});

test("style image prompt enforces product-only three-quarter SKU rendering", () => {
  const prompt = buildStyleImagePrompt({ skuIndex: 1 });
  assert.match(prompt, /SKU 2/);
  assert.match(prompt, /45-degree overhead/);
  assert.match(prompt, /Product only/);
  assert.match(prompt, /no person, logo, text/);
  assert.match(prompt, /consistent orientation/);
});

test("later SKU style prompts use the first generated image as the composition master", () => {
  const prompt = buildStyleImagePrompt({
    skuIndex: 1,
    compositionReferenceUrl: "https://example.com/master.png",
  });
  assert.match(prompt, /strict composition master/);
  assert.match(
    prompt,
    /Match its camera angle, product placement, scale, rotation/,
  );
  assert.match(prompt, /Reference image 1 is the current SKU/);
  assert.match(prompt, /Do not copy the master product or its color/);
});

test("product info uses manufacturer references without requiring SKU images", async () => {
  const body = JSON.stringify({
    kind: "title",
    productSkuDataUrls: [],
    manufacturerReferenceGroups: [group("scene", 1)],
  });
  const productInfoResponse = await productInfo(
    new Request("http://localhost:3000/api/ecommerce-assets/product-info", {
      method: "POST",
      body,
    }),
  );
  assert.equal(productInfoResponse.status, 200);
  const missingReferenceResponse = await productInfo(
    new Request("http://localhost:3000/api/ecommerce-assets/product-info", {
      method: "POST",
      body: JSON.stringify({ kind: "title", productSkuDataUrls: [] }),
    }),
  );
  assert.equal(missingReferenceResponse.status, 400);

  const styleResponse = await styleImageCreate(
    new Request(
      "http://localhost:3000/api/ecommerce-assets/style-images/create",
      { method: "POST", body: JSON.stringify({ productSkuDataUrls: [] }) },
    ),
  );
  assert.equal(styleResponse.status, 400);
});

test("product info still accepts SKU images when manufacturer references exist", async () => {
  const response = await productInfo(
    new Request("http://localhost:3000/api/ecommerce-assets/product-info", {
      method: "POST",
      body: JSON.stringify({
        kind: "brief",
        productSkuDataUrls: ["data:image/png;base64,AA=="],
        manufacturerReferenceGroups: groups,
      }),
    }),
  );
  assert.equal(response.status, 200);
});

test("product title normalization falls back to one long prefixed title", () => {
  const titles = normalizeProductTitles([{ id: "bad", title: "Not branded" }]);
  assert.equal(titles.length, 1);
  assert.ok(titles[0].title.length >= 40);
  assert.equal(
    titles.every((proposal) => proposal.title.startsWith("CHUB TWO｜")),
    true,
  );
});

test("copy normalization fills every generated slot with safe fallback proposals", () => {
  const options = normalizeCopyOptions(
    [
      {
        slotId: "main-1",
        proposals: [{ id: "x", title: "One", subtitle: "Two" }],
      },
    ],
    referenceCounts,
  );
  assert.equal(options.length, 8);
  assert.equal(
    options.every((slot) => slot.proposals.length === 3),
    true,
  );
});

test("prompts enforce CHUB TWO fixed rules, primary SKU, person, and logo scope", () => {
  const prompts = buildEcommerceCarouselPrompts({
    skuImageCount: 3,
    primarySkuIndex: 0,
    selectedCopyBySlot: selectedCopy,
    manufacturerReferenceCountByRole: referenceCounts,
  });
  assert.equal(prompts.length, 8);
  assert.equal(prompts[0].usePerson, true);
  assert.match(prompts[0].prompt, /right hand reaching forward/);
  assert.match(
    prompts[0].prompt,
    /image 1 is the ONLY product identity source \(SKU 1\)/,
  );
  assert.match(prompts[0].prompt, /upper-left half/);
  assert.match(prompts[0].prompt, /lower-right half/);
  assert.match(
    prompts[0].prompt,
    new RegExp(CHUB_TWO_PERSON_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.match(
    prompts[0].prompt,
    new RegExp(
      CHUB_TWO_MAIN_COMPOSITION_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ),
  );
  assert.match(prompts[0].prompt, /layout only/);
  assert.match(prompts[0].prompt, /Do not add the configured logo/);
  assert.equal(prompts[1].usePerson, false);
  assert.match(prompts[1].prompt, /3 uploaded manufacturer reference/);
  assert.match(
    prompts.find((slot) => slot.id === "variant-1")!.prompt,
    /SKU differences/,
  );
  assert.match(prompts[1].prompt, /Ignore and remove every logo/);
  assert.notEqual(
    prompts.find((slot) => slot.id === "scene-1")!.prompt,
    prompts.find((slot) => slot.id === "scene-2")!.prompt,
  );
  assert.match(prompts[0].prompt, /1:1/);
  assert.match(prompts[0].prompt, /English only/);
});

test("carousel prompts use editable person, logo, and composition configuration", () => {
  const prompts = buildEcommerceCarouselPrompts({
    skuImageCount: 1,
    primarySkuIndex: 0,
    selectedCopyBySlot: {
      "main-1": { id: "main-1", title: "Headline", subtitle: "Subtitle" },
    },
    manufacturerReferenceCountByRole: { scene: 0, detail: 0, variant: 1 },
    generationConfig: {
      ...CHUB_TWO_DEFAULT_GENERATION_CONFIG,
      person: {
        imageUrl: "https://example.com/person.png",
        prompt: "Use the configured person in the lower-right.",
      },
      logo: {
        imageUrl: "https://example.com/logo.png",
        prompt: "Use the configured logo in the top-left.",
      },
      mainComposition: {
        imageUrl: "https://example.com/layout.png",
        prompt: "Use this custom layout reference.",
      },
    },
  });
  assert.match(prompts[0].prompt, /https:\/\/example\.com\/person\.png/);
  assert.match(prompts[0].prompt, /https:\/\/example\.com\/layout\.png/);
  assert.match(
    prompts.find((slot) => slot.id === "variant-1")!.prompt,
    /https:\/\/example\.com\/logo\.png/,
  );
});

test("analyze route rejects missing SKU images", async () => {
  const response = await analyzeEcommerceAssets(
    new Request("http://localhost:3000/api/ecommerce-assets/analyze", {
      method: "POST",
      body: JSON.stringify({
        productSkuDataUrls: [],
        manufacturerReferenceGroups: groups,
      }),
    }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /SKU/i);
});

test("analyze route returns nine fallback proposal groups when model configuration is unavailable", async () => {
  const response = await analyzeEcommerceAssets(
    new Request("http://localhost:3000/api/ecommerce-assets/analyze", {
      method: "POST",
      body: JSON.stringify({
        productSkuDataUrls: ["data:image/png;base64,AA=="],
        manufacturerReferenceGroups: groups,
      }),
    }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.slots.length, 8);
  assert.equal(
    body.slots.every(
      (slot: { proposals: unknown[] }) => slot.proposals.length === 1,
    ),
    true,
  );
  assert.equal(Object.keys(body.copyBySlot).length, 8);
  assert.equal(body.usedFallback, true);
});

test("create route rejects incomplete copy selection without requiring person upload", async () => {
  const response = await createEcommerceAssets(
    new Request("http://localhost:3000/api/ecommerce-assets/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productSkuDataUrls: ["data:image/png;base64,AA=="],
        manufacturerReferenceGroups: groups,
        selectedCopyBySlot: {},
      }),
    }),
  );
  assert.equal(response.status, 400);
  assert.match(
    (await response.json()).error,
    /every generated carousel image/i,
  );
});

test("create route rejects incorrect manufacturer group counts", async () => {
  const response = await createEcommerceAssets(
    new Request("http://localhost:3000/api/ecommerce-assets/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productSkuDataUrls: ["data:image/png;base64,AA=="],
        manufacturerReferenceGroups: [
          group("scene", 5),
          group("detail", 3),
          group("variant", 1),
        ],
        selectedCopyBySlot: selectedCopy,
      }),
    }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /up to 4/i);
});
