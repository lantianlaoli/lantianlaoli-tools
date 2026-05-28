import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as createExpoAtlas } from "../src/app/api/expo-company-atlas/create/route";
import { POST as exportExpoAtlas } from "../src/app/api/expo-company-atlas/export/route";
import { POST as generateExpoAtlas } from "../src/app/api/expo-company-atlas/generate/route";
import { POST as parseExpoAtlasCompany } from "../src/app/api/expo-company-atlas/parse-company/route";
import { POST as retryExpoAtlas } from "../src/app/api/expo-company-atlas/retry/route";
import { POST as refreshExpoAtlasStatus } from "../src/app/api/expo-company-atlas/status/route";
import { POST as updateExpoAtlas } from "../src/app/api/expo-company-atlas/update/route";
import { POST as receiveKieCallback } from "../src/app/api/kie/callback/route";
import {
  buildExpoCompanyMarkdown,
  buildExpoImagePrompt,
  mergeExpoCompanyParseResult,
  normalizeExpoAnalysis,
} from "../src/lib/expo-company-atlas";
import type { ExpoAtlasCompany, ExpoAtlasJob, ExpoAtlasPhoto } from "../src/lib/types";

const photoInputs = [
  { id: "photo_1", fileName: "company_intro.JPG", sourceUrl: "https://cdn.example.com/company.jpg" },
  { id: "photo_2", fileName: "product_1.JPG", sourceUrl: "https://cdn.example.com/product.jpg" },
  { id: "photo_3", fileName: "contact.JPG", sourceUrl: "https://cdn.example.com/contact.jpg" },
];

function fetchUrl(input: Parameters<typeof fetch>[0]) {
  return input instanceof Request ? input.url : String(input);
}

async function fetchBodyJson(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
  if (input instanceof Request) return input.clone().json();
  return JSON.parse(String(init?.body));
}

function openRouterMockResponse(content: unknown) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model: "qwen/qwen3.7-max",
      system_fingerprint: "test",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify(content),
          },
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function sampleCompany(): ExpoAtlasCompany {
  return {
    id: "company_1",
    name: "易酷航空",
    intro: "面向航拍建模和消防救援的无人机方案企业。",
    products: [
      {
        id: "product_1",
        name: "消防救援无人机",
        description: "用于应急消防和现场侦察。",
        highlights: ["快速部署", "空中巡检"],
      },
    ],
    contact: {
      phone: "400-000-0000",
      website: "https://example.com",
      raw: "展会资料识别",
    },
    photoIds: ["photo_1", "photo_2"],
  };
}

function samplePhotos(): ExpoAtlasPhoto[] {
  return [
    {
      id: "photo_1",
      fileName: "company_intro.JPG",
      sourceUrl: "https://cdn.example.com/company.jpg",
      kind: "company_intro",
      summary: "企业介绍页",
      extractedText: ["易酷航空"],
      generationStatus: "waiting",
      enhancedStatus: "waiting",
    },
    {
      id: "photo_2",
      fileName: "product_1.JPG",
      sourceUrl: "https://cdn.example.com/product.jpg",
      kind: "product",
      summary: "消防救援无人机产品页",
      extractedText: ["消防救援"],
      generationStatus: "waiting",
      enhancedStatus: "waiting",
    },
  ];
}

function sampleJob(): ExpoAtlasJob {
  const company = sampleCompany();
  const photos = samplePhotos();
  const markdown = buildExpoCompanyMarkdown(company, photos);
  return {
    id: "expo_test",
    status: "ready",
    title: "展会企业图鉴",
    imageAspectRatio: "1:1",
    imageResolution: "1K",
    photos,
    companies: [{ ...company, markdown }],
    persistence: "memory",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

test("expo analysis normalizes companies, photo kinds, and unknown fallbacks", () => {
  const normalized = normalizeExpoAnalysis(
    {
      photos: [
        { id: "photo_1", kind: "company_intro", summary: "企业介绍", extractedText: ["易酷航空", "易酷航空"] },
        { id: "photo_2", kind: "product", summary: "产品资料", extractedText: ["消防救援无人机"] },
      ],
      companies: [
        {
          name: "易酷航空",
          intro: "低空行业无人机方案。",
          photoIds: ["photo_1", "photo_2"],
          products: [{ name: "救援无人机", description: "消防救援场景。", highlights: ["快速部署"] }],
          contact: { phone: "400" },
        },
      ],
    },
    photoInputs
  );

  assert.equal(normalized.companies.length, 2);
  assert.equal(normalized.companies[0].name, "易酷航空");
  assert.deepEqual(normalized.companies[0].photoIds, ["photo_1", "photo_2"]);
  assert.equal(normalized.photos[0].kind, "company_intro");
  assert.deepEqual(normalized.photos[0].extractedText, ["易酷航空"]);
  assert.equal(normalized.companies[1].name, "待整理企业");
  assert.deepEqual(normalized.companies[1].photoIds, ["photo_3"]);
});

test("expo image prompt preserves facts and enforces Chinese consistent visual style", () => {
  const company = sampleCompany();
  const photo = samplePhotos()[0];
  const prompt = buildExpoImagePrompt({ company, photo });

  assert.match(prompt, /Simplified Chinese/);
  assert.match(prompt, /Do not invent specifications/);
  assert.match(prompt, /consistent premium expo media card/);
  assert.match(prompt, /易酷航空/);
  assert.match(prompt, /消防救援无人机/);
});

test("expo company markdown includes intro, products, contact, and generated image", () => {
  const company = sampleCompany();
  const photos = samplePhotos().map((photo) =>
    photo.id === "photo_1" ? { ...photo, generatedUrl: "https://cdn.example.com/generated.png" } : photo
  );
  const markdown = buildExpoCompanyMarkdown(company, photos);

  assert.match(markdown, /# 易酷航空/);
  assert.match(markdown, /## 企业简介/);
  assert.match(markdown, /消防救援无人机/);
  assert.match(markdown, /400-000-0000/);
  assert.match(markdown, /!\[易酷航空 - company_intro.JPG\]\(https:\/\/cdn.example.com\/generated.png\)/);
});

test("POST /api/expo-company-atlas/create rejects missing images", async () => {
  const response = await createExpoAtlas(
    new Request("http://localhost:3000/api/expo-company-atlas/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: [] }),
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "At least one image is required." });
});

test("POST /api/expo-company-atlas/parse-company fills company name when user leaves it blank", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;
  process.env.KIE_API_KEY = "test-kie";
  process.env.OPENROUTER_API_KEY = "test-openrouter";
  process.env.OPENROUTER_MODEL = "qwen/qwen3.7-max";
  let openRouterBody: { messages?: Array<{ content?: Array<{ type?: string; image_url?: { url?: string } }> }> } | undefined;

  globalThis.fetch = async (input, init) => {
    const url = fetchUrl(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: "https://cdn.example.com/company-row.jpg" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      openRouterBody = await fetchBodyJson(input, init);
      return openRouterMockResponse({
        name: "云圣智能",
        intro: "面向新能源和应急消防场景的低空智能企业。",
        products: [{ name: "应急无人机", description: "用于消防和巡检。", highlights: ["快速部署"] }],
        contact: { website: "https://example.com" },
        photos: [{ id: "company_1_local_1", kind: "company_intro", summary: "公司介绍页", extractedText: ["云圣智能"] }],
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const response = await parseExpoAtlasCompany(
      new Request("http://localhost:3000/api/expo-company-atlas/parse-company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId: "company_1",
          files: [{ id: "company_1_local_1", fileName: "intro.jpg", dataUrl: "data:image/jpeg;base64,AA==" }],
        }),
      })
    );

    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.company.name, "云圣智能");
    assert.equal(payload.company.parseStatus, "parsed");
    assert.equal(payload.photos[0].kind, "company_intro");
    assert.equal(payload.photos[0].sourceUrl, "https://cdn.example.com/company-row.jpg");
    const imagePart = openRouterBody?.messages?.[0]?.content?.find((part) => part.type === "image_url");
    assert.equal(imagePart?.image_url?.url, "https://cdn.example.com/company-row.jpg");
    assert.equal(imagePart?.image_url?.url?.startsWith("data:"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
  }
});

test("POST /api/expo-company-atlas/parse-company preserves user company name", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;
  process.env.KIE_API_KEY = "test-kie";
  process.env.OPENROUTER_API_KEY = "test-openrouter";
  process.env.OPENROUTER_MODEL = "qwen/qwen3.7-max";

  globalThis.fetch = async (input) => {
    const url = fetchUrl(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: "https://cdn.example.com/contact.jpg" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      return openRouterMockResponse({
        name: "AI 识别名称",
        intro: "企业资料简介。",
        products: [{ name: "巡检无人机", description: "用于电力巡检。" }],
        contact: { phone: "400" },
        photos: [{ id: "company_2_local_1", kind: "contact", summary: "联系方式页", extractedText: ["400"] }],
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const response = await parseExpoAtlasCompany(
      new Request("http://localhost:3000/api/expo-company-atlas/parse-company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId: "company_2",
          companyName: "用户填写名称",
          files: [{ id: "company_2_local_1", fileName: "contact.jpg", dataUrl: "data:image/jpeg;base64,AA==" }],
        }),
      })
    );

    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.company.name, "用户填写名称");
    assert.equal(payload.company.suggestedName, "AI 识别名称");
    assert.equal(payload.company.contact.phone, "400");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
  }
});

test("mergeExpoCompanyParseResult only updates the target company", () => {
  const job = sampleJob();
  const otherCompany: ExpoAtlasCompany = {
    id: "company_2",
    name: "保留企业",
    intro: "不应被覆盖。",
    products: [],
    contact: {},
    photoIds: ["other_photo"],
    parseStatus: "parsed",
  };
  const otherPhoto: ExpoAtlasPhoto = {
    id: "other_photo",
    fileName: "other.jpg",
    sourceUrl: "https://cdn.example.com/other.jpg",
    kind: "product",
    summary: "其他企业照片",
    extractedText: [],
    generationStatus: "waiting",
    enhancedStatus: "waiting",
  };
  const next = mergeExpoCompanyParseResult({
    job: {
      ...job,
      companies: [...job.companies, otherCompany],
      photos: [...job.photos, otherPhoto],
    },
    companyId: "company_1",
    company: {
      ...sampleCompany(),
      name: "更新后的企业",
      intro: "已更新简介。",
      parseStatus: "parsed",
    },
    photos: [{ ...samplePhotos()[0], summary: "已更新照片摘要" }],
  });

  assert.equal(next.companies.find((company) => company.id === "company_1")?.name, "更新后的企业");
  assert.equal(next.companies.find((company) => company.id === "company_2")?.intro, "不应被覆盖。");
  assert.equal(next.photos.find((photo) => photo.id === "photo_1")?.summary, "已更新照片摘要");
  assert.equal(next.photos.find((photo) => photo.id === "other_photo")?.summary, "其他企业照片");
});

test("POST /api/expo-company-atlas/update rejects empty companies", async () => {
  const job = { ...sampleJob(), companies: [] };
  const response = await updateExpoAtlas(
    new Request("http://localhost:3000/api/expo-company-atlas/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job }),
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "At least one company is required." });
});

test("POST /api/expo-company-atlas/update strips local base64 and blob preview fields", async () => {
  const job: ExpoAtlasJob = {
    ...sampleJob(),
    photos: samplePhotos().map((photo, index) => ({
      ...photo,
      previewUrl: index === 0 ? "data:image/jpeg;base64,AA==" : "blob:http://localhost/local-preview",
    })),
  };

  const response = await updateExpoAtlas(
    new Request("http://localhost:3000/api/expo-company-atlas/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job }),
    })
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.job.photos.some((photo: ExpoAtlasPhoto) => photo.previewUrl?.startsWith("data:")), false);
  assert.equal(payload.job.photos.some((photo: ExpoAtlasPhoto) => photo.previewUrl?.startsWith("blob:")), false);
});

test("POST /api/expo-company-atlas/create uploads images and creates a structured atlas", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;
  process.env.KIE_API_KEY = "test-kie";
  process.env.OPENROUTER_API_KEY = "test-openrouter";
  process.env.OPENROUTER_MODEL = "qwen/qwen3.7-max";

  let uploadCount = 0;
  globalThis.fetch = async (input) => {
    const url = fetchUrl(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      uploadCount += 1;
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: `https://cdn.example.com/upload-${uploadCount}.jpg` } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      return openRouterMockResponse({
        photos: [
          { id: "photo_1", kind: "company_intro", summary: "企业介绍", extractedText: ["易酷航空"] },
          { id: "photo_2", kind: "product", summary: "产品介绍", extractedText: ["消防救援"] },
        ],
        companies: [
          {
            name: "易酷航空",
            intro: "无人机解决方案企业。",
            photoIds: ["photo_1", "photo_2"],
            products: [{ name: "救援无人机", description: "应急消防。", highlights: ["快速部署"] }],
            contact: { phone: "400" },
          },
        ],
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const response = await createExpoAtlas(
      new Request("http://localhost:3000/api/expo-company-atlas/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: [
            { fileName: "a.jpg", dataUrl: "data:image/jpeg;base64,AA==" },
            { fileName: "b.jpg", dataUrl: "data:image/jpeg;base64,AA==" },
          ],
        }),
      })
    );

    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.job.companies[0].name, "易酷航空");
    assert.equal(payload.job.photos.length, 2);
    assert.equal(payload.job.photos[0].sourceUrl, "https://cdn.example.com/upload-1.jpg");
    assert.match(payload.job.companies[0].markdown, /# 易酷航空/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
  }
});

test("POST /api/expo-company-atlas/generate creates one KIE task per target photo", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const taskBodies: Array<{ model: string; callBackUrl?: string; input: Record<string, unknown> }> = [];
  process.env.KIE_API_KEY = "test-kie";
  process.env.NEXT_PUBLIC_SITE_URL = "https://rivora.example.com";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      taskBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ code: 200, data: { taskId: `task-${taskBodies.length}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const response = await generateExpoAtlas(
      new Request("http://localhost:3000/api/expo-company-atlas/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: sampleJob() }),
      })
    );

    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(taskBodies.length, 2);
    assert.equal(taskBodies.every((body) => body.model === "gpt-image-2-image-to-image"), true);
    assert.equal(taskBodies.every((body) => body.input.aspect_ratio === "1:1"), true);
    assert.equal(taskBodies.every((body) => body.callBackUrl === "https://rivora.example.com/api/kie/callback"), true);
    assert.equal(payload.job.photos[0].generationTaskId, "task-1");
    assert.equal(payload.job.photos[0].generationStatus, "processing");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

test("expo status maps KIE callback results into generated photo URLs", async () => {
  const job = sampleJob();
  job.photos[0] = { ...job.photos[0], generationTaskId: "callback-task", generationStatus: "processing" };

  const callback = await receiveKieCallback(
    new Request("http://localhost:3000/api/kie/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: 200,
        data: {
          taskId: "callback-task",
          state: "success",
          resultJson: JSON.stringify({ resultUrls: ["https://cdn.example.com/generated.png"] }),
        },
      }),
    })
  );
  assert.equal(callback.status, 200);

  const response = await refreshExpoAtlasStatus(
    new Request("http://localhost:3000/api/expo-company-atlas/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job }),
    })
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.job.photos[0].generationStatus, "success");
  assert.equal(payload.job.photos[0].generatedUrl, "https://cdn.example.com/generated.png");
  assert.match(payload.job.companies[0].markdown, /generated.png/);
});

test("POST /api/expo-company-atlas/retry regenerates a failed photo", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  process.env.KIE_API_KEY = "test-kie";
  const job = sampleJob();
  job.photos[0] = { ...job.photos[0], generationStatus: "fail", error: "failed once" };

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      return new Response(JSON.stringify({ code: 200, data: { taskId: "retry-task" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const response = await retryExpoAtlas(
      new Request("http://localhost:3000/api/expo-company-atlas/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, photoId: "photo_1" }),
      })
    );

    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.job.photos[0].generationTaskId, "retry-task");
    assert.equal(payload.job.photos[0].generationStatus, "processing");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
  }
});

test("POST /api/expo-company-atlas/export returns markdown files", async () => {
  const job = sampleJob();
  const response = await exportExpoAtlas(
    new Request("http://localhost:3000/api/expo-company-atlas/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job, format: "markdown" }),
    })
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.files.length, 1);
  assert.match(payload.files[0].fileName, /易酷航空\.md/);
  assert.match(payload.files[0].markdown, /## 联系方式/);
});
