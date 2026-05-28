import type { ExpoAtlasJob, ExpoAtlasSlotStatus } from "./types";

export function expoAtlasStatusLabel(status: ExpoAtlasJob["status"]) {
  if (status === "analyzing") return "分析中";
  if (status === "ready") return "待确认";
  if (status === "generating") return "生图中";
  if (status === "completed") return "已完成";
  return "有失败";
}

export function expoAtlasSlotStatusLabel(status: ExpoAtlasSlotStatus) {
  if (status === "success") return "完成";
  if (status === "fail") return "失败";
  if (status === "processing") return "生成中";
  return "待生成";
}

export function getExpoAtlasProgress(job: ExpoAtlasJob | null) {
  if (!job) return { done: 0, total: 0, label: "未开始" };
  const active = job.photos.filter((photo) => photo.generationTaskId || photo.generationStatus !== "waiting");
  const total = active.length || job.photos.length;
  const done = active.filter((photo) => photo.generationStatus === "success" || photo.generationStatus === "fail").length;
  return {
    done,
    total,
    label: `${done}/${total}`,
  };
}

