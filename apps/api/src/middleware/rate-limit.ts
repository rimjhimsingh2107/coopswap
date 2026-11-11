import type { RequestHandler } from 'express';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { env } from '../config/env.js';
import { redis } from '../lib/redis.js';
import { AppError } from '../lib/errors.js';
import { metrics } from '../lib/metrics.js';

interface LimitOptions {
  name: string;
  points: number;
  durationSec: number;
  // key on the user when signed in, otherwise ip
  by?: 'ip' | 'user';
}

export function rateLimit({ name, points, durationSec, by = 'ip' }: LimitOptions): RequestHandler {
  const scaled = Math.ceil(points * env.RATE_LIMIT_MULTIPLIER);
  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl:${name}`,
    points: scaled,
    duration: durationSec,
    // if redis is down, fall back to per-instance limits instead of failing open
    insuranceLimiter: new RateLimiterMemory({ points: scaled, duration: durationSec }),
  });

  return async (req, res, next) => {
    const key = by === 'user' && req.user ? `u:${req.user.id}` : `ip:${req.ip}`;
    try {
      await limiter.consume(key);
      next();
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        metrics.rateLimited.inc({ limiter: name });
        res.setHeader('retry-after', Math.ceil(err.msBeforeNext / 1000));
        throw new AppError(429, 'rate_limited', 'too many requests, slow down a bit');
      }
      throw err;
    }
  };
}
