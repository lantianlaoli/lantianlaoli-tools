"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Download,
  ImageIcon,
  Languages,
  Loader2,
  MapPin,
  MessageCircle,
  RefreshCw,
  Search,
  Sparkles,
  ThumbsUp,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ExpoHunterExpoResult,
  ExpoHunterSlotStatus,
  ShenzhenExpoHunterJob,
  ShenzhenExpoHunterSearchSettings,
} from "@/lib/types";

type PageStatus = "idle" | "uploading" | "parsed" | "running" | "error";
type Locale = "zh" | "en";

const OCR_IMAGE_MAX_EDGE = 2200;
const OCR_IMAGE_QUALITY = 0.82;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const DEFAULT_SETTINGS: ShenzhenExpoHunterSearchSettings = {
  maxSubreddits: 5,
  maxPosts: 30,
  depth: "precise",
};

const I18N = {
  zh: {
    appTitle: "深圳展会猎手",
    backHome: "返回首页",
    newScreenshot: "新截图",
    uploadBusyTitle: "正在用 AI 解析日程截图",
    uploadTitle: "上传展会日程截图",
    uploadDescription: "AI 会识别截图中的每一个展会，并提取展会名称、日期和地点。",
    uploadHint: "PNG / JPEG / WebP，最大 10 MB",
    imagePreviewAlt: "日程截图预览",
    parseFailed: "截图解析失败。",
    redditFailed: "Reddit 信息整理失败。",
    networkError: "网络错误。",
    invalidImageType: "请选择 PNG、JPEG 或 WebP 图片。",
    imageTooLarge: "图片需要小于 10 MB。",
    imageProcessFailed: "图片处理失败，请换一张截图重试。",
    noSelection: "选择一个展会查看详情。",
    aiRunning: "AI 正在整理",
    retryReddit: "重新整理 Reddit 信息",
    runReddit: "AI 整理 Reddit 信息",
    waitingDescription: "点击按钮后，AI 会查询过去 6 个月内的 Reddit 相关讨论，并按 subreddit 分类整理。",
    processingDescription: "正在整理 Reddit 信息。",
    noDiscussions: "这个展会暂时没有匹配到过去 6 个月内的 Reddit 讨论。",
    discussionComment: "评论",
    discussionPost: "帖子",
    detectedCount: (count: number) => `AI 识别到 ${count} 个展会`,
    closeError: "关闭错误提示",
    localeToggle: "Switch to English",
    exportMarkdown: "MD",
    exportJson: "JSON",
    status: {
      success: "已整理",
      fail: "失败",
      processing: "整理中",
      waiting: "待整理",
    },
    time: {
      seconds: (value: number) => `${value} 秒前`,
      minutes: (value: number) => `${value} 分钟前`,
      hours: (value: number) => `${value} 小时前`,
      days: (value: number) => `${value} 天前`,
      months: (value: number) => `${value} 个月前`,
    },
  },
  en: {
    appTitle: "Shenzhen Expo Hunter",
    backHome: "Back home",
    newScreenshot: "New screenshot",
    uploadBusyTitle: "AI is parsing the schedule screenshot",
    uploadTitle: "Upload an expo schedule screenshot",
    uploadDescription: "AI will detect each expo in the screenshot and extract its name, dates, and venue.",
    uploadHint: "PNG / JPEG / WebP, up to 10 MB",
    imagePreviewAlt: "Schedule screenshot preview",
    parseFailed: "Could not parse the screenshot.",
    redditFailed: "Reddit research failed.",
    networkError: "Network error.",
    invalidImageType: "Choose a PNG, JPEG, or WebP image.",
    imageTooLarge: "Image must be under 10 MB.",
    imageProcessFailed: "Image processing failed. Try another screenshot.",
    noSelection: "Select an expo to view details.",
    aiRunning: "AI is researching",
    retryReddit: "Research Reddit again",
    runReddit: "AI research Reddit",
    waitingDescription: "After you click the button, AI will search Reddit discussions from the past 6 months and group them by subreddit.",
    processingDescription: "Researching Reddit information.",
    noDiscussions: "No matching Reddit discussions from the past 6 months were found for this expo.",
    discussionComment: "Comment",
    discussionPost: "Post",
    detectedCount: (count: number) => `AI detected ${count} expo${count === 1 ? "" : "s"}`,
    closeError: "Dismiss error",
    localeToggle: "切换到中文",
    exportMarkdown: "MD",
    exportJson: "JSON",
    status: {
      success: "Done",
      fail: "Failed",
      processing: "Running",
      waiting: "Waiting",
    },
    time: {
      seconds: (value: number) => `${value}s ago`,
      minutes: (value: number) => `${value}m ago`,
      hours: (value: number) => `${value}h ago`,
      days: (value: number) => `${value}d ago`,
      months: (value: number) => `${value}mo ago`,
    },
  },
} as const;

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  const stored = window.localStorage.getItem("shenzhen-expo-hunter-locale");
  if (stored === "zh" || stored === "en") return stored;
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function slotStatusLabel(status: ExpoHunterSlotStatus, locale: Locale) {
  const labels = I18N[locale].status;
  if (status === "success") return labels.success;
  if (status === "fail") return labels.fail;
  if (status === "processing") return labels.processing;
  return labels.waiting;
}

function slotStatusClass(status: ExpoHunterSlotStatus) {
  if (status === "success") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-100";
  if (status === "fail") return "border-red-500/35 bg-red-500/10 text-red-100";
  if (status === "processing") return "border-amber-500/35 bg-amber-500/10 text-amber-100";
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function timeAgo(ts: number, locale: Locale): string {
  const time = I18N[locale].time;
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return time.seconds(secs);
  if (secs < 3600) return time.minutes(Math.floor(secs / 60));
  if (secs < 86400) return time.hours(Math.floor(secs / 3600));
  if (secs < 2592000) return time.days(Math.floor(secs / 86400));
  return time.months(Math.floor(secs / 2592000));
}

async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();

    const scale = Math.min(
      1,
      OCR_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", OCR_IMAGE_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ExpanderToggle({
  open,
  onToggle,
  label,
  count,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between py-2 text-left text-sm font-medium text-zinc-300 transition hover:text-zinc-100"
    >
      <span>
        {label} ({count})
      </span>
      <span className="text-xs text-zinc-500">{open ? "▲" : "▼"}</span>
    </button>
  );
}

export default function ShenzhenExpoHunterPage() {
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());
  const [job, setJob] = useState<ShenzhenExpoHunterJob | null>(null);
  const [selectedExpoId, setSelectedExpoId] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, string | null>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const t = I18N[locale];
  const isBusy = pageStatus === "uploading" || pageStatus === "running";
  const selectedResult = useMemo(
    () => job?.results.find((result) => result.expo.id === selectedExpoId) ?? null,
    [job, selectedExpoId],
  );
  const hasRunnableResults = job?.results.some((result) => result.status === "success") ?? false;

  useEffect(() => {
    window.localStorage.setItem("shenzhen-expo-hunter-locale", locale);
  }, [locale]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const createJobFromImage = useCallback(async (imageDataUrl: string) => {
    setError(null);
    setPageStatus("uploading");

    try {
      const response = await fetch("/api/shenzhen-expo-hunter/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, settings: DEFAULT_SETTINGS }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || t.parseFailed);
        setPageStatus("error");
        return;
      }

      setJob(payload.job);
      setSelectedExpoId(payload.job.results[0]?.expo.id ?? null);
      setPageStatus("parsed");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.networkError);
      setPageStatus("error");
    }
  }, [t.networkError, t.parseFailed]);

  const handleFileSelect = async (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError(t.invalidImageType);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t.imageTooLarge);
      return;
    }

    setError(null);
    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return previewUrl;
    });

    try {
      const compressed = await compressImage(file);
      await createJobFromImage(compressed);
    } catch {
      setError(t.imageProcessFailed);
      setPageStatus("error");
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setUploadDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !isBusy) void handleFileSelect(file);
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && !isBusy) void handleFileSelect(file);
    event.target.value = "";
  };

  const runSelectedExpo = async () => {
    if (!job || !selectedResult) return;

    setError(null);
    setPageStatus("running");
    setJob((current) => {
      if (!current) return current;
      return {
        ...current,
        status: "processing",
        results: current.results.map((result) =>
          result.expo.id === selectedResult.expo.id
            ? { ...result, status: "processing", error: undefined }
            : result,
        ),
      };
    });

    try {
      const response = await fetch("/api/shenzhen-expo-hunter/run-expo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          expoId: selectedResult.expo.id,
          settings: DEFAULT_SETTINGS,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || t.redditFailed);
        setPageStatus("error");
        return;
      }

      setJob(payload.job);
      setPageStatus("parsed");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.networkError);
      setPageStatus("error");
    }
  };

  const handleExport = async (format: "markdown" | "json") => {
    if (!job) return;

    try {
      const response = await fetch("/api/shenzhen-expo-hunter/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, format }),
      });
      if (!response.ok) return;

      const blob = await response.blob();
      const ext = format === "json" ? "json" : "md";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `expo-hunter-${job.id}.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      // Export is optional; keep the current analysis visible if download fails.
    }
  };

  const resetFlow = () => {
    setJob(null);
    setSelectedExpoId(null);
    setPageStatus("idle");
    setError(null);
    setOpenSections({});
    setImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const toggleSection = (expoId: string, section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [expoId]: prev[expoId] === section ? null : section,
    }));
  };

  function renderUploadPanel() {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!isBusy) setUploadDragOver(true);
          }}
          onDragLeave={() => setUploadDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !isBusy && fileInputRef.current?.click()}
          className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-8 py-16 transition ${
            uploadDragOver
              ? "border-lime-300/70 bg-lime-300/[0.06]"
              : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]"
          } ${isBusy ? "pointer-events-none opacity-70" : ""}`}
        >
          {isBusy ? (
            <Loader2 size={34} className="mb-5 animate-spin text-lime-300" />
          ) : (
            <Upload size={34} className="mb-5 text-zinc-500" />
          )}
          <h2 className="text-xl font-semibold text-white">
            {isBusy ? t.uploadBusyTitle : t.uploadTitle}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-500">
            {t.uploadDescription}
          </p>
          <p className="mt-5 text-xs text-zinc-600">{t.uploadHint}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>

        {imagePreviewUrl && (
          <div className="mt-5 w-full overflow-hidden rounded-lg border border-white/10 bg-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreviewUrl} alt={t.imagePreviewAlt} className="max-h-72 w-full object-contain" />
          </div>
        )}
      </section>
    );
  }

  function renderExpoCard(result: ExpoHunterExpoResult) {
    const active = result.expo.id === selectedExpoId;

    return (
      <button
        type="button"
        onClick={() => setSelectedExpoId(result.expo.id)}
        className={`w-full rounded-lg border p-4 text-left transition ${
          active
            ? "border-lime-300/50 bg-lime-300/[0.07]"
            : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.045]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-base font-semibold leading-snug text-white">{result.expo.name}</h3>
          <span
            className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold ${slotStatusClass(result.status)}`}
          >
            {result.status === "processing" && <Loader2 size={10} className="animate-spin" />}
            {slotStatusLabel(result.status, locale)}
          </span>
        </div>
        <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
          {result.expo.date && (
            <p className="flex items-center gap-1.5">
              <CalendarDays size={12} />
              {result.expo.date}
            </p>
          )}
          {result.expo.location && (
            <p className="flex items-center gap-1.5">
              <MapPin size={12} />
              {result.expo.location}
            </p>
          )}
        </div>
      </button>
    );
  }

  function renderRedditResults(result: ExpoHunterExpoResult) {
    const openSection = openSections[result.expo.id] || null;
    const discussionGroups = result.discussionsBySubreddit ?? [];

    if (
      result.status === "success" &&
      discussionGroups.length === 0
    ) {
      return (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
          {t.noDiscussions}
        </div>
      );
    }

    return (
      <div className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.025]">
        {discussionGroups.map((group) => {
          const sectionId = `discussion:${group.subreddit}`;
          return (
            <div key={group.subreddit}>
              <div className="px-4">
                <ExpanderToggle
                  open={openSection === sectionId}
                  onToggle={() => toggleSection(result.expo.id, sectionId)}
                  label={group.subreddit}
                  count={group.discussions.length}
                />
              </div>
              {openSection === sectionId && (
                <div className="space-y-2 px-4 pb-3">
                  {group.discussions.map((discussion, index) => (
                    <div key={discussion.permalink || index} className="rounded border border-lime-300/10 bg-lime-300/[0.025] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <a
                          href={discussion.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-lime-200 transition hover:text-lime-100"
                        >
                          {discussion.title}
                          <ArrowUpRight size={11} className="ml-1 inline -translate-y-0.5 text-zinc-600" />
                        </a>
                        <span className="shrink-0 rounded bg-lime-300/15 px-1.5 py-0.5 text-[10px] font-semibold text-lime-100">
                          {(discussion.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      {discussion.selftext && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-400">{discussion.selftext}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                        <span className="rounded border border-white/10 px-1.5 py-0.5 text-zinc-400">
                          {discussion.sourceType === "comment" ? t.discussionComment : t.discussionPost}
                        </span>
                        <span>u/{discussion.author}</span>
                        <span className="flex items-center gap-0.5">
                          <ThumbsUp size={10} />
                          {discussion.score}
                        </span>
                        {discussion.sourceType !== "comment" && (
                          <span className="flex items-center gap-0.5">
                            <MessageCircle size={10} />
                            {discussion.numComments}
                          </span>
                        )}
                        <span>{timeAgo(discussion.createdUtc * 1000, locale)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDetailPanel() {
    if (!selectedResult) {
      return (
        <section className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.015] p-8 text-center text-sm text-zinc-500">
          {t.noSelection}
        </section>
      );
    }

    const result = selectedResult;
    const canRun = !isBusy && result.status !== "processing";

    return (
      <section className="rounded-lg border border-white/10 bg-white/[0.025] p-5">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold leading-tight text-white">{result.expo.name}</h2>
              <span className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold ${slotStatusClass(result.status)}`}>
                {result.status === "processing" && <Loader2 size={10} className="animate-spin" />}
                {slotStatusLabel(result.status, locale)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-500">
              {result.expo.date && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={14} />
                  {result.expo.date}
                </span>
              )}
              {result.expo.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} />
                  {result.expo.location}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={!canRun}
            onClick={() => void runSelectedExpo()}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-lime-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {result.status === "processing" || pageStatus === "running" ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {t.aiRunning}
              </>
            ) : result.status === "fail" ? (
              <>
                <RefreshCw size={15} />
                {t.retryReddit}
              </>
            ) : (
              <>
                <Sparkles size={15} />
                {t.runReddit}
              </>
            )}
          </button>
        </div>

        {result.error && (
          <div className="mt-4 rounded border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {result.error}
          </div>
        )}

        <div className="mt-5">
          {result.status === "waiting" ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center">
              <Search size={28} className="mx-auto mb-3 text-zinc-600" />
              <p className="text-sm text-zinc-500">{t.waitingDescription}</p>
            </div>
          ) : result.status === "processing" ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-4 py-10 text-center">
              <Loader2 size={28} className="mx-auto mb-3 animate-spin text-amber-200" />
              <p className="text-sm text-amber-100">{t.processingDescription}</p>
            </div>
          ) : (
            renderRedditResults(result)
          )}
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-[#10100f] text-zinc-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-5 md:px-6">
        <header className="flex items-center justify-between border-b border-white/10 pb-4">
          <Link href="/" className="flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-300">
            <ArrowLeft size={16} />
            {t.backHome}
          </Link>
          <h1 className="text-lg font-semibold text-white">{t.appTitle}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocale((current) => (current === "zh" ? "en" : "zh"))}
              className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08]"
              aria-label={t.localeToggle}
              title={t.localeToggle}
            >
              <Languages size={13} />
              {locale === "zh" ? "EN" : "中文"}
            </button>
            {job && (
              <button
                type="button"
                onClick={resetFlow}
                disabled={isBusy}
                className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ImageIcon size={13} />
                {t.newScreenshot}
              </button>
            )}
            {job && hasRunnableResults && (
              <>
                <button
                  type="button"
                  onClick={() => void handleExport("markdown")}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08]"
                >
                  <Download size={13} />
                  {t.exportMarkdown}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport("json")}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08]"
                >
                  <Download size={13} />
                  {t.exportJson}
                </button>
              </>
            )}
          </div>
        </header>

        {error && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-3 text-red-300 underline transition hover:text-red-200"
              aria-label={t.closeError}
            >
              <X size={14} className="inline" />
            </button>
          </div>
        )}

        {!job ? (
          renderUploadPanel()
        ) : (
          <div className="grid gap-5 py-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="space-y-3 lg:sticky lg:top-5 lg:self-start">
              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                <p className="mb-3 px-1 text-xs font-semibold text-zinc-500">{t.detectedCount(job.results.length)}</p>
                <div className="space-y-2">
                  {job.results.map((result) => (
                    <div key={result.expo.id}>{renderExpoCard(result)}</div>
                  ))}
                </div>
              </div>
            </aside>
            {renderDetailPanel()}
          </div>
        )}
      </div>
    </main>
  );
}
