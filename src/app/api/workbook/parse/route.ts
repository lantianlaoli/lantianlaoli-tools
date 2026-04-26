import { NextResponse } from "next/server";
import { setStoredWorkbook, toPublicWorkbook } from "@/lib/workbook-store";
import { parseWorkbook } from "@/lib/xlsx-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "An .xlsx file is required." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "Only .xlsx files are supported." }, { status: 400 });
    }

    const workbook = setStoredWorkbook(await parseWorkbook(await file.arrayBuffer()));
    return NextResponse.json(toPublicWorkbook(workbook));
  } catch (error) {
    console.error("[workbook/parse]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse workbook." },
      { status: 500 }
    );
  }
}
