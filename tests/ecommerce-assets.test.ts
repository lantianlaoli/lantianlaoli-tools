import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEcommerceCarouselPrompts,
  buildEcommerceCopyAnalysisPrompt,
  CHUB_TWO_DEFAULT_STYLE_GUIDE,
  CHUB_TWO_MAIN_COMPOSITION_URL,
  CHUB_TWO_PERSON_URL,
  fallbackEcommerceCopyOptions,
  getEcommerceCarouselSlots,
  normalizeCopyOptions,
} from "../src/lib/ecommerce-assets";
import { POST as analyzeEcommerceAssets } from "../src/app/api/ecommerce-assets/analyze/route";
import { POST as createEcommerceAssets } from "../src/app/api/ecommerce-assets/create/route";

const referenceCounts = { scene: 3, detail: 3, variant: 1 } as const;
const selectedCopy = Object.fromEntries(fallbackEcommerceCopyOptions(referenceCounts).map((slot) => [slot.slotId, slot.proposals[0]]));
const group = (role: string, count: number) => ({ role, dataUrls: Array.from({ length: count }, () => "data:image/png;base64,AA==") });
const groups = [group("scene", 3), group("detail", 3), group("variant", 1)];

test("carousel slots follow uploaded references plus original main and variant images", () => {
  const slots = getEcommerceCarouselSlots(referenceCounts);
  assert.equal(slots.length, 8);
  for (const role of ["main", "scene", "detail", "variant"] as const) assert.equal(slots.filter((slot) => slot.role === role).length, role === "main" || role === "variant" ? 1 : referenceCounts[role]);
  assert.equal(slots[0].id, "main-1");
  assert.equal(slots[7].id, "variant-1");
});

test("copy analysis prompt requires three English proposals per slot", () => {
  const prompt = buildEcommerceCopyAnalysisPrompt({ skuImageCount: 3, manufacturerReferenceImageCount: 7, referenceCounts });
  assert.match(prompt, /exactly three English/);
  assert.match(prompt, /generated TikTok Shop carousel slot/);
  assert.match(prompt, /first SKU is the only product reference/);
  assert.match(prompt, /visible source copy/);
  assert.match(prompt, /manufacturer source copy/);
  assert.match(prompt, /rewrite its real selling points/);
  assert.match(prompt, /editable style guide/);
  assert.match(prompt, new RegExp(CHUB_TWO_DEFAULT_STYLE_GUIDE.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("copy normalization fills every generated slot with safe fallback proposals", () => {
  const options = normalizeCopyOptions([{ slotId: "main-1", proposals: [{ id: "x", title: "One", subtitle: "Two" }] }], referenceCounts);
  assert.equal(options.length, 8);
  assert.equal(options.every((slot) => slot.proposals.length === 3), true);
});

test("prompts enforce CHUB TWO fixed rules, primary SKU, person, and logo scope", () => {
  const prompts = buildEcommerceCarouselPrompts({ skuImageCount: 3, primarySkuIndex: 0, selectedCopyBySlot: selectedCopy, manufacturerReferenceCountByRole: referenceCounts });
  assert.equal(prompts.length, 8);
  assert.equal(prompts[0].usePerson, true);
  assert.match(prompts[0].prompt, /right hand reaching forward/);
  assert.match(prompts[0].prompt, /Use only SKU 1/);
  assert.match(prompts[0].prompt, /upper-left half/);
  assert.match(prompts[0].prompt, /lower-right half/);
  assert.match(prompts[0].prompt, new RegExp(CHUB_TWO_PERSON_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompts[0].prompt, new RegExp(CHUB_TWO_MAIN_COMPOSITION_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompts[0].prompt, /strict composition and layout reference/);
  assert.match(prompts[0].prompt, /Do not add the CHUB TWO logo/);
  assert.equal(prompts[1].usePerson, false);
  assert.match(prompts[1].prompt, /3 uploaded manufacturer reference/);
  assert.match(prompts.find((slot) => slot.id === "variant-1")!.prompt, /SKU differences/);
  assert.match(prompts[1].prompt, /Ignore and remove every logo/);
  assert.notEqual(prompts.find((slot) => slot.id === "scene-1")!.prompt, prompts.find((slot) => slot.id === "scene-2")!.prompt);
  assert.match(prompts[0].prompt, /1:1/);
  assert.match(prompts[0].prompt, /English only/);
});

test("analyze route rejects missing SKU images", async () => {
  const response = await analyzeEcommerceAssets(new Request("http://localhost:3000/api/ecommerce-assets/analyze", { method: "POST", body: JSON.stringify({ productSkuDataUrls: [], manufacturerReferenceGroups: groups }) }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /SKU/i);
});

test("analyze route returns nine fallback proposal groups when model configuration is unavailable", async () => {
  const response = await analyzeEcommerceAssets(new Request("http://localhost:3000/api/ecommerce-assets/analyze", { method: "POST", body: JSON.stringify({ productSkuDataUrls: ["data:image/png;base64,AA=="], manufacturerReferenceGroups: groups }) }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.slots.length, 8);
  assert.equal(body.slots.every((slot: { proposals: unknown[] }) => slot.proposals.length === 3), true);
  assert.equal(body.usedFallback, true);
});

test("create route rejects incomplete copy selection without requiring person upload", async () => {
  const response = await createEcommerceAssets(new Request("http://localhost:3000/api/ecommerce-assets/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productSkuDataUrls: ["data:image/png;base64,AA=="], manufacturerReferenceGroups: groups, selectedCopyBySlot: {} }),
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /every generated carousel image/i);
});

test("create route rejects incorrect manufacturer group counts", async () => {
  const response = await createEcommerceAssets(new Request("http://localhost:3000/api/ecommerce-assets/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productSkuDataUrls: ["data:image/png;base64,AA=="], manufacturerReferenceGroups: [group("scene", 5), group("detail", 3), group("variant", 1)], selectedCopyBySlot: selectedCopy }),
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /up to 4/i);
});
