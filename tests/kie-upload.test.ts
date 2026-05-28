import assert from "node:assert/strict";
import { test } from "node:test";
import {
  uploadKieBase64File,
  uploadKieImage,
  uploadKieStreamFile,
  uploadKieUrlFile,
} from "../src/lib/kie";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function uploadResponse(downloadUrl: string) {
  return new Response(
    JSON.stringify({
      success: true,
      code: 200,
      msg: "File uploaded successfully",
      data: {
        fileName: "uploaded-image.png",
        filePath: "images/uploaded-image.png",
        downloadUrl,
        fileSize: 10,
        mimeType: "image/png",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

test("uploadKieBase64File follows KIE base64 upload documentation", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  let body: Record<string, unknown> | undefined;
  let authorization: string | null = null;
  process.env.KIE_API_KEY = "test-kie";

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://kieai.redpandaai.co/api/file-base64-upload");
    authorization = new Headers(init?.headers).get("authorization");
    body = JSON.parse(String(init?.body));
    return uploadResponse("https://tempfile.redpandaai.co/base64.png");
  };

  try {
    const downloadUrl = await uploadKieBase64File({
      base64Data: "data:image/png;base64,AA==",
      uploadPath: "images/base64",
      fileName: "test-image.png",
    });

    assert.equal(downloadUrl, "https://tempfile.redpandaai.co/base64.png");
    assert.equal(authorization, "Bearer test-kie");
    assert.deepEqual(body, {
      base64Data: "data:image/png;base64,AA==",
      uploadPath: "images/base64",
      fileName: "test-image.png",
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("KIE_API_KEY", originalKieApiKey);
  }
});

test("uploadKieImage remains a base64 upload compatibility wrapper", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  let body: Record<string, unknown> | undefined;
  process.env.KIE_API_KEY = "test-kie";

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://kieai.redpandaai.co/api/file-base64-upload");
    body = JSON.parse(String(init?.body));
    return uploadResponse("https://tempfile.redpandaai.co/image.png");
  };

  try {
    const downloadUrl = await uploadKieImage("data:image/png;base64,AA==", "image.png", "rivora/references");

    assert.equal(downloadUrl, "https://tempfile.redpandaai.co/image.png");
    assert.deepEqual(body, {
      base64Data: "data:image/png;base64,AA==",
      uploadPath: "rivora/references",
      fileName: "image.png",
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("KIE_API_KEY", originalKieApiKey);
  }
});

test("uploadKieUrlFile follows KIE URL upload documentation", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  let body: Record<string, unknown> | undefined;
  process.env.KIE_API_KEY = "test-kie";

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://kieai.redpandaai.co/api/file-url-upload");
    body = JSON.parse(String(init?.body));
    return uploadResponse("https://tempfile.redpandaai.co/url.png");
  };

  try {
    const downloadUrl = await uploadKieUrlFile({
      fileUrl: "https://example.com/source.png",
      uploadPath: "images/downloaded",
      fileName: "downloaded.png",
    });

    assert.equal(downloadUrl, "https://tempfile.redpandaai.co/url.png");
    assert.deepEqual(body, {
      fileUrl: "https://example.com/source.png",
      uploadPath: "images/downloaded",
      fileName: "downloaded.png",
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("KIE_API_KEY", originalKieApiKey);
  }
});

test("uploadKieStreamFile follows KIE multipart stream upload documentation", async () => {
  const originalFetch = globalThis.fetch;
  const originalKieApiKey = process.env.KIE_API_KEY;
  let formData: FormData | undefined;
  let contentType: string | null = null;
  process.env.KIE_API_KEY = "test-kie";

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://kieai.redpandaai.co/api/file-stream-upload");
    contentType = new Headers(init?.headers).get("content-type");
    formData = init?.body as FormData;
    return uploadResponse("https://tempfile.redpandaai.co/stream.png");
  };

  try {
    const downloadUrl = await uploadKieStreamFile({
      file: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      uploadPath: "images/user-uploads",
      fileName: "stream.png",
    });

    assert.equal(downloadUrl, "https://tempfile.redpandaai.co/stream.png");
    assert.equal(contentType, null);
    assert.equal(formData?.get("uploadPath"), "images/user-uploads");
    assert.equal(formData?.get("fileName"), "stream.png");
    const file = formData?.get("file");
    assert.equal(file instanceof File, true);
    assert.equal((file as File).name, "stream.png");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("KIE_API_KEY", originalKieApiKey);
  }
});
