import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { pool } from '../src/db/pool.js';
import * as mailer from '../src/lib/mailer.js';
import { drainOutbox, onOutbox } from '../src/modules/notifications/outbox.js';
import '../src/modules/notifications/index.js';
import { signedUpClient } from './helpers/client.js';
import { createListing } from './helpers/fixtures.js';
import { act, requestBooking } from './helpers/bookings.js';

async function setup() {
  const owner = await signedUpClient({ name: 'Owner' });
  const guest = await signedUpClient({ name: 'Guest' });
  const listing = await createListing(owner, { title: 'Room by Northeastern' });
  return { owner, guest, listing };
}

const outbox = async () =>
  (await pool.query('select topic, attempts, published_at, last_error from outbox_events order by id')).rows;

describe('notifications', () => {
  it('a booking request notifies the owner, approval notifies the guest', async () => {
    const { owner, guest, listing } = await setup();
    const b = (await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).body.data;

    const ownerList = (await owner.get('/api/notifications')).body.data.items;
    expect(ownerList).toHaveLength(1);
    expect(ownerList[0]).toMatchObject({ type: 'booking.requested', payload: { bookingId: b.id, actorName: 'Guest', listingTitle: 'Room by Northeastern' } });
    expect((await guest.get('/api/notifications')).body.data.items).toHaveLength(0);

    await act(owner, b.id, 'approve');
    const guestList = (await guest.get('/api/notifications')).body.data.items;
    expect(guestList.map((n: { type: string }) => n.type)).toEqual(['booking.approved']);
  });

  it('collapses unread message notifications per conversation', async () => {
    const { guest, owner, listing } = await setup();
    const conv = (await guest.post('/api/conversations', { listingId: listing.id, body: 'hi' })).body.data;
    for (const body of ['are you there', 'hello?']) {
      await guest.post(`/api/conversations/${conv.id}/messages`, { body, clientId: randomUUID() });
    }
    const list = (await owner.get('/api/notifications')).body.data.items;
    expect(list).toHaveLength(1);
    expect(list[0].payload.count).toBe(3);
    expect((await owner.get('/api/conversations/unread')).body.data).toEqual({ messages: 3, notifications: 1 });

    // reading the conversation clears it
    await owner.post(`/api/conversations/${conv.id}/read`, { seq: 3 });
    expect((await owner.get('/api/conversations/unread')).body.data).toEqual({ messages: 0, notifications: 0 });

    // a new message after that starts a fresh one
    await guest.post(`/api/conversations/${conv.id}/messages`, { body: 'one more', clientId: randomUUID() });
    expect((await owner.get('/api/notifications')).body.data.items).toHaveLength(2);
  });

  it('read and read-all only touch your own notifications', async () => {
    const { owner, guest, listing } = await setup();
    await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01');
    const [n] = (await owner.get('/api/notifications')).body.data.items;
    await guest.post(`/api/notifications/${n.id}/read`);
    expect((await owner.get('/api/notifications')).body.data.items[0].readAt).toBeNull();
    await owner.post('/api/notifications/read-all');
    expect((await owner.get('/api/notifications')).body.data.items[0].readAt).not.toBeNull();
  });

  it('notifies people who saved a listing when the price changes', async () => {
    const { owner, guest, listing } = await setup();
    await guest.agent.put(`/api/me/saved/${listing.id}`).set('x-csrf-token', guest.csrf);
    await owner.patch(`/api/listings/${listing.id}`, { title: 'Room by Northeastern (updated)', version: listing.version });
    expect((await guest.get('/api/notifications')).body.data.items).toHaveLength(0); // title isn't watched
    await owner.patch(`/api/listings/${listing.id}`, { monthlyRentCents: 99_000, version: listing.version + 1 });
    const [n] = (await guest.get('/api/notifications')).body.data.items;
    expect(n).toMatchObject({ type: 'listing.updated', payload: { changes: ['price'] } });
  });
});

describe('outbox', () => {
  it('writes outbox rows in the booking transaction and the relay publishes them', async () => {
    const sent: mailer.Mail[] = [];
    vi.spyOn(mailer, 'sendMail').mockImplementation(async (m) => void sent.push(m));
    const { guest, listing } = await setup();
    await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01');

    expect((await outbox()).map((r) => r.topic).sort()).toEqual(['booking.updated', 'email.send', 'notification.created']);
    expect(await drainOutbox()).toBe(3);
    expect((await outbox()).every((r) => r.published_at)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toMatch(/requested/);
    // nothing left
    expect(await drainOutbox()).toBe(0);
  });

  it('a failing side effect never undoes the booking and gets retried with backoff', async () => {
    vi.spyOn(mailer, 'sendMail').mockRejectedValue(new Error('smtp is down'));
    const { owner, guest, listing } = await setup();
    const b = (await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).body.data;
    await drainOutbox();

    // the booking is there regardless
    expect((await owner.get(`/api/bookings/${b.id}`)).body.data.status).toBe('requested');
    const email = (await outbox()).find((r) => r.topic === 'email.send')!;
    expect(email.published_at).toBeNull();
    expect(email.attempts).toBe(1);
    expect(email.last_error).toBe('smtp is down');

    // not picked up again until the backoff passes
    expect(await drainOutbox()).toBe(0);
    await pool.query(`update outbox_events set available_at = now() where topic = 'email.send'`);
    vi.spyOn(mailer, 'sendMail').mockResolvedValue();
    expect(await drainOutbox()).toBe(1);
    expect((await outbox()).find((r) => r.topic === 'email.send')!.published_at).not.toBeNull();
  });

  it('two relays draining at once process each event exactly once', async () => {
    const seen: string[] = [];
    onOutbox('test.event', async (p) => {
      await new Promise((r) => setTimeout(r, 5));
      seen.push(String(p.n));
    });
    const values = Array.from({ length: 200 }, (_, i) => `('test.event', '{"n": ${i}}'::jsonb)`).join(',');
    await pool.query(`insert into outbox_events (topic, payload) values ${values}`);
    await Promise.all([drainOutbox(50), drainOutbox(50), drainOutbox(50), drainOutbox(50), drainOutbox(50)]);
    while ((await drainOutbox(50)) > 0);
    expect(seen).toHaveLength(200);
    expect(new Set(seen).size).toBe(200);
  });

  it('a relay that crashed mid batch: its lease expires and another picks the rows up', async () => {
    const { guest, listing } = await setup();
    await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01');
    // simulate a relay that claimed everything and then died
    await pool.query(`update outbox_events set locked_until = now() + interval '30 seconds', attempts = 1`);
    vi.spyOn(mailer, 'sendMail').mockResolvedValue();
    expect(await drainOutbox()).toBe(0);
    await pool.query(`update outbox_events set locked_until = now() - interval '1 second'`);
    expect(await drainOutbox()).toBe(3);
  });

  it('respects email preferences', async () => {
    const sent: mailer.Mail[] = [];
    vi.spyOn(mailer, 'sendMail').mockImplementation(async (m) => void sent.push(m));
    const { owner, guest, listing } = await setup();
    await owner.patch('/api/me/settings', { emailOnBooking: false });
    await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01');
    await drainOutbox();
    expect(sent).toHaveLength(0);
  });
});
