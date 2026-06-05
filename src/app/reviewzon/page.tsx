"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  FileSpreadsheet,
  Languages,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";

import {
  importReviewzonRows,
  type AnalyzeStreamEvent,
  type ImportedReviewRow,
  type ReviewMappedRow,
  type ReviewThemeSummary,
} from "@/lib/reviewzon";

type Locale = "zh" | "en";

const pointTranslations: Record<string, { zh: string; en: string }> = {
  有效果: { zh: "有效果", en: "Effective" },
  瘙痒减轻: { zh: "瘙痒减轻", en: "Reduced itching" },
  气味好闻: { zh: "气味好闻", en: "Pleasant smell" },
  适口性好: { zh: "适口性好", en: "Palatable" },
  易于使用: { zh: "易于使用", en: "Easy to use" },
  成分天然: { zh: "成分天然", en: "Natural ingredients" },
  无副作用: { zh: "无副作用", en: "No side effects" },
  性价比高: { zh: "性价比高", en: "Good value" },
  没有效果: { zh: "没有效果", en: "No effect" },
  引起不适: { zh: "引起不适", en: "Causes discomfort" },
  气味难闻: { zh: "气味难闻", en: "Bad smell" },
  包装破损: { zh: "包装破损", en: "Damaged packaging" },
  产品有杂质: { zh: "产品有杂质", en: "Product debris" },
  使用不便: { zh: "使用不便", en: "Inconvenient to use" },
  见效慢: { zh: "见效慢", en: "Slow results" },
  虚假宣传: { zh: "虚假宣传", en: "Misleading claims" },
};

const previewRows = [
  {
    id: "#001",
    content: "Redness reduced significantly within 3 days. My dog stopped scratching almost immediately.",
    pros: ["Redness reduced", "Scratching stopped"],
    cons: [],
  },
  {
    id: "#002",
    content: "The flavor is a hit, but the pump bottle is leaky and messy to use.",
    pros: ["Good flavor"],
    cons: ["Leaky bottle", "Messy application"],
  },
  {
    id: "#003",
    content: "Very easy to apply. No strong medicinal smell and good value for the size.",
    pros: ["Easy application", "No medicinal smell", "Good value"],
    cons: [],
  },
];

const copy = {
  zh: {
    back: "返回首页",
    brand: "Reviewzon",
    eyebrow: "Amazon Review Intelligence",
    title: "评论卖点整理工作台",
    body: "上传 Amazon 评论表格，自动归纳高频好评点和差评点，并输出可筛选的 Excel。",
    uploadTitle: "上传评论数据",
    uploadBody: "支持 XLSX / XLS / CSV，必须包含 asin 和 content，可选 selling_points。",
    chooseFile: "选择文件",
    replaceFile: "更换文件",
    maxRows: "单次最多 100 行",
    file: "文件",
    none: "未选择",
    rows: "评论行数",
    analyzing: "分析中",
    ready: "等待上传",
    done: "分析完成",
    failed: "分析失败",
    download: "下载 Excel",
    preview: "结果预览",
    sample: "示例",
    live: "实时结果",
    progress: "处理进度",
    summary: "高频主题",
    pros: "好评点",
    cons: "差评点",
    content: "内容",
    language: "语言",
    empty: "上传文件后会自动开始分析。",
  },
  en: {
    back: "Back home",
    brand: "Reviewzon",
    eyebrow: "Amazon Review Intelligence",
    title: "Review Insight Workspace",
    body: "Upload Amazon review spreadsheets, extract top pros and cons, and export a filter-ready Excel report.",
    uploadTitle: "Upload review data",
    uploadBody: "Supports XLSX / XLS / CSV with required asin and content columns plus optional selling_points.",
    chooseFile: "Choose file",
    replaceFile: "Replace file",
    maxRows: "Max 100 rows",
    file: "File",
    none: "None",
    rows: "Review rows",
    analyzing: "Analyzing",
    ready: "Ready",
    done: "Complete",
    failed: "Failed",
    download: "Download Excel",
    preview: "Preview",
    sample: "Sample",
    live: "Live results",
    progress: "Progress",
    summary: "Top themes",
    pros: "Pros",
    cons: "Cons",
    content: "Content",
    language: "Language",
    empty: "Upload a file to start analysis automatically.",
  },
} satisfies Record<Locale, Record<string, string>>;

function localizePointLabel(label: string, locale: Locale): string {
  if (!label) return "";
  return pointTranslations[label]?.[locale] ?? label;
}

function getSlotHeader(prefix: string, index: number, locale: Locale): string {
  return locale === "zh" ? `${prefix}${index}` : `${prefix} ${index}`;
}

function summaryReady(summary: ReviewThemeSummary | null): summary is ReviewThemeSummary {
  return Boolean(summary && (summary.topPros.length > 0 || summary.topCons.length > 0));
}

function parseSseChunk(chunk: string, onEvent: (event: AnalyzeStreamEvent) => void) {
  const blocks = chunk.split("\n\n");
  const rest = blocks.pop() ?? "";

  for (const block of blocks) {
    const line = block.split("\n").find((value) => value.startsWith("data: "));
    if (line) onEvent(JSON.parse(line.slice("data: ".length)) as AnalyzeStreamEvent);
  }

  return rest;
}

function exportToWorkbook(rows: ReviewMappedRow[], locale: Locale) {
  const proPrefix = locale === "zh" ? "好评点" : "Pro";
  const conPrefix = locale === "zh" ? "差评点" : "Con";
  const contentLabel = locale === "zh" ? "内容" : "Content";
  const headerRow1 = [
    "ASIN",
    contentLabel,
    locale === "zh" ? "好评点" : "Pros",
    "",
    "",
    "",
    "",
    locale === "zh" ? "差评点" : "Cons",
    "",
    "",
    "",
    "",
  ];
  const headerRow2 = [
    "ASIN",
    contentLabel,
    ...Array.from({ length: 5 }, (_, index) => getSlotHeader(proPrefix, index + 1, locale)),
    ...Array.from({ length: 5 }, (_, index) => getSlotHeader(conPrefix, index + 1, locale)),
  ];
  const dataRows = rows.map((row) => [
    row.asin,
    row.content,
    ...row.positiveSlots.map((slot) => localizePointLabel(slot, locale)),
    ...row.negativeSlots.map((slot) => localizePointLabel(slot, locale)),
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...dataRows]);

  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 0, c: 6 } },
    { s: { r: 0, c: 7 }, e: { r: 0, c: 11 } },
  ];
  worksheet["!autofilter"] = { ref: `A2:L${Math.max(dataRows.length + 2, 2)}` };
  worksheet["!cols"] = [{ wch: 14 }, { wch: 58 }, ...Array.from({ length: 10 }, () => ({ wch: 18 }))];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reviewzon");
  XLSX.writeFile(workbook, "reviewzon-analysis.xlsx");
}

export default function ReviewzonPage() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [fileName, setFileName] = useState("");
  const [importedRows, setImportedRows] = useState<ImportedReviewRow[]>([]);
  const [results, setResults] = useState<ReviewMappedRow[]>([]);
  const [summary, setSummary] = useState<ReviewThemeSummary | null>(null);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const t = copy[locale];

  const resultOrder = useMemo(() => new Map(importedRows.map((row, index) => [row.id, index])), [importedRows]);
  const sortedResults = useMemo(
    () =>
      [...results].sort(
        (left, right) => (resultOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (resultOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      ),
    [resultOrder, results],
  );
  const readySummary = summaryReady(summary);
  const progressValue = importedRows.length > 0 ? Math.min(100, Math.round((completedCount / importedRows.length) * 100)) : 0;
  const statusLabel = analysisError ? t.failed : isComplete ? t.done : isAnalyzing ? t.analyzing : t.ready;
  const proPrefix = locale === "zh" ? "好评点" : "Pro";
  const conPrefix = locale === "zh" ? "差评点" : "Con";
  const outputColumns = readySummary
    ? [
        "ASIN",
        t.content,
        ...Array.from({ length: 5 }, (_, index) => getSlotHeader(proPrefix, index + 1, locale)),
        ...Array.from({ length: 5 }, (_, index) => getSlotHeader(conPrefix, index + 1, locale)),
      ]
    : ["ID", t.content, t.pros, t.cons];

  async function startAnalysis(rowsToAnalyze: ImportedReviewRow[]) {
    setIsAnalyzing(true);
    setIsComplete(false);
    setAnalysisError(null);
    setSummary(null);
    setResults([]);
    setCompletedCount(0);

    try {
      const response = await fetch("/api/reviewzon/analyze-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsToAnalyze }),
      });

      if (!response.ok || !response.body) throw new Error("评论分析失败，请稍后重试。");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        pending += decoder.decode(value, { stream: true });
        pending = parseSseChunk(pending, (event) => {
          if (event.type === "summary") {
            setSummary({ topPros: event.topPros, topCons: event.topCons });
            return;
          }
          if (event.type === "chunk") {
            setResults((current) => {
              const merged = new Map(current.map((row) => [row.id, row]));
              for (const row of event.rows) merged.set(row.id, row);
              return [...merged.values()];
            });
            return;
          }
          if (event.type === "progress") {
            setCompletedCount(event.completed);
            return;
          }
          if (event.type === "done") {
            setCompletedCount(event.completed);
            setIsComplete(true);
            return;
          }
          if (event.type === "error") throw new Error(event.message);
        });
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "评论分析失败，请稍后重试。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleFileSelection(file: File) {
    setParsingError(null);
    setAnalysisError(null);
    setSummary(null);
    setResults([]);
    setCompletedCount(0);
    setIsComplete(false);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("文件里没有可读取的工作表。");

      const worksheet = workbook.Sheets[firstSheetName];
      if (!worksheet) throw new Error("文件里没有可读取的工作表。");

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
      const transformedRows = importReviewzonRows(rows);
      setFileName(file.name);
      setImportedRows(transformedRows);
      await startAnalysis(transformedRows);
    } catch (error) {
      setImportedRows([]);
      setFileName("");
      setParsingError(error instanceof Error ? error.message : "文件解析失败，请重试。");
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleFileSelection(file);
    event.target.value = "";
  }

  return (
    <main className="min-h-screen bg-[#10100f] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 md:px-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-zinc-300 transition hover:border-lime-300/30 hover:text-lime-100"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              {t.back}
            </Link>
            <div>
              <p className="font-mono text-xs uppercase text-zinc-500">{t.eyebrow}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{t.brand}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">
              <Languages size={14} aria-hidden="true" className="text-zinc-500" />
              <span className="text-[11px] font-medium text-zinc-500">{t.language}</span>
              <div className="flex gap-0.5 rounded bg-black/30 p-0.5">
                {(["zh", "en"] as const).map((nextLocale) => (
                  <button
                    key={nextLocale}
                    type="button"
                    onClick={() => setLocale(nextLocale)}
                    className={`h-7 rounded px-2 text-[11px] font-semibold transition ${
                      locale === nextLocale ? "bg-lime-300 text-zinc-950" : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    {nextLocale === "zh" ? "中文" : "EN"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <section className="grid flex-1 gap-5 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-lg border border-lime-300/10 bg-[#070b08] p-5">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-lime-300/15 bg-lime-300/[0.07] text-lime-100">
                <MessageSquareText size={24} aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">{t.title}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{t.body}</p>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#070b08] p-5">
              <input ref={fileInputRef} accept=".csv,.xlsx,.xls" className="hidden" type="file" onChange={onFileChange} />
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-200">
                  <FileSpreadsheet size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">{t.uploadTitle}</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{t.uploadBody}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-lime-300/20 bg-lime-300/[0.08] text-sm font-semibold text-lime-100 transition hover:border-lime-300/40 hover:bg-lime-300/[0.13] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAnalyzing ? <Loader2 size={17} aria-hidden="true" className="animate-spin" /> : <Upload size={17} aria-hidden="true" />}
                {fileName ? t.replaceFile : t.chooseFile}
              </button>
              <div className="mt-4 grid gap-2 text-xs text-zinc-500">
                <div className="flex items-center justify-between gap-3">
                  <span>{t.file}</span>
                  <span className="min-w-0 truncate font-mono text-zinc-300" title={fileName || t.none}>
                    {fileName || t.none}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t.rows}</span>
                  <span className="font-mono text-zinc-300">{importedRows.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t.maxRows}</span>
                  <span className="font-mono text-zinc-300">asin / content</span>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#070b08] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">{t.progress}</h3>
                  <p className="mt-1 text-xs text-zinc-500">{statusLabel}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-lime-100">
                  {isAnalyzing ? <RefreshCw size={19} aria-hidden="true" className="animate-spin" /> : <BadgeCheck size={19} aria-hidden="true" />}
                </div>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-lime-300 transition-all duration-500"
                  style={{ width: `${Math.max(progressValue, isAnalyzing ? 8 : isComplete ? 100 : 0)}%` }}
                />
              </div>
              <p className="mt-3 font-mono text-xs text-zinc-500">
                {completedCount} / {importedRows.length || 0}
              </p>
              {isComplete && sortedResults.length > 0 ? (
                <button
                  type="button"
                  onClick={() => exportToWorkbook(sortedResults, locale)}
                  className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-lime-300 text-sm font-semibold text-zinc-950 transition hover:bg-lime-200"
                >
                  <Download size={17} aria-hidden="true" />
                  {t.download}
                </button>
              ) : null}
            </section>

            {parsingError || analysisError ? (
              <div role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
                {parsingError || analysisError}
              </div>
            ) : null}
          </aside>

          <section className="min-w-0 space-y-5">
            <div className="rounded-lg border border-white/10 bg-[#070b08]">
              <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">{t.preview}</h2>
                  <p className="mt-1 text-xs text-zinc-500">{readySummary ? t.live : t.sample}</p>
                </div>
                <div className="rounded-md border border-lime-300/15 bg-lime-300/[0.06] px-3 py-2 font-mono text-xs text-lime-100">
                  {statusLabel}
                </div>
              </div>

              <div className="overflow-x-auto p-5">
                {readySummary ? (
                  <table className="w-full min-w-[1120px] border-collapse text-left">
                    <thead>
                      <tr className="bg-white/[0.04]">
                        {outputColumns.map((label) => (
                          <th key={label} className="border-b border-white/10 p-3 text-xs font-semibold uppercase text-zinc-500">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {sortedResults.slice(0, 5).map((row) => (
                        <tr key={row.id} className="border-b border-white/10 align-top">
                          <td className="p-3 font-mono text-xs text-zinc-500">{row.asin}</td>
                          <td className="max-w-[420px] p-3 leading-6 text-zinc-200">{row.content}</td>
                          {row.positiveSlots.map((slot, index) => (
                            <td key={`${row.id}-pro-${index + 1}`} className="p-3">
                              {slot ? (
                                <span className="rounded-md border border-lime-300/15 bg-lime-300/[0.08] px-2 py-1 text-xs text-lime-100">
                                  {localizePointLabel(slot, locale)}
                                </span>
                              ) : (
                                <span className="text-zinc-600">-</span>
                              )}
                            </td>
                          ))}
                          {row.negativeSlots.map((slot, index) => (
                            <td key={`${row.id}-con-${index + 1}`} className="p-3">
                              {slot ? (
                                <span className="rounded-md border border-red-300/15 bg-red-400/[0.08] px-2 py-1 text-xs text-red-100">
                                  {localizePointLabel(slot, locale)}
                                </span>
                              ) : (
                                <span className="text-zinc-600">-</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[760px] border-collapse text-left">
                    <thead>
                      <tr className="bg-white/[0.04]">
                        {outputColumns.map((label) => (
                          <th key={label} className="border-b border-white/10 p-3 text-xs font-semibold uppercase text-zinc-500">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {previewRows.map((row) => (
                        <tr key={row.id} className="border-b border-white/10 align-top">
                          <td className="p-3 font-mono text-xs text-zinc-500">{row.id}</td>
                          <td className="p-3 leading-6 text-zinc-200">{row.content}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1.5">
                              {row.pros.map((item) => (
                                <span key={item} className="rounded-md border border-lime-300/15 bg-lime-300/[0.08] px-2 py-1 text-xs text-lime-100">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1.5">
                              {row.cons.length ? (
                                row.cons.map((item) => (
                                  <span key={item} className="rounded-md border border-red-300/15 bg-red-400/[0.08] px-2 py-1 text-xs text-red-100">
                                    {item}
                                  </span>
                                ))
                              ) : (
                                <span className="text-zinc-600">-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <section className="rounded-lg border border-white/10 bg-[#070b08] p-5">
                <p className="mb-3 text-xs font-semibold uppercase text-zinc-500">{t.summary} · {t.pros}</p>
                <div className="flex flex-wrap gap-2">
                  {readySummary && summary.topPros.length ? (
                    summary.topPros.map((item, index) => (
                      <span key={`${item}-${index}`} className="rounded-md border border-lime-300/15 bg-lime-300/[0.08] px-2.5 py-1.5 text-xs text-lime-100">
                        {getSlotHeader(proPrefix, index + 1, locale)}: {localizePointLabel(item, locale)}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-zinc-500">{t.empty}</span>
                  )}
                </div>
              </section>
              <section className="rounded-lg border border-white/10 bg-[#070b08] p-5">
                <p className="mb-3 text-xs font-semibold uppercase text-zinc-500">{t.summary} · {t.cons}</p>
                <div className="flex flex-wrap gap-2">
                  {readySummary && summary.topCons.length ? (
                    summary.topCons.map((item, index) => (
                      <span key={`${item}-${index}`} className="rounded-md border border-red-300/15 bg-red-400/[0.08] px-2.5 py-1.5 text-xs text-red-100">
                        {getSlotHeader(conPrefix, index + 1, locale)}: {localizePointLabel(item, locale)}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-zinc-500">{t.empty}</span>
                  )}
                </div>
              </section>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

