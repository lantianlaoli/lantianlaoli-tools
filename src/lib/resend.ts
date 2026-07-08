import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

type ResendSendResponse = {
  data?: {
    id?: string;
  };
  error?: {
    message?: string;
    name?: string;
  };
};

function readDotEnvValue(filePath: string, name: string): string | undefined {
  try {
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex < 1) continue;
      const key = trimmed.slice(0, equalsIndex).trim();
      if (key !== name) continue;
      let value = trimmed.slice(equalsIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value || undefined;
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  return undefined;
}

function getEnvValue(name: string): string | undefined {
  return (
    process.env[name]?.trim() ||
    readDotEnvValue(resolve(process.cwd(), ".env"), name) ||
    readDotEnvValue(resolve(process.cwd(), "..", "flowtra", ".env"), name)
  );
}

export async function sendEmail(params: SendEmailParams) {
  const apiKey = getEnvValue("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from ?? getEnvValue("RESEND_FROM") ?? "Codex Reset <onboarding@resend.dev>",
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text ?? "",
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as ResendSendResponse;
  if (!response.ok || payload.error) {
    const message = payload.error?.message ?? `Resend API request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload.data;
}
