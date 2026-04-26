import { NextResponse } from "next/server";
import { callOpenRouter, type OpenRouterMessage } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert at reading text in product marketing images.

Given an image of a product advertisement or marketing material, identify ALL visible English text blocks.

For each text block, provide:
- id: a unique identifier (text_1, text_2, etc.)
- text: the exact text content as it appears in the image
- position: top | bottom | center | left | right, or combinations like top-left, top-center, bottom-right, center-left
- size: small (body/caption) | medium (subtitle) | large (headline/title)

Rules:
- Only identify ENGLISH text blocks — ignore logos, watermarks, decorative elements without readable text
- Be precise: text must match exactly including capitalization and punctuation
- If no readable English text is found, return an empty textBlocks array
- Do not hallucinate text that isn't clearly visible

Return a JSON object:
{
  "textBlocks": [
    { "id": "text_1", "text": "Premium Quality", "position": "top-center", "size": "large" },
    { "id": "text_2", "text": "Only $99", "position": "bottom-right", "size": "medium" }
  ],
  "hasText": true,
  "warning": null
}`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { imageUrl: string };
    const { imageUrl } = body;

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ error: "A valid image URL is required." }, { status: 400 });
    }

    const messages: OpenRouterMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this product image and identify all visible English text blocks.",
          },
          {
            type: "image_url",
            image_url: { url: imageUrl },
          },
        ],
      },
    ];

    const result = await callOpenRouter<{
      textBlocks: { id: string; text: string; position: string; size: string }[];
      hasText: boolean;
      warning?: string;
    }>(messages, { type: "json_object" });

    return NextResponse.json({
      textBlocks: result.textBlocks ?? [],
      hasText: result.hasText ?? false,
      warning: result.warning ?? null,
    });
  } catch (error) {
    console.error("[analyze/image-text]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze image text." },
      { status: 500 }
    );
  }
}
