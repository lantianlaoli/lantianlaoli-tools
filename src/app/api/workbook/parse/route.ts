import { NextResponse } from "next/server";
import { setStoredWorkbook, toPublicWorkbook } from "@/lib/workbook-store";
import { parseWorkbook, cleanCellText } from "@/lib/xlsx-parser";
import { cleanTextField } from "@/lib/text-cleaner";

export const runtime = "nodejs";
export const maxDuration = 120;

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

    // Phase 1: basic entity cleaning
    const basicCleanRow = (row: typeof workbook.rows[0] | undefined) => {
      if (!row) return;
      row.requirement = cleanCellText(row.requirement);
      row.copyText = cleanCellText(row.copyText);
      row.style = cleanCellText(row.style);
    };
    basicCleanRow(workbook.mainImageRow);
    for (const row of workbook.rows) {
      basicCleanRow(row);
    }

    // Phase 2: AI cleaning — translate Chinese/symbols to pure English
    const aiCleanRow = async (row: typeof workbook.rows[0] | undefined) => {
      if (!row) return;
      [row.requirement, row.copyText, row.style] = await Promise.all([
        cleanTextField(row.requirement),
        cleanTextField(row.copyText),
        cleanTextField(row.style),
      ]);
    };

    const productTitle = workbook.product.title;
    const productDesc = workbook.product.description;

    await Promise.all([
      aiCleanRow(workbook.mainImageRow),
      ...workbook.rows.map(aiCleanRow),
      cleanTextField(productTitle).then((t) => { workbook.product.title = t; }),
      cleanTextField(productDesc).then((d) => { workbook.product.description = d; }),
    ]);

    return NextResponse.json(toPublicWorkbook(workbook));
  } catch (error) {
    console.error("[workbook/parse]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse workbook." },
      { status: 500 }
    );
  }
}
