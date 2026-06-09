"use client";

import Link from "next/link";
import { ArrowLeft, Banknote, Calculator, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const FALLBACK_USD_CNY_RATE = 6.8;
const FALLBACK_CNY_TO_USD_RATE = 1 / FALLBACK_USD_CNY_RATE;
const FRANKFURTER_CNY_USD_URL = "https://api.frankfurter.dev/v2/rate/CNY/USD";
const RMB_MULTIPLIER_RANGE = { min: 1, max: 2, step: 0.05 };
const USD_MULTIPLIER_RANGE = { min: 1, max: 2, step: 0.05 };

type FxRateState = {
  rate: number;
  loading: boolean;
  error: boolean;
  updatedDate?: string;
};

const copy = {
  zh: {
    back: "返回首页",
    eyebrow: "Quote · RMB · USD",
    title: "核价工具",
    body: "输入批发平台拿到的人民币价格，选择销售倍率，快速得到人民币售价和美元建议售价。",
    wholesaleLabel: "批发平台价格",
    wholesalePlaceholder: "例如 100",
    rmbMultiplierLabel: "人民币销售倍率",
    usdMultiplierLabel: "美元售价倍率",
    multiplierInput: "倍率数值",
    reset: "重置",
    resultTitle: "核价结果",
    rmbSalePrice: "人民币售价",
    usdSuggestedPrice: "美元建议售价",
    formula: "美元建议售价 = 人民币售价 × CNY/USD 汇率 × 美元售价倍率",
    invalid: "—",
    rateLoading: "正在获取实时汇率...",
    rateLive: "实时汇率：1 CNY = {rate} USD",
    rateFallback: "汇率获取失败，使用固定 1 USD = 6.8 CNY",
    updated: "更新日期：{date}",
  },
  en: {
    back: "Back to home",
    eyebrow: "Quote · RMB · USD",
    title: "Quote Tool",
    body: "Enter the CNY wholesale-platform price, choose markups, and get the RMB sale price plus USD suggested price.",
    wholesaleLabel: "Wholesale platform price",
    wholesalePlaceholder: "e.g. 100",
    rmbMultiplierLabel: "RMB sale multiplier",
    usdMultiplierLabel: "USD price multiplier",
    multiplierInput: "Multiplier value",
    reset: "Reset",
    resultTitle: "Quote result",
    rmbSalePrice: "RMB sale price",
    usdSuggestedPrice: "USD suggested price",
    formula: "USD suggested price = RMB sale price × CNY/USD rate × USD multiplier",
    invalid: "—",
    rateLoading: "Fetching live FX rate...",
    rateLive: "Live rate: 1 CNY = {rate} USD",
    rateFallback: "FX fetch failed. Using fixed 1 USD = 6.8 CNY",
    updated: "Updated: {date}",
  },
} as const;

type Copy = (typeof copy)[keyof typeof copy];

function parseNonNegative(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatCny(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMultiplier(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatRate(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 5,
    maximumFractionDigits: 6,
  }).format(value);
}

function replaceToken(template: string, token: string, value: string) {
  return template.replace(`{${token}}`, value);
}

function MultiplierControl(props: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: string) => void;
  inputLabel: string;
}) {
  const parsed = parseNonNegative(props.value);
  const sliderValue = parsed === null ? props.min : Math.min(Math.max(parsed, props.min), props.max);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{props.label}</span>
        {parsed !== null ? (
          <span className="font-mono text-xs text-lime-100">{formatMultiplier(parsed)}X</span>
        ) : null}
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-black/20 px-3 py-3">
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={sliderValue}
          onChange={(e) => props.onChange(e.target.value)}
          className="block w-full accent-lime-300"
          aria-label={props.label}
        />
        <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-600">
          <span>{formatMultiplier(props.min)}X</span>
          <span>{formatMultiplier(props.max)}X</span>
        </div>
      </div>

      <label className="mt-3 block">
        <span className="sr-only">{props.inputLabel}</span>
        <div className="flex items-center rounded-md border border-white/10 bg-black/30 px-3 focus-within:border-lime-300/60">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={props.step}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            className="w-full bg-transparent py-2 text-base text-white outline-none placeholder:text-zinc-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            placeholder={props.inputLabel}
          />
          <span className="ml-2 font-mono text-xs text-zinc-500">X</span>
        </div>
      </label>
    </div>
  );
}

function ResultCard(props: {
  label: string;
  value: string;
  tone: "rmb" | "usd";
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{props.label}</p>
      <p
        className={`mt-2 break-words font-mono text-3xl font-semibold tracking-normal sm:text-4xl ${
          props.tone === "usd" ? "text-lime-100" : "text-white"
        }`}
      >
        {props.value}
      </p>
    </div>
  );
}

export default function FxCalculatorPage() {
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const t: Copy = copy[language];

  const [wholesaleRaw, setWholesaleRaw] = useState("100");
  const [rmbMultiplierRaw, setRmbMultiplierRaw] = useState("1.5");
  const [usdMultiplierRaw, setUsdMultiplierRaw] = useState("1.2");
  const [fxRate, setFxRate] = useState<FxRateState>({
    rate: FALLBACK_CNY_TO_USD_RATE,
    loading: true,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchFxRate() {
      try {
        const response = await fetch(FRANKFURTER_CNY_USD_URL);
        if (!response.ok) throw new Error("Failed to fetch FX rate.");
        const payload = await response.json() as { rate?: unknown; date?: unknown };
        const nextRate = typeof payload.rate === "number" ? payload.rate : Number(payload.rate);
        if (!Number.isFinite(nextRate) || nextRate <= 0) throw new Error("Invalid FX rate.");
        if (!cancelled) {
          setFxRate({
            rate: nextRate,
            loading: false,
            error: false,
            updatedDate: typeof payload.date === "string" ? payload.date : undefined,
          });
        }
      } catch {
        if (!cancelled) {
          setFxRate({
            rate: FALLBACK_CNY_TO_USD_RATE,
            loading: false,
            error: true,
          });
        }
      }
    }

    void fetchFxRate();

    return () => {
      cancelled = true;
    };
  }, []);

  const wholesalePrice = useMemo(() => parseNonNegative(wholesaleRaw), [wholesaleRaw]);
  const rmbMultiplier = useMemo(() => parseNonNegative(rmbMultiplierRaw), [rmbMultiplierRaw]);
  const usdMultiplier = useMemo(() => parseNonNegative(usdMultiplierRaw), [usdMultiplierRaw]);

  const rmbSalePrice = wholesalePrice !== null && rmbMultiplier !== null
    ? wholesalePrice * rmbMultiplier
    : null;
  const usdSuggestedPrice = rmbSalePrice !== null && usdMultiplier !== null
    ? rmbSalePrice * fxRate.rate * usdMultiplier
    : null;

  const rateText = fxRate.loading
    ? t.rateLoading
    : fxRate.error
      ? t.rateFallback
      : replaceToken(t.rateLive, "rate", formatRate(fxRate.rate));

  const resetAll = useCallback(() => {
    setWholesaleRaw("100");
    setRmbMultiplierRaw("1.5");
    setUsdMultiplierRaw("1.2");
  }, []);

  return (
    <main className="min-h-screen bg-[#10100f] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 md:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-lime-100 transition hover:text-lime-200"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {t.back}
          </Link>
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">
            <span className="text-[11px] font-medium text-zinc-500">EN / 中</span>
            <div className="flex gap-0.5 rounded bg-black/30 p-0.5">
              {(["zh", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className={`h-7 rounded px-2 text-[11px] font-semibold transition ${
                    language === lang ? "bg-lime-300 text-zinc-950" : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {lang === "zh" ? "中文" : "EN"}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="flex flex-1 flex-col py-8">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-xs font-semibold text-lime-100">
              <Calculator size={14} aria-hidden="true" />
              {t.eyebrow}
            </p>
            <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">{t.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{t.body}</p>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.05fr]">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {t.wholesaleLabel}
                </p>
                <button
                  type="button"
                  onClick={resetAll}
                  className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-semibold text-zinc-400 transition hover:border-lime-300/40 hover:text-lime-100"
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  {t.reset}
                </button>
              </div>

              <label className="mt-2 block">
                <span className="sr-only">{t.wholesaleLabel}</span>
                <div className="flex items-center rounded-md border border-white/10 bg-black/30 px-3 focus-within:border-lime-300/60">
                  <span className="mr-1 text-base text-zinc-500">¥</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={wholesaleRaw}
                    onChange={(e) => setWholesaleRaw(e.target.value)}
                    className="w-full bg-transparent py-2 text-base text-white outline-none placeholder:text-zinc-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder={t.wholesalePlaceholder}
                  />
                </div>
              </label>

              <div className="mt-6 space-y-6">
                <MultiplierControl
                  label={t.rmbMultiplierLabel}
                  value={rmbMultiplierRaw}
                  min={RMB_MULTIPLIER_RANGE.min}
                  max={RMB_MULTIPLIER_RANGE.max}
                  step={RMB_MULTIPLIER_RANGE.step}
                  onChange={setRmbMultiplierRaw}
                  inputLabel={t.multiplierInput}
                />
                <MultiplierControl
                  label={t.usdMultiplierLabel}
                  value={usdMultiplierRaw}
                  min={USD_MULTIPLIER_RANGE.min}
                  max={USD_MULTIPLIER_RANGE.max}
                  step={USD_MULTIPLIER_RANGE.step}
                  onChange={setUsdMultiplierRaw}
                  inputLabel={t.multiplierInput}
                />
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-center gap-2">
                <Banknote size={16} aria-hidden="true" className="text-lime-100" />
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.resultTitle}</p>
              </div>

              <div className="mt-4 grid gap-3">
                <ResultCard
                  label={t.rmbSalePrice}
                  value={rmbSalePrice === null ? t.invalid : formatCny(rmbSalePrice)}
                  tone="rmb"
                />
                <ResultCard
                  label={t.usdSuggestedPrice}
                  value={usdSuggestedPrice === null ? t.invalid : formatUsd(usdSuggestedPrice)}
                  tone="usd"
                />
              </div>

              <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
                <p className={`text-xs ${fxRate.error ? "text-amber-200" : "text-zinc-400"}`}>{rateText}</p>
                {!fxRate.loading && !fxRate.error && fxRate.updatedDate ? (
                  <p className="mt-1 text-[11px] text-zinc-600">
                    {replaceToken(t.updated, "date", fxRate.updatedDate)}
                  </p>
                ) : null}
              </div>

              <p className="mt-4 text-[11px] leading-5 text-zinc-600">
                {t.formula}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
