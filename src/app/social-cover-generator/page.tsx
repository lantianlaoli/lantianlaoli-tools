"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  ImageIcon,
  Languages,
  Loader2,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSocialCoverFileNameMap,
  DEFAULT_SOCIAL_COVER_STYLE_PRESETS,
  readStoredSocialCoverStylePresets,
  SOCIAL_COVER_ASPECT_RATIOS,
  writeStoredSocialCoverStylePresets,
} from "@/lib/social-cover-generator";
import type {
  SocialCoverAspectRatio,
  SocialCoverJob,
  SocialCoverLanguage,
  SocialCoverSlot,
  SocialCoverSlotStatus,
  SocialCoverStylePreset,
} from "@/lib/types";

type PageStatus = "idle" | "reading" | "starting" | "polling" | "done" | "error";
type LocalImage = { fileName: string; dataUrl: string };

const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ASPECT_CLASS: Record<SocialCoverAspectRatio, string> = {
  auto: "aspect-square",
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
  "3:4": "aspect-[3/4]",
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
};
const ASPECT_LABELS: Record<SocialCoverAspectRatio, string> = {
  auto: "Auto",
  "1:1": "1:1",
  "4:3": "4:3",
  "3:4": "3:4",
  "16:9": "16:9",
  "9:16": "9:16",
};

function readImageFile(file: File): Promise<LocalImage> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return Promise.reject(new Error("请上传 PNG、JPG 或 WEBP 图片。"));
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new Error("单张图片不能超过 10MB。"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ fileName: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}

function readStoredPresets() {
  return typeof window === "undefined"
    ? DEFAULT_SOCIAL_COVER_STYLE_PRESETS
    : readStoredSocialCoverStylePresets(window.localStorage);
}

function readInitialPresetState() {
  const presets = readStoredPresets();
  return {
    presets,
    selectedPresetId: presets[0]?.id ?? "",
    presetName: presets[0]?.name ?? "",
    styleGuide: presets[0]?.prompt ?? "",
  };
}

function imageDownloadUrl(url: string, name: string) {
  return `/api/image/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
}

function statusClass(status: SocialCoverSlotStatus) {
  if (status === "success") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  if (status === "fail") return "border-red-500/40 bg-red-500/10 text-red-100";
  return "border-amber-500/40 bg-amber-500/10 text-amber-100";
}

function statusLabel(status: SocialCoverSlotStatus) {
  if (status === "success") return "完成";
  if (status === "fail") return "失败";
  if (status === "processing") return "生成中";
  return "排队中";
}

function SlotBadge({ status }: { status: SocialCoverSlotStatus }) {
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold ${statusClass(status)}`}>
      {status === "processing" || status === "waiting" ? (
        <Loader2 size={13} aria-hidden="true" className="animate-spin" />
      ) : (
        <BadgeCheck size={13} aria-hidden="true" />
      )}
      {statusLabel(status)}
    </span>
  );
}

function UploadBox({
  title,
  subtitle,
  image,
  disabled,
  onUpload,
  onRemove,
}: {
  title: string;
  subtitle: string;
  image: LocalImage | null;
  disabled: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="rounded-lg border border-white/10 bg-[#080b08] p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p>
        </div>
        {image ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-400 transition hover:border-red-300/40 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`移除${title}`}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-lime-300/20 bg-black/25 transition hover:border-lime-300/60 hover:bg-lime-300/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.dataUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-xs font-semibold text-zinc-400">
            <Upload size={22} aria-hidden="true" />
            点击上传
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (file) onUpload(file);
        }}
      />
    </div>
  );
}

function ToggleButton<T extends string>({
  value,
  selected,
  disabled,
  children,
  onToggle,
}: {
  value: T;
  selected: boolean;
  disabled: boolean;
  children: React.ReactNode;
  onToggle: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(value)}
      disabled={disabled}
      className={`h-9 rounded-md border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-lime-300/70 bg-lime-300 text-zinc-950"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/25"
      }`}
    >
      {children}
    </button>
  );
}

function CoverCard({
  fileBaseName,
  slot,
  retryingSlotId,
  onRetry,
  onEdit,
}: {
  fileBaseName: string;
  slot: SocialCoverSlot;
  retryingSlotId: string | null;
  onRetry: (slot: SocialCoverSlot) => void;
  onEdit: (slot: SocialCoverSlot) => void;
}) {
  const isRetrying = retryingSlotId === slot.id;
  return (
    <article className="rounded-lg border border-emerald-300/10 bg-[#090d0b] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-100" title={slot.title}>
            {slot.language === "zh" ? "中文" : "English"} · {slot.aspectRatio} · #{slot.variantIndex}
          </h3>
          <p className="mt-1 truncate text-xs text-zinc-500">{slot.title}</p>
        </div>
        <SlotBadge status={slot.status} />
      </div>
      {slot.resultUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.resultUrl}
            alt={slot.id}
            className={`${ASPECT_CLASS[slot.aspectRatio]} w-full rounded-md border border-white/10 object-cover`}
            loading="lazy"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={imageDownloadUrl(slot.resultUrl, fileBaseName)}
              className="flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300/15 bg-emerald-300/[0.04] text-xs font-semibold text-zinc-100 transition hover:border-emerald-300/35"
            >
              <Download size={15} aria-hidden="true" />
              下载
            </a>
            <button
              type="button"
              onClick={() => onEdit(slot)}
              className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] text-xs font-semibold text-zinc-100 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Pencil size={15} aria-hidden="true" />
              重生成
            </button>
          </div>
        </>
      ) : slot.status === "fail" ? (
        <>
          <div className={`${ASPECT_CLASS[slot.aspectRatio]} flex items-center justify-center rounded-md border border-dashed border-red-500/30 bg-red-500/10 p-4 text-center text-xs leading-5 text-red-100`}>
            {slot.error || "生成失败"}
          </div>
          <button
            type="button"
            onClick={() => onRetry(slot)}
            disabled={isRetrying}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-red-300/20 bg-red-500/[0.08] text-xs font-semibold text-red-50 transition hover:border-red-300/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRetrying ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <RefreshCw size={15} aria-hidden="true" />}
            重新生成
          </button>
        </>
      ) : (
        <div className={`${ASPECT_CLASS[slot.aspectRatio]} result-wave flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-xs text-zinc-400`}>
          <div className="relative z-10 flex flex-col items-center gap-2">
            <ImageIcon size={22} aria-hidden="true" />
            <span>{statusLabel(slot.status)}</span>
          </div>
        </div>
      )}
    </article>
  );
}

export default function SocialCoverGeneratorPage() {
  const [presetBootstrap] = useState(readInitialPresetState);
  const [personImage, setPersonImage] = useState<LocalImage | null>(null);
  const [productImage, setProductImage] = useState<LocalImage | null>(null);
  const [title, setTitle] = useState("");
  const [languages, setLanguages] = useState<SocialCoverLanguage[]>(["zh", "en"]);
  const [aspectRatiosByLanguage, setAspectRatiosByLanguage] = useState<Record<SocialCoverLanguage, SocialCoverAspectRatio[]>>({
    zh: ["4:3", "3:4"],
    en: ["4:3", "3:4"],
  });
  const [presets, setPresets] = useState<SocialCoverStylePreset[]>(presetBootstrap.presets);
  const [selectedPresetId, setSelectedPresetId] = useState(presetBootstrap.selectedPresetId);
  const [presetName, setPresetName] = useState(presetBootstrap.presetName);
  const [styleGuide, setStyleGuide] = useState(presetBootstrap.styleGuide);
  const [job, setJob] = useState<SocialCoverJob | null>(null);
  const [status, setStatus] = useState<PageStatus>("idle");
  const [error, setError] = useState("");
  const [retryingSlotId, setRetryingSlotId] = useState<string | null>(null);
  const [regeneratingSlotId, setRegeneratingSlotId] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [regenerateSlot, setRegenerateSlot] = useState<SocialCoverSlot | null>(null);
  const [refinementText, setRefinementText] = useState("");
  const [regenerateError, setRegenerateError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const isBusy = status === "reading" || status === "starting" || status === "polling";

  useEffect(() => {
    if (typeof window === "undefined") return;
    writeStoredSocialCoverStylePresets(window.localStorage, presets);
  }, [presets]);

  useEffect(() => {
    if (!job || (job.status !== "processing" && job.status !== "preparing")) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/social-cover-generator/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ job }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "刷新状态失败。");
        setJob(payload.job);
        if (payload.job.status === "completed" || payload.job.status === "failed") {
          setStatus(payload.job.status === "completed" ? "done" : "error");
        } else {
          setStatus("polling");
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "刷新状态失败。");
      }
    }, 4500);
    return () => window.clearInterval(timer);
  }, [job]);

  const completed = useMemo(() => job?.slots.filter((slot) => slot.status === "success").length ?? 0, [job]);
  const fileNameMap = useMemo(() => job ? buildSocialCoverFileNameMap(job) : {}, [job]);
  const selectedAspectRatioCount = languages.reduce((count, language) => count + aspectRatiosByLanguage[language].length, 0);
  const total = job?.slots.length ?? selectedAspectRatioCount;

  async function handleImageUpload(kind: "person" | "product", file: File) {
    setStatus("reading");
    setError("");
    try {
      const image = await readImageFile(file);
      if (kind === "person") setPersonImage(image);
      else setProductImage(image);
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "读取图片失败。");
      setStatus("error");
    }
  }

  function toggleLanguage(value: SocialCoverLanguage) {
    setLanguages((current) => {
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      return next.length ? next : current;
    });
  }

  function toggleAspectRatio(language: SocialCoverLanguage, value: SocialCoverAspectRatio) {
    setAspectRatiosByLanguage((current) => {
      const selected = current[language];
      const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
      if (!next.length) return current;
      return { ...current, [language]: SOCIAL_COVER_ASPECT_RATIOS.filter((item) => next.includes(item)) };
    });
  }

  async function startJob() {
    if (!personImage || !productImage || !title.trim()) {
      setError("请上传人物图、产品或Logo图，并填写标题。");
      setStatus("error");
      return;
    }
    setStatus("starting");
    setError("");
    setJob(null);
    try {
      const response = await fetch("/api/social-cover-generator/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personImageDataUrl: personImage.dataUrl,
          productOrLogoImageDataUrl: productImage.dataUrl,
          title,
          styleGuide,
          languages,
          aspectRatiosByLanguage,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "启动生成失败。");
      setJob(payload.job);
      setStatus("polling");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "启动生成失败。");
      setStatus("error");
    }
  }

  function choosePreset(presetId: string) {
    const preset = presets.find((item) => item.id === presetId);
    setSelectedPresetId(presetId);
    if (preset) {
      setPresetName(preset.name);
      setStyleGuide(preset.prompt);
    }
  }

  function savePreset() {
    const name = presetName.trim() || "Custom Style";
    const prompt = styleGuide.trim();
    if (!prompt) return;
    if (selectedPresetId && presets.some((item) => item.id === selectedPresetId)) {
      setPresets((current) => current.map((item) => item.id === selectedPresetId ? { ...item, name, prompt } : item));
      return;
    }
    const preset = { id: `style_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name, prompt };
    setPresets((current) => [...current, preset]);
    setSelectedPresetId(preset.id);
  }

  function deletePreset() {
    if (!selectedPresetId) return;
    const next = presets.filter((item) => item.id !== selectedPresetId);
    const fallback = next.length ? next : DEFAULT_SOCIAL_COVER_STYLE_PRESETS;
    setPresets(fallback);
    setSelectedPresetId(fallback[0]?.id ?? "");
    setPresetName(fallback[0]?.name ?? "");
    setStyleGuide(fallback[0]?.prompt ?? "");
  }

  function openRegenerateModal(slot: SocialCoverSlot) {
    setRegenerateSlot(slot);
    setRefinementText("");
    setRegenerateError("");
  }

  async function retrySlot(slot: SocialCoverSlot) {
    if (!job) return;
    setRetryingSlotId(slot.id);
    setError("");
    try {
      const response = await fetch("/api/social-cover-generator/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, slotId: slot.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "重试失败。");
      setJob({
        ...job,
        status: "processing",
        slots: job.slots.map((item) =>
          item.id === slot.id ? { ...item, taskId: payload.taskId, status: "waiting", resultUrl: undefined, error: undefined } : item
        ),
      });
      setStatus("polling");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "重试失败。");
    } finally {
      setRetryingSlotId(null);
    }
  }

  async function submitRegeneration() {
    if (!job || !regenerateSlot?.resultUrl) return;
    if (!refinementText.trim()) {
      setRegenerateError("请输入修改要求。");
      return;
    }
    setRegeneratingSlotId(regenerateSlot.id);
    setRegenerateError("");
    try {
      const response = await fetch("/api/social-cover-generator/regenerate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          job,
          slotId: regenerateSlot.id,
          resultUrl: regenerateSlot.resultUrl,
          refinement: refinementText.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "改图失败。");
      setJob({
        ...job,
        status: "processing",
        slots: job.slots.map((item) =>
          item.id === regenerateSlot.id
            ? { ...item, taskId: payload.taskId, prompt: payload.prompt || item.prompt, status: "waiting", resultUrl: undefined, error: undefined }
            : item
        ),
      });
      setRegenerateSlot(null);
      setStatus("polling");
    } catch (nextError) {
      setRegenerateError(nextError instanceof Error ? nextError.message : "改图失败。");
    } finally {
      setRegeneratingSlotId(null);
    }
  }

  async function downloadZip() {
    if (!job) return;
    setIsExporting(true);
    setError("");
    try {
      const response = await fetch("/api/social-cover-generator/zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "ZIP 下载失败。");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "social-covers.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ZIP 下载失败。");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#10100f] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 md:px-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 transition hover:text-lime-100">
              <ArrowLeft size={15} aria-hidden="true" />
              Lantian Tools
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-white">社媒中英文封面生成器</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              上传人物和产品/Logo参考图，一次生成中文、英文、横版和竖版封面。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-lime-300/15 bg-lime-300/[0.04] p-2 text-center">
            <div className="px-3 py-2">
              <p className="font-mono text-lg font-semibold text-lime-100">{completed}</p>
              <p className="text-[11px] text-zinc-500">已完成</p>
            </div>
            <div className="px-3 py-2">
              <p className="font-mono text-lg font-semibold text-lime-100">{total}</p>
              <p className="text-[11px] text-zinc-500">总张数</p>
            </div>
            <div className="px-3 py-2">
              <p className="font-mono text-lg font-semibold text-lime-100">1K</p>
              <p className="text-[11px] text-zinc-500">分辨率</p>
            </div>
          </div>
        </header>

        <section className="space-y-4 py-5">
          <section className="rounded-lg border border-white/10 bg-[#070b08] p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(360px,0.9fr)]">
              <UploadBox
                title="人物图"
                subtitle="真实人物、创始人、达人或模特照片。"
                image={personImage}
                disabled={isBusy}
                onUpload={(file) => handleImageUpload("person", file)}
                onRemove={() => setPersonImage(null)}
              />
              <UploadBox
                title="产品 / Logo / 标识"
                subtitle="可以是产品实物、包装、品牌 Logo 或产品标识。"
                image={productImage}
                disabled={isBusy}
                onUpload={(file) => handleImageUpload("product", file)}
                onRemove={() => setProductImage(null)}
              />
              <div className="flex min-h-full flex-col gap-3">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-zinc-100">标题</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="输入中文或英文标题"
                    disabled={isBusy}
                    className="h-11 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-lime-300/60 disabled:opacity-60"
                  />
                </div>
                <div className="min-h-0 flex-1">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                    <Palette size={16} aria-hidden="true" />
                    风格预设
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select
                      value={selectedPresetId}
                      onChange={(event) => choosePreset(event.target.value)}
                      disabled={isBusy}
                      className="h-11 min-w-0 rounded-md border border-white/10 bg-black/25 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300/60 disabled:opacity-60"
                    >
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsConfigOpen(true)}
                      disabled={isBusy}
                      className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-100 transition hover:border-lime-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="打开配置"
                    >
                      <Settings2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                  <input
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="预设名称"
                    disabled={isBusy}
                    className="mt-2 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-xs text-zinc-100 outline-none focus:border-lime-300/60 disabled:opacity-60"
                  />
                  <textarea
                    value={styleGuide}
                    onChange={(event) => setStyleGuide(event.target.value)}
                    placeholder="封面风格指导"
                    disabled={isBusy}
                    rows={4}
                    className="mt-2 w-full resize-none rounded-md border border-white/10 bg-black/25 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-lime-300/60 disabled:opacity-60"
                  />
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={savePreset}
                      disabled={isBusy || !styleGuide.trim()}
                      className="flex h-10 items-center justify-center gap-2 rounded-md border border-lime-300/25 bg-lime-300/[0.08] text-xs font-semibold text-lime-100 transition hover:border-lime-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save size={15} aria-hidden="true" />
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPresetId("");
                        setPresetName("");
                        setStyleGuide("");
                      }}
                      disabled={isBusy}
                      className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] text-xs font-semibold text-zinc-100 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Plus size={15} aria-hidden="true" />
                      新建
                    </button>
                    <button
                      type="button"
                      onClick={deletePreset}
                      disabled={isBusy || !selectedPresetId}
                      className="flex h-10 items-center justify-center gap-2 rounded-md border border-red-300/15 bg-red-500/[0.05] text-xs font-semibold text-red-100 transition hover:border-red-300/35 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      删除
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startJob}
                  disabled={isBusy || !personImage || !productImage || !title.trim()}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-lime-300 text-sm font-semibold text-zinc-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {status === "starting" ? <Loader2 size={17} aria-hidden="true" className="animate-spin" /> : <Sparkles size={17} aria-hidden="true" />}
                  生成封面
                </button>
                {error ? (
                  <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">{error}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-emerald-300/10 bg-[#070b08]">
            <div className="flex flex-col gap-3 border-b border-emerald-300/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">生成结果</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {job?.titleFallback ? "标题双语化使用了兜底版本。" : "生成后会自动轮询状态。"}
                </p>
              </div>
              <button
                type="button"
                onClick={downloadZip}
                disabled={!job || completed === 0 || isExporting}
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300/20 bg-emerald-300/[0.06] px-3 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/45 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExporting ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <Download size={15} aria-hidden="true" />}
                ZIP 下载
              </button>
            </div>
            <div className="p-4">
              {job ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {job.slots.map((slot) => (
                    <CoverCard
                      key={slot.id}
                      fileBaseName={fileNameMap[slot.id] ?? slot.id}
                      slot={slot}
                      retryingSlotId={retryingSlotId}
                      onRetry={retrySlot}
                      onEdit={openRegenerateModal}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20 p-6 text-center">
                  <div className="max-w-sm">
                    <ImageIcon size={32} aria-hidden="true" className="mx-auto mb-3 text-zinc-500" />
                    <p className="text-sm font-semibold text-zinc-200">上传素材后开始生成</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      默认生成中文、英文、4:3 和 3:4 四张封面。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </section>

        {isConfigOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
            <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#080b08] shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">生成配置</h2>
                  <p className="mt-1 text-xs text-zinc-500">每个语言和比例固定生成 1 张，分辨率固定 1K。</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-300 transition hover:border-white/25"
                  aria-label="关闭配置"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-4 p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                    <Languages size={16} aria-hidden="true" />
                    语言
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ToggleButton value="zh" selected={languages.includes("zh")} disabled={isBusy} onToggle={toggleLanguage}>中文</ToggleButton>
                    <ToggleButton value="en" selected={languages.includes("en")} disabled={isBusy} onToggle={toggleLanguage}>English</ToggleButton>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-zinc-100">尺寸</div>
                  {(["zh", "en"] as const).map((language) => (
                    <div key={language} className={`rounded-md border border-white/10 bg-black/20 p-2 ${languages.includes(language) ? "" : "opacity-45"}`}>
                      <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-300">{language === "zh" ? "中文封面" : "English Covers"}</span>
                        <span className="font-mono text-[11px] text-zinc-600">{aspectRatiosByLanguage[language].length} sizes</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {SOCIAL_COVER_ASPECT_RATIOS.map((aspectRatio) => (
                          <ToggleButton
                            key={`${language}-${aspectRatio}`}
                            value={aspectRatio}
                            selected={aspectRatiosByLanguage[language].includes(aspectRatio)}
                            disabled={isBusy || !languages.includes(language)}
                            onToggle={(value) => toggleAspectRatio(language, value)}
                          >
                            {ASPECT_LABELS[aspectRatio]}
                          </ToggleButton>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {regenerateSlot ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
            <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#080b08] shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">重生成封面</h2>
                  <p className="mt-1 text-xs text-zinc-500">{regenerateSlot.language === "zh" ? "中文" : "English"} · {regenerateSlot.aspectRatio}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRegenerateSlot(null)}
                  disabled={regeneratingSlotId === regenerateSlot.id}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-300 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="关闭重生成"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-3 p-4">
                <textarea
                  value={refinementText}
                  onChange={(event) => setRefinementText(event.target.value)}
                  placeholder="输入本次想修改的地方"
                  disabled={regeneratingSlotId === regenerateSlot.id}
                  rows={5}
                  className="w-full resize-none rounded-md border border-white/10 bg-black/25 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-lime-300/60 disabled:opacity-60"
                />
                {regenerateError ? (
                  <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">{regenerateError}</p>
                ) : null}
                <button
                  type="button"
                  onClick={submitRegeneration}
                  disabled={regeneratingSlotId === regenerateSlot.id || !refinementText.trim()}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-lime-300 text-sm font-semibold text-zinc-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {regeneratingSlotId === regenerateSlot.id ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <Sparkles size={16} aria-hidden="true" />}
                  开始重生成
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
