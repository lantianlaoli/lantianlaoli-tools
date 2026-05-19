"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  FileArchive,
  ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getEcommerceVideoPresentation } from "@/lib/ecommerce-assets-presentation";
import type {
  EcommerceAssetsJob,
  EcommerceImageSlot,
  EcommerceProductPhotoSlot,
  EcommerceProductView,
  EcommerceSlotStatus,
  EcommerceTextLanguage,
  KieResolution,
} from "@/lib/types";

type PageStatus = "idle" | "reading" | "starting" | "polling" | "done" | "error";
type VideoResolution = "480p" | "720p";

const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const VIEW_META: Record<EcommerceProductView, { label: string; sub: string }> = {
  front: { label: "正视图", sub: "Front View" },
  side: { label: "侧视图", sub: "Side View" },
  back: { label: "背视图", sub: "Back View" },
};

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

function AssetCard({ slot }: { slot: EcommerceImageSlot }) {
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
            className="aspect-square w-full rounded-md border border-white/10 object-cover"
            loading="lazy"
          />
          <a
            href={imageDownloadUrl(slot.resultUrl, `${slot.kind}-${slot.index}`)}
            className="mt-3 flex h-10 items-center justify-center gap-2 rounded-md border border-white/15 text-xs font-semibold text-zinc-100 hover:bg-white/10"
          >
            <Download size={15} aria-hidden="true" />
            下载
          </a>
        </>
      ) : slot.status === "fail" ? (
        <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-red-500/30 bg-red-500/10 p-4 text-center text-xs leading-5 text-red-100">
          {slot.error || "生成失败"}
        </div>
      ) : (
        <div className="result-wave flex aspect-square items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-xs text-zinc-400">
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-300">
          {meta.label}
          <span className="ml-1.5 text-[10px] text-zinc-600">{meta.sub}</span>
        </span>
        {view === "front" && (
          <span className="rounded bg-lime-300/15 px-1.5 py-0.5 text-[10px] font-semibold text-lime-300">
            必填
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
  const [textLanguage, setTextLanguage] = useState<EcommerceTextLanguage>("en");
  const [productPhotos, setProductPhotos] = useState<EcommerceProductPhotoSlot[]>([
    { view: "front", dataUrl: null, fileName: null },
    { view: "side", dataUrl: null, fileName: null },
    { view: "back", dataUrl: null, fileName: null },
  ]);
  const [readingView, setReadingView] = useState<EcommerceProductView | null>(null);
  const [imageResolution, setImageResolution] = useState<KieResolution>("1K");
  const [videoResolution, setVideoResolution] = useState<VideoResolution>("480p");
  const [job, setJob] = useState<EcommerceAssetsJob | null>(null);
  const jobRef = useRef<EcommerceAssetsJob | null>(null);
  const [error, setError] = useState<string | null>(null);
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
          textLanguage,
          imageResolution,
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

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

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
              上传产品照片（正视图必填，侧视图和背视图可选），自动生成轮播图、详情图和 1:1 Seedance 2 Fast 广告短片。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!hasAnyResult}
              onClick={() => downloadZip().catch((zipError) => setError(zipError instanceof Error ? zipError.message : "导出 ZIP 失败。"))}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/15 px-4 text-sm font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600"
            >
              <FileArchive size={16} aria-hidden="true" />
              下载全部 ZIP
            </button>
          </div>
        </header>

        {error ? <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}

        <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">产品照片</h2>
              <span className="text-xs text-zinc-500">
                {uploadedCount}/3 已上传
              </span>
            </div>

            <div className="flex flex-col gap-4">
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
              <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase text-zinc-500">AI 创意方向</p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{job.brief.designLanguage}</p>
              </div>
            ) : null}
            <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
              <label className="text-xs font-semibold uppercase text-zinc-500" htmlFor="ecommerce-language">
                语言
              </label>
              <select
                id="ecommerce-language"
                value={textLanguage}
                onChange={(event) => setTextLanguage(event.target.value as EcommerceTextLanguage)}
                disabled={isBusy}
                className="mt-2 h-10 w-full rounded-md border border-white/15 bg-black/30 px-3 text-sm text-zinc-100 outline-none disabled:opacity-50"
              >
                <option value="en">英文</option>
                <option value="zh">中文</option>
              </select>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                控制生成图片、storyboard 和视频提示词的整体语言语境。
              </p>
            </div>
            <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
              <label className="text-xs font-semibold uppercase text-zinc-500" htmlFor="ecommerce-image-resolution">
                图片画质
              </label>
              <select
                id="ecommerce-image-resolution"
                value={imageResolution}
                onChange={(event) => setImageResolution(event.target.value as KieResolution)}
                disabled={isBusy}
                className="mt-2 h-10 w-full rounded-md border border-white/15 bg-black/30 px-3 text-sm text-zinc-100 outline-none disabled:opacity-50"
              >
                <option value="1K">1K（标准）</option>
                <option value="2K" disabled>2K（高级）— 即将开放</option>
                <option value="4K" disabled>4K（超清）— 即将开放</option>
              </select>
            </div>
            <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
              <label className="text-xs font-semibold uppercase text-zinc-500" htmlFor="ecommerce-video-resolution">
                视频画质
              </label>
              <select
                id="ecommerce-video-resolution"
                value={videoResolution}
                onChange={(event) => setVideoResolution(event.target.value as VideoResolution)}
                disabled={isBusy}
                className="mt-2 h-10 w-full rounded-md border border-white/15 bg-black/30 px-3 text-sm text-zinc-100 outline-none disabled:opacity-50"
              >
                <option value="480p">480p（标准）</option>
                <option value="720p" disabled>720p（高清）— 即将开放</option>
              </select>
            </div>
            <button
              type="button"
              disabled={!hasFront || isBusy}
              onClick={() => startGeneration()}
              className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-lime-300 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {isBusy ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <Sparkles size={16} aria-hidden="true" />}
              一键生成
            </button>
          </aside>

          <div className="flex flex-col gap-6">
            <SectionShell
              title="轮播图"
              subtitle="3 张 1:1 图，第一张固定白底主图。"
              complete={completedCount(job?.carouselImages ?? [])}
              total={3}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {(job?.carouselImages ?? []).length ? (
                  job?.carouselImages.map((slot) => <AssetCard key={slot.id} slot={slot} />)
                ) : (
                  <EmptySlots count={3} label="等待生成轮播图" />
                )}
              </div>
            </SectionShell>

            <SectionShell
              title="详情图"
              subtitle="3 张 1:1 图，围绕卖点、细节、场景和信任感。"
              complete={completedCount(job?.detailImages ?? [])}
              total={3}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {(job?.detailImages ?? []).length ? (
                  job?.detailImages.map((slot) => <AssetCard key={slot.id} slot={slot} />)
                ) : (
                  <EmptySlots count={3} label="等待生成详情图" />
                )}
              </div>
            </SectionShell>

            <SectionShell title="广告视频" subtitle="15 秒 720p，Seedance 2 Fast 引用图生成，画幅 1:1。" complete={job?.video.status === "success" || job?.video.status === "fail" ? 1 : 0} total={1}>
              <div className="grid gap-4 md:grid-cols-[minmax(0,360px)_1fr]">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-100">1:1 广告短片</h3>
                    <SlotBadge status={videoPresentation.status} label={videoPresentation.badgeLabel} />
                  </div>
                  {job?.video.resultUrl ? (
                    <>
                      <video src={job.video.resultUrl} controls className="aspect-square w-full rounded-md border border-white/10 bg-black object-cover" />
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
                    <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-red-500/30 bg-red-500/10 p-4 text-center text-xs leading-5 text-red-100">
                      {job.video.error || "视频生成失败"}
                    </div>
                  ) : (
                    <div
                      className={`flex aspect-square items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-xs text-zinc-400 ${
                        videoPresentation.hasStarted ? "result-wave" : ""
                      }`}
                    >
                      <div className="relative z-10 flex flex-col items-center gap-2">
                        {job?.video.storyboardUrl ? <RefreshCw size={24} aria-hidden="true" /> : <Video size={24} aria-hidden="true" />}
                        <span>{videoPresentation.placeholder}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-semibold uppercase text-zinc-500">视频进度</p>
                  <div className="mt-4 space-y-3 text-sm text-zinc-300">
                    <ProgressLine label="产品分析" active={Boolean(job?.brief)} />
                    <ProgressLine label="Storyboard 图" active={Boolean(job?.video.storyboardUrl)} />
                    <ProgressLine label="Seedance 视频" active={job?.video.status === "success"} />
                  </div>
                </div>
              </div>
            </SectionShell>
          </div>
        </section>
      </div>
    </main>
  );
}

function EmptySlots({ count, label }: { count: number; label: string }) {
  return Array.from({ length: count }, (_, index) => (
    <div
      key={`${label}-${index}`}
      className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20 text-xs text-zinc-500"
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
