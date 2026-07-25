import { NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/openrouter";
import { buildTikTokPricingPrompt, calculateTikTokPricing, tiktokPricingRequestSchema } from "@/lib/tiktok-pricing";
import type { TikTokPricingAiRecommendation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = tiktokPricingRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid pricing inputs.", details: parsed.error.flatten() }, { status: 400 });
  const calculation = calculateTikTokPricing(parsed.data);
  let ai: TikTokPricingAiRecommendation | null = null;
  let aiError: string | undefined;
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL) {
    try { ai = await callOpenRouter<TikTokPricingAiRecommendation>([{ role: "system", content: "你只输出合法 JSON，不要 Markdown。" }, { role: "user", content: buildTikTokPricingPrompt(parsed.data, calculation) }], { type: "json_object" }); }
    catch (error) { aiError = error instanceof Error ? error.message : "AI recommendation failed."; }
  } else aiError = "未配置 OPENROUTER_API_KEY / OPENROUTER_MODEL，已返回公式计算结果。";
  return NextResponse.json({ success: true, calculation, ai, aiError });
}
