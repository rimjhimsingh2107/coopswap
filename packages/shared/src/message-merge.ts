import type { Message } from './messaging.js';

// Merge newly arrived messages into what a client already has. Socket pushes
// can repeat or arrive out of order, and REST catch up overlaps with pushes,
// so: dedupe by id, keep sorted by seq, and report whether there's a hole.
export function mergeMessages(have: Message[], incoming: Message[]): { messages: Message[]; gapAfter: number | null } {
  if (!incoming.length) return { messages: have, gapAfter: null };
  const byId = new Map(have.map((m) => [m.id, m]));
  let changed = false;
  for (const m of incoming) {
    if (!byId.has(m.id)) {
      byId.set(m.id, m);
      changed = true;
    }
  }
  const messages = changed ? [...byId.values()].sort((a, b) => a.seq - b.seq) : have;

  // look for the first missing seq after the oldest one we hold
  let gapAfter: number | null = null;
  for (let i = 1; i < messages.length; i++) {
    if (messages[i]!.seq !== messages[i - 1]!.seq + 1) {
      gapAfter = messages[i - 1]!.seq;
      break;
    }
  }
  return { messages, gapAfter };
}
