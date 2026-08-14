import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateTikTokPricing,
  estimateOfficialFreight,
  getChargeableWeight,
} from "../src/lib/tiktok-pricing";

const base = {
  productCostRmb: 20,
  packagingCostRmb: 2,
  weightG: 392,
  buyerPayPercent: 40,
  targetMarginPercent: 20,
  affiliateRate: 0,
  market: {
    country: "SG" as const,
    currency: "SGD" as const,
    exchangeRateRmbPerLocal: 5.3,
    commissionRate: 3.27,
    transactionRate: 2.18,
    supportFee: 0,
    region: "default" as const,
    channel: "Standard" as const,
    taxProfile: "individual" as const,
    includeLocalDeliveryCost: false,
  },
};

test("new freight card uses actual weight rounded up to the next 10g", () => {
  assert.deepEqual(getChargeableWeight(base), { chargeableWeightG: 400 });
});
test("new freight card follows start price plus per-10g continuation", () => {
  assert.deepEqual(estimateOfficialFreight("SG", 392), {
    crossBorder: 6.38,
    local: 0,
    total: 6.38,
  });
  assert.deepEqual(estimateOfficialFreight("MY", 250, "east", true), {
    crossBorder: 3.75,
    local: 8,
    total: 11.75,
  });
});
test("regional local delivery can be included separately", () => {
  assert.equal(estimateOfficialFreight("TH", 300, "zone-b", true).total, 66);
  assert.equal(estimateOfficialFreight("VN", 300, "zone-a", true).total, 52000);
});
test("calculates 4-fold discount pricing and keeps break-even visible", () => {
  const result = calculateTikTokPricing(base).results[0];
  assert.ok(
    Math.abs(result.discountedPrice - result.suggestedPrice * 0.4) < 0.001,
  );
  assert.ok(result.suggestedPrice > result.breakEvenPrice);
  assert.match(result.freightBasis, /跨境物流/);
});
test("includes country tax scenarios in the cost and profit", () => {
  const vietnam = calculateTikTokPricing({
    ...base,
    market: {
      ...base.market,
      country: "VN",
      currency: "VND",
      taxProfile: "individual",
      commissionRate: 3,
      transactionRate: 5,
    },
  }).results[0];
  const singapore = calculateTikTokPricing(base).results[0];
  assert.ok(vietnam.taxCostsAtSuggestedPrice > 0);
  assert.ok(
    vietnam.estimatedProfit <
      vietnam.discountedPrice -
        vietnam.feesAtSuggestedPrice -
        vietnam.costLocal -
        vietnam.logistics,
  );
  assert.equal(singapore.taxCostsAtSuggestedPrice, 0);
});
