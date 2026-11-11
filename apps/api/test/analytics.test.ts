import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { TestClient, signedUpClient } from './helpers/client.js';
import { createListing } from './helpers/fixtures.js';
import { requestBooking } from './helpers/bookings.js';

const event = (c: TestClient, name: string, sid: string, props: object = {}) =>
  c.agent.post('/api/analytics/events').send({ name, sid, props });

describe('analytics', () => {
  it('stores events without any user or ip and with a hashed session', async () => {
    const c = await signedUpClient();
    const res = await event(c, 'search', 'session-abc-123', { city: 'Boston', hasDates: true, email: 'leak@example.com' });
    expect(res.status).toBe(204);
    const { rows } = await pool.query('select * from analytics_events');
    expect(rows).toHaveLength(1);
    expect(rows[0].city).toBe('Boston');
    expect(rows[0].props).toEqual({ hasDates: true });
    expect(Buffer.from(rows[0].session_hash).toString()).not.toContain('session-abc-123');
    expect(JSON.stringify(rows[0])).not.toContain(c.userId);
  });

  it('respects opt-out, DNT and other origins', async () => {
    const c = await signedUpClient();
    await c.patch('/api/me/settings', { analyticsOptOut: true });
    await event(c, 'search', 'session-optout-1');
    const anon = await new TestClient().init();
    await anon.agent.post('/api/analytics/events').set('dnt', '1').send({ name: 'search', sid: 'session-dnt-1', props: {} });
    await anon.agent.post('/api/analytics/events').set('origin', 'https://evil.example').send({ name: 'search', sid: 'session-evil-1', props: {} });
    expect((await pool.query('select count(*)::int as n from analytics_events')).rows[0].n).toBe(0);
  });

  it('computes the search to request funnel per session', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const guest = await signedUpClient();
    const anon = await new TestClient().init();
    await event(anon, 'search', 'session-one-111', { city: 'Boston' });
    await event(anon, 'listing_view', 'session-one-111', { listingId: l.id });
    await event(anon, 'booking_request', 'session-one-111', { listingId: l.id });
    await event(anon, 'search', 'session-two-222', { city: 'Boston' });
    await requestBooking(guest, l.id, '2027-02-01', '2027-04-01');

    await pool.query(`update users set role = 'admin' where id = $1`, [owner.userId]);
    const res = await owner.get('/api/admin/analytics?days=7');
    expect(res.status).toBe(200);
    expect(res.body.data.searchToRequest).toEqual({ sessionsWithSearch: 2, sessionsWithRequest: 1, rate: 0.5 });
    expect(res.body.data.topListings[0]).toMatchObject({ id: l.id, views: 1, requests: 1 });
    expect(res.body.data.bookingOutcomes.requested).toBe(1);
    expect(res.body.data.daily).toHaveLength(8);

    expect((await guest.get('/api/admin/analytics')).status).toBe(403);
  });
});
