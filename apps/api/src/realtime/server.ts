import type { Server as HttpServer } from 'node:http';
import { parseCookie } from 'cookie';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { SessionUser } from '@coopswap/shared';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { metrics } from '../lib/metrics.js';
import { createRedis } from '../lib/redis.js';
import { lookupSession, SESSION_COOKIE } from '../middleware/session.js';
import { assertParticipant, markDelivered, participantsOf, recordDeliveryLatency, unreadCounts } from '../modules/messaging/service.js';
import { presenceRoom, setIO, userRoom, type IO } from './io.js';
import { heartbeat, onlineStatus, socketOffline, socketOnline } from './presence.js';

const HEARTBEAT_MS = 25_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare module 'socket.io' {
  interface SocketData {
    user: SessionUser;
    // conversations we've already checked membership for on this socket
    allowed: Set<string>;
  }
}

export function attachRealtime(http: HttpServer) {
  const pub = createRedis('sio-pub');
  const sub = createRedis('sio-sub');
  const io: IO = new Server(http, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    adapter: createAdapter(pub, sub, { key: `coopswap:${env.NODE_ENV}:sio` }),
    // state recovery only covers short blips; real catch up is via REST
    connectionStateRecovery: { maxDisconnectionDuration: 60_000 },
  });

  io.use(async (socket, next) => {
    // browsers always send Origin on websocket upgrades. checking it stops
    // another site from opening a socket with our cookies
    const origin = socket.handshake.headers.origin;
    if (origin && origin !== env.WEB_ORIGIN) return next(new Error('bad origin'));
    const token = parseCookie(socket.handshake.headers.cookie ?? '')[SESSION_COOKIE];
    const user = token ? await lookupSession(token).catch(() => null) : null;
    if (!user) return next(new Error('unauthenticated'));
    socket.data.user = user;
    socket.data.allowed = new Set();
    next();
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    metrics.wsConnections.inc();

    // handlers go on synchronously, before any awaits, or events the client
    // sends right after connecting get dropped
    const beat = setInterval(() => void heartbeat(user.id, socket.id).catch(() => {}), HEARTBEAT_MS);

    const canUse = async (conversationId: string) => {
      if (socket.data.allowed.has(conversationId)) return true;
      try {
        await assertParticipant(conversationId, user.id);
        socket.data.allowed.add(conversationId);
        return true;
      } catch {
        return false;
      }
    };

    socket.on('typing', async (t) => {
      if (typeof t?.conversationId !== 'string' || !(await canUse(t.conversationId))) return;
      const others = (await participantsOf(t.conversationId)).filter((id) => id !== user.id);
      // volatile: if it can't go out right now, drop it. stale typing is worse than none
      io.volatile.to(others.map(userRoom)).emit('typing', { conversationId: t.conversationId, userId: user.id, typing: Boolean(t.typing) });
    });

    socket.on('delivered', async (d) => {
      if (typeof d?.conversationId !== 'string' || !Number.isInteger(d.seq)) return;
      if (!(await canUse(d.conversationId))) return;
      const r = await markDelivered(user.id, d.conversationId, d.seq).catch(() => null);
      if (r?.changed) void recordDeliveryLatency(d.conversationId, d.seq).catch(() => {});
    });

    socket.on('presence:watch', async (ids, cb) => {
      if (!Array.isArray(ids)) return;
      const wanted = ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 50);
      // only people you share a conversation with. no stalking random users
      const { rows } = await pool.query<{ user_id: string }>(
        `select distinct o.user_id from conversation_participants me
         join conversation_participants o on o.conversation_id = me.conversation_id and o.user_id <> me.user_id
         where me.user_id = $1 and o.user_id = any($2::uuid[])`,
        [user.id, wanted],
      );
      const ok = rows.map((r) => r.user_id);
      if (ok.length) await socket.join(ok.map(presenceRoom));
      if (typeof cb === 'function') cb(await onlineStatus(ok));
    });

    socket.on('disconnect', async () => {
      clearInterval(beat);
      metrics.wsConnections.dec();
      try {
        if (await socketOffline(user.id, socket.id)) io.to(presenceRoom(user.id)).emit('presence', { userId: user.id, online: false });
      } catch {
        // presence entry will expire on its own
      }
    });

    // join() is sync with the in-memory adapter but returns a promise with redis
    void Promise.resolve(socket.join(userRoom(user.id))).then(async () => {
      try {
        if (await socketOnline(user.id, socket.id)) io.to(presenceRoom(user.id)).emit('presence', { userId: user.id, online: true });
        socket.emit('unread', await unreadCounts(user.id));
      } catch (err) {
        logger.warn({ err }, 'presence/unread on connect failed');
      }
    });
  });

  setIO(io);
  return {
    io,
    async close() {
      setIO(null);
      await new Promise<void>((r) => io.close(() => r()));
      pub.disconnect();
      sub.disconnect();
    },
  };
}
