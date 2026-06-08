import type { EcommerceTextLanguage } from "./types";

export type StringKey = keyof typeof STRINGS;

const STRINGS = {
  // Top bar / nav
  backToHome: { zh: "返回首页", en: "Back to Home" },
  brandKicker: { zh: "Lantian Tools Commerce Studio", en: "Lantian Tools Commerce Studio" },
  pageTitle: { zh: "电商图片 + 视频素材一键生成", en: "Generate Ecommerce Images + Video Assets in One Click" },
  pageSubtitle: {
    zh: "上传产品照片，设置图片与视频规格，生成轮播图、详情图和广告短片。",
    en: "Upload product photos, set image and video specs, and generate carousel images, detail images, and ad videos.",
  },
  statManufacturerImages: { zh: "厂家图", en: "Promo Images" },
  statProductPhotos: { zh: "产品照片", en: "Product Photos" },
  statCarousel: { zh: "轮播图", en: "Carousel" },
  statDetail: { zh: "详情图", en: "Detail" },
  statVideo: { zh: "广告视频", en: "Ad Video" },
  statVideoOutOfOne: { zh: "0/1", en: "0/1" },
  statCarouselOutOfSix: { zh: "0/6", en: "0/6" },
  statNotGenerated: { zh: "未生成", en: "Not generated" },

  // Step 1 — Source
  step1Kicker: { zh: "Step 1", en: "Step 1" },
  step1Title: { zh: "我的产品", en: "My Product" },
  step1SubtitleProduct: {
    zh: "正视图必填，侧视图和背视图用于提高产品一致性。",
    en: "Front view is required; side and back views help keep the product consistent.",
  },
  step1SubtitleManufacturer: {
    zh: "上传厂家宣传图，生成时再解析文字层级并按顺序一图一改。",
    en: "Upload manufacturer promo images — we parse the text hierarchy and redesign each one in order.",
  },
  uploadedCountLabel: { zh: "已上传", en: "uploaded" },
  sourceModeProduct: { zh: "产品实拍图", en: "Product Photos" },
  sourceModeManufacturer: { zh: "厂家宣传图再设计", en: "Redesign Manufacturer Promos" },

  // Product photo slots
  viewFront: { zh: "正视图", en: "Front View" },
  viewSide: { zh: "侧视图", en: "Side View" },
  viewBack: { zh: "背视图", en: "Back View" },
  viewFrontSub: { zh: "Front View", en: "Front View" },
  viewSideSub: { zh: "Side View", en: "Side View" },
  viewBackSub: { zh: "Back View", en: "Back View" },
  frontRequired: { zh: "白底主图 · 必填", en: "Hero Shot · Required" },
  productPhotoAlt: { zh: "产品照片", en: "Product photo" },
  clickToUpload: { zh: "点击上传", en: "Click to upload" },
  readingLabel: { zh: "读取中…", en: "Reading…" },
  removeAriaFront: { zh: "移除正视图", en: "Remove front view" },
  removeAriaSide: { zh: "移除侧视图", en: "Remove side view" },
  removeAriaBack: { zh: "移除背视图", en: "Remove back view" },

  // Manufacturer promo uploader
  manufacturerUploaderTitle: { zh: "批量上传厂家宣传图", en: "Upload manufacturer promo images" },
  manufacturerUploaderHelp: {
    zh: "最多 6 张，支持 PNG/JPG/WEBP，单张不超过 10MB。按上传顺序生成轮播图。",
    en: "Up to 6 images, PNG/JPG/WEBP, max 10MB each. Carousel images are generated in upload order.",
  },
  carouselSlotLabel: { zh: "轮播图", en: "Carousel" },
  replaceAria: { zh: "替换", en: "Replace" },
  removeAria: { zh: "删除", en: "Remove" },

  // Errors
  errInvalidType: { zh: "请上传 PNG、JPG 或 WEBP 图片。", en: "Please upload PNG, JPG, or WEBP images." },
  errTooLarge: { zh: "图片不能超过 10MB。", en: "Image must be 10MB or less." },
  errReadFailed: { zh: "读取图片失败，请重试。", en: "Failed to read the image, please try again." },
  errTooManyPromos: { zh: "最多上传 6 张厂家宣传图。", en: "Upload up to 6 manufacturer promo images." },
  errFrontRequired: { zh: "请至少上传正视图产品照片。", en: "Please upload at least one front-view product photo." },
  errAtLeastOnePromo: { zh: "请至少上传 1 张厂家宣传图。", en: "Please upload at least one manufacturer promo image." },
  errStartFailed: { zh: "启动生成失败。", en: "Failed to start generation." },
  errPollFailed: { zh: "查询生成状态失败。", en: "Failed to check generation status." },
  errZipFailed: { zh: "导出 ZIP 失败。", en: "Failed to export ZIP." },
  errRetryFailed: { zh: "Retry failed.", en: "Retry failed." },
  errReadImageFailed: { zh: "读取图片失败", en: "Failed to read the image" },
  errRegenMaxImages: { zh: "最多上传 4 张参考图", en: "Upload up to 4 reference images" },
  errRegenInvalidType: { zh: "请上传 PNG、JPG 或 WEBP 图片", en: "Please upload PNG, JPG, or WEBP images" },
  errRegenTooLarge: { zh: "每张图片不能超过 10MB", en: "Each image must be 10MB or less" },
  errRegenFailed: { zh: "重新生成失败", en: "Regeneration failed" },
  errRegenNeedInput: {
    zh: "请输入修改描述或上传参考图。",
    en: "Please enter a refinement or upload a reference image.",
  },

  // Step 2 — Requirements
  step2Kicker: { zh: "Step 2", en: "Step 2" },
  step2Title: { zh: "自定义需求", en: "Custom Requirements" },
  step2SubtitleProduct: {
    zh: "点击快捷用语会追加到输入框；详情图文案可保留，轮播图文字可单独约束。",
    en: "Click a quick phrase to append it. You can keep detail copy or constrain carousel copy separately.",
  },
  step2SubtitleManufacturer: {
    zh: "预设风格模板可直接使用；你也可以在 Quick Phrases 中继续增改自定义短语。",
    en: "Preset style templates are ready to use. You can also add or edit more in Quick Phrases.",
  },
  quickPhrasesTitle: { zh: "快捷用语", en: "Quick Phrases" },
  quickPhrasesEmpty: { zh: "暂无快捷用语", en: "No quick phrases yet" },
  quickPhrasesAdd: { zh: "新增", en: "Add" },
  quickPhrasesAddAria: { zh: "新增快捷用语", en: "Add quick phrase" },
  quickPhrasesNewPlaceholder: { zh: "新增快捷用语", en: "New quick phrase" },
  quickPhrasesEditAria: { zh: "编辑快捷用语", en: "Edit quick phrase" },
  quickPhrasesSaveAria: { zh: "保存快捷用语", en: "Save quick phrase" },
  quickPhrasesSaveNewAria: { zh: "保存新增快捷用语", en: "Save new quick phrase" },
  quickPhrasesCancelAria: { zh: "取消编辑快捷用语", en: "Cancel editing quick phrase" },
  quickPhrasesCancelNewAria: { zh: "取消新增快捷用语", en: "Cancel adding quick phrase" },
  quickPhrasesDeleteAria: { zh: "删除快捷用语", en: "Delete quick phrase" },
  quickPhrasesTitleAttr: { zh: "编辑", en: "Edit" },
  quickPhrasesTitleDelete: { zh: "删除", en: "Delete" },
  quickPhrasesTitleSave: { zh: "保存", en: "Save" },
  quickPhrasesTitleCancel: { zh: "取消", en: "Cancel" },
  customRequirementsLabel: { zh: "生成要求", en: "Generation Requirements" },
  customRequirementsPlaceholderProduct: {
    zh: "自定义需求（可选）：例如不需要视频里有文字、风格要更简约…",
    en: "Custom requirements (optional): e.g. no text in the video, simpler style…",
  },
  customRequirementsPlaceholderManufacturer: {
    zh: "例如 Apple 极简白底黑字风格；只保留主卖点，删除参数堆叠；每张图产品全身或细节特写 + 一句话大字。",
    en: "e.g. Apple-style white background, bold black copy, keep one main selling point per image, drop the spec walls.",
  },

  // Style templates (Chinese-only long strings become English here too)
  styleTemplateApple: {
    zh: "Apple 极简白底黑字风格：白底、大留白、产品全身或细节特写；只保留最重要的信息，文案压缩成一句短句；文字特别大，左右或上下结构，避免参数堆叠。",
    en: "Apple-style minimal white background with bold black type: white canvas, generous whitespace, full-product or detail hero shot; keep only one short headline, oversized type, side-by-side or stacked layout, no spec walls.",
  },
  styleTemplateTech: {
    zh: "高级科技品牌风格：深浅对比清晰，产品居中或偏侧，保留核心卖点和关键参数，删除促销感文字、角标和杂乱装饰。",
    en: "Premium tech-brand style: strong light/dark contrast, product centered or off-center, keep the core benefit and key specs, drop promo badges, stickers, and visual clutter.",
  },
  styleTemplateXiaohongshu: {
    zh: "小红书干净种草风格：浅色背景、自然光、产品细节特写，保留一句利益点，文字少但醒目。",
    en: "Clean Xiaohongshu-style: light background, natural light, product detail close-ups, keep one benefit line — minimal copy, but punchy.",
  },

  // Step 3 — Settings
  step3Kicker: { zh: "Step 3", en: "Step 3" },
  step3Title: { zh: "生成设置", en: "Generation Settings" },
  step3SubtitleProduct: {
    zh: "设置语言、图片比例和视频规格。",
    en: "Set language, image aspect ratio, and video specs.",
  },
  step3SubtitleManufacturer: {
    zh: "厂家模式仅生成轮播图；设置语言、图片比例和分辨率。",
    en: "Manufacturer mode only generates carousel images — set language, aspect ratio, and resolution.",
  },
  settingsLanguage: { zh: "语言", en: "Language" },
  settingsLangEn: { zh: "EN", en: "EN" },
  settingsLangZh: { zh: "中文", en: "中文" },
  settingsImage: { zh: "图片", en: "Image" },
  settingsVideo: { zh: "视频", en: "Video" },
  manufacturerModeNotice: {
    zh: "厂家宣传图再设计模式仅生成轮播图，数量等于上传图片数量。",
    en: "Manufacturer mode only generates carousel images — one per uploaded promo image.",
  },
  generationScopeTitle: { zh: "生成范围", en: "Generation Scope" },
  generationScopeCountOne: { zh: "已选择 1 项", en: "1 selected" },
  generationScopeCountMany: { zh: "已选择 {count} 项", en: "{count} selected" },
  generationScopeAtLeastOne: { zh: "至少开启 1 项", en: "Pick at least one" },
  generationTargetCarousel: { zh: "轮播图", en: "Carousel" },
  generationTargetDetail: { zh: "详情图", en: "Detail" },
  generationTargetVideo: { zh: "视频", en: "Video" },
  generateButton: { zh: "一键生成", en: "Generate" },
  downloadZipButton: { zh: "下载 ZIP", en: "Download ZIP" },

  // Pet replacement (manufacturer-promo mode only)
  petSectionTitle: { zh: "宠物替换", en: "Pet Replacement" },
  petToggleLabel: { zh: "启用宠物替换", en: "Enable pet replacement" },
  petEmptyHint: {
    zh: "上传正面 / 侧面 / 背面的宠物照，源图里有宠物时会自动换成你的宠物并保持原姿势。",
    en: "Upload front / side / back photos of your pet. If a pet appears in the source image, it will be replaced with yours in the same pose.",
  },
  petViewRequired: {
    zh: "启用宠物替换时,需要上传正面 / 侧面 / 背面 3 张宠物照。",
    en: "Pet replacement requires front, side, and back pet photos.",
  },
  petReplaceCta: { zh: "替换", en: "Replace" },
  petRemoveCta: { zh: "移除", en: "Remove" },
  petReplaceAriaFront: { zh: "替换正视图", en: "Replace front view" },
  petReplaceAriaSide: { zh: "替换侧视图", en: "Replace side view" },
  petReplaceAriaBack: { zh: "替换背视图", en: "Replace back view" },

  // Results section
  resultsTitle: { zh: "生成结果", en: "Results" },
  resultsKicker: { zh: "生成结果", en: "Results" },
  carouselSectionTitle: { zh: "轮播图", en: "Carousel" },
  carouselSectionSubtitleProduct: {
    zh: "展示产品的 6 个核心视角",
    en: "6 core views of the product",
  },
  carouselSectionSubtitleManufacturer: {
    zh: "按厂家宣传图上传顺序生成的一图一改轮播图",
    en: "One redesigned carousel image per uploaded manufacturer promo, in upload order",
  },
  detailSectionTitle: { zh: "详情图", en: "Detail" },
  detailSectionSubtitle: {
    zh: "围绕卖点、场景和信任感的 6 张详情图",
    en: "6 detail images covering selling points, use cases, and trust signals",
  },
  videoSectionTitle: { zh: "广告视频", en: "Ad Video" },
  videoSectionSubtitle: { zh: "产品展示广告短片", en: "Product showcase ad video" },
  videoAspectLabel: { zh: "广告短片", en: "Ad Video" },
  videoNotGenerated: { zh: "本次未生成", en: "Not generated this time" },
  videoDownload: { zh: "下载视频", en: "Download video" },
  videoFailed: { zh: "视频生成失败", en: "Video generation failed" },
  emptyPlaceholderWaiting: { zh: "等待生成", en: "Waiting" },
  emptyPlaceholderSkipped: { zh: "本次未生成", en: "Not generated this time" },
  progressTitle: { zh: "生成进度", en: "Progress" },
  progressProductAnalysis: { zh: "产品分析", en: "Product analysis" },
  progressStoryboard: { zh: "创意分镜", en: "Storyboard" },
  progressVideo: { zh: "广告视频", en: "Ad video" },

  // Slot card
  slotTitle: { zh: "完成", en: "Done" },
  slotFailed: { zh: "失败", en: "Failed" },
  slotProcessing: { zh: "生成中", en: "Generating" },
  slotWaiting: { zh: "等待中", en: "Waiting" },
  slotDownload: { zh: "下载", en: "Download" },
  slotRegenerate: { zh: "重新生成", en: "Regenerate" },
  slotRetry: { zh: "Retry", en: "Retry" },
  slotRetrying: { zh: "Retrying", en: "Retrying" },
  slotFailedFallback: { zh: "生成失败", en: "Generation failed" },

  // Regenerate modal
  regenTitle: { zh: "重新生成", en: "Regenerate" },
  regenCloseAria: { zh: "关闭", en: "Close" },
  regenReferenceLabel: { zh: "参考图片（可选）", en: "Reference images (optional)" },
  regenRefinementLabel: { zh: "修改描述", en: "Refinement" },
  regenRefinementPlaceholder: { zh: "描述你想要的修改…", en: "Describe the change you want…" },
  regenSubmit: { zh: "重新生成", en: "Regenerate" },
  regenSubmitting: { zh: "重新生成中…", en: "Regenerating…" },

  // Manufacturer storyboard placeholder
  manufacturerVideoNoSlots: { zh: "本次未生成", en: "Not generated this time" },
} as const;

export function t(key: StringKey, lang: EcommerceTextLanguage): string {
  const entry = STRINGS[key];
  return entry[lang];
}

export function formatT(
  key: StringKey,
  lang: EcommerceTextLanguage,
  replacements: Record<string, string | number>,
): string {
  return t(key, lang).replace(/\{(\w+)\}/g, (_, name) => String(replacements[name] ?? `{${name}}`));
}
