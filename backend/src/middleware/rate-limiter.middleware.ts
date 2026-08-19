import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../database/redis';
import { AppError } from '../utils/problem-details';
import { env } from '../config/env';

export function rateLimiter(options?: { max?: number; windowMs?: number }) {
  const max = options?.max ?? env.RATE_LIMIT_MAX;
  const windowMs = options?.windowMs ?? env.RATE_LIMIT_WINDOW_MS;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || 'anonymous';
    const key = `rate_limit:${ip}:${req.baseUrl || req.path}`;

    try {
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, Math.ceil(windowMs / 1000));
      }

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - current));

      if (current > max) {
        return next(AppError.tooManyRequests(`Too many requests. Limit is ${max} per ${windowMs / 1000}s`));
      }

      next();
    } catch {
      // Fall through if redis fails
      next();
    }
  };
}
