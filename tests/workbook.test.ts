import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import JSZip from "jszip";
import { buildGenerationPrompt } from "../src/lib/prompt";
import { aspectRatioFromSize, parseWorkbook, resolutionFromSize } from "../src/lib/xlsx-parser";

const SAMPLE_WORKBOOK_PATH = "test_data/clone_competitor/examples.xlsx";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineCell(ref: string, value: string) {
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function formulaCell(ref: string, formula: string) {
  return `<c r="${ref}"><f>${escapeXml(formula)}</f></c>`;
}

async function buildDynamicImageWorkbook({
  imageCount,
  includeStyle = true,
}: {
  imageCount: number;
  includeStyle?: boolean;
}) {
  const zip = new JSZip();
  const imageColumns = Array.from({ length: imageCount }, (_, index) => String.fromCharCode(68 + index));
  const copyColumn = String.fromCharCode(68 + imageCount);
  const styleColumn = String.fromCharCode(69 + imageCount);
  const headers = [
    ["A", "序号"],
    ["B", "尺寸"],
    ["C", "需求"],
    ...imageColumns.map((col, index) => [col, `参考图${index + 1}`]),
    [copyColumn, "文案"],
    ...(includeStyle ? [[styleColumn, "风格"]] : []),
  ];
  const imageIds = Array.from({ length: imageCount }, (_, index) => `ID_DYNAMIC_${index + 1}`);
  const row1 = headers.map(([col, value]) => inlineCell(`${col}1`, value)).join("");
  const row3 = [
    inlineCell("A3", "1"),
    inlineCell("B3", "1600*1600"),
    inlineCell("C3", "Dynamic requirement"),
    ...imageColumns.map((col, index) => formulaCell(`${col}3`, `_xlfn.DISPIMG("${imageIds[index]}",1)`)),
    inlineCell(`${copyColumn}3`, "Launch Copy"),
    ...(includeStyle ? [inlineCell(`${styleColumn}3`, "Studio style")] : []),
  ].join("");

  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <worksheet><sheetData><row r="1">${row1}</row><row r="3">${row3}</row></sheetData></worksheet>`
  );
  zip.file(
    "xl/worksheets/sheet2.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <worksheet><sheetData>
      <row r="2">${inlineCell("A2", "Dynamic Product")}</row>
      <row r="4">${inlineCell("A4", "Dynamic Description")}</row>
    </sheetData></worksheet>`
  );
  zip.file(
    "xl/_rels/cellimages.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships>${imageIds
      .map((_, index) => `<Relationship Id="rId${index + 1}" Target="media/image${index + 1}.png"/>`)
      .join("")}</Relationships>`
  );
  zip.file(
    "xl/cellimages.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <cellImages xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${imageIds
      .map(
        (id, index) =>
          `<cellImage><pic><nvPicPr><cNvPr name="${id}"/></nvPicPr><blipFill><blip r:embed="rId${index + 1}"/></blipFill></pic></cellImage>`
      )
      .join("")}</cellImages>`
  );
  for (let index = 0; index < imageCount; index += 1) {
    zip.file(`xl/media/image${index + 1}.png`, Buffer.from([137, 80, 78, 71, index]));
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

test("parses the sample workbook rows and WPS DISPIMG images", async () => {
  const buffer = await readFile(SAMPLE_WORKBOOK_PATH);
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
  assert.match(workbook.rows[0].copyText, /Why Choose Us/);
  assert.match(workbook.rows[1].copyText, /Keep Your Family Cool/);
});

test("parses all DISPIMG cells between requirement and copy as dynamic reference images", async () => {
  const workbook = await parseWorkbook(await buildDynamicImageWorkbook({ imageCount: 5 }));

  assert.equal(workbook.rows.length, 1);
  assert.equal(workbook.rows[0].referenceImages.length, 5);
  assert.equal(workbook.rows[0].copyText, "Launch Copy");
  assert.equal(workbook.rows[0].style, "Studio style");
  assert.equal(workbook.rows[0].source.cells.I, "Launch Copy");
});

test("parses one dynamic image column and treats style as optional", async () => {
  const workbook = await parseWorkbook(await buildDynamicImageWorkbook({ imageCount: 1, includeStyle: false }));

  assert.equal(workbook.rows.length, 1);
  assert.equal(workbook.rows[0].referenceImages.length, 1);
  assert.equal(workbook.rows[0].copyText, "Launch Copy");
  assert.equal(workbook.rows[0].style, "");
});

test("maps 1600*1600 to the KIE square aspect ratio", () => {
  assert.equal(aspectRatioFromSize("1600*1600"), "1:1");
  assert.equal(resolutionFromSize("1600*1600"), "2K");
});

test("chooses the closest KIE aspect ratio when a spreadsheet size is present", () => {
  assert.equal(aspectRatioFromSize("1200*800"), "4:3");
  assert.equal(aspectRatioFromSize("2000*1000"), "16:9");
  assert.equal(aspectRatioFromSize("not provided"), "auto");
});

test("chooses KIE resolution tiers from requested pixel size", () => {
  assert.equal(resolutionFromSize("800*800"), "1K");
  assert.equal(resolutionFromSize("1600*900"), "2K");
  assert.equal(resolutionFromSize("3000*1688"), "4K");
  assert.equal(resolutionFromSize("3000*3000"), "2K");
});

test("builds English-first prompts with visible text and reference roles", async () => {
  const buffer = await readFile(SAMPLE_WORKBOOK_PATH);
  const workbook = await parseWorkbook(buffer);
  const prompt = buildGenerationPrompt(workbook, workbook.rows[0]);

  assert.match(prompt, /Default all visible text in the generated image to English/);
  assert.match(prompt, /Required visible title\/text/);
  assert.match(prompt, /Why Choose Us/);
  assert.match(prompt, /competitor\/reference photos/);
});
