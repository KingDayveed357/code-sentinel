import type { CacheInterface } from "./cache-interface";
import Redis from "ioredis";
import { env } from "../../../../env";

export class RedisCache implements CacheInterface {
  private readonly client: Redis;

  constructor(redisUrl = env.REDIS_URL || "redis://127.0.0.1:6379") {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
