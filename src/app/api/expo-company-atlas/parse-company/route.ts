import { NextResponse } from "next/server";
import { parseExpoAtlasCompany } from "@/lib/expo-company-atlas-workflow";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      companyName?: string;
      files?: Array<{ id?: string; fileName?: string; dataUrl?: string; previewUrl?: string }>;
    };
    const companyId = body.companyId?.trim();
    const files = Array.isArray(body.files) ? body.files : [];
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required." }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: "At least one image is required." }, { status: 400 });
    }

    const result = await parseExpoAtlasCompany({
      companyId,
      companyName: body.companyName,
      files,
    });

    return NextResponse.json({ success: true, ...result }, { status: 202 });
  } catch (error) {
    console.error("[expo-company-atlas/parse-company]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse company materials." },
      { status: 500 }
    );
  }
}
