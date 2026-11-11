import 'express';
import type { SessionUser } from '@coopswap/shared';

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: SessionUser;
    }
  }
}
