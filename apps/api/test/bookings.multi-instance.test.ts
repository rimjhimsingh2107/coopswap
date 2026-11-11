import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { baseListing } from './helpers/fixtures.js';
import { overlappingApprovedPairs, statusCounts } from './helpers/bookings.js';
import { RemoteUser, startInstances, stopInstances, type Instance } from './helpers/instances.js';

// Three separate api processes against one database. Sessions, idempotency
// and the overlap rule all have to work no matter which instance a request hits.

let instances: Instance[] = [];
const pick = (i: number) => instances[i % instances.length]!.url;

beforeAll(async () => {
  instances = await startInstances(3);
}, 30_000);

afterAll(async () => {
  await stopInstances(instances);
});

async function verified(i: number) {
  const u = await new RemoteUser().signUp(pick(i), `multi-${randomUUID()}@northeastern.edu`);
  await pool.query('update users set email_verified_at = now() where id = $1', [u.id]);
  return u;
}

describe('multiple api instances', () => {
  it('a session created on one instance works on the others', async () => {
    const u = await verified(0);
    for (let i = 0; i < 3; i++) {
      const me = await u.request(pick(i), 'GET', '/api/me');
      expect(me.status).toBe(200);
      expect(me.body.data.id).toBe(u.id);
    }
  });

  it('concurrent approvals spread across instances still produce one winner', async () => {
    const owner = await verified(0);
    const created = await owner.request(pick(0), 'POST', '/api/listings', baseListing({ availableFrom: '2027-01-01', availableTo: '2027-12-31' }));
    const listingId = created.body.data.id;
    await owner.request(pick(1), 'POST', `/api/listings/${listingId}/publish`);

    const guests = await Promise.all(Array.from({ length: 15 }, (_, i) => verified(i)));
    const reqs = await Promise.all(
      guests.map((g, i) =>
        g.request(pick(i), 'POST', '/api/bookings', { listingId, startDate: '2027-03-01', endDate: '2027-05-01' }),
      ),
    );
    expect(reqs.every((r) => r.status === 201)).toBe(true);

    const approvals = await Promise.all(
      reqs.map((r, i) => owner.request(pick(i), 'POST', `/api/bookings/${r.body.data.id}/approve`, {})),
    );
    expect(approvals.filter((r) => r.status === 200)).toHaveLength(1);
    expect(approvals.filter((r) => r.status === 409)).toHaveLength(14);
    expect(await statusCounts(listingId)).toEqual({ approved: 1, rejected: 14 });
    expect(await overlappingApprovedPairs()).toEqual([]);
  });

  it('the same idempotency key sent to every instance at once creates one booking', async () => {
    const owner = await verified(0);
    const created = await owner.request(pick(0), 'POST', '/api/listings', baseListing());
    const listingId = created.body.data.id;
    await owner.request(pick(0), 'POST', `/api/listings/${listingId}/publish`);

    const guest = await verified(1);
    const key = randomUUID();
    const res = await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        guest.request(pick(i), 'POST', '/api/bookings', { listingId, startDate: '2027-02-01', endDate: '2027-04-01' }, { 'idempotency-key': key }),
      ),
    );
    expect(res.map((r) => r.status)).toEqual(Array(9).fill(201));
    expect(new Set(res.map((r) => r.body.data.id)).size).toBe(1);
    expect(await statusCounts(listingId)).toEqual({ requested: 1 });
  });
});
