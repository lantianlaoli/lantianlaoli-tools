import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { POST as createSocialCover } from "../src/app/api/social-cover-generator/create/route";
import { POST as regenerateSocialCover } from "../src/app/api/social-cover-generator/regenerate/route";
import { POST as retrySocialCover } from "../src/app/api/social-cover-generator/retry/route";
import { POST as refreshSocialCoverStatus } from "../src/app/api/social-cover-generator/status/route";
import { POST as zipSocialCover } from "../src/app/api/social-cover-generator/zip/route";
import {
  buildSocialCoverFileBaseName,
  buildSocialCoverFileNameMap,
  buildSocialCoverPrompt,
  DEFAULT_SOCIAL_COVER_STYLE_PRESETS,
  normalizeSocialCoverOptions,
  readStoredSocialCoverStylePresets,
  SOCIAL_COVER_STYLE_PRESETS_STORAGE_KEY,
  writeStoredSocialCoverStylePresets,
} from "../src/lib/social-cover-generator";
import type { SocialCoverJob } from "../src/lib/types";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function sampleJob(): SocialCoverJob {
  return {
    id: "social_cover_test",
    status: "processing",
    sourceTitle: "Launch Day",
    titles: { zh: "发布日", en: "Launch Day" },
    titleFallback: false,
    styleGuide: "Bold clean style",
    options: {
      languages: ["zh", "en"],
      aspectRatiosByLanguage: { zh: ["4:3", "3:4"], en: ["4:3", "3:4"] },
      aspectRatios: ["4:3", "3:4"],
      variantsPerGroup: 1,
      resolution: "1K",
    },
    personImageUrl: "https://cdn.example.com/person.png",
    productOrLogoImageUrl: "https://cdn.example.com/logo.png",
    slots: [
      {
        id: "cover-zh-4:3-1",
        language: "zh",
        aspectRatio: "4:3",
        variantIndex: 1,
        title: "发布日",
        taskId: "task-zh",
        status: "processing",
        prompt: "Chinese prompt",
      },
      {
        id: "cover-en-3:4-1",
        language: "en",
        aspectRatio: "3:4",
        variantIndex: 1,
        title: "Launch Day",
        taskId: "task-en",
        status: "fail",
        prompt: "English prompt",
        error: "previous fail",
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

test("social cover options default to bilingual 4:3 and 3:4 with one variant", () => {
  assert.deepEqual(normalizeSocialCoverOptions({}), {
    languages: ["zh", "en"],
    aspectRatiosByLanguage: { zh: ["4:3", "3:4"], en: ["4:3", "3:4"] },
    aspectRatios: ["4:3", "3:4"],
    variantsPerGroup: 1,
    resolution: "1K",
  });
});

test("social cover style presets persist permanently in browser localStorage", () => {
  const storage = new MemoryStorage();
  const customPresets = [
    { id: "custom-launch", name: "Custom Launch", prompt: "Bold founder cover with clean product logo." },
  ];

  writeStoredSocialCoverStylePresets(storage, customPresets);

  assert.equal(storage.getItem(SOCIAL_COVER_STYLE_PRESETS_STORAGE_KEY), JSON.stringify(customPresets));
  assert.deepEqual(readStoredSocialCoverStylePresets(storage), customPresets);

  storage.setItem(SOCIAL_COVER_STYLE_PRESETS_STORAGE_KEY, "not-json");
  assert.deepEqual(readStoredSocialCoverStylePresets(storage), DEFAULT_SOCIAL_COVER_STYLE_PRESETS);
});

test("social cover options allow each language to use different supported model ratios", () => {
  assert.deepEqual(
    normalizeSocialCoverOptions({
      languages: ["zh", "en"],
      aspectRatiosByLanguage: {
        zh: ["1:1", "16:9", "nope"],
        en: ["auto", "9:16"],
      },
      variantsPerGroup: 2,
      resolution: "2K",
    }),
    {
      languages: ["zh", "en"],
      aspectRatiosByLanguage: { zh: ["1:1", "16:9"], en: ["auto", "9:16"] },
      aspectRatios: ["4:3", "3:4"],
      variantsPerGroup: 1,
      resolution: "1K",
    }
  );
});

test("social cover file names use title ratio language and created date", () => {
  const createdAt = new Date("2026-06-19T08:00:00+08:00").getTime();
  assert.equal(
    buildSocialCoverFileBaseName(
      { sourceTitle: "Cat", createdAt },
      { aspectRatio: "3:4", language: "zh" }
    ),
    "cat-34-cn-619"
  );
  assert.equal(buildSocialCoverFileBaseName({ sourceTitle: "Cat", createdAt }, { aspectRatio: "4:3", language: "en" }), "cat-43-en-619");
  assert.equal(buildSocialCoverFileBaseName({ sourceTitle: "Cat", createdAt }, { aspectRatio: "1:1", language: "en" }), "cat-11-en-619");
  assert.equal(buildSocialCoverFileBaseName({ sourceTitle: "Cat", createdAt }, { aspectRatio: "16:9", language: "en" }), "cat-169-en-619");
  assert.equal(buildSocialCoverFileBaseName({ sourceTitle: "Cat", createdAt }, { aspectRatio: "9:16", language: "en" }), "cat-916-en-619");
  assert.equal(buildSocialCoverFileBaseName({ sourceTitle: "Cat", createdAt }, { aspectRatio: "auto", language: "en" }), "cat-auto-en-619");
  assert.equal(buildSocialCoverFileBaseName({ sourceTitle: "猫咪新品", createdAt }, { aspectRatio: "3:4", language: "zh" }), "cover-34-cn-619");
});

test("social cover file name map appends suffixes for duplicate names", () => {
  const job = sampleJob();
  job.sourceTitle = "Cat";
  job.createdAt = new Date("2026-06-19T08:00:00+08:00").getTime();
  job.slots = [
    { ...job.slots[0], id: "first", language: "zh", aspectRatio: "3:4" },
    { ...job.slots[0], id: "second", language: "zh", aspectRatio: "3:4" },
  ];

  assert.deepEqual(buildSocialCoverFileNameMap(job), {
    first: "cat-34-cn-619",
    second: "cat-34-cn-619-2",
  });
});

test("social cover prompts enforce visible text language", () => {
  const zhPrompt = buildSocialCoverPrompt({
    language: "zh",
    aspectRatio: "4:3",
    variantIndex: 1,
    title: "新品发布",
    sourceTitle: "新品发布",
    styleGuide: "极简高级",
  });
  const enPrompt = buildSocialCoverPrompt({
    language: "en",
    aspectRatio: "3:4",
    variantIndex: 1,
    title: "Launch Day",
    sourceTitle: "新品发布",
    styleGuide: "Minimal premium",
  });

  assert.match(zhPrompt, /All newly generated visible cover text MUST be Simplified Chinese/);
  assert.match(zhPrompt, /Canvas\/aspect ratio: 4:3/);
  assert.match(enPrompt, /All newly generated visible cover text MUST be English/);
  assert.match(enPrompt, /Canvas\/aspect ratio: 3:4/);
  assert.match(buildSocialCoverPrompt({
    language: "en",
    aspectRatio: "9:16",
    variantIndex: 1,
    title: "Launch Day",
    sourceTitle: "Launch Day",
  }), /Canvas\/aspect ratio: 9:16/);
});

test("POST /api/social-cover-generator/create rejects missing required fields", async () => {
  const missingPerson = await createSocialCover(
    new Request("http://localhost:3000/api/social-cover-generator/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productOrLogoImageDataUrl: "data:image/png;base64,AA==", title: "Title" }),
    })
  );
  assert.equal(missingPerson.status, 400);
  assert.deepEqual(await missingPerson.json(), { error: "personImageDataUrl is required." });

  const missingProduct = await createSocialCover(
    new Request("http://localhost:3000/api/social-cover-generator/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personImageDataUrl: "data:image/png;base64,AA==", title: "Title" }),
    })
  );
  assert.equal(missingProduct.status, 400);
  assert.deepEqual(await missingProduct.json(), { error: "productOrLogoImageDataUrl is required." });

  const missingTitle = await createSocialCover(
    new Request("http://localhost:3000/api/social-cover-generator/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personImageDataUrl: "data:image/png;base64,AA==",
        productOrLogoImageDataUrl: "data:image/png;base64,AA==",
      }),
    })
  );
  assert.equal(missingTitle.status, 400);
  assert.deepEqual(await missingTitle.json(), { error: "title is required." });
});

test("POST /api/social-cover-generator/create uploads two images and starts four Image2 tasks by default", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
  const originalOpenRouterModel = process.env.OPENROUTER_MODEL;
  const createTaskBodies: Array<{ model: string; input: Record<string, unknown> }> = [];
  let uploadCount = 0;
  process.env.KIE_API_KEY = "test-kie-key";
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      uploadCount += 1;
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: `https://cdn.example.com/upload-${uploadCount}.png` } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      createTaskBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ code: 200, data: { taskId: `cover-task-${createTaskBodies.length}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await createSocialCover(
      new Request("http://localhost:3000/api/social-cover-generator/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personImageDataUrl: "data:image/png;base64,AA==",
          productOrLogoImageDataUrl: "data:image/png;base64,AA==",
          title: "新品发布",
        }),
      })
    );

    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(uploadCount, 2);
    assert.equal(payload.job.slots.length, 4);
    assert.equal(payload.job.titleFallback, true);
    assert.equal(createTaskBodies.length, 4);
    assert.equal(createTaskBodies.every((body) => body.model === "gpt-image-2-image-to-image"), true);
    assert.deepEqual(createTaskBodies[0].input.input_urls, ["https://cdn.example.com/upload-1.png", "https://cdn.example.com/upload-2.png"]);
    assert.equal(createTaskBodies[0].input.aspect_ratio, "4:3");
    assert.equal(createTaskBodies[1].input.aspect_ratio, "3:4");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("KIE_API_KEY", originalKieApiKey);
    restoreEnv("OPENROUTER_API_KEY", originalOpenRouterApiKey);
    restoreEnv("OPENROUTER_MODEL", originalOpenRouterModel);
  }
});

test("POST /api/social-cover-generator/status maps KIE polling into slot and job status", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  process.env.KIE_API_KEY = "test-kie-key";

  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("https://api.kie.ai/api/v1/jobs/recordInfo")) {
      return new Response(
        JSON.stringify({
          code: 200,
          data: {
            taskId: "task-zh",
            state: "success",
            resultJson: JSON.stringify({ resultUrls: ["https://cdn.example.com/cover.png"] }),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await refreshSocialCoverStatus(
      new Request("http://localhost:3000/api/social-cover-generator/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: sampleJob() }),
      })
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.job.status, "failed");
    assert.equal(payload.job.slots[0].status, "success");
    assert.equal(payload.job.slots[0].resultUrl, "https://cdn.example.com/cover.png");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("KIE_API_KEY", originalKieApiKey);
  }
});

test("POST /api/social-cover-generator/retry recreates a failed slot from hosted source images", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  let createTaskBody: { input?: Record<string, unknown> } | undefined;
  process.env.KIE_API_KEY = "test-kie-key";

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
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
    const response = await retrySocialCover(
      new Request("http://localhost:3000/api/social-cover-generator/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: sampleJob(), slotId: "cover-en-3:4-1" }),
      })
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      taskId: "retry-task",
      retryOfTaskId: "task-en",
      creditCharged: false,
      billingMode: "system-retry-no-credit",
    });
    assert.deepEqual(createTaskBody?.input?.input_urls, ["https://cdn.example.com/person.png", "https://cdn.example.com/logo.png"]);
    assert.equal(createTaskBody?.input?.aspect_ratio, "3:4");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("KIE_API_KEY", originalKieApiKey);
  }
});

test("POST /api/social-cover-generator/retry rejects non-failed slots so user retries are not free", async () => {
  const response = await retrySocialCover(
    new Request("http://localhost:3000/api/social-cover-generator/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job: sampleJob(), slotId: "cover-zh-4:3-1" }),
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Only failed system slots can be retried without credits." });
});

test("POST /api/social-cover-generator/regenerate uses current result plus uploaded references", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  let createTaskBody: { input?: Record<string, unknown> } | undefined;
  process.env.KIE_API_KEY = "test-kie-key";

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: "https://cdn.example.com/local-ref.png" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      createTaskBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ code: 200, data: { taskId: "regen-task" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await regenerateSocialCover(
      new Request("http://localhost:3000/api/social-cover-generator/regenerate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          job: sampleJob(),
          slotId: "cover-zh-4:3-1",
          resultUrl: "https://cdn.example.com/current.png",
          refinement: "Make the title bigger",
          localImages: [{ fileName: "ref.png", dataUrl: "data:image/png;base64,AA==" }],
        }),
      })
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.taskId, "regen-task");
    assert.match(payload.prompt, /Make the title bigger/);
    assert.deepEqual(createTaskBody?.input?.input_urls, ["https://cdn.example.com/current.png", "https://cdn.example.com/local-ref.png"]);
    assert.equal(createTaskBody?.input?.aspect_ratio, "4:3");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("KIE_API_KEY", originalKieApiKey);
  }
});

test("POST /api/social-cover-generator/zip exports successful covers and manifest", async () => {
  const originalFetch = globalThis.fetch;
  const job = sampleJob();
  job.sourceTitle = "Cat";
  job.createdAt = new Date("2026-06-19T08:00:00+08:00").getTime();
  job.slots[0] = { ...job.slots[0], status: "success", resultUrl: "https://cdn.example.com/cover.png" };

  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://cdn.example.com/cover.png") {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await zipSocialCover(
      new Request("http://localhost:3000/api/social-cover-generator/zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job }),
      })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
    const archive = await JSZip.loadAsync(await response.arrayBuffer());
    const manifestFile = archive.file("manifest.json");
    assert.ok(manifestFile);
    const manifest = JSON.parse(await manifestFile.async("string"));
    assert.equal(manifest.files["cover-zh-4:3-1"], "cat-43-cn-619.png");
    assert.ok(archive.file("covers/cat-43-cn-619.png"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
