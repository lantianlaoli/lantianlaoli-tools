import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as createEcommerceAssets } from "../src/app/api/ecommerce-assets/create/route";
import { POST as receiveKieCallback } from "../src/app/api/kie/callback/route";
import { POST as retryEcommerceAsset } from "../src/app/api/ecommerce-assets/retry/route";
import { POST as refreshEcommerceAssetsStatus } from "../src/app/api/ecommerce-assets/status/route";
import { getEcommerceVideoPresentation } from "../src/lib/ecommerce-assets-presentation";
import {
  buildEcommerceImagePrompts,
  buildEcommerceStoryboardPrompt,
  fallbackEcommerceBrief,
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
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const createTaskBodies: Array<{ model: string; callBackUrl?: string; input: Record<string, unknown> }> = [];
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
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
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
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
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
