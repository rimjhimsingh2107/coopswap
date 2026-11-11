import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  describeNotification,
  mergeMessages,
  type AppNotification,
  type ClientToServerEvents,
  type ConversationSummary,
  type Message,
  type ServerToClientEvents,
} from '@coopswap/shared';
import { keys } from '@/lib/query';
import { useToast } from '@/components/ui/Toast';
import { useSession } from './session';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface RealtimeState {
  socket: AppSocket | null;
  connected: boolean;
}

const Ctx = createContext<RealtimeState>({ socket: null, connected: false });
export const useRealtime = () => useContext(Ctx);

export interface MessagePage {
  items: Message[];
  hasMore: boolean;
}

// The socket only nudges the query cache. The server is the source of truth,
// so when in doubt (reconnect, gap in seqs) we refetch rather than guess.
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const userId = user?.id;
  const qc = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<RealtimeState>({ socket: null, connected: false });
  const wasConnected = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const socket: AppSocket = io({ withCredentials: true, transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      setState({ socket, connected: true });
      // came back after a drop: anything could have happened, refetch
      if (wasConnected.current && !socket.recovered) {
        void qc.invalidateQueries({ queryKey: keys.conversations });
        void qc.invalidateQueries({ queryKey: ['messages'] });
        void qc.invalidateQueries({ queryKey: keys.notifications });
        void qc.invalidateQueries({ queryKey: ['bookings'] });
      }
      wasConnected.current = true;
    });
    socket.on('disconnect', () => setState({ socket, connected: false }));

    socket.on('message:new', (m) => {
      let gap: number | null = null;
      qc.setQueryData<InfiniteData<MessagePage>>(keys.messages(m.conversationId), (data) => {
        if (!data) return data;
        // newest page is pages[0] (we page backwards)
        const [newest, ...rest] = data.pages;
        const merged = mergeMessages(newest?.items ?? [], [m]);
        gap = merged.gapAfter;
        return { ...data, pages: [{ items: merged.messages, hasMore: newest?.hasMore ?? false }, ...rest] };
      });
      if (gap !== null) void qc.invalidateQueries({ queryKey: keys.messages(m.conversationId) });
      if (m.senderId !== userId) socket.emit('delivered', { conversationId: m.conversationId, seq: m.seq });
      void qc.invalidateQueries({ queryKey: keys.conversations });
    });

    socket.on('receipt', (r) => {
      if (r.userId === userId) return;
      const patch = (c: ConversationSummary) =>
        c.id === r.conversationId ? { ...c, otherDeliveredSeq: Math.max(c.otherDeliveredSeq, r.deliveredSeq), otherReadSeq: Math.max(c.otherReadSeq, r.readSeq) } : c;
      qc.setQueryData<{ items: ConversationSummary[] }>(keys.conversations, (d) => (d ? { ...d, items: d.items.map(patch) } : d));
      qc.setQueryData<ConversationSummary>(keys.conversation(r.conversationId), (c) => (c ? patch(c) : c));
    });

    socket.on('unread', (u) => qc.setQueryData(keys.unread, u));

    socket.on('notification', (n) => {
      void qc.invalidateQueries({ queryKey: keys.notifications });
      // chat has its own unread badge, don't toast every message
      if (n.type !== 'message.new') {
        const notif = n as AppNotification;
        toast({ text: describeNotification(notif), href: notif.payload.bookingId ? '/bookings' : undefined });
      }
    });

    socket.on('booking:updated', (b) => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: keys.booking(b.id) });
      void qc.invalidateQueries({ queryKey: keys.listing(b.listingId) });
    });

    setState({ socket, connected: false });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      wasConnected.current = false;
      setState({ socket: null, connected: false });
    };
  }, [userId, qc, toast]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
