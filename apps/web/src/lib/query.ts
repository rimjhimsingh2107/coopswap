import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        // 4xx won't get better by retrying
        if (err instanceof ApiRequestError && err.status < 500) return false;
        return count < 2;
      },
    },
  },
});

export const keys = {
  session: ['session'] as const,
  me: ['me'] as const,
  listings: (q: object) => ['listings', q] as const,
  listing: (id: string) => ['listing', id] as const,
  featured: ['listings', 'featured'] as const,
  myListings: ['me', 'listings'] as const,
  saved: ['me', 'saved'] as const,
  bookings: (role: string) => ['bookings', role] as const,
  booking: (id: string) => ['booking', id] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (id: string) => ['messages', id] as const,
  unread: ['unread'] as const,
  notifications: ['notifications'] as const,
  user: (id: string) => ['user', id] as const,
};
