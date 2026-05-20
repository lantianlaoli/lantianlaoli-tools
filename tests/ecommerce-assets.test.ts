import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as createEcommerceAssets } from "../src/app/api/ecommerce-assets/create/route";
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
  const createTaskBodies: Array<{ model: string; input: Record<string, unknown> }> = [];
  process.env.KIE_API_KEY = "test-kie-key";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";

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
    assert.equal(payload.job.carouselImages[0].taskId, "task-1");
    assert.equal(payload.job.video.storyboardTaskId, "task-13");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) delete process.env.KIE_API_KEY;
    else process.env.KIE_API_KEY = originalKieApiKey;
    if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
  }
});

test("POST /api/ecommerce-assets/status advances successful image and video tasks", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  let createTaskCount = 0;
  process.env.KIE_API_KEY = "test-kie-key";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";

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
      return new Response(JSON.stringify({ code: 200, data: { taskId: isVideo ? "video-task" : `image-task-${createTaskCount}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("https://api.kie.ai/api/v1/jobs/recordInfo")) {
      const taskId = new URL(url).searchParams.get("taskId");
      return new Response(
        JSON.stringify({
          code: 200,
          data: {
            taskId,
            state: "success",
            resultJson: JSON.stringify({ resultUrls: [`https://cdn.example.com/${taskId}.mp4`] }),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
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
    assert.equal(firstStatus.job.video.storyboardUrl, "https://cdn.example.com/image-task-13.mp4");

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
  }
});
