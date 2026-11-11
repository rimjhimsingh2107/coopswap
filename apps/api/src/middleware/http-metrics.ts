import type { RequestHandler } from 'express';
import { metrics } from '../lib/metrics.js';

// Label by the matched route template (/api/listings/:id), never the raw path,
// so there's one series per endpoint instead of one per listing.
export const httpMetrics: RequestHandler = (req, res, next) => {
  const end = metrics.httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    end({ method: req.method, route, status_class: `${Math.floor(res.statusCode / 100)}xx` });
  });
  next();
};
