import { describe, expect, it } from 'vitest';
import { mergeMessages } from './message-merge.js';
import type { Message } from './messaging.js';

const m = (seq: number): Message => ({
  id: `m${seq}`,
  conversationId: 'c',
  seq,
  senderId: 'u',
  body: `msg ${seq}`,
  clientId: `c${seq}`,
  createdAt: new Date(2026, 0, 1, 0, seq).toISOString(),
});

describe('mergeMessages', () => {
  it('ignores duplicates', () => {
    const have = [m(1), m(2)];
    const r = mergeMessages(have, [m(2), m(2)]);
    expect(r.messages).toBe(have);
    expect(r.gapAfter).toBeNull();
  });

  it('puts out of order arrivals in seq order', () => {
    const r = mergeMessages([m(1)], [m(3), m(2)]);
    expect(r.messages.map((x) => x.seq)).toEqual([1, 2, 3]);
    expect(r.gapAfter).toBeNull();
  });

  it('reports a gap so the client knows to fetch', () => {
    const r = mergeMessages([m(1), m(2)], [m(5)]);
    expect(r.gapAfter).toBe(2);
    // once the missing ones arrive the gap closes
    expect(mergeMessages(r.messages, [m(4), m(3)]).gapAfter).toBeNull();
  });
});
