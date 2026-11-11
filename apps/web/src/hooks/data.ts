import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppNotification,
  Booking,
  ConversationSummary,
  CreateBookingInput,
  CreateListingInput,
  ListingDetail,
  ListingImage,
  ListingSearchQuery,
  ListingSearchResult,
  ListingSummary,
  Message,
  MyProfile,
  PublicProfile,
  UpdateListingInput,
  UpdateProfileInput,
  UpdateSettingsInput,
} from '@coopswap/shared';
import { api, qs } from '@/lib/api';
import { keys } from '@/lib/query';
import type { MessagePage } from './realtime';

// --- listings ---------------------------------------------------------------

export function useListingSearch(q: ListingSearchQuery) {
  return useInfiniteQuery({
    queryKey: keys.listings(q),
    queryFn: ({ pageParam }) =>
      api<ListingSearchResult>(`/listings${qs({ ...(q as Record<string, string>), cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // keep showing the old results while new filters load, avoids flashing
    placeholderData: (prev) => prev,
  });
}

export const useFeatured = () => useQuery({ queryKey: keys.featured, queryFn: () => api<ListingSummary[]>('/listings/featured') });
export const useListing = (id: string) => useQuery({ queryKey: keys.listing(id), queryFn: () => api<ListingDetail>(`/listings/${id}`) });
export const useMyListings = () => useQuery({ queryKey: keys.myListings, queryFn: () => api<ListingSummary[]>('/me/listings') });
export const useSaved = (enabled = true) => useQuery({ queryKey: keys.saved, queryFn: () => api<ListingSummary[]>('/me/saved'), enabled });

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateListingInput) => api<ListingDetail>('/listings', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.myListings }),
  });
}

export function useUpdateListing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateListingInput) => api<ListingDetail>(`/listings/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (l) => {
      qc.setQueryData(keys.listing(id), l);
      void qc.invalidateQueries({ queryKey: ['listings'] });
      void qc.invalidateQueries({ queryKey: keys.myListings });
    },
  });
}

export function useListingStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'publish' | 'archive') => api<ListingDetail>(`/listings/${id}/${action}`, { method: 'POST' }),
    onSuccess: (l) => {
      qc.setQueryData(keys.listing(id), l);
      void qc.invalidateQueries({ queryKey: keys.myListings });
      void qc.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

export function useUploadImages(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => {
      const fd = new FormData();
      for (const f of files) fd.append('images', f);
      return api<ListingImage[]>(`/listings/${listingId}/images`, { method: 'POST', body: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.listing(listingId) }),
  });
}

export function useDeleteImage(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => api<ListingImage[]>(`/listings/${listingId}/images/${imageId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.listing(listingId) }),
  });
}

export function useReorderImages(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api<ListingImage[]>(`/listings/${listingId}/images/order`, { method: 'PUT', body: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.listing(listingId) }),
  });
}

// saving is a safe place for optimistic updates: worst case we flip the heart back
export function useToggleSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) =>
      api(`/me/saved/${id}`, { method: saved ? 'PUT' : 'DELETE' }),
    onMutate: async ({ id, saved }) => {
      await qc.cancelQueries({ queryKey: keys.listing(id) });
      const prev = qc.getQueryData<ListingDetail>(keys.listing(id));
      if (prev) qc.setQueryData(keys.listing(id), { ...prev, saved });
      return { prev };
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.listing(id), ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.saved });
      void qc.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

// --- bookings ---------------------------------------------------------------

export const useBookings = (role: 'guest' | 'owner') =>
  useQuery({ queryKey: keys.bookings(role), queryFn: () => api<Booking[]>(`/bookings?role=${role}`) });

// Not optimistic: whether the dates are free is the server's call.
export function useRequestBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, key }: { input: CreateBookingInput; key: string }) =>
      api<Booking>('/bookings', { method: 'POST', body: input, idempotencyKey: key }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useBookingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, reason, key }: { id: string; action: 'approve' | 'reject' | 'cancel'; reason?: string; key: string }) =>
      api<Booking>(`/bookings/${id}/${action}`, { method: 'POST', body: { reason }, idempotencyKey: key }),
    onSettled: (b) => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      if (b) void qc.invalidateQueries({ queryKey: keys.listing(b.listingId) });
    },
  });
}

// --- messaging --------------------------------------------------------------

export const useConversations = () =>
  useQuery({ queryKey: keys.conversations, queryFn: () => api<{ items: ConversationSummary[]; nextCursor: string | null }>('/conversations') });

export const useConversation = (id: string) =>
  useQuery({ queryKey: keys.conversation(id), queryFn: () => api<ConversationSummary>(`/conversations/${id}`) });

export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: keys.messages(conversationId),
    queryFn: ({ pageParam }) => api<MessagePage>(`/conversations/${conversationId}/messages${qs({ before: pageParam, limit: 40 })}`),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.items[0]?.seq : undefined),
    staleTime: Infinity, // kept fresh by the socket
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { listingId: string; body?: string }) => api<ConversationSummary>('/conversations', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.conversations }),
  });
}

export function useSendMessage(conversationId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: { body: string; clientId: string }) =>
      api<Message>(`/conversations/${conversationId}/messages`, { method: 'POST', body: m }),
    // show it right away with a pending marker; the real one (same clientId) replaces it
    onMutate: ({ body, clientId }) => {
      qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(keys.messages(conversationId), (d) => {
        if (!d) return d;
        const [newest, ...rest] = d.pages;
        const temp: Message & { pending: true } = {
          id: `pending-${clientId}`,
          clientId,
          conversationId,
          seq: Number.MAX_SAFE_INTEGER,
          senderId: userId,
          body,
          createdAt: new Date().toISOString(),
          pending: true,
        };
        return { ...d, pages: [{ items: [...(newest?.items ?? []), temp], hasMore: newest?.hasMore ?? false }, ...rest] };
      });
    },
    onSuccess: (msg) => {
      qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(keys.messages(conversationId), (d) => {
        if (!d) return d;
        const [newest, ...rest] = d.pages;
        const items = (newest?.items ?? []).filter((m) => m.clientId !== msg.clientId && m.id !== msg.id);
        items.push(msg);
        items.sort((a, b) => a.seq - b.seq);
        return { ...d, pages: [{ items, hasMore: newest?.hasMore ?? false }, ...rest] };
      });
      void qc.invalidateQueries({ queryKey: keys.conversations });
    },
    onError: (_e, { clientId }) => {
      // mark it failed so the user can retry with the same clientId
      qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(keys.messages(conversationId), (d) => {
        if (!d) return d;
        const [newest, ...rest] = d.pages;
        const items = (newest?.items ?? []).map((m) => (m.clientId === clientId ? { ...m, failed: true } : m));
        return { ...d, pages: [{ items, hasMore: newest?.hasMore ?? false }, ...rest] };
      });
    },
  });
}

export function useMarkRead(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seq: number) => api(`/conversations/${conversationId}/read`, { method: 'POST', body: { seq } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.conversations });
      void qc.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}

export const useUnread = (enabled: boolean) =>
  useQuery({ queryKey: keys.unread, queryFn: () => api<{ messages: number; notifications: number }>('/conversations/unread'), enabled, staleTime: 60_000 });

// --- notifications ----------------------------------------------------------

export const useNotifications = () =>
  useQuery({ queryKey: keys.notifications, queryFn: () => api<{ items: AppNotification[]; nextCursor: string | null }>('/notifications') });

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.unread });
    },
  });
}

// --- profile ----------------------------------------------------------------

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<MyProfile>('/me') });
export const usePublicProfile = (id: string) => useQuery({ queryKey: keys.user(id), queryFn: () => api<PublicProfile>(`/users/${id}`) });

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api<MyProfile>('/me/profile', { method: 'PATCH', body: input }),
    onSuccess: (me) => {
      qc.setQueryData(keys.me, me);
      void qc.invalidateQueries({ queryKey: keys.session });
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) => api<MyProfile>('/me/settings', { method: 'PATCH', body: input }),
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  });
}
