import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'not_found', message: `no route for ${req.method} ${req.path}`, requestId: req.id },
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_failed',
        message: 'request did not pass validation',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        requestId: req.id,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId: req.id },
    });
    return;
  }

  // body-parser / multer errors carry a status
  if (typeof err?.status === 'number' && err.status < 500) {
    const code = err.status === 413 ? 'payload_too_large' : 'bad_request';
    res.status(err.status).json({ error: { code, message: err.message, requestId: req.id } });
    return;
  }

  logger.error({ err, requestId: req.id }, 'unhandled error');
  res.status(500).json({
    error: { code: 'internal', message: 'something went wrong', requestId: req.id },
  });
};
