"use client";

import Link from "next/link";
import {
  Check,
  Camera,
  Calculator,
  ChevronRight,
  Copy as CopyIcon,
  Download,
  Film,
  History,
  Images,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  EcommerceAssetsJob,
  EcommerceCarouselRole,
  EcommerceGenerationConfig,
  EcommerceHistoryRecord,
  EcommerceImageSlot,
  EcommerceProductTitleProposal,
  EcommerceStyleImageJob,
  EcommerceStyleImageSlot,
  EcommerceStoryboardJob,
  EcommerceStoryboardSlot,
  EcommercePricingResult,
  EcommercePricingConfig,
  TikTokPricingMarketInput,
} from "@/lib/types";
import {
  CHUB_TWO_DEFAULT_GENERATION_CONFIG,
  CHUB_TWO_PERSON_URL,
  ECOMMERCE_CAROUSEL_ROLE_COUNTS,
} from "@/lib/ecommerce-assets";
import {
  defaultTikTokPricingMarket,
} from "@/lib/tiktok-pricing";
import {
  ECOMMERCE_HISTORY_STORAGE_KEY,
  ECOMMERCE_HISTORY_LIMIT,
  normalizeEcommerceHistory,
  saveEcommerceHistory,
} from "@/lib/ecommerce-history";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const REF_ROLES: EcommerceCarouselRole[] = ["scene", "detail"];
const SKU_ID_STOP_WORDS = new Set([
  "SKU",
  "PRODUCT",
  "IMAGE",
  "IMG",
  "PHOTO",
  "VARIANT",
  "STYLE",
  "FINAL",
]);
const CONFIG_STORAGE_KEY = "chub-two-generation-config";
const OUTPUT_KEYS: OutputKey[] = ["info", "carousel", "storyboard", "style", "pricing"];
type UploadItem = { id: string; dataUrl: string; fileName: string };
type OutputKey = "info" | "carousel" | "storyboard" | "style" | "pricing";
type OutputStatus = "idle" | "processing" | "completed" | "failed";
type UiLanguage = "zh" | "en";
type ProductViewKey = "front" | "side" | "back";
const PRODUCT_VIEW_KEYS: ProductViewKey[] = ["front", "side", "back"];

const ZH_COPY = {
  title: "TikTok Shop 上品神器",
  subtitle: "",
  sku: "产品 SKU 图片",
  refs: "厂家参考图",
  config: "生成配置",
  configHint: "人物、Logo、主图构图和风格限定只作用于新任务。",
  workstation: "统一生成模块",
  info: "商品标题与简述",
  carousel: "商品图片资产",
  storyboard: "视频素材生成",
  style: "SKU 款式图",
  pricing: "AI 推荐价格",
  generate: "生成已选内容",
  generating: "生成中…",
  selectAtLeast: "请至少勾选一项生成内容。",
  needSku: "请至少上传 1 张产品 SKU 图片。",
  needFrontView: "请至少上传 1 张 SKU 主图，才能生成视频素材。",
  needManufacturerReference:
    "请至少上传 1 张 1688 厂家参考图，才能生成商品标题和简述。",
  upload: "批量上传",
  mainSku: "主产品参考",
  setPrimary: "设为主图",
  remove: "移除",
  download: "下载",
  retry: "重试",
  failed: "生成失败",
};

const EN_COPY = {
  title: "TikTok Shop Product Listing Wizard",
  subtitle: "",
  sku: "Product SKU Images",
  refs: "Manufacturer Reference Images",
  config: "Generation Settings",
  configHint: "Person, logo, hero composition, and style rules apply to new tasks only.",
  workstation: "Generation Modules",
  info: "Product Title & Description",
  carousel: "Product Image Assets",
  storyboard: "Video Asset Generation",
  style: "SKU Style Images",
  pricing: "AI Price Recommendations",
  generate: "Generate Selected",
  generating: "Generating…",
  selectAtLeast: "Select at least one generation module.",
  needSku: "Upload at least one product SKU image.",
  needFrontView: "Upload at least one SKU main image before generating video assets.",
  needManufacturerReference: "Upload at least one manufacturer reference image for the product title and description.",
  upload: "Upload",
  mainSku: "Primary Product Reference",
  setPrimary: "Set as Primary",
  remove: "Remove",
  download: "Download",
  retry: "Retry",
  failed: "Generation failed",
};

function productViewLabel(role: ProductViewKey, language: UiLanguage) {
  return language === "en"
    ? { front: "Front", side: "Side", back: "Back" }[role]
    : { front: "正面", side: "侧面", back: "背面" }[role];
}

function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#151514] p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
        {icon ? <span className="text-lime-200">{icon}</span> : null}
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function readImage(file: File, language: UiLanguage = "zh") {
  if (!IMAGE_TYPES.has(file.type))
    return Promise.reject(new Error(language === "en" ? "Use PNG, JPG, or WEBP images." : "请使用 PNG、JPG 或 WEBP 图片。"));
  if (file.size > MAX_IMAGE_BYTES)
    return Promise.reject(new Error(language === "en" ? "Each image must be 10MB or smaller." : "每张图片不能超过 10MB。"));
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(language === "en" ? "Failed to read the image." : "图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

function roleLabel(role: EcommerceCarouselRole, language: UiLanguage = "zh") {
  return {
    main: language === "en" ? "Main Image" : "主图",
    scene: language === "en" ? "Scene Images" : "场景图",
    detail: language === "en" ? "Detail & Benefit Images" : "细节卖点图",
    variant: language === "en" ? "Variant Images" : "变体规格图",
  }[role];
}

function buildSkuId(item: UploadItem | undefined, index: number) {
  const baseName = item?.fileName?.replace(/\.[^.]+$/, "") ?? "";
  const words = baseName
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.trim().toUpperCase())
    .filter(
      (word) => word && !SKU_ID_STOP_WORDS.has(word) && !/^\d+$/.test(word),
    );
  return words.length >= 2 ? words.slice(0, 4).join("-") : `SKU-${index + 1}`;
}

function getStyleSkuId(
  job: EcommerceStyleImageJob,
  slot: EcommerceStyleImageSlot,
  skus: UploadItem[],
) {
  return (
    job.skuIds?.[slot.skuIndex] ??
    buildSkuId(skus[slot.skuIndex], slot.skuIndex)
  );
}

function Status({ status, language = "zh" }: { status: OutputStatus; language?: UiLanguage }) {
  const label =
    status === "processing"
      ? language === "en" ? "Processing" : "生成中"
      : status === "completed"
        ? language === "en" ? "Completed" : "已完成"
        : status === "failed"
          ? language === "en" ? "Failed" : "失败"
          : language === "en" ? "Not generated" : "未生成";
  return (
    <span
      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${status === "completed" ? "bg-lime-300/15 text-lime-200" : status === "failed" ? "bg-red-500/15 text-red-200" : "bg-white/10 text-zinc-400"}`}
    >
      {status === "processing" ? (
        <Loader2 size={12} className="mr-1 inline animate-spin" />
      ) : null}
      {label}
    </span>
  );
}

function ImageStatus({ status, language = "zh" }: { status: EcommerceImageSlot["status"]; language?: UiLanguage }) {
  const label =
    status === "success"
      ? language === "en" ? "Completed" : "已完成"
      : status === "fail"
        ? language === "en" ? "Failed" : "失败"
        : status === "processing"
          ? language === "en" ? "Processing" : "生成中"
          : language === "en" ? "Waiting" : "等待生成";
  return <span className="text-[11px] text-zinc-500">{label}</span>;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function briefMarkdownToHtml(markdown: string) {
  const html: string[] = [];
  let listOpen = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (/^#\s+/.test(line)) {
      if (listOpen) html.push("</ul>");
      listOpen = false;
      html.push(`<h1>${escapeHtml(line.replace(/^#\s+/, ""))}</h1>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!listOpen) html.push("<ul>");
      listOpen = true;
      html.push(`<li>${escapeHtml(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (!line.trim()) {
      if (listOpen) html.push("</ul>");
      listOpen = false;
    } else {
      if (listOpen) html.push("</ul>");
      listOpen = false;
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  if (listOpen) html.push("</ul>");
  return html.join("");
}

function htmlToPlainText(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.innerText.trim();
}

export default function EcommerceAssetsPage() {
  const [language, setLanguage] = useState<UiLanguage>("zh");
  const copy = language === "en" ? EN_COPY : ZH_COPY;
  const tx = (zh: string, en: string) => (language === "en" ? en : zh);
  const [error, setError] = useState("");
  const [skus, setSkus] = useState<UploadItem[]>([]);
  const [productViews, setProductViews] = useState<
    Record<ProductViewKey, UploadItem | null>
  >({ front: null, side: null, back: null });
  const [refs, setRefs] = useState<Record<EcommerceCarouselRole, UploadItem[]>>(
    { main: [], scene: [], detail: [], variant: [] },
  );
  const [config, setConfig] = useState<EcommerceGenerationConfig>(
    CHUB_TWO_DEFAULT_GENERATION_CONFIG,
  );
  const [configOpen, setConfigOpen] = useState(false);
  const [pricingConfigOpen, setPricingConfigOpen] = useState(false);
  const [priceRmb, setPriceRmb] = useState("");
  const [weightG, setWeightG] = useState("");
  const [pricingResults, setPricingResults] = useState<EcommercePricingResult[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<EcommerceHistoryRecord[]>(
    [],
  );
  const [historyQuery, setHistoryQuery] = useState("");
  const historyHydrated = useRef(false);
  const currentHistoryId = useRef<string | null>(null);
  const lastInputFingerprint = useRef<string | null>(null);
  const productSessionVersion = useRef(0);
  const hydrated = useRef(false);
  const [selected, setSelected] = useState<Record<OutputKey, boolean>>({
    info: true,
    carousel: true,
    storyboard: false,
    style: true,
    pricing: true,
  });
  const [statuses, setStatuses] = useState<Record<OutputKey, OutputStatus>>({
    info: "idle",
    carousel: "idle",
    storyboard: "idle",
    style: "idle",
    pricing: "idle",
  });
  const [titles, setTitles] = useState<EcommerceProductTitleProposal[]>([]);
  const [brief, setBrief] = useState("");
  const [copiedSkuId, setCopiedSkuId] = useState<string | null>(null);
  const [copiedTitleId, setCopiedTitleId] = useState<string | null>(null);
  const [briefCopied, setBriefCopied] = useState(false);
  const [copiedStoryboardId, setCopiedStoryboardId] = useState<string | null>(
    null,
  );
  const [copiedStoryboardTitle, setCopiedStoryboardTitle] = useState(false);
  const [copiedStoryboardDescription, setCopiedStoryboardDescription] =
    useState(false);
  const [creatingStoryboardVideoId, setCreatingStoryboardVideoId] = useState<
    string | null
  >(null);
  const [briefHtml, setBriefHtml] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [carouselJob, setCarouselJob] = useState<EcommerceAssetsJob | null>(
    null,
  );
  const [styleJob, setStyleJob] = useState<EcommerceStyleImageJob | null>(null);
  const [storyboardJob, setStoryboardJob] =
    useState<EcommerceStoryboardJob | null>(null);
  const [editingCarousel, setEditingCarousel] =
    useState<EcommerceImageSlot | null>(null);
  const [editCarouselSku, setEditCarouselSku] = useState(0);
  const [editTitle, setEditTitle] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editRefinement, setEditRefinement] = useState("");
  const [editingStyle, setEditingStyle] =
    useState<EcommerceStyleImageSlot | null>(null);
  const [editStyleSku, setEditStyleSku] = useState(0);
  const [styleRefinement, setStyleRefinement] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratingStoryboardMetadata, setRegeneratingStoryboardMetadata] =
    useState(false);
  const carouselTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storyboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storyboardPollVersion = useRef(0);
  const storyboardVideoTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const briefEditorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.queueMicrotask(() => {
      setLanguage(
        new URLSearchParams(window.location.search).get("lang") === "en"
          ? "en"
          : "zh",
      );
      try {
        const saved = window.localStorage.getItem(CONFIG_STORAGE_KEY);
        if (saved)
          setConfig({
            ...CHUB_TWO_DEFAULT_GENERATION_CONFIG,
            ...JSON.parse(saved),
          });
      } catch {
        /* use defaults */
      }
      try {
        const savedHistory = window.localStorage.getItem(
          ECOMMERCE_HISTORY_STORAGE_KEY,
        );
        setHistoryRecords(normalizeEcommerceHistory(savedHistory ? JSON.parse(savedHistory) : []));
      } catch {
        setHistoryRecords([]);
      }
      historyHydrated.current = true;
      hydrated.current = true;
    });
    return () => {
      if (carouselTimer.current) clearTimeout(carouselTimer.current);
      if (styleTimer.current) clearTimeout(styleTimer.current);
      if (storyboardTimer.current) clearTimeout(storyboardTimer.current);
      if (storyboardVideoTimer.current)
        clearTimeout(storyboardVideoTimer.current);
    };
  }, []);

  useEffect(() => {
    if (hydrated.current)
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  function markProductEdited() {
    if (lastInputFingerprint.current === "__history__") {
      currentHistoryId.current = null;
      lastInputFingerprint.current = null;
    }
  }

  async function addSkuFiles(files: FileList | File[]) {
    markProductEdited();
    setError("");
    try {
      const next = await Promise.all(
        Array.from(files).map(async (file) => ({
          id: crypto.randomUUID(),
          dataUrl: await readImage(file, language),
          fileName: file.name,
        })),
      );
      setSkus((current) => [...current, ...next]);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("图片读取失败。", "Failed to read the image."));
    }
  }

  async function addProductViewFile(
    role: ProductViewKey,
    files: FileList | File[],
  ) {
    const file = Array.from(files)[0];
    if (!file) return;
    markProductEdited();
    setError("");
    try {
      const item = {
        id: crypto.randomUUID(),
        dataUrl: await readImage(file, language),
        fileName: file.name,
      };
      setProductViews((current) => ({ ...current, [role]: item }));
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("图片读取失败。", "Failed to read the image."));
    }
  }

  async function addReferenceFiles(
    role: EcommerceCarouselRole,
    files: FileList | File[],
  ) {
    const remaining = ECOMMERCE_CAROUSEL_ROLE_COUNTS[role] - refs[role].length;
    if (remaining <= 0) return;
    markProductEdited();
    setError("");
    try {
      const next = await Promise.all(
        Array.from(files)
          .slice(0, remaining)
          .map(async (file) => ({
            id: crypto.randomUUID(),
            dataUrl: await readImage(file, language),
            fileName: file.name,
          })),
      );
      setRefs((current) => ({
        ...current,
        [role]: [...current[role], ...next],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("图片读取失败。", "Failed to read the image."));
    }
  }

  function setPrimary(index: number) {
    markProductEdited();
    setSkus((current) =>
      index > 0
        ? [
            current[index],
            ...current.slice(0, index),
            ...current.slice(index + 1),
          ]
        : current,
    );
  }
  function removeSku(id: string) {
    markProductEdited();
    setSkus((current) => current.filter((item) => item.id !== id));
  }
  function updateConfig<K extends keyof EcommerceGenerationConfig>(
    key: K,
    value: EcommerceGenerationConfig[K],
  ) {
    setConfig((current) => ({ ...current, [key]: value }));
  }
  function getPricingConfig(): EcommercePricingConfig {
    const defaults = CHUB_TWO_DEFAULT_GENERATION_CONFIG.pricing!;
    return {
      ...defaults,
      ...(config.pricing ?? {}),
      markets: {
        ...defaults.markets,
        ...(config.pricing?.markets ?? {}),
      },
    };
  }
  function updatePricingConfig(patch: Partial<EcommercePricingConfig>) {
    setConfig((current) => ({
      ...current,
      pricing: { ...getPricingConfig(), ...patch },
    }));
  }
  function updatePricingMarket(
    country: "SG" | "MY",
    patch: Partial<TikTokPricingMarketInput>,
  ) {
    const pricing = getPricingConfig();
    updatePricingConfig({
      markets: {
        ...pricing.markets,
        [country]: { ...pricing.markets[country], ...patch },
      },
    });
  }
  function assetPayload() {
    return {
      productSkuDataUrls: skus.map((item) => item.dataUrl),
      manufacturerReferenceGroups: REF_ROLES.map((role) => ({
        role,
        dataUrls: refs[role].map((item) => item.dataUrl),
      })),
      styleGuide: config.styleGuide,
      generationConfig: config,
    };
  }
  function hasManufacturerReferences() {
    return REF_ROLES.some((role) => refs[role].length > 0);
  }
  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  async function copySkuId(slotId: string, value: string) {
    try {
      await copyText(value);
      setCopiedSkuId(slotId);
      window.setTimeout(() => {
        setCopiedSkuId((current) => (current === slotId ? null : current));
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("复制失败", "Copy failed"));
    }
  }

  async function copyTitle(id: string, value: string) {
    try {
      await copyText(value);
      setCopiedTitleId(id);
      window.setTimeout(() => {
        setCopiedTitleId((current) => (current === id ? null : current));
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("复制失败", "Copy failed"));
    }
  }

  function applyBrief(content: string) {
    setBrief(content);
    setBriefHtml(briefMarkdownToHtml(content));
  }

  async function copyBrief() {
    const html =
      briefEditorRef.current?.innerHTML ||
      briefHtml ||
      briefMarkdownToHtml(brief);
    const plain = briefEditorRef.current
      ? htmlToPlainText(html)
      : brief.replace(/^#\s+/gm, "");
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
    } catch {
      await navigator.clipboard.writeText(plain);
    }
    setBriefCopied(true);
    window.setTimeout(() => setBriefCopied(false), 1500);
  }

  function setStatus(key: OutputKey, status: OutputStatus) {
    setStatuses((current) => ({ ...current, [key]: status }));
  }

  function inputFingerprint() {
    return JSON.stringify({
      skus: skus.map((item) => item.fileName),
      views: PRODUCT_VIEW_KEYS.map((key) => productViews[key]?.fileName || ""),
      refs: REF_ROLES.map((role) => refs[role].map((item) => item.fileName)),
    });
  }

  function ensureHistorySession() {
    const fingerprint = inputFingerprint();
    if (
      !currentHistoryId.current ||
      (lastInputFingerprint.current !== "__history__" &&
        lastInputFingerprint.current !== fingerprint)
    ) {
      currentHistoryId.current = crypto.randomUUID();
      lastInputFingerprint.current = fingerprint;
      productSessionVersion.current += 1;
    }
  }

  function beginProductSession() {
    productSessionVersion.current += 1;
    return productSessionVersion.current;
  }

  function buildHistoryRecord(): EcommerceHistoryRecord | null {
    const id = currentHistoryId.current;
    if (!id) return null;
    const snapshot: EcommerceHistoryRecord["snapshot"] = {
      titles: titles.length ? titles : undefined,
      brief: brief || undefined,
      carouselJob: carouselJob || undefined,
      storyboardJob: storyboardJob || undefined,
      styleImageJob: styleJob || undefined,
      pricingResults: pricingResults.length ? pricingResults : undefined,
      priceRmb: priceRmb || undefined,
      weightG: weightG || undefined,
      pricingConfig: getPricingConfig(),
    };
    const outputKinds = OUTPUT_KEYS.filter((key) => {
      if (key === "info") return Boolean(snapshot.titles?.length || snapshot.brief);
      if (key === "carousel") return Boolean(snapshot.carouselJob);
      if (key === "storyboard") return Boolean(snapshot.storyboardJob);
      if (key === "pricing") return pricingResults.length > 0;
      return Boolean(snapshot.styleImageJob);
    });
    if (!outputKinds.length) return null;
    const titleName = titles[0]?.title
      ?.replace(/^CHUB TWO｜\s*/i, "")
      .split(/\s+for\s+/i)[0];
    const productName =
      storyboardJob?.storyPlan?.productName ||
      titleName ||
      styleJob?.skuIds?.[0] ||
      "未命名商品";
    const thumbnails = [
      ...(carouselJob?.carouselImages.map((slot) => slot.resultUrl || "") || []),
      storyboardJob?.cover?.resultUrl || "",
      ...(storyboardJob?.slots.map((slot) => slot.resultUrl || "") || []),
      ...(styleJob?.styleImages.map((slot) => slot.resultUrl || "") || []),
    ].filter(Boolean).slice(0, 8);
    const source = {
      skuImageUrls:
        styleJob?.productSkuImageUrls ||
        carouselJob?.productSkuImageUrls ||
        (storyboardJob ? [storyboardJob.productSkuImageUrl] : []),
      productViewImageUrls: storyboardJob?.productViewImageUrls || [],
      manufacturerReferenceImageUrls:
        carouselJob?.manufacturerReferenceImageUrls || {
          main: [],
          scene: [],
          detail: [],
          variant: [],
        },
    };
    const relevantStatuses = outputKinds.map((key) => statuses[key]);
    const status = relevantStatuses.includes("processing")
      ? "processing"
      : relevantStatuses.includes("failed")
        ? relevantStatuses.includes("completed")
          ? "partial"
          : "failed"
        : "completed";
    const now = Date.now();
    const existing = historyRecords.find((record) => record.id === id);
    return {
      id,
      productName,
      skuIds: styleJob?.skuIds || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      status,
      outputKinds,
      thumbnails,
      source,
      snapshot,
    };
  }

  useEffect(() => {
    queueMicrotask(() => {
      if (!historyHydrated.current || !currentHistoryId.current) return;
      const record = buildHistoryRecord();
      if (!record) return;
      setHistoryRecords((current) => {
        const next = [record, ...current.filter((item) => item.id !== record.id)]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, ECOMMERCE_HISTORY_LIMIT);
        saveEcommerceHistory(next);
        return next;
      });
    });
    // buildHistoryRecord intentionally reads the current generation snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titles, brief, carouselJob, storyboardJob, styleJob, pricingResults, priceRmb, weightG, config.pricing, statuses]);

  function restoreHistoryRecord(record: EcommerceHistoryRecord) {
    const sessionVersion = beginProductSession();
    currentHistoryId.current = record.id;
    lastInputFingerprint.current = "__history__";
    setSkus(
      record.source.skuImageUrls.map((url, index) => ({
        id: `history-sku-${record.id}-${index}`,
        dataUrl: url,
        fileName: record.skuIds[index] || `SKU-${index + 1}`,
      })),
    );
    setProductViews({
      front: record.source.productViewImageUrls[0]
        ? {
            id: `history-view-${record.id}-front`,
            dataUrl: record.source.productViewImageUrls[0],
            fileName: "history-front.jpg",
          }
        : null,
      side: record.source.productViewImageUrls[1]
        ? {
            id: `history-view-${record.id}-side`,
            dataUrl: record.source.productViewImageUrls[1],
            fileName: "history-side.jpg",
          }
        : null,
      back: record.source.productViewImageUrls[2]
        ? {
            id: `history-view-${record.id}-back`,
            dataUrl: record.source.productViewImageUrls[2],
            fileName: "history-back.jpg",
          }
        : null,
    });
    setRefs(
      (Object.keys(record.source.manufacturerReferenceImageUrls) as EcommerceCarouselRole[]).reduce(
        (all, role) => ({
          ...all,
          [role]: record.source.manufacturerReferenceImageUrls[role].map(
            (url, index) => ({
              id: `history-ref-${record.id}-${role}-${index}`,
              dataUrl: url,
              fileName: `history-${role}-${index + 1}.jpg`,
            }),
          ),
        }),
        { main: [], scene: [], detail: [], variant: [] } as Record<
          EcommerceCarouselRole,
          UploadItem[]
        >,
      ),
    );
    setTitles(record.snapshot.titles || []);
    if (record.snapshot.brief) applyBrief(record.snapshot.brief);
    else {
      setBrief("");
      setBriefHtml("");
    }
    setCarouselJob(record.snapshot.carouselJob || null);
    setStoryboardJob(record.snapshot.storyboardJob || null);
    setStyleJob(record.snapshot.styleImageJob || null);
    setPricingResults(record.snapshot.pricingResults || []);
    setPriceRmb(record.snapshot.priceRmb || "");
    setWeightG(record.snapshot.weightG || "");
    if (record.snapshot.pricingConfig) {
      setConfig((current) => ({
        ...current,
        pricing: record.snapshot.pricingConfig,
      }));
    }
    const jobStatus = (
      status: "preparing" | "processing" | "completed" | "failed" | undefined,
    ): OutputStatus =>
      status === "processing" || status === "preparing"
        ? "processing"
        : status === "failed"
          ? "failed"
          : "completed";
    setStatuses({
      info: record.outputKinds.includes("info") ? "completed" : "idle",
      carousel: record.snapshot.carouselJob
        ? jobStatus(record.snapshot.carouselJob.status)
        : "idle",
      storyboard: record.snapshot.storyboardJob
        ? jobStatus(record.snapshot.storyboardJob.status)
        : "idle",
      style: record.snapshot.styleImageJob
        ? jobStatus(record.snapshot.styleImageJob.status)
        : "idle",
      pricing: record.snapshot.pricingResults?.length ? "completed" : "idle",
    });
    setHistoryOpen(false);
    const pollVersion = beginStoryboardPolling();
    if (record.snapshot.carouselJob?.status === "processing")
      void pollCarousel(record.snapshot.carouselJob);
    if (record.snapshot.storyboardJob?.status === "processing")
      void pollStoryboards(record.snapshot.storyboardJob, pollVersion);
    if (
      record.snapshot.storyboardJob?.slots.some(
        (slot) => slot.video?.status === "processing",
      )
    )
      void pollStoryboardVideos(record.snapshot.storyboardJob, sessionVersion);
    if (record.snapshot.styleImageJob?.status === "processing")
      void pollStyle(record.snapshot.styleImageJob);
  }

  function startNewProduct() {
    if (carouselTimer.current) clearTimeout(carouselTimer.current);
    if (styleTimer.current) clearTimeout(styleTimer.current);
    if (storyboardTimer.current) clearTimeout(storyboardTimer.current);
    if (storyboardVideoTimer.current) clearTimeout(storyboardVideoTimer.current);
    beginStoryboardPolling();
    beginProductSession();
    currentHistoryId.current = null;
    lastInputFingerprint.current = null;
    setError("");
    setSkus([]);
    setProductViews({ front: null, side: null, back: null });
    setRefs({ main: [], scene: [], detail: [], variant: [] });
    setPriceRmb("");
    setWeightG("");
    setTitles([]);
    setBrief("");
    setBriefHtml("");
    setCarouselJob(null);
    setStoryboardJob(null);
    setStyleJob(null);
    setPricingResults([]);
    setStatuses({
      info: "idle",
      carousel: "idle",
      storyboard: "idle",
      style: "idle",
      pricing: "idle",
    });
    setCopiedSkuId(null);
    setCopiedTitleId(null);
    setBriefCopied(false);
    setCopiedStoryboardId(null);
    setCopiedStoryboardTitle(false);
    setCopiedStoryboardDescription(false);
    setEditingCarousel(null);
    setEditingStyle(null);
    setHistoryOpen(false);
  }

  function deleteHistoryRecord(id: string) {
    setHistoryRecords((current) => {
      const next = current.filter((record) => record.id !== id);
      saveEcommerceHistory(next);
      return next;
    });
    if (currentHistoryId.current === id) currentHistoryId.current = null;
  }

  const visibleHistoryRecords = historyRecords.filter((record) => {
    const query = historyQuery.trim().toLowerCase();
    return (
      !query ||
      record.productName.toLowerCase().includes(query) ||
      record.skuIds.some((skuId) => skuId.toLowerCase().includes(query))
    );
  });
  const pricingConfig = getPricingConfig();

  async function generateInfo() {
    setStatus("info", "processing");
    try {
      const response = await fetch("/api/ecommerce-assets/product-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...assetPayload(), kind: "all" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setTitles(result.proposals ?? []);
      applyBrief(result.brief?.content ?? "");
      setStatus("info", "completed");
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
      setStatus("info", "failed");
    }
  }

  async function regenerateBrief() {
    if (!hasManufacturerReferences())
      return setError(copy.needManufacturerReference);
    setBriefLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ecommerce-assets/product-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...assetPayload(), kind: "brief" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      applyBrief(result.brief?.content ?? "");
      setStatus("info", "completed");
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
      setStatus("info", "failed");
    } finally {
      setBriefLoading(false);
    }
  }

  async function analyzeCarouselCopy() {
    const response = await fetch("/api/ecommerce-assets/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assetPayload()),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result.copyBySlot as Record<
      string,
      { id: string; title: string; subtitle: string }
    >;
  }

  async function generateCarousel() {
    setStatus("carousel", "processing");
    try {
      const copyBySlot = await analyzeCarouselCopy();
      const response = await fetch("/api/ecommerce-assets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...assetPayload(),
          primarySkuIndex: 0,
          selectedCopyBySlot: copyBySlot,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCarouselJob(result.job);
      void pollCarousel(result.job);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
      setStatus("carousel", "failed");
    }
  }

  async function pollCarousel(current: EcommerceAssetsJob) {
    try {
      const response = await fetch("/api/ecommerce-assets/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCarouselJob(result.job);
      if (result.job.status === "processing")
        carouselTimer.current = setTimeout(
          () => void pollCarousel(result.job),
          4000,
        );
      else
        setStatus(
          "carousel",
          result.job.status === "failed" ? "failed" : "completed",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
      setStatus("carousel", "failed");
    }
  }

  async function generateStyle() {
    setStatus("style", "processing");
    try {
      const response = await fetch(
        "/api/ecommerce-assets/style-images/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productSkuDataUrls: skus.map((item) => item.dataUrl),
            skuFileNames: skus.map((item) => item.fileName),
            styleGuide: config.styleGuide,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setStyleJob(result.job);
      void pollStyle(result.job);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
      setStatus("style", "failed");
    }
  }

  async function generatePricing() {
    const cost = Number(priceRmb);
    const weight = Number(weightG);
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(weight) || weight <= 0) {
      setError(tx("请输入有效的商品成本和重量。", "Enter a valid product cost and weight."));
      setStatus("pricing", "failed");
      return;
    }
    setStatus("pricing", "processing");
    try {
      const pricing = config.pricing ?? CHUB_TWO_DEFAULT_GENERATION_CONFIG.pricing!;
      const results = await Promise.all(pricing.countries.map(async (country) => {
        const market = pricing.markets[country];
        const response = await fetch("/api/ecommerce-assets/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productCostRmb: cost,
            packagingCostRmb: pricing.packagingCostRmb,
            weightG: weight,
            buyerPayPercent: pricing.buyerPayPercent,
            targetMarginPercent: pricing.targetMarginPercent,
            affiliateRate: pricing.affiliateRate,
            market: market ?? defaultTikTokPricingMarket(country),
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || tx("价格推荐失败。", "Price recommendation failed."));
        return { country, calculation: result.calculation, ai: result.ai ?? null, aiError: result.aiError } as EcommercePricingResult;
      }));
      setPricingResults(results);
      setStatus("pricing", "completed");
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("价格推荐失败。", "Price recommendation failed."));
      setStatus("pricing", "failed");
    }
  }

  async function pollStyle(current: EcommerceStyleImageJob) {
    try {
      const response = await fetch(
        "/api/ecommerce-assets/style-images/status",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job: current }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setStyleJob(result.job);
      if (result.job.status === "processing")
        styleTimer.current = setTimeout(() => void pollStyle(result.job), 4000);
      else
        setStatus(
          "style",
          result.job.status === "failed" ? "failed" : "completed",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
      setStatus("style", "failed");
    }
  }

  async function downloadAssetFolder() {
    if (!carouselJob && !styleJob) return;
    try {
      const response = await fetch("/api/ecommerce-assets/assets/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carouselJob, styleJob }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || tx("图片素材导出失败。", "Image asset export failed."));
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `tiktok-shop-image-assets-${carouselJob?.id || styleJob?.id}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("图片素材导出失败。", "Image asset export failed."));
    }
  }

  async function generateStoryboards() {
    const primaryProductDataUrl = skus[0]?.dataUrl;
    if (!primaryProductDataUrl) {
      setError(copy.needFrontView);
      setStatus("storyboard", "failed");
      return;
    }
    if (!skus[0]) {
      setError(copy.needFrontView);
      setStatus("storyboard", "failed");
      return;
    }
    if (!hasManufacturerReferences()) {
      setError(copy.needManufacturerReference);
      setStatus("storyboard", "failed");
      return;
    }
    const sessionVersion = productSessionVersion.current;
    const pollVersion = beginStoryboardPolling();
    setStatus("storyboard", "processing");
    try {
      const response = await fetch("/api/ecommerce-assets/storyboards/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSkuDataUrl: primaryProductDataUrl,
          productViewDataUrls: [primaryProductDataUrl, productViews.side?.dataUrl, productViews.back?.dataUrl].filter(
            (url): url is string => Boolean(url),
          ),
          manufacturerReferenceDataUrls: [
            ...refs.scene.map((item) => item.dataUrl),
            ...refs.detail.map((item) => item.dataUrl),
          ],
          personImageUrl: CHUB_TWO_PERSON_URL,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (sessionVersion !== productSessionVersion.current) return;
      setStoryboardJob(result.job);
      void pollStoryboards(result.job, pollVersion);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
      setStatus("storyboard", "failed");
    }
  }

  function beginStoryboardPolling() {
    if (storyboardTimer.current) clearTimeout(storyboardTimer.current);
    storyboardPollVersion.current += 1;
    return storyboardPollVersion.current;
  }

  async function pollStoryboards(
    current: EcommerceStoryboardJob,
    pollVersion = storyboardPollVersion.current,
  ) {
    if (pollVersion !== storyboardPollVersion.current) return;
    try {
      const response = await fetch("/api/ecommerce-assets/storyboards/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (pollVersion !== storyboardPollVersion.current) return;
      setStoryboardJob(result.job);
      if (result.job.status === "processing") {
        storyboardTimer.current = setTimeout(
          () => void pollStoryboards(result.job, pollVersion),
          4000,
        );
      } else {
        setStatus(
          "storyboard",
          result.job.status === "failed" ? "failed" : "completed",
        );
      }
    } catch (e) {
      if (pollVersion !== storyboardPollVersion.current) return;
      setError(e instanceof Error ? e.message : copy.failed);
      setStatus("storyboard", "failed");
    }
  }

  async function copyStoryboardImage(slot: EcommerceStoryboardSlot) {
    if (!slot.resultUrl) return;
    try {
      const blob = await fetch(slot.resultUrl).then((response) => {
        if (!response.ok) throw new Error(tx("分镜图读取失败。", "Failed to load the storyboard image."));
        return response.blob();
      });
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error(tx("当前浏览器不支持直接复制图片，已开始下载。", "This browser cannot copy images directly; the image download has started."));
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || "image/png"]: blob }),
      ]);
      setCopiedStoryboardId(slot.id);
      window.setTimeout(
        () =>
          setCopiedStoryboardId((current) =>
            current === slot.id ? null : current,
          ),
        1500,
      );
    } catch (e) {
      if (slot.resultUrl) {
        const link = document.createElement("a");
        link.href = slot.resultUrl;
        link.download = `${slot.id}.png`;
        link.click();
      }
      setError(e instanceof Error ? e.message : tx("分镜图复制失败，已开始下载。", "Failed to copy the storyboard image; the download has started."));
    }
  }

  function storyboardDescriptionText(job: EcommerceStoryboardJob) {
    const hashtags = (job.hashtags || []).filter(Boolean).join(" ");
    return [job.description, hashtags].filter(Boolean).join("\n\n");
  }

  async function copyStoryboardMetadata(kind: "title" | "description") {
    if (!storyboardJob) return;
    const value =
      kind === "title"
        ? storyboardJob.title || ""
        : storyboardDescriptionText(storyboardJob);
    try {
      await copyText(value);
      if (kind === "title") {
        setCopiedStoryboardTitle(true);
        window.setTimeout(() => setCopiedStoryboardTitle(false), 1500);
      } else {
        setCopiedStoryboardDescription(true);
        window.setTimeout(() => setCopiedStoryboardDescription(false), 1500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "复制失败");
    }
  }

  async function regenerateStoryboardMetadata() {
    if (!storyboardJob || regeneratingStoryboardMetadata) return;
    const sessionVersion = productSessionVersion.current;
    const pollVersion = beginStoryboardPolling();
    setError("");
    setRegeneratingStoryboardMetadata(true);
    try {
      const response = await fetch(
        "/api/ecommerce-assets/storyboards/metadata/regenerate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job: storyboardJob }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (sessionVersion !== productSessionVersion.current) return;
      setStoryboardJob(result.job);
      void pollStoryboards(result.job, pollVersion);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    } finally {
      setRegeneratingStoryboardMetadata(false);
    }
  }

  async function regenerateStoryboardCover() {
    if (!storyboardJob) return;
    const sessionVersion = productSessionVersion.current;
    const pollVersion = beginStoryboardPolling();
    setError("");
    try {
      const response = await fetch(
        "/api/ecommerce-assets/storyboards/cover/regenerate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job: storyboardJob }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (sessionVersion !== productSessionVersion.current) return;
      setStoryboardJob(result.job);
      void pollStoryboards(result.job, pollVersion);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    }
  }

  async function createStoryboardVideo(slotId: string) {
    if (!storyboardJob || creatingStoryboardVideoId === slotId) return;
    const sessionVersion = productSessionVersion.current;
    const currentJob = storyboardJob;
    setCreatingStoryboardVideoId(slotId);
    setError("");
    setStoryboardJob((current) =>
      current
        ? {
            ...current,
            slots: current.slots.map((slot) =>
              slot.id === slotId
                ? {
                    ...slot,
                    video: {
                      taskId: `pending-${slotId}`,
                      provider: "seedance-2-mini",
                      model: "bytedance/seedance-2-mini",
                      status: "processing" as const,
                      prompt: "",
                    },
                  }
                : slot,
            ),
          }
        : current,
    );
    try {
      const response = await fetch(
        "/api/ecommerce-assets/storyboards/video/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job: currentJob, slotId }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (sessionVersion !== productSessionVersion.current) return;
      const mergedJob: EcommerceStoryboardJob = {
        ...result.job,
        slots: result.job.slots.map((slot: EcommerceStoryboardSlot) => {
          const localSlot = storyboardJob?.slots.find(
            (candidate) => candidate.id === slot.id,
          );
          return !slot.video && localSlot?.video
            ? { ...slot, video: localSlot.video }
            : slot;
        }),
      };
      setStoryboardJob((current) => {
        if (!current) return mergedJob;
        return {
          ...mergedJob,
          slots: mergedJob.slots.map((slot) => {
            const localSlot = current.slots.find(
              (candidate) => candidate.id === slot.id,
            );
            return !slot.video && localSlot?.video
              ? { ...slot, video: localSlot.video }
              : slot;
          }),
        };
      });
      void pollStoryboardVideos(mergedJob, sessionVersion);
    } catch (e) {
      if (sessionVersion !== productSessionVersion.current) return;
      const message = e instanceof Error ? e.message : copy.failed;
      setStoryboardJob((current) =>
        current
          ? {
              ...current,
              slots: current.slots.map((slot) =>
                slot.id === slotId
                  ? {
                      ...slot,
                      video: {
                        taskId: `failed-${slotId}`,
                        provider: "seedance-2-mini",
                        model: "bytedance/seedance-2-mini",
                        status: "fail" as const,
                        prompt: "",
                        error: message,
                      },
                    }
                  : slot,
              ),
            }
          : current,
      );
      setError(message);
    } finally {
      setCreatingStoryboardVideoId((current) =>
        current === slotId ? null : current,
      );
    }
  }

  async function pollStoryboardVideos(
    current: EcommerceStoryboardJob,
    sessionVersion = productSessionVersion.current,
  ) {
    if (sessionVersion !== productSessionVersion.current) return;
    if (!current.slots.some((slot) => slot.video?.status === "processing"))
      return;
    try {
      const response = await fetch(
        "/api/ecommerce-assets/storyboards/video/status",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job: current }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (sessionVersion !== productSessionVersion.current) return;
      setStoryboardJob(result.job);
      if (
        result.job.slots.some(
          (slot: EcommerceStoryboardSlot) =>
            slot.video?.status === "processing",
        )
      )
        storyboardVideoTimer.current = setTimeout(
          () => void pollStoryboardVideos(result.job, sessionVersion),
          5000,
        );
    } catch (e) {
      if (sessionVersion !== productSessionVersion.current) return;
      setError(e instanceof Error ? e.message : copy.failed);
    }
  }

  async function regenerateStoryboard(slotId: string) {
    if (!storyboardJob) return;
    const sessionVersion = productSessionVersion.current;
    const pollVersion = beginStoryboardPolling();
    try {
      const response = await fetch(
        "/api/ecommerce-assets/storyboards/regenerate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job: storyboardJob, slotId }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (sessionVersion !== productSessionVersion.current) return;
      const updated = {
        ...storyboardJob,
        status: "processing" as const,
        slots: storyboardJob.slots.map((slot) =>
          slot.id === slotId
            ? {
                ...slot,
                taskId: result.taskId,
                prompt: result.prompt,
                status: "waiting" as const,
                resultUrl: undefined,
                error: undefined,
                video: undefined,
              }
            : slot,
        ),
      };
      setStoryboardJob(updated);
      setStatus("storyboard", "processing");
      void pollStoryboards(updated, pollVersion);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    }
  }

  async function generateSelected() {
    if (!Object.values(selected).some(Boolean))
      return setError(copy.selectAtLeast);
    if (selected.info && !hasManufacturerReferences())
      return setError(copy.needManufacturerReference);
    if (
      (selected.carousel || selected.style) &&
      !skus.length &&
      !selected.storyboard
    )
      return setError(copy.needSku);
    if (selected.storyboard && !skus[0])
      return setError(copy.needFrontView);
    if (selected.storyboard && !hasManufacturerReferences())
      return setError(copy.needManufacturerReference);
    if (selected.pricing && (!priceRmb || !weightG))
      return setError(tx("请在价格配置中填写商品成本和重量。", "Enter product cost and weight in the pricing inputs."));
    ensureHistorySession();
    const runCarousel = selected.carousel && skus.length > 0;
    const runStyle = selected.style && skus.length > 0;
    if (!skus.length && selected.storyboard) {
      setSelected((current) => ({
        ...current,
        carousel: false,
        style: false,
      }));
    }
    setError("");
    setSaving(true);
    await Promise.all([
      selected.info ? generateInfo() : Promise.resolve(),
      runCarousel ? generateCarousel() : Promise.resolve(),
      selected.storyboard ? generateStoryboards() : Promise.resolve(),
      runStyle ? generateStyle() : Promise.resolve(),
      selected.pricing ? generatePricing() : Promise.resolve(),
    ]);
    setSaving(false);
  }

  function openCarouselRegenerate(slot: EcommerceImageSlot) {
    setEditingCarousel(slot);
    setEditCarouselSku(0);
    setEditTitle(slot.selectedCopy?.title ?? "");
    setEditSubtitle(slot.selectedCopy?.subtitle ?? "");
    setEditRefinement("");
  }
  async function regenerateCarousel() {
    if (
      !carouselJob ||
      !editingCarousel ||
      !editTitle.trim() ||
      !editSubtitle.trim()
    )
      return;
    setRegenerating(true);
    try {
      const response = await fetch("/api/ecommerce-assets/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: carouselJob,
          slotId: editingCarousel.id,
          skuIndex: editCarouselSku,
          title: editTitle,
          subtitle: editSubtitle,
          refinement: editRefinement,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const updated = {
        ...carouselJob,
        status: "processing" as const,
        carouselImages: carouselJob.carouselImages.map((item) =>
          item.id === editingCarousel.id
            ? {
                ...item,
                taskId: result.taskId,
                prompt: result.prompt,
                selectedCopy: result.selectedCopy,
                status: "waiting" as const,
                resultUrl: undefined,
                error: undefined,
              }
            : item,
        ),
      };
      setCarouselJob(updated);
      setEditingCarousel(null);
      setStatus("carousel", "processing");
      void pollCarousel(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    } finally {
      setRegenerating(false);
    }
  }

  function openStyleRegenerate(slot: EcommerceStyleImageSlot) {
    setEditingStyle(slot);
    setEditStyleSku(slot.skuIndex);
    setStyleRefinement("");
  }
  async function regenerateStyle() {
    if (!styleJob || !editingStyle) return;
    setRegenerating(true);
    try {
      const response = await fetch(
        "/api/ecommerce-assets/style-images/regenerate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job: styleJob,
            slotId: editingStyle.id,
            skuIndex: editStyleSku,
            refinement: styleRefinement,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const updated = {
        ...styleJob,
        status: "processing" as const,
        styleImages: styleJob.styleImages.map((item) =>
          item.id === editingStyle.id
            ? {
                ...item,
                skuIndex: result.skuIndex,
                sourceSkuImageUrl:
                  styleJob.productSkuImageUrls[result.skuIndex],
                taskId: result.taskId,
                prompt: result.prompt,
                status: "waiting" as const,
                resultUrl: undefined,
                error: undefined,
              }
            : item,
        ),
      };
      setStyleJob(updated);
      setEditingStyle(null);
      setStatus("style", "processing");
      void pollStyle(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0b0a] text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
        <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-5">
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-300 hover:text-white"
          >
            ← {tx("返回首页", "Back to Home")}
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-lime-300/30 hover:text-lime-200"
            >
              <History size={15} />
              {tx("历史记录", "History")}
              {historyRecords.length ? (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
                  {historyRecords.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={startNewProduct}
              aria-label={tx("新建商品", "New Product")}
              title={tx("新建商品", "New Product")}
              className="inline-flex items-center justify-center rounded-lg border border-white/10 p-2 text-zinc-300 hover:border-lime-300/30 hover:text-lime-200"
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-lime-300/30 px-3 py-2 text-xs font-semibold text-lime-200 hover:bg-lime-300/10"
            >
              <Settings2 size={15} />
              {copy.config}
            </button>
            <button
              type="button"
              onClick={() => setPricingConfigOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-lime-300/30 px-3 py-2 text-xs font-semibold text-lime-200 hover:bg-lime-300/10"
            >
              <Calculator size={15} />
              {tx("价格配置", "Pricing Settings")}
            </button>
          </div>
        </div>
        <header className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-xs font-semibold text-lime-200">
            <Sparkles size={13} /> TikTok Shop {tx("上品神器", "Listing Wizard")}
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {copy.title}
          </h1>
          {copy.subtitle ? (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">
              {copy.subtitle}
            </p>
          ) : null}
        </header>
        {error ? (
          <div className="mb-5 flex justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        ) : null}
        <div className="space-y-5">
          <Panel
            title={tx("定价输入", "Pricing Inputs")}
            icon={<Calculator size={17} />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-zinc-400">
                {tx("商品成本（人民币）", "Product Cost (RMB)")}
                <input
                  type="number"
                  min="0"
                  value={priceRmb}
                  onChange={(event) => setPriceRmb(event.target.value)}
                  placeholder={tx("例如 20", "e.g. 20")}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-lime-300/60"
                />
              </label>
              <label className="text-xs text-zinc-400">
                {tx("包裹重量（克）", "Package Weight (g)")}
                <input
                  type="number"
                  min="1"
                  value={weightG}
                  onChange={(event) => setWeightG(event.target.value)}
                  placeholder={tx("例如 392", "e.g. 392")}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-lime-300/60"
                />
              </label>
            </div>
          </Panel>
          <Panel title={copy.sku} icon={<Package size={17} />}>
            <label className="mb-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-lime-300/30 bg-lime-300/5 px-4 py-4 text-sm font-semibold text-lime-200 hover:bg-lime-300/10">
              <Plus size={17} />
              {tx("上传多个 SKU 图片", "Upload SKU Images")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files) void addSkuFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {skus.map((item, index) => (
                <article
                  key={item.id}
                  className={`relative rounded-lg border p-2 ${index === 0 ? "border-lime-300/60 bg-lime-300/10" : "border-white/10 bg-black/20"}`}
                >
                  <img
                    src={item.dataUrl}
                    alt={item.fileName}
                    className="aspect-square w-full rounded-md object-contain"
                  />
                  <div className="mt-2 truncate text-xs text-zinc-300">
                    {item.fileName}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>
                      {index === 0 ? (
                        <span className="text-lime-200">{copy.mainSku}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPrimary(index)}
                          className="text-zinc-300 hover:text-lime-200"
                        >
                          {copy.setPrimary}
                        </button>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSku(item.id)}
                      className="rounded border border-white/10 p-1 text-red-300/70"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
          <Panel
            title={tx("产品 3 视图", "Product 3-View Images")}
            icon={<Camera size={17} />}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {PRODUCT_VIEW_KEYS.map((role) => {
                const item = role === "front" ? skus[0] : productViews[role];
                return (
                  <div
                    key={role}
                    className="overflow-hidden rounded-lg border border-white/10 bg-black/20"
                  >
                    {item ? (
                      <div className="relative">
                        <img
                          src={item.dataUrl}
                          alt={`${productViewLabel(role, language)} ${language === "en" ? "View" : "视图"}`}
                          className="aspect-square w-full object-contain"
                        />
                        {role !== "front" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setProductViews((current) => ({
                                ...current,
                                [role]: null,
                              }))
                            }
                            className="absolute right-2 top-2 rounded-full bg-black/75 p-1.5 text-white"
                          >
                            <X size={13} />
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-xs text-zinc-600">
                        {tx("暂未上传", "Not uploaded")}
                      </div>
                    )}
                    <label className={`flex items-center justify-between border-t border-white/10 px-3 py-2 text-xs font-semibold ${role === "front" ? "text-lime-200" : "cursor-pointer text-zinc-300 hover:text-lime-200"}`}>
                      <span>
                        {productViewLabel(role, language)}
                        {role === "front"
                          ? language === "en"
                            ? " (Uses SKU 1 main image)"
                            : "（自动使用 SKU 1 主图）"
                          : language === "en"
                            ? " (Optional)"
                            : "（可选）"}
                      </span>
                      {role !== "front" ? <>
                        <span>{item ? (language === "en" ? "Replace" : "替换") : language === "en" ? "Upload" : "上传"}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(event) => {
                            if (event.target.files)
                              void addProductViewFile(role, event.target.files);
                            event.currentTarget.value = "";
                          }}
                        />
                      </> : <span>{language === "en" ? "Updates with SKU 1" : "随 SKU 1 更新"}</span>}
                    </label>
                    {item ? (
                      <div className="truncate px-3 pb-2 text-[11px] text-zinc-500">
                        {item.fileName}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title={copy.refs} icon={<Images size={17} />}>
            <div className="space-y-5">
              {REF_ROLES.map((role) => (
                <div key={role}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-200">
                        {roleLabel(role, language)}
                      </h3>
                      <p className="text-xs text-zinc-500">
                        {refs[role].length}/
                        {ECOMMERCE_CAROUSEL_ROLE_COUNTS[role]}
                      </p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-300/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/10">
                      <Plus size={14} />
                      {copy.upload}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="sr-only"
                        disabled={
                          refs[role].length >=
                          ECOMMERCE_CAROUSEL_ROLE_COUNTS[role]
                        }
                        onChange={(event) => {
                          if (event.target.files)
                            void addReferenceFiles(role, event.target.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {refs[role].map((item) => (
                      <div
                        key={item.id}
                        className="relative overflow-hidden rounded-lg border border-white/10"
                      >
                        <img
                          src={item.dataUrl}
                          alt={item.fileName}
                          className="aspect-square w-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            markProductEdited();
                            setRefs((current) => ({
                              ...current,
                              [role]: current[role].filter(
                                (candidate) => candidate.id !== item.id,
                              ),
                            }));
                          }}
                          className="absolute right-2 top-2 rounded-full bg-black/75 p-1.5 text-white"
                        >
                          <X size={13} />
                        </button>
                        <span className="block truncate px-2 py-1 text-[11px] text-zinc-400">
                          {item.fileName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title={copy.workstation}
            icon={<Sparkles size={17} />}
          >
            <div className="grid gap-3 md:grid-cols-4">
              {(["info", "carousel", "storyboard", "pricing"] as OutputKey[]).map(
                (key) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${selected[key] ? "border-lime-300/60 bg-lime-300/10" : "border-white/10 bg-black/20"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected[key]}
                      onChange={(event) =>
                        setSelected((current) =>
                          key === "carousel"
                            ? { ...current, carousel: event.target.checked, style: event.target.checked }
                            : { ...current, [key]: event.target.checked },
                        )
                      }
                      className="mt-1 accent-lime-300"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-white">
                        {copy[key]}
                        <Status status={statuses[key]} language={language} />
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-zinc-500">
                        {key === "info"
                          ? tx("AI 分析厂家文案并生成英文标题和 QA 简述。", "Analyze manufacturer copy and generate an English title and QA description.")
                          : key === "carousel"
                            ? tx("一次生成 TikTok Shop 轮播图和全部 SKU 款式图，并统一导出。", "Generate TikTok Shop carousel images and all SKU style images together, then export them as one package.")
                            : key === "storyboard"
                              ? tx("生成 3 张统一格式的视频素材图，并可分别生成视频。", "Generate three consistent video asset images and create a video for each one.")
                              : key === "style"
                                ? tx("轮播图之外，为每个 SKU 生成一张统一 45° 俯拍白底款式图。", "Generate one consistent 45° top-down white-background style image for each SKU.")
                                : tx("根据价格和重量，生成新加坡/马来西亚的公式价格与 AI 推荐价格。", "Generate formula prices and AI recommendations for Singapore and Malaysia from cost and weight.")}
                      </span>
                    </span>
                  </label>
                ),
              )}
            </div>
            <button
              type="button"
              onClick={() => void generateSelected()}
              disabled={
                saving ||
                !Object.values(selected).some(Boolean)
              }
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-lime-300 text-sm font-semibold text-zinc-950 hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {saving ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Sparkles size={17} />
              )}
              {saving ? copy.generating : copy.generate}
            </button>
            <div className="mt-6 space-y-5">
              {titles.length || brief ? (
                <section className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{tx("商品标题与简述", "Product Title & Description")}</h3>
                    <Status status={statuses.info} language={language} />
                  </div>
                  <div className="space-y-3">
                    {titles.map((title, index) => (
                      <div key={title.id} className="flex gap-2">
                        <input
                          value={title.title}
                          onChange={(event) =>
                            setTitles((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, title: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/60"
                        />
                        <button
                          type="button"
                          onClick={() => void copyTitle(title.id, title.title)}
                          aria-label={copiedTitleId === title.id ? tx("已复制商品标题", "Title copied") : tx("复制商品标题", "Copy title")}
                          title={copiedTitleId === title.id ? tx("已复制商品标题", "Title copied") : tx("复制商品标题", "Copy title")}
                          className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 text-xs text-zinc-300 transition-colors duration-200 hover:text-lime-200"
                        >
                          {copiedTitleId === title.id ? (
                            <Check size={13} className="text-lime-200" />
                          ) : (
                            <CopyIcon size={13} />
                          )}
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-400">
                        {tx("商品简述", "Product Description")}
                      </span>
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void regenerateBrief()}
                          disabled={briefLoading || saving}
                          aria-label={tx("重新生成商品简述", "Regenerate product description")}
                          title={tx("重新生成商品简述", "Regenerate product description")}
                          className="inline-flex items-center gap-1 rounded-md border border-lime-300/30 px-3 py-2 text-xs text-lime-200 hover:bg-lime-300/10 disabled:opacity-50"
                        >
                          {briefLoading ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <RefreshCw size={13} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyBrief()}
                          aria-label={briefCopied ? tx("已复制商品简述", "Description copied") : tx("复制商品简述", "Copy description")}
                          title={briefCopied ? tx("已复制商品简述", "Description copied") : tx("复制商品简述", "Copy description")}
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-2 text-xs text-zinc-300 transition-colors duration-200 hover:text-lime-200"
                        >
                          {briefCopied ? (
                            <Check size={13} className="text-lime-200" />
                          ) : (
                            <CopyIcon size={13} />
                          )}
                        </button>
                      </span>
                    </div>
                    <div
                      ref={briefEditorRef}
                      contentEditable
                      suppressContentEditableWarning
                      role="textbox"
                      aria-label={tx("商品简述富文本编辑器", "Product description rich text editor")}
                      onBlur={(event) => {
                        setBriefHtml(event.currentTarget.innerHTML);
                        setBrief(
                          htmlToPlainText(event.currentTarget.innerHTML),
                        );
                      }}
                      dangerouslySetInnerHTML={{ __html: briefHtml }}
                      className="min-h-[24rem] w-full overflow-y-auto rounded-lg border border-white/10 bg-black/30 px-4 py-4 text-sm leading-7 text-zinc-200 outline-none focus:border-lime-300/60 [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-white [&_h1:first-child]:mt-0 [&_p]:my-3 [&_li]:ml-5 [&_li]:list-disc"
                    />
                  </div>
                </section>
              ) : null}
              {pricingResults.length ? (
                <section className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{copy.pricing}</h3>
                      <p className="mt-1 text-xs text-zinc-500">{tx(`基于商品成本 ${priceRmb} 元、重量 ${weightG} 克；可在价格配置中调整国家和计算参数。`, `Based on product cost ${priceRmb} RMB and weight ${weightG} g. Countries and pricing parameters can be adjusted in Pricing Settings.`)}</p>
                    </div>
                    <Status status={statuses.pricing} language={language} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {pricingResults.map((item) => {
                      const result = item.calculation.results[0];
                      return (
                        <article key={item.country} className="rounded-lg border border-white/10 p-3">
                          <div className="flex items-center justify-between text-sm font-semibold text-white">
                            <span>{item.country === "SG" ? tx("新加坡 · SGD", "Singapore · SGD") : tx("马来西亚 · MYR", "Malaysia · MYR")}</span>
                            <span className="font-mono text-lime-200">{result.suggestedPrice.toFixed(2)}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-400">
                            <span>{tx("保本", "Break-even")}<br /><b className="text-zinc-200">{result.breakEvenPrice.toFixed(2)}</b></span>
                            <span>{tx("稳妥", "Stable")}<br /><b className="text-zinc-200">{result.stablePrice.toFixed(2)}</b></span>
                            <span>{tx("折后", "After Discount")}<br /><b className="text-zinc-200">{result.discountedPrice.toFixed(2)}</b></span>
                          </div>
                          {item.ai?.recommendation ? <p className="mt-3 text-xs leading-5 text-zinc-400">{item.ai.recommendation}</p> : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              {carouselJob || styleJob ? (
                <section className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      图片素材区域
                    </h3>
                    <div className="flex items-center gap-3">
                      {carouselJob ? <Status status={statuses.carousel} language={language} /> : null}
                      {styleJob ? <Status status={statuses.style} language={language} /> : null}
                      {(carouselJob?.status === "completed" || styleJob?.status === "completed") ? (
                        <button
                          type="button"
                          onClick={() => void downloadAssetFolder()}
                          aria-label={tx("下载图片素材 ZIP", "Download Image Assets ZIP")}
                          title={tx("下载图片素材 ZIP", "Download Image Assets ZIP")}
                          className="inline-flex items-center justify-center rounded-md border border-lime-300/30 p-1.5 text-lime-200 hover:bg-lime-300/10"
                        >
                          <Download size={13} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {carouselJob ? (
                    <div>
                      <h4 className="mb-3 text-xs font-semibold text-zinc-300">{tx("TikTok Shop 轮播图", "TikTok Shop Carousel Images")}</h4>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {carouselJob.carouselImages.map((slot) => (
                      <article
                        key={slot.id}
                        className="relative rounded-lg border border-white/10"
                      >
                        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                          <span className="truncate text-xs font-semibold">
                            {slot.title}
                          </span>
                          <ImageStatus status={slot.status} language={language} />
                        </div>
                        {slot.resultUrl ? (
                          <img
                            src={slot.resultUrl}
                            alt={slot.title}
                            className="aspect-square w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-square items-center justify-center text-xs text-zinc-600">
                            {slot.status === "fail" ? (
                              slot.error || copy.failed
                            ) : (
                              <Loader2 size={22} className="animate-spin" />
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 p-3 text-[11px] text-zinc-500">
                          <span className="truncate">
                            {slot.selectedCopy?.title || tx("AI 自动文案", "AI-generated copy")}
                          </span>
                          <span className="flex items-center gap-3">
                            {slot.resultUrl ? (
                              <a
                                href={slot.resultUrl}
                                target="_blank"
                                rel="noreferrer"
                                download
                                aria-label={`下载 ${slot.title}`}
                                title={`下载 ${slot.title}`}
                                className="text-zinc-300 hover:text-lime-200"
                              >
                                <Download size={13} />
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openCarouselRegenerate(slot)}
                              aria-label={`重新生成 ${slot.title}`}
                              title={`重新生成 ${slot.title}`}
                              className="text-lime-200 hover:text-white"
                            >
                              <RefreshCw size={13} />
                            </button>
                          </span>
                        </div>
                      </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {styleJob ? (
                    <div className={carouselJob ? "mt-6 border-t border-white/10 pt-6" : ""}>
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-zinc-300">{tx("SKU 款式图", "SKU Style Images")}</h4>
                      </div>
                      <p className="mb-4 text-xs text-zinc-500">
                        {tx(
                          "先生成 SKU 1 作为构图母版，再按顺序基于母版生成其余 SKU；统一约 45° 俯拍、朝向和构图。",
                          "SKU 1 is generated as the composition master, then the remaining SKUs follow the same 45° top-down angle, orientation, and composition.",
                        )}
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {styleJob.styleImages.map((slot) => (
                          <article
                            key={slot.id}
                            className="overflow-hidden rounded-lg border border-white/10"
                          >
                            <div className="aspect-square bg-white">
                              {slot.resultUrl ? (
                                <img
                                  src={slot.resultUrl}
                                  alt={`SKU ${slot.skuIndex + 1} style image`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                                  {slot.status === "fail" ? (
                                    slot.error || copy.failed
                                  ) : (
                                    <Loader2 size={22} className="animate-spin" />
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between p-3 text-xs">
                              <span className="font-mono text-[11px]">
                                {getStyleSkuId(styleJob, slot, skus)}
                              </span>
                              <span className="flex gap-3">
                                <span className="flex items-center gap-1.5 text-lime-200">
                                  <button
                                    type="button"
                                    aria-label={
                                      copiedSkuId === slot.id
                                        ? tx("已复制 SKU ID", "SKU ID copied")
                                        : tx(`复制 ${getStyleSkuId(styleJob, slot, skus)}`, `Copy ${getStyleSkuId(styleJob, slot, skus)}`)
                                    }
                                    title={
                                      copiedSkuId === slot.id
                                        ? tx("已复制 SKU ID", "SKU ID copied")
                                        : tx(`复制 ${getStyleSkuId(styleJob, slot, skus)}`, `Copy ${getStyleSkuId(styleJob, slot, skus)}`)
                                    }
                                    onClick={() =>
                                      void copySkuId(
                                        slot.id,
                                        getStyleSkuId(styleJob, slot, skus),
                                      )
                                    }
                                    className={
                                      copiedSkuId === slot.id
                                        ? "flex items-center gap-1 text-lime-200"
                                        : "flex items-center gap-1 text-zinc-400 hover:text-lime-200"
                                    }
                                  >
                                    {copiedSkuId === slot.id ? (
                                      <Check size={12} />
                                    ) : (
                                      <CopyIcon size={12} />
                                    )}
                                  </button>
                                </span>
                                {slot.resultUrl ? (
                                  <a
                                    href={slot.resultUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    download
                                    aria-label={`下载 ${getStyleSkuId(styleJob, slot, skus)}`}
                                    title={`下载 ${getStyleSkuId(styleJob, slot, skus)}`}
                                    className="text-zinc-300 hover:text-lime-200"
                                  >
                                    <Download size={13} />
                                  </a>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => openStyleRegenerate(slot)}
                                  aria-label={`重新生成 ${getStyleSkuId(styleJob, slot, skus)}`}
                                  title={`重新生成 ${getStyleSkuId(styleJob, slot, skus)}`}
                                  className="text-lime-200 hover:text-white"
                                >
                                  <RefreshCw size={13} />
                                </button>
                              </span>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {storyboardJob ? (
                <section className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{tx("视频素材生成", "Video Asset Generation")}</h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        {tx(
                          "3 个不同卖点，基于厂家参考图生成真实镜头，统一 9:16 格式；每张可单独生成 15 秒视频。",
                          "Three selling points based on manufacturer references, in a consistent 9:16 format; each image can generate a separate 15-second video.",
                        )}
                      </p>
                    </div>
                    <Status status={statuses.storyboard} language={language} />
                  </div>
                  <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-300">
                        <span>{tx("短视频封面 · 3:4", "Short Video Cover · 3:4")}</span>
                        {storyboardJob.cover?.status ? (
                          <ImageStatus status={storyboardJob.cover.status} language={language} />
                        ) : null}
                      </div>
                      {storyboardJob.cover?.resultUrl ? (
                        <div className="group relative z-0 overflow-visible bg-white transition-transform duration-300 ease-out group-hover:z-20 group-hover:scale-105 group-hover:shadow-2xl">
                          <img
                            src={storyboardJob.cover.resultUrl}
                            alt="Short video cover"
                            className="aspect-[3/4] w-full cursor-zoom-in object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-[9/16] items-center justify-center bg-white/5 text-xs text-zinc-500">
                          {storyboardJob.cover?.status === "fail" ? (
                            storyboardJob.cover.error || copy.failed
                          ) : (
                            <Loader2 size={22} className="animate-spin" />
                          )}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {storyboardJob.cover?.resultUrl ? (
                          <a
                            href={storyboardJob.cover.resultUrl}
                            download
                            target="_blank"
                            rel="noreferrer"
                            aria-label={tx("下载视频封面", "Download Video Cover")}
                            title={tx("下载视频封面", "Download Video Cover")}
                            className="inline-flex items-center justify-center rounded-md border border-white/10 p-1.5 text-zinc-300 transition-colors hover:text-lime-200"
                          >
                            <Download size={13} />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void regenerateStoryboardCover()}
                          aria-label={tx("重新生成视频封面", "Regenerate Video Cover")}
                          title={tx("重新生成视频封面", "Regenerate Video Cover")}
                          className="inline-flex items-center justify-center rounded-md border border-white/10 p-1.5 text-zinc-300 transition-colors hover:text-lime-200"
                        >
                          <RefreshCw size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-300">
                          {tx("短视频发布信息 · 45 秒", "Short Video Publishing Info · 45 sec")}
                        </span>
                        <button
                          type="button"
                          disabled={regeneratingStoryboardMetadata}
                          onClick={() => void regenerateStoryboardMetadata()}
                          aria-label={tx("重新生成发布文案", "Regenerate Publishing Copy")}
                          title={tx("重新生成发布文案", "Regenerate Publishing Copy")}
                          className="inline-flex items-center justify-center rounded-md border border-white/10 p-1.5 text-zinc-300 transition-colors hover:text-lime-200 disabled:cursor-wait disabled:opacity-60"
                        >
                          <RefreshCw
                            size={13}
                            className={
                              regeneratingStoryboardMetadata
                                ? "animate-spin"
                                : undefined
                            }
                          />
                        </button>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">
                          {tx("标题", "Title")}
                        </label>
                        <div className="flex gap-2">
                          {regeneratingStoryboardMetadata ? (
                            <div
                              aria-label={tx("标题生成中", "Title generating")}
                              className="h-10 min-w-0 flex-1 animate-pulse rounded-md border border-white/10 bg-gradient-to-r from-white/5 via-white/15 to-white/5"
                            />
                          ) : (
                            <input
                              value={storyboardJob.title || ""}
                              onChange={(event) =>
                                setStoryboardJob((current) =>
                                  current
                                    ? { ...current, title: event.target.value }
                                    : current,
                                )
                              }
                              className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/50"
                            />
                          )}
                          <button
                            type="button"
                            disabled={regeneratingStoryboardMetadata}
                            onClick={() => void copyStoryboardMetadata("title")}
                            aria-label={copiedStoryboardTitle ? tx("已复制标题", "Title copied") : tx("复制标题", "Copy title")}
                            title={copiedStoryboardTitle ? tx("已复制标题", "Title copied") : tx("复制标题", "Copy title")}
                            className="inline-flex items-center justify-center rounded-md border border-white/10 p-2 text-zinc-300 transition-colors hover:text-lime-200 disabled:cursor-wait disabled:opacity-40"
                          >
                            {copiedStoryboardTitle ? <Check size={13} /> : <CopyIcon size={13} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">
                          {tx("描述 · 5 个标签", "Description · 5 hashtags")}
                        </label>
                        <div className="flex items-start gap-2">
                          {regeneratingStoryboardMetadata ? (
                            <div
                              aria-label={tx("描述生成中", "Description generating")}
                              className="min-h-[144px] min-w-0 flex-1 animate-pulse rounded-md border border-white/10 bg-gradient-to-b from-white/5 via-white/15 to-white/5"
                            />
                          ) : (
                            <textarea
                              value={storyboardDescriptionText(storyboardJob)}
                              onChange={(event) => {
                                const [description = "", hashtagText = ""] =
                                  event.target.value.split(/\n\n/);
                                setStoryboardJob((current) =>
                                  current
                                    ? {
                                        ...current,
                                        description,
                                        hashtags: hashtagText
                                          .split(/\s+/)
                                          .filter((item) => item.startsWith("#")),
                                      }
                                    : current,
                                );
                              }}
                              rows={6}
                              className="min-w-0 flex-1 resize-y rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-zinc-200 outline-none focus:border-lime-300/50"
                            />
                          )}
                          <button
                            type="button"
                            disabled={regeneratingStoryboardMetadata}
                            onClick={() => void copyStoryboardMetadata("description")}
                            aria-label={copiedStoryboardDescription ? tx("已复制描述", "Description copied") : tx("复制描述", "Copy description")}
                            title={copiedStoryboardDescription ? tx("已复制描述", "Description copied") : tx("复制描述", "Copy description")}
                            className="inline-flex items-center justify-center rounded-md border border-white/10 p-2 text-zinc-300 transition-colors hover:text-lime-200 disabled:cursor-wait disabled:opacity-40"
                          >
                            {copiedStoryboardDescription ? <Check size={13} /> : <CopyIcon size={13} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {storyboardJob.slots.map((slot) => (
                      <article
                        key={slot.id}
                        className="overflow-hidden rounded-lg border border-white/10"
                      >
                        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                          <span className="truncate text-xs font-semibold text-white">
                            {slot.stage === "continuation"
                              ? tx("2 · 承接", "2 · Continuation")
                              : slot.stage === "closing"
                                ? tx("3 · 收束", "3 · Closing")
                                : tx("1 · 开场", "1 · Opening")}{" "}
                            {slot.sellingPoint.title}
                          </span>
                          <ImageStatus status={slot.status} language={language} />
                        </div>
                        {slot.resultUrl ? (
                          <div className="group relative z-0 bg-white transition-transform duration-300 ease-out group-hover:z-20 group-hover:scale-110 group-hover:shadow-2xl">
                            <img
                              src={slot.resultUrl}
                              alt={`${tx("视频素材图", "Video Asset")} ${slot.index + 1}`}
                              className="aspect-[9/16] w-full cursor-zoom-in object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex aspect-[9/16] items-center justify-center bg-white/5 px-4 text-center text-xs text-zinc-500">
                            {slot.status === "fail" ? (
                              slot.error || copy.failed
                            ) : (
                              <Loader2 size={22} className="animate-spin" />
                            )}
                          </div>
                        )}
                        <div className="space-y-3 p-3">
                          <p className="line-clamp-2 text-xs leading-5 text-zinc-400">
                            {slot.sellingPoint.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {slot.resultUrl ? (
                              <button
                                type="button"
                                onClick={() => void copyStoryboardImage(slot)}
                                aria-label={copiedStoryboardId === slot.id ? tx("已复制视频素材图", "Video asset copied") : tx("复制视频素材图", "Copy video asset")}
                                title={copiedStoryboardId === slot.id ? tx("已复制视频素材图", "Video asset copied") : tx("复制视频素材图", "Copy video asset")}
                                className="inline-flex items-center justify-center rounded-md border border-white/10 p-1.5 text-zinc-300 transition-colors hover:text-lime-200"
                              >
                                {copiedStoryboardId === slot.id ? (
                                  <Check size={13} className="text-lime-200" />
                                ) : (
                                  <CopyIcon size={13} />
                                )}
                              </button>
                            ) : null}
                              <button
                                type="button"
                                disabled={
                                  !slot.resultUrl ||
                                  slot.video?.status === "processing" ||
                                  creatingStoryboardVideoId === slot.id
                                }
                              aria-label={slot.video?.status === "fail" ? tx("重试视频", "Retry video") : tx("生成视频", "Generate video")}
                              title={slot.video?.status === "fail" ? tx("重试视频", "Retry video") : tx("生成视频", "Generate video")}
                              onClick={() =>
                                void createStoryboardVideo(slot.id)
                              }
                              className="inline-flex items-center justify-center rounded-md border border-white/10 p-1.5 text-zinc-300 transition-colors hover:text-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {slot.video?.status === "processing" ||
                              creatingStoryboardVideoId === slot.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Film size={13} />
                              )}
                            </button>
                            {slot.resultUrl || slot.status === "fail" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void regenerateStoryboard(slot.id)
                                }
                                aria-label={tx("重新生成视频素材图", "Regenerate video asset")}
                                title={tx("重新生成视频素材图", "Regenerate video asset")}
                                className="inline-flex items-center justify-center rounded-md border border-white/10 p-1.5 text-zinc-300 transition-colors hover:text-lime-200"
                              >
                                <RefreshCw size={13} />
                              </button>
                            ) : null}
                          </div>
                          {slot.video?.status === "success" &&
                          slot.video.resultUrl ? (
                            <div className="space-y-2">
                              <video
                                src={slot.video.resultUrl}
                                controls
                                className="w-full rounded-md bg-black"
                              />
                              <a
                                href={slot.video.resultUrl}
                                download
                                target="_blank"
                                rel="noreferrer"
                                aria-label={tx("下载视频", "Download video")}
                                title={tx("下载视频", "Download video")}
                                className="inline-flex items-center justify-center rounded-md border border-white/10 p-1.5 text-zinc-300 transition-colors hover:text-lime-200"
                              >
                                <Download size={13} />
                              </a>
                            </div>
                          ) : slot.video?.status === "processing" ? (
                            <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-md border border-white/10 bg-gradient-to-br from-white/5 via-lime-300/10 to-white/5 text-center">
                              <div className="h-16 w-16 animate-pulse rounded-full border border-lime-300/30 bg-lime-300/10 p-4 text-lime-200">
                                <Film size={30} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-zinc-200">
                                  {tx("视频生成中…", "Video generating…")}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {tx("完成后会在这里显示预览", "The preview will appear here when ready")}
                                </p>
                              </div>
                            </div>
                          ) : slot.video?.status === "fail" ? (
                            <p className="text-xs text-red-300">
                              {slot.video.error || tx("视频生成失败", "Video generation failed")}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </Panel>
        </div>
      </div>
      {historyOpen ? (
        <div className="fixed inset-0 z-50 bg-black/75 p-5">
          <aside className="ml-auto flex h-full w-full max-w-lg flex-col rounded-xl border border-white/10 bg-[#171716] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <div>
                <h2 className="text-lg font-semibold text-white">{tx("历史记录", "History")}</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {tx(`最近保留 ${ECOMMERCE_HISTORY_LIMIT} 条商品生成记录。`, `The latest ${ECOMMERCE_HISTORY_LIMIT} product generation records are kept.`)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X size={17} />
              </button>
            </div>
            <div className="border-b border-white/10 p-5">
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-400">
                <Search size={15} />
                <input
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  placeholder={tx("搜索产品名称或 SKU ID", "Search product name or SKU ID")}
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
                />
              </label>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {visibleHistoryRecords.length ? (
                visibleHistoryRecords.map((record) => (
                    <article
                      key={record.id}
                      className="rounded-lg border border-white/10 bg-black/20 p-3 transition-colors hover:border-lime-300/30"
                    >
                      <button
                        type="button"
                        onClick={() => restoreHistoryRecord(record)}
                        className="flex w-full items-start gap-3 text-left"
                      >
                        {record.thumbnails[0] ? (
                          <img
                            src={record.thumbnails[0]}
                            alt={record.productName}
                            className="h-16 w-16 shrink-0 rounded-md bg-white object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-white/5 text-zinc-600">
                            <Sparkles size={18} />
                          </div>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">
                            {record.productName}
                          </span>
                          <span className="mt-1 block text-[11px] text-zinc-500">
                            {new Date(record.updatedAt).toLocaleString(language === "en" ? "en-US" : "zh-CN")}
                          </span>
                          <span className="mt-2 block text-[11px] text-zinc-500">
                            {tx("点击查看这个商品的全部生成内容", "Click to view all generated content for this product")}
                          </span>
                        </span>
                        <span className="pt-1 text-zinc-500">
                          <ChevronRight size={16} />
                        </span>
                      </button>
                      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
                        <span className={`text-[11px] ${record.status === "completed" ? "text-lime-200" : record.status === "failed" ? "text-red-300" : "text-zinc-400"}`}>
                          {record.status === "completed"
                            ? tx("已完成", "Completed")
                            : record.status === "failed"
                              ? tx("生成失败", "Generation failed")
                              : record.status === "partial"
                                ? tx("部分完成", "Partially completed")
                                : tx("生成中", "Processing")}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteHistoryRecord(record.id)}
                          aria-label="删除历史记录"
                          title="删除历史记录"
                          className="inline-flex items-center justify-center p-1 text-zinc-500 hover:text-red-300"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </article>
                  ))
              ) : (
                <div className="py-16 text-center text-sm text-zinc-500">
                  {tx("暂无匹配的历史记录", "No matching history records")}
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
      {configOpen ? (
        <div className="fixed inset-0 z-50 bg-black/75 p-5">
          <div className="ml-auto h-full w-full max-w-xl overflow-y-auto rounded-xl border border-white/10 bg-[#171716] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {copy.config}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {tx("保存后只影响下一次生成。", "Changes apply to the next generation only.")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-white/10"
              >
                <X size={17} />
              </button>
            </div>
            <label className="mt-6 block text-xs font-semibold text-zinc-300">
              {tx("全局风格限定", "Global Style Guide")}
              <textarea
                value={config.styleGuide}
                onChange={(event) =>
                  updateConfig("styleGuide", event.target.value)
                }
                rows={6}
                className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-lime-300/60"
              />
            </label>
            {(["person", "logo", "mainComposition"] as const).map((key) => (
              <div
                key={key}
                className="mt-5 rounded-lg border border-white/10 p-4"
              >
                <h3 className="text-sm font-semibold text-white">
                  {key === "person"
                    ? tx("人物参考", "Person Reference")
                    : key === "logo"
                      ? tx("店铺 Logo", "Store Logo")
                      : tx("主图构图参考", "Main Image Composition")}
                </h3>
                <label className="mt-3 block text-xs text-zinc-400">
                  {tx("图片 URL", "Image URL")}
                  <input
                    value={config[key].imageUrl}
                    onChange={(event) =>
                      updateConfig(key, {
                        ...config[key],
                        imageUrl: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/60"
                  />
                </label>
                <label className="mt-3 block text-xs text-zinc-400">
                  {tx("使用 Prompt", "Prompt")}
                  <textarea
                    value={config[key].prompt}
                    onChange={(event) =>
                      updateConfig(key, {
                        ...config[key],
                        prompt: event.target.value,
                      })
                    }
                    rows={4}
                    className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-white outline-none focus:border-lime-300/60"
                  />
                </label>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {key === "logo"
                    ? tx("第一张主图不会使用 Logo；款式图不会使用 Logo。", "The first main image and SKU style images do not use the logo.")
                    : key === "person"
                      ? tx("人物只用于第一张主图。", "The person reference is used only for the first main image.")
                      : tx("构图参考只用于第一张主图。", "The composition reference is used only for the first main image.")}
                </p>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setConfigOpen(false)}
              className="mt-5 w-full rounded-lg bg-lime-300 px-4 py-3 text-sm font-semibold text-zinc-950"
            >
              {tx("保存配置", "Save Settings")}
            </button>
          </div>
        </div>
      ) : null}
      {pricingConfigOpen ? (
        <div className="fixed inset-0 z-50 bg-black/75 p-5">
          <div className="ml-auto h-full w-full max-w-xl overflow-y-auto rounded-xl border border-white/10 bg-[#171716] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{tx("价格配置", "Pricing Settings")}</h2>
                <p className="mt-1 text-xs text-zinc-500">{tx("生成时只需填写商品成本和重量，其他定价参数使用这里的配置。", "During generation, enter only product cost and weight; other pricing parameters use these settings.")}</p>
              </div>
              <button type="button" onClick={() => setPricingConfigOpen(false)} className="rounded-full p-2 text-zinc-400 hover:bg-white/10"><X size={17} /></button>
            </div>
            <div className="mt-6 rounded-lg border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white">{tx("目标国家", "Target Markets")}</h3>
              <div className="mt-3 flex gap-3">
                {(["SG", "MY"] as const).map((country) => {
                  const active = pricingConfig.countries.includes(country);
                  return (
                    <label key={country} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${active ? "border-lime-300/60 bg-lime-300/10 text-lime-100" : "border-white/10 text-zinc-400"}`}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(event) =>
                          updatePricingConfig({
                            countries: event.target.checked
                              ? [...pricingConfig.countries, country].filter((value, index, values) => values.indexOf(value) === index)
                              : pricingConfig.countries.filter((value) => value !== country),
                          })
                        }
                        className="accent-lime-300"
                      />
                      {country === "SG" ? tx("新加坡（SGD）", "Singapore (SGD)") : tx("马来西亚（MYR）", "Malaysia (MYR)")}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                [tx("包装 / 国内段成本（人民币）", "Packaging / Domestic Cost (RMB)"), "packagingCostRmb", pricingConfig.packagingCostRmb, "RMB"],
                [tx("买家支付比例（4折=40%）", "Buyer Pay Percent (40% at 4x discount)"), "buyerPayPercent", pricingConfig.buyerPayPercent, "%"],
                [tx("目标利润 / 成本", "Target Margin / Cost"), "targetMarginPercent", pricingConfig.targetMarginPercent, "%"],
                [tx("达人佣金（不用填 0）", "Affiliate Commission (enter 0 if unused)"), "affiliateRate", pricingConfig.affiliateRate, "%"],
              ].map(([label, key, value, suffix]) => (
                <label key={key} className="text-xs text-zinc-400">
                  {label}
                  <div className="mt-2 flex items-center rounded-lg border border-white/10 bg-black/30 px-3">
                    <input
                      type="number"
                      min="0"
                      value={String(value)}
                      onChange={(event) => updatePricingConfig({ [key]: Number(event.target.value) } as Partial<EcommercePricingConfig>)}
                      className="w-full bg-transparent py-2.5 text-sm text-white outline-none"
                    />
                    <span className="text-xs text-zinc-600">{suffix}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-6 space-y-4">
              {(["SG", "MY"] as const).map((country) => {
                const market = pricingConfig.markets[country];
                return (
                  <div key={country} className="rounded-lg border border-white/10 p-4">
                    <h3 className="text-sm font-semibold text-white">{country === "SG" ? tx("新加坡", "Singapore") : tx("马来西亚", "Malaysia")} · {tx("费率、汇率与物流", "Rates, Exchange & Logistics")}</h3>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      {([
                        [tx("人民币 / 当地币", "RMB / Local Currency"), "exchangeRateRmbPerLocal", market.exchangeRateRmbPerLocal, ""],
                        [tx("平台佣金", "Platform Commission"), "commissionRate", market.commissionRate, "%"],
                        [tx("交易费", "Transaction Fee"), "transactionRate", market.transactionRate, "%"],
                        [tx("每单支持费", "Per-order Support Fee"), "supportFee", market.supportFee, market.currency],
                      ] as const).map(([label, key, value, suffix]) => (
                        <label key={key} className="text-xs text-zinc-400">
                          {label}
                          <div className="mt-2 flex items-center rounded-lg border border-white/10 bg-black/30 px-3">
                            <input type="number" min="0" value={String(value)} onChange={(event) => updatePricingMarket(country, { [key]: Number(event.target.value) } as Partial<TikTokPricingMarketInput>)} className="w-full bg-transparent py-2.5 text-sm text-white outline-none" />
                            <span className="text-xs text-zinc-600">{suffix}</span>
                          </div>
                        </label>
                      ))}
                      <label className="text-xs text-zinc-400">{tx("税务身份", "Tax Profile")}<select value={market.taxProfile} onChange={(event) => updatePricingMarket(country, { taxProfile: event.target.value as TikTokPricingMarketInput["taxProfile"] })} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"><option value="individual">{tx("个人 / 个体户", "Individual")}</option><option value="corporate">{tx("公司", "Company")}</option></select></label>
                      <label className="text-xs text-zinc-400">{tx("地区 / 区域", "Region")}<select value={market.region} onChange={(event) => updatePricingMarket(country, { region: event.target.value as TikTokPricingMarketInput["region"] })} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white">{(country === "MY" ? [["west", tx("西马", "West Malaysia")], ["east", tx("东马", "East Malaysia")]] : [["default", tx("全境", "All regions")]]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <label className="text-xs text-zinc-400">{tx("物流渠道", "Logistics Channel")}<select value={market.channel} onChange={(event) => updatePricingMarket(country, { channel: event.target.value as TikTokPricingMarketInput["channel"] })} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"><option value="Standard">Standard</option><option value="Economy">Economy</option></select></label>
                      <label className="text-xs text-zinc-400">{tx("自定义卖家运费（可选）", "Custom Seller Shipping (Optional)")}<input type="number" min="0" value={market.logisticsOverride === undefined ? "" : String(market.logisticsOverride)} onChange={(event) => updatePricingMarket(country, { logisticsOverride: event.target.value.trim() === "" ? undefined : Number(event.target.value) })} placeholder={tx("留空使用新价卡", "Leave blank to use rate card")} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white" /></label>
                      <label className="flex items-center gap-2 text-xs text-zinc-300 sm:col-span-2"><input type="checkbox" checked={market.includeLocalDeliveryCost} onChange={(event) => updatePricingMarket(country, { includeLocalDeliveryCost: event.target.checked })} className="accent-lime-300" />{tx("我也承担买家下单时支付的当地派送费", "I also cover the local delivery fee paid by the buyer")}</label>
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setPricingConfigOpen(false)} className="mt-6 w-full rounded-lg bg-lime-300 px-4 py-3 text-sm font-semibold text-zinc-950">{tx("保存价格配置", "Save Pricing Settings")}</button>
          </div>
        </div>
      ) : null}
      {editingCarousel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#171716] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{tx("重新生成轮播图", "Regenerate Carousel Image")}</h2>
              <button type="button" onClick={() => setEditingCarousel(null)}>
                <X size={17} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {carouselJob?.productSkuImageUrls.map((url, index) => (
                <button
                  type="button"
                  key={`${url}-${index}`}
                  onClick={() => setEditCarouselSku(index)}
                  className={`rounded-lg border p-2 text-left ${editCarouselSku === index ? "border-lime-300/70 bg-lime-300/10" : "border-white/10"}`}
                >
                  <img
                    src={url}
                    alt={`SKU ${index + 1}`}
                    className="aspect-square w-full object-contain"
                  />
                  <span className="mt-2 block text-xs">SKU {index + 1}</span>
                </button>
              ))}
            </div>
            <input
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              placeholder={tx("英文标题", "English headline")}
              className="mt-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <textarea
              value={editSubtitle}
              onChange={(event) => setEditSubtitle(event.target.value)}
              placeholder={tx("英文副标题", "English subheadline")}
              rows={3}
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <textarea
              value={editRefinement}
              onChange={(event) => setEditRefinement(event.target.value)}
              placeholder={tx("更改要求（可选）", "Refinement (optional)")}
              rows={4}
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingCarousel(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm"
              >
                {tx("取消", "Cancel")}
              </button>
              <button
                type="button"
                disabled={
                  regenerating || !editTitle.trim() || !editSubtitle.trim()
                }
                onClick={() => void regenerateCarousel()}
                className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
              >
                {regenerating ? tx("生成中…", "Generating…") : tx("确认重新生成", "Confirm Regeneration")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editingStyle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#171716] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{tx("重新生成 SKU 款式图", "Regenerate SKU Style Image")}</h2>
              <button type="button" onClick={() => setEditingStyle(null)}>
                <X size={17} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {styleJob?.productSkuImageUrls.map((url, index) => (
                <button
                  type="button"
                  key={`${url}-${index}`}
                  onClick={() => setEditStyleSku(index)}
                  className={`rounded-lg border p-2 text-left ${editStyleSku === index ? "border-lime-300/70 bg-lime-300/10" : "border-white/10"}`}
                >
                  <img
                    src={url}
                    alt={`SKU ${index + 1}`}
                    className="aspect-square w-full object-contain"
                  />
                  <span className="mt-2 block text-xs">SKU {index + 1}</span>
                </button>
              ))}
            </div>
            <textarea
              value={styleRefinement}
              onChange={(event) => setStyleRefinement(event.target.value)}
              placeholder={tx("更改要求（可选），例如：产品再大一些，但保持固定俯拍角度。", "Refinement (optional), e.g. make the product larger while keeping the fixed top-down angle.")}
              rows={5}
              className="mt-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingStyle(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm"
              >
                {tx("取消", "Cancel")}
              </button>
              <button
                type="button"
                disabled={regenerating}
                onClick={() => void regenerateStyle()}
                className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
              >
                {regenerating ? tx("生成中…", "Generating…") : tx("确认重新生成", "Confirm Regeneration")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
