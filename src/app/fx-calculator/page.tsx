"use client";

import Link from "next/link";
import { ArrowLeft, Banknote, RotateCcw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

const USD_CNY_RATE = 6.8;

type Tier = {
  id: string;
  nameZh: string;
  nameEn: string;
  multiplier: number;
};

const DEFAULT_TIERS: Tier[] = [
  { id: "tier-1", nameZh: "成本价", nameEn: "Cost", multiplier: 1.0 },
  { id: "tier-2", nameZh: "批发价", nameEn: "Wholesale", multiplier: 1.4 },
  { id: "tier-3", nameZh: "零售价", nameEn: "Retail", multiplier: 2.0 },
];

const copy = {
  zh: {
    back: "返回首页",
    eyebrow: "FX · Markup · USD",
    title: "汇率加价计算器",
    body: "输入人民币成本,设定 3 档独立可调的加价倍数,自动算出每档的 RMB 售价与 USD 售价。",
    rateNote: "汇率固定 1 USD = 6.8 CNY",
    costLabel: "人民币成本",
    costPlaceholder: "例如 100",
    tiersTitle: "价格档位",
    tierNamePlaceholder: "档位名称",
    multiplierLabel: "加价倍数",
    summaryTitle: "3 档售价一览",
    tableTier: "档位",
    tableMultiplier: "倍数",
    tableRmb: "人民币",
    tableUsd: "美元",
    reset: "重置全部",
  },
  en: {
    back: "Back to home",
    eyebrow: "FX · Markup · USD",
    title: "FX Markup Calculator",
    body: "Enter a CNY cost, set three independent markup tiers, and get the RMB and USD price for each.",
    rateNote: "Fixed rate: 1 USD = 6.8 CNY",
    costLabel: "CNY cost",
    costPlaceholder: "e.g. 100",
    tiersTitle: "Price tiers",
    tierNamePlaceholder: "Tier name",
    multiplierLabel: "Markup",
    summaryTitle: "All three tiers",
    tableTier: "Tier",
    tableMultiplier: "Markup",
    tableRmb: "CNY",
    tableUsd: "USD",
    reset: "Reset all",
  },
} as const;

type Copy = (typeof copy)[keyof typeof copy];

function parseCost(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatCny(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function FxCalculatorPage() {
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const t: Copy = copy[language];

  const [costRaw, setCostRaw] = useState("100");
  const [tiers, setTiers] = useState<Tier[]>(() =>
    DEFAULT_TIERS.map((tier) => ({ ...tier })),
  );

  const cost = useMemo(() => parseCost(costRaw), [costRaw]);

  const updateTier = useCallback((id: string, patch: Partial<Tier>) => {
    setTiers((prev) => prev.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)));
  }, []);

  const resetAll = useCallback(() => {
    setCostRaw("100");
    setTiers(DEFAULT_TIERS.map((tier) => ({ ...tier })));
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
              <Banknote size={14} aria-hidden="true" />
              {t.eyebrow}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{t.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{t.body}</p>
            <p className="mt-2 font-mono text-xs text-zinc-500">{t.rateNote}</p>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {t.costLabel}
                </span>
                <div className="mt-2 flex items-center rounded-md border border-white/10 bg-black/30 px-3 focus-within:border-lime-300/60">
                  <span className="mr-1 text-base text-zinc-500">¥</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={costRaw}
                    onChange={(e) => setCostRaw(e.target.value)}
                    className="w-full bg-transparent py-2 text-base text-white outline-none placeholder:text-zinc-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder={t.costPlaceholder}
                  />
                </div>
              </label>

              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {t.tiersTitle}
                  </span>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-semibold text-zinc-400 transition hover:border-lime-300/40 hover:text-lime-100"
                  >
                    <RotateCcw size={12} aria-hidden="true" />
                    {t.reset}
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {tiers.map((tier, index) => {
                    const fieldId = `${tier.id}-name`;
                    const sliderId = `${tier.id}-multiplier`;
                    const displayName = language === "zh" ? tier.nameZh : tier.nameEn;
                    return (
                      <div
                        key={tier.id}
                        className="rounded-md border border-white/10 bg-black/20 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-lime-300/10 font-mono text-[11px] font-semibold text-lime-100">
                            {index + 1}
                          </span>
                          <input
                            id={fieldId}
                            type="text"
                            value={displayName}
                            onChange={(e) =>
                              updateTier(tier.id, language === "zh" ? { nameZh: e.target.value } : { nameEn: e.target.value })
                            }
                            placeholder={t.tierNamePlaceholder}
                            className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-white outline-none transition focus:border-lime-300/40"
                          />
                        </div>

                        <div className="mt-2 flex items-center gap-3">
                          <input
                            id={sliderId}
                            type="range"
                            min={0.5}
                            max={3}
                            step={0.05}
                            value={tier.multiplier}
                            onChange={(e) => updateTier(tier.id, { multiplier: Number(e.target.value) })}
                            className="w-full accent-lime-300"
                            aria-label={`${tier.nameZh} ${t.multiplierLabel}`}
                          />
                          <div className="flex w-24 shrink-0 items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step="0.05"
                              value={tier.multiplier}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                if (Number.isFinite(next) && next >= 0) {
                                  updateTier(tier.id, { multiplier: next });
                                }
                              }}
                              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-right font-mono text-sm text-white outline-none focus:border-lime-300/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <span className="font-mono text-xs text-zinc-500">X</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.summaryTitle}</p>

              {cost === null ? (
                <p className="mt-4 text-sm text-zinc-500">—</p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-md border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-black/30 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-3 py-2">{t.tableTier}</th>
                        <th className="px-3 py-2 text-right">{t.tableMultiplier}</th>
                        <th className="px-3 py-2 text-right">{t.tableRmb}</th>
                        <th className="px-3 py-2 text-right">{t.tableUsd}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {tiers.map((tier) => {
                        const rmb = cost * tier.multiplier;
                        const usd = rmb / USD_CNY_RATE;
                        const displayName = language === "zh" ? tier.nameZh : tier.nameEn;
                        return (
                          <tr key={tier.id}>
                            <td className="px-3 py-3 font-sans text-sm font-semibold text-white">{displayName}</td>
                            <td className="px-3 py-3 text-right text-zinc-400">{tier.multiplier.toFixed(2)}X</td>
                            <td className="px-3 py-3 text-right text-white">¥{formatCny(rmb)}</td>
                            <td className="px-3 py-3 text-right text-lime-100">{formatUsd(usd)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-4 font-mono text-[11px] text-zinc-600">
                USD = (CNY × markup) ÷ {USD_CNY_RATE}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
