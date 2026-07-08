import { NextResponse } from "next/server";
import { fetchCodexResetNotices } from "@/lib/codex-reset-notifier";
import type { CodexResetNotifierSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      settings?: Partial<CodexResetNotifierSettings>;
    };
    const result = await fetchCodexResetNotices(body.settings);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check Codex reset notices.";
    const isConfigError = message.includes("credentials are not configured");
    if (!isConfigError) {
      console.error("[codex-reset-notifier/check]", error);
    }
    const status = message.includes("request failed: 429")
      ? 429
      : isConfigError
        ? 200
        : 502;
    return NextResponse.json(
      {
        success: false,
        notices: [],
        checkedAt: new Date().toISOString(),
        error: message,
      },
      { status },
    );
  }
}
