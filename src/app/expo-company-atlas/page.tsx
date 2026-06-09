"use client";

import Link from "next/link";
import {
  AlignLeft,
  ArrowLeft,
  Building2,
  Clipboard,
  Download,
  Eye,
  FileArchive,
  FileText,
  Globe2,
  ImageIcon,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  XCircle,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  LANTIAN_TOOLS_LANGUAGE_CHANGE_EVENT,
  normalizeEcommerceTextLanguage,
  readStoredEcommerceTextLanguage,
} from "@/lib/ecommerce-language";
import type {
  EcommerceTextLanguage,
  ExpoAtlasCompany,
  ExpoAtlasJob,
  ExpoAtlasPhoto,
} from "@/lib/types";
import { getMarkdownLanguages, renderMarkdownToHtml } from "@/lib/expo-company-atlas";

type PageStatus = "idle" | "reading" | "generating" | "error";
type UploadFile = { id: string; fileName: string; dataUrl: string; previewUrl: string };

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const OCR_IMAGE_MAX_EDGE = 2200;
const OCR_IMAGE_QUALITY = 0.82;
const contactIcons = {
  person: UserRound,
  phone: Phone,
  email: Mail,
  website: Globe2,
  address: MapPin,
  raw: MessageSquare,
} as const;
const INITIAL_JOB: ExpoAtlasJob = {
  id: "expo_draft",
  status: "ready",
  title: "展会企业图鉴",
  imageAspectRatio: "1:1",
  imageResolution: "1K",
  photos: [],
  companies: [
    {
      id: "company_1",
      name: "",
      intro: "",
      products: [],
      contact: {},
      photoIds: [],
      parseStatus: "draft",
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};

const copy = {
  zh: {
    back: "返回 Lantian Tools",
    title: "展会企业图鉴",
    subtitle: "一家公司一行，上传资料照片后自动整理。需要修改时进入详情页处理。",
    addCompany: "新增公司",
    generateAll: "全部生成展示图",
    regenerate: "重新生成",
    zip: "ZIP",
    backToList: "返回公司列表",
    companyLabel: "公司",
    companyName: "公司名称",
    upload: "上传照片",
    uploadWithCount: "上传",
    retryParse: "重试整理",
    viewDetails: "查看详情",
    deleteCompany: "删除公司",
    generateShort: "生成",
    photos: "张照片",
    noPhotos: "未上传",
    parsed: "已整理",
    draft: "待上传",
    parsing: "整理中",
    failed: "整理失败",
    visualProgress: "展示图",
    intro: "企业简介",
    introPlaceholder: "AI 会自动整理，也可以手动编辑。",
    products: "产品",
    noProducts: "暂无产品。",
    productName: "产品名称",
    productDescription: "产品描述",
    contact: "联系方式",
    markdown: "Markdown 预览",
    markdownEmpty: "上传照片后会自动生成 Markdown。",
    visuals: "照片与展示图",
    generateCompany: "生成本公司展示图",
    retryImage: "重试图片",
    removePhoto: "移除照片",
    copyMarkdown: "复制 Markdown",
    downloadMarkdown: "下载 Markdown",
    slotStatus: { waiting: "待生成", processing: "解析中", success: "完成", fail: "失败" },
    contactPlaceholders: {
      person: "联系人",
      phone: "电话",
      email: "邮箱",
      website: "网站",
      address: "地址",
      raw: "其他联系方式",
    },
    errors: {
      imageType: "只支持 PNG、JPG、WEBP 图片。",
      imageSize: "单张图片不能超过 10MB。",
      readFailed: "读取图片失败。",
      parseFailed: "整理资料失败。",
      saveFailed: "保存失败。",
      generateFailed: "启动生图失败。",
      retryFailed: "重试失败。",
      exportFailed: "导出失败。",
    },
    markdownGenerate: "AI 生成专业介绍",
    markdownGenerating: "生成中...",
    markdownSelectLang: "选择语言生成专业企业介绍 Markdown",
    enhancePhotos: "PPT 高清图片",
    enhanceSelectLang: "选择语言，将照片高清化并翻译为对应语言，生成可直接放入 PPT 的专业图片",
    enhanceAll: "全部高清化",
    enhanceRetry: "重试",
  },
  en: {
    back: "Back to Lantian Tools",
    title: "Expo Company Atlas",
    subtitle: "One company per row. Upload material photos and let AI organize them; edit everything from the details page.",
    addCompany: "Add company",
    generateAll: "Generate all visuals",
    regenerate: "Regenerate",
    zip: "ZIP",
    backToList: "Back to companies",
    companyLabel: "Company",
    companyName: "Company name",
    upload: "Upload photos",
    uploadWithCount: "Upload",
    retryParse: "Retry organize",
    viewDetails: "View details",
    deleteCompany: "Delete company",
    generateShort: "Generate",
    photos: "photos",
    noPhotos: "No upload",
    parsed: "Organized",
    draft: "Waiting",
    parsing: "Organizing",
    failed: "Failed",
    visualProgress: "Visuals",
    intro: "Company intro",
    introPlaceholder: "AI will organize this automatically. You can edit it.",
    products: "Products",
    noProducts: "No products yet.",
    productName: "Product name",
    productDescription: "Product description",
    contact: "Contact",
    markdown: "Markdown preview",
    markdownEmpty: "Markdown will be generated after uploading photos.",
    visuals: "Photos and visuals",
    generateCompany: "Generate company visuals",
    retryImage: "Retry image",
    removePhoto: "Remove photo",
    copyMarkdown: "Copy Markdown",
    downloadMarkdown: "Download Markdown",
    slotStatus: { waiting: "Waiting", processing: "Parsing", success: "Done", fail: "Failed" },
    contactPlaceholders: {
      person: "Contact person",
      phone: "Phone",
      email: "Email",
      website: "Website",
      address: "Address",
      raw: "Other contact details",
    },
    errors: {
      imageType: "Only PNG, JPG, and WEBP images are supported.",
      imageSize: "Each image must be 10MB or smaller.",
      readFailed: "Failed to read image.",
      parseFailed: "Failed to organize materials.",
      saveFailed: "Save failed.",
      generateFailed: "Failed to start image generation.",
      retryFailed: "Retry failed.",
      exportFailed: "Export failed.",
    },
    markdownGenerate: "AI generate intro",
    markdownGenerating: "Generating...",
    markdownSelectLang: "Select language to generate professional company intro markdown",
    enhancePhotos: "PPT-ready HD images",
    enhanceSelectLang: "Select language to enhance photos with translated text, producing slide-ready professional images",
    enhanceAll: "Enhance all",
    enhanceRetry: "Retry",
  },
};

function initialTextLanguage(): EcommerceTextLanguage {
  if (typeof window === "undefined") return "zh";
  const params = new URLSearchParams(window.location.search);
  const paramLanguage = params.get("lang");
  return paramLanguage
    ? normalizeEcommerceTextLanguage(paramLanguage)
    : readStoredEcommerceTextLanguage(window.localStorage);
}

function subscribeTextLanguage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(LANTIAN_TOOLS_LANGUAGE_CHANGE_EVENT, callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LANTIAN_TOOLS_LANGUAGE_CHANGE_EVENT, callback);
    window.removeEventListener("popstate", callback);
  };
}

function useTextLanguage() {
  return useSyncExternalStore<EcommerceTextLanguage>(subscribeTextLanguage, initialTextLanguage, () => "zh");
}

function parseStatusClass(status: ExpoAtlasCompany["parseStatus"]) {
  if (status === "parsed") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  if (status === "failed") return "border-red-500/40 bg-red-500/10 text-red-100";
  if (status === "parsing") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function rowStatusClass(status: ExpoAtlasCompany["parseStatus"]) {
  if (status === "parsed") return "border-emerald-400/35 bg-emerald-500/[0.055] shadow-[inset_3px_0_0_rgba(52,211,153,0.65)]";
  if (status === "failed") return "border-red-400/40 bg-red-500/[0.06] shadow-[inset_3px_0_0_rgba(248,113,113,0.7)]";
  if (status === "parsing") return "border-amber-300/40 bg-amber-500/[0.06] shadow-[inset_3px_0_0_rgba(251,191,36,0.7)]";
  return "border-white/10 bg-[#070b08] shadow-[inset_3px_0_0_rgba(113,113,122,0.35)]";
}

function slotStatusClass(status: ExpoAtlasPhoto["generationStatus"]) {
  if (status === "success") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  if (status === "fail") return "border-red-500/40 bg-red-500/10 text-red-100";
  if (status === "processing") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function parseStatusLabel(status: ExpoAtlasCompany["parseStatus"], t: typeof copy.zh) {
  if (status === "parsed") return t.parsed;
  if (status === "failed") return t.failed;
  if (status === "parsing") return t.parsing;
  return t.draft;
}

function newCompany(index: number): ExpoAtlasCompany {
  return {
    id: `company_${index + 1}`,
    name: "",
    intro: "",
    products: [],
    contact: {},
    photoIds: [],
    parseStatus: "draft",
  };
}

async function compressImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const scale = Math.min(1, OCR_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
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

async function readFile(file: File, companyId: string, index: number, t: typeof copy.zh): Promise<UploadFile> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error(t.errors.imageType);
  if (file.size > MAX_IMAGE_BYTES) throw new Error(t.errors.imageSize);
  const previewUrl = URL.createObjectURL(file);
  try {
    const dataUrl = await compressImage(file);
    return {
      id: `${companyId}_local_${index + 1}`,
      fileName: file.name || `photo-${index + 1}.jpg`,
      dataUrl,
      previewUrl,
    };
  } catch {
    URL.revokeObjectURL(previewUrl);
    throw new Error(`${t.errors.readFailed}${file.name ? ` ${file.name}` : ""}`);
  }
}

function fileDownload(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function photoLabel(count: number, t: typeof copy.zh) {
  return count > 0 ? `${count} ${t.photos}` : t.noPhotos;
}

function visualProgress(photos: ExpoAtlasPhoto[]) {
  const total = photos.filter((photo) => photo.sourceUrl).length;
  const done = photos.filter((photo) => photo.generationStatus === "success" || photo.generationStatus === "fail").length;
  return `${done}/${total}`;
}

function mergeParsedResult(
  job: ExpoAtlasJob,
  companyId: string,
  company: ExpoAtlasCompany,
  parsedPhotos: ExpoAtlasPhoto[]
) {
  const parsedPhotoIds = new Set(parsedPhotos.map((photo) => photo.id));
  const existing = job.companies.find((c) => c.id === companyId);

  // Merge products from both old and new, deduplicating by name
  const existingProducts = existing?.products ?? [];
  const newProducts = company.products ?? [];
  const existingProductNames = new Set(existingProducts.map((p) => p.name));
  const mergedProducts = [
    ...existingProducts,
    ...newProducts.filter((p) => !existingProductNames.has(p.name)),
  ];

  // Merge contact: prefer new API values, fall back to existing
  const contactKeys = ["phone", "email", "website", "address", "person", "social", "raw"] as const;
  const mergedContact: ExpoAtlasCompany["contact"] = {};
  for (const key of contactKeys) {
    mergedContact[key] = (company.contact as Record<string, string | undefined>)[key]
      || (existing?.contact as Record<string, string | undefined>)?.[key]
      || undefined;
  }

  // A name/intro is meaningful (not a placeholder worth overwriting)
  const isPlaceholder = (v: string | undefined) =>
    !v || v === "待整理企业" || v === "请补充企业简介。" || v === "Please add company intro.";

  return {
    ...job,
    status: "ready" as const,
    photos: [...job.photos.filter((photo) => !parsedPhotoIds.has(photo.id)), ...parsedPhotos],
    companies: job.companies.map((item) =>
      item.id === companyId
        ? {
            ...company,
            name: isPlaceholder(company.name) && item.name && !isPlaceholder(item.name)
              ? item.name
              : company.name,
            intro: isPlaceholder(company.intro) && item.intro && !isPlaceholder(item.intro)
              ? item.intro
              : company.intro,
            products: mergedProducts,
            contact: mergedContact,
            photoIds: [...new Set([...item.photoIds, ...parsedPhotos.map((p) => p.id)])],
            parseStatus: "parsed" as const,
          }
        : item
    ),
  };
}

export default function ExpoCompanyAtlasPage() {
  const language = useTextLanguage();
  const t = copy[language];
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const dataUrlCache = useRef<Map<string, string>>(new Map());
  const previewUrlCache = useRef<Map<string, string>>(new Map());
  const [job, setJob] = useState<ExpoAtlasJob>(INITIAL_JOB);
  const [detailCompanyId, setDetailCompanyId] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = pageStatus === "reading" || pageStatus === "generating";
  const detailCompany = detailCompanyId ? job.companies.find((company) => company.id === detailCompanyId) : null;
  const detailPhotos = detailCompany ? job.photos.filter((photo) => detailCompany.photoIds.includes(photo.id)) : [];
  const [markdownLoading, setMarkdownLoading] = useState(false);
  const [selectedMarkdownLang, setSelectedMarkdownLang] = useState<string>("");
  const markdownLangs = getMarkdownLanguages();

  async function generateMarkdown(lang: string) {
    if (!detailCompany || markdownLoading) return;
    setSelectedMarkdownLang(lang);
    setMarkdownLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/expo-company-atlas/generate-markdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company: detailCompany, photos: detailPhotos, language: lang }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to generate markdown.");
      patchCompany(detailCompany.id, (item) => ({ ...item, markdown: payload.markdown }), true);
    } catch (genError) {
      setError(genError instanceof Error ? genError.message : "Failed to generate markdown.");
    } finally {
      setMarkdownLoading(false);
    }
  }

  async function enhancePhotos(lang: string) {
    if (!detailCompany) return;
    setSelectedMarkdownLang(lang);
    setPageStatus("generating");
    setError(null);
    try {
      const response = await fetch("/api/expo-company-atlas/enhance-photos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, language: lang, companyId: detailCompany.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to enhance photos.");
      setJob(payload.job);
    } catch (enhanceError) {
      setError(enhanceError instanceof Error ? enhanceError.message : "Failed to enhance photos.");
      setPageStatus("error");
    }
  }

  useEffect(() => {
    const hasActiveGeneration = job.status === "generating";
    const hasActiveEnhancement = job.photos.some((p) => p.enhancedStatus === "processing");
    if (!hasActiveGeneration && !hasActiveEnhancement) return;
    const timer = window.setInterval(async () => {
      const response = await fetch("/api/expo-company-atlas/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job }),
      });
      const payload = await response.json();
      if (response.ok) {
        setJob(payload.job);
        if (payload.job.status !== "generating" && !payload.job.photos.some((p: ExpoAtlasPhoto) => p.enhancedStatus === "processing")) {
          setPageStatus("idle");
        }
      }
    }, 3500);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    const previews = previewUrlCache.current;
    const dataUrls = dataUrlCache.current;
    return () => {
      for (const previewUrl of previews.values()) {
        if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      }
      previews.clear();
      dataUrls.clear();
    };
  }, []);

  const saveJob = useCallback(async (nextJob: ExpoAtlasJob) => {
    setJob(nextJob);
    const response = await fetch("/api/expo-company-atlas/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job: nextJob }),
    });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error || t.errors.saveFailed);
      return;
    }
    const payload = await response.json();
    setJob(payload.job);
  }, [t.errors.saveFailed]);

  function patchCompany(companyId: string, patcher: (company: ExpoAtlasCompany) => ExpoAtlasCompany, persist = false) {
    const nextJob = {
      ...job,
      companies: job.companies.map((company) => (company.id === companyId ? patcher(company) : company)),
    };
    if (persist) void saveJob(nextJob);
    else setJob(nextJob);
  }

  function addCompany() {
    const company = newCompany(job.companies.length);
    setJob({ ...job, companies: [...job.companies, company] });
  }

  function deleteCompany(companyId: string) {
    if (job.companies.length <= 1) return;
    const removed = job.companies.find((company) => company.id === companyId);
    const removedPhotoIds = new Set(removed?.photoIds ?? []);
    for (const photoId of removedPhotoIds) {
      dataUrlCache.current.delete(photoId);
      const previewUrl = previewUrlCache.current.get(photoId);
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      previewUrlCache.current.delete(photoId);
    }
    const companies = job.companies.filter((company) => company.id !== companyId);
    setJob({
      ...job,
      companies,
      photos: job.photos.filter((photo) => !removedPhotoIds.has(photo.id)),
    });
    if (detailCompanyId === companyId) setDetailCompanyId(null);
  }

  async function parseCompany(companyId: string, sourceJob = job) {
    const company = sourceJob.companies.find((item) => item.id === companyId);
    if (!company) return sourceJob;
    const companyPhotos = sourceJob.photos.filter((photo) => company.photoIds.includes(photo.id));
    const files = companyPhotos
      .filter((photo) => dataUrlCache.current.has(photo.id))
      .map((photo) => ({
        id: photo.id,
        fileName: photo.fileName,
        dataUrl: dataUrlCache.current.get(photo.id),
      }));
    if (!files.length) return sourceJob;

    setError(null);
    const parsingJob = {
      ...sourceJob,
      companies: sourceJob.companies.map((item) =>
        item.id === companyId ? { ...item, parseStatus: "parsing" as const, parseError: undefined } : item
      ),
    };
    setJob(parsingJob);
    try {
      const response = await fetch("/api/expo-company-atlas/parse-company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, companyName: company.name, files }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t.errors.parseFailed);
      const parsedPhotos = (payload.photos as ExpoAtlasPhoto[]).map((photo) => {
        dataUrlCache.current.delete(photo.id);
        const previewUrl = previewUrlCache.current.get(photo.id);
        if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
        previewUrlCache.current.delete(photo.id);
        return {
          ...photo,
          previewUrl: photo.previewUrl || photo.sourceUrl,
        };
      });
      const nextJob = mergeParsedResult(parsingJob, companyId, payload.company as ExpoAtlasCompany, parsedPhotos);
      await saveJob(nextJob);
      return nextJob;
    } catch (parseError) {
      const failedJob = {
        ...parsingJob,
        companies: parsingJob.companies.map((item) =>
          item.id === companyId
            ? {
                ...item,
                parseStatus: "failed" as const,
                parseError: parseError instanceof Error ? parseError.message : t.errors.parseFailed,
              }
            : item
        ),
      };
      setJob(failedJob);
      setError(parseError instanceof Error ? parseError.message : t.errors.parseFailed);
      return failedJob;
    }
  }

  async function uploadCompanyPhotos(companyId: string, files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setPageStatus("reading");
    try {
      const existingCount = job.photos.filter((photo) => photo.id.startsWith(`${companyId}_`)).length;
      const uploads = await Promise.all(
        Array.from(files).map((file, index) => readFile(file, companyId, existingCount + index, t))
      );
      for (const file of uploads) {
        dataUrlCache.current.set(file.id, file.dataUrl);
        previewUrlCache.current.set(file.id, file.previewUrl);
      }
      const photos: ExpoAtlasPhoto[] = uploads.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        kind: "unknown" as const,
        summary: "",
        extractedText: [],
        generationStatus: "processing" as const,
        enhancedStatus: "waiting" as const,
      }));
      const nextJob = {
        ...job,
        photos: [...job.photos, ...photos],
        companies: job.companies.map((company) =>
          company.id === companyId
            ? {
                ...company,
                photoIds: [...company.photoIds, ...photos.map((photo) => photo.id)],
                parseStatus: "parsing" as const,
                parseError: undefined,
              }
            : company
        ),
      };
      setJob(nextJob);
      setPageStatus("idle");
      await parseCompany(companyId, nextJob);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t.errors.readFailed);
      setPageStatus("error");
    } finally {
      if (fileInputs.current[companyId]) fileInputs.current[companyId]!.value = "";
    }
  }

  function removePhoto(companyId: string, photoId: string) {
    dataUrlCache.current.delete(photoId);
    const previewUrl = previewUrlCache.current.get(photoId);
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    previewUrlCache.current.delete(photoId);
    setJob({
      ...job,
      photos: job.photos.filter((photo) => photo.id !== photoId),
      companies: job.companies.map((company) =>
        company.id === companyId
          ? { ...company, photoIds: company.photoIds.filter((id) => id !== photoId), parseStatus: "draft" }
          : company
      ),
    });
  }

  async function generate(companyId?: string, photoId?: string) {
    setPageStatus("generating");
    setError(null);
    try {
      const response = await fetch("/api/expo-company-atlas/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, companyId, photoId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || t.errors.generateFailed);
      setJob(payload.job);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : t.errors.generateFailed);
      setPageStatus("error");
    }
  }

  async function retryPhoto(photoId: string) {
    setError(null);
    const response = await fetch("/api/expo-company-atlas/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job, photoId }),
    });
    const payload = await response.json();
    if (response.ok) {
      setJob(payload.job);
      setPageStatus("generating");
    } else {
      setError(payload.error || t.errors.retryFailed);
    }
  }

  async function exportZip() {
    const response = await fetch("/api/expo-company-atlas/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job, format: "zip" }),
    });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error || t.errors.exportFailed);
      return;
    }
    const bytes = await response.arrayBuffer();
    fileDownload("expo-company-atlas.zip", bytes, "application/zip");
  }

  async function copyMarkdown(markdown?: string) {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
  }

  function downloadMarkdown(company: ExpoAtlasCompany) {
    if (!company.markdown) return;
    fileDownload(`${company.name || "company"}.md`, company.markdown, "text/markdown;charset=utf-8");
  }

  return (
    <main className="min-h-screen bg-[#10100f] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 md:px-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 transition hover:text-lime-100">
              <ArrowLeft size={14} aria-hidden="true" />
              {t.back}
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{t.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{t.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addCompany}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-lime-300/25 bg-lime-300/10 px-3 text-sm font-semibold text-lime-100 transition hover:border-lime-300/45"
            >
              <Plus size={16} aria-hidden="true" />
              {t.addCompany}
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-zinc-100 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles size={16} aria-hidden="true" />
              {t.generateAll}
            </button>
            <button
              type="button"
              onClick={() => void exportZip()}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-zinc-100 transition hover:border-white/25"
            >
              <FileArchive size={16} aria-hidden="true" />
              {t.zip}
            </button>
          </div>
        </header>

        {error ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            <X size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {detailCompany ? (
          <section className="mt-5 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setDetailCompanyId(null)}
                className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-zinc-200 transition hover:border-white/25"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                {t.backToList}
              </button>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <div className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-300">
                  <ImageIcon size={15} aria-hidden="true" />
                  <span>{photoLabel(detailPhotos.length, t)}</span>
                </div>
                <span className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-semibold ${parseStatusClass(detailCompany.parseStatus)}`}>
                  {detailCompany.parseStatus === "parsing" ? <Loader2 size={13} className="mr-1.5 animate-spin" aria-hidden="true" /> : null}
                  {parseStatusLabel(detailCompany.parseStatus, t)}
                </span>
                <button
                  type="button"
                  onClick={() => void generate(detailCompany.id)}
                  disabled={busy || !detailPhotos.some((photo) => photo.sourceUrl)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-100 transition hover:border-lime-300/35 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  {t.regenerate}
                </button>
              </div>
            </div>
            {detailCompany.parseError ? <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{detailCompany.parseError}</p> : null}

            <section className="rounded-lg border border-white/10 bg-[#070b08] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <ImageIcon size={15} aria-hidden="true" className="text-lime-200" />
                  {t.visuals}
                </h2>
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-xs text-zinc-300">
                  {t.visualProgress} {visualProgress(detailPhotos)}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {detailPhotos.map((photo) => (
                  <article key={photo.id} className="rounded-md border border-white/10 bg-black/20 p-2">
                    {photo.generatedUrl || photo.sourceUrl || previewUrlCache.current.get(photo.id) || photo.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.generatedUrl || photo.sourceUrl || previewUrlCache.current.get(photo.id) || photo.previewUrl}
                        alt={photo.fileName}
                        className="aspect-square w-full rounded border border-white/10 object-cover"
                      />
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs text-zinc-300" title={photo.fileName}>{photo.fileName}</p>
                      {photo.generationStatus !== "waiting" ? (
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${slotStatusClass(photo.generationStatus)}`}>
                          {t.slotStatus[photo.generationStatus]}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => removePhoto(detailCompany.id, photo.id)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-2 text-xs text-zinc-300 transition hover:border-white/25"
                      >
                        <XCircle size={13} aria-hidden="true" />
                        {t.removePhoto}
                      </button>
                      <button
                        type="button"
                        onClick={() => void retryPhoto(photo.id)}
                        disabled={photo.generationStatus === "processing" || !photo.sourceUrl}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-2 text-xs text-zinc-300 transition hover:border-lime-300/35 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw size={13} aria-hidden="true" />
                        {t.retryImage}
                      </button>
                    </div>
                  </article>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputs.current[detailCompany.id]?.click()}
                  disabled={busy || detailCompany.parseStatus === "parsing"}
                  className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-lime-300/25 bg-lime-300/[0.04] p-4 text-center text-lime-100 transition hover:border-lime-300/45 hover:bg-lime-300/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <input
                    ref={(node) => {
                      fileInputs.current[detailCompany.id] = node;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={(event) => void uploadCompanyPhotos(detailCompany.id, event.target.files)}
                  />
                  <Upload size={22} aria-hidden="true" />
                  <span className="text-sm font-semibold">{t.upload}</span>
                  <span className="text-xs text-zinc-500">{photoLabel(detailPhotos.length, t)}</span>
                </button>
                {detailPhotos.length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">{t.markdownEmpty}</div>
                ) : null}
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#070b08] p-4">
              <div className="relative mb-3">
                <Building2
                  size={15}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lime-200/80"
                />
                <input
                  value={detailCompany.name}
                  onChange={(event) =>
                    patchCompany(detailCompany.id, (item) => ({ ...item, name: event.target.value }), true)
                  }
                  placeholder={t.companyName}
                  className="h-10 w-full rounded-md border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none transition focus:border-lime-300/35"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-zinc-500">
                <FileText size={14} aria-hidden="true" className="text-lime-200/70" />
                {t.intro}
              </label>
              <textarea
                value={detailCompany.intro}
                onChange={(event) =>
                  patchCompany(detailCompany.id, (item) => ({ ...item, intro: event.target.value }), true)
                }
                rows={4}
                placeholder={t.introPlaceholder}
                className="mt-2 w-full resize-y rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-zinc-100 outline-none transition focus:border-lime-300/35"
              />
            </section>

            <section className="rounded-lg border border-white/10 bg-[#070b08] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <Package size={15} aria-hidden="true" className="text-lime-200" />
                  {t.products}
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {detailCompany.products.map((product) => (
                  <div key={product.id} className="flex aspect-[3/4] flex-col rounded-md border border-white/10 bg-black/20 p-3">
                    <div className="relative">
                      <Package
                        size={14}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-lime-200/70"
                      />
                      <input
                        value={product.name}
                        onChange={(event) =>
                          patchCompany(detailCompany.id, (item) => ({
                            ...item,
                            products: item.products.map((current) =>
                              current.id === product.id ? { ...current, name: event.target.value } : current
                            ),
                          }), true)
                        }
                        placeholder={t.productName}
                        className="h-9 w-full rounded border border-white/10 bg-white/[0.03] pl-8 pr-2 text-sm text-white outline-none focus:border-lime-300/35"
                      />
                    </div>
                    <div className="relative mt-2 flex-1">
                      <AlignLeft
                        size={14}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-2.5 top-2.5 text-lime-200/70"
                      />
                      <textarea
                        value={product.description}
                        onChange={(event) =>
                          patchCompany(detailCompany.id, (item) => ({
                            ...item,
                            products: item.products.map((current) =>
                              current.id === product.id ? { ...current, description: event.target.value } : current
                            ),
                          }), true)
                        }
                        placeholder={t.productDescription}
                        className="h-full w-full resize-none rounded border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-2 text-sm leading-5 text-zinc-100 outline-none focus:border-lime-300/35"
                      />
                    </div>
                  </div>
                ))}
                {detailCompany.products.length === 0 ? (
                  <p className="rounded-md border border-dashed border-white/10 p-3 text-sm text-zinc-500">{t.noProducts}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#070b08] p-4">
              <h2 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-white">
                <UserRound size={15} aria-hidden="true" className="text-lime-200" />
                {t.contact}
              </h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {(["person", "phone", "email", "website", "address", "raw"] as const).map((key) => {
                  const ContactIcon = contactIcons[key];
                  return (
                    <div key={key} className="relative">
                      <ContactIcon
                        size={14}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lime-200/70"
                      />
                      <input
                        value={detailCompany.contact[key] ?? ""}
                        onChange={(event) =>
                          patchCompany(detailCompany.id, (item) => ({
                            ...item,
                            contact: { ...item.contact, [key]: event.target.value },
                          }), true)
                        }
                        placeholder={t.contactPlaceholders[key]}
                        className="h-10 w-full rounded-md border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none transition focus:border-lime-300/35"
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Photo Enhancement Section */}
            <section className="rounded-lg border border-white/10 bg-[#070b08] p-4">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles size={15} aria-hidden="true" className="text-lime-200" />
                {t.enhancePhotos}
              </h2>

              {detailPhotos.some((p) => p.enhancedStatus === "success" || p.enhancedStatus === "processing" || p.enhancedStatus === "fail") ? (
                <>
                  <div className="mb-3 mt-3 flex items-center justify-between gap-3">
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-xs text-zinc-300">
                      {detailPhotos.filter((p) => p.enhancedStatus === "success").length}/{detailPhotos.filter((p) => p.sourceUrl).length}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {detailPhotos
                      .filter((photo) => photo.sourceUrl)
                      .map((photo) => {
                        if (photo.enhancedStatus === "success" && photo.enhancedUrl) {
                          return (
                            <article key={photo.id} className="rounded-md border border-white/10 bg-black/20 p-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photo.enhancedUrl}
                                alt={photo.fileName}
                                className="aspect-square w-full rounded border border-white/10 object-cover"
                              />
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <p className="min-w-0 truncate text-xs text-zinc-300" title={photo.fileName}>{photo.fileName}</p>
                                <span className="shrink-0 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-100">
                                  {t.slotStatus.success}
                                </span>
                              </div>
                            </article>
                          );
                        }
                        if (photo.enhancedStatus === "processing") {
                          return (
                            <div key={photo.id} className="result-wave flex aspect-square w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04]">
                              <div className="relative z-10 flex flex-col items-center gap-2">
                                <Loader2 size={20} className="animate-spin text-lime-200" />
                                <span className="text-[11px] text-zinc-500">{t.markdownGenerating}</span>
                              </div>
                            </div>
                          );
                        }
                        if (photo.enhancedStatus === "fail") {
                          return (
                            <div key={photo.id} className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-red-500/40 bg-red-500/[0.04] p-4">
                              <span className="text-xs text-red-300">{t.slotStatus.fail}</span>
                              <button
                                type="button"
                                onClick={() => selectedMarkdownLang && void enhancePhotos(selectedMarkdownLang)}
                                className="h-8 rounded border border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-300 transition hover:border-white/25"
                              >
                                {t.enhanceRetry}
                              </button>
                            </div>
                          );
                        }
                        return null;
                      })}
                  </div>
                </>
              ) : (
                <div className="mt-3 flex flex-col items-center gap-4 py-10">
                  <p className="text-xs text-zinc-500">{t.enhanceSelectLang}</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedMarkdownLang}
                      onChange={(e) => setSelectedMarkdownLang(e.target.value)}
                      className="h-9 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300/35"
                    >
                      <option value="" disabled>{t.enhanceSelectLang}</option>
                      {markdownLangs.map(({ code, label }) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => selectedMarkdownLang && void enhancePhotos(selectedMarkdownLang)}
                      disabled={!selectedMarkdownLang}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-lime-300/15 px-4 text-sm font-semibold text-lime-100 transition hover:bg-lime-300/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Sparkles size={14} aria-hidden="true" />
                      {t.markdownGenerate}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-white/10 bg-[#070b08] p-4">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <FileText size={15} aria-hidden="true" className="text-lime-200" />
                {t.markdown}
              </h2>

              {detailCompany.markdown && !markdownLoading ? (
                <>
                  <div className="mb-3 mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedMarkdownLang}
                        onChange={(e) => setSelectedMarkdownLang(e.target.value)}
                        className="h-8 rounded-md border border-white/10 bg-black/20 px-2.5 text-xs text-zinc-100 outline-none focus:border-lime-300/35"
                      >
                        {markdownLangs.map(({ code, label }) => (
                          <option key={code} value={code}>{label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => selectedMarkdownLang && void generateMarkdown(selectedMarkdownLang)}
                        disabled={!selectedMarkdownLang}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-xs font-semibold text-zinc-200 transition hover:border-lime-300/35 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Sparkles size={12} aria-hidden="true" />
                        {t.markdownGenerate}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void copyMarkdown(detailCompany.markdown)}
                        className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-100 transition hover:border-white/25"
                      >
                        <Clipboard size={14} aria-hidden="true" />
                        {t.copyMarkdown}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadMarkdown(detailCompany)}
                        className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-100 transition hover:border-white/25"
                      >
                        <Download size={14} aria-hidden="true" />
                        {t.downloadMarkdown}
                      </button>
                    </div>
                  </div>
                  <div
                    className="prose prose-invert prose-sm max-w-none aspect-[9/16] overflow-auto rounded-md border border-white/10 bg-black/25 p-4 text-sm leading-relaxed text-zinc-200 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-lime-200 [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_strong]:text-white [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:text-xs [&_hr]:border-white/10 [&_p]:my-2 [&_img]:max-w-full [&_img]:rounded-lg"
                    dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(detailCompany.markdown) }}
                  />
                </>
              ) : markdownLoading ? (
                <div className="result-wave mt-3 flex aspect-square w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04]">
                  <div className="relative z-10 flex flex-col items-center gap-2">
                    <Loader2 size={20} className="animate-spin text-lime-200" />
                    <span className="text-[11px] text-zinc-500">{t.markdownGenerating}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-col items-center gap-4 py-10">
                  <p className="text-xs text-zinc-500">{t.markdownSelectLang}</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedMarkdownLang}
                      onChange={(e) => setSelectedMarkdownLang(e.target.value)}
                      className="h-9 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 outline-none focus:border-lime-300/35"
                    >
                      <option value="" disabled>{t.markdownSelectLang}</option>
                      {markdownLangs.map(({ code, label }) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => selectedMarkdownLang && void generateMarkdown(selectedMarkdownLang)}
                      disabled={!selectedMarkdownLang || markdownLoading}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-lime-300/15 px-4 text-sm font-semibold text-lime-100 transition hover:bg-lime-300/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Sparkles size={14} aria-hidden="true" />
                      {t.markdownGenerate}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </section>
        ) : (
          <section className="mt-5 space-y-3">
            {job.companies.map((company, index) => {
              const companyPhotos = job.photos.filter((photo) => company.photoIds.includes(photo.id));
              const canGenerate = companyPhotos.some((photo) => photo.sourceUrl);
              const canViewDetails = company.parseStatus === "parsed" || company.parseStatus === "failed";
              const companyTitle = company.name.trim() || `${t.companyLabel} ${index + 1}`;
              return (
                <article key={company.id} className={`rounded-lg border px-3 py-3 transition ${rowStatusClass(company.parseStatus)}`}>
                  <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_108px_132px_132px_116px_116px_40px] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white" title={companyTitle}>{companyTitle}</p>
                    </div>
                    <span className={`inline-flex h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold ${parseStatusClass(company.parseStatus)}`}>
                      {company.parseStatus === "parsing" ? <Loader2 size={13} className="mr-1.5 animate-spin" aria-hidden="true" /> : null}
                      {parseStatusLabel(company.parseStatus, t)}
                    </span>
                    <div className="flex gap-2">
                      <input
                        ref={(node) => {
                          fileInputs.current[company.id] = node;
                        }}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        onChange={(event) => void uploadCompanyPhotos(company.id, event.target.files)}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputs.current[company.id]?.click()}
                        disabled={busy || company.parseStatus === "parsing"}
                        className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-lime-300/20 bg-lime-300/10 px-2 text-xs font-semibold text-lime-100 transition hover:border-lime-300/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Upload size={14} aria-hidden="true" />
                        {t.uploadWithCount} · {companyPhotos.length}
                      </button>
                      {company.parseStatus === "failed" ? (
                        <button
                          type="button"
                          onClick={() => void parseCompany(company.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-red-300/20 bg-red-500/[0.08] text-red-100 transition hover:border-red-300/40"
                          aria-label={t.retryParse}
                        >
                          <RefreshCw size={14} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    <span className="inline-flex h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-2 font-mono text-xs text-zinc-300">
                      <ImageIcon size={14} className="mr-1.5" aria-hidden="true" />
                      {visualProgress(companyPhotos)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void generate(company.id)}
                      disabled={busy || !canGenerate}
                      className="flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs font-semibold text-zinc-200 transition hover:border-lime-300/30 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={t.generateCompany}
                    >
                      <Sparkles size={15} aria-hidden="true" />
                      {t.generateShort}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailCompanyId(company.id)}
                      disabled={!canViewDetails}
                      className="flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs font-semibold text-zinc-200 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Eye size={15} aria-hidden="true" />
                      {t.viewDetails}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCompany(company.id)}
                      disabled={job.companies.length <= 1}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-red-300/15 bg-red-500/[0.06] text-red-100 transition hover:border-red-300/35 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={t.deleteCompany}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
