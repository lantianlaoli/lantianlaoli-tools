export type WorkbookImage = {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
};

export type ParsedWorkbookRow = {
  id: string;
  rowNumber: number;
  sequence: string;
  size: string;
  requirement: string;
  copyText: string;
  style: string;
  aspectRatio: KieAspectRatio;
  resolution: KieResolution;
  referenceImages: WorkbookImage[];
  source: {
    cells: Record<string, string>;
  };
};

export type ParsedWorkbook = {
  workbookId?: string;
  product: {
    title: string;
    description: string;
    images: WorkbookImage[];
  };
  rows: ParsedWorkbookRow[];
  mainImageRow?: ParsedWorkbookRow;
  warnings: string[];
  imageCount: number;
};

export type KieAspectRatio =
  | "auto"
  | "1:1"
  | "9:16"
  | "16:9"
  | "4:3"
  | "3:4";

export type KieResolution = "1K" | "2K" | "4K";

export type GenerationJob = {
  rowId: string;
  rowNumber: number;
  sequence: string;
  taskId: string;
  status: "waiting" | "success" | "fail" | "processing";
  resultUrl?: string;
  error?: string;
  prompt: string;
  aspectRatio: KieAspectRatio;
  resolution: KieResolution;
  sourceRow: ParsedWorkbookRow["source"];
};
