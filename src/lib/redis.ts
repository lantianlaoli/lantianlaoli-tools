import { Redis } from "@upstash/redis";

const globalForRedis = globalThis as typeof globalThis & {
  lantianToolsRedis?: Redis;
  lantianToolsRedisSignature?: string;
};

export type RedisConfig = {
  url: string;
  token: string;
  source: "upstash" | "vercel-kv";
};

type RedisEnv = Record<string, string | undefined>;

export function getRedisConfig(env: RedisEnv = process.env): RedisConfig | undefined {
  const upstashUrl = env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (upstashUrl && upstashToken) {
    return { url: upstashUrl, token: upstashToken, source: "upstash" };
  }

  const kvUrl = env.KV_REST_API_URL?.trim();
  const kvToken = env.KV_REST_API_TOKEN?.trim();
  if (kvUrl && kvToken) {
    return { url: kvUrl, token: kvToken, source: "vercel-kv" };
  }

  return undefined;
}

export function getRedisClient(env: RedisEnv = process.env) {
  const config = getRedisConfig(env);
  if (!config) return undefined;

  const signature = `${config.source}:${config.url}`;
  if (!globalForRedis.lantianToolsRedis || globalForRedis.lantianToolsRedisSignature !== signature) {
    globalForRedis.lantianToolsRedis = new Redis({
      url: config.url,
      token: config.token,
    });
    globalForRedis.lantianToolsRedisSignature = signature;
  }

  return globalForRedis.lantianToolsRedis;
}
