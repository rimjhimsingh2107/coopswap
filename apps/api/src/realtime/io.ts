import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@coopswap/shared';

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// Set once the socket server is attached. REST handlers and the outbox relay
// emit through here; with the redis adapter, io.to(room) reaches sockets on
// every instance, not just this one. Before the server exists (unit/integration
// tests that only use the express app) emits are dropped, clients catch up
// over REST anyway.
let io: IO | null = null;

export const setIO = (s: IO | null) => {
  io = s;
};
export const getIO = () => io;

export const userRoom = (userId: string) => `user:${userId}`;
export const presenceRoom = (userId: string) => `presence:${userId}`;

type EventName = keyof ServerToClientEvents;

export function emitToUser<E extends EventName>(userId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>) {
  io?.to(userRoom(userId)).emit(event, ...args);
}

export function emitToUsers<E extends EventName>(userIds: string[], event: E, ...args: Parameters<ServerToClientEvents[E]>) {
  if (!io || !userIds.length) return;
  io.to(userIds.map(userRoom)).emit(event, ...args);
}
