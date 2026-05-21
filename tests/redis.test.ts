import assert from "node:assert/strict";
import { test } from "node:test";
import { getRedisConfig } from "../src/lib/redis";

test("redis config prefers native Upstash REST env", () => {
  const config = getRedisConfig({
    UPSTASH_REDIS_REST_URL: "https://upstash.example.com",
    UPSTASH_REDIS_REST_TOKEN: "upstash-token",
    KV_REST_API_URL: "https://kv.example.com",
    KV_REST_API_TOKEN: "kv-token",
  });

  assert.deepEqual(config, {
    url: "https://upstash.example.com",
    token: "upstash-token",
    source: "upstash",
  });
});

test("redis config falls back to Vercel KV REST env", () => {
  const config = getRedisConfig({
    KV_REST_API_URL: "https://kv.example.com",
    KV_REST_API_TOKEN: "kv-token",
  });

  assert.deepEqual(config, {
    url: "https://kv.example.com",
    token: "kv-token",
    source: "vercel-kv",
  });
});

test("redis config is undefined when REST env is incomplete", () => {
  assert.equal(getRedisConfig({}), undefined);
  assert.equal(getRedisConfig({ UPSTASH_REDIS_REST_URL: "https://upstash.example.com" }), undefined);
  assert.equal(getRedisConfig({ KV_REST_API_TOKEN: "kv-token" }), undefined);
});
