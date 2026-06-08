"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
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
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getEcommerceVideoPresentation } from "@/lib/ecommerce-assets-presentation";
import {
  ECOMMERCE_LANGUAGE_STORAGE_KEY,
  normalizeEcommerceTextLanguage,
  readStoredEcommerceTextLanguage,
} from "@/lib/ecommerce-language";
import {
  addRequirementPhrase,
  appendRequirementPhrase,
  deleteRequirementPhrase,
  parseStoredRequirementPhrases,
  readStoredRequirementPhrases,
  REQUIREMENT_PHRASES_STORAGE_KEY,
  updateRequirementPhrase,
} from "@/lib/ecommerce-requirement-phrases";
import type {
  EcommerceAssetsJob,
  EcommerceAssetScopeOption,
  EcommerceImageSlot,
  EcommerceProductPhotoSlot,
  EcommerceProductView,
  EcommerceSourceMode,
  EcommerceSlotStatus,
  EcommerceTextLanguage,
  KieAspectRatio,
  KieResolution,
} from "@/lib/types";

type PageStatus = "idle" | "reading" | "starting" | "polling" | "done" | "error";
type VideoResolution = "480p" | "720p";
type LocalReferenceImage = { id: string; fileName: string; dataUrl: string };
type ManufacturerPromoImage = { id: string; fileName: string; dataUrl: string };

const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MANUFACTURER_PROMO_LIMIT = 6;
const MANUFACTURER_STYLE_TEMPLATES = [
  "Apple 极简白底黑字风格：白底、大留白、产品全身或细节特写；只保留最重要的信息，文案压缩成一句短句；文字特别大，左右或上下结构，避免参数堆叠。",
  "高级科技品牌风格：深浅对比清晰，产品居中或偏侧，保留核心卖点和关键参数，删除促销感文字、角标和杂乱装饰。",
  "小红书干净种草风格：浅色背景、自然光、产品细节特写，保留一句利益点，文字少但醒目。"
];

const VIEW_META: Record<EcommerceProductView, { label: string; sub: string }> = {
  front: { label: "正视图", sub: "Front View" },
  side: { label: "侧视图", sub: "Side View" },
  back: { label: "背视图", sub: "Back View" },
};

function initialTextLanguage(): EcommerceTextLanguage {
  if (typeof window === "undefined") return "zh";
  const params = new URLSearchParams(window.location.search);
  const paramLanguage = params.get("lang");
  return paramLanguage
    ? normalizeEcommerceTextLanguage(paramLanguage)
    : readStoredEcommerceTextLanguage(window.localStorage);
}

function initialRequirementPhrases() {
  return parseStoredRequirementPhrases(null).phrases;
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

function videoCompletedCount(job: EcommerceAssetsJob | null) {
  return job?.video.status === "success" || job?.video.status === "fail" ? 1 : 0;
}

const ALL_GENERATION_TARGETS: EcommerceAssetScopeOption[] = ["carousel", "detail", "video"];

function jobTargets(job: EcommerceAssetsJob | null) {
  if (!job) return ALL_GENERATION_TARGETS;
  return job.assetScopes?.length ? job.assetScopes : job.assetScope && job.assetScope !== "all" ? [job.assetScope] : ALL_GENERATION_TARGETS;
}

function generationCountLabel(job: EcommerceAssetsJob | null, kind: "carousel" | "detail" | "video") {
  if (!job) return kind === "video" ? "0/1" : "0/6";
  const targets = jobTargets(job);
  if (!targets.includes(kind)) return "未生成";
  if (kind === "carousel") return job.carouselImages.length ? `${completedCount(job.carouselImages)}/${job.carouselImages.length}` : "未生成";
  if (kind === "detail") return job.detailImages.length ? `${completedCount(job.detailImages)}/${job.detailImages.length}` : "未生成";
  return `${videoCompletedCount(job)}/1`;
}

function imageDownloadUrl(url: string, name: string) {
  return `/api/image/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
}

function SlotBadge({ status, label }: { status: EcommerceSlotStatus; label?: string }) {
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold ${statusClass(status)}`}>
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

function AssetCard({
  slot,
  onEdit,
  onRetry,
  isRetrying,
  aspectRatio,
}: {
  slot: EcommerceImageSlot;
  onEdit?: (slot: EcommerceImageSlot) => void;
  onRetry?: (slot: EcommerceImageSlot) => void;
  isRetrying?: boolean;
  aspectRatio?: KieAspectRatio;
}) {
  const aClass = ASPECT_CLASS[aspectRatio ?? "1:1"];
  return (
    <article className="rounded-lg border border-emerald-300/10 bg-[#090d0b] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
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
              className="flex h-11 items-center justify-center gap-2 rounded-md border border-emerald-300/15 bg-emerald-300/[0.03] text-xs font-semibold text-zinc-100 transition hover:border-emerald-300/35 hover:bg-emerald-300/[0.08]"
            >
              <Download size={15} aria-hidden="true" />
              下载
            </a>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(slot)}
                className="flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] text-xs font-semibold text-zinc-100 transition hover:border-white/25 hover:bg-white/[0.07]"
              >
                <Pencil size={15} aria-hidden="true" />
                重新生成
              </button>
            ) : null}
          </div>
        </>
      ) : slot.status === "fail" ? (
        <>
          <div className={`flex ${aClass} items-center justify-center rounded-md border border-dashed border-red-500/30 bg-red-500/10 p-4 text-center text-xs leading-5 text-red-100`}>
            {slot.error || "生成失败"}
          </div>
          {onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(slot)}
              disabled={isRetrying}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-red-300/20 bg-red-500/[0.08] text-xs font-semibold text-red-50 transition hover:border-red-300/40 hover:bg-red-500/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRetrying ? (
                <><Loader2 size={15} aria-hidden="true" className="animate-spin" /> Retrying</>
              ) : (
                <><RefreshCw size={15} aria-hidden="true" /> Retry</>
              )}
            </button>
          ) : null}
        </>
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
    <section className="rounded-lg border border-emerald-300/10 bg-[#070b08]">
      <div className="flex items-center justify-between gap-4 border-b border-emerald-300/10 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>
        </div>
        <div className="rounded-md border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2 font-mono text-xs text-emerald-100">
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
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-100">
          {meta.label}
        </span>
        {view === "front" && (
          <span className="rounded-full border border-lime-300/20 bg-lime-300/10 px-2 py-0.5 text-[11px] font-semibold text-lime-200">
            白底主图 · 必填
          </span>
        )}
      </div>
      <label className="group relative block cursor-pointer overflow-hidden rounded-lg border border-dashed border-emerald-300/20 bg-[#050806] transition hover:border-lime-300/50 hover:bg-lime-300/[0.03]">
        {photo.dataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.dataUrl}
              alt={`${meta.label}产品照片`}
              className="aspect-square w-full bg-black/20 object-contain"
            />
            {!isBusy ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  onRemove(view);
                }}
                className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/75 text-white opacity-0 transition group-hover:opacity-100"
                aria-label={`Remove ${meta.label}`}
              >
                <X size={13} aria-hidden="true" />
              </button>
            ) : null}
          </>
        ) : (
          <div className="flex aspect-square flex-col items-center justify-center gap-3 text-zinc-500">
            {isReading ? (
              <Loader2 size={22} aria-hidden="true" className="animate-spin" />
            ) : (
              <Upload size={22} aria-hidden="true" />
            )}
            <span className="text-sm font-medium">
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

function ManufacturerPromoUploader({
  images,
  isBusy,
  isReading,
  inputRef,
  onUpload,
  onRemove,
  onReplace,
}: {
  images: ManufacturerPromoImage[];
  isBusy: boolean;
  isReading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  onReplace: (id: string, file: File) => void;
}) {
  return (
    <div className="space-y-4">
      <label
        className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-emerald-300/20 bg-[#050806] px-4 py-8 text-center transition hover:border-lime-300/50 hover:bg-lime-300/[0.03] ${
          isBusy || images.length >= MANUFACTURER_PROMO_LIMIT ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        {isReading ? <Loader2 size={24} aria-hidden="true" className="animate-spin text-lime-200" /> : <Upload size={24} aria-hidden="true" className="text-lime-200" />}
        <div>
          <p className="text-sm font-semibold text-zinc-100">批量上传厂家宣传图</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">最多 6 张，支持 PNG/JPG/WEBP，单张不超过 10MB。按上传顺序生成轮播图。</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={isBusy || images.length >= MANUFACTURER_PROMO_LIMIT}
          className="sr-only"
          onChange={(event) => onUpload(event.target.files)}
        />
      </label>

      {images.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image, index) => (
            <div key={image.id} className="group relative overflow-hidden rounded-lg border border-emerald-300/10 bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.dataUrl} alt={`厂家宣传图 ${index + 1}`} className="aspect-square w-full object-contain" />
              <div className="absolute left-2 top-2 rounded-full border border-black/20 bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
                轮播图 {index + 1}
              </div>
              {!isBusy ? (
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/75 text-white transition hover:bg-white/20" title="替换">
                    <RefreshCw size={13} aria-hidden="true" />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onReplace(image.id, file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onRemove(image.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/75 text-white transition hover:bg-red-500/80"
                    aria-label={`删除厂家宣传图 ${index + 1}`}
                    title="删除"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
              <div className="border-t border-white/10 px-3 py-2 text-xs text-zinc-400">
                <p className="truncate" title={image.fileName}>{image.fileName}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SettingsGroup({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-300/10 bg-emerald-300/[0.05] text-emerald-200">
          {icon}
        </span>
        {label}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function segmentedButtonClass(active: boolean, disabled?: boolean) {
  if (active) return "border-lime-300/50 bg-lime-300 text-zinc-950 shadow-[0_0_24px_rgba(190,242,100,0.18)]";
  if (disabled) return "cursor-not-allowed border-transparent text-zinc-700";
  return "border-transparent text-zinc-400 hover:border-emerald-300/20 hover:bg-white/[0.04] hover:text-zinc-100";
}

export default function EcommerceAssetsPage() {
  const [status, setStatus] = useState<PageStatus>("idle");
  const [sourceMode, setSourceMode] = useState<EcommerceSourceMode>("product-photos");
  const [textLanguage, setTextLanguage] = useState<EcommerceTextLanguage>(initialTextLanguage);
  const [customRequirements, setCustomRequirements] = useState("");
  const [requirementPhrases, setRequirementPhrases] = useState<string[]>(initialRequirementPhrases);
  const [requirementPhrasesLoaded, setRequirementPhrasesLoaded] = useState(false);
  const [isAddingPhrase, setIsAddingPhrase] = useState(false);
  const [newPhraseDraft, setNewPhraseDraft] = useState("");
  const [editingPhraseIndex, setEditingPhraseIndex] = useState<number | null>(null);
  const [editingPhraseDraft, setEditingPhraseDraft] = useState("");
  const [productPhotos, setProductPhotos] = useState<EcommerceProductPhotoSlot[]>([
    { view: "front", dataUrl: null, fileName: null },
    { view: "side", dataUrl: null, fileName: null },
    { view: "back", dataUrl: null, fileName: null },
  ]);
  const [readingView, setReadingView] = useState<EcommerceProductView | null>(null);
  const [manufacturerPromos, setManufacturerPromos] = useState<ManufacturerPromoImage[]>([]);
  const [isReadingManufacturerPromos, setIsReadingManufacturerPromos] = useState(false);
  const [imageResolution, setImageResolution] = useState<KieResolution>("1K");
  const [imageAspectRatio, setImageAspectRatio] = useState<KieAspectRatio>("1:1");
  const [videoAspectRatio, setVideoAspectRatio] = useState<KieAspectRatio>("1:1");
  const [videoResolution, setVideoResolution] = useState<VideoResolution>("480p");
  const [generationTargets, setGenerationTargets] = useState<EcommerceAssetScopeOption[]>(ALL_GENERATION_TARGETS);
  const [job, setJob] = useState<EcommerceAssetsJob | null>(null);
  const jobRef = useRef<EcommerceAssetsJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerateSlot, setRegenerateSlot] = useState<EcommerceImageSlot | null>(null);
  const [refinementText, setRefinementText] = useState("");
  const [regenerateImages, setRegenerateImages] = useState<LocalReferenceImage[]>([]);
  const [regenerateError, setRegenerateError] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [retryingSlotId, setRetryingSlotId] = useState<string | null>(null);
  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const sideInputRef = useRef<HTMLInputElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);
  const manufacturerInputRef = useRef<HTMLInputElement | null>(null);

  const inputRefs: Record<EcommerceProductView, React.RefObject<HTMLInputElement | null>> = {
    front: frontInputRef,
    side: sideInputRef,
    back: backInputRef,
  };

  const isBusy = status === "reading" || status === "starting" || status === "polling";
  const activeSourceMode = job?.sourceMode ?? sourceMode;
  const isManufacturerMode = activeSourceMode === "manufacturer-promos";
  const videoPresentation = getEcommerceVideoPresentation(job);
  const hasAnyResult = Boolean(
    job?.carouselImages.some((slot) => slot.resultUrl) ||
      job?.detailImages.some((slot) => slot.resultUrl) ||
      job?.video.resultUrl
  );

  const frontPhoto = productPhotos.find((p) => p.view === "front")!;
  const hasFront = Boolean(frontPhoto.dataUrl);
  const productUploadedCount = productPhotos.filter((p) => p.dataUrl).length;
  const uploadedCount = sourceMode === "manufacturer-promos" ? manufacturerPromos.length : productUploadedCount;
  const canStartGeneration = sourceMode === "manufacturer-promos"
    ? manufacturerPromos.length > 0 && !isBusy
    : hasFront && !isBusy && generationTargets.length > 0;

  const readImageFile = useCallback(async (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      throw new Error("请上传 PNG、JPG 或 WEBP 图片。");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("图片不能超过 10MB。");
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

  function switchSourceMode(nextMode: EcommerceSourceMode) {
    if (isBusy || nextMode === sourceMode) return;
    setSourceMode(nextMode);
    setJob(null);
    setError(null);
    if (nextMode === "manufacturer-promos") {
      setGenerationTargets(["carousel"]);
    } else {
      setManufacturerPromos([]);
      setGenerationTargets(ALL_GENERATION_TARGETS);
    }
  }

  async function handleManufacturerPromoUpload(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (manufacturerPromos.length + selected.length > MANUFACTURER_PROMO_LIMIT) {
      setError(`最多上传 ${MANUFACTURER_PROMO_LIMIT} 张厂家宣传图。`);
      if (manufacturerInputRef.current) manufacturerInputRef.current.value = "";
      return;
    }

    setIsReadingManufacturerPromos(true);
    setStatus("reading");
    setError(null);
    try {
      const images = await Promise.all(selected.map(async (file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        fileName: file.name,
        dataUrl: await readImageFile(file),
      })));
      setManufacturerPromos((prev) => [...prev, ...images]);
      setJob(null);
      setStatus("idle");
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "图片处理失败。");
      setStatus("error");
    } finally {
      setIsReadingManufacturerPromos(false);
      if (manufacturerInputRef.current) manufacturerInputRef.current.value = "";
    }
  }

  function removeManufacturerPromo(id: string) {
    setManufacturerPromos((prev) => prev.filter((image) => image.id !== id));
    setJob(null);
  }

  async function replaceManufacturerPromo(id: string, file: File) {
    setIsReadingManufacturerPromos(true);
    setStatus("reading");
    setError(null);
    try {
      const dataUrl = await readImageFile(file);
      setManufacturerPromos((prev) =>
        prev.map((image) => image.id === id ? { ...image, fileName: file.name, dataUrl } : image)
      );
      setJob(null);
      setStatus("idle");
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "图片处理失败。");
      setStatus("error");
    } finally {
      setIsReadingManufacturerPromos(false);
    }
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
    setError(null);
    setJob(payload.job);
    if (payload.job.status === "completed" || payload.job.status === "failed") {
      setStatus(payload.job.status === "completed" ? "done" : "error");
    }
  }

  function toggleGenerationTarget(target: EcommerceAssetScopeOption) {
    if (isBusy) return;
    setGenerationTargets((current) =>
      current.includes(target) ? current.filter((item) => item !== target) : ALL_GENERATION_TARGETS.filter((item) => item === target || current.includes(item))
    );
  }

  async function startGeneration() {
    if (sourceMode === "manufacturer-promos" && manufacturerPromos.length === 0) {
      setError("请至少上传 1 张厂家宣传图。");
      return;
    }
    if (sourceMode === "product-photos" && !hasFront) {
      setError("请至少上传正视图产品照片。");
      return;
    }
    setStatus("starting");
    setError(null);
    setJob(null);

    const uploadedUrls = productPhotos
      .filter((p) => p.dataUrl)
      .map((p) => p.dataUrl!);
    const manufacturerPromoDataUrls = manufacturerPromos.map((image) => image.dataUrl);

    try {
      const response = await fetch("/api/ecommerce-assets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceMode === "manufacturer-promos"
          ? {
              sourceMode,
              manufacturerPromoDataUrls,
              customRequirements: customRequirements.trim() || undefined,
              textLanguage,
              imageResolution,
              imageAspectRatio,
              assetScopes: ["carousel"],
            }
          : {
              sourceMode,
              productPhotoDataUrls: uploadedUrls,
              customRequirements: customRequirements.trim() || undefined,
              textLanguage,
              imageResolution,
              imageAspectRatio,
              videoAspectRatio,
              videoResolution,
              assetScopes: generationTargets,
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

  function applyRequirementPhrase(phrase: string) {
    if (isBusy) return;
    setCustomRequirements((current) => appendRequirementPhrase(current, phrase));
  }

  function persistNewPhrase() {
    const trimmed = newPhraseDraft.trim();
    if (!trimmed) return;
    setRequirementPhrases((current) => addRequirementPhrase(current, trimmed));
    setNewPhraseDraft("");
    setIsAddingPhrase(false);
  }

  function startEditingPhrase(index: number, phrase: string) {
    if (isBusy) return;
    setIsAddingPhrase(false);
    setNewPhraseDraft("");
    setEditingPhraseIndex(index);
    setEditingPhraseDraft(phrase);
  }

  function persistEditedPhrase() {
    if (editingPhraseIndex === null) return;
    const trimmed = editingPhraseDraft.trim();
    if (!trimmed) return;
    setRequirementPhrases((current) => updateRequirementPhrase(current, editingPhraseIndex, trimmed));
    setEditingPhraseIndex(null);
    setEditingPhraseDraft("");
  }

  function removeRequirementPhrase(index: number) {
    if (isBusy) return;
    setRequirementPhrases((current) => deleteRequirementPhrase(current, index));
    if (editingPhraseIndex === index) {
      setEditingPhraseIndex(null);
      setEditingPhraseDraft("");
    }
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

  async function retryImageSlot(slot: EcommerceImageSlot) {
    if (!job || retryingSlotId) return;
    setRetryingSlotId(slot.id);
    setError(null);
    try {
      const response = await fetch("/api/ecommerce-assets/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, slotId: slot.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Retry failed.");
      const newTaskId = payload.taskId as string;
      setJob((prev) => {
        if (!prev) return prev;
        const updateSlots = (slots: EcommerceImageSlot[]) =>
          slots.map((candidate) =>
            candidate.id === slot.id
              ? { ...candidate, taskId: newTaskId, status: "waiting" as EcommerceSlotStatus, resultUrl: undefined, error: undefined }
              : candidate
          );
        return {
          ...prev,
          status: "processing",
          carouselImages: updateSlots(prev.carouselImages),
          detailImages: updateSlots(prev.detailImages),
          updatedAt: Date.now(),
        };
      });
      if (status !== "polling") setStatus("polling");
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Retry failed.");
    } finally {
      setRetryingSlotId(null);
    }
  }

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  useEffect(() => {
    window.localStorage.setItem(ECOMMERCE_LANGUAGE_STORAGE_KEY, textLanguage);
  }, [textLanguage]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const parsed = readStoredRequirementPhrases(window.localStorage);
      setRequirementPhrases(parsed.phrases);
      setRequirementPhrasesLoaded(true);
      if (parsed.shouldPersist) {
        window.localStorage.setItem(REQUIREMENT_PHRASES_STORAGE_KEY, JSON.stringify(parsed.phrases));
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!requirementPhrasesLoaded) return;
    window.localStorage.setItem(REQUIREMENT_PHRASES_STORAGE_KEY, JSON.stringify(requirementPhrases));
  }, [requirementPhrases, requirementPhrasesLoaded]);

  useEffect(() => {
    if (status !== "polling" || !job) return;
    let cancelled = false;
    let consecutiveErrors = 0;
    const tick = (delay: number) => {
      const handle = window.setTimeout(async () => {
        if (cancelled) return;
        try {
          await pollJob();
          consecutiveErrors = 0;
        } catch (pollError) {
          consecutiveErrors += 1;
          setError(pollError instanceof Error ? pollError.message : "查询生成状态失败。");
          if (consecutiveErrors >= 5) {
            setStatus("error");
            return;
          }
        }
        const currentJob = jobRef.current;
        const allDone = currentJob && (currentJob.status === "completed" || currentJob.status === "failed");
        if (!allDone) tick(consecutiveErrors > 0 ? 5000 : 2000);
      }, delay);
      return handle;
    };
    const handle = tick(0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [job, status]);

  return (
    <main className="min-h-screen bg-[#050705] bg-[linear-gradient(180deg,#09100b_0%,#050705_34%,#050705_100%)] text-zinc-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="rounded-lg border border-emerald-300/10 bg-[#080d0a]/90 px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Link href="/" className="mb-4 inline-flex h-9 items-center gap-2 rounded-md border border-emerald-300/10 bg-white/[0.03] px-3 text-xs font-semibold text-zinc-400 transition hover:border-emerald-300/30 hover:text-zinc-100">
                <ArrowLeft size={14} aria-hidden="true" />
                返回首页
              </Link>
              <p className="text-[11px] font-semibold uppercase text-lime-200">Lantian Tools Commerce Studio</p>
              <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">电商图片 + 视频素材一键生成</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                上传产品照片，设置图片与视频规格，生成轮播图、详情图和广告短片。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 sm:grid-cols-4 md:w-[460px]">
              <div className="rounded-lg border border-emerald-300/10 bg-emerald-300/[0.04] p-3">
                <p className="font-mono text-lg text-lime-200">{uploadedCount}/{sourceMode === "manufacturer-promos" ? MANUFACTURER_PROMO_LIMIT : 3}</p>
                <p className="mt-1">{sourceMode === "manufacturer-promos" ? "厂家图" : "产品照片"}</p>
              </div>
              <div className="rounded-lg border border-emerald-300/10 bg-white/[0.03] p-3">
                <p className="font-mono text-lg text-zinc-100">{generationCountLabel(job, "carousel")}</p>
                <p className="mt-1">轮播图</p>
              </div>
              {!isManufacturerMode ? (
                <>
                  <div className="rounded-lg border border-emerald-300/10 bg-white/[0.03] p-3">
                    <p className="font-mono text-lg text-zinc-100">{generationCountLabel(job, "detail")}</p>
                    <p className="mt-1">详情图</p>
                  </div>
                  <div className="rounded-lg border border-emerald-300/10 bg-white/[0.03] p-3">
                    <p className="font-mono text-lg text-zinc-100">{generationCountLabel(job, "video")}</p>
                    <p className="mt-1">广告视频</p>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}

        <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <div className="min-w-0 rounded-lg border border-emerald-300/10 bg-[#080d0a] p-5">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase text-lime-200">Step 1</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">我的产品</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {sourceMode === "manufacturer-promos" ? "上传厂家宣传图，生成时再解析文字层级并按顺序一图一改。" : "正视图必填，侧视图和背视图用于提高产品一致性。"}
                  </p>
                </div>
                <span className="inline-flex h-8 items-center rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-3 text-xs font-semibold text-emerald-100">
                  {uploadedCount}/{sourceMode === "manufacturer-promos" ? MANUFACTURER_PROMO_LIMIT : 3} 已上传
                </span>
              </div>

              <div className="mb-5 grid grid-cols-2 rounded-lg border border-emerald-300/10 bg-black/20 p-1">
                {[
                  { mode: "product-photos" as const, label: "产品实拍图" },
                  { mode: "manufacturer-promos" as const, label: "厂家宣传图再设计" },
                ].map((item) => (
                  <button
                    key={item.mode}
                    type="button"
                    disabled={isBusy}
                    onClick={() => switchSourceMode(item.mode)}
                    className={`h-10 rounded-md border text-sm font-semibold transition ${segmentedButtonClass(sourceMode === item.mode, isBusy)}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {sourceMode === "manufacturer-promos" ? (
                <ManufacturerPromoUploader
                  images={manufacturerPromos}
                  isBusy={isBusy}
                  isReading={isReadingManufacturerPromos}
                  inputRef={manufacturerInputRef}
                  onUpload={handleManufacturerPromoUpload}
                  onRemove={removeManufacturerPromo}
                  onReplace={replaceManufacturerPromo}
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
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
              )}
            </div>

            <div className="min-w-0 rounded-lg border border-emerald-300/10 bg-[#080d0a] p-5">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase text-lime-200">Step 2</p>
                <h2 className="mt-1 text-lg font-semibold text-white">自定义需求</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {sourceMode === "manufacturer-promos" ? "选择模板后可继续改写，生成时会结合厂家图解析结果执行取舍。" : "点击快捷用语会追加到输入框；详情图文案可保留，轮播图文字可单独约束。"}
                </p>
              </div>

              {sourceMode === "manufacturer-promos" ? (
                <div className="mb-3 rounded-lg border border-lime-300/15 bg-lime-300/[0.04] p-3">
                  <p className="mb-3 text-xs font-semibold text-lime-100">风格模板</p>
                  <div className="flex flex-wrap gap-2">
                    {MANUFACTURER_STYLE_TEMPLATES.map((template) => (
                      <button
                        key={template}
                        type="button"
                        disabled={isBusy}
                        onClick={() => setCustomRequirements((current) => appendRequirementPhrase(current, template))}
                        className="max-w-full rounded-md border border-lime-300/20 bg-black/20 px-3 py-2 text-left text-xs leading-5 text-zinc-200 transition hover:border-lime-300/45 hover:bg-lime-300/[0.08] disabled:cursor-not-allowed disabled:text-zinc-600"
                      >
                        {template}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mb-3 rounded-lg border border-emerald-300/10 bg-[#050806] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-zinc-300">快捷用语</span>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setEditingPhraseIndex(null);
                      setEditingPhraseDraft("");
                      setIsAddingPhrase(true);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-lime-300/25 bg-lime-300/[0.08] px-3 text-xs font-semibold text-lime-100 transition hover:bg-lime-300/[0.14] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-zinc-700"
                    aria-label="新增快捷用语"
                    title="新增"
                  >
                    <Plus size={14} aria-hidden="true" />
                    新增
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {requirementPhrases.length ? (
                    requirementPhrases.map((phrase, index) => {
                      const isEditing = editingPhraseIndex === index;
                      const duplicateEdit = requirementPhrases.some((item, itemIndex) => itemIndex !== index && item === editingPhraseDraft.trim());
                      return (
                        <div
                          key={`${phrase}-${index}`}
                          data-requirement-phrase={phrase}
                          className="group flex max-w-full items-center gap-1 rounded-md border border-emerald-300/10 bg-white/[0.03] p-1"
                        >
                          {isEditing ? (
                            <>
                              <input
                                value={editingPhraseDraft}
                                onChange={(event) => setEditingPhraseDraft(event.target.value)}
                                disabled={isBusy}
                                className="h-9 w-full min-w-0 rounded border border-emerald-300/20 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300/50 disabled:opacity-50 sm:min-w-[260px]"
                                autoFocus
                              />
                              <button
                                type="button"
                                disabled={isBusy || !editingPhraseDraft.trim() || duplicateEdit}
                                onClick={persistEditedPhrase}
                                className="flex h-9 w-9 items-center justify-center rounded text-lime-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-zinc-700"
                                aria-label="保存快捷用语"
                                title="保存"
                              >
                                <Check size={15} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setEditingPhraseIndex(null);
                                  setEditingPhraseDraft("");
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-200 disabled:opacity-50"
                                aria-label="取消编辑快捷用语"
                                title="取消"
                              >
                                <X size={15} aria-hidden="true" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => applyRequirementPhrase(phrase)}
                                className="min-h-9 max-w-[520px] truncate rounded px-3 text-left text-sm text-zinc-200 transition hover:bg-lime-300/[0.08] hover:text-lime-50 disabled:cursor-not-allowed disabled:text-zinc-600"
                                title={phrase}
                              >
                                {phrase}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => startEditingPhrase(index, phrase)}
                                className="flex h-9 w-9 items-center justify-center rounded text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200 disabled:opacity-50"
                                aria-label="编辑快捷用语"
                                title="编辑"
                              >
                                <Pencil size={14} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => removeRequirementPhrase(index)}
                                className="flex h-9 w-9 items-center justify-center rounded text-zinc-500 transition hover:bg-red-500/15 hover:text-red-100 disabled:opacity-50"
                                aria-label="删除快捷用语"
                                title="删除"
                              >
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <span className="flex min-h-9 items-center rounded-md border border-dashed border-white/10 px-3 text-sm text-zinc-600">暂无快捷用语</span>
                  )}
                  {isAddingPhrase ? (
                    <div className="flex items-center gap-1 rounded-md border border-lime-300/20 bg-lime-300/[0.06] p-1">
                      <input
                        value={newPhraseDraft}
                        onChange={(event) => setNewPhraseDraft(event.target.value)}
                        disabled={isBusy}
                        placeholder="新增快捷用语"
                        className="h-9 w-full min-w-0 rounded border border-emerald-300/20 bg-black/30 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-300/50 disabled:opacity-50 sm:min-w-[260px]"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={isBusy || !newPhraseDraft.trim() || requirementPhrases.includes(newPhraseDraft.trim())}
                        onClick={persistNewPhrase}
                        className="flex h-9 w-9 items-center justify-center rounded text-lime-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-zinc-700"
                        aria-label="保存新增快捷用语"
                        title="保存"
                      >
                        <Check size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setIsAddingPhrase(false);
                          setNewPhraseDraft("");
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-200 disabled:opacity-50"
                        aria-label="取消新增快捷用语"
                        title="取消"
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <label className="mb-2 block text-sm font-semibold text-zinc-200" htmlFor="custom-requirements">
                生成要求
              </label>
              <textarea
                id="custom-requirements"
                value={customRequirements}
                onChange={(event) => setCustomRequirements(event.target.value)}
                disabled={isBusy}
                placeholder={sourceMode === "manufacturer-promos" ? "例如 Apple 极简白底黑字风格；只保留主卖点，删除参数堆叠；每张图产品全身或细节特写 + 一句话大字。" : "自定义需求（可选）：例如不需要视频里有文字、风格要更简约…"}
                className="min-h-36 w-full resize-y rounded-lg border border-emerald-300/15 bg-[#050806] px-4 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 transition-colors focus:border-lime-300/45 disabled:opacity-50"
              />
            </div>
          </div>

          <aside className="min-w-0 rounded-lg border border-emerald-300/10 bg-[#080d0a] p-5 lg:sticky lg:top-5 lg:self-start">
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase text-lime-200">Step 3</p>
              <h2 className="mt-1 text-lg font-semibold text-white">生成设置</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {sourceMode === "manufacturer-promos" ? "厂家模式仅生成轮播图；设置语言、图片比例和分辨率。" : "设置语言、图片比例和视频规格。"}
              </p>
            </div>

            <div className="space-y-5">
              <SettingsGroup icon={<Languages size={14} aria-hidden="true" />} label="语言">
                <div className="grid grid-cols-2 gap-2">
                  {(["en", "zh"] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      disabled={isBusy}
                      onClick={() => setTextLanguage(lang)}
                      className={`h-11 rounded-md border text-sm font-semibold transition ${segmentedButtonClass(textLanguage === lang, isBusy)}`}
                    >
                      {lang === "en" ? "EN" : "中文"}
                    </button>
                  ))}
                </div>
              </SettingsGroup>

              <SettingsGroup icon={<Monitor size={14} aria-hidden="true" />} label="图片">
                <div className="grid grid-cols-5 gap-1.5">
                  {(["1:1", "4:3", "3:4", "16:9", "9:16"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={isBusy}
                      onClick={() => setImageAspectRatio(r)}
                      className={`h-10 rounded-md border text-xs font-semibold transition ${segmentedButtonClass(imageAspectRatio === r, isBusy)}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["1K", "2K", "4K"] as const).map((res) => {
                    const disabled = isBusy || res !== "1K";
                    return (
                      <button
                        key={res}
                        type="button"
                        disabled={disabled}
                        onClick={() => setImageResolution(res)}
                        className={`h-10 rounded-md border text-xs font-semibold transition ${segmentedButtonClass(imageResolution === res, disabled)}`}
                      >
                        {res}
                      </button>
                    );
                  })}
                </div>
              </SettingsGroup>

              {sourceMode !== "manufacturer-promos" ? (
                <SettingsGroup icon={<Film size={14} aria-hidden="true" />} label="视频">
                  <div className="grid grid-cols-5 gap-1.5">
                    {(["1:1", "4:3", "3:4", "16:9", "9:16"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={isBusy}
                        onClick={() => setVideoAspectRatio(r)}
                        className={`h-10 rounded-md border text-xs font-semibold transition ${segmentedButtonClass(videoAspectRatio === r, isBusy)}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["480p", "720p"] as const).map((res) => {
                      const disabled = isBusy || res !== "480p";
                      return (
                        <button
                          key={res}
                          type="button"
                          disabled={disabled}
                          onClick={() => setVideoResolution(res)}
                          className={`h-10 rounded-md border text-xs font-semibold transition ${segmentedButtonClass(videoResolution === res, disabled)}`}
                        >
                          {res}
                        </button>
                      );
                    })}
                  </div>
                </SettingsGroup>
              ) : null}
            </div>

            {sourceMode === "manufacturer-promos" ? (
              <div className="mt-5 rounded-lg border border-lime-300/15 bg-lime-300/[0.04] p-3 text-xs leading-5 text-lime-100">
                厂家宣传图再设计模式仅生成轮播图，数量等于上传图片数量。
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-emerald-300/10 bg-black/20 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-zinc-300">生成范围</p>
                  <span className="text-[11px] text-zinc-500">{generationTargets.length ? `已选择 ${generationTargets.length} 项` : "至少开启 1 项"}</span>
                </div>
                <div className="space-y-2">
                  {[
                    { scope: "carousel" as const, label: "轮播图" },
                    { scope: "detail" as const, label: "详情图" },
                    { scope: "video" as const, label: "视频" },
                  ].map((item) => {
                    const active = generationTargets.includes(item.scope);
                    return (
                      <button
                        key={item.scope}
                        type="button"
                        role="switch"
                        aria-checked={active}
                        disabled={isBusy}
                        onClick={() => toggleGenerationTarget(item.scope)}
                        className="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm font-semibold text-zinc-100 transition hover:border-emerald-300/25 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span>{item.label}</span>
                        <span className={`flex h-6 w-11 items-center rounded-full p-0.5 transition ${active ? "bg-lime-300" : "bg-zinc-700"}`}>
                          <span className={`h-5 w-5 rounded-full bg-zinc-950 shadow transition ${active ? "translate-x-5" : "translate-x-0"}`} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!canStartGeneration}
              onClick={() => startGeneration()}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-lime-300 text-sm font-semibold text-zinc-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {isBusy ? <Loader2 size={17} aria-hidden="true" className="animate-spin" /> : <Sparkles size={17} aria-hidden="true" />}
              一键生成
            </button>

            <button
              type="button"
              disabled={!hasAnyResult}
              onClick={() => downloadZip().catch((zipError) => setError(zipError instanceof Error ? zipError.message : "导出 ZIP 失败。"))}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-300/15 bg-white/[0.03] text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:text-zinc-700"
            >
              <FileArchive size={16} aria-hidden="true" />
              下载 ZIP
            </button>
          </aside>
        </section>

        {/* 生成结果 */}
        <section>
          <h2 className="mb-4 text-base font-semibold text-zinc-100">生成结果</h2>
          <div className="flex flex-col gap-6">
            <SectionShell
              title="轮播图"
              subtitle={isManufacturerMode ? "按厂家宣传图上传顺序生成的一图一改轮播图" : "展示产品的 6 个核心视角"}
              complete={completedCount(job?.carouselImages ?? [])}
              total={job?.carouselImages.length || (sourceMode === "manufacturer-promos" ? manufacturerPromos.length || MANUFACTURER_PROMO_LIMIT : 6)}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {(job?.carouselImages ?? []).length ? (
                  job?.carouselImages.map((slot) => (
                    <AssetCard
                      key={slot.id}
                      slot={slot}
                      onEdit={openRegenerateModal}
                      onRetry={retryImageSlot}
                      isRetrying={retryingSlotId === slot.id}
                      aspectRatio={imageAspectRatio}
                    />
                  ))
                ) : (
                  <EmptySlots
                    count={sourceMode === "manufacturer-promos" ? manufacturerPromos.length || MANUFACTURER_PROMO_LIMIT : 6}
                    label={job ? "本次未生成" : "等待生成"}
                    aspectRatio={imageAspectRatio}
                  />
                )}
              </div>
            </SectionShell>

            {!isManufacturerMode ? (
              <SectionShell
                title="详情图"
                subtitle="围绕卖点、场景和信任感的 6 张详情图"
                complete={completedCount(job?.detailImages ?? [])}
                total={job?.detailImages.length || 6}
              >
                <div className="grid gap-4 md:grid-cols-3">
                  {(job?.detailImages ?? []).length ? (
                    job?.detailImages.map((slot) => (
                      <AssetCard
                        key={slot.id}
                        slot={slot}
                        onEdit={openRegenerateModal}
                        onRetry={retryImageSlot}
                        isRetrying={retryingSlotId === slot.id}
                        aspectRatio={imageAspectRatio}
                      />
                    ))
                  ) : (
                    <EmptySlots count={6} label={job ? "本次未生成" : "等待生成"} aspectRatio={imageAspectRatio} />
                  )}
                </div>
              </SectionShell>
            ) : null}

            {!isManufacturerMode ? (
              <SectionShell title="广告视频" subtitle="产品展示广告短片" complete={videoCompletedCount(job)} total={job && !jobTargets(job).includes("video") ? 0 : 1}>
                <div className="grid gap-4 md:grid-cols-[minmax(0,360px)_1fr]">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-zinc-100">{videoAspectRatio} 广告短片</h3>
                      <SlotBadge status={videoPresentation.status} label={videoPresentation.badgeLabel} />
                    </div>
                    {job && !jobTargets(job).includes("video") ? (
                      <div className={`flex ${ASPECT_CLASS[videoAspectRatio]} items-center justify-center rounded-md border border-dashed border-white/10 bg-white/[0.03] p-4 text-center text-xs leading-5 text-zinc-500`}>
                        本次未生成
                      </div>
                    ) : job?.video.resultUrl ? (
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
            ) : null}
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
