import { db } from './pool.js';
import { asPgError, PG } from '../lib/pg-errors.js';
import { metrics } from '../lib/metrics.js';
import type { Tx } from '../modules/users/deletion-hooks.js';

const RETRYABLE = new Set<string>([PG.serializationFailure, PG.deadlockDetected]);

// Run fn in a transaction, retrying a couple of times if postgres aborts it for
// a deadlock / serialization failure. Anything else propagates.
export async function withTx<T>(name: string, fn: (tx: Tx) => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    const end = metrics.txDuration.startTimer({ tx: name });
    try {
      const result = await db.transaction(fn);
      end({ outcome: 'commit' });
      return result;
    } catch (err) {
      const code = asPgError(err)?.code;
      end({ outcome: code && RETRYABLE.has(code) ? 'retry' : 'rollback' });
      if (!code || !RETRYABLE.has(code) || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 10 * i + Math.random() * 20));
    }
  }
}
