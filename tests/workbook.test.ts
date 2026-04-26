import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildGenerationPrompt } from "../src/lib/prompt";
import { aspectRatioFromSize, parseWorkbook, resolutionFromSize } from "../src/lib/xlsx-parser";

test("parses the sample workbook rows and WPS DISPIMG images", async () => {
  const buffer = await readFile("test_data/examples.xlsx");
  const workbook = await parseWorkbook(buffer);

  assert.equal(workbook.product.title.startsWith("Desk Fan"), true);
  assert.equal(workbook.product.description.startsWith("Compact and Powerful Design"), true);
  assert.equal(workbook.imageCount, 12);
  assert.equal(workbook.product.images.length, 2);
  assert.equal(workbook.mainImageRow?.rowNumber, 2);
  assert.equal(workbook.rows.length, 6);
  assert.equal(workbook.rows[0].rowNumber, 3);
  assert.equal(workbook.rows.at(-1)?.rowNumber, 8);
  assert.equal(workbook.rows[0].referenceImages.length, 1);
  assert.equal(workbook.rows[1].referenceImages.length, 2);
});

test("maps 1600*1600 to the KIE square aspect ratio", () => {
  assert.equal(aspectRatioFromSize("1600*1600"), "1:1");
  assert.equal(resolutionFromSize("1600*1600"), "2K");
});

test("chooses KIE resolution tiers from requested pixel size", () => {
  assert.equal(resolutionFromSize("800*800"), "1K");
  assert.equal(resolutionFromSize("1600*900"), "2K");
  assert.equal(resolutionFromSize("3000*1688"), "4K");
  assert.equal(resolutionFromSize("3000*3000"), "2K");
});

test("builds English-first prompts with visible text and reference roles", async () => {
  const buffer = await readFile("test_data/examples.xlsx");
  const workbook = await parseWorkbook(buffer);
  const prompt = buildGenerationPrompt(workbook, workbook.rows[0]);

  assert.match(prompt, /Default all visible text in the generated image to English/);
  assert.match(prompt, /Required visible title\/text/);
  assert.match(prompt, /Why Choose Us/);
  assert.match(prompt, /competitor\/reference photos/);
});
