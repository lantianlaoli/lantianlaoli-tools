import { OpenRouter } from "@openrouter/sdk";
import type { ChatContentItems, ChatContentText, ChatMessages } from "@openrouter/sdk/models";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterContentPart[];
};

export type OpenRouterContentPart = {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
};

function toSdkContentPart(part: OpenRouterContentPart): ChatContentItems {
  if (part.type === "image_url") {
    if (!part.image_url?.url) throw new Error("OpenRouter image_url content is missing a URL.");
    return {
      type: "image_url",
      imageUrl: { url: part.image_url.url },
    };
  }
  return {
    type: "text",
    text: part.text ?? "",
  };
}

function toSdkTextContent(content: OpenRouterMessage["content"]): string | ChatContentText[] {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => ({
      type: "text" as const,
      text: part.text ?? "",
    }));
}

function toSdkMessage(message: OpenRouterMessage): ChatMessages {
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: typeof message.content === "string" ? message.content : message.content.map(toSdkContentPart),
    };
  }
  if (message.role === "system") {
    return {
      role: "system",
      content: toSdkTextContent(message.content),
    };
  }
  return {
    role: "user",
    content: typeof message.content === "string" ? message.content : message.content.map(toSdkContentPart),
  };
}

export async function callOpenRouter<T>(
  messages: OpenRouterMessage[],
  responseFormat?: { type: "json_object" }
): Promise<T> {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL;
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }
  if (!OPENROUTER_MODEL) {
    throw new Error("OPENROUTER_MODEL is not configured.");
  }

  const openRouter = new OpenRouter({
    apiKey: OPENROUTER_API_KEY,
    httpReferer: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    appTitle: "Lantian Tools",
  });

  const payload = await openRouter.chat.send({
    chatRequest: {
      model: OPENROUTER_MODEL,
      messages: messages.map(toSdkMessage),
      ...(responseFormat ? { responseFormat } : {}),
    },
  });

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned no content.");
  }

  // Some models wrap JSON in markdown code blocks — strip them
  const cleaned = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}
