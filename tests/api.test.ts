import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { POST as regenerateImage } from "../src/app/api/generate/regenerate/route";
import { POST as startGeneration } from "../src/app/api/generate/start/route";
import { GET as getGenerationStatus } from "../src/app/api/generate/status/route";
import { POST as receiveGenerationWebhook } from "../src/app/api/generate/webhook/route";
import { GET as downloadImage } from "../src/app/api/image/download/route";
import { GET as getWorkbookImage } from "../src/app/api/workbook/image/route";
import { POST as parseWorkbookUpload } from "../src/app/api/workbook/parse/route";
import type { GenerationJob, ParsedWorkbook } from "../src/lib/types";

const SAMPLE_WORKBOOK_PATH = "test_data/clone_competitor/examples.xlsx";

async function buildWorkbookUploadRequest() {
  const buffer = await readFile(SAMPLE_WORKBOOK_PATH);
  const formData = new FormData();
  formData.set(
    "file",
    new File([new Uint8Array(buffer)], "examples.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
  return new Request("http://localhost:3000/api/workbook/parse", {
    method: "POST",
    body: formData,
  });
}

test("POST /api/workbook/parse accepts examples.xlsx as a simulated user upload", async () => {
  const response = await parseWorkbookUpload(await buildWorkbookUploadRequest());
  assert.equal(response.status, 200);

  const workbook = (await response.json()) as ParsedWorkbook;
  assert.ok(workbook.workbookId);
  assert.equal(workbook.product.title.startsWith("Desk Fan"), true);
  assert.equal(workbook.product.description.startsWith("Compact and Powerful Design"), true);
  assert.equal(workbook.imageCount, 12);
  assert.equal(workbook.product.images.length, 2);
  assert.equal(workbook.mainImageRow?.rowNumber, 2);
  assert.equal(workbook.mainImageRow?.resolution, "2K");
  assert.equal(workbook.rows.length, 6);
  assert.deepEqual(
    workbook.rows.map((row) => row.rowNumber),
    [3, 4, 5, 6, 7, 8]
  );
  assert.equal(workbook.rows.every((row) => row.aspectRatio === "1:1"), true);
  assert.equal(workbook.rows.every((row) => row.resolution === "2K"), true);
  assert.match(workbook.product.images[0]?.dataUrl ?? "", /^\/api\/workbook\/image\?/);
  assert.equal(workbook.warnings.length, 0);
});

test("GET /api/workbook/image serves images from the parsed workbook cache", async () => {
  const parseResponse = await parseWorkbookUpload(await buildWorkbookUploadRequest());
  assert.equal(parseResponse.status, 200);
  const workbook = (await parseResponse.json()) as ParsedWorkbook;
  const imageUrl = workbook.product.images[0]?.dataUrl;
  assert.ok(imageUrl);

  const imageResponse = await getWorkbookImage(new Request(`http://localhost:3000${imageUrl}`));
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type")?.startsWith("image/"), true);
  assert.equal((await imageResponse.arrayBuffer()).byteLength > 1000, true);
});

test("POST /api/workbook/parse rejects non-xlsx uploads", async () => {
  const formData = new FormData();
  formData.set("file", new File(["not a workbook"], "examples.txt", { type: "text/plain" }));

  const response = await parseWorkbookUpload(
    new Request("http://localhost:3000/api/workbook/parse", {
      method: "POST",
      body: formData,
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Only .xlsx files are supported." });
});

test("generation webhook stores a result that status reads without polling KIE", async () => {
  const taskId = `uploaded-workbook-test-${Date.now()}`;
  const resultUrl = "https://example.com/generated-image.png";

  const webhookResponse = await receiveGenerationWebhook(
    new Request("http://localhost:3000/api/generate/webhook", {
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

  assert.equal(webhookResponse.status, 200);
  assert.deepEqual(await webhookResponse.json(), { success: true });

  const statusResponse = await getGenerationStatus(
    new Request(`http://localhost:3000/api/generate/status?taskId=${encodeURIComponent(taskId)}`)
  );
  assert.equal(statusResponse.status, 200);

  const status = await statusResponse.json();
  assert.equal(status.taskId, taskId);
  assert.equal(status.status, "success");
  assert.equal(status.resultUrl, resultUrl);
  assert.equal(status.source, "webhook");
});

test("POST /api/generate/regenerate creates a new task from the current result image", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  type CapturedCreateTaskBody = {
    input: {
      input_urls: string[];
      aspect_ratio: string;
      resolution: string;
      prompt: string;
    };
  };
  let capturedCreateTaskBody: CapturedCreateTaskBody | undefined;
  process.env.KIE_API_KEY = "test-kie-key";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.kie.ai/api/v1/jobs/createTask");
    capturedCreateTaskBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ code: 200, data: { taskId: "regenerated-task" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const job: GenerationJob = {
    rowId: "row-3",
    rowNumber: 3,
    sequence: "2",
    taskId: "original-task",
    status: "success",
    resultUrl: "https://example.com/original.png",
    prompt: "Original product prompt",
    aspectRatio: "1:1",
    resolution: "2K",
    sourceRow: { cells: { A: "2" } },
  };

  try {
    const response = await regenerateImage(
      new Request("http://localhost:3000/api/generate/regenerate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          job,
          resultUrl: job.resultUrl,
          refinement: "Make the headline larger and brighten the background.",
          aspectRatio: "16:9",
          resolution: "4K",
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(capturedCreateTaskBody);
    assert.equal(payload.job.taskId, "regenerated-task");
    assert.equal(payload.job.status, "waiting");
    assert.equal(payload.job.resultUrl, undefined);
    assert.equal(payload.job.aspectRatio, "16:9");
    assert.equal(payload.job.resolution, "4K");
    assert.equal(capturedCreateTaskBody.input.input_urls[0], "https://example.com/original.png");
    assert.equal(capturedCreateTaskBody.input.aspect_ratio, "16:9");
    assert.equal(capturedCreateTaskBody.input.resolution, "4K");
    assert.match(capturedCreateTaskBody.input.prompt, /Refinement request:/);
    assert.match(capturedCreateTaskBody.input.prompt, /headline larger/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) {
      delete process.env.KIE_API_KEY;
    } else {
      process.env.KIE_API_KEY = originalKieApiKey;
    }
  }
});

test("POST /api/generate/regenerate rejects invalid output size combinations", async () => {
  const job: GenerationJob = {
    rowId: "row-3",
    rowNumber: 3,
    sequence: "2",
    taskId: "original-task",
    status: "success",
    resultUrl: "https://example.com/original.png",
    prompt: "Original product prompt",
    aspectRatio: "1:1",
    resolution: "2K",
    sourceRow: { cells: { A: "2" } },
  };

  const response = await regenerateImage(
    new Request("http://localhost:3000/api/generate/regenerate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        job,
        resultUrl: job.resultUrl,
        refinement: "Use a larger output.",
        aspectRatio: "1:1",
        resolution: "4K",
      }),
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "1:1 aspect ratio does not support 4K resolution." });
});

test("POST /api/generate/regenerate uploads local reference images and passes them to KIE", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  type CapturedCreateTaskBody = {
    input: {
      input_urls: string[];
      prompt: string;
    };
  };
  let capturedUploadBody: { uploadPath: string; fileName: string; base64Data: string } | undefined;
  let capturedCreateTaskBody: CapturedCreateTaskBody | undefined;
  process.env.KIE_API_KEY = "test-kie-key";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      capturedUploadBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: "https://cdn.example.com/local-product.png" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      capturedCreateTaskBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ code: 200, data: { taskId: "regenerated-with-local-image" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const job: GenerationJob = {
    rowId: "row-3",
    rowNumber: 3,
    sequence: "2",
    taskId: "original-task",
    status: "success",
    resultUrl: "https://example.com/original.png",
    prompt: "Original product prompt",
    aspectRatio: "1:1",
    resolution: "2K",
    sourceRow: { cells: { A: "2" } },
  };

  try {
    const response = await regenerateImage(
      new Request("http://localhost:3000/api/generate/regenerate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          job,
          resultUrl: job.resultUrl,
          refinement: "Replace the product with the uploaded reference.",
          localImages: [{ fileName: "product replacement.png", dataUrl: "data:image/png;base64,AA==" }],
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.job.taskId, "regenerated-with-local-image");
    assert.ok(capturedUploadBody);
    assert.equal(capturedUploadBody.uploadPath, "lantian-tools/edit-uploads");
    assert.equal(capturedUploadBody.fileName, "product-replacement.png");
    assert.equal(capturedUploadBody.base64Data, "data:image/png;base64,AA==");
    assert.ok(capturedCreateTaskBody);
    assert.deepEqual(capturedCreateTaskBody.input.input_urls, [
      "https://example.com/original.png",
      "https://cdn.example.com/local-product.png",
    ]);
    assert.match(capturedCreateTaskBody.input.prompt, /uploaded local image references/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) {
      delete process.env.KIE_API_KEY;
    } else {
      process.env.KIE_API_KEY = originalKieApiKey;
    }
  }
});

test("POST /api/generate/regenerate rejects invalid local reference images", async () => {
  const job: GenerationJob = {
    rowId: "row-3",
    rowNumber: 3,
    sequence: "2",
    taskId: "original-task",
    status: "success",
    resultUrl: "https://example.com/original.png",
    prompt: "Original product prompt",
    aspectRatio: "1:1",
    resolution: "2K",
    sourceRow: { cells: { A: "2" } },
  };

  const invalidTypeResponse = await regenerateImage(
    new Request("http://localhost:3000/api/generate/regenerate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        job,
        resultUrl: job.resultUrl,
        refinement: "Use this local file.",
        localImages: [{ fileName: "notes.txt", dataUrl: "data:text/plain;base64,AA==" }],
      }),
    })
  );

  assert.equal(invalidTypeResponse.status, 400);
  assert.deepEqual(await invalidTypeResponse.json(), {
    error: "Local reference images must be PNG, JPG, or WEBP data URLs.",
  });

  const tooManyResponse = await regenerateImage(
    new Request("http://localhost:3000/api/generate/regenerate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        job,
        resultUrl: job.resultUrl,
        refinement: "Use these local files.",
        localImages: Array.from({ length: 5 }, (_, index) => ({
          fileName: `image-${index}.png`,
          dataUrl: "data:image/png;base64,AA==",
        })),
      }),
    })
  );

  assert.equal(tooManyResponse.status, 400);
  assert.deepEqual(await tooManyResponse.json(), { error: "Upload up to 4 local reference images." });
});

test("POST /api/generate/start reuses duplicate workbook image uploads across rows", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  let uploadCalls = 0;
  let createCalls = 0;
  process.env.KIE_API_KEY = "test-kie-key";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://kieai.redpandaai.co/api/file-base64-upload") {
      uploadCalls += 1;
      return new Response(
        JSON.stringify({ success: true, data: { downloadUrl: `https://cdn.example.com/ref-${uploadCalls}.png` } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (url === "https://api.kie.ai/api/v1/jobs/createTask") {
      createCalls += 1;
      return new Response(JSON.stringify({ code: 200, data: { taskId: `task-${createCalls}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const workbook: ParsedWorkbook = {
    product: {
      title: "Desk Fan",
      description: "Small fan",
      images: [{ id: "product-photo", fileName: "product.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AA==" }],
    },
    rows: [
      {
        id: "row-3",
        rowNumber: 3,
        sequence: "1",
        size: "1600*1600",
        requirement: "Create a clean product ad.",
        copyText: "Cool Air",
        style: "Minimal",
        aspectRatio: "1:1",
        resolution: "2K",
        referenceImages: [{ id: "ref-3", fileName: "ref3.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AA==" }],
        source: { cells: { A: "1" } },
      },
      {
        id: "row-4",
        rowNumber: 4,
        sequence: "2",
        size: "1600*1600",
        requirement: "Create another clean product ad.",
        copyText: "Quiet Breeze",
        style: "Minimal",
        aspectRatio: "1:1",
        resolution: "2K",
        referenceImages: [{ id: "ref-4", fileName: "ref4.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AA==" }],
        source: { cells: { A: "2" } },
      },
    ],
    warnings: [],
    imageCount: 3,
  };

  try {
    const response = await startGeneration(
      new Request("http://localhost:3000/api/generate/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workbook, rowIds: ["row-3", "row-4"] }),
      })
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.jobs.length, 2);
    assert.equal(uploadCalls, 3);
    assert.equal(createCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKieApiKey === undefined) {
      delete process.env.KIE_API_KEY;
    } else {
      process.env.KIE_API_KEY = originalKieApiKey;
    }
  }
});

test("GET /api/image/download validates URLs and returns an attachment", async () => {
  const invalidResponse = await downloadImage(
    new Request("http://localhost:3000/api/image/download?url=file:///tmp/nope.png")
  );
  assert.equal(invalidResponse.status, 400);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/webp" },
    });

  try {
    const response = await downloadImage(
      new Request(
        "http://localhost:3000/api/image/download?url=https%3A%2F%2Fexample.com%2Fimage.webp&name=row-3"
      )
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="row-3.webp"');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
