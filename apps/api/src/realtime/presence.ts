import { redis } from '../lib/redis.js';

// A user is online if any of their sockets (tabs, devices, instances) checked
// in recently. Each socket is a member of a sorted set scored by when it
// expires; a heartbeat bumps the score. If an instance dies without cleaning
// up, its sockets just age out.

const TTL_MS = 60_000;
const key = (userId: string) => `presence:${userId}`;

export async function socketOnline(userId: string, socketId: string): Promise<boolean> {
  const now = Date.now();
  const k = key(userId);
  const [, , countRes] = (await redis
    .multi()
    .zremrangebyscore(k, 0, now)
    .zadd(k, now + TTL_MS, socketId)
    .zcard(k)
    .pexpire(k, TTL_MS * 2)
    .exec()) as [unknown, unknown, [Error | null, number], unknown];
  // true when this is the first live socket, i.e. they just came online
  return countRes[1] === 1;
}

export async function heartbeat(userId: string, socketId: string) {
  await redis.multi().zadd(key(userId), 'XX', Date.now() + TTL_MS, socketId).pexpire(key(userId), TTL_MS * 2).exec();
}

export async function socketOffline(userId: string, socketId: string): Promise<boolean> {
  const now = Date.now();
  const k = key(userId);
  const res = (await redis.multi().zrem(k, socketId).zremrangebyscore(k, 0, now).zcard(k).exec()) as [
    unknown,
    unknown,
    [Error | null, number],
  ];
  return res[2][1] === 0;
}

export async function onlineStatus(userIds: string[]): Promise<Record<string, boolean>> {
  if (!userIds.length) return {};
  const now = Date.now();
  const pipe = redis.pipeline();
  for (const id of userIds) pipe.zcount(key(id), now, '+inf');
  const res = (await pipe.exec()) ?? [];
  return Object.fromEntries(userIds.map((id, i) => [id, Number(res[i]?.[1] ?? 0) > 0]));
}
