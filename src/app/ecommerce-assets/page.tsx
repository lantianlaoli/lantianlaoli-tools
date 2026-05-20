"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  FileArchive,
  Film,
  ImageIcon,
  Languages,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getEcommerceVideoPresentation } from "@/lib/ecommerce-assets-presentation";
import {
  ECOMMERCE_LANGUAGE_STORAGE_KEY,
  normalizeEcommerceTextLanguage,
} from "@/lib/ecommerce-language";
import type {
  EcommerceAssetsJob,
  EcommerceImageSlot,
  EcommerceProductPhotoSlot,
  EcommerceProductView,
  EcommerceSlotStatus,
  EcommerceTextLanguage,
  KieAspectRatio,
  KieResolution,
} from "@/lib/types";

type PageStatus = "idle" | "reading" | "starting" | "polling" | "done" | "error";
type VideoResolution = "480p" | "720p";
type LocalReferenceImage = { id: string; fileName: string; dataUrl: string };

const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const VIEW_META: Record<EcommerceProductView, { label: string; sub: string }> = {
  front: { label: "正视图", sub: "Front View" },
  side: { label: "侧视图", sub: "Side View" },
  back: { label: "背视图", sub: "Back View" },
};

function initialTextLanguage(): EcommerceTextLanguage {
  if (typeof window === "undefined") return "zh";
  const params = new URLSearchParams(window.location.search);
  return normalizeEcommerceTextLanguage(
    params.get("lang") ?? window.localStorage.getItem(ECOMMERCE_LANGUAGE_STORAGE_KEY)
  );
}

function statusLabel(status: EcommerceSlotStatus) {
  if (status === "success") return "完成";
  if (status === "fail") return "失败";
  if (status === "processing") return "生成中";
  return "等待中";
}

function statusClass(status: EcommerceSlotStatus) {
  if (status === "success") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  if (status === "fail") return "border-red-500/40 bg-red-500/10 text-red-100";
  return "border-amber-500/40 bg-amber-500/10 text-amber-100";
}

function completedCount(slots: Array<{ status: EcommerceSlotStatus }>) {
  return slots.filter((slot) => slot.status === "success" || slot.status === "fail").length;
}

function imageDownloadUrl(url: string, name: string) {
  return `/api/image/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
}

function SlotBadge({ status, label }: { status: EcommerceSlotStatus; label?: string }) {
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded border px-2 text-[11px] font-semibold ${statusClass(status)}`}>
      {status === "processing" ? (
        <Loader2 size={13} aria-hidden="true" className="animate-spin" />
      ) : (
        <BadgeCheck size={13} aria-hidden="true" />
      )}
      {label || statusLabel(status)}
    </span>
  );
}

const ASPECT_CLASS: Record<KieAspectRatio, string> = {
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
  "3:4": "aspect-[3/4]",
  "16:9": "aspect-[16/9]",
  "9:16": "aspect-[9/16]",
  auto: "aspect-square",
};

function AssetCard({ slot, onEdit, aspectRatio }: { slot: EcommerceImageSlot; onEdit?: (slot: EcommerceImageSlot) => void; aspectRatio?: KieAspectRatio }) {
  const aClass = ASPECT_CLASS[aspectRatio ?? "1:1"];
  return (
    <article className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-sm font-semibold text-zinc-100" title={slot.title}>
          {slot.title}
        </h3>
        <SlotBadge status={slot.status} />
      </div>
      {slot.resultUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.resultUrl}
            alt={slot.title}
            className={`${aClass} w-full rounded-md border border-white/10 object-cover transition-[aspect-ratio] duration-500 ease-out`}
            loading="lazy"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={imageDownloadUrl(slot.resultUrl, `${slot.kind}-${slot.index}`)}
              className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/15 text-xs font-semibold text-zinc-100 hover:bg-white/10"
            >
              <Download size={15} aria-hidden="true" />
              下载
            </a>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(slot)}
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/15 text-xs font-semibold text-zinc-100 hover:bg-white/10"
              >
                <Pencil size={15} aria-hidden="true" />
                重新生成
              </button>
            ) : null}
          </div>
        </>
      ) : slot.status === "fail" ? (
        <div className={`flex ${aClass} items-center justify-center rounded-md border border-dashed border-red-500/30 bg-red-500/10 p-4 text-center text-xs leading-5 text-red-100`}>
          {slot.error || "生成失败"}
        </div>
      ) : (
        <div className={`result-wave flex ${aClass} items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-xs text-zinc-400`}>
          <div className="relative z-10 flex flex-col items-center gap-2">
            <ImageIcon size={22} aria-hidden="true" />
            <span>{statusLabel(slot.status)}</span>
          </div>
        </div>
      )}
    </article>
  );
}

function SectionShell({
  title,
  subtitle,
  complete,
  total,
  children,
}: {
  title: string;
  subtitle: string;
  complete: number;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03]">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-zinc-400">
          {complete}/{total}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ProductPhotoSlot({
  view,
  photo,
  isBusy,
  readingView,
  onUpload,
  onRemove,
  inputRef,
}: {
  view: EcommerceProductView;
  photo: EcommerceProductPhotoSlot;
  isBusy: boolean;
  readingView: EcommerceProductView | null;
  onUpload: (view: EcommerceProductView, file: File) => void;
  onRemove: (view: EcommerceProductView) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const meta = VIEW_META[view];
  const isReading = readingView === view;

  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-300">
          {meta.label}
        </span>
        {view === "front" && (
          <span className="rounded bg-lime-300/15 px-1.5 py-0.5 text-[10px] font-semibold text-lime-300">
            白底主图 · 必填
          </span>
        )}
      </div>
      <label className="group relative block cursor-pointer overflow-hidden rounded-md border border-dashed border-white/15 bg-black/20 transition hover:border-lime-300/40">
        {photo.dataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.dataUrl}
              alt={`${meta.label}产品照片`}
              className="aspect-square w-full object-contain"
            />
            {!isBusy ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  onRemove(view);
                }}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                aria-label={`Remove ${meta.label}`}
              >
                <X size={13} aria-hidden="true" />
              </button>
            ) : null}
          </>
        ) : (
          <div className="flex aspect-square flex-col items-center justify-center gap-2 text-zinc-500">
            {isReading ? (
              <Loader2 size={22} aria-hidden="true" className="animate-spin" />
            ) : (
              <Upload size={22} aria-hidden="true" />
            )}
            <span className="text-[11px]">
              {isReading ? "读取中…" : "点击上传"}
            </span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={isBusy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(view, file);
          }}
        />
      </label>
    </div>
  );
}

export default function EcommerceAssetsPage() {
  const [status, setStatus] = useState<PageStatus>("idle");
  const [textLanguage, setTextLanguage] = useState<EcommerceTextLanguage>(initialTextLanguage);
  const [customRequirements, setCustomRequirements] = useState("");
  const [productPhotos, setProductPhotos] = useState<EcommerceProductPhotoSlot[]>([
    { view: "front", dataUrl: null, fileName: null },
    { view: "side", dataUrl: null, fileName: null },
    { view: "back", dataUrl: null, fileName: null },
  ]);
  const [readingView, setReadingView] = useState<EcommerceProductView | null>(null);
  const [imageResolution, setImageResolution] = useState<KieResolution>("1K");
  const [imageAspectRatio, setImageAspectRatio] = useState<KieAspectRatio>("1:1");
  const [videoAspectRatio, setVideoAspectRatio] = useState<KieAspectRatio>("1:1");
  const [videoResolution, setVideoResolution] = useState<VideoResolution>("480p");
  const [job, setJob] = useState<EcommerceAssetsJob | null>(null);
  const jobRef = useRef<EcommerceAssetsJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerateSlot, setRegenerateSlot] = useState<EcommerceImageSlot | null>(null);
  const [refinementText, setRefinementText] = useState("");
  const [regenerateImages, setRegenerateImages] = useState<LocalReferenceImage[]>([]);
  const [regenerateError, setRegenerateError] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const sideInputRef = useRef<HTMLInputElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);

  const inputRefs: Record<EcommerceProductView, React.RefObject<HTMLInputElement | null>> = {
    front: frontInputRef,
    side: sideInputRef,
    back: backInputRef,
  };

  const isBusy = status === "reading" || status === "starting" || status === "polling";
  const videoPresentation = getEcommerceVideoPresentation(job);
  const hasAnyResult = Boolean(
    job?.carouselImages.some((slot) => slot.resultUrl) ||
      job?.detailImages.some((slot) => slot.resultUrl) ||
      job?.video.resultUrl
  );

  const frontPhoto = productPhotos.find((p) => p.view === "front")!;
  const hasFront = Boolean(frontPhoto.dataUrl);
  const uploadedCount = productPhotos.filter((p) => p.dataUrl).length;

  const readImageFile = useCallback(async (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      throw new Error("请上传 PNG、JPG 或 WEBP 产品照片。");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("产品照片不能超过 10MB。");
    }

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("读取图片失败，请重试。"));
      reader.readAsDataURL(file);
    });
  }, []);

  async function handleFile(view: EcommerceProductView, file: File) {
    setReadingView(view);
    setStatus("reading");
    setError(null);
    try {
      const dataUrl = await readImageFile(file);
      setProductPhotos((prev) =>
        prev.map((p) =>
          p.view === view ? { ...p, dataUrl, fileName: file.name } : p
        )
      );
      setJob(null);
      setStatus("idle");
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "图片处理失败。");
      setStatus("error");
    } finally {
      setReadingView(null);
      const ref = inputRefs[view];
      if (ref.current) ref.current.value = "";
    }
  }

  function handleRemove(view: EcommerceProductView) {
    setProductPhotos((prev) =>
      prev.map((p) =>
        p.view === view ? { ...p, dataUrl: null, fileName: null } : p
      )
    );
    setJob(null);
  }

  async function pollJob() {
    const currentJob = jobRef.current;
    if (!currentJob) return;
    const response = await fetch("/api/ecommerce-assets/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job: currentJob }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "查询生成状态失败。");
    setJob(payload.job);
    if (payload.job.status === "completed" || payload.job.status === "failed") {
      setStatus(payload.job.status === "completed" ? "done" : "error");
    }
  }

  async function startGeneration() {
    if (!hasFront) {
      setError("请至少上传正视图产品照片。");
      return;
    }
    setStatus("starting");
    setError(null);
    setJob(null);

    const uploadedUrls = productPhotos
      .filter((p) => p.dataUrl)
      .map((p) => p.dataUrl!);

    try {
      const response = await fetch("/api/ecommerce-assets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productPhotoDataUrls: uploadedUrls,
          customRequirements: customRequirements.trim() || undefined,
          textLanguage,
          imageResolution,
          imageAspectRatio,
          videoAspectRatio,
          videoResolution,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "启动生成失败。");
      setJob(payload.job);
      setStatus("polling");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "启动生成失败。");
      setStatus("error");
    }
  }

  async function downloadZip() {
    if (!job) return;
    const response = await fetch("/api/ecommerce-assets/zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "导出 ZIP 失败。");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ecommerce-assets.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function openRegenerateModal(slot: EcommerceImageSlot) {
    setRegenerateSlot(slot);
    setRefinementText("");
    setRegenerateImages([]);
    setRegenerateError("");
  }

  function readLocalImage(file: File): Promise<LocalReferenceImage> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") { reject(new Error("读取图片失败")); return; }
        resolve({ id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`, fileName: file.name, dataUrl: reader.result });
      };
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(file);
    });
  }

  async function handleRegenerateImageUpload(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (regenerateImages.length + selected.length > 4) { setRegenerateError("最多上传 4 张参考图"); return; }
    const invalid = selected.find((f) => !["image/png", "image/jpeg", "image/webp"].includes(f.type));
    if (invalid) { setRegenerateError("请上传 PNG、JPG 或 WEBP 图片"); return; }
    const oversized = selected.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) { setRegenerateError("每张图片不能超过 10MB"); return; }
    try {
      const imgs = await Promise.all(selected.map(readLocalImage));
      setRegenerateImages((prev) => [...prev, ...imgs].slice(0, 4));
      setRegenerateError("");
    } catch (e) {
      setRegenerateError(e instanceof Error ? e.message : "读取图片失败");
    }
  }

  async function submitRegeneration() {
    if (!regenerateSlot) return;
    if (!refinementText.trim() && regenerateImages.length === 0) return;
    setIsRegenerating(true);
    setRegenerateError("");
    try {
      const res = await fetch("/api/ecommerce-assets/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: regenerateSlot.prompt,
          resultUrl: regenerateSlot.resultUrl,
          refinement: refinementText.trim() || "Use the uploaded reference image(s) as visual guidance for the requested image-to-image edit.",
          localImages: regenerateImages.map((img) => ({ fileName: img.fileName, dataUrl: img.dataUrl })),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "重新生成失败");
      const newTaskId = payload.taskId as string;
      setJob((prev) => {
        if (!prev) return prev;
        const updateSlots = (slots: EcommerceImageSlot[]) =>
          slots.map((s) =>
            s.id === regenerateSlot.id
              ? { ...s, taskId: newTaskId, status: "waiting" as EcommerceSlotStatus, resultUrl: undefined, error: undefined }
              : s
          );
        return { ...prev, carouselImages: updateSlots(prev.carouselImages), detailImages: updateSlots(prev.detailImages) };
      });
      setRegenerateSlot(null);
      if (status !== "polling") setStatus("polling");
    } catch (e) {
      setRegenerateError(e instanceof Error ? e.message : "重新生成失败");
    } finally {
      setIsRegenerating(false);
    }
  }

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  useEffect(() => {
    window.localStorage.setItem(ECOMMERCE_LANGUAGE_STORAGE_KEY, textLanguage);
  }, [textLanguage]);

  useEffect(() => {
    if (status !== "polling" || !job) return;
    const interval = window.setInterval(() => {
      pollJob().catch((pollError) => {
        setError(pollError instanceof Error ? pollError.message : "查询生成状态失败。");
        setStatus("error");
      });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [job, status]);

  return (
    <main className="min-h-screen bg-[#10100f] text-zinc-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-200">
              <ArrowLeft size={14} aria-hidden="true" />
              返回首页
            </Link>
            <p className="font-mono text-2xl font-semibold tracking-tight text-zinc-100">电商图片 + 视频素材一键生成</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              上传产品照片，一键生成轮播图、详情图和广告视频。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!hasAnyResult}
              onClick={() => downloadZip().catch((zipError) => setError(zipError instanceof Error ? zipError.message : "导出 ZIP 失败。"))}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/15 px-3 text-xs font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600"
            >
              <FileArchive size={15} aria-hidden="true" />
              下载 ZIP
            </button>
          </div>
        </header>

        {error ? <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}

        {/* 我的产品 — 横向照片上传区 */}
        <section className="rounded-lg border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">我的产品</h2>
              <p className="mt-1 text-xs text-zinc-500">上传产品照片（正视图必填，侧视图和背视图可选）</p>
            </div>
            <span className="text-xs text-zinc-500">
              {uploadedCount}/3 已上传
            </span>
          </div>
          <div className="p-5">
            <div className="flex flex-col gap-5">
              <div className="flex flex-row gap-4">
                {productPhotos.map((photo) => (
                  <ProductPhotoSlot
                    key={photo.view}
                    view={photo.view}
                    photo={photo}
                    isBusy={isBusy}
                    readingView={readingView}
                    onUpload={handleFile}
                    onRemove={handleRemove}
                    inputRef={inputRefs[photo.view]}
                  />
                ))}
              </div>

              {job?.brief ? (
                <div className="rounded-md border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase text-zinc-500">AI 创意方向</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{job.brief.designLanguage}</p>
                </div>
              ) : null}

              <div className="flex gap-4">
                <textarea
                  value={customRequirements}
                  onChange={(event) => setCustomRequirements(event.target.value)}
                  disabled={isBusy}
                  placeholder="自定义需求（可选）：例如不需要视频里有文字、风格要更简约…"
                  className="flex-[7] self-stretch resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 transition-colors focus:border-white/[0.15] disabled:opacity-50"
                />
                <div className="flex-[3] flex flex-col rounded-lg border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.05]">
                  {/* Language */}
                  <div className="flex flex-col gap-1.5 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Languages size={13} className="text-zinc-500" />
                      <span className="text-[11px] font-medium text-zinc-500">语言</span>
                    </div>
                    <div className="flex gap-0.5 rounded-md bg-white/[0.04] p-0.5">
                      {(["en", "zh"] as const).map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          disabled={isBusy}
                          onClick={() => setTextLanguage(lang)}
                          className={`flex-1 rounded-[5px] py-1 text-[11px] font-medium tracking-wide transition-all duration-200 ${
                            textLanguage === lang
                              ? "bg-white/[0.12] text-zinc-100 shadow-sm shadow-black/20"
                              : "text-zinc-500 hover:text-zinc-300"
                          } disabled:opacity-50`}
                        >
                          {lang === "en" ? "EN" : "中文"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Image config */}
                  <div className="flex flex-col gap-1.5 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Monitor size={13} className="text-zinc-500" />
                      <span className="text-[11px] font-medium text-zinc-500">图片</span>
                    </div>
                    <div className="flex gap-0.5 rounded-md bg-white/[0.04] p-0.5">
                      {(["1:1", "4:3", "3:4", "16:9", "9:16"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          disabled={isBusy}
                          onClick={() => setImageAspectRatio(r)}
                          className={`flex-1 rounded-[5px] py-1 text-[11px] font-medium transition-all duration-200 ${
                            imageAspectRatio === r
                              ? "bg-white/[0.12] text-zinc-100 shadow-sm shadow-black/20"
                              : "text-zinc-500 hover:text-zinc-300"
                          } disabled:opacity-50`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-0.5 rounded-md bg-white/[0.04] p-0.5">
                      {(["1K", "2K", "4K"] as const).map((res) => (
                        <button
                          key={res}
                          type="button"
                          disabled={isBusy || res !== "1K"}
                          onClick={() => setImageResolution(res)}
                          className={`flex-1 rounded-[5px] py-1 text-[11px] font-medium transition-all duration-200 ${
                            imageResolution === res
                              ? "bg-white/[0.12] text-zinc-100 shadow-sm shadow-black/20"
                              : res === "1K"
                                ? "text-zinc-500 hover:text-zinc-300"
                                : "text-zinc-700 cursor-not-allowed"
                          } disabled:opacity-50`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Video config */}
                  <div className="flex flex-col gap-1.5 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Film size={13} className="text-zinc-500" />
                      <span className="text-[11px] font-medium text-zinc-500">视频</span>
                    </div>
                    <div className="flex gap-0.5 rounded-md bg-white/[0.04] p-0.5">
                      {(["1:1", "4:3", "3:4", "16:9", "9:16"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          disabled={isBusy}
                          onClick={() => setVideoAspectRatio(r)}
                          className={`flex-1 rounded-[5px] py-1 text-[11px] font-medium transition-all duration-200 ${
                            videoAspectRatio === r
                              ? "bg-white/[0.12] text-zinc-100 shadow-sm shadow-black/20"
                              : "text-zinc-500 hover:text-zinc-300"
                          } disabled:opacity-50`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-0.5 rounded-md bg-white/[0.04] p-0.5">
                      {(["480p", "720p"] as const).map((res) => (
                        <button
                          key={res}
                          type="button"
                          disabled={isBusy || res !== "480p"}
                          onClick={() => setVideoResolution(res)}
                          className={`flex-1 rounded-[5px] py-1 text-[11px] font-medium transition-all duration-200 ${
                            videoResolution === res
                              ? "bg-white/[0.12] text-zinc-100 shadow-sm shadow-black/20"
                              : res === "480p"
                                ? "text-zinc-500 hover:text-zinc-300"
                                : "text-zinc-700 cursor-not-allowed"
                          } disabled:opacity-50`}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={!hasFront || isBusy}
                onClick={() => startGeneration()}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-lime-300 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {isBusy ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <Sparkles size={16} aria-hidden="true" />}
                一键生成
              </button>
            </div>
          </div>
        </section>

        {/* 生成结果 */}
        <section>
          <h2 className="mb-4 text-base font-semibold text-zinc-100">生成结果</h2>
          <div className="flex flex-col gap-6">
            <SectionShell
              title="轮播图"
              subtitle="展示产品的 6 个核心视角"
              complete={completedCount(job?.carouselImages ?? [])}
              total={6}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {(job?.carouselImages ?? []).length ? (
                  job?.carouselImages.map((slot) => <AssetCard key={slot.id} slot={slot} onEdit={openRegenerateModal} aspectRatio={imageAspectRatio} />)
                ) : (
                  <EmptySlots count={6} label="等待生成" aspectRatio={imageAspectRatio} />
                )}
              </div>
            </SectionShell>

            <SectionShell
              title="详情图"
              subtitle="围绕卖点、场景和信任感的 6 张详情图"
              complete={completedCount(job?.detailImages ?? [])}
              total={6}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {(job?.detailImages ?? []).length ? (
                  job?.detailImages.map((slot) => <AssetCard key={slot.id} slot={slot} onEdit={openRegenerateModal} aspectRatio={imageAspectRatio} />)
                ) : (
                  <EmptySlots count={6} label="等待生成" aspectRatio={imageAspectRatio} />
                )}
              </div>
            </SectionShell>

            <SectionShell title="广告视频" subtitle="产品展示广告短片" complete={job?.video.status === "success" || job?.video.status === "fail" ? 1 : 0} total={1}>
              <div className="grid gap-4 md:grid-cols-[minmax(0,360px)_1fr]">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-100">{videoAspectRatio} 广告短片</h3>
                    <SlotBadge status={videoPresentation.status} label={videoPresentation.badgeLabel} />
                  </div>
                  {job?.video.resultUrl ? (
                    <>
                      <video src={job.video.resultUrl} controls className={`${ASPECT_CLASS[videoAspectRatio]} w-full rounded-md border border-white/10 bg-black object-cover transition-[aspect-ratio] duration-500 ease-out`} />
                      <a
                        href={job.video.resultUrl}
                        download="ecommerce-ad-video.mp4"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 flex h-10 items-center justify-center gap-2 rounded-md border border-white/15 text-xs font-semibold text-zinc-100 hover:bg-white/10"
                      >
                        <Download size={15} aria-hidden="true" />
                        下载视频
                      </a>
                    </>
                  ) : job?.video.status === "fail" ? (
                    <div className={`flex ${ASPECT_CLASS[videoAspectRatio]} items-center justify-center rounded-md border border-dashed border-red-500/30 bg-red-500/10 p-4 text-center text-xs leading-5 text-red-100`}>
                      {job.video.error || "视频生成失败"}
                    </div>
                  ) : (
                    <div
                      className={`flex ${ASPECT_CLASS[videoAspectRatio]} items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-xs text-zinc-400 ${
                        videoPresentation.hasStarted ? "result-wave" : ""
                      }`}
                    >
                      <div className="relative z-10 flex flex-col items-center gap-2">
                        {job?.video.storyboardUrl ? <RefreshCw size={24} aria-hidden="true" /> : <Film size={24} aria-hidden="true" />}
                        <span>{videoPresentation.placeholder}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-semibold uppercase text-zinc-500">生成进度</p>
                  <div className="mt-4 space-y-3 text-sm text-zinc-300">
                    <ProgressLine label="产品分析" active={Boolean(job?.brief)} />
                    <ProgressLine label="创意分镜" active={Boolean(job?.video.storyboardUrl)} />
                    <ProgressLine label="广告视频" active={job?.video.status === "success"} />
                  </div>
                </div>
              </div>
            </SectionShell>
          </div>
        </section>
      </div>

      {regenerateSlot ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/10 bg-[#151514] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-base font-semibold text-zinc-100">重新生成</h2>
              <button
                type="button"
                onClick={() => setRegenerateSlot(null)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
                aria-label="关闭"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="border-b border-white/10 bg-black p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={regenerateSlot.resultUrl}
                alt={regenerateSlot.title}
                className="mx-auto max-h-[280px] rounded-md border border-white/10 object-contain"
              />
            </div>

            <div className="flex flex-col gap-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">参考图片（可选）</label>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/[0.03] text-zinc-500 transition hover:border-white/40 hover:bg-white/[0.06] hover:text-zinc-300 ${
                      isRegenerating || regenerateImages.length >= 4 ? "cursor-not-allowed opacity-50" : ""
                    }`}
                  >
                    <Plus size={18} aria-hidden="true" />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      disabled={isRegenerating || regenerateImages.length >= 4}
                      className="sr-only"
                      onChange={(e) => { handleRegenerateImageUpload(e.target.files); e.currentTarget.value = ""; }}
                    />
                  </label>
                  {regenerateImages.map((img) => (
                    <div key={img.id} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.dataUrl} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setRegenerateImages((prev) => prev.filter((i) => i.id !== img.id))}
                        disabled={isRegenerating}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded bg-black/70 text-zinc-300 opacity-0 transition hover:bg-red-500/80 hover:text-white group-hover:opacity-100"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">修改描述</label>
                <textarea
                  value={refinementText}
                  onChange={(e) => setRefinementText(e.target.value)}
                  rows={3}
                  disabled={isRegenerating}
                  placeholder="描述你想要的修改…"
                  className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 text-sm leading-relaxed text-zinc-100 outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-2 focus:ring-lime-300/40 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {regenerateError ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{regenerateError}</div>
              ) : null}

              <button
                type="button"
                onClick={submitRegeneration}
                disabled={isRegenerating || (!refinementText.trim() && regenerateImages.length === 0)}
                className="flex h-10 items-center justify-center gap-2 rounded-md bg-lime-300 text-sm font-semibold text-zinc-950 hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {isRegenerating ? (
                  <><Loader2 size={16} aria-hidden="true" className="animate-spin" /> 重新生成中…</>
                ) : (
                  <><RefreshCw size={16} aria-hidden="true" /> 重新生成</>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function EmptySlots({ count, label, aspectRatio }: { count: number; label: string; aspectRatio?: KieAspectRatio }) {
  const aClass = ASPECT_CLASS[aspectRatio ?? "1:1"];
  return Array.from({ length: count }, (_, index) => (
    <div
      key={`${label}-${index}`}
      className={`flex ${aClass} items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20 text-xs text-zinc-500`}
    >
      {label}
    </div>
  ));
}

function ProgressLine({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-lime-300" : "bg-zinc-700"}`} />
      <span className={active ? "text-zinc-100" : "text-zinc-500"}>{label}</span>
    </div>
  );
}
