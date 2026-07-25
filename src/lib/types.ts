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

export type TikTokPricingCountry = "SG" | "MY" | "TH" | "VN" | "PH";
export type TikTokPricingMarket = TikTokPricingCountry;
export type TikTokPricingRegion = "default" | "west" | "east" | "zone-a" | "zone-b" | "zone-c" | "zone-d" | "manila" | "other";
export type TikTokPricingChannel = "Standard" | "Economy";
export type TikTokPricingMarketInput = {
  country: TikTokPricingCountry;
  currency: "SGD" | "MYR" | "THB" | "VND" | "PHP";
  exchangeRateRmbPerLocal: number;
  commissionRate: number;
  transactionRate: number;
  supportFee: number;
  region: TikTokPricingRegion;
  channel: TikTokPricingChannel;
  includeLocalDeliveryCost: boolean;
  logisticsOverride?: number;
};
export type TikTokPricingRequest = {
  productCostRmb: number;
  packagingCostRmb: number;
  weightG: number;
  buyerPayPercent: number;
  targetMarginPercent: number;
  affiliateRate: number;
  market: TikTokPricingMarketInput;
};
export type TikTokPricingMarketResult = {
  country: TikTokPricingCountry;
  currency: "SGD" | "MYR" | "THB" | "VND" | "PHP";
  chargeableWeightG: number;
  logistics: number;
  costLocal: number;
  totalFeeRate: number;
  breakEvenPrice: number;
  targetPrice: number;
  stablePrice: number;
  suggestedPrice: number;
  discountedPrice: number;
  estimatedProfit: number;
  feesAtSuggestedPrice: number;
  freightBasis: string;
  warnings: string[];
};
export type TikTokPricingCalculation = {
  buyerPayRatio: number;
  results: TikTokPricingMarketResult[];
};
export type TikTokPricingAiRecommendation = {
  headline: string;
  recommendation: string;
  reasons: string[];
  risks: string[];
  priceAdjustments: Array<{ country: TikTokPricingCountry; suggestedPrice: number; rationale: string }>;
};

export type EcommerceAssetKind = "carousel" | "detail" | "videoStoryboard" | "video";
export type EcommerceAssetScope = "all" | "carousel" | "detail" | "video";
export type EcommerceAssetScopeOption = Exclude<EcommerceAssetScope, "all">;

export type EcommerceSlotStatus = "waiting" | "processing" | "success" | "fail";

export type EcommerceProductView = "front" | "side" | "back";
export type EcommerceSourceMode = "product-photos" | "manufacturer-promos";
export type EcommerceLogoCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

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
  sourceIndex?: number;
  title: string;
  taskId: string;
  status: EcommerceSlotStatus;
  resultUrl?: string;
  error?: string;
  prompt: string;
};

export type EcommerceManufacturerPromoVisualHierarchy = {
  primaryText: string;
  secondaryText: string[];
  specs: string[];
  badges: string[];
  logoText: string[];
  decorativeText: string[];
  layout: string;
};

export type EcommerceManufacturerPromoAnalysis = {
  productSubject: string;
  visualHierarchy: EcommerceManufacturerPromoVisualHierarchy;
  productVisuals: string;
  keyMessages: string[];
  rewriteGuidance: string;
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
  sourceMode?: EcommerceSourceMode;
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
  manufacturerPromoImageUrls?: string[];
  manufacturerPromoAnalyses?: EcommerceManufacturerPromoAnalysis[];
  brief?: EcommerceCreativeBrief;
  customRequirements?: string;
  petReplacement?: {
    enabled: boolean;
    petImageUrls: string[];
  };
  brandLogo?: {
    enabled: boolean;
    corner: EcommerceLogoCorner;
    logoImageUrl: string;
  };
  carouselImages: EcommerceImageSlot[];
  detailImages: EcommerceImageSlot[];
  video: EcommerceVideoSlot;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type SocialCoverLanguage = EcommerceTextLanguage;
export type SocialCoverAspectRatio = KieAspectRatio;
export type SocialCoverVariantCount = 1 | 2 | 4;
export type SocialCoverSlotStatus = EcommerceSlotStatus;

export type SocialCoverStylePreset = {
  id: string;
  name: string;
  prompt: string;
};

export type SocialCoverBillingMode = "initial" | "system-retry-no-credit" | "user-regeneration";

export type SocialCoverTitleSet = Record<SocialCoverLanguage, string>;

export type SocialCoverCreateRequest = {
  personImageDataUrl: string;
  productOrLogoImageDataUrl: string;
  title: string;
  styleGuide?: string;
  languages?: SocialCoverLanguage[];
  aspectRatiosByLanguage?: Partial<Record<SocialCoverLanguage, SocialCoverAspectRatio[]>>;
  aspectRatios?: SocialCoverAspectRatio[];
  variantsPerGroup?: SocialCoverVariantCount;
  resolution?: KieResolution;
};

export type SocialCoverOptions = {
  languages: SocialCoverLanguage[];
  aspectRatiosByLanguage: Record<SocialCoverLanguage, SocialCoverAspectRatio[]>;
  aspectRatios: SocialCoverAspectRatio[];
  variantsPerGroup: SocialCoverVariantCount;
  resolution: KieResolution;
};

export type SocialCoverSlot = {
  id: string;
  language: SocialCoverLanguage;
  aspectRatio: SocialCoverAspectRatio;
  variantIndex: number;
  title: string;
  taskId: string;
  status: SocialCoverSlotStatus;
  resultUrl?: string;
  error?: string;
  prompt: string;
  billingMode?: SocialCoverBillingMode;
  creditCharged?: boolean;
  retryOfTaskId?: string;
  systemRetryCount?: number;
};

export type SocialCoverJob = {
  id: string;
  status: "preparing" | "processing" | "completed" | "failed";
  sourceTitle: string;
  titles: SocialCoverTitleSet;
  titleFallback: boolean;
  styleGuide?: string;
  options: SocialCoverOptions;
  personImageUrl?: string;
  productOrLogoImageUrl?: string;
  slots: SocialCoverSlot[];
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

export type CodexResetNotifierSettings = {
  accounts: string[];
  keywords: string[];
  maxResults: number;
};

export type CodexResetNotice = {
  id: string;
  text: string;
  authorId: string;
  username: string;
  name: string;
  createdAt: string;
  url: string;
  matchedKeywords: string[];
};

export type CodexResetNotifierStatus =
  | "idle"
  | "checking"
  | "success"
  | "empty"
  | "error"
  | "rate_limited"
  | "config_error";

export type CodexResetNotifierResponse = {
  success: boolean;
  notices: CodexResetNotice[];
  checkedAt: string;
  rateLimit?: {
    limit?: string;
    remaining?: string;
    reset?: string;
  };
  error?: string;
};
