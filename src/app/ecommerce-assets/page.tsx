"use client";

import Link from "next/link";
import {
  Check,
  Copy as CopyIcon,
  Download,
  Film,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  EcommerceAssetsJob,
  EcommerceCarouselRole,
  EcommerceGenerationConfig,
  EcommerceImageSlot,
  EcommerceProductTitleProposal,
  EcommerceStyleImageJob,
  EcommerceStyleImageSlot,
  EcommerceStoryboardJob,
  EcommerceStoryboardSlot,
} from "@/lib/types";
import {
  CHUB_TWO_DEFAULT_GENERATION_CONFIG,
  CHUB_TWO_PERSON_URL,
  ECOMMERCE_CAROUSEL_ROLE_COUNTS,
} from "@/lib/ecommerce-assets";

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
type UploadItem = { id: string; dataUrl: string; fileName: string };
type OutputKey = "info" | "carousel" | "storyboard" | "style";
type OutputStatus = "idle" | "processing" | "completed" | "failed";
type ProductViewKey = "front" | "side" | "back";
const PRODUCT_VIEW_KEYS: ProductViewKey[] = ["front", "side", "back"];
const PRODUCT_VIEW_LABELS: Record<ProductViewKey, string> = {
  front: "正面",
  side: "侧面",
  back: "背面",
};

const copy = {
  title: "CHUB TWO TikTok Shop 生成工作台",
  subtitle:
    "上传 SKU 与厂家参考图，选择要生成的内容，AI 会并行处理并统一管理结果。",
  sku: "1. 产品 SKU 图片",
  skuHint: "至少上传 1 张。第一张默认作为主产品参考，支持调整顺序。",
  refs: "2. 1688 厂家参考图",
  refsHint:
    "场景图和细节卖点图支持一次多选；上传多少就参考多少。变体规格图完全基于 SKU 原图原创生成。",
  config: "生成配置",
  configHint: "人物、Logo、主图构图和风格限定只作用于新任务。",
  workstation: "3. 统一生成模块",
  info: "商品标题与简述",
  carousel: "TikTok Shop 轮播图",
  storyboard: "视频分镜图",
  style: "SKU 款式图",
  generate: "生成已选内容",
  generating: "生成中…",
  selectAtLeast: "请至少勾选一项生成内容。",
  needSku: "请至少上传 1 张产品 SKU 图片。",
  needFrontView: "请上传产品正面视图，才能生成视频分镜图。",
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

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#151514] p-5">
      <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      {subtitle ? (
        <p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function readImage(file: File) {
  if (!IMAGE_TYPES.has(file.type))
    return Promise.reject(new Error("请使用 PNG、JPG 或 WEBP 图片。"));
  if (file.size > MAX_IMAGE_BYTES)
    return Promise.reject(new Error("每张图片不能超过 10MB。"));
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

function roleLabel(role: EcommerceCarouselRole) {
  return {
    main: "主图",
    scene: "场景图",
    detail: "细节卖点图",
    variant: "变体规格图",
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

function Status({ status }: { status: OutputStatus }) {
  const label =
    status === "processing"
      ? "生成中"
      : status === "completed"
        ? "已完成"
        : status === "failed"
          ? "失败"
          : "未生成";
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

function ImageStatus({ status }: { status: EcommerceImageSlot["status"] }) {
  const label =
    status === "success"
      ? "已完成"
      : status === "fail"
        ? "失败"
        : status === "processing"
          ? "生成中"
          : "等待生成";
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
  const hydrated = useRef(false);
  const [selected, setSelected] = useState<Record<OutputKey, boolean>>({
    info: true,
    carousel: true,
    storyboard: false,
    style: true,
  });
  const [statuses, setStatuses] = useState<Record<OutputKey, OutputStatus>>({
    info: "idle",
    carousel: "idle",
    storyboard: "idle",
    style: "idle",
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
  const storyboardVideoTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const briefEditorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.queueMicrotask(() => {
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

  async function addSkuFiles(files: FileList | File[]) {
    setError("");
    try {
      const next = await Promise.all(
        Array.from(files).map(async (file) => ({
          id: crypto.randomUUID(),
          dataUrl: await readImage(file),
          fileName: file.name,
        })),
      );
      setSkus((current) => [...current, ...next]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片读取失败。");
    }
  }

  async function addProductViewFile(
    role: ProductViewKey,
    files: FileList | File[],
  ) {
    const file = Array.from(files)[0];
    if (!file) return;
    setError("");
    try {
      const item = {
        id: crypto.randomUUID(),
        dataUrl: await readImage(file),
        fileName: file.name,
      };
      setProductViews((current) => ({ ...current, [role]: item }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片读取失败。");
    }
  }

  async function addReferenceFiles(
    role: EcommerceCarouselRole,
    files: FileList | File[],
  ) {
    const remaining = ECOMMERCE_CAROUSEL_ROLE_COUNTS[role] - refs[role].length;
    if (remaining <= 0) return;
    setError("");
    try {
      const next = await Promise.all(
        Array.from(files)
          .slice(0, remaining)
          .map(async (file) => ({
            id: crypto.randomUUID(),
            dataUrl: await readImage(file),
            fileName: file.name,
          })),
      );
      setRefs((current) => ({
        ...current,
        [role]: [...current[role], ...next],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片读取失败。");
    }
  }

  function setPrimary(index: number) {
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
    setSkus((current) => current.filter((item) => item.id !== id));
  }
  function updateConfig<K extends keyof EcommerceGenerationConfig>(
    key: K,
    value: EcommerceGenerationConfig[K],
  ) {
    setConfig((current) => ({ ...current, [key]: value }));
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
      setError(e instanceof Error ? e.message : "复制失败");
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
      setError(e instanceof Error ? e.message : "复制失败");
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

  async function downloadCarouselZip() {
    if (!carouselJob) return;
    try {
      const response = await fetch("/api/ecommerce-assets/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: carouselJob }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "ZIP 导出失败。");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `chub-two-carousel-${carouselJob.id}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ZIP 导出失败。");
    }
  }

  async function downloadStyleZip() {
    if (!styleJob) return;
    try {
      const response = await fetch("/api/ecommerce-assets/style-images/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: styleJob }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "ZIP 导出失败。");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `chub-two-style-images-${styleJob.id}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ZIP 导出失败。");
    }
  }

  async function generateStoryboards() {
    const primaryProductDataUrl = skus[0]?.dataUrl || productViews.front?.dataUrl;
    if (!primaryProductDataUrl) {
      setError(copy.needFrontView);
      setStatus("storyboard", "failed");
      return;
    }
    if (!productViews.front) {
      setError(copy.needFrontView);
      setStatus("storyboard", "failed");
      return;
    }
    if (!hasManufacturerReferences()) {
      setError(copy.needManufacturerReference);
      setStatus("storyboard", "failed");
      return;
    }
    setStatus("storyboard", "processing");
    try {
      const response = await fetch("/api/ecommerce-assets/storyboards/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSkuDataUrl: primaryProductDataUrl,
          productViewDataUrls: PRODUCT_VIEW_KEYS.map(
            (role) => productViews[role]?.dataUrl,
          ).filter((url): url is string => Boolean(url)),
          manufacturerReferenceDataUrls: [
            ...refs.scene.map((item) => item.dataUrl),
            ...refs.detail.map((item) => item.dataUrl),
          ],
          personImageUrl: CHUB_TWO_PERSON_URL,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setStoryboardJob(result.job);
      void pollStoryboards(result.job);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
      setStatus("storyboard", "failed");
    }
  }

  async function pollStoryboards(current: EcommerceStoryboardJob) {
    try {
      const response = await fetch("/api/ecommerce-assets/storyboards/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setStoryboardJob(result.job);
      if (result.job.status === "processing") {
        storyboardTimer.current = setTimeout(
          () => void pollStoryboards(result.job),
          4000,
        );
      } else {
        setStatus(
          "storyboard",
          result.job.status === "failed" ? "failed" : "completed",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
      setStatus("storyboard", "failed");
    }
  }

  async function copyStoryboardImage(slot: EcommerceStoryboardSlot) {
    if (!slot.resultUrl) return;
    try {
      const blob = await fetch(slot.resultUrl).then((response) => {
        if (!response.ok) throw new Error("分镜图读取失败。");
        return response.blob();
      });
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error("当前浏览器不支持直接复制图片，已开始下载。");
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
      setError(e instanceof Error ? e.message : "分镜图复制失败，已开始下载。");
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
      setStoryboardJob(result.job);
      void pollStoryboards(result.job);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    } finally {
      setRegeneratingStoryboardMetadata(false);
    }
  }

  async function regenerateStoryboardCover() {
    if (!storyboardJob) return;
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
      setStoryboardJob(result.job);
      void pollStoryboards(result.job);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    }
  }

  async function createStoryboardVideo(slotId: string) {
    if (!storyboardJob || creatingStoryboardVideoId === slotId) return;
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
      void pollStoryboardVideos(mergedJob);
    } catch (e) {
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

  async function pollStoryboardVideos(current: EcommerceStoryboardJob) {
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
      setStoryboardJob(result.job);
      if (
        result.job.slots.some(
          (slot: EcommerceStoryboardSlot) =>
            slot.video?.status === "processing",
        )
      )
        storyboardVideoTimer.current = setTimeout(
          () => void pollStoryboardVideos(result.job),
          5000,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.failed);
    }
  }

  async function regenerateStoryboard(slotId: string) {
    if (!storyboardJob) return;
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
      void pollStoryboards(updated);
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
    if (selected.storyboard && !productViews.front)
      return setError(copy.needFrontView);
    if (selected.storyboard && !hasManufacturerReferences())
      return setError(copy.needManufacturerReference);
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
            ← 返回首页
          </Link>
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-lime-300/30 px-3 py-2 text-xs font-semibold text-lime-200 hover:bg-lime-300/10"
          >
            <Settings2 size={15} />
            生成配置
          </button>
        </div>
        <header className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-xs font-semibold text-lime-200">
            <Sparkles size={13} /> CHUB TWO visual workstation
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">
            {copy.subtitle}
          </p>
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
          <Panel title={copy.sku} subtitle={copy.skuHint}>
            <label className="mb-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-lime-300/30 bg-lime-300/5 px-4 py-4 text-sm font-semibold text-lime-200 hover:bg-lime-300/10">
              <Plus size={17} />
              上传多个 SKU 图片
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
            title="产品 3 视图"
            subtitle="正面视图用于锁定产品外观；侧面和背面可选，用于视频分镜中保持结构、材质和细节一致。"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {PRODUCT_VIEW_KEYS.map((role) => {
                const item = productViews[role];
                return (
                  <div
                    key={role}
                    className="overflow-hidden rounded-lg border border-white/10 bg-black/20"
                  >
                    {item ? (
                      <div className="relative">
                        <img
                          src={item.dataUrl}
                          alt={`${PRODUCT_VIEW_LABELS[role]}视图`}
                          className="aspect-square w-full object-contain"
                        />
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
                      </div>
                    ) : (
                      <div className="flex aspect-square items-center justify-center text-xs text-zinc-600">
                        暂未上传
                      </div>
                    )}
                    <label className="flex cursor-pointer items-center justify-between border-t border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-lime-200">
                      <span>
                        {PRODUCT_VIEW_LABELS[role]}
                        {role === "front" ? "（必填）" : "（可选）"}
                      </span>
                      <span>{item ? "替换" : "上传"}</span>
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
          <Panel title={copy.refs} subtitle={copy.refsHint}>
            <div className="space-y-5">
              {REF_ROLES.map((role) => (
                <div key={role}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-200">
                        {roleLabel(role)}
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
                          onClick={() =>
                            setRefs((current) => ({
                              ...current,
                              [role]: current[role].filter(
                                (candidate) => candidate.id !== item.id,
                              ),
                            }))
                          }
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
            subtitle="勾选后一次生成；三个任务并行执行，已经完成的结果会保留。"
          >
            <div className="grid gap-3 md:grid-cols-4">
              {(["info", "carousel", "storyboard", "style"] as OutputKey[]).map(
                (key) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${selected[key] ? "border-lime-300/60 bg-lime-300/10" : "border-white/10 bg-black/20"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected[key]}
                      onChange={(event) =>
                        setSelected((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))
                      }
                      className="mt-1 accent-lime-300"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-white">
                        {copy[key]}
                        <Status status={statuses[key]} />
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-zinc-500">
                        {key === "info"
                          ? "AI 分析厂家文案并生成英文标题和 QA 简述。"
                          : key === "carousel"
                            ? "自动确定每张轮播图的英文标题与副标题。"
                            : key === "storyboard"
                              ? "生成 3 张统一格式的英文产品分镜图，并可分别生成视频。"
                              : "每个 SKU 生成一张统一 45° 俯拍白底款式图。"}
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
                (!skus.length &&
                  !(
                    (selected.info || selected.storyboard) &&
                    hasManufacturerReferences() &&
                    (!selected.storyboard || Boolean(productViews.front))
                  ))
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
                    <h3 className="text-sm font-semibold">商品标题与简述</h3>
                    <Status status={statuses.info} />
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
                        商品简述
                      </span>
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void regenerateBrief()}
                          disabled={briefLoading || saving}
                          className="inline-flex items-center gap-1 rounded-md border border-lime-300/30 px-3 py-2 text-xs text-lime-200 hover:bg-lime-300/10 disabled:opacity-50"
                        >
                          {briefLoading ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <RefreshCw size={13} />
                          )}
                          重新生成
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyBrief()}
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-2 text-xs text-zinc-300 transition-colors duration-200 hover:text-lime-200"
                        >
                          {briefCopied ? (
                            <>
                              <Check size={13} className="text-lime-200" />
                              已复制
                            </>
                          ) : (
                            <>
                              <CopyIcon size={13} />
                              复制
                            </>
                          )}
                        </button>
                      </span>
                    </div>
                    <div
                      ref={briefEditorRef}
                      contentEditable
                      suppressContentEditableWarning
                      role="textbox"
                      aria-label="商品简述富文本编辑器"
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
              {carouselJob ? (
                <section className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      TikTok Shop 轮播图
                    </h3>
                    <div className="flex items-center gap-3">
                      <Status status={statuses.carousel} />
                      {carouselJob.status === "completed" ? (
                        <button
                          type="button"
                          onClick={() => void downloadCarouselZip()}
                          className="inline-flex items-center gap-1.5 rounded-md border border-lime-300/30 px-3 py-1.5 text-xs font-semibold text-lime-200 hover:bg-lime-300/10"
                        >
                          <Download size={13} />
                          下载 ZIP
                        </button>
                      ) : null}
                    </div>
                  </div>
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
                          <ImageStatus status={slot.status} />
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
                            {slot.selectedCopy?.title || "AI 自动文案"}
                          </span>
                          <span className="flex items-center gap-3">
                            {slot.resultUrl ? (
                              <a
                                href={slot.resultUrl}
                                target="_blank"
                                rel="noreferrer"
                                download
                                className="text-zinc-300"
                              >
                                {copy.download}
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openCarouselRegenerate(slot)}
                              className="text-lime-200"
                            >
                              <RefreshCw size={13} />
                            </button>
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              {storyboardJob ? (
                <section className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">视频分镜图</h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        3 个不同卖点，基于厂家参考图生成真实镜头，统一英文五列表格格式，9:16；每张可单独生成
                        15 秒视频。
                      </p>
                    </div>
                    <Status status={statuses.storyboard} />
                  </div>
                  <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-300">
                        <span>短视频封面 · 9:16</span>
                        {storyboardJob.cover?.status ? (
                          <ImageStatus status={storyboardJob.cover.status} />
                        ) : null}
                      </div>
                      {storyboardJob.cover?.resultUrl ? (
                        <div className="group relative z-0 overflow-visible bg-white transition-transform duration-300 ease-out group-hover:z-20 group-hover:scale-105 group-hover:shadow-2xl">
                          <img
                            src={storyboardJob.cover.resultUrl}
                            alt="Short video cover"
                            className="aspect-[9/16] w-full cursor-zoom-in object-cover"
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
                            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:text-lime-200"
                          >
                            <Download size={13} />
                            下载封面
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void regenerateStoryboardCover()}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:text-lime-200"
                        >
                          <RefreshCw size={13} />
                          重新生成封面
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-300">
                          短视频发布信息 · 45 秒
                        </span>
                        <button
                          type="button"
                          disabled={regeneratingStoryboardMetadata}
                          onClick={() => void regenerateStoryboardMetadata()}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:text-lime-200 disabled:cursor-wait disabled:opacity-60"
                        >
                          <RefreshCw
                            size={13}
                            className={
                              regeneratingStoryboardMetadata
                                ? "animate-spin"
                                : undefined
                            }
                          />
                          {regeneratingStoryboardMetadata
                            ? "生成中…"
                            : "重新生成文案"}
                        </button>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">
                          Title
                        </label>
                        <div className="flex gap-2">
                          {regeneratingStoryboardMetadata ? (
                            <div
                              aria-label="Title generating"
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
                            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:text-lime-200 disabled:cursor-wait disabled:opacity-40"
                          >
                            {copiedStoryboardTitle ? <Check size={13} /> : <CopyIcon size={13} />}
                            {copiedStoryboardTitle ? "已复制" : "复制"}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">
                          Description · 5 hashtags
                        </label>
                        <div className="flex items-start gap-2">
                          {regeneratingStoryboardMetadata ? (
                            <div
                              aria-label="Description generating"
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
                            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:text-lime-200 disabled:cursor-wait disabled:opacity-40"
                          >
                            {copiedStoryboardDescription ? <Check size={13} /> : <CopyIcon size={13} />}
                            {copiedStoryboardDescription ? "已复制" : "复制"}
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
                              ? "2 · 承接"
                              : slot.stage === "closing"
                                ? "3 · 收束"
                                : "1 · 开场"}{" "}
                            {slot.sellingPoint.title}
                          </span>
                          <ImageStatus status={slot.status} />
                        </div>
                        {slot.resultUrl ? (
                          <div className="group relative z-0 bg-white transition-transform duration-300 ease-out group-hover:z-20 group-hover:scale-110 group-hover:shadow-2xl">
                            <img
                              src={slot.resultUrl}
                              alt={`Storyboard ${slot.index + 1}`}
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
                                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-zinc-300 transition-colors hover:text-lime-200"
                              >
                                {copiedStoryboardId === slot.id ? (
                                  <>
                                    <Check
                                      size={13}
                                      className="text-lime-200"
                                    />
                                    已复制
                                  </>
                                ) : (
                                  <>
                                    <CopyIcon size={13} />
                                    复制图片
                                  </>
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
                              onClick={() =>
                                void createStoryboardVideo(slot.id)
                              }
                              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-zinc-300 transition-colors hover:text-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {slot.video?.status === "processing" ||
                              creatingStoryboardVideoId === slot.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Film size={13} />
                              )}
                              {slot.video?.status === "fail"
                                ? "重试视频"
                                : "生成视频"}
                            </button>
                            {slot.resultUrl || slot.status === "fail" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void regenerateStoryboard(slot.id)
                                }
                                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-zinc-300 transition-colors hover:text-lime-200"
                              >
                                <RefreshCw size={13} />
                                重新生成分镜
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
                                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:text-lime-200"
                              >
                                <Download size={13} />
                                下载视频
                              </a>
                            </div>
                          ) : slot.video?.status === "processing" ? (
                            <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-md border border-white/10 bg-gradient-to-br from-white/5 via-lime-300/10 to-white/5 text-center">
                              <div className="h-16 w-16 animate-pulse rounded-full border border-lime-300/30 bg-lime-300/10 p-4 text-lime-200">
                                <Film size={30} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-zinc-200">
                                  视频生成中…
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  完成后会在这里显示预览
                                </p>
                              </div>
                            </div>
                          ) : slot.video?.status === "fail" ? (
                            <p className="text-xs text-red-300">
                              {slot.video.error || "视频生成失败"}
                            </p>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              {styleJob ? (
                <section className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">SKU 款式图</h3>
                    <div className="flex items-center gap-3">
                      <Status status={statuses.style} />
                      {styleJob.status === "completed" ? (
                        <button
                          type="button"
                          onClick={() => void downloadStyleZip()}
                          className="inline-flex items-center gap-1.5 rounded-md border border-lime-300/30 px-3 py-1.5 text-xs font-semibold text-lime-200 hover:bg-lime-300/10"
                        >
                          <Download size={13} />
                          下载 ZIP
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mb-4 text-xs text-zinc-500">
                    先生成 SKU 1 作为构图母版，再按顺序基于母版生成其余
                    SKU；统一约 45° 俯拍、朝向和构图。
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
                              <span className="font-mono text-[11px]">
                                {getStyleSkuId(styleJob, slot, skus)}
                              </span>
                              <button
                                type="button"
                                aria-label={
                                  copiedSkuId === slot.id
                                    ? "已复制 SKU ID"
                                    : `复制 ${getStyleSkuId(styleJob, slot, skus)}`
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
                                  <>
                                    <Check size={12} />
                                    <span>已复制</span>
                                  </>
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
                                className="text-zinc-300"
                              >
                                {copy.download}
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openStyleRegenerate(slot)}
                              className="text-lime-200"
                            >
                              <RefreshCw size={13} />
                            </button>
                          </span>
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
      {configOpen ? (
        <div className="fixed inset-0 z-50 bg-black/75 p-5">
          <div className="ml-auto h-full w-full max-w-xl overflow-y-auto rounded-xl border border-white/10 bg-[#171716] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {copy.config}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  保存后只影响下一次生成。
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
              全局风格限定
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
                    ? "人物参考"
                    : key === "logo"
                      ? "店铺 Logo"
                      : "主图构图参考"}
                </h3>
                <label className="mt-3 block text-xs text-zinc-400">
                  图片 URL
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
                  使用 Prompt
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
                    ? "第一张主图不会使用 Logo；款式图不会使用 Logo。"
                    : key === "person"
                      ? "人物只用于第一张主图。"
                      : "构图参考只用于第一张主图。"}
                </p>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setConfigOpen(false)}
              className="mt-5 w-full rounded-lg bg-lime-300 px-4 py-3 text-sm font-semibold text-zinc-950"
            >
              保存配置
            </button>
          </div>
        </div>
      ) : null}
      {editingCarousel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#171716] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">重新生成轮播图</h2>
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
              placeholder="English headline"
              className="mt-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <textarea
              value={editSubtitle}
              onChange={(event) => setEditSubtitle(event.target.value)}
              placeholder="English subheadline"
              rows={3}
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <textarea
              value={editRefinement}
              onChange={(event) => setEditRefinement(event.target.value)}
              placeholder="更改要求（可选）"
              rows={4}
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingCarousel(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={
                  regenerating || !editTitle.trim() || !editSubtitle.trim()
                }
                onClick={() => void regenerateCarousel()}
                className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
              >
                {regenerating ? "生成中…" : "确认重新生成"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editingStyle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#171716] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">重新生成 SKU 款式图</h2>
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
              placeholder="更改要求（可选），例如：产品再大一些，但保持固定俯拍角度。"
              rows={5}
              className="mt-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingStyle(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={regenerating}
                onClick={() => void regenerateStyle()}
                className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
              >
                {regenerating ? "生成中…" : "确认重新生成"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
