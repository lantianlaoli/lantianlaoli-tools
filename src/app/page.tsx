"use client";

import Link from "next/link";
import { ArrowRight, Images, Layers3, Sparkles, Video } from "lucide-react";
import { useState } from "react";
import {
  ECOMMERCE_LANGUAGE_STORAGE_KEY,
  normalizeEcommerceTextLanguage,
} from "@/lib/ecommerce-language";
import type { EcommerceTextLanguage } from "@/lib/types";

const features = {
  zh: [
    {
      href: "/bulk-clone",
      title: "批量克隆照片",
      description: "从 XLSX 读取产品信息、参考图和行级要求，批量生成商品图并支持重生成与 ZIP 下载。",
      icon: Layers3,
      meta: "XLSX · 批量 · 图片",
      action: "打开工作台",
    },
    {
      href: "/ecommerce-assets",
      title: "电商图片 + 视频素材一键生成",
      description: "上传产品照片，自动生成轮播图、详情图和 1 条广告短片。",
      icon: Sparkles,
      meta: "Image2 · Seedance 2 Fast · 多比例",
      action: "打开工作台",
    },
  ],
  en: [
    {
      href: "/bulk-clone",
      title: "Bulk Photo Clone",
      description: "Read product details, reference images, and row-level requirements from XLSX files, then generate images in batches.",
      icon: Layers3,
      meta: "XLSX · Batch · Images",
      action: "Open workspace",
    },
    {
      href: "/ecommerce-assets",
      title: "Ecommerce Images + Video",
      description: "Upload product photos, then generate carousel images, detail images, and an ad video in one flow.",
      icon: Sparkles,
      meta: "Image2 · Seedance 2 Fast · Multi-ratio",
      action: "Open workspace",
    },
  ],
} satisfies Record<EcommerceTextLanguage, Array<{
  href: string;
  title: string;
  description: string;
  icon: typeof Layers3;
  meta: string;
  action: string;
}>>;

const copy = {
  zh: {
    utility: "电商创意工具",
    eyebrow: "产品素材生成",
    title: "选择一个生成工作台",
    body: "保留原有批量克隆照片流程，同时新增面向电商商品图和广告视频的一键生成入口。",
    languageLabel: "项目语言",
  },
  en: {
    utility: "Commerce creative tools",
    eyebrow: "Product media generation",
    title: "Choose a generation workspace",
    body: "Use the original batch photo clone flow, or generate ecommerce product images and ad videos from product photos.",
    languageLabel: "Project language",
  },
} satisfies Record<EcommerceTextLanguage, Record<string, string>>;

function featureHref(href: string, language: EcommerceTextLanguage) {
  if (href !== "/ecommerce-assets") return href;
  return `${href}?lang=${language}`;
}

function initialProjectLanguage(): EcommerceTextLanguage {
  if (typeof window === "undefined") return "zh";
  return normalizeEcommerceTextLanguage(window.localStorage.getItem(ECOMMERCE_LANGUAGE_STORAGE_KEY));
}

export default function Home() {
  const [language, setLanguage] = useState<EcommerceTextLanguage>(initialProjectLanguage);
  const t = copy[language];

  function chooseLanguage(nextLanguage: EcommerceTextLanguage) {
    setLanguage(nextLanguage);
    window.localStorage.setItem(ECOMMERCE_LANGUAGE_STORAGE_KEY, nextLanguage);
  }

  return (
    <main className="min-h-screen bg-[#10100f] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 md:px-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-2xl font-semibold tracking-tight">Rivora</p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
              <Images size={15} aria-hidden="true" />
              <span>{t.utility}</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">
              <span className="text-[11px] font-medium text-zinc-500">{t.languageLabel}</span>
              <div className="flex gap-0.5 rounded bg-black/30 p-0.5">
                {(["zh", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => chooseLanguage(lang)}
                    className={`h-7 rounded px-2 text-[11px] font-semibold transition ${
                      language === lang
                        ? "bg-lime-300 text-zinc-950"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    {lang === "zh" ? "中文" : "EN"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-10">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-xs font-semibold text-lime-100">
              <Video size={14} aria-hidden="true" />
              {t.eyebrow}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              {t.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
              {t.body}
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {features[language].map((feature) => {
              const Icon = feature.icon;
              return (
                <Link
                  key={feature.href}
                  href={featureHref(feature.href, language)}
                  className="group flex min-h-[260px] flex-col justify-between rounded-lg border border-white/10 bg-white/[0.04] p-6 transition hover:border-lime-300/40 hover:bg-white/[0.07]"
                >
                  <div>
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-black/25 text-lime-100">
                      <Icon size={24} aria-hidden="true" />
                    </div>
                    <p className="mb-2 font-mono text-xs text-zinc-500">{feature.meta}</p>
                    <h2 className="text-xl font-semibold text-white">{feature.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">{feature.description}</p>
                  </div>
                  <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-lime-100">
                    {feature.action}
                    <ArrowRight size={17} aria-hidden="true" className="transition group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
