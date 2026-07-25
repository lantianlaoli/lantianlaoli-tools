import { z } from "zod";
import type { TikTokPricingCalculation, TikTokPricingCountry, TikTokPricingMarketInput, TikTokPricingRequest, TikTokPricingMarketResult, TikTokPricingRegion } from "./types";

const countryCodes = ["SG", "MY", "TH", "VN", "PH"] as const;
const regions = ["default", "west", "east", "zone-a", "zone-b", "zone-c", "zone-d", "manila", "other"] as const;

export const tiktokPricingRequestSchema = z.object({
  productCostRmb: z.number().finite().nonnegative(), packagingCostRmb: z.number().finite().nonnegative(),
  weightG: z.number().finite().positive(),
  buyerPayPercent: z.number().finite().min(1).max(100), targetMarginPercent: z.number().finite().min(0).max(300), affiliateRate: z.number().finite().min(0).max(100),
  market: z.object({
    country: z.enum(countryCodes), currency: z.enum(["SGD", "MYR", "THB", "VND", "PHP"]), exchangeRateRmbPerLocal: z.number().finite().positive(),
    commissionRate: z.number().finite().min(0).max(100), transactionRate: z.number().finite().min(0).max(100), supportFee: z.number().finite().nonnegative(),
    region: z.enum(regions), channel: z.enum(["Standard", "Economy"]), includeLocalDeliveryCost: z.boolean(), logisticsOverride: z.number().finite().nonnegative().optional(),
  }),
});

export const TIKTOK_REFERENCE = {
  workbookSource: "docs/vendors/tiktok/东南亚跨境物流运费价格表20260515(1).xlsx",
  effectiveDate: "各国家工作表分别标注；物流价卡文件名为 20260515",
  officialLogisticsUrl: "https://seller.tiktokglobalshop.com/university/essay?knowledge_id=10010053&role=1&course_type=1&identity=1",
  officialSources: {
    sgCommission: "https://seller-sg.tiktok.com/university/essay?knowledge_id=2161524467910401",
    sgTransaction: "https://seller-sg.tiktok.com/university/essay?knowledge_id=780268081530625",
    myFees: "https://seller-my.tiktok.com/university/essay?knowledge_id=6907739532281602&lang=en",
    myTransaction: "https://seller-my.tiktok.com/university/essay?knowledge_id=10013511&lang=en",
  },
  countries: {
    SG: { name: "新加坡", currency: "SGD", exchangeRateRmbPerLocal: 5.3, commissionRate: 3.27, transactionRate: 2.18 },
    MY: { name: "马来西亚", currency: "MYR", exchangeRateRmbPerLocal: 1.6997, commissionRate: 8.46, transactionRate: 3.78 },
    TH: { name: "泰国", currency: "THB", exchangeRateRmbPerLocal: 0.2, commissionRate: 4.99, transactionRate: 3.21 },
    VN: { name: "越南", currency: "VND", exchangeRateRmbPerLocal: 0.00029, commissionRate: 3, transactionRate: 5 },
    PH: { name: "菲律宾", currency: "PHP", exchangeRateRmbPerLocal: 0.12529, commissionRate: 5.96, transactionRate: 2.24 },
  },
} as const;

export function getChargeableWeight(input: Pick<TikTokPricingRequest, "weightG">) {
  // The new official workbook explicitly says freight is based on parcel actual weight.
  return { chargeableWeightG: Math.max(10, Math.ceil(input.weightG / 10) * 10) };
}

function weightSteps(weightG: number) { return Math.max(1, Math.ceil(weightG / 10)); }
function surchargeForSteps(weightG: number, startG: number, base: number, per10G: number) { return base + Math.max(0, weightSteps(weightG) - weightSteps(startG)) * per10G; }

type FreightRule = { base: number; startG: number; per10G: number; localByRegion?: Record<string, number> };
const freightRules: Record<TikTokPricingCountry, FreightRule> = {
  SG: { base: 0.98, startG: 40, per10G: 0.15 },
  MY: { base: 0.15, startG: 10, per10G: 0.15, localByRegion: { west: 2.9, east: 8 } },
  TH: { base: 1, startG: 10, per10G: 1, localByRegion: { "zone-a": 23, "zone-b": 36, "zone-c": 79 } },
  VN: { base: 10900, startG: 10, per10G: 900, localByRegion: { "zone-a": 15000, "zone-b": 17000, "zone-c": 17000, "zone-d": 30000 } },
  PH: { base: 10.5, startG: 10, per10G: 4.5, localByRegion: { manila: 40, other: 60 } },
};

export function estimateOfficialFreight(country: TikTokPricingCountry, weightG: number, region: TikTokPricingRegion = "default", includeLocalDeliveryCost = false) {
  const rule = freightRules[country];
  const crossBorder = surchargeForSteps(weightG, rule.startG, rule.base, rule.per10G);
  const local = includeLocalDeliveryCost ? (rule.localByRegion?.[region] ?? 0) : 0;
  return { crossBorder: Math.round(crossBorder * 100) / 100, local: Math.round(local * 100) / 100, total: Math.round((crossBorder + local) * 100) / 100 };
}

export function estimateWorkbookLogistics(country: TikTokPricingCountry, weightG: number, region: TikTokPricingRegion = "default", includeLocalDeliveryCost = false) {
  return estimateOfficialFreight(country, weightG, region, includeLocalDeliveryCost).total;
}
function roundPrice(value: number) { return Math.ceil(value * 10) / 10; }
function calculateCountry(request: TikTokPricingRequest, input: TikTokPricingMarketInput, chargeableWeightG: number): TikTokPricingMarketResult {
  const ratio = request.buyerPayPercent / 100;
  const costLocal = (request.productCostRmb + request.packagingCostRmb) / input.exchangeRateRmbPerLocal;
  const freight = input.logisticsOverride === undefined ? estimateOfficialFreight(input.country, chargeableWeightG, input.region, input.includeLocalDeliveryCost) : { crossBorder: input.logisticsOverride, local: 0, total: input.logisticsOverride };
  const totalFeeRate = (input.commissionRate + input.transactionRate + request.affiliateRate) / 100;
  const fixedCost = costLocal + freight.total + input.supportFee;
  const denominator = ratio * (1 - totalFeeRate);
  const safeDenominator = Math.max(denominator, 0.0001);
  const breakEvenPrice = fixedCost / safeDenominator;
  const targetPrice = (fixedCost + costLocal * request.targetMarginPercent / 100) / safeDenominator;
  const suggestedPrice = roundPrice(targetPrice * 1.1);
  const discountedPrice = suggestedPrice * ratio;
  const feesAtSuggestedPrice = discountedPrice * totalFeeRate;
  const warnings = [
    ...(denominator <= 0 ? ["费用率合计已达到或超过100%，无法计算有效售价。"] : []),
    ...(input.logisticsOverride === undefined ? ["运费来自 2026-05-15 新价卡的公式估算；实际订单仍可能因包裹重量、渠道或地区产生差异。"] : []),
    "主模型按卖家承担折扣计算；平台券的交易费计费基数可能不同。",
  ];
  return { country: input.country, currency: input.currency, chargeableWeightG, logistics: freight.total, costLocal, totalFeeRate, breakEvenPrice: roundPrice(breakEvenPrice), targetPrice: roundPrice(targetPrice), stablePrice: roundPrice(targetPrice * 1.1), suggestedPrice, discountedPrice: Math.round(discountedPrice * 100) / 100, estimatedProfit: Math.round((discountedPrice - feesAtSuggestedPrice - fixedCost) * 100) / 100, feesAtSuggestedPrice: Math.round(feesAtSuggestedPrice * 100) / 100, freightBasis: input.includeLocalDeliveryCost ? `跨境物流 + ${input.region} 当地派送` : "跨境物流（买家当地派送费未计入）", warnings };
}

export function calculateTikTokPricing(request: TikTokPricingRequest): TikTokPricingCalculation {
  const { chargeableWeightG } = getChargeableWeight(request);
  return { buyerPayRatio: request.buyerPayPercent / 100, results: [calculateCountry(request, request.market, chargeableWeightG)] };
}

export function buildTikTokPricingPrompt(request: TikTokPricingRequest, calculation: TikTokPricingCalculation) {
  return `你是 TikTok Shop 东南亚定价顾问。请基于确定性计算结果给出简单、可执行的售价建议，不要擅自编造官方费率。\n\n输入：${JSON.stringify(request)}\n计算结果：${JSON.stringify(calculation)}\n\n请只返回 JSON：{"headline":"一句结论","recommendation":"说明挂牌价和折后成交价","reasons":["理由"],"risks":["风险"],"priceAdjustments":[{"country":"SG/MY/TH/VN/PH","suggestedPrice":0,"rationale":"调整理由"}]}。说明运费按实重起重价+每10g续重计算，及未包含的广告、退货、税费、活动服务费。`;
}
