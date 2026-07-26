"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Check, Download, Loader2, Plus, RefreshCw, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EcommerceAssetsJob, EcommerceCarouselRole, EcommerceCopyProposal, EcommerceImageSlot, EcommerceSlotCopyOptions } from "@/lib/types";
import { CHUB_TWO_LOGO_URL, CHUB_TWO_PERSON_URL, ECOMMERCE_CAROUSEL_ROLE_COUNTS } from "@/lib/ecommerce-assets";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const roles: EcommerceCarouselRole[] = ["scene", "detail", "variant"];
type UploadItem = { id: string; dataUrl: string; fileName: string };
type PageStatus = "idle" | "reading" | "analyzing" | "choosing" | "starting" | "polling" | "error";

const copy = {
  title: "CHUB TWO TikTok Shop 轮播图",
  subtitle: "上传多个 SKU 和厂家参考图，先生成英文主副标题方案，选择后再生成按素材数量生成的 TikTok Shop 轮播图。",
  sku: "1. 产品 SKU 图片",
  skuHint: "至少上传 1 张。第一张默认作为主产品参考，可设为主图或调整顺序。",
  primary: "主产品参考",
  setPrimary: "设为主图",
  refs: "2. 1688 厂家参考图",
  refsHint: "场景图最多 4 张、细节卖点图最多 3 张、变体规格图 1 张；上传多少就生成多少。主图和规格图可基于 SKU 原创生成。",
  person: "3. 人物参考图",
  personHint: "人物参考已固定。第一张主图固定使用人物，人物位于右侧并用右手向前握住产品。",
  copy: "4. AI 英文文案方案",
  copyHint: "每个实际生成的轮播图提供 3 个方案，请逐张选择。",
  brand: "固定品牌配置",
  brandHint: "CHUB TWO · Apple-like · white background / black type · English · 1:1 · 1K · futuristic for young consumers",
  analyze: "生成文案方案",
  analyzing: "AI 正在解析原图…",
  generate: "确认文案并生成图片",
  generating: "生成中…",
  result: "5. 生成结果",
  empty: "完成文案选择并生成后，结果会显示在这里。",
  needSku: "请至少上传 1 张产品 SKU 图片。",
  needRefs: "请完成所有厂家参考图分组。",
  needCopy: "请为每张将要生成的图片选择一个英文文案方案。",
  upload: "上传",
  remove: "移除",
  failed: "操作失败",
  retry: "重试",
  download: "下载",
};

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="rounded-xl border border-white/10 bg-[#151514] p-5"><h2 className="text-base font-semibold text-zinc-100">{title}</h2>{subtitle ? <p className="mt-1 text-xs leading-5 text-zinc-500">{subtitle}</p> : null}<div className="mt-4">{children}</div></section>;
}

function readImage(file: File) {
  if (!IMAGE_TYPES.has(file.type)) return Promise.reject(new Error("请使用 PNG、JPG 或 WEBP 图片。"));
  if (file.size > MAX_IMAGE_BYTES) return Promise.reject(new Error("每张图片不能超过 10MB。"));
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("图片读取失败。")); reader.readAsDataURL(file); });
}

function UploadTile({ item, label, disabled, onUpload, onRemove }: { item?: UploadItem; label: string; disabled?: boolean; onUpload: (file: File) => void; onRemove?: () => void }) {
  return <label className={`group relative flex min-h-32 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-emerald-300/20 bg-[#050806] text-center hover:border-lime-300/50 ${disabled ? "pointer-events-none opacity-60" : ""}`}>{item ? <><img src={item.dataUrl} alt={label} className="aspect-square w-full object-contain" /><span className="absolute bottom-0 left-0 right-0 truncate bg-black/75 px-2 py-1 text-[11px] text-zinc-300">{item.fileName}</span>{onRemove ? <button type="button" onClick={(event) => { event.preventDefault(); onRemove(); }} className="absolute right-2 top-2 rounded-full bg-black/75 p-1.5 text-white opacity-0 group-hover:opacity-100"><X size={13} /></button> : null}</> : <><Upload size={20} className="text-lime-200" /><span className="mt-2 text-xs font-semibold text-zinc-300">{label}</span></>}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }} /></label>;
}

function roleLabel(role: EcommerceCarouselRole) {
  return { main: "第一张主图（纯白底）", scene: "场景图", detail: "细节卖点图", variant: "变体规格图" }[role];
}

function StatusBadge({ status }: { status: EcommerceImageSlot["status"] }) {
  const label = status === "success" ? "已完成" : status === "fail" ? "失败" : status === "processing" ? "生成中" : "等待生成";
  return <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${status === "success" ? "bg-lime-300/15 text-lime-200" : status === "fail" ? "bg-red-500/15 text-red-200" : "bg-white/10 text-zinc-400"}`}>{status === "processing" ? <Loader2 size={12} className="mr-1 inline animate-spin" /> : null}{label}</span>;
}

export default function EcommerceAssetsPage() {
  const [status, setStatus] = useState<PageStatus>("idle");
  const [error, setError] = useState("");
  const [skus, setSkus] = useState<UploadItem[]>([]);
  const [refs, setRefs] = useState<Record<EcommerceCarouselRole, UploadItem[]>>({ main: [], scene: [], detail: [], variant: [] });
  const [copyOptions, setCopyOptions] = useState<EcommerceSlotCopyOptions[]>([]);
  const [selectedCopy, setSelectedCopy] = useState<Record<string, EcommerceCopyProposal>>({});
  const [job, setJob] = useState<EcommerceAssetsJob | null>(null);
  const [editingSlot, setEditingSlot] = useState<EcommerceImageSlot | null>(null);
  const [editSkuIndex, setEditSkuIndex] = useState(0);
  const [editTitle, setEditTitle] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editRefinement, setEditRefinement] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = status === "reading" || status === "analyzing" || status === "starting" || status === "polling";
  const selectedAll = copyOptions.length > 0 && copyOptions.every((slot) => Boolean(selectedCopy[slot.slotId]));

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function addSkuFiles(files: FileList | File[]) {
    setStatus("reading"); setError("");
    try {
      const next = await Promise.all(Array.from(files).map(async (file) => ({ id: crypto.randomUUID(), dataUrl: await readImage(file), fileName: file.name })));
      setSkus((current) => [...current, ...next]); setStatus("idle"); setJob(null);
    } catch (e) { setError(e instanceof Error ? e.message : copy.failed); setStatus("error"); }
  }

  async function addRef(role: EcommerceCarouselRole, file: File) { if (refs[role].length >= ECOMMERCE_CAROUSEL_ROLE_COUNTS[role]) return; setStatus("reading"); setError(""); try { const item = { id: crypto.randomUUID(), dataUrl: await readImage(file), fileName: file.name }; setRefs((current) => ({ ...current, [role]: [...current[role], item] })); setStatus("idle"); setJob(null); } catch (e) { setError(e instanceof Error ? e.message : copy.failed); setStatus("error"); } }

  function setPrimary(index: number) { setSkus((current) => { if (index <= 0 || index >= current.length) return current; return [current[index], ...current.slice(0, index), ...current.slice(index + 1)]; }); }
  function moveSku(index: number, direction: -1 | 1) { const target = index + direction; setSkus((current) => { if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; }); }
  function removeSku(id: string) { setSkus((current) => current.filter((item) => item.id !== id)); }

  async function analyze() {
    if (!skus.length) return setError(copy.needSku);
    setStatus("analyzing"); setError("");
    try {
      const response = await fetch("/api/ecommerce-assets/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productSkuDataUrls: skus.map((item) => item.dataUrl), manufacturerReferenceGroups: roles.map((role) => ({ role, dataUrls: refs[role].map((item) => item.dataUrl) })) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setCopyOptions(result.slots); setSelectedCopy({}); setStatus("choosing");
    } catch (e) { setError(e instanceof Error ? e.message : copy.failed); setStatus("error"); }
  }

  async function poll(current: EcommerceAssetsJob) { const response = await fetch("/api/ecommerce-assets/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job: current }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setJob(result.job); if (result.job.status === "processing") timer.current = setTimeout(() => void poll(result.job), 4000); else setStatus(result.job.status === "failed" ? "error" : "idle"); }
  async function generate() {
    if (!skus.length) return setError(copy.needSku); if (!selectedAll) return setError(copy.needCopy);
    setStatus("starting"); setError("");
    try {
      const response = await fetch("/api/ecommerce-assets/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productSkuDataUrls: skus.map((item) => item.dataUrl), primarySkuIndex: 0, manufacturerReferenceGroups: roles.map((role) => ({ role, dataUrls: refs[role].map((item) => item.dataUrl) })), selectedCopyBySlot: selectedCopy }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); setJob(result.job); setStatus("polling"); void poll(result.job);
    } catch (e) { setError(e instanceof Error ? e.message : copy.failed); setStatus("error"); }
  }
  async function retry(slot: EcommerceImageSlot) { if (!job) return; try { const response = await fetch("/api/ecommerce-assets/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job, slotId: slot.id }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); const updated = { ...job, status: "processing" as const, carouselImages: job.carouselImages.map((item) => item.id === slot.id ? { ...item, taskId: result.taskId, status: "waiting" as const, error: undefined } : item) }; setJob(updated); setStatus("polling"); void poll(updated); } catch (e) { setError(e instanceof Error ? e.message : copy.failed); } }
  function openRegenerate(slot: EcommerceImageSlot) { setEditingSlot(slot); setEditSkuIndex(0); setEditTitle(slot.selectedCopy?.title ?? ""); setEditSubtitle(slot.selectedCopy?.subtitle ?? ""); setEditRefinement(""); setError(""); }
  async function regenerate() {
    if (!job || !editingSlot || !editTitle.trim() || !editSubtitle.trim()) return;
    setRegenerating(true); setError("");
    try {
      const response = await fetch("/api/ecommerce-assets/regenerate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job, slotId: editingSlot.id, skuIndex: editSkuIndex, title: editTitle, subtitle: editSubtitle, refinement: editRefinement }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      const updated = { ...job, status: "processing" as const, carouselImages: job.carouselImages.map((item) => item.id === editingSlot.id ? { ...item, taskId: result.taskId, prompt: result.prompt, selectedCopy: result.selectedCopy, status: "waiting" as const, resultUrl: undefined, error: undefined } : item) };
      setJob(updated); setEditingSlot(null); setStatus("polling"); void poll(updated);
    } catch (e) { setError(e instanceof Error ? e.message : copy.failed); } finally { setRegenerating(false); }
  }
  async function zip() { if (!job) return; const response = await fetch("/api/ecommerce-assets/zip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job }) }); if (!response.ok) return setError(copy.failed); const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `chub-two-carousel-${job.id}.zip`; link.click(); URL.revokeObjectURL(url); }

  return <main className="min-h-screen bg-[#0b0b0a] text-zinc-100"><div className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8"><div className="mb-8 flex items-center justify-between border-b border-white/10 pb-5"><Link href="/" className="text-sm font-semibold text-zinc-300 hover:text-white">← 返回首页</Link><span className="text-xs text-zinc-500">CHUB TWO · TikTok Shop</span></div><header className="mb-8"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-xs font-semibold text-lime-200"><Sparkles size={13} /> CHUB TWO visual workstation</div><h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{copy.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">{copy.subtitle}</p></header>{error ? <div className="mb-5 flex justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"><span>{error}</span><button type="button" onClick={() => setError("")}><X size={16} /></button></div> : null}<div className="space-y-5">
    <Panel title={copy.sku} subtitle={copy.skuHint}><label className="mb-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-lime-300/30 bg-lime-300/5 px-4 py-4 text-sm font-semibold text-lime-200 hover:bg-lime-300/10"><Plus size={17} /> 上传多个 SKU 图片<input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={busy} onChange={(event) => { if (event.target.files) void addSkuFiles(event.target.files); event.currentTarget.value = ""; }} /></label><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{skus.map((item, index) => <div key={item.id} className={`relative rounded-lg border p-2 ${index === 0 ? "border-lime-300/60 bg-lime-300/10" : "border-white/10 bg-black/20"}`}><img src={item.dataUrl} alt={item.fileName} className="aspect-square w-full rounded-md object-contain" /><div className="mt-2 truncate text-xs text-zinc-300">{item.fileName}</div><div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-zinc-500"><span>{index === 0 ? <span className="text-lime-200">{copy.primary}</span> : <button type="button" onClick={() => setPrimary(index)} className="text-zinc-300 hover:text-lime-200">{copy.setPrimary}</button>}</span><span className="flex gap-1"><button type="button" disabled={index === 0} onClick={() => moveSku(index, -1)} className="rounded border border-white/10 p-1 disabled:opacity-30"><ArrowUp size={12} /></button><button type="button" disabled={index === skus.length - 1} onClick={() => moveSku(index, 1)} className="rounded border border-white/10 p-1 disabled:opacity-30"><ArrowDown size={12} /></button><button type="button" onClick={() => removeSku(item.id)} className="rounded border border-white/10 p-1 text-red-300/70"><X size={12} /></button></span></div></div>)}</div></Panel>
    <Panel title={copy.refs} subtitle={copy.refsHint}><div className="space-y-5">{roles.map((role) => <div key={role}><div className="mb-2 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-zinc-200">{roleLabel(role)}</h3><p className="text-xs text-zinc-500">{refs[role].length}/{ECOMMERCE_CAROUSEL_ROLE_COUNTS[role]}</p></div><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-300/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/10"><Plus size={14} /> {copy.upload}<input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={busy || refs[role].length >= ECOMMERCE_CAROUSEL_ROLE_COUNTS[role]} onChange={(event) => { for (const file of Array.from(event.target.files ?? []).slice(0, ECOMMERCE_CAROUSEL_ROLE_COUNTS[role] - refs[role].length)) void addRef(role, file); event.currentTarget.value = ""; }} /></label></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{refs[role].map((item) => <UploadTile key={item.id} item={item} label={roleLabel(role)} disabled={busy} onUpload={(file) => void addRef(role, file)} onRemove={() => setRefs((current) => ({ ...current, [role]: current[role].filter((candidate) => candidate.id !== item.id) }))} />)}{Array.from({ length: ECOMMERCE_CAROUSEL_ROLE_COUNTS[role] - refs[role].length }, (_, index) => <UploadTile key={`${role}-${index}`} label={`${copy.upload} ${refs[role].length + index + 1}`} disabled={busy} onUpload={(file) => void addRef(role, file)} />)}</div></div>)}</div></Panel>
    <Panel title={copy.person} subtitle={copy.personHint}><div className="flex max-w-md items-center gap-4 rounded-lg border border-white/10 bg-black/20 p-3"><img src={CHUB_TWO_PERSON_URL} alt="CHUB TWO fixed person reference" className="h-28 w-28 rounded-md object-cover" /><div className="text-xs leading-5 text-zinc-400">固定使用该人物参考图，不需要重复上传。仅用于第一张主图。</div></div></Panel>
    <Panel title={copy.brand} subtitle={copy.brandHint}><div className="flex items-center gap-4 rounded-lg border border-white/10 bg-black/20 p-3"><img src={CHUB_TWO_LOGO_URL} alt="CHUB TWO logo" className="h-12 w-12 object-contain" /><div className="text-xs leading-5 text-zinc-400">Logo 固定使用左上角；第一张纯白底主图不添加 logo。</div></div></Panel>
    <button type="button" onClick={() => void analyze()} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-lime-300 text-sm font-semibold text-zinc-950 hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400">{status === "analyzing" ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />} {status === "analyzing" ? copy.analyzing : copy.analyze}</button>
    {copyOptions.length ? <Panel title={copy.copy} subtitle={copy.copyHint}><div className="space-y-5">{copyOptions.map((slot) => <div key={slot.slotId} className="rounded-lg border border-white/10 bg-black/20 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-zinc-100">{slot.title}</h3>{selectedCopy[slot.slotId] ? <span className="text-xs text-lime-200">已选择</span> : <span className="text-xs text-zinc-500">请选择</span>}</div><div className="grid gap-3 md:grid-cols-3">{slot.proposals.map((proposal) => <button type="button" key={proposal.id} onClick={() => setSelectedCopy((current) => ({ ...current, [slot.slotId]: proposal }))} className={`rounded-lg border p-3 text-left ${selectedCopy[slot.slotId]?.id === proposal.id ? "border-lime-300/70 bg-lime-300/10" : "border-white/10 hover:border-lime-300/30"}`}><div className="flex items-start justify-between gap-2 text-sm font-semibold text-white"><span>{proposal.title}</span>{selectedCopy[slot.slotId]?.id === proposal.id ? <Check size={15} className="shrink-0 text-lime-200" /> : null}</div><p className="mt-2 text-xs leading-5 text-zinc-400">{proposal.subtitle}</p></button>)}</div></div>)}</div></Panel> : null}
    {copyOptions.length ? <button type="button" onClick={() => void generate()} disabled={busy || !selectedAll} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-lime-300 text-sm font-semibold text-zinc-950 hover:bg-lime-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400">{status === "starting" ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />} {status === "starting" ? copy.generating : copy.generate}</button> : null}
    <Panel title={copy.result} subtitle={job ? `${job.carouselImages.filter((item) => item.status === "success").length}/${job.carouselImages.length}` : copy.empty}><div className="mb-4 flex justify-end">{job?.status === "completed" ? <button type="button" onClick={() => void zip()} className="inline-flex items-center gap-2 rounded-md border border-lime-300/30 px-3 py-2 text-xs font-semibold text-lime-200"><Download size={14} /> {copy.download} ZIP</button> : null}</div>{job ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{job.carouselImages.map((slot) => <article key={slot.id} className="overflow-hidden rounded-lg border border-white/10 bg-black/20"><div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2"><span className="truncate text-xs font-semibold">{slot.title}</span><StatusBadge status={slot.status} /></div>{slot.resultUrl ? <img src={slot.resultUrl} alt={slot.title} className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center text-xs text-zinc-600">{slot.status === "processing" ? <Loader2 size={22} className="animate-spin" /> : slot.status === "fail" ? slot.error || copy.failed : "等待生成"}</div>}<div className="flex items-center justify-between p-3 text-[11px] text-zinc-500"><span>{slot.usePerson ? "使用人物" : "不使用人物"}</span><span className="flex items-center gap-3">{slot.status === "fail" ? <button type="button" onClick={() => void retry(slot)} className="inline-flex items-center gap-1 text-lime-200"><RefreshCw size={13} /> {copy.retry}</button> : null}{slot.resultUrl ? <a href={slot.resultUrl} target="_blank" rel="noreferrer" download className="inline-flex items-center gap-1 text-zinc-300"><Download size={13} /> {copy.download}</a> : null}<button type="button" disabled={busy || regenerating} onClick={() => openRegenerate(slot)} className="inline-flex items-center gap-1 text-zinc-300 hover:text-lime-200"><RefreshCw size={13} /> 重新生成</button></span></div></article>)}</div> : <div className="rounded-lg border border-dashed border-white/10 py-20 text-center text-sm text-zinc-600">{copy.empty}</div>}</Panel>
  </div></div>{editingSlot ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5" role="dialog" aria-modal="true" aria-label="重新生成图片"><div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#171716] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">重新生成 · {editingSlot.title}</h2><p className="mt-1 text-xs text-zinc-500">选择一个 SKU，修改英文标题、副标题，并补充具体修改要求。</p></div><button type="button" onClick={() => setEditingSlot(null)} className="rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><X size={17} /></button></div><div className="mt-5"><p className="mb-2 text-xs font-semibold text-zinc-300">使用哪个 SKU</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{job?.productSkuImageUrls.map((url, index) => <button type="button" key={`${url}-${index}`} onClick={() => setEditSkuIndex(index)} className={`rounded-lg border p-2 text-left ${editSkuIndex === index ? "border-lime-300/70 bg-lime-300/10" : "border-white/10 hover:border-lime-300/30"}`}><img src={url} alt={`SKU ${index + 1}`} className="aspect-square w-full rounded-md object-contain" /><span className="mt-2 block text-xs text-zinc-300">SKU {index + 1}{index === 0 ? " · 主参考" : ""}</span></button>)}</div></div><label className="mt-5 block text-xs font-semibold text-zinc-300">English title<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/60" /></label><label className="mt-4 block text-xs font-semibold text-zinc-300">English subtitle<textarea value={editSubtitle} onChange={(event) => setEditSubtitle(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/60" /></label><label className="mt-4 block text-xs font-semibold text-zinc-300">更改要求（可选）<textarea value={editRefinement} onChange={(event) => setEditRefinement(event.target.value)} rows={4} placeholder="例如：人物再大一些，产品放在右下角，不要出现额外文字。" className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-lime-300/60" /></label><div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setEditingSlot(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">取消</button><button type="button" disabled={regenerating || !editTitle.trim() || !editSubtitle.trim()} onClick={() => void regenerate()} className="inline-flex items-center gap-2 rounded-lg bg-lime-300 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:bg-zinc-700 disabled:text-zinc-400">{regenerating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}确认重新生成</button></div></div></div> : null}</main>;
}
