import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { transition } from '../src/modules/bookings/service.js';
import { getApp, signedUpClient, TestClient } from './helpers/client.js';
import { createListing } from './helpers/fixtures.js';
import { act, overlappingApprovedPairs, requestBooking, statusCounts } from './helpers/bookings.js';

// These tests fire requests at the same time and then check the table
// directly. The in-process app still runs real concurrent transactions:
// every request gets its own pooled connection and they interleave in postgres.

async function owners() {
  const owner = await signedUpClient({ name: 'Owner' });
  const listing = await createListing(owner, { availableFrom: '2027-01-01', availableTo: '2027-12-31' });
  return { owner, listing };
}

const guests = (n: number) => Promise.all(Array.from({ length: n }, () => signedUpClient()));

describe('booking concurrency', () => {
  it('20 guests ask for the same dates at once, owner approves all at once, exactly one wins', async () => {
    const { owner, listing } = await owners();
    const gs = await guests(20);

    const created = await Promise.all(gs.map((g) => requestBooking(g, listing.id, '2027-03-01', '2027-05-01')));
    // requests don't hold dates, so they all go in
    expect(created.map((r) => r.status)).toEqual(Array(20).fill(201));

    const results = await Promise.all(created.map((r) => act(owner, r.body.data.id, 'approve')));
    const ok = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(19);
    // losers either got auto-rejected before we got to them, or bounced off the constraint
    for (const r of conflicts) expect(['invalid_transition', 'booking_conflict']).toContain(r.body.error.code);

    expect(await statusCounts(listing.id)).toEqual({ approved: 1, rejected: 19 });
    expect(await overlappingApprovedPairs()).toEqual([]);
  });

  it('random overlapping ranges approved concurrently never produce an overlap', async () => {
    const { owner, listing } = await owners();
    const gs = await guests(30);
    // deterministic pseudo random ranges inside the year, 30-90 nights
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const ranges = gs.map(() => {
      const startDay = Math.floor(rand() * 240);
      const len = 30 + Math.floor(rand() * 60);
      const d = (n: number) => new Date(Date.UTC(2027, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
      return [d(startDay), d(startDay + len)] as const;
    });

    const created = await Promise.all(gs.map((g, i) => requestBooking(g, listing.id, ranges[i]![0], ranges[i]![1])));
    const ids = created.filter((r) => r.status === 201).map((r) => r.body.data.id);
    const results = await Promise.all(ids.map((id) => act(owner, id, 'approve')));

    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    expect(results.some((r) => r.status === 200)).toBe(true);
    expect(await overlappingApprovedPairs()).toEqual([]);
  });

  it('adjacent ranges approved at the same time both succeed', async () => {
    const { owner, listing } = await owners();
    const [g1, g2, g3] = await guests(3);
    const a = (await requestBooking(g1!, listing.id, '2027-02-01', '2027-03-15')).body.data;
    const b = (await requestBooking(g2!, listing.id, '2027-03-15', '2027-05-01')).body.data;
    const c = (await requestBooking(g3!, listing.id, '2027-05-01', '2027-06-15')).body.data;
    const res = await Promise.all([a, b, c].map((x) => act(owner, x.id, 'approve')));
    expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await statusCounts(listing.id)).toEqual({ approved: 3 });
  });

  it('two owner sessions approving competing requests at once: one wins', async () => {
    const { owner, listing } = await owners();
    // same owner signed in on a second device
    const laptop = owner;
    const phone = await new TestClient().init();
    await phone.post('/api/auth/signin', { email: (await laptop.get('/api/me')).body.data.email, password: 'correct horse battery' });

    const [g1, g2] = await guests(2);
    const a = (await requestBooking(g1!, listing.id, '2027-02-01', '2027-04-01')).body.data;
    const b = (await requestBooking(g2!, listing.id, '2027-03-01', '2027-05-01')).body.data;

    for (let round = 0; round < 5; round++) {
      // reset both to requested and race again, a few times for good measure
      await pool.query(`update bookings set status = 'requested', status_reason = null where id = any($1)`, [[a.id, b.id]]);
      const [ra, rb] = await Promise.all([act(laptop, a.id, 'approve'), act(phone, b.id, 'approve')]);
      expect([ra.status, rb.status].sort()).toEqual([200, 409]);
      expect(await overlappingApprovedPairs()).toEqual([]);
    }
  });

  it('the database rejects overlapping approvals even if the app forgets to lock', async () => {
    const { listing } = await owners();
    const [g1, g2] = await guests(2);
    const a = (await requestBooking(g1!, listing.id, '2027-02-01', '2027-04-01')).body.data;
    const b = (await requestBooking(g2!, listing.id, '2027-03-01', '2027-05-01')).body.data;

    // two raw connections, no listing lock, no app checks. just two updates.
    const url = process.env.DATABASE_URL!;
    const c1 = new pg.Client(url);
    const c2 = new pg.Client(url);
    await Promise.all([c1.connect(), c2.connect()]);
    try {
      await c1.query('begin');
      await c2.query('begin');
      await c1.query(`update bookings set status = 'approved' where id = $1`, [a.id]);
      // c2 blocks here on c1's uncommitted index entry...
      const second = c2.query(`update bookings set status = 'approved' where id = $1`, [b.id]).then(
        () => null,
        (e: { code: string; constraint: string }) => e,
      );
      await c1.query('commit');
      // ...and fails as soon as c1 commits
      const err = await second;
      expect(err?.code).toBe('23P01');
      expect(err?.constraint).toBe('bookings_no_overlapping_approved');
      await c2.query('rollback');
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
    expect(await statusCounts(listing.id)).toEqual({ approved: 1, requested: 1 });
  });
});

describe('idempotency', () => {
  it('10 concurrent submits with one key create one booking', async () => {
    const { listing } = await owners();
    const [guest] = await guests(1);
    const key = randomUUID();
    const res = await Promise.all(
      Array.from({ length: 10 }, () => requestBooking(guest!, listing.id, '2027-02-01', '2027-04-01', { 'idempotency-key': key })),
    );
    const statuses = new Set(res.map((r) => r.status));
    expect(statuses).toEqual(new Set([201]));
    expect(new Set(res.map((r) => r.body.data.id)).size).toBe(1);
    expect(res.filter((r) => r.headers['idempotent-replayed'] !== 'true')).toHaveLength(1);
    expect(await statusCounts(listing.id)).toEqual({ requested: 1 });
  });

  it('reusing a key with a different body is an error', async () => {
    const { listing } = await owners();
    const [guest] = await guests(1);
    const key = randomUUID();
    expect((await requestBooking(guest!, listing.id, '2027-02-01', '2027-04-01', { 'idempotency-key': key })).status).toBe(201);
    const other = await requestBooking(guest!, listing.id, '2027-06-01', '2027-08-01', { 'idempotency-key': key });
    expect(other.status).toBe(422);
    expect(other.body.error.code).toBe('idempotency_mismatch');
  });

  it('keys are per user', async () => {
    const { listing } = await owners();
    const [g1, g2] = await guests(2);
    const key = 'shared-key-123';
    const a = await requestBooking(g1!, listing.id, '2027-02-01', '2027-04-01', { 'idempotency-key': key });
    const b = await requestBooking(g2!, listing.id, '2027-02-01', '2027-04-01', { 'idempotency-key': key });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data.id).not.toBe(b.body.data.id);
  });

  it('a failed request does not burn the key', async () => {
    const { listing } = await owners();
    const [guest] = await guests(1);
    const key = randomUUID();
    // listing only goes to dec 31 so this fails validation inside the tx
    const bad = await guest!.post('/api/bookings', { listingId: listing.id, startDate: '2027-12-01', endDate: '2028-02-01' }, { 'idempotency-key': key });
    expect(bad.status).toBe(400);
    const { rows } = await pool.query('select count(*)::int as n from idempotency_keys');
    expect(rows[0].n).toBe(0);
  });

  it('approve retried with the same key after success replays', async () => {
    const { owner, listing } = await owners();
    const [guest] = await guests(1);
    const b = (await requestBooking(guest!, listing.id, '2027-02-01', '2027-04-01')).body.data;
    const key = randomUUID();
    const first = await act(owner, b.id, 'approve', { 'idempotency-key': key });
    const second = await act(owner, b.id, 'approve', { 'idempotency-key': key });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
  });
});

describe('failures part way through', () => {
  it('an error after the update rolls back the approval, the auto-rejects and the history', async () => {
    const { owner, listing } = await owners();
    const [g1, g2] = await guests(2);
    const a = (await requestBooking(g1!, listing.id, '2027-02-01', '2027-04-01')).body.data;
    await requestBooking(g2!, listing.id, '2027-03-01', '2027-05-01');
    const ownerUser = (await owner.get('/api/auth/session')).body.data;
    const eventsBefore = (await pool.query('select count(*)::int as n from booking_events')).rows[0].n;

    await expect(
      transition({
        bookingId: a.id,
        user: ownerUser,
        to: 'approved',
        idempotencyKey: 'will-not-stick',
        _beforeCommit: async () => {
          throw new Error('simulated crash before commit');
        },
      }),
    ).rejects.toThrow('simulated crash');

    expect(await statusCounts(listing.id)).toEqual({ requested: 2 });
    expect((await pool.query('select count(*)::int as n from booking_events')).rows[0].n).toBe(eventsBefore);
    expect((await pool.query('select count(*)::int as n from idempotency_keys')).rows[0].n).toBe(0);
    // and the real approve still works afterwards
    expect((await act(owner, a.id, 'approve')).status).toBe(200);
  });

  it('a connection that dies mid-transaction leaves nothing behind and releases its locks', async () => {
    const { owner, listing } = await owners();
    const [g1, g2] = await guests(2);
    const a = (await requestBooking(g1!, listing.id, '2027-02-01', '2027-04-01')).body.data;
    const b = (await requestBooking(g2!, listing.id, '2027-03-01', '2027-05-01')).body.data;

    // play the part of an api instance that crashes while approving `a`
    const doomed = new pg.Client(process.env.DATABASE_URL!);
    await doomed.connect();
    doomed.on('error', () => {});
    await doomed.query('begin');
    await doomed.query('select 1 from listings where id = $1 for no key update', [listing.id]);
    await doomed.query(`update bookings set status = 'approved' where id = $1`, [a.id]);

    // the owner hits approve on `b` through a healthy instance. it has to wait on the lock...
    const pending = act(owner, b.id, 'approve');
    await new Promise((r) => setTimeout(r, 150));
    // ...then the crashed instance's socket goes away
    (doomed as unknown as { connection: { stream: { destroy(): void } } }).connection.stream.destroy();

    const res = await pending;
    expect(res.status).toBe(200);
    expect(await statusCounts(listing.id)).toEqual({ approved: 1, rejected: 1 });
    const { rows } = await pool.query('select status from bookings where id = $1', [a.id]);
    expect(rows[0].status).toBe('rejected');
  });
});

describe('ambiguous network failures', () => {
  let server: Server | null = null;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  it('client gives up mid request, retries with the same key, ends up with exactly one booking', async () => {
    server = createServer(getApp()).listen(0);
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;
    const { listing } = await owners();
    const gs = await guests(6);

    const cookieOf = async (c: TestClient) => {
      const jar = (c.agent as unknown as { jar: { getCookies(o: object): Array<{ name: string; value: string }> } }).jar;
      return jar.getCookies({ domain: '127.0.0.1', path: '/', secure: false, script: false }).map((x) => `${x.name}=${x.value}`).join('; ');
    };

    // abort after different delays so some die before the server sees them,
    // some during the transaction, some after commit
    const delays = [0, 1, 5, 15, 40, 100];
    for (let i = 0; i < delays.length; i++) {
      const g = gs[i]!;
      const key = randomUUID();
      const cookie = await cookieOf(g);
      const send = (signal?: AbortSignal) =>
        fetch(`${base}/api/bookings`, {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json', cookie, 'x-csrf-token': g.csrf, 'idempotency-key': key },
          body: JSON.stringify({ listingId: listing.id, startDate: '2027-02-01', endDate: '2027-04-01' }),
        });

      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), delays[i]);
      await send(ctrl.signal).catch(() => null);

      const retry = await send();
      expect(retry.status).toBe(201);
      const again = await send();
      expect(((await again.json()) as { data: { id: string } }).data.id).toBe(
        ((await retry.json()) as { data: { id: string } }).data.id,
      );
    }
    // six guests, six bookings, no dupes
    expect(await statusCounts(listing.id)).toEqual({ requested: 6 });
    const { rows } = await pool.query('select guest_id, count(*)::int as n from bookings group by guest_id having count(*) > 1');
    expect(rows).toEqual([]);
  });
});
