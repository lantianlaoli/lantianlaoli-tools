import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as createEcommerceAssets } from "../src/app/api/ecommerce-assets/create/route";
import { POST as receiveKieCallback } from "../src/app/api/kie/callback/route";
import { POST as retryEcommerceAsset } from "../src/app/api/ecommerce-assets/retry/route";
import { POST as refreshEcommerceAssetsStatus } from "../src/app/api/ecommerce-assets/status/route";
import { getEcommerceVideoPresentation } from "../src/lib/ecommerce-assets-presentation";
import { getDefaultRequirementPhrases } from "../src/lib/ecommerce-requirement-phrases";
import {
  buildEcommerceImagePrompts,
  buildEcommerceStoryboardPrompt,
  buildManufacturerPromoCarouselPrompt,
  fallbackEcommerceBrief,
  fallbackManufacturerPromoAnalysis,
  getBrandLogoNote,
  getPetReplacementNote,
} from "../src/lib/ecommerce-assets";

test("ecommerce image prompts keep English text concise by default", () => {
  const brief = fallbackEcommerceBrief("en");
  const prompts = buildEcommerceImagePrompts(brief, "en");

  assert.equal(prompts.length, 12);
  assert.equal(prompts.every((slot) => slot.prompt.includes('Canvas/aspect ratio: 1:1')), true);
  assert.equal(prompts.every((slot) => slot.prompt.includes("Keep visible text minimal")), true);
  assert.equal(prompts.every((slot) => slot.prompt.includes("Use concise English text only")), true);
  assert.equal(prompts.every((slot) => slot.prompt.includes("Use one unified design language")), true);
  assert.equal(prompts.every((slot) => slot.prompt.includes("Preserve the exact product identity")), true);
});

test("ecommerce image prompts support concise Chinese text", () => {
  const brief = fallbackEcommerceBrief("zh");
  const prompts = buildEcommerceImagePrompts(brief, "zh");
  const storyboardPrompt = buildEcommerceStoryboardPrompt(brief, "zh");

  assert.equal(prompts.every((slot) => slot.prompt.includes("使用简洁中文可见文案")), true);
  assert.equal(prompts.every((slot) => slot.prompt.includes("所有新增或叠加的可见文字必须是简体中文")), true);
  assert.equal(prompts.every((slot) => slot.prompt.includes("产品照片中原本存在的英文 logo、印花或包装文字可以保留")), true);
  assert.match(storyboardPrompt, /中文/);
  assert.match(storyboardPrompt, /所有新增或叠加的可见文字必须是简体中文/);
});

test("first carousel prompt enforces a clean white background main image", () => {
  const prompts = buildEcommerceImagePrompts(fallbackEcommerceBrief("en"), "en");
  const firstCarousel = prompts.find((slot) => slot.kind === "carousel" && slot.index === 1);

  assert.ok(firstCarousel);
  assert.match(firstCarousel.prompt, /pure white background/i);
  assert.match(firstCarousel.prompt, /centered product/i);
  assert.match(firstCarousel.prompt, /no headline/i);
});

test("blank custom requirements add default no-extra-text guidance to carousel only", () => {
  const prompts = buildEcommerceImagePrompts(fallbackEcommerceBrief("zh"), "zh");
  const carouselPrompts = prompts.filter((slot) => slot.kind === "carousel");
  const detailPrompts = prompts.filter((slot) => slot.kind === "detail");
  const defaultGuidance = "默认生成要求：轮播图不要出现产品本身之外的修饰性文字、说明性文字、参数文字、引导文字、箭头或标签。";

  assert.equal(carouselPrompts.every((slot) => slot.prompt.includes(defaultGuidance)), true);
  assert.equal(detailPrompts.every((slot) => slot.prompt.includes(defaultGuidance)), false);
});

test("custom requirements replace the default carousel no-extra-text guidance", () => {
  const brief = {
    ...fallbackEcommerceBrief("zh"),
    customRequirements: "轮播图允许短文案，详情图保留参数说明。",
  };
  const prompts = buildEcommerceImagePrompts(brief, "zh");
  const defaultGuidance = "默认生成要求：轮播图不要出现产品本身之外的修饰性文字、说明性文字、参数文字、引导文字、箭头或标签。";

  assert.equal(prompts.every((slot) => !slot.prompt.includes(defaultGuidance)), true);
  assert.equal(prompts.every((slot) => slot.prompt.includes("轮播图允许短文案，详情图保留参数说明。")), true);
});

test("ecommerce video presentation shows an unstarted empty state before a job exists", () => {
  const presentation = getEcommerceVideoPresentation(null);

  assert.equal(presentation.status, "waiting");
  assert.equal(presentation.badgeLabel, "未开始");
  assert.equal(presentation.hasStarted, false);
  assert.equal(presentation.placeholder, "上传产品照片后开始生成");
});

test("POST /api/ecommerce-assets/create rejects missing product photo", async () => {
  const response = await createEcommerceAssets(
    new Request("http://localhost:3000/api/ecommerce-assets/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ textLanguage: "en" }),
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "At least one productPhotoDataUrl is required." });
});

test("POST /api/ecommerce-assets/create uploads the photo and starts image tasks plus storyboard", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const createTaskBodies: Array<{ model: string; callBackUrl?: string; input: Record<string, unknown> }> = [];
  process.env.KIE_API_KEY = "test-kie-key";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.OPENROUTER_MODEL = "test-model";
  process.env.NEXT_PUBLIC_SITE_URL = "https://rivora.example.com";

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: "https://cdn.example.com/product.png" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      return new Response(
        JSON.stringify({
          id: "chatcmpl-product-test",
          object: "chat.completion",
          created: 1,
          model: "test-model",
          system_fingerprint: "test",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify({
                  productCategory: "desk fan",
                  productIdentity: "compact white fan with circular grille",
                  materialsAndColors: "matte white plastic and pale gray grille",
                  sellingPoints: ["quiet airflow", "compact body", "easy desk placement"],
                  designLanguage: "clean white studio ecommerce design with soft lime accents",
                  carouselDirection: "premium marketplace carousel",
                  detailDirection: "minimal benefit-led detail images",
                  videoDirection: "15 second square product ad with reveal, macro, benefit, hero ending",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      createTaskBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ code: 200, data: { taskId: `task-${createTaskBodies.length}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await createEcommerceAssets(
      new Request("http://localhost:3000/api/ecommerce-assets/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productPhotoDataUrls: ["data:image/png;base64,AA=="], textLanguage: "en" }),
      })
    );

    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(typeof payload.jobId, "string");
    assert.equal(payload.job.carouselImages.length, 6);
    assert.equal(payload.job.detailImages.length, 6);
    assert.equal(createTaskBodies.length, 13);
    assert.equal(createTaskBodies.filter((body) => body.model === "gpt-image-2-image-to-image").length, 13);
    assert.equal(createTaskBodies.every((body) => body.input.aspect_ratio === "1:1"), true);
    assert.equal(createTaskBodies.every((body) => body.callBackUrl === "https://rivora.example.com/api/kie/callback"), true);
    assert.equal(payload.job.carouselImages[0].taskId, "task-1");
    assert.equal(payload.job.video.storyboardTaskId, "task-13");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

test("POST /api/ecommerce-assets/create honors assetScope", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const createTaskBodies: Array<{ model: string; input: Record<string, unknown> }> = [];
  process.env.KIE_API_KEY = "test-kie-key";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.NEXT_PUBLIC_SITE_URL = "https://rivora.example.com";

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: "https://cdn.example.com/product.png" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fallbackEcommerceBrief("en")) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      createTaskBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ code: 200, data: { taskId: `scope-task-${createTaskBodies.length}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  async function createScoped(assetScope: unknown) {
    createTaskBodies.length = 0;
    const response = await createEcommerceAssets(
      new Request("http://localhost:3000/api/ecommerce-assets/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productPhotoDataUrls: ["data:image/png;base64,AA=="], textLanguage: "en", assetScope }),
      })
    );
    assert.equal(response.status, 202);
    return response.json();
  }

  async function createScopeList(assetScopes: unknown) {
    createTaskBodies.length = 0;
    const response = await createEcommerceAssets(
      new Request("http://localhost:3000/api/ecommerce-assets/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productPhotoDataUrls: ["data:image/png;base64,AA=="], textLanguage: "en", assetScopes }),
      })
    );
    assert.equal(response.status, 202);
    return response.json();
  }

  try {
    const carousel = await createScoped("carousel");
    assert.equal(carousel.job.assetScope, "carousel");
    assert.equal(carousel.job.carouselImages.length, 6);
    assert.equal(carousel.job.detailImages.length, 0);
    assert.equal(carousel.job.video.storyboardTaskId, undefined);
    assert.equal(createTaskBodies.length, 6);
    assert.equal(createTaskBodies.every((body) => body.model === "gpt-image-2-image-to-image"), true);

    const detail = await createScoped("detail");
    assert.equal(detail.job.assetScope, "detail");
    assert.equal(detail.job.carouselImages.length, 0);
    assert.equal(detail.job.detailImages.length, 6);
    assert.equal(detail.job.video.storyboardTaskId, undefined);
    assert.equal(createTaskBodies.length, 6);

    const video = await createScoped("video");
    assert.equal(video.job.assetScope, "video");
    assert.equal(video.job.carouselImages.length, 0);
    assert.equal(video.job.detailImages.length, 0);
    assert.equal(typeof video.job.video.storyboardTaskId, "string");
    assert.equal(createTaskBodies.length, 1);

    const invalid = await createScoped("bogus");
    assert.equal(invalid.job.assetScope, "all");
    assert.deepEqual(invalid.job.assetScopes, ["carousel", "detail", "video"]);
    assert.equal(invalid.job.carouselImages.length, 6);
    assert.equal(invalid.job.detailImages.length, 6);
    assert.equal(typeof invalid.job.video.storyboardTaskId, "string");
    assert.equal(createTaskBodies.length, 13);

    const carouselAndDetail = await createScopeList(["carousel", "detail"]);
    assert.equal(carouselAndDetail.job.assetScope, "carousel");
    assert.deepEqual(carouselAndDetail.job.assetScopes, ["carousel", "detail"]);
    assert.equal(carouselAndDetail.job.carouselImages.length, 6);
    assert.equal(carouselAndDetail.job.detailImages.length, 6);
    assert.equal(carouselAndDetail.job.video.storyboardTaskId, undefined);
    assert.equal(createTaskBodies.length, 12);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

test("POST /api/ecommerce-assets/create generates one carousel image per manufacturer promo", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const createTaskBodies: Array<{ model: string; callBackUrl?: string; input: Record<string, unknown> }> = [];
  const openRouterBodies: Array<{ messages: Array<{ content: unknown }> }> = [];
  let uploadCount = 0;
  process.env.KIE_API_KEY = "test-kie-key";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.OPENROUTER_MODEL = "test-model";
  process.env.NEXT_PUBLIC_SITE_URL = "https://rivora.example.com";

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      uploadCount += 1;
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: `https://cdn.example.com/promo-${uploadCount}.png` } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      const bodyText = init?.body ? String(init.body) : input instanceof Request ? await input.clone().text() : "{}";
      openRouterBodies.push(JSON.parse(bodyText));
      return new Response(
        JSON.stringify({
          id: "chatcmpl-manufacturer-test",
          object: "chat.completion",
          created: 1,
          model: "test-model",
          system_fingerprint: "test",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify({
                  productSubject: "white desk fan",
                  visualHierarchy: {
                    primaryText: "Quiet airflow",
                    secondaryText: ["USB rechargeable"],
                    specs: ["3 speed levels"],
                    badges: ["New"],
                    logoText: ["ACME"],
                    decorativeText: ["summer sale"],
                    layout: "product on left, dense copy on right",
                  },
                  productVisuals: "round grille, compact white body, small base",
                  keyMessages: ["quiet airflow", "portable desk use"],
                  rewriteGuidance: "Keep the product photo and simplify copy hierarchy.",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      createTaskBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ code: 200, data: { taskId: `manufacturer-task-${createTaskBodies.length}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await createEcommerceAssets(
      new Request("http://localhost:3000/api/ecommerce-assets/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceMode: "manufacturer-promos",
          manufacturerPromoDataUrls: ["data:image/png;base64,AA==", "data:image/jpeg;base64,BB=="],
          customRequirements: "Apple 极简白底黑字风格，减少参数堆叠。",
          textLanguage: "zh",
        }),
      })
    );

    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.job.sourceMode, "manufacturer-promos");
    assert.deepEqual(payload.job.assetScopes, ["carousel"]);
    assert.equal(payload.job.carouselImages.length, 2);
    assert.equal(payload.job.detailImages.length, 0);
    assert.equal(payload.job.video.storyboardTaskId, undefined);
    assert.equal(payload.job.manufacturerPromoImageUrls.length, 2);
    assert.equal(payload.job.manufacturerPromoAnalyses.length, 2);
    assert.equal(payload.job.carouselImages[0].sourceIndex, 0);
    assert.equal(payload.job.carouselImages[1].sourceIndex, 1);
    assert.match(payload.job.carouselImages[0].prompt, /视觉层级解析/);
    assert.match(payload.job.carouselImages[0].prompt, /Quiet airflow/);
    assert.match(payload.job.carouselImages[0].prompt, /Apple 极简白底黑字风格/);
    assert.equal(openRouterBodies.length, 2);
    assert.equal(createTaskBodies.length, 2);
    assert.deepEqual(createTaskBodies[0].input.input_urls, ["https://cdn.example.com/promo-1.png"]);
    assert.deepEqual(createTaskBodies[1].input.input_urls, ["https://cdn.example.com/promo-2.png"]);
    assert.equal(createTaskBodies.every((body) => body.model === "gpt-image-2-image-to-image"), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalOpenRouterModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalOpenRouterModel;
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

test("POST /api/ecommerce-assets/create rejects too many manufacturer promos", async () => {
  const response = await createEcommerceAssets(
    new Request("http://localhost:3000/api/ecommerce-assets/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceMode: "manufacturer-promos",
        manufacturerPromoDataUrls: Array.from({ length: 7 }, () => "data:image/png;base64,AA=="),
      }),
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Upload up to 6 manufacturer promo images." });
});

async function sendKieSuccess(taskId: string, resultUrl: string) {
  const response = await receiveKieCallback(
    new Request("http://localhost:3000/api/kie/callback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: 200,
        data: {
          taskId,
          state: "success",
          resultJson: JSON.stringify({ resultUrls: [resultUrl] }),
        },
      }),
    })
  );
  assert.equal(response.status, 200);
}

test("POST /api/ecommerce-assets/status advances successful image and video tasks from KIE callbacks", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  let createTaskCount = 0;
  const createTaskBodies: Array<{ model: string; callBackUrl?: string }> = [];
  process.env.KIE_API_KEY = "test-kie-key";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.NEXT_PUBLIC_SITE_URL = "https://rivora.example.com";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: "https://cdn.example.com/product.png" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fallbackEcommerceBrief("en")) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      createTaskCount += 1;
      const body = JSON.parse(String(init?.body));
      createTaskBodies.push(body);
      const isVideo = body.model === "bytedance/seedance-2-fast";
      return new Response(JSON.stringify({ code: 200, data: { taskId: isVideo ? "video-task" : `image-task-${createTaskCount}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const createResponse = await createEcommerceAssets(
      new Request("http://localhost:3000/api/ecommerce-assets/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productPhotoDataUrls: ["data:image/png;base64,AA=="], textLanguage: "en" }),
      })
    );
    const createPayload = await createResponse.json();
    for (const slot of [...createPayload.job.carouselImages, ...createPayload.job.detailImages]) {
      await sendKieSuccess(slot.taskId, `https://cdn.example.com/${slot.taskId}.png`);
    }
    await sendKieSuccess(createPayload.job.video.storyboardTaskId, "https://cdn.example.com/storyboard.png");

    const firstStatusResponse = await refreshEcommerceAssetsStatus(
      new Request("http://localhost:3000/api/ecommerce-assets/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: createPayload.job }),
      })
    );
    assert.equal(firstStatusResponse.status, 200);
    const firstStatus = await firstStatusResponse.json();
    assert.equal(firstStatus.job.carouselImages.every((slot: { status: string }) => slot.status === "success"), true);
    assert.equal(firstStatus.job.detailImages.every((slot: { status: string }) => slot.status === "success"), true);
    assert.equal(firstStatus.job.video.status, "processing");
    assert.equal(firstStatus.job.video.storyboardUrl, "https://cdn.example.com/storyboard.png");
    assert.equal(createTaskBodies.at(-1)?.model, "bytedance/seedance-2-fast");
    assert.equal(createTaskBodies.at(-1)?.callBackUrl, "https://rivora.example.com/api/kie/callback");
    await sendKieSuccess("video-task", "https://cdn.example.com/video-task.mp4");

    const secondStatusResponse = await refreshEcommerceAssetsStatus(
      new Request("http://localhost:3000/api/ecommerce-assets/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: firstStatus.job }),
      })
    );
    const secondStatus = await secondStatusResponse.json();
    assert.equal(secondStatus.job.video.status, "success");
    assert.equal(secondStatus.job.video.resultUrl, "https://cdn.example.com/video-task.mp4");
    assert.equal(secondStatus.job.status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

test("POST /api/ecommerce-assets/status advances a video-only job from storyboard callback", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  let createTaskCount = 0;
  process.env.KIE_API_KEY = "test-kie-key";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.NEXT_PUBLIC_SITE_URL = "https://rivora.example.com";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: "https://cdn.example.com/product.png" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fallbackEcommerceBrief("en")) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      createTaskCount += 1;
      const body = JSON.parse(String(init?.body));
      const isVideo = body.model === "bytedance/seedance-2-fast";
      return new Response(JSON.stringify({ code: 200, data: { taskId: isVideo ? "video-only-task" : `video-only-image-${createTaskCount}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const createResponse = await createEcommerceAssets(
      new Request("http://localhost:3000/api/ecommerce-assets/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productPhotoDataUrls: ["data:image/png;base64,AA=="], textLanguage: "en", assetScope: "video" }),
      })
    );
    const createPayload = await createResponse.json();
    assert.equal(createPayload.job.carouselImages.length, 0);
    assert.equal(createPayload.job.detailImages.length, 0);
    await sendKieSuccess(createPayload.job.video.storyboardTaskId, "https://cdn.example.com/video-only-storyboard.png");

    const firstStatusResponse = await refreshEcommerceAssetsStatus(
      new Request("http://localhost:3000/api/ecommerce-assets/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: createPayload.job }),
      })
    );
    const firstStatus = await firstStatusResponse.json();
    assert.equal(firstStatus.job.video.status, "processing");
    assert.equal(firstStatus.job.video.taskId, "video-only-task");
    assert.equal(firstStatus.job.status, "processing");

    await sendKieSuccess("video-only-task", "https://cdn.example.com/video-only.mp4");
    const secondStatusResponse = await refreshEcommerceAssetsStatus(
      new Request("http://localhost:3000/api/ecommerce-assets/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: firstStatus.job }),
      })
    );
    const secondStatus = await secondStatusResponse.json();
    assert.equal(secondStatus.job.video.status, "success");
    assert.equal(secondStatus.job.status, "completed");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

test("POST /api/ecommerce-assets/retry recreates a failed image task with callback", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  let createTaskBody: { callBackUrl?: string; input?: Record<string, unknown> } | undefined;
  process.env.KIE_API_KEY = "test-kie-key";
  process.env.NEXT_PUBLIC_SITE_URL = "https://rivora.example.com";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      createTaskBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ code: 200, data: { taskId: "retry-task" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const job = {
      id: "job-1",
      status: "failed",
      textLanguage: "zh",
      imageAspectRatio: "1:1",
      imageResolution: "1K",
      productImageUrls: ["https://cdn.example.com/product.png"],
      carouselImages: [
        {
          id: "carousel-1",
          kind: "carousel",
          index: 1,
          title: "Main",
          taskId: "old-task",
          status: "fail",
          error: "Sorry, but the image we created may violate OpenAI's content policies.",
          prompt: "Retry this product image.",
        },
      ],
      detailImages: [],
      video: { status: "waiting", prompt: "" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const response = await retryEcommerceAsset(
      new Request("http://localhost:3000/api/ecommerce-assets/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, slotId: "carousel-1" }),
      })
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { taskId: "retry-task" });
    assert.equal(createTaskBody?.callBackUrl, "https://rivora.example.com/api/kie/callback");
    assert.deepEqual(createTaskBody?.input?.input_urls, ["https://cdn.example.com/product.png"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

test("POST /api/ecommerce-assets/retry uses the matching manufacturer promo source image", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  let createTaskBody: { callBackUrl?: string; input?: Record<string, unknown> } | undefined;
  process.env.KIE_API_KEY = "test-kie-key";
  process.env.NEXT_PUBLIC_SITE_URL = "https://rivora.example.com";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      createTaskBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ code: 200, data: { taskId: "retry-manufacturer-task" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const job = {
      id: "job-2",
      sourceMode: "manufacturer-promos",
      status: "failed",
      textLanguage: "zh",
      imageAspectRatio: "1:1",
      imageResolution: "1K",
      manufacturerPromoImageUrls: ["https://cdn.example.com/promo-1.png", "https://cdn.example.com/promo-2.png"],
      carouselImages: [
        {
          id: "manufacturer-carousel-2",
          kind: "carousel",
          index: 2,
          sourceIndex: 1,
          title: "厂家图 2",
          taskId: "old-task",
          status: "fail",
          prompt: "Retry this manufacturer promo.",
        },
      ],
      detailImages: [],
      video: { status: "waiting", prompt: "" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const response = await retryEcommerceAsset(
      new Request("http://localhost:3000/api/ecommerce-assets/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, slotId: "manufacturer-carousel-2" }),
      })
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { taskId: "retry-manufacturer-task" });
    assert.deepEqual(createTaskBody?.input?.input_urls, ["https://cdn.example.com/promo-2.png"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

test("manufacturer promo prompt omits pet replacement when note is absent", () => {
  const prompt = buildManufacturerPromoCarouselPrompt({
    analysis: {
      productSubject: "test product",
      visualHierarchy: {
        primaryText: "",
        secondaryText: [],
        specs: [],
        badges: [],
        logoText: [],
        decorativeText: [],
        layout: "centered",
      },
      productVisuals: "test visuals",
      keyMessages: [],
      rewriteGuidance: "test guidance",
    },
    textLanguage: "en",
    sourceIndex: 0,
  });

  assert.equal(/pet replacement rule/i.test(prompt), false);
});

test("manufacturer promo prompt appends the pet replacement note when provided", () => {
  const note = getPetReplacementNote("en");
  const prompt = buildManufacturerPromoCarouselPrompt({
    analysis: {
      productSubject: "test product",
      visualHierarchy: {
        primaryText: "",
        secondaryText: [],
        specs: [],
        badges: [],
        logoText: [],
        decorativeText: [],
        layout: "centered",
      },
      productVisuals: "test visuals",
      keyMessages: [],
      rewriteGuidance: "test guidance",
    },
    textLanguage: "en",
    sourceIndex: 0,
    petReplacementNote: note,
  });

  assert.match(prompt, /ABSOLUTE PRIORITY RULE/);
  assert.ok(prompt.includes(note));
  // The pet rule must appear in the first half of the prompt so the model
  // treats it as a high-priority instruction instead of trailing guidance.
  const head = prompt.split("\n").slice(0, 6).join("\n");
  assert.match(head, /ABSOLUTE PRIORITY RULE/);
  assert.match(head, /real, photogenic cat/i);
});

test("getPetReplacementNote returns language-specific text", () => {
  const en = getPetReplacementNote("en");
  const zh = getPetReplacementNote("zh");
  assert.match(en, /real, photogenic cat/i);
  assert.match(en, /not an illustration, not a cartoon cat/i);
  assert.match(en, /If there is no cat, or there is an illustrated cat/i);
  assert.match(en, /Do not introduce the user's cat in the final output/i);
  assert.match(zh, /真实存在一只猫/);
  assert.match(zh, /不是插画、不是卡通形象、不是 logo 上的小图/);
  assert.match(zh, /其他情况一律不替换/);
  assert.notEqual(en, zh);
});

test("fallbackManufacturerPromoAnalysis returns language-specific safe defaults", () => {
  const en = fallbackManufacturerPromoAnalysis("en");
  const zh = fallbackManufacturerPromoAnalysis("zh");
  assert.ok(en.productSubject.length > 0);
  assert.ok(zh.productSubject.length > 0);
  assert.match(zh.productSubject, /原厂家宣传图/);
  assert.match(en.productSubject, /manufacturer promotional image/i);
  assert.ok(en.visualHierarchy.layout.length > 0);
  assert.ok(zh.visualHierarchy.layout.length > 0);
  assert.deepEqual(en.visualHierarchy.primaryText, "");
  assert.deepEqual(en.keyMessages, []);
});

test("manufacturer promo prompt omits brand logo rule when note is absent", () => {
  const prompt = buildManufacturerPromoCarouselPrompt({
    analysis: {
      productSubject: "test product",
      visualHierarchy: {
        primaryText: "",
        secondaryText: [],
        specs: [],
        badges: [],
        logoText: [],
        decorativeText: [],
        layout: "centered",
      },
      productVisuals: "test visuals",
      keyMessages: [],
      rewriteGuidance: "test guidance",
    },
    textLanguage: "en",
    sourceIndex: 0,
  });

  assert.equal(/brand logo/i.test(prompt), false);
  assert.equal(/brand-logo/i.test(prompt), false);
  assert.equal(/ABSOLUTE PRIORITY RULE/.test(prompt), false);
});

test("manufacturer promo prompt appends the brand logo priority rule when provided", () => {
  const note = getBrandLogoNote("en", "top-left");
  const prompt = buildManufacturerPromoCarouselPrompt({
    analysis: {
      productSubject: "test product",
      visualHierarchy: {
        primaryText: "",
        secondaryText: [],
        specs: [],
        badges: [],
        logoText: [],
        decorativeText: [],
        layout: "centered",
      },
      productVisuals: "test visuals",
      keyMessages: [],
      rewriteGuidance: "test guidance",
    },
    textLanguage: "en",
    sourceIndex: 0,
    brandLogoNote: note,
  });

  assert.match(prompt, /ABSOLUTE PRIORITY RULE/);
  assert.ok(prompt.includes(note));
  const head = prompt.split("\n").slice(0, 6).join("\n");
  assert.match(head, /ABSOLUTE PRIORITY RULE/);
  assert.match(head, /TOP-LEFT corner/);
});

test("getBrandLogoNote returns the correct corner text for every corner", () => {
  const enCorners: Record<string, string> = {
    "top-left": "TOP-LEFT corner",
    "top-right": "TOP-RIGHT corner",
    "bottom-left": "BOTTOM-LEFT corner",
    "bottom-right": "BOTTOM-RIGHT corner",
  };
  const zhCorners: Record<string, string> = {
    "top-left": "左上角",
    "top-right": "右上角",
    "bottom-left": "左下角",
    "bottom-right": "右下角",
  };

  for (const [corner, enText] of Object.entries(enCorners)) {
    const en = getBrandLogoNote("en", corner as "top-left" | "top-right" | "bottom-left" | "bottom-right");
    const zh = getBrandLogoNote("zh", corner as "top-left" | "top-right" | "bottom-left" | "bottom-right");
    assert.match(en, new RegExp(enText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(zh, new RegExp(zhCorners[corner]));
    assert.notEqual(en, zh);
  }
});

test("getBrandLogoNote mentions the 8% uniform margin for every corner", () => {
  const corners: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right"> = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ];
  for (const corner of corners) {
    const en = getBrandLogoNote("en", corner);
    const zh = getBrandLogoNote("zh", corner);
    assert.match(en, /exactly 8% of the image's shorter side/i);
    assert.match(zh, /各 8%/);
  }
});

test("getDefaultRequirementPhrases returns language-specific defaults (no Chinese in English set, no English in Chinese set)", () => {
  const zh = getDefaultRequirementPhrases("zh");
  const en = getDefaultRequirementPhrases("en");

  assert.ok(zh.length > 0, "zh defaults should not be empty");
  assert.ok(en.length > 0, "en defaults should not be empty");

  for (const phrase of en) {
    assert.doesNotMatch(phrase, /[一-鿿]/, `English default must not contain CJK: ${phrase}`);
  }
  for (const phrase of zh) {
    assert.doesNotMatch(phrase, /[A-Za-z]{6,}/, `Chinese default should not contain long Latin runs: ${phrase}`);
  }

  assert.ok(
    en.some((phrase) => /Apple-style minimal white background/i.test(phrase)),
    "English defaults should include the Apple-style template",
  );
  assert.ok(
    zh.some((phrase) => /Apple 极简白底黑字风格/.test(phrase)),
    "Chinese defaults should include the Apple-style template",
  );
});
