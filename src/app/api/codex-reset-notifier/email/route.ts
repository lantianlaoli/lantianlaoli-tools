import { NextResponse } from "next/server";
import { sendCodexResetNoticeEmail } from "@/lib/codex-reset-email";
import type { CodexResetNotice } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      recipients?: unknown;
      notices?: CodexResetNotice[];
    };
    const data = await sendCodexResetNoticeEmail({
      recipients: body.recipients,
      notices: Array.isArray(body.notices) ? body.notices : [],
    });
    return NextResponse.json({ success: true, id: data?.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send reset notice email.";
    const isConfigError = message.includes("RESEND_API_KEY");
    if (!isConfigError) {
      console.error("[codex-reset-notifier/email]", error);
    }
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: isConfigError ? 200 : 502 },
    );
  }
}
