import { NextResponse } from "next/server";
import { setStoredWorkbook, toPublicWorkbook } from "@/lib/workbook-store";
import { parseWorkbook, looksGarbled, cleanCellText } from "@/lib/xlsx-parser";
import { fixRichTextCells } from "@/lib/ai-text-fixer";

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

    // Clean all text fields first (handles &#10; entities, etc.)
    const cleanRow = (row: typeof workbook.rows[0] | undefined) => {
      if (!row) return;
      row.requirement = cleanCellText(row.requirement);
      row.copyText = cleanCellText(row.copyText);
      row.style = cleanCellText(row.style);
    };
    cleanRow(workbook.mainImageRow);
    for (const row of workbook.rows) {
      cleanRow(row);
    }

    // Collect cells that need AI repair
    const cellsNeedingRepair: Array<{ ref: string; field: "requirement" | "copyText" | "style"; raw: string }> = [];
    const collectGarbledCells = (row: typeof workbook.rows[0] | undefined) => {
      if (!row) return;
      if (looksGarbled(row.requirement)) {
        cellsNeedingRepair.push({ ref: `C${row.rowNumber}`, field: "requirement", raw: row.requirement });
      }
      if (looksGarbled(row.copyText)) {
        cellsNeedingRepair.push({ ref: `F${row.rowNumber}`, field: "copyText", raw: row.copyText });
      }
      if (looksGarbled(row.style)) {
        cellsNeedingRepair.push({ ref: `G${row.rowNumber}`, field: "style", raw: row.style });
      }
    };

    collectGarbledCells(workbook.mainImageRow);
    for (const row of workbook.rows) {
      collectGarbledCells(row);
    }

    // Call AI once if any cells need repair
    if (cellsNeedingRepair.length > 0) {
      const fixedCells = await fixRichTextCells(cellsNeedingRepair);

      // Apply fixes back to workbook rows
      const applyFix = (row: typeof workbook.rows[0] | undefined) => {
        if (!row) return;
        const cRef = `C${row.rowNumber}`;
        const fRef = `F${row.rowNumber}`;
        const gRef = `G${row.rowNumber}`;
        if (fixedCells[cRef] !== undefined) row.requirement = fixedCells[cRef];
        if (fixedCells[fRef] !== undefined) row.copyText = fixedCells[fRef];
        if (fixedCells[gRef] !== undefined) row.style = fixedCells[gRef];
      };
      applyFix(workbook.mainImageRow);
      for (const row of workbook.rows) {
        applyFix(row);
      }
    }

    return NextResponse.json(toPublicWorkbook(workbook));
  } catch (error) {
    console.error("[workbook/parse]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse workbook." },
      { status: 500 }
    );
  }
}
