import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { KieAspectRatio, KieResolution, ParsedWorkbook, ParsedWorkbookRow, WorkbookImage } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: "",
  textNodeName: "#text",
});

const columnNames = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(getText).join("");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record["#text"] != null) return getText(record["#text"]);
    return Object.values(record).map(getText).join("");
  }
  return "";
}

function getRichText(item: unknown): string {
  if (!item) return "";
  if (typeof item === "string") return item;
  const si = item as Record<string, unknown>;
  if (si.t != null) {
    const t = si.t;
    if (typeof t === "string") return t;
    if (typeof t === "object") {
      const tObj = t as Record<string, unknown>;
      return tObj["#text"] != null ? String(tObj["#text"]) : "";
    }
    return String(t);
  }
  const runs = asArray(si.r);
  return runs.map((run) => {
    const runObj = run as Record<string, unknown>;
    const t = runObj.t;
    if (t == null) return "";
    if (typeof t === "string") return t;
    if (typeof t === "object") {
      const tObj = t as Record<string, unknown>;
      return tObj["#text"] != null ? String(tObj["#text"]) : "";
    }
    return String(t);
  }).join("");
}

export function looksGarbled(text: string): boolean {
  if (text.length < 10) return false;
  const hasHexColor = /[0-9A-F]{6,}/.test(text);
  const hasCJK = /[\u4e00-\u9fff]/.test(text);
  const hasHtmlEntity = /&#/.test(text);
  const hasFontPattern = /微软雅黑|宋体|黑体/i.test(text);
  return ((hasHexColor || hasHtmlEntity) && hasCJK) || hasFontPattern;
}

function normalizeCellRef(ref: string) {
  const match = /^([A-Z]+)(\d+)$/i.exec(ref);
  if (!match) return null;
  return { col: match[1].toUpperCase(), row: Number(match[2]) };
}

function mimeForFile(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

function targetToMediaPath(target: string) {
  return target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\.\//, "")}`;
}

function extractDispimgId(value: string) {
  return /DISPIMG\("([^"]+)"/i.exec(value)?.[1] ?? null;
}

export function aspectRatioFromSize(size: string): KieAspectRatio {
  const match = /(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)/.exec(size);
  if (!match) return "auto";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return "auto";
  const ratio = width / height;
  const candidates: Array<[KieAspectRatio, number]> = [
    ["1:1", 1],
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
  ];
  const [best, bestRatio] = candidates.reduce((current, candidate) => {
    return Math.abs(candidate[1] - ratio) < Math.abs(current[1] - ratio) ? candidate : current;
  });
  return Math.abs(bestRatio - ratio) < 0.04 ? best : "auto";
}

export function resolutionFromSize(size: string, aspectRatio = aspectRatioFromSize(size)): KieResolution {
  const match = /(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)/.exec(size);
  if (!match || aspectRatio === "auto") return "1K";

  const width = Number(match[1]);
  const height = Number(match[2]);
  const longestSide = Math.max(width, height);

  if (longestSide <= 1024) return "1K";
  if (aspectRatio === "1:1") return "2K";
  return longestSide <= 2048 ? "2K" : "4K";
}

async function parseSharedStrings(zip: JSZip) {
  const file = zip.file("xl/sharedStrings.xml");
  if (!file) return [];
  const xml = await file.async("string");
  const doc = parser.parse(xml);
  return asArray(doc?.sst?.si).map((item) => getRichText(item));
}

async function parseSheet(zip: JSZip, sheetPath: string, sharedStrings: string[]) {
  const file = zip.file(sheetPath);
  if (!file) return new Map<string, string>();
  const xml = await file.async("string");
  const doc = parser.parse(xml);
  const cells = new Map<string, string>();
  const rows = asArray(doc?.worksheet?.sheetData?.row);
  for (const row of rows) {
    for (const cell of asArray(row?.c)) {
      const ref = cell?.r;
      if (!ref) continue;
      const formula = getText(cell.f);
      if (formula) {
        cells.set(ref, `=${formula}`);
        continue;
      }
      const raw = getText(cell.v);
      if (cell.t === "s" && raw !== "") {
        cells.set(ref, sharedStrings[Number(raw)] ?? "");
      } else if (cell.t === "inlineStr") {
        cells.set(ref, getText(cell.is));
      } else {
        cells.set(ref, raw);
      }
    }
  }
  return cells;
}

async function parseCellImages(zip: JSZip): Promise<Map<string, WorkbookImage>> {
  const relsFile = zip.file("xl/_rels/cellimages.xml.rels");
  const imagesFile = zip.file("xl/cellimages.xml");
  if (!relsFile || !imagesFile) return new Map();

  const relsDoc = parser.parse(await relsFile.async("string"));
  const rels = new Map<string, string>();
  for (const rel of asArray(relsDoc?.Relationships?.Relationship)) {
    if (rel?.Id && rel?.Target) rels.set(rel.Id, targetToMediaPath(rel.Target));
  }

  const imageDoc = parser.parse(await imagesFile.async("string"));
  const result = new Map<string, WorkbookImage>();
  for (const cellImage of asArray(imageDoc?.cellImages?.cellImage)) {
    const pic = cellImage?.pic;
    const name = pic?.nvPicPr?.cNvPr?.name;
    const relId = pic?.blipFill?.blip?.["r:embed"] ?? pic?.blipFill?.blip?.embed;
    const mediaPath = relId ? rels.get(relId) : undefined;
    const file = mediaPath ? zip.file(mediaPath) : null;
    if (!name || !mediaPath || !file) continue;
    const bytes = await file.async("base64");
    const fileName = mediaPath.split("/").pop() ?? `${name}.png`;
    const mimeType = mimeForFile(fileName);
    result.set(name, {
      id: name,
      fileName,
      mimeType,
      dataUrl: `data:${mimeType};base64,${bytes}`,
    });
  }
  return result;
}

function rowObject(cells: Map<string, string>, rowNumber: number) {
  const values: Record<string, string> = {};
  for (const col of columnNames) {
    values[col] = cells.get(`${col}${rowNumber}`)?.trim() ?? "";
  }
  return values;
}

function imagesForRow(values: Record<string, string>, imageMap: Map<string, WorkbookImage>) {
  return ["D", "E"]
    .map((col) => extractDispimgId(values[col] ?? ""))
    .filter((id): id is string => Boolean(id))
    .map((id) => imageMap.get(id))
    .filter((image): image is WorkbookImage => Boolean(image));
}

function buildParsedRow(cells: Map<string, string>, imageMap: Map<string, WorkbookImage>, rowNumber: number): ParsedWorkbookRow {
  const values = rowObject(cells, rowNumber);
  const aspectRatio = aspectRatioFromSize(values.B);
  return {
    id: `row-${rowNumber}`,
    rowNumber,
    sequence: values.A,
    size: values.B,
    requirement: values.C,
    copyText: values.F,
    style: values.G,
    aspectRatio,
    resolution: resolutionFromSize(values.B, aspectRatio),
    referenceImages: imagesForRow(values, imageMap),
    source: { cells: values },
  };
}

export async function parseWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParsedWorkbook> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings = await parseSharedStrings(zip);
  const [sheet1, sheet2, imageMap] = await Promise.all([
    parseSheet(zip, "xl/worksheets/sheet1.xml", sharedStrings),
    parseSheet(zip, "xl/worksheets/sheet2.xml", sharedStrings),
    parseCellImages(zip),
  ]);

  const rowNumbers = [...sheet1.keys()]
    .map((ref) => normalizeCellRef(ref))
    .filter((ref): ref is { col: string; row: number } => Boolean(ref))
    .map((ref) => ref.row)
    .filter((row) => row >= 2);
  const maxRow = Math.max(...rowNumbers, 1);
  const allRows = Array.from({ length: Math.max(0, maxRow - 1) }, (_, index) =>
    buildParsedRow(sheet1, imageMap, index + 2)
  ).filter((row) => row.requirement || row.copyText || row.referenceImages.length > 0);

  const mainImageRow = allRows.find((row) => row.rowNumber === 2);
  const rows = allRows.filter((row) => row.rowNumber >= 3);
  const warnings: string[] = [];
  if (!mainImageRow?.referenceImages.length) {
    warnings.push("No product reference images found in Sheet1 row 2 columns D:E.");
  }
  for (const row of allRows) {
    for (const col of ["D", "E"]) {
      const value = row.source.cells[col];
      const id = extractDispimgId(value);
      if (id && !imageMap.has(id)) warnings.push(`Row ${row.rowNumber} column ${col} image ${id} was not found.`);
    }
  }

  return {
    product: {
      title: sheet2.get("A2")?.trim() ?? "",
      description: sheet2.get("A4")?.trim() ?? "",
      images: mainImageRow?.referenceImages ?? [],
    },
    rows,
    mainImageRow,
    warnings,
    imageCount: imageMap.size,
  };
}
