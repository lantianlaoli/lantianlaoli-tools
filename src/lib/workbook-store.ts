import type { ParsedWorkbook, WorkbookImage } from "./types";

const globalForWorkbooks = globalThis as typeof globalThis & {
  copyCompetitorsWorkbookStore?: Map<string, ParsedWorkbook>;
};

const store = globalForWorkbooks.copyCompetitorsWorkbookStore ?? new Map<string, ParsedWorkbook>();
globalForWorkbooks.copyCompetitorsWorkbookStore = store;

export function setStoredWorkbook(workbook: ParsedWorkbook) {
  const workbookId = workbook.workbookId ?? crypto.randomUUID();
  const storedWorkbook = { ...workbook, workbookId };
  store.set(workbookId, storedWorkbook);
  return storedWorkbook;
}

export function getStoredWorkbook(workbookId: string) {
  return store.get(workbookId);
}

function imageUrl(workbookId: string, image: WorkbookImage) {
  const params = new URLSearchParams({ workbookId, imageId: image.id });
  return `/api/workbook/image?${params.toString()}`;
}

function publicImage(workbookId: string, image: WorkbookImage): WorkbookImage {
  return {
    ...image,
    dataUrl: imageUrl(workbookId, image),
  };
}

export function toPublicWorkbook(workbook: ParsedWorkbook): ParsedWorkbook {
  if (!workbook.workbookId) return workbook;
  const workbookId = workbook.workbookId;
  return {
    ...workbook,
    product: {
      ...workbook.product,
      images: workbook.product.images.map((image) => publicImage(workbookId, image)),
    },
    rows: workbook.rows.map((row) => ({
      ...row,
      referenceImages: row.referenceImages.map((image) => publicImage(workbookId, image)),
    })),
    mainImageRow: workbook.mainImageRow
      ? {
          ...workbook.mainImageRow,
          referenceImages: workbook.mainImageRow.referenceImages.map((image) => publicImage(workbookId, image)),
        }
      : undefined,
  };
}

export function findStoredWorkbookImage(workbookId: string, imageId: string) {
  const workbook = getStoredWorkbook(workbookId);
  if (!workbook) return undefined;
  const images = [
    ...workbook.product.images,
    ...(workbook.mainImageRow?.referenceImages ?? []),
    ...workbook.rows.flatMap((row) => row.referenceImages),
  ];
  return images.find((image) => image.id === imageId);
}
