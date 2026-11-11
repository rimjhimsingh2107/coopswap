import { pool } from '../../src/db/pool.js';
import type { TestClient } from './client.js';

export const requestBooking = (c: TestClient, listingId: string, startDate: string, endDate: string, headers: Record<string, string> = {}) =>
  c.post('/api/bookings', { listingId, startDate, endDate, occupants: 1 }, headers);

export const act = (c: TestClient, bookingId: string, action: 'approve' | 'reject' | 'cancel', headers: Record<string, string> = {}) =>
  c.post(`/api/bookings/${bookingId}/${action}`, {}, headers);

// the invariant, checked straight against the table: no two approved
// bookings on the same listing share a night
export async function overlappingApprovedPairs() {
  const { rows } = await pool.query(`
    select a.id as a, b.id as b from bookings a
    join bookings b on a.listing_id = b.listing_id and a.id < b.id
    where a.status = 'approved' and b.status = 'approved' and a.stay && b.stay
  `);
  return rows;
}

export async function statusCounts(listingId: string) {
  const { rows } = await pool.query<{ status: string; n: number }>(
    'select status, count(*)::int as n from bookings where listing_id = $1 group by status',
    [listingId],
  );
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
