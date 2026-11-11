import { eq } from 'drizzle-orm';
import { listings } from '../../db/schema.js';
import { onAccountDeleted } from '../users/deletion-hooks.js';

// deleting your account takes your listings down with it
onAccountDeleted(async (tx, userId) => {
  await tx.update(listings).set({ status: 'archived', updatedAt: new Date() }).where(eq(listings.ownerId, userId));
});

export { listingsRouter } from './routes.js';
