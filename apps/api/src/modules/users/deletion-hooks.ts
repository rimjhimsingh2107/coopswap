import type { db } from '../../db/pool.js';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// other modules register cleanup here (archive listings, cancel bookings...)
// so the users module doesn't have to import all of them
export const hooks: Array<(tx: Tx, userId: string) => Promise<void>> = [];
export const onAccountDeleted = (fn: (tx: Tx, userId: string) => Promise<void>) => hooks.push(fn);
