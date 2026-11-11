import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/routes.js';
import { loadSession } from './middleware/session.js';
import { csrf } from './middleware/csrf.js';
import { rateLimit } from './middleware/rate-limit.js';
import { authRouter } from './modules/auth/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { listingsRouter } from './modules/listings/index.js';
import { bookingsRouter } from './modules/bookings/index.js';
import { messagingRouter } from './modules/messaging/routes.js';
import { notificationsRouter } from './modules/notifications/index.js';
import { uploadsRouter } from './modules/uploads/routes.js';
import { geocodeRouter } from './modules/geocode/routes.js';
import { analyticsAdmin, analyticsIntake } from './modules/analytics/routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: { ignore: (req) => req.url === '/healthz' },
      serializers: {
        // only method + path, query strings can contain search terms / emails
        req: (req) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser(env.SESSION_SECRET));

  app.use(healthRouter);
  app.use('/api', healthRouter);

  const api = express.Router();
  api.use(rateLimit({ name: 'global', points: 600, durationSec: 60 }));
  api.use(loadSession);
  api.use(analyticsIntake);
  api.use(csrf);
  api.use(authRouter);
  api.use(usersRouter);
  api.use(listingsRouter);
  api.use(bookingsRouter);
  api.use(messagingRouter);
  api.use(notificationsRouter);
  api.use(uploadsRouter);
  api.use(geocodeRouter);
  api.use(analyticsAdmin);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
