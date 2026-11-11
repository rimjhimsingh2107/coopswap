import { and, eq } from 'drizzle-orm';
import { db } from '../db/pool.js';
import { idempotencyKeys } from '../db/schema.js';
import { withTx } from '../db/tx.js';
import type { Tx } from '../modules/users/deletion-hooks.js';
import { sha256 } from './crypto.js';
import { AppError } from './errors.js';

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

class AlreadyDone extends Error {}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

async function replay<T>(userId: string, scope: string, key: string, hash: Buffer): Promise<IdempotentResult<T> | null> {
  const [row] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
  if (!row) return null;
  if (!row.requestHash.equals(hash)) {
    throw new AppError(422, 'idempotency_mismatch', 'this idempotency key was already used for a different request');
  }
  return { status: row.responseStatus!, body: row.responseBody as T, replayed: true };
}

/**
 * Runs `work` at most once per (user, scope, key).
 *
 * The key row is inserted at the start of the same transaction that does the
 * work. A concurrent request with the same key blocks on that insert until the
 * first one commits, then finds the row and replays the stored response. If the
 * work fails, the transaction rolls back and takes the key with it, so the
 * client can retry. Only successful responses are remembered.
 */
export async function idempotent<T>(
  opts: { userId: string; scope: string; key: string | undefined; request: unknown; txName: string },
  work: (tx: Tx) => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  const { userId, scope, key } = opts;
  if (!key) {
    const r = await withTx(opts.txName, work);
    return { ...r, replayed: false };
  }
  if (key.length < 8 || key.length > 100) throw new AppError(400, 'bad_request', 'idempotency key must be 8-100 chars');

  const hash = sha256(stableStringify(opts.request));
  const existing = await replay<T>(userId, scope, key, hash);
  if (existing) return existing;

  try {
    const r = await withTx(opts.txName, async (tx) => {
      const inserted = await tx
        .insert(idempotencyKeys)
        .values({ userId, scope, key, requestHash: hash })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });
      if (!inserted.length) throw new AlreadyDone();

      const result = await work(tx);
      await tx
        .update(idempotencyKeys)
        .set({ responseStatus: result.status, responseBody: result.body as object })
        .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
      return result;
    });
    return { ...r, replayed: false };
  } catch (err) {
    if (err instanceof AlreadyDone) {
      const r = await replay<T>(userId, scope, key, hash);
      if (r) return r;
    }
    throw err;
  }
}
