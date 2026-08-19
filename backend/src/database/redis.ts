import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// In-Memory fallback cache for test and local dev without standalone Redis
class InMemoryRedisMock {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    let expiresAt: number | undefined;
    if (mode === 'EX' && duration) {
      expiresAt = Date.now() + duration * 1000;
    } else if (mode === 'PX' && duration) {
      expiresAt = Date.now() + duration;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
    }
    return deleted;
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const newVal = (current ? parseInt(current, 10) : 0) + 1;
    await this.set(key, newVal.toString());
    return newVal;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }
}

export let redisClient: Redis | InMemoryRedisMock;

if (env.NODE_ENV === 'test') {
  redisClient = new InMemoryRedisMock();
} else {
  try {
    const realRedis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null // Don't crash on initial connection failure
    });

    realRedis.on('error', (err) => {
      logger.warn({ err: err.message }, 'Redis connection unavailable; using in-memory store');
    });

    redisClient = realRedis;
  } catch {
    redisClient = new InMemoryRedisMock();
  }
}
