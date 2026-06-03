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
export type EcommerceAssetScope = "all" | "carousel" | "detail" | "video";
export type EcommerceAssetScopeOption = Exclude<EcommerceAssetScope, "all">;

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
  customRequirements?: string;
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
  assetScope?: EcommerceAssetScope;
  assetScopes?: EcommerceAssetScopeOption[];
  textLanguage: EcommerceTextLanguage;
  imageResolution?: string;
  imageAspectRatio?: string;
  videoResolution?: string;
  videoAspectRatio?: string;
  productImageUrl?: string;
  productImageUrls?: string[];
  brief?: EcommerceCreativeBrief;
  customRequirements?: string;
  carouselImages: EcommerceImageSlot[];
  detailImages: EcommerceImageSlot[];
  video: EcommerceVideoSlot;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type ExpoPhotoKind = "company_intro" | "product" | "contact" | "mixed" | "unknown";

export type ExpoAtlasSlotStatus = "waiting" | "processing" | "success" | "fail";

export type ExpoAtlasPhoto = {
  id: string;
  fileName: string;
  previewUrl?: string;
  sourceUrl?: string;
  kind: ExpoPhotoKind;
  summary: string;
  extractedText: string[];
  generationTaskId?: string;
  generationStatus: ExpoAtlasSlotStatus;
  generatedUrl?: string;
  generationPrompt?: string;
  enhancedTaskId?: string;
  enhancedStatus: ExpoAtlasSlotStatus;
  enhancedUrl?: string;
  enhancedPrompt?: string;
  error?: string;
};

export type ExpoAtlasParseStatus = "draft" | "parsing" | "parsed" | "failed";

export type ExpoAtlasProduct = {
  id: string;
  name: string;
  description: string;
  highlights: string[];
};

export type ExpoAtlasContact = {
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  person?: string;
  social?: string;
  raw?: string;
};

export type ExpoAtlasCompany = {
  id: string;
  name: string;
  suggestedName?: string;
  intro: string;
  products: ExpoAtlasProduct[];
  contact: ExpoAtlasContact;
  photoIds: string[];
  parseStatus?: ExpoAtlasParseStatus;
  parseError?: string;
  notes?: string;
  markdown?: string;
};

export type ExpoAtlasJob = {
  id: string;
  status: "analyzing" | "ready" | "generating" | "completed" | "failed";
  title: string;
  imageAspectRatio: Extract<KieAspectRatio, "1:1" | "4:3" | "16:9">;
  imageResolution: KieResolution;
  photos: ExpoAtlasPhoto[];
  companies: ExpoAtlasCompany[];
  error?: string;
  persistence: "redis" | "memory";
  createdAt: number;
  updatedAt: number;
};

export type ShenzhenExpoHunterSearchSettings = {
  maxSubreddits: number;
  maxPosts: number;
  depth: "precise" | "broad";
};

export type ExpoHunterExpo = {
  id: string;
  name: string;
  date?: string;
  location?: string;
  industryKeywords: string[];
};

export type ExpoHunterSubreddit = {
  name: string;
  title: string;
  description: string;
  subscribers: number;
  relevanceScore: number;
};

export type ExpoHunterLead = {
  sourceType?: "post";
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  createdUtc: number;
  score: number;
  numComments: number;
  permalink: string;
  url: string;
  matchedKeywords: string[];
  confidence: number;
};

export type ExpoHunterPhoto = {
  url: string;
  postTitle: string;
  postPermalink: string;
  author: string;
  subreddit: string;
};

export type ExpoHunterIndustryIntel = {
  sourceType?: "post";
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  createdUtc: number;
  score: number;
  numComments: number;
  permalink: string;
  url: string;
  matchedKeywords: string[];
  confidence: number;
};

export type ExpoHunterComment = {
  sourceType: "comment";
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  createdUtc: number;
  score: number;
  numComments: 0;
  permalink: string;
  url: string;
  postTitle: string;
  postPermalink: string;
  matchedKeywords: string[];
  confidence: number;
};

export type ExpoHunterDiscussion = ExpoHunterLead | ExpoHunterIndustryIntel | ExpoHunterComment;

export type ExpoHunterSubredditDiscussionGroup = {
  subreddit: string;
  discussions: ExpoHunterDiscussion[];
};

export type ExpoHunterSlotStatus = "waiting" | "processing" | "success" | "fail";

export type ExpoHunterExpoResult = {
  expo: ExpoHunterExpo;
  status: ExpoHunterSlotStatus;
  error?: string;
  subreddits: ExpoHunterSubreddit[];
  leads: ExpoHunterLead[];
  photos: ExpoHunterPhoto[];
  industryIntel: ExpoHunterIndustryIntel[];
  comments: ExpoHunterComment[];
  discussionsBySubreddit: ExpoHunterSubredditDiscussionGroup[];
};

export type ShenzhenExpoHunterJob = {
  id: string;
  status: "parsed" | "preparing" | "processing" | "completed" | "failed";
  rawSchedule: string;
  settings: ShenzhenExpoHunterSearchSettings;
  expos: ExpoHunterExpo[];
  results: ExpoHunterExpoResult[];
  error?: string;
  createdAt: number;
  updatedAt: number;
};
