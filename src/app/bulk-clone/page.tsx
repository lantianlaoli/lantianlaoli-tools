"use client";

import {
  BadgeCheck,
  Captions,
  ClipboardList,
  Download,
  FileText,
  FileUp,
  Gauge,
  Hash,
  ImageIcon,
  Maximize2,
  MessageSquareText,
  Palette,
  PackageSearch,
  Pencil,
  RefreshCw,
  Ruler,
  ChevronDown,
  Rows3,
  Type,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { FormEvent } from "react";
import type {
  GenerationJob,
  KieAspectRatio,
  KieResolution,
  ParsedWorkbook,
  ParsedWorkbookRow,
  TextBlock,
} from "@/lib/types";

type Status = "idle" | "parsing" | "ready" | "starting" | "polling" | "done" | "error";
type UploadProgress = {
  label: string;
  percent: number;
};
type RegenerateModalState = {
  job: GenerationJob;
  resultUrl?: string;
  fontReferenceUrl?: string;
  textBlocks?: TextBlock[];
  localImages?: LocalReferenceImage[];
  aspectRatio: KieAspectRatio;
  resolution: KieResolution;
};
type LocalReferenceImage = {
  id: string;
  fileName: string;
  dataUrl: string;
};
type PersistedPageState = {
  workbook: ParsedWorkbook | null;
  includeMainImageRow: boolean;
  jobs: GenerationJob[];
  status: Status;
  isProductDescriptionExpanded: boolean;
};

const PAGE_STATE_STORAGE_KEY = "lantian-tools.pageState.v1";
const LEGACY_PAGE_STATE_STORAGE_KEY = "rivora.pageState.v1";
const RESTORABLE_STATUSES = new Set<Status>(["idle", "ready", "polling", "done", "error"]);
const FONT_REFERENCE_PREFIX =
  "Font reference: Use the same font style and text treatment as shown in the font reference image.\n\n";
const MAX_LOCAL_REFERENCE_IMAGES = 4;
const MAX_LOCAL_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const LOCAL_REFERENCE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const OUTPUT_ASPECT_RATIOS: KieAspectRatio[] = ["auto", "1:1", "9:16", "16:9", "4:3", "3:4"];
const OUTPUT_RESOLUTIONS: KieResolution[] = ["1K", "2K", "4K"];
const DEFAULT_PAGE_STATE: PersistedPageState = {
  workbook: null,
  includeMainImageRow: false,
  jobs: [],
  status: "idle",
  isProductDescriptionExpanded: false,
};

function isValidOutputSize(aspectRatio: KieAspectRatio, resolution: KieResolution) {
  if (aspectRatio === "auto") return resolution === "1K";
  if (aspectRatio === "1:1") return resolution !== "4K";
  return true;
}

function normalizeOutputResolution(aspectRatio: KieAspectRatio, resolution: KieResolution): KieResolution {
  if (isValidOutputSize(aspectRatio, resolution)) return resolution;
  if (aspectRatio === "auto") return "1K";
  if (aspectRatio === "1:1") return "2K";
  return resolution;
}

function allRows(workbook: ParsedWorkbook | null, includeMain: boolean) {
  if (!workbook) return [];
  return [...(includeMain && workbook.mainImageRow ? [workbook.mainImageRow] : []), ...workbook.rows];
}

function statusAfterRestore(status: Status, workbook: ParsedWorkbook | null, jobs: GenerationJob[]) {
  if (status === "polling" && jobs.some((job) => job.status === "processing" || job.status === "waiting")) {
    return "polling";
  }
  if (status === "done" || jobs.some((job) => job.status === "success" || job.status === "fail")) {
    return jobs.every((job) => job.status === "success" || job.status === "fail") ? "done" : "polling";
  }
  if (workbook && RESTORABLE_STATUSES.has(status)) return status === "idle" ? "ready" : status;
  return workbook ? "ready" : "idle";
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
  const wrapperClass = "flex h-full flex-col items-stretch justify-start rounded-md border border-white/10 bg-black/20 p-3";
  const labelClass = "mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-zinc-500";

  if (expandable) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={`${wrapperClass} w-full text-left transition hover:border-white/20 hover:bg-white/[0.04]`}
      >
        <div className={labelClass}>
          <Icon size={13} aria-hidden="true" />
          <span className="flex-1">{label}</span>
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
    <div className={wrapperClass}>
      <div className={labelClass}>
        <Icon size={13} aria-hidden="true" />
        <span className="flex-1">{label}</span>
      </div>
      <p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-zinc-200">{content}</p>
    </div>
  );
}

function ParsingPanel({ progress }: { progress: UploadProgress | null }) {
  const currentProgress = progress ?? { label: "Preparing your workbook", percent: 8 };

  return (
    <section className="flex min-h-[420px] items-center justify-center rounded-lg border border-lime-300/30 bg-lime-300/[0.05] px-6">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-lime-300/30 bg-black/30 text-lime-100">
          <RefreshCw size={24} aria-hidden="true" className="animate-spin" />
        </div>
        <h2 className="mt-5 text-base font-semibold text-lime-100">{currentProgress.label}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">
          Extracting product details, row instructions, and reference images.
        </p>
        <div className="mt-6 w-full">
          <div className="mb-2 flex items-center justify-between text-xs text-lime-100">
            <span>Working on your file</span>
            <span className="font-mono">{currentProgress.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-lime-300 transition-[width] duration-300 ease-out"
              style={{ width: `${currentProgress.percent}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function RowPreview({ row }: { row: ParsedWorkbookRow }) {
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({});
  const toggleField = (field: string) => {
    setExpandedFields((current) => ({ ...current, [`${row.id}-${field}`]: !current[`${row.id}-${field}`] }));
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
            expandable={Boolean(row.requirement)}
            expanded={Boolean(expandedFields[`${row.id}-requirement`])}
            onToggle={() => toggleField("requirement")}
          />
          <RowField
            icon={Captions}
            label="Copy"
            value={row.copyText}
            expandable={Boolean(row.copyText)}
            expanded={Boolean(expandedFields[`${row.id}-copy`])}
            onToggle={() => toggleField("copy")}
          />
          <RowField
            icon={Palette}
            label="Style"
            value={row.style}
            expandable={row.style.length > 200}
            expanded={Boolean(expandedFields[`${row.id}-style`])}
            onToggle={() => toggleField("style")}
          />
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
  const [status, setStatus] = useState<Status>(DEFAULT_PAGE_STATE.status);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(DEFAULT_PAGE_STATE.workbook);
  const [includeMainImageRow, setIncludeMainImageRow] = useState(DEFAULT_PAGE_STATE.includeMainImageRow);
  const [jobs, setJobs] = useState<GenerationJob[]>(DEFAULT_PAGE_STATE.jobs);
  const [error, setError] = useState("");
  const [regenerateModal, setRegenerateModal] = useState<RegenerateModalState | null>(null);
  const [refinement, setRefinement] = useState("");
  const [regenerateError, setRegenerateError] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [localImageError, setLocalImageError] = useState("");
  const [isProductDescriptionExpanded, setIsProductDescriptionExpanded] = useState(
    DEFAULT_PAGE_STATE.isProductDescriptionExpanded
  );
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFontRefSelectorOpen, setIsFontRefSelectorOpen] = useState(false);
  const [isAnalyzingText, setIsAnalyzingText] = useState(false);
  const [textAnalysisError, setTextAnalysisError] = useState("");
  const [outputSizeNotice, setOutputSizeNotice] = useState("");
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [isEditTextMode, setIsEditTextMode] = useState(false);
  const [hasRestoredPageState, setHasRestoredPageState] = useState(false);
  const pollingRef = useRef<number | null>(null);
  const generationSectionRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => allRows(workbook, includeMainImageRow), [workbook, includeMainImageRow]);
  const canGenerate = status === "ready" || status === "done" || status === "error";
  const completedCount = jobs.filter((job) => job.status === "success" || job.status === "fail").length;

  const parseFile = useCallback(async (file: File) => {
    setStatus("parsing");
    setError("");
    setJobs([]);
    setWorkbook(null);
    setIncludeMainImageRow(false);
    setIsProductDescriptionExpanded(false);
    setUploadProgress({ label: "Preparing your workbook", percent: 8 });

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
        setUploadProgress({ label: "Reading workbook contents", percent: 76 });
      };

      request.onload = () => {
        try {
          const responsePayload = JSON.parse(request.responseText || "{}");
          if (request.status < 200 || request.status >= 300) {
            reject(new Error(responsePayload.error || "Failed to parse workbook."));
            return;
          }
          setUploadProgress({ label: "Organizing rows and images", percent: 92 });
          resolve(responsePayload as ParsedWorkbook);
        } catch {
          reject(new Error("Failed to read parser response."));
        }
      };
      request.onerror = () => reject(new Error("Workbook upload failed."));
      request.onabort = () => reject(new Error("Workbook upload was cancelled."));
      request.open("POST", "/api/workbook/parse");
      request.send(formData);
    });

    setWorkbook(payload);
    setStatus("ready");
    setUploadProgress({ label: "Workbook ready", percent: 100 });
    window.setTimeout(() => setUploadProgress(null), 900);
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".xlsx")) {
      setError("Please upload a .xlsx file.");
      return;
    }
    parseFile(file).catch((parseError) => {
      setError(parseError instanceof Error ? parseError.message : "Failed to parse workbook.");
      setUploadProgress(null);
      setStatus("error");
    });
  }, [parseFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

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
    generationSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    setRegenerateModal((modal) => {
      if (!modal) return null;
      const updatedJob = nextJobs.find((job) => job.rowId === modal.job.rowId);
      if (!updatedJob) return modal;
      return {
        ...modal,
        job: updatedJob,
        resultUrl: updatedJob.resultUrl,
        aspectRatio: updatedJob.aspectRatio,
        resolution: updatedJob.resolution,
      };
    });
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

  function readLocalReferenceImage(file: File) {
    return new Promise<LocalReferenceImage>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("Could not read this image."));
          return;
        }
        resolve({
          id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
          fileName: file.name,
          dataUrl: reader.result,
        });
      };
      reader.onerror = () => reject(new Error("Could not read this image."));
      reader.readAsDataURL(file);
    });
  }

  async function handleLocalReferenceImages(files: FileList | null) {
    if (!files?.length || !regenerateModal) return;
    setLocalImageError("");
    const currentImages = regenerateModal.localImages ?? [];
    const selectedFiles = Array.from(files);
    if (currentImages.length + selectedFiles.length > MAX_LOCAL_REFERENCE_IMAGES) {
      setLocalImageError(`Upload up to ${MAX_LOCAL_REFERENCE_IMAGES} local reference images.`);
      return;
    }

    const invalidFile = selectedFiles.find((file) => !LOCAL_REFERENCE_IMAGE_TYPES.has(file.type));
    if (invalidFile) {
      setLocalImageError("Local reference images must be PNG, JPG, or WEBP.");
      return;
    }
    const oversizedFile = selectedFiles.find((file) => file.size > MAX_LOCAL_REFERENCE_IMAGE_BYTES);
    if (oversizedFile) {
      setLocalImageError("Each local reference image must be 10MB or smaller.");
      return;
    }

    try {
      const nextImages = await Promise.all(selectedFiles.map((file) => readLocalReferenceImage(file)));
      setRegenerateModal((modal) =>
        modal
          ? {
              ...modal,
              localImages: [...(modal.localImages ?? []), ...nextImages].slice(0, MAX_LOCAL_REFERENCE_IMAGES),
            }
          : modal
      );
    } catch (imageError) {
      setLocalImageError(imageError instanceof Error ? imageError.message : "Could not read this image.");
    }
  }

  function removeLocalReferenceImage(imageId: string) {
    setRegenerateModal((modal) =>
      modal
        ? {
            ...modal,
            localImages: (modal.localImages ?? []).filter((image) => image.id !== imageId),
          }
        : modal
    );
  }

  function openRegenerateModal(job: GenerationJob) {
    if (!job.resultUrl) return;
    setRegenerateModal({
      job,
      resultUrl: job.resultUrl,
      fontReferenceUrl: undefined,
      localImages: [],
      aspectRatio: job.aspectRatio,
      resolution: job.resolution,
    });
    setRefinement("");
    setRegenerateError("");
    setLocalImageError("");
    setIsFontRefSelectorOpen(false);
    setEditedTexts({});
    setIsEditTextMode(false);
    setTextAnalysisError("");
    setOutputSizeNotice("");
  }

  async function analyzeImageText(resultUrl: string) {
    setIsAnalyzingText(true);
    setTextAnalysisError("");
    try {
      const response = await fetch("/api/analyze/image-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: resultUrl }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to analyze image.");
      const textBlocks = payload.textBlocks as TextBlock[];
      setRegenerateModal((m) =>
        m ? { ...m, textBlocks } : null
      );
      setEditedTexts(Object.fromEntries(textBlocks.map((block) => [block.id, block.text])));
      setIsEditTextMode(true);
    } catch (err) {
      setTextAnalysisError(err instanceof Error ? err.message : "Failed to analyze image text.");
    } finally {
      setIsAnalyzingText(false);
    }
  }

  function analyzeCurrentModalText() {
    if (regenerateModal?.textBlocks?.length) {
      setIsEditTextMode(true);
      return;
    }
    if (!regenerateModal?.resultUrl) return;
    analyzeImageText(regenerateModal.resultUrl).catch(() => {
      // analyzeImageText owns user-visible error state.
    });
  }

  async function submitRegeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!regenerateModal) return;
    setIsRegenerating(true);
    setRegenerateError("");

    let finalRefinement = refinement;
    const localImages = regenerateModal.localImages ?? [];
    if (isEditTextMode) {
      const changedEntries = (regenerateModal.textBlocks ?? [])
        .map((block) => ({
          original: block.text,
          next: editedTexts[block.id] ?? block.text,
        }))
        .filter(({ original, next }) => original.trim() !== next.trim());
      if (changedEntries.length > 0) {
        const changes = changedEntries
          .map(({ original, next }) => `Text "${original}" → "${next.trim() || "[remove text]"}"`)
          .join("\n");
        finalRefinement = `Edit the following text in the image:\n${changes}`;
      }
    }
    if (!finalRefinement.trim() && localImages.length) {
      finalRefinement =
        "Use the uploaded local reference image(s) as visual guidance for the requested image-to-image edit.";
    }
    if (!finalRefinement.trim() && (
      regenerateModal.aspectRatio !== regenerateModal.job.aspectRatio ||
      regenerateModal.resolution !== regenerateModal.job.resolution
    )) {
      finalRefinement = "Regenerate the image with the selected output size while preserving the current design.";
    }

    // Append font reference if set
    const fontRefText = regenerateModal.fontReferenceUrl
      ? "\n\nFont reference: Use the same font style and text treatment as shown in the font reference image."
      : "";

    try {
      const response = await fetch("/api/generate/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: regenerateModal.job,
          resultUrl: regenerateModal.resultUrl,
          refinement: finalRefinement + fontRefText,
          aspectRatio: regenerateModal.aspectRatio,
          resolution: regenerateModal.resolution,
          localImages: localImages.map((image) => ({
            fileName: image.fileName,
            dataUrl: image.dataUrl,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to regenerate image.");
      const nextJob = payload.job as GenerationJob;
      setJobs((currentJobs) =>
        currentJobs.map((job) => (job.rowId === regenerateModal.job.rowId ? nextJob : job))
      );
      setStatus("polling");
      setRegenerateModal((modal) =>
        modal && modal.job.rowId === regenerateModal.job.rowId
          ? {
              ...modal,
              job: nextJob,
              resultUrl: nextJob.resultUrl,
              fontReferenceUrl: undefined,
              aspectRatio: nextJob.aspectRatio,
              resolution: nextJob.resolution,
            }
          : modal
      );
      setRefinement("");
      setIsFontRefSelectorOpen(false);
      setTextAnalysisError("");
    } catch (regenerateFailure) {
      setRegenerateError(regenerateFailure instanceof Error ? regenerateFailure.message : "Failed to regenerate image.");
    } finally {
      setIsRegenerating(false);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect -- Restore browser-only session state after hydration. */
  useEffect(() => {
    try {
      const storedState =
        window.localStorage.getItem(PAGE_STATE_STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_PAGE_STATE_STORAGE_KEY);
      if (!storedState) return;
      window.localStorage.setItem(PAGE_STATE_STORAGE_KEY, storedState);

      const parsedState = JSON.parse(storedState) as Partial<PersistedPageState>;
      const restoredWorkbook = parsedState.workbook ?? null;
      const restoredJobs = Array.isArray(parsedState.jobs) ? parsedState.jobs : [];

      setWorkbook(restoredWorkbook);
      setIncludeMainImageRow(Boolean(parsedState.includeMainImageRow));
      setJobs(restoredJobs);
      setStatus(statusAfterRestore(parsedState.status ?? "idle", restoredWorkbook, restoredJobs));
      setIsProductDescriptionExpanded(Boolean(parsedState.isProductDescriptionExpanded));
    } catch {
      window.localStorage.removeItem(PAGE_STATE_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_PAGE_STATE_STORAGE_KEY);
    } finally {
      setHasRestoredPageState(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hasRestoredPageState) return;

    const stateToPersist: PersistedPageState = {
      workbook,
      includeMainImageRow,
      jobs,
      status,
      isProductDescriptionExpanded,
    };
    window.localStorage.setItem(PAGE_STATE_STORAGE_KEY, JSON.stringify(stateToPersist));
  }, [hasRestoredPageState, includeMainImageRow, isProductDescriptionExpanded, jobs, status, workbook]);

  useEffect(() => {
    if (status !== "polling") return;
    pollingRef.current = window.setInterval(() => pollJobs(jobs), 8000);
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
    };
  }, [jobs, status]);

  /* eslint-disable react-hooks/set-state-in-effect -- font reference prefix must sync with modal state */
  // Auto-prepend/remove font reference text in prompt when reference is selected or cleared
  useEffect(() => {
    if (!regenerateModal) return;
    if (regenerateModal.fontReferenceUrl) {
      if (!refinement.startsWith(FONT_REFERENCE_PREFIX)) {
        setRefinement((prev) => FONT_REFERENCE_PREFIX + prev);
      }
    } else {
      if (refinement.startsWith(FONT_REFERENCE_PREFIX)) {
        setRefinement((prev) => prev.slice(FONT_REFERENCE_PREFIX.length));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerateModal?.fontReferenceUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const regenerateModalStatus = regenerateModal?.job.status;
  const isRegenerateModalGenerating = Boolean(
    regenerateModal &&
      (isRegenerating ||
        (!regenerateModal.resultUrl &&
          (regenerateModalStatus === "waiting" || regenerateModalStatus === "processing")))
  );
  const isRegenerateModalFailed = regenerateModalStatus === "fail";
  const localReferenceImages = regenerateModal?.localImages ?? [];
  const hasLocalReferenceImages = localReferenceImages.length > 0;
  const hasOutputSizeChange = Boolean(
    regenerateModal &&
      (regenerateModal.aspectRatio !== regenerateModal.job.aspectRatio ||
        regenerateModal.resolution !== regenerateModal.job.resolution)
  );

  return (
    <main className="min-h-screen bg-[#10100f] text-zinc-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/" className="mb-3 inline-flex text-xs text-zinc-500 hover:text-zinc-200">
              返回首页
            </Link>
            <p className="font-mono text-2xl font-semibold tracking-tight text-zinc-100">批量克隆照片</p>
          </div>
          {workbook ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Gauge size={14} aria-hidden="true" />
                <span className="font-mono">{status}</span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Rows3 size={14} aria-hidden="true" />
                <span className="font-mono">{rows.length}</span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <BadgeCheck size={14} aria-hidden="true" />
                <span className="font-mono">{jobs.length ? `${completedCount}/${jobs.length}` : "0/0"}</span>
              </div>
              <label
                className={`inline-flex h-9 items-center gap-2 rounded-md border border-white/15 px-3 text-xs font-semibold text-zinc-100 transition ${
                  status === "parsing"
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:border-white/25 hover:bg-white/10"
                }`}
              >
                <RefreshCw size={14} aria-hidden="true" />
                Re-parse XLSX
                <input
                  type="file"
                  accept=".xlsx"
                  disabled={status === "parsing"}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) handleFile(file);
                  }}
                />
              </label>
            </div>
          ) : null}
        </header>

        {error ? <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}

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
                Start Generation
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
              <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
                <FileText size={16} aria-hidden="true" className="text-zinc-400" />
                <h2 className="text-sm font-semibold">Parsed workbook rows</h2>
              </div>
              {rows.map((row) => <RowPreview key={row.id} row={row} />)}
            </div>
          </section>
        ) : status === "parsing" ? (
          <ParsingPanel progress={uploadProgress} />
        ) : (
          <section
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex min-h-[420px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed bg-white/[0.02] transition-colors ${
              isDragging ? "border-lime-300/60 bg-lime-300/[0.05]" : "border-white/15 hover:border-white/25"
            }`}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <FileUp size={40} aria-hidden="true" className="text-zinc-500" />
              <div>
                <p className="text-sm font-medium text-zinc-300">Drop your XLSX here, or click to upload</p>
                <p className="mt-1 text-xs text-zinc-500">WPS embedded images, product context, rows, references</p>
              </div>
            </div>
            <input
              type="file"
              accept=".xlsx"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleFile(file);
              }}
            />
          </section>
        )}

        {jobs.length ? (
          <section ref={generationSectionRef} className="overflow-visible rounded-lg border border-white/10 bg-white/[0.03]">
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
          <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#151514] shadow-2xl">

            {/* Header: Edit image title + close icon */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-base font-semibold text-zinc-100">Edit image</h2>
              <button
                type="button"
                onClick={() => setRegenerateModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Image section */}
            <div className="relative border-b border-white/10 bg-black">
              {isAnalyzingText && regenerateModal.resultUrl ? (
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={regenerateModal.resultUrl}
                    alt=""
                    className="h-full w-full object-contain opacity-45 blur-sm"
                  />
                  <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
                  <div className="result-wave absolute inset-0 z-10" />
                  <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
                    <div className="flex min-w-72 flex-col items-center gap-3 rounded-xl border border-white/25 bg-[#151514]/85 px-7 py-6 text-center shadow-2xl shadow-black/80 backdrop-blur-xl">
                      <div className="flex h-12 w-28 items-center justify-center rounded-full border border-lime-300/40 bg-lime-300/15 text-lime-100">
                        <Type size={22} aria-hidden="true" />
                      </div>
                      <div>
                        <div className="text-base font-semibold text-white">Analyzing text...</div>
                        <div className="mt-1 text-xs text-zinc-300">Finding editable lines in this image.</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : isRegenerateModalGenerating ? (
                <div className="result-wave flex aspect-[4/3] w-full items-center justify-center bg-white/[0.04] text-xs text-zinc-400">
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <div className="flex h-12 w-28 items-center justify-center rounded-full border border-white/10 bg-black/30">
                      <ImageIcon size={20} aria-hidden="true" />
                    </div>
                    <span>Generating image...</span>
                  </div>
                </div>
              ) : isRegenerateModalFailed ? (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-black px-6 text-center">
                  <div className="max-w-md rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
                    {regenerateModal.job.error || "Image generation failed."}
                  </div>
                </div>
              ) : regenerateModal.resultUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={regenerateModal.resultUrl}
                  alt=""
                  className="aspect-[4/3] w-full object-contain"
                />
              ) : null}
            </div>

            {/* Font reference selector — shown above prompt when open */}
            {isFontRefSelectorOpen && !isRegenerateModalGenerating ? (
              <div className="border-b border-white/10 bg-[#1c1c1a] p-4">
                <div className="mb-3 text-xs font-medium text-zinc-400">Select a photo to reference its font style</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {jobs
                    .filter((j) => j.resultUrl && j.rowId !== regenerateModal.job.rowId)
                    .map((job) => (
                      <button
                        key={job.rowId}
                        type="button"
                        onClick={() => {
                          setRegenerateModal((m) => m ? { ...m, fontReferenceUrl: job.resultUrl } : null);
                          setIsFontRefSelectorOpen(false);
                        }}
                        className={`relative shrink-0 overflow-hidden rounded-md border-2 transition ${
                          regenerateModal.fontReferenceUrl === job.resultUrl
                            ? "border-lime-300"
                            : "border-transparent hover:border-white/30"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={job.resultUrl}
                          alt={`Row ${job.rowNumber}`}
                          className="h-14 w-14 object-cover"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center font-mono text-[9px] text-zinc-300">
                          R{job.rowNumber}
                        </div>
                      </button>
                    ))}
                  {jobs.filter((j) => j.resultUrl && j.rowId !== regenerateModal.job.rowId).length === 0 ? (
                    <p className="text-xs text-zinc-500">No other images available</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Font reference applied indicator */}
            {regenerateModal.fontReferenceUrl ? (
              <div className="flex items-center gap-3 border-b border-white/10 bg-[#1c1c1a] px-5 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={regenerateModal.fontReferenceUrl}
                  alt="Font reference"
                  className="h-10 w-10 shrink-0 rounded-md border border-white/10 object-cover"
                />
                <span className="flex-1 text-sm text-lime-200">Font reference applied</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRegenerateModal((m) => m ? { ...m, fontReferenceUrl: undefined } : null);
                    }}
                    disabled={isRegenerateModalGenerating}
                    className="text-xs text-zinc-400 transition-colors hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                  Remove
                </button>
              </div>
            ) : null}

            {/* Text analysis error */}
            {textAnalysisError ? (
              <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-5 py-3">
                <span className="text-sm text-amber-100">{textAnalysisError}</span>
                <button
                  type="button"
                  onClick={() => setTextAnalysisError("")}
                  className="text-xs text-amber-300 underline transition-colors hover:text-amber-100"
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            {/* Prompt + action section */}
            <form onSubmit={submitRegeneration} className="flex flex-col p-5">
              {!isEditTextMode ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 overflow-x-auto pb-1">
                    <label
                      className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/[0.03] text-zinc-500 transition hover:border-white/40 hover:bg-white/[0.06] hover:text-zinc-300 ${
                        isRegenerateModalGenerating || localReferenceImages.length >= MAX_LOCAL_REFERENCE_IMAGES
                          ? "cursor-not-allowed opacity-50"
                          : ""
                      }`}
                      title={localReferenceImages.length >= MAX_LOCAL_REFERENCE_IMAGES ? "Max images reached" : "Add image"}
                      aria-label="Add local reference image"
                    >
                      <Plus size={18} aria-hidden="true" />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        disabled={isRegenerateModalGenerating || localReferenceImages.length >= MAX_LOCAL_REFERENCE_IMAGES}
                        className="sr-only"
                        onChange={(event) => {
                          handleLocalReferenceImages(event.target.files).catch((imageError) => {
                            setLocalImageError(
                              imageError instanceof Error ? imageError.message : "Could not read this image."
                            );
                          });
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {localReferenceImages.map((image, index) => (
                      <div key={image.id} className="group relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.dataUrl}
                          alt={`Local reference ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeLocalReferenceImage(image.id)}
                          disabled={isRegenerateModalGenerating}
                          aria-label={`Remove local reference ${index + 1}`}
                          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded bg-black/70 text-zinc-300 opacity-0 transition hover:bg-red-500/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 group-hover:opacity-100 focus:opacity-100"
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {localImageError ? (
                    <div className="text-xs leading-5 text-amber-200">{localImageError}</div>
                  ) : null}

                  <textarea
                    id="regenerate-refinement"
                    value={refinement}
                    onChange={(event) => setRefinement(event.target.value)}
                    rows={4}
                    disabled={isRegenerateModalGenerating}
                    placeholder="Describe your adjustment..."
                    className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-4 text-sm leading-relaxed text-zinc-100 outline-none ring-1 ring-lime-300/20 placeholder:text-zinc-600 focus:ring-2 focus:ring-lime-300/50 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              ) : null}

              {/* Editable text lines — shown when in edit text mode */}
              {isEditTextMode ? (
                <div className="space-y-3">
                  {isAnalyzingText ? (
                    <div className="flex items-center justify-center gap-3 rounded-lg border border-white/10 bg-black/20 py-8 text-sm text-zinc-400">
                      <RefreshCw size={16} aria-hidden="true" className="animate-spin" />
                      Analyzing image text...
                    </div>
                  ) : regenerateModal.textBlocks && regenerateModal.textBlocks.length > 0 ? (
	                    <>
	                      <div className="mb-1 text-xs font-medium uppercase text-zinc-500">
	                        Edit Text Lines
	                      </div>
	                      <div className="max-h-[32vh] space-y-3 overflow-y-auto pr-1">
	                        {regenerateModal.textBlocks.map((block) => {
	                          const isEdited = (editedTexts[block.id] ?? block.text).trim() !== block.text.trim();
	                          return (
	                            <div
	                              key={block.id}
	                              className={`relative rounded-lg border p-3 ${
	                                isEdited
	                                  ? "border-lime-300/70 bg-lime-300/[0.06]"
	                                  : "border-white/10 bg-black/20"
	                              }`}
	                            >
	                              {isEdited ? (
	                                <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-lime-300/40 bg-lime-300/15 text-lime-200">
	                                  <Pencil size={12} aria-hidden="true" />
	                                </div>
	                              ) : null}
	                              <div className="mb-2 flex items-center gap-2 pr-8">
	                                <span className="font-mono text-[10px] text-zinc-500">{block.id}</span>
	                                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-zinc-400">
	                                  {block.position}
	                                </span>
	                                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-zinc-400">
	                                  {block.size}
	                                </span>
	                              </div>
	                              <input
	                                type="text"
	                                value={editedTexts[block.id] ?? block.text}
	                                onChange={(e) =>
	                                  setEditedTexts((prev) => ({ ...prev, [block.id]: e.target.value }))
	                                }
	                                disabled={isRegenerateModalGenerating}
	                                aria-label={`Edit text line ${block.id}`}
	                                className="w-full rounded border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300/50 disabled:cursor-not-allowed disabled:opacity-50"
	                              />
	                            </div>
	                          );
	                        })}
	                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center rounded-lg border border-dashed border-white/10 py-8 text-sm text-zinc-500">
                      No readable English text detected in this image.
                    </div>
                  )}
                </div>
              ) : null}

              {/* Bottom action row */}
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                {/* Left: Font Reference + Edit Text buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Font Reference toggle */}
                  <button
                    type="button"
                    onClick={() => setIsFontRefSelectorOpen((open) => !open)}
                    disabled={isRegenerateModalGenerating}
                    className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                      regenerateModal.fontReferenceUrl
                        ? "border-lime-300/40 bg-lime-300/10 text-lime-200"
                        : "border-white/15 text-zinc-300 hover:bg-white/5 hover:text-zinc-100"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <Palette size={16} aria-hidden="true" />
                    Font Reference
                  </button>

                  {/* Edit Text toggle */}
                  {!isEditTextMode ? (
                      <button
                        type="button"
                        onClick={analyzeCurrentModalText}
                        disabled={isRegenerateModalGenerating || isAnalyzingText || !regenerateModal.resultUrl}
                        className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Type size={16} aria-hidden="true" />
                      {isAnalyzingText ? "Analyzing..." : "Edit Text"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditTextMode(false)}
                      disabled={isRegenerateModalGenerating}
                      className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MessageSquareText size={16} aria-hidden="true" />
                      Prompt Mode
                    </button>
                  )}
                  <label className="flex h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.025] px-2 text-zinc-400 transition focus-within:border-white/20 focus-within:ring-2 focus-within:ring-lime-300/40">
                    <Maximize2 size={14} aria-hidden="true" />
                    <span className="sr-only">Aspect ratio</span>
                    <select
                      value={regenerateModal.aspectRatio}
                      onChange={(event) => {
                        const aspectRatio = event.target.value as KieAspectRatio;
                        setRegenerateModal((modal) =>
                          modal
                            ? {
                                ...modal,
                                aspectRatio,
                                resolution: normalizeOutputResolution(aspectRatio, modal.resolution),
                              }
                            : modal
                        );
                        setOutputSizeNotice("");
                      }}
                      disabled={isRegenerateModalGenerating}
                      className="h-8 cursor-pointer bg-transparent font-mono text-xs text-zinc-300 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {OUTPUT_ASPECT_RATIOS.map((aspectRatio) => (
                        <option key={aspectRatio} value={aspectRatio}>
                          {aspectRatio}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div
                    className="flex h-10 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.025] px-1.5"
                    aria-label="Resolution"
                    role="group"
                  >
                    <Gauge size={14} aria-hidden="true" className="ml-0.5 text-zinc-500" />
                    {OUTPUT_RESOLUTIONS.map((resolution) => {
                      const isSelected = regenerateModal.resolution === resolution;
                      const isValid = isValidOutputSize(regenerateModal.aspectRatio, resolution);
                      const invalidReason =
                        regenerateModal.aspectRatio === "1:1" && resolution === "4K"
                          ? "4K is unavailable for 1:1. Choose another ratio first."
                          : regenerateModal.aspectRatio === "auto" && resolution !== "1K"
                            ? "Auto ratio only supports 1K."
                            : "";

                      return (
                        <button
                          key={resolution}
                          type="button"
                          onClick={() => {
                            if (!isValid) {
                              setOutputSizeNotice(invalidReason);
                              return;
                            }
                            setRegenerateModal((modal) =>
                              modal
                                ? {
                                    ...modal,
                                    resolution,
                                  }
                                : modal
                            );
                            setOutputSizeNotice("");
                          }}
                          disabled={isRegenerateModalGenerating}
                          title={invalidReason || `Use ${resolution} output`}
                          aria-pressed={isSelected}
                          className={`h-7 min-w-8 rounded-md px-2 font-mono text-[11px] font-semibold transition ${
                            isSelected
                              ? "bg-lime-300 text-zinc-950"
                              : isValid
                                ? "text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                                : "cursor-help text-zinc-600 hover:bg-amber-300/10 hover:text-amber-200"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {resolution}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Generate button */}
                <button
                  type="submit"
                  disabled={
                    isRegenerateModalGenerating ||
                    !regenerateModal.resultUrl ||
                    (!isEditTextMode && !refinement.trim() && !hasLocalReferenceImages && !hasOutputSizeChange) ||
                    (isEditTextMode &&
                      !hasOutputSizeChange &&
                      !hasLocalReferenceImages &&
                      !regenerateModal.textBlocks?.some(
                        (block) => (editedTexts[block.id] ?? block.text).trim() !== block.text.trim()
                      ))
                  }
                  className="flex items-center gap-2 self-start rounded-lg bg-lime-300 px-6 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 sm:self-auto"
                >
                  {isRegenerating ? (
                    <>
                      <RefreshCw size={16} aria-hidden="true" className="animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} aria-hidden="true" />
                      Generate
                    </>
                  )}
                </button>
              </div>

              {outputSizeNotice ? (
                <div className="mt-2 text-xs leading-5 text-amber-200">{outputSizeNotice}</div>
              ) : null}

              {/* Error message */}
              {regenerateError ? (
                <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                  {regenerateError}
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
