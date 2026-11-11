import { randomUUID } from 'node:crypto';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, Message, ServerToClientEvents } from '@coopswap/shared';
import { pool } from '../src/db/pool.js';
import { baseListing } from './helpers/fixtures.js';
import { RemoteUser, startInstances, stopInstances, type Instance } from './helpers/instances.js';

// Two api processes. The sender talks to one, the recipient's sockets sit on
// the other, so anything that arrives went through redis.

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let instances: Instance[] = [];
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  instances = await startInstances(2, 4200);
}, 30_000);
afterAll(() => stopInstances(instances));
afterEach(() => {
  for (const s of sockets.splice(0)) s.disconnect();
});

const A = () => instances[0]!.url;
const B = () => instances[1]!.url;

function socketFor(user: RemoteUser, base: string, opts: { origin?: string } = {}) {
  const s: ClientSocket = connect(base, {
    transports: ['websocket'],
    extraHeaders: { cookie: user.cookie, origin: opts.origin ?? 'http://localhost:5173' },
    reconnection: false,
    forceNew: true,
  });
  sockets.push(s);
  return s;
}

const connected = (s: ClientSocket) =>
  new Promise<void>((resolve, reject) => {
    if (s.connected) return resolve();
    s.once('connect', () => resolve());
    s.once('connect_error', reject);
  });

function next<E extends keyof ServerToClientEvents>(s: ClientSocket, event: E, match: (...a: Parameters<ServerToClientEvents[E]>) => boolean = () => true, ms = 3000) {
  return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    const handler = (...args: Parameters<ServerToClientEvents[E]>) => {
      if (!match(...args)) return;
      clearTimeout(t);
      s.off(event, handler as never);
      resolve(args[0]);
    };
    s.on(event, handler as never);
  });
}

async function pair() {
  const mk = async (base: string) => {
    const u = await new RemoteUser().signUp(base, `rt-${randomUUID()}@northeastern.edu`);
    await pool.query('update users set email_verified_at = now() where id = $1', [u.id]);
    return u;
  };
  const owner = await mk(A());
  const guest = await mk(B());
  const l = await owner.request(A(), 'POST', '/api/listings', baseListing());
  await owner.request(A(), 'POST', `/api/listings/${l.body.data.id}/publish`);
  const conv = await guest.request(B(), 'POST', '/api/conversations', { listingId: l.body.data.id });
  return { owner, guest, convId: conv.body.data.id as string };
}

describe('realtime across instances', () => {
  it('refuses sockets without a session or from another origin', async () => {
    const anon = new RemoteUser();
    await expect(connected(socketFor(anon, A()))).rejects.toThrow(/unauthenticated/);
    const { owner } = await pair();
    await expect(connected(socketFor(owner, A(), { origin: 'https://evil.example' }))).rejects.toThrow(/origin/);
  });

  it('a message sent on instance A shows up in both of the recipient tabs on instance B', async () => {
    const { owner, guest, convId } = await pair();
    const tab1 = socketFor(owner, B());
    const tab2 = socketFor(owner, B());
    await Promise.all([connected(tab1), connected(tab2)]);

    const got = Promise.all([next(tab1, 'message:new'), next(tab2, 'message:new')]);
    const sent = await guest.request(A(), 'POST', `/api/conversations/${convId}/messages`, { body: 'hello from A', clientId: randomUUID() });
    const [m1, m2] = await got;
    expect(m1.id).toBe(sent.body.data.id);
    expect(m2.id).toBe(sent.body.data.id);
    expect(m1.body).toBe('hello from A');
  });

  it('delivered acks and reads flow back to the sender as receipts', async () => {
    const { owner, guest, convId } = await pair();
    const ownerSock = socketFor(owner, B());
    const guestSock = socketFor(guest, A());
    await Promise.all([connected(ownerSock), connected(guestSock)]);

    const incoming = next(ownerSock, 'message:new');
    await guest.request(A(), 'POST', `/api/conversations/${convId}/messages`, { body: 'ping', clientId: randomUUID() });
    const m = await incoming;

    const delivered = next(guestSock, 'receipt', (r) => r.userId === owner.id && r.deliveredSeq === m.seq);
    ownerSock.emit('delivered', { conversationId: convId, seq: m.seq });
    expect((await delivered).readSeq).toBe(0);

    const read = next(guestSock, 'receipt', (r) => r.userId === owner.id && r.readSeq === m.seq);
    await owner.request(B(), 'POST', `/api/conversations/${convId}/read`, { seq: m.seq });
    await read;
  });

  it('relays typing, but only to the other participant', async () => {
    const { owner, guest, convId } = await pair();
    const ownerSock = socketFor(owner, A());
    const guestSock = socketFor(guest, B());
    const outsider = await new RemoteUser().signUp(A(), `rt-${randomUUID()}@example.com`);
    const outsiderSock = socketFor(outsider, A());
    await Promise.all([connected(ownerSock), connected(guestSock), connected(outsiderSock)]);

    let outsiderSaw = false;
    outsiderSock.on('typing', () => (outsiderSaw = true));

    const typing = next(ownerSock, 'typing');
    guestSock.emit('typing', { conversationId: convId, typing: true });
    expect(await typing).toMatchObject({ conversationId: convId, userId: guest.id, typing: true });

    // outsider pretending to be in the conversation gets nowhere
    let ownerSawFake = false;
    ownerSock.on('typing', (t) => t.userId === outsider.id && (ownerSawFake = true));
    outsiderSock.emit('typing', { conversationId: convId, typing: true });
    await new Promise((r) => setTimeout(r, 300));
    expect(outsiderSaw).toBe(false);
    expect(ownerSawFake).toBe(false);
  });

  it('presence: online while any tab is open, offline after the last one closes', async () => {
    const { owner, guest } = await pair();
    const watcher = socketFor(owner, A());
    await connected(watcher);

    const initial = await new Promise<Record<string, boolean>>((r) => watcher.emit('presence:watch', [guest.id], r));
    expect(initial[guest.id]).toBe(false);

    const online = next(watcher, 'presence', (p) => p.userId === guest.id && p.online);
    const t1 = socketFor(guest, B());
    await connected(t1);
    await online;

    const t2 = socketFor(guest, A());
    await connected(t2);
    let wentOffline = false;
    watcher.on('presence', (p) => p.userId === guest.id && !p.online && (wentOffline = true));
    t1.disconnect();
    await new Promise((r) => setTimeout(r, 300));
    expect(wentOffline).toBe(false); // still has t2

    const offline = next(watcher, 'presence', (p) => p.userId === guest.id && !p.online);
    t2.disconnect();
    await offline;
  });

  it('a client that was offline catches up from history using its last seq', async () => {
    const { owner, guest, convId } = await pair();
    const first = socketFor(owner, B());
    await connected(first);
    const got = next(first, 'message:new');
    await guest.request(A(), 'POST', `/api/conversations/${convId}/messages`, { body: 'one', clientId: randomUUID() });
    const lastSeen = (await got).seq;
    first.disconnect();

    // stuff happens while they're gone
    for (const body of ['two', 'three', 'four']) {
      await guest.request(A(), 'POST', `/api/conversations/${convId}/messages`, { body, clientId: randomUUID() });
    }

    const again = socketFor(owner, A());
    await connected(again);
    const missed = await owner.request(A(), 'GET', `/api/conversations/${convId}/messages?after=${lastSeen}`);
    expect(missed.body.data.items.map((m: Message) => m.body)).toEqual(['two', 'three', 'four']);

    // and new ones still arrive live after reconnecting
    const live = next(again, 'message:new');
    await guest.request(B(), 'POST', `/api/conversations/${convId}/messages`, { body: 'five', clientId: randomUUID() });
    expect((await live).seq).toBe(lastSeen + 4);
  });
});
