import { db } from '../db/pool.js';
import { auditEvents } from '../db/schema.js';
import { currentRequestId } from './context.js';

type Executor = Pick<typeof db, 'insert'>;

export async function audit(
  exec: Executor,
  e: { actorId: string | null; action: string; entityType: string; entityId?: string; metadata?: object },
) {
  await exec.insert(auditEvents).values({
    actorId: e.actorId,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    metadata: e.metadata ?? {},
    requestId: currentRequestId(),
  });
}
