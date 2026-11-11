import type { listings } from '../../db/schema.js';
import type { Tx } from '../users/deletion-hooks.js';

type Row = typeof listings.$inferSelect;

// Extension points so the bookings module can plug into listing changes
// without listings importing bookings (which imports listings).
export const listingHooks = {
  beforeWindowChange: [] as Array<(tx: Tx, listingId: string, from: string, to: string) => Promise<void>>,
  afterUpdate: [] as Array<(tx: Tx, row: Row, fields: string[]) => Promise<void>>,
  afterArchive: [] as Array<(tx: Tx, row: Row, actorId: string) => Promise<void>>,
  bookedRanges: async (_listingId: string): Promise<Array<{ start: string; end: string }>> => [],
  canSeeAddress: async (_listingId: string, _userId: string): Promise<boolean> => false,
};
