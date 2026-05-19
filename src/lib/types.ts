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

export type TextBlock = {
  id: string;
  text: string;
  position: string;
  size: "small" | "medium" | "large";
};

export type EcommerceTextLanguage = "en" | "zh";

export type EcommerceAssetKind = "carousel" | "detail" | "videoStoryboard" | "video";

export type EcommerceSlotStatus = "waiting" | "processing" | "success" | "fail";

export type EcommerceProductView = "front" | "side" | "back";

export type EcommerceProductPhotoSlot = {
  view: EcommerceProductView;
  dataUrl: string | null;
  fileName: string | null;
};

export type EcommerceCreativeBrief = {
  productCategory: string;
  productIdentity: string;
  materialsAndColors: string;
  sellingPoints: string[];
  designLanguage: string;
  carouselDirection: string;
  detailDirection: string;
  videoDirection: string;
};

export type EcommerceImageSlot = {
  id: string;
  kind: Extract<EcommerceAssetKind, "carousel" | "detail">;
  index: number;
  title: string;
  taskId: string;
  status: EcommerceSlotStatus;
  resultUrl?: string;
  error?: string;
  prompt: string;
};

export type EcommerceVideoSlot = {
  taskId?: string;
  status: EcommerceSlotStatus;
  storyboardTaskId?: string;
  storyboardUrl?: string;
  resultUrl?: string;
  error?: string;
  prompt: string;
};

export type EcommerceAssetsJob = {
  id: string;
  status: "preparing" | "processing" | "completed" | "failed";
  textLanguage: EcommerceTextLanguage;
  imageResolution?: string;
  videoResolution?: string;
  productImageUrl?: string;
  productImageUrls?: string[];
  brief?: EcommerceCreativeBrief;
  carouselImages: EcommerceImageSlot[];
  detailImages: EcommerceImageSlot[];
  video: EcommerceVideoSlot;
  error?: string;
  createdAt: number;
  updatedAt: number;
};
