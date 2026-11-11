import { describe, expect, it } from 'vitest';
import { mergeMessages, type Message } from '@coopswap/shared';

// the chat view leans on this for dedupe/order; quick sanity check it's wired
// the way the socket handler uses it
describe('socket message merge as used by the chat', () => {
  it('drops a duplicate push and keeps order', () => {
    const m = (seq: number) => ({ id: `m${seq}`, seq, conversationId: 'c', senderId: 'u', body: '', clientId: `c${seq}`, createdAt: '' }) as Message;
    const once = mergeMessages([m(1)], [m(2)]).messages;
    const twice = mergeMessages(once, [m(2)]).messages;
    expect(twice.map((x) => x.seq)).toEqual([1, 2]);
  });
});
