import { NextResponse } from "next/server";
import { generateExpoCompanyMarkdown } from "@/lib/expo-company-atlas";
import type { ExpoAtlasCompany, ExpoAtlasPhoto } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      company?: ExpoAtlasCompany;
      photos?: ExpoAtlasPhoto[];
      language?: string;
    };
    if (!body.company || !Array.isArray(body.photos)) {
      return NextResponse.json({ error: "company and photos are required." }, { status: 400 });
    }
    const language = body.language?.trim();
    if (!language) {
      return NextResponse.json({ error: "language is required." }, { status: 400 });
    }

    const markdown = await generateExpoCompanyMarkdown({
      company: body.company,
      photos: body.photos,
      language,
    });

    return NextResponse.json({ success: true, markdown });
  } catch (error) {
    console.error("[expo-company-atlas/generate-markdown]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate markdown." },
      { status: 500 }
    );
  }
}
