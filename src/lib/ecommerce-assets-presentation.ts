import type { EcommerceAssetsJob, EcommerceSlotStatus } from "./types";

export function getEcommerceVideoPresentation(job: EcommerceAssetsJob | null): {
  status: EcommerceSlotStatus;
  badgeLabel: string;
  hasStarted: boolean;
  placeholder: string;
} {
  if (!job) {
    return {
      status: "waiting",
      badgeLabel: "未开始",
      hasStarted: false,
      placeholder: "上传产品照片后开始生成",
    };
  }

  const scopes = job.assetScopes?.length ? job.assetScopes : job.assetScope && job.assetScope !== "all" ? [job.assetScope] : ["carousel", "detail", "video"];
  if (!scopes.includes("video")) {
    return {
      status: "waiting",
      badgeLabel: "未生成",
      hasStarted: false,
      placeholder: "本次未生成",
    };
  }

  return {
    status: job.video.status,
    badgeLabel: "",
    hasStarted: true,
    placeholder: job.video.storyboardUrl ? "生成视频中" : "等待 storyboard",
  };
}
