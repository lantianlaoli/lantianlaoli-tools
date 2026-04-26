"use client";

import {
  BadgeCheck,
  Captions,
  ClipboardList,
  Download,
  FileText,
  Gauge,
  Hash,
  ImageIcon,
  Maximize2,
  MessageSquareText,
  Palette,
  PackageSearch,
  RefreshCw,
  Ruler,
  ChevronDown,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { FormEvent } from "react";
import type { GenerationJob, ParsedWorkbook, ParsedWorkbookRow } from "@/lib/types";

type Status = "idle" | "parsing" | "ready" | "starting" | "polling" | "done" | "error";
type UploadProgress = {
  label: string;
  percent: number;
};
type RegenerateModalState = {
  job: GenerationJob;
  resultUrl: string;
};

function allRows(workbook: ParsedWorkbook | null, includeMain: boolean) {
  if (!workbook) return [];
  return [...(includeMain && workbook.mainImageRow ? [workbook.mainImageRow] : []), ...workbook.rows];
}

function StatusBadge({ status }: { status: GenerationJob["status"] }) {
  const color =
    status === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : status === "fail"
        ? "border-red-500/40 bg-red-500/10 text-red-200"
        : "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return (
    <span className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-medium ${color}`}>
      <BadgeCheck size={14} aria-hidden="true" />
      {status}
    </span>
  );
}

function JobDetail({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase text-zinc-500">
        <Icon size={13} aria-hidden="true" />
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-xs text-zinc-200" title={value}>
        {value}
      </div>
    </div>
  );
}

function RowTag({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 font-mono text-xs text-zinc-200">
      <Icon size={13} aria-hidden="true" />
      {children}
    </span>
  );
}

function RowField({
  icon: Icon,
  label,
  value,
  expandable = false,
  expanded = false,
  onToggle,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const content = value || "Not provided";

  if (expandable) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="rounded-md border border-white/10 bg-black/20 p-3 text-left transition hover:border-white/20 hover:bg-white/[0.04]"
      >
        <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Icon size={13} aria-hidden="true" />
            {label}
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
        <p className={`${expanded ? "" : "line-clamp-3"} whitespace-pre-line text-sm leading-6 text-zinc-200`}>
          {content}
        </p>
      </button>
    );
  }

  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-zinc-500">
        <Icon size={13} aria-hidden="true" />
        {label}
      </div>
      <p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-zinc-200">{content}</p>
    </div>
  );
}

function RowPreview({ row }: { row: ParsedWorkbookRow }) {
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({});
  const toggleField = (field: string) => {
    setExpandedFields((current) => ({ ...current, [field]: !current[field] }));
  };

  return (
    <div className="grid gap-4 border-b border-white/10 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_190px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <RowTag icon={FileText}>{row.rowNumber}</RowTag>
          <RowTag icon={Ruler}>{row.size || "auto"}</RowTag>
          <RowTag icon={Maximize2}>{row.aspectRatio}</RowTag>
          <RowTag icon={Gauge}>{row.resolution}</RowTag>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <RowField
            icon={MessageSquareText}
            label="Requirement"
            value={row.requirement}
            expandable
            expanded={Boolean(expandedFields.requirement)}
            onToggle={() => toggleField("requirement")}
          />
          <RowField
            icon={Captions}
            label="Copy"
            value={row.copyText}
            expandable
            expanded={Boolean(expandedFields.copy)}
            onToggle={() => toggleField("copy")}
          />
          <RowField icon={Palette} label="Style" value={row.style} />
        </div>
      </div>
      <div className="flex items-start gap-2 overflow-visible xl:justify-end">
        {row.referenceImages.map((image) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={image.id}
            src={image.dataUrl}
            alt={`Reference image for row ${row.rowNumber}`}
            title="Hover to enlarge"
            className="relative z-10 h-20 w-20 cursor-zoom-in rounded border border-white/10 object-cover transition duration-200 ease-out hover:z-50 hover:scale-[2.6] hover:border-white/30 hover:shadow-2xl hover:shadow-black/60"
          />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [includeMainImageRow, setIncludeMainImageRow] = useState(false);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [error, setError] = useState("");
  const [regenerateModal, setRegenerateModal] = useState<RegenerateModalState | null>(null);
  const [refinement, setRefinement] = useState("");
  const [regenerateError, setRegenerateError] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isProductDescriptionExpanded, setIsProductDescriptionExpanded] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const pollingRef = useRef<number | null>(null);

  const rows = useMemo(() => allRows(workbook, includeMainImageRow), [workbook, includeMainImageRow]);
  const canGenerate = status === "ready" || status === "done" || status === "error";
  const completedCount = jobs.filter((job) => job.status === "success" || job.status === "fail").length;

  async function parseFile(file: File) {
    setStatus("parsing");
    setError("");
    setJobs([]);
    setWorkbook(null);
    setUploadProgress({ label: "Uploading workbook", percent: 8 });

    const payload = await new Promise<ParsedWorkbook>((resolve, reject) => {
      const formData = new FormData();
      formData.set("file", file);
      const request = new XMLHttpRequest();

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          setUploadProgress({ label: "Uploading workbook", percent: 38 });
          return;
        }
        const uploadPercent = Math.round((event.loaded / event.total) * 62);
        setUploadProgress({ label: "Uploading workbook", percent: Math.min(70, Math.max(12, uploadPercent)) });
      };
      request.upload.onload = () => {
        setUploadProgress({ label: "Parsing workbook images", percent: 76 });
      };

      request.onload = () => {
        try {
          const responsePayload = JSON.parse(request.responseText || "{}");
          if (request.status < 200 || request.status >= 300) {
            reject(new Error(responsePayload.error || "Failed to parse workbook."));
            return;
          }
          resolve(responsePayload as ParsedWorkbook);
        } catch {
          reject(new Error("Failed to read parser response."));
        }
      };
      request.onerror = () => reject(new Error("Workbook upload failed."));
      request.onabort = () => reject(new Error("Workbook upload was cancelled."));
      request.onloadend = () => {
        if (request.status >= 200 && request.status < 300) {
          setUploadProgress({ label: "Parsing embedded images", percent: 92 });
        }
      };
      request.open("POST", "/api/workbook/parse");
      request.send(formData);
    });

    setWorkbook(payload);
    setStatus("ready");
    setUploadProgress({ label: "Workbook parsed", percent: 100 });
    window.setTimeout(() => setUploadProgress(null), 900);
  }

  async function startGeneration() {
    if (!workbook) return;
    setStatus("starting");
    setError("");
    const pendingJobs: GenerationJob[] = rows.map((row) => ({
      rowId: row.id,
      rowNumber: row.rowNumber,
      sequence: row.sequence,
      taskId: "",
      status: "processing",
      prompt: "",
      aspectRatio: row.aspectRatio,
      resolution: row.resolution,
      sourceRow: row.source,
    }));
    setJobs(pendingJobs);
    const response = await fetch("/api/generate/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workbook,
        includeMainImageRow,
        rowIds: rows.map((row) => row.id),
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to start generation.");
    setJobs(payload.jobs);
    setStatus("polling");
  }

  async function pollJobs(currentJobs: GenerationJob[]) {
    const nextJobs = await Promise.all(
      currentJobs.map(async (job) => {
        if (!job.taskId || job.status === "success" || job.status === "fail") return job;
        try {
          const response = await fetch(`/api/generate/status?taskId=${encodeURIComponent(job.taskId)}`);
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Status check failed.");
          return {
            ...job,
            status: payload.status,
            resultUrl: payload.resultUrl ?? job.resultUrl,
            error: payload.error ?? job.error,
          } satisfies GenerationJob;
        } catch (pollError) {
          return {
            ...job,
            error: pollError instanceof Error ? pollError.message : "Status check failed.",
          };
        }
      })
    );
    setJobs(nextJobs);
    if (nextJobs.every((job) => job.status === "success" || job.status === "fail")) {
      setStatus("done");
    }
  }

  async function downloadZip() {
    const response = await fetch("/api/export/zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Failed to export zip.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "generated-images.zip";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadSingleImage(job: GenerationJob) {
    if (!job.resultUrl) return;
    const params = new URLSearchParams({
      url: job.resultUrl,
      name: `row-${job.rowNumber}-${job.sequence || job.rowId}`,
    });
    const link = document.createElement("a");
    link.href = `/api/image/download?${params.toString()}`;
    link.download = "";
    link.click();
  }

  function openRegenerateModal(job: GenerationJob) {
    if (!job.resultUrl) return;
    setRegenerateModal({ job, resultUrl: job.resultUrl });
    setRefinement("");
    setRegenerateError("");
  }

  async function submitRegeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!regenerateModal) return;
    setIsRegenerating(true);
    setRegenerateError("");
    try {
      const response = await fetch("/api/generate/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: regenerateModal.job,
          resultUrl: regenerateModal.resultUrl,
          refinement,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to regenerate image.");
      setJobs((currentJobs) =>
        currentJobs.map((job) => (job.rowId === regenerateModal.job.rowId ? payload.job : job))
      );
      setStatus("polling");
      setRegenerateModal(null);
      setRefinement("");
    } catch (regenerateFailure) {
      setRegenerateError(regenerateFailure instanceof Error ? regenerateFailure.message : "Failed to regenerate image.");
    } finally {
      setIsRegenerating(false);
    }
  }

  useEffect(() => {
    if (status !== "polling") return;
    pollingRef.current = window.setInterval(() => pollJobs(jobs), 8000);
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
    };
  }, [jobs, status]);

  return (
    <main className="min-h-screen bg-[#10100f] text-zinc-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">XLSX to GPT Image 2</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Batch product image generator</h1>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200">
            Upload XLSX
            <input
              type="file"
              accept=".xlsx"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                parseFile(file).catch((parseError) => {
                  setError(parseError instanceof Error ? parseError.message : "Failed to parse workbook.");
                  setUploadProgress(null);
                  setStatus("error");
                });
              }}
            />
          </label>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs uppercase text-zinc-500">State</div>
            <div className="mt-2 font-mono text-lg">{status}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs uppercase text-zinc-500">Rows</div>
            <div className="mt-2 font-mono text-lg">{rows.length}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="text-xs uppercase text-zinc-500">Jobs complete</div>
            <div className="mt-2 font-mono text-lg">{jobs.length ? `${completedCount}/${jobs.length}` : "0/0"}</div>
          </div>
        </section>

        {error ? <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}

        {uploadProgress ? (
          <section className="rounded-lg border border-lime-300/30 bg-lime-300/[0.07] p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-lime-100">
                <FileText size={16} aria-hidden="true" />
                {uploadProgress.label}
              </div>
              <div className="font-mono text-xs text-lime-100">{uploadProgress.percent}%</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-lime-300 transition-[width] duration-300 ease-out"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
          </section>
        ) : null}

        {workbook ? (
          <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <aside className="overflow-visible rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-2">
                <PackageSearch size={18} aria-hidden="true" className="text-lime-200" />
                <h2 className="text-lg font-semibold">Product context</h2>
              </div>
              <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-zinc-500">
                  <FileText size={13} aria-hidden="true" />
                  Product title
                </div>
                <p className="text-sm leading-6 text-zinc-200">{workbook.product.title || "Not provided"}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsProductDescriptionExpanded((current) => !current)}
                aria-expanded={isProductDescriptionExpanded}
                className="mt-3 w-full rounded-md border border-white/10 bg-black/20 p-3 text-left transition hover:border-white/20 hover:bg-white/[0.04]"
              >
                <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    <ClipboardList size={13} aria-hidden="true" />
                    Product description
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={`shrink-0 transition-transform duration-200 ${isProductDescriptionExpanded ? "rotate-180" : ""}`}
                  />
                </div>
                <p className={`${isProductDescriptionExpanded ? "" : "line-clamp-6"} whitespace-pre-line text-xs leading-5 text-zinc-400`}>
                  {workbook.product.description || "Not provided"}
                </p>
              </button>
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-zinc-500">
                  <ImageIcon size={13} aria-hidden="true" />
                  Product photos
                </div>
                <div className="flex gap-2 overflow-visible">
                {workbook.product.images.map((image) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={image.id}
                    src={image.dataUrl}
                    alt="Product reference"
                    title="Hover to enlarge"
                    className="relative z-10 h-24 w-24 cursor-zoom-in rounded border border-white/10 object-cover transition duration-200 ease-out hover:z-50 hover:scale-[2.4] hover:border-white/30 hover:shadow-2xl hover:shadow-black/60"
                  />
                ))}
                </div>
              </div>
              <label className="mt-5 flex items-center gap-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={includeMainImageRow}
                  onChange={(event) => setIncludeMainImageRow(event.target.checked)}
                  className="h-4 w-4"
                />
                Include row 2 as main image generation
              </label>
              <button
                type="button"
                disabled={!canGenerate || !rows.length}
                onClick={() =>
                  startGeneration().catch((startError) => {
                    setError(startError instanceof Error ? startError.message : "Failed to start generation.");
                    setJobs((currentJobs) =>
                      currentJobs.map((job) =>
                        job.status === "processing" && !job.taskId
                          ? {
                              ...job,
                              status: "fail",
                              error: startError instanceof Error ? startError.message : "Failed to start generation.",
                            }
                          : job
                      )
                    );
                    setStatus("error");
                  })
                }
                className="mt-5 w-full rounded-md bg-lime-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                Generate all rows
              </button>
              <button
                type="button"
                disabled={!jobs.length}
                onClick={() => downloadZip().catch((zipError) => setError(zipError instanceof Error ? zipError.message : "Failed to export zip."))}
                className="mt-3 w-full rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600"
              >
                Download ZIP
              </button>
              {workbook.warnings.length ? (
                <div className="mt-5 space-y-2 text-xs text-amber-100">
                  {workbook.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              ) : null}
            </aside>

            <div className="overflow-visible rounded-lg border border-white/10 bg-white/[0.03]">
              <div className="border-b border-white/10 px-5 py-3">
                <h2 className="text-sm font-semibold">Parsed workbook rows</h2>
                <p className="mt-1 text-xs text-zinc-500">Review requirement, copy, style, references, and output settings from the uploaded sheet.</p>
              </div>
              {rows.map((row) => <RowPreview key={row.id} row={row} />)}
            </div>
          </section>
        ) : (
          <section className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.03]">
            <div className="max-w-md text-center">
              <h2 className="text-xl font-semibold">Upload the workbook to start</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                The parser reads WPS embedded images, product context, row requirements, reference images, title text, and size targets.
              </p>
            </div>
          </section>
        )}

        {jobs.length ? (
          <section className="overflow-visible rounded-lg border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold">Generation jobs</h2>
                <p className="mt-1 text-xs text-zinc-500">Track output settings, task IDs, and final assets per workbook row.</p>
              </div>
              <div className="hidden rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-zinc-400 md:block">
                {completedCount}/{jobs.length} complete
              </div>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {jobs.map((job) => (
                <article
                  key={job.rowId}
                  className="flex min-h-[460px] flex-col rounded-lg border border-white/10 bg-black/20 p-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-9 items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 font-mono text-sm font-semibold text-white">
                        <FileText size={14} aria-hidden="true" />
                        Row {job.rowNumber}
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <JobDetail label="Quality" value={job.resolution} icon={Gauge} />
                      <JobDetail label="Ratio" value={job.aspectRatio} icon={Maximize2} />
                    </div>
                    <JobDetail label="Task ID" value={job.taskId || "Not created"} icon={Hash} />
                    {job.error ? (
                      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
                        {job.error}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex-1">
                    {job.resultUrl ? (
                      <div className="flex h-full min-h-64 items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={job.resultUrl}
                          alt={`Generated image for row ${job.rowNumber}`}
                          title="Hover to enlarge"
                          className="relative z-10 aspect-square w-full max-w-[360px] cursor-zoom-in rounded-md border border-white/10 object-cover shadow-none transition duration-200 ease-out hover:z-50 hover:scale-[1.45] hover:border-white/30 hover:shadow-2xl hover:shadow-black/60"
                          loading="lazy"
                        />
                      </div>
                    ) : job.status === "fail" ? (
                      <div className="flex aspect-square min-h-64 items-center justify-center rounded-md border border-dashed border-white/10 bg-black/20 text-xs text-zinc-500">
                        No output
                      </div>
                    ) : (
                      <div className="result-wave flex aspect-square min-h-64 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-xs text-zinc-400">
                        <div className="relative z-10 flex flex-col items-center gap-2">
                          <div className="flex h-10 w-24 items-center justify-center rounded-full border border-white/10 bg-black/20">
                            <ImageIcon size={18} aria-hidden="true" />
                          </div>
                          <span>Generating image...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => downloadSingleImage(job)}
                      disabled={!job.resultUrl}
                      className="flex h-11 items-center justify-center gap-2 rounded-md border border-white/15 text-xs font-semibold text-zinc-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-zinc-600"
                    >
                      <Download size={16} aria-hidden="true" />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => openRegenerateModal(job)}
                      disabled={!job.resultUrl}
                      className="flex h-11 items-center justify-center gap-2 rounded-md bg-lime-300 text-xs font-semibold text-zinc-950 hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                    >
                      <RefreshCw size={16} aria-hidden="true" />
                      Regenerate
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      {regenerateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="grid max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg border border-white/10 bg-[#151514] shadow-2xl md:grid-cols-[360px_1fr]">
            <div className="border-b border-white/10 bg-black/20 p-4 md:border-b-0 md:border-r">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={regenerateModal.resultUrl}
                alt=""
                className="aspect-square w-full rounded-md border border-white/10 object-cover"
              />
              <div className="mt-3 font-mono text-xs text-zinc-500">Row {regenerateModal.job.rowNumber}</div>
              <div className="mt-1 text-xs text-zinc-400">
                {regenerateModal.job.aspectRatio} · {regenerateModal.job.resolution}
              </div>
            </div>
            <form onSubmit={submitRegeneration} className="flex min-h-[420px] flex-col p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Regenerate image</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Describe the adjustment you want. The current image will be used as the visual base.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRegenerateModal(null)}
                  className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
              <label className="mt-6 text-sm font-medium text-zinc-200" htmlFor="regenerate-refinement">
                Refinement request
              </label>
              <textarea
                id="regenerate-refinement"
                value={refinement}
                onChange={(event) => setRefinement(event.target.value)}
                rows={8}
                disabled={isRegenerating}
                placeholder="Example: make the background brighter, enlarge the product, and keep only the English headline."
                className="mt-2 min-h-44 resize-none rounded-md border border-white/10 bg-black/30 p-3 text-sm leading-6 text-zinc-100 outline-none ring-lime-300/40 placeholder:text-zinc-600 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
              />
              {regenerateError ? (
                <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                  {regenerateError}
                </div>
              ) : null}
              <div className="mt-auto flex justify-end gap-3 pt-5">
                <button
                  type="button"
                  onClick={() => setRegenerateModal(null)}
                  disabled={isRegenerating}
                  className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRegenerating || !refinement.trim()}
                  className="rounded-md bg-lime-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                >
                  {isRegenerating ? "Starting..." : "Regenerate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
