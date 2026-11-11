import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../db/pool.js';
import { emailTokens } from '../../db/schema.js';
import { randomToken, sha256 } from '../../lib/crypto.js';

type Purpose = 'verify_email' | 'reset_password' | 'verify_university';

const TTL_MINUTES: Record<Purpose, number> = {
  verify_email: 60 * 24,
  verify_university: 60 * 24,
  reset_password: 30,
};

export async function issueToken(userId: string, purpose: Purpose, targetEmail: string) {
  const token = randomToken();
  // only the latest token for a purpose should work
  await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt)));
  await db.insert(emailTokens).values({
    userId,
    purpose,
    targetEmail,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + TTL_MINUTES[purpose] * 60_000),
  });
  return token;
}

// marks the token used and returns it, or null if invalid/expired/used.
// the update-returning is atomic so a token can't be redeemed twice.
export async function consumeToken(raw: string, purpose: Purpose, userId?: string) {
  const [row] = await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailTokens.tokenHash, sha256(raw)),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
        userId ? eq(emailTokens.userId, userId) : undefined,
      ),
    )
    .returning();
  return row ?? null;
}
