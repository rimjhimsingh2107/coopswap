import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import type { ConversationSummary, Message } from '@coopswap/shared';
import { useConversation, useMarkRead, useMessages, useSendMessage } from '@/hooks/data';
import { useRealtime } from '@/hooks/realtime';
import { useSession } from '@/hooks/session';
import { timeAgo } from '@/lib/format';
import { Avatar, ErrorNote } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/Spinner';

type UiMessage = Message & { pending?: boolean; failed?: boolean };

function Ticks({ m, conv }: { m: UiMessage; conv: ConversationSummary }) {
  if (m.failed) return <span className="text-red-200">failed</span>;
  if (m.pending) return <span>sending…</span>;
  if (conv.otherReadSeq >= m.seq) return <span>seen</span>;
  if (conv.otherDeliveredSeq >= m.seq) return <span>delivered</span>;
  return <span>sent</span>;
}

export function Thread({ conversationId }: { conversationId: string }) {
  const { user } = useSession();
  const { socket } = useRealtime();
  const conv = useConversation(conversationId);
  const msgs = useMessages(conversationId);
  const send = useSendMessage(conversationId, user!.id);
  const markRead = useMarkRead(conversationId);
  const [text, setText] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef(0);

  const messages: UiMessage[] = useMemo(() => {
    const pages = msgs.data?.pages ?? [];
    // pages[0] is newest; flatten oldest -> newest
    return [...pages].reverse().flatMap((p) => p.items);
  }, [msgs.data]);
  const lastSeq = messages.filter((m) => !m.pending).at(-1)?.seq ?? 0;
  const otherId = conv.data?.other.id;

  // read receipts: whatever's on screen while the tab is visible counts as read
  useEffect(() => {
    if (!lastSeq || document.visibilityState !== 'visible') return;
    if (conv.data && conv.data.unread === 0 && conv.data.lastSeq <= lastSeq) return;
    markRead.mutate(lastSeq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSeq, conversationId]);

  // typing + presence for the other person
  useEffect(() => {
    if (!socket || !otherId) return;
    let clear: ReturnType<typeof setTimeout>;
    const onTyping = (t: { conversationId: string; userId: string; typing: boolean }) => {
      if (t.conversationId !== conversationId || t.userId !== otherId) return;
      setOtherTyping(t.typing);
      clearTimeout(clear);
      // in case the "stopped" event gets lost
      if (t.typing) clear = setTimeout(() => setOtherTyping(false), 6000);
    };
    const onPresence = (p: { userId: string; online: boolean }) => p.userId === otherId && setOnline(p.online);
    socket.on('typing', onTyping);
    socket.on('presence', onPresence);
    socket.emit('presence:watch', [otherId], (status) => setOnline(status[otherId] ?? false));
    return () => {
      socket.off('typing', onTyping);
      socket.off('presence', onPresence);
      clearTimeout(clear);
    };
  }, [socket, otherId, conversationId]);

  // keep pinned to the bottom for new messages, keep position when older ones load above
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    else if (prevHeight.current) el.scrollTop += el.scrollHeight - prevHeight.current;
    prevHeight.current = el.scrollHeight;
  }, [messages.length]);

  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onType = (v: string) => {
    setText(v);
    if (!socket) return;
    if (!typingTimer.current) socket.emit('typing', { conversationId, typing: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing', { conversationId, typing: false });
      typingTimer.current = undefined;
    }, 2000);
  };

  const submit = (body: string, clientId: string = crypto.randomUUID()) => {
    if (!body.trim()) return;
    stickToBottom.current = true;
    send.mutate({ body: body.trim(), clientId });
  };

  if (conv.isError) return <div className="p-6"><ErrorNote error={conv.error} /></div>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-3">
        {conv.data && (
          <>
            <Avatar name={conv.data.other.displayName} size="sm" />
            <div className="min-w-0">
              <p className="font-medium">{conv.data.other.displayName}</p>
              <p className="flex items-center gap-1.5 text-xs text-stone-500">
                <span className={clsx('size-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-stone-300')} />
                {online ? 'Online' : 'Offline'} ·{' '}
                <Link to={`/listings/${conv.data.listing.id}`} className="truncate hover:underline">
                  {conv.data.listing.title}
                </Link>
              </p>
            </div>
          </>
        )}
      </div>

      <div
        ref={scroller}
        className="flex-1 space-y-2 overflow-y-auto px-5 py-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 120 && msgs.hasNextPage && !msgs.isFetchingNextPage) {
            prevHeight.current = el.scrollHeight;
            void msgs.fetchNextPage();
          }
        }}
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {msgs.isFetchingNextPage && <div className="flex justify-center"><Spinner className="size-4 text-stone-400" /></div>}
        {msgs.isPending && <div className="flex justify-center py-10"><Spinner className="text-stone-400" /></div>}
        {messages.map((m, i) => {
          const mine = m.senderId === user!.id;
          const prev = messages[i - 1];
          const gap = !prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 15 * 60_000;
          return (
            <div key={m.id}>
              {gap && <p className="my-3 text-center text-[11px] text-stone-400">{new Date(m.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>}
              <div className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={clsx('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-900', m.pending && 'opacity-70')}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={clsx('mt-0.5 text-right text-[10px]', mine ? 'text-brand-100' : 'text-stone-400')}>
                    {timeAgo(m.createdAt)} {mine && conv.data && <>· <Ticks m={m} conv={conv.data} /></>}
                    {m.failed && (
                      <button className="ml-1 underline" onClick={() => submit(m.body, m.clientId)}>
                        retry
                      </button>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {otherTyping && <p className="text-xs text-stone-500">{conv.data?.other.displayName} is typing…</p>}
      </div>

      <form
        className="flex items-end gap-2 border-t border-stone-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
          setText('');
        }}
      >
        <label htmlFor="composer" className="sr-only">Message</label>
        <textarea
          id="composer"
          rows={1}
          maxLength={4000}
          value={text}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(text);
              setText('');
            }
          }}
          placeholder="Write a message"
          className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-stone-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
        />
        <button type="submit" disabled={!text.trim()} className="h-10 rounded-full bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-40">
          Send
        </button>
      </form>
    </div>
  );
}
