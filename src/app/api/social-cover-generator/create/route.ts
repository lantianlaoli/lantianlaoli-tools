import { NextResponse } from "next/server";
import { createSocialCoverJob } from "@/lib/social-cover-generator-workflow";
import type { SocialCoverCreateRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,/i;

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && IMAGE_DATA_URL_PATTERN.test(value.trim());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<SocialCoverCreateRequest>;
    if (!isImageDataUrl(body.personImageDataUrl)) {
      return NextResponse.json({ error: "personImageDataUrl is required." }, { status: 400 });
    }
    if (!isImageDataUrl(body.productOrLogoImageDataUrl)) {
      return NextResponse.json({ error: "productOrLogoImageDataUrl is required." }, { status: 400 });
    }
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required." }, { status: 400 });
    }

    const job = await createSocialCoverJob({
      personImageDataUrl: body.personImageDataUrl,
      productOrLogoImageDataUrl: body.productOrLogoImageDataUrl,
      title: body.title,
      styleGuide: body.styleGuide,
      languages: body.languages,
      aspectRatiosByLanguage: body.aspectRatiosByLanguage,
      aspectRatios: body.aspectRatios,
      variantsPerGroup: body.variantsPerGroup,
      resolution: body.resolution,
    });

    return NextResponse.json({ success: true, jobId: job.id, job }, { status: 202 });
  } catch (error) {
    console.error("[social-cover-generator/create]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create social cover job." },
      { status: 500 }
    );
  }
}
