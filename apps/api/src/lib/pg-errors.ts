// drizzle wraps driver errors, so dig through .cause to find the pg one
export interface PgError {
  code: string;
  constraint?: string;
  detail?: string;
}

export function asPgError(err: unknown): PgError | null {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (typeof cur === 'object' && cur !== null && 'code' in cur && typeof cur.code === 'string' && /^[0-9A-Z]{5}$/.test(cur.code)) {
      return cur as PgError;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

export const PG = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  exclusionViolation: '23P01',
  serializationFailure: '40001',
  deadlockDetected: '40P01',
} as const;
