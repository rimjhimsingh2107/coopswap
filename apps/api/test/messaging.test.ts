import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { signedUpClient } from './helpers/client.js';
import { createListing } from './helpers/fixtures.js';

async function setup() {
  const owner = await signedUpClient({ name: 'Owner' });
  const guest = await signedUpClient({ name: 'Guest' });
  const listing = await createListing(owner);
  const conv = await guest.post('/api/conversations', { listingId: listing.id, body: 'hi! is this still available?' });
  return { owner, guest, listing, convId: conv.body.data.id as string, conv };
}

const send = (c: Awaited<ReturnType<typeof signedUpClient>>, convId: string, body: string, clientId = randomUUID()) =>
  c.post(`/api/conversations/${convId}/messages`, { body, clientId });

describe('conversations', () => {
  it('opening a conversation twice gives the same one', async () => {
    const { guest, listing, convId, conv } = await setup();
    expect(conv.status).toBe(201);
    expect(conv.body.data.other.displayName).toBe('Owner');
    expect(conv.body.data.lastMessage.body).toBe('hi! is this still available?');
    const again = await guest.post('/api/conversations', { listingId: listing.id });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(convId);
  });

  it("can't message yourself", async () => {
    const owner = await signedUpClient();
    const listing = await createListing(owner);
    expect((await owner.post('/api/conversations', { listingId: listing.id })).status).toBe(400);
  });

  it('outsiders get a 404 for everything', async () => {
    const { convId } = await setup();
    const nosy = await signedUpClient();
    expect((await nosy.get(`/api/conversations/${convId}`)).status).toBe(404);
    expect((await nosy.get(`/api/conversations/${convId}/messages`)).status).toBe(404);
    expect((await send(nosy, convId, 'let me in')).status).toBe(404);
    expect((await nosy.post(`/api/conversations/${convId}/read`, { seq: 1 })).status).toBe(404);
  });
});

describe('messages', () => {
  it('a resent clientId does not create a second message', async () => {
    const { guest, convId } = await setup();
    const clientId = randomUUID();
    const a = await send(guest, convId, 'one', clientId);
    const b = await send(guest, convId, 'one', clientId);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.data.id).toBe(a.body.data.id);
  });

  it('concurrent sends get distinct gapless seqs', async () => {
    const { guest, owner, convId } = await setup();
    const res = await Promise.all(
      Array.from({ length: 30 }, (_, i) => send(i % 2 ? owner : guest, convId, `msg ${i}`)),
    );
    expect(res.every((r) => r.status === 201)).toBe(true);
    const seqs = res.map((r) => r.body.data.seq).sort((a, b) => a - b);
    // seq 1 was the opening message
    expect(seqs).toEqual(Array.from({ length: 30 }, (_, i) => i + 2));
  });

  it('the same clientId sent concurrently still lands once and leaves no gap', async () => {
    const { guest, convId } = await setup();
    const clientId = randomUUID();
    const res = await Promise.all(Array.from({ length: 8 }, () => send(guest, convId, 'dup', clientId)));
    expect(new Set(res.map((r) => r.body.data.id)).size).toBe(1);
    const next = await send(guest, convId, 'after');
    expect(next.body.data.seq).toBe(3);
  });

  it('pages back through history and catches up forward', async () => {
    const { guest, owner, convId } = await setup();
    for (let i = 0; i < 9; i++) await send(guest, convId, `m${i}`);

    const latest = await owner.get(`/api/conversations/${convId}/messages?limit=4`);
    expect(latest.body.data.items.map((m: { seq: number }) => m.seq)).toEqual([7, 8, 9, 10]);
    expect(latest.body.data.hasMore).toBe(true);

    const older = await owner.get(`/api/conversations/${convId}/messages?limit=4&before=7`);
    expect(older.body.data.items.map((m: { seq: number }) => m.seq)).toEqual([3, 4, 5, 6]);

    // a client that went offline at seq 5
    const missed = await owner.get(`/api/conversations/${convId}/messages?after=5`);
    expect(missed.body.data.items.map((m: { seq: number }) => m.seq)).toEqual([6, 7, 8, 9, 10]);
    expect(missed.body.data.hasMore).toBe(false);
  });

  it('tracks unread counts and read receipts', async () => {
    const { guest, owner, convId } = await setup();
    await send(guest, convId, 'two');
    await send(guest, convId, 'three');
    expect((await owner.get('/api/conversations/unread')).body.data.messages).toBe(3);
    expect((await guest.get('/api/conversations/unread')).body.data.messages).toBe(0);

    await owner.post(`/api/conversations/${convId}/read`, { seq: 2 });
    expect((await owner.get('/api/conversations/unread')).body.data.messages).toBe(1);

    // going backwards is ignored, claiming the future is clamped
    await owner.post(`/api/conversations/${convId}/read`, { seq: 1 });
    await owner.post(`/api/conversations/${convId}/read`, { seq: 999 });
    const { rows } = await pool.query(
      'select last_read_seq, last_delivered_seq from conversation_participants where conversation_id = $1 and user_id = $2',
      [convId, owner.userId],
    );
    expect(rows[0]).toEqual({ last_read_seq: 3, last_delivered_seq: 3 });

    const fromGuest = (await guest.get(`/api/conversations/${convId}`)).body.data;
    expect(fromGuest.otherReadSeq).toBe(3);
  });

  it('lists conversations newest activity first', async () => {
    const owner = await signedUpClient();
    const a = await createListing(owner, { title: 'Listing A in Boston' });
    const b = await createListing(owner, { title: 'Listing B in Boston' });
    const guest = await signedUpClient();
    const ca = (await guest.post('/api/conversations', { listingId: a.id, body: 'about A' })).body.data.id;
    const cb = (await guest.post('/api/conversations', { listingId: b.id, body: 'about B' })).body.data.id;
    let list = (await owner.get('/api/conversations')).body.data.items;
    expect(list.map((c: { id: string }) => c.id)).toEqual([cb, ca]);
    await send(guest, ca, 'bump');
    list = (await owner.get('/api/conversations')).body.data.items;
    expect(list.map((c: { id: string }) => c.id)).toEqual([ca, cb]);
    expect(list[0].unread).toBe(2);
  });
});
