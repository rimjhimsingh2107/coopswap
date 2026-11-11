import type { ApiErrorCode } from '@coopswap/shared';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, 'bad_request', msg, details);
export const unauthenticated = (msg = 'sign in required') =>
  new AppError(401, 'unauthenticated', msg);
export const forbidden = (msg = 'not allowed') => new AppError(403, 'forbidden', msg);
export const notFound = (what = 'resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (msg: string, details?: unknown) =>
  new AppError(409, 'conflict', msg, details);
