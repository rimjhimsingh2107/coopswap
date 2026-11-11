import { z } from 'zod';

export const ANALYTICS_EVENTS = ['search', 'listing_view', 'booking_request', 'message_start'] as const;

export const analyticsEventInput = z.object({
  name: z.enum(ANALYTICS_EVENTS),
  sid: z.string().min(8).max(64),
  props: z.record(z.string(), z.union([z.string().max(100), z.number(), z.boolean(), z.null()])).default({}),
});

export interface AnalyticsSummary {
  days: number;
  // these are counts of events from browsers, not distinct people
  totals: { searches: number; listingViews: number; bookingRequests: number; messageStarts: number };
  searchToRequest: { sessionsWithSearch: number; sessionsWithRequest: number; rate: number };
  // from the bookings table, which is authoritative
  bookingOutcomes: { requested: number; approved: number; rejected: number; canceled: number; expired: number; approvalRate: number };
  daily: Array<{ day: string; searches: number; listingViews: number; bookingRequests: number }>;
  topListings: Array<{ id: string; title: string; views: number; requests: number }>;
  topCities: Array<{ city: string; searches: number }>;
}
