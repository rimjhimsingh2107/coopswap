import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { AnalyticsSummary } from '@coopswap/shared';
import { analyticsEventInput } from '@coopswap/shared';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import { db } from '../../db/pool.js';
import { metrics } from '../../lib/metrics.js';

type EventInput = z.output<typeof analyticsEventInput>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// only these props are kept, anything else the client sends is dropped
const KEEP = new Set(['hasDates', 'results', 'nights']);

export function sessionHash(sid: string, day = new Date().toISOString().slice(0, 10)) {
  return createHash('sha256').update(`${env.SESSION_SECRET}:${day}:${sid}`).digest();
}

export async function recordEvent(e: EventInput) {
  const listingId = typeof e.props.listingId === 'string' && UUID.test(e.props.listingId) ? e.props.listingId : null;
  const city = typeof e.props.city === 'string' ? e.props.city.slice(0, 80) : null;
  const props = Object.fromEntries(Object.entries(e.props).filter(([k]) => KEEP.has(k)));
  await db.execute(sql`
    insert into analytics_events (name, session_hash, listing_id, city, props)
    select ${e.name}, ${sessionHash(e.sid)}, l.id, ${city}, ${JSON.stringify(props)}::jsonb
    from (select ${listingId}::uuid as id) l
  `);
  metrics.analyticsEvents.inc({ name: e.name });
}

export async function summary(days: number): Promise<AnalyticsSummary> {
  const since = sql`now() - make_interval(days => ${days})`;
  const [totals, funnel, outcomes, daily, top, cities] = await Promise.all([
    db.execute<{ name: string; n: number }>(sql`select name, count(*)::int as n from analytics_events where occurred_at >= ${since} group by name`),
    db.execute<{ searched: number; requested: number }>(sql`
      select count(*) filter (where s)::int as searched, count(*) filter (where s and r)::int as requested
      from (
        select session_hash, bool_or(name = 'search') as s, bool_or(name = 'booking_request') as r
        from analytics_events where occurred_at >= ${since} group by session_hash
      ) x`),
    db.execute<{ status: string; n: number }>(sql`
      select status::text, count(*)::int as n from bookings where created_at >= ${since} group by status`),
    db.execute<{ day: string; searches: number; views: number; requests: number }>(sql`
      select to_char(d, 'YYYY-MM-DD') as day,
        count(e.*) filter (where e.name = 'search')::int as searches,
        count(e.*) filter (where e.name = 'listing_view')::int as views,
        count(e.*) filter (where e.name = 'booking_request')::int as requests
      from generate_series(date_trunc('day', ${since}), date_trunc('day', now()), interval '1 day') d
      left join analytics_events e on date_trunc('day', e.occurred_at) = d
      group by d order by d`),
    db.execute<{ id: string; title: string; views: number; requests: number }>(sql`
      select l.id, l.title,
        count(*) filter (where e.name = 'listing_view')::int as views,
        count(*) filter (where e.name = 'booking_request')::int as requests
      from analytics_events e join listings l on l.id = e.listing_id
      where e.occurred_at >= ${since}
      group by l.id, l.title order by views desc limit 10`),
    db.execute<{ city: string; searches: number }>(sql`
      select city, count(*)::int as searches from analytics_events
      where name = 'search' and city is not null and occurred_at >= ${since}
      group by city order by searches desc limit 10`),
  ]);

  const t = Object.fromEntries(totals.rows.map((r) => [r.name, r.n]));
  const o = Object.fromEntries(outcomes.rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const requested = Object.values(o).reduce((a, b) => a + b, 0);
  const f = funnel.rows[0] ?? { searched: 0, requested: 0 };
  return {
    days,
    totals: { searches: t.search ?? 0, listingViews: t.listing_view ?? 0, bookingRequests: t.booking_request ?? 0, messageStarts: t.message_start ?? 0 },
    searchToRequest: { sessionsWithSearch: f.searched, sessionsWithRequest: f.requested, rate: f.searched ? f.requested / f.searched : 0 },
    bookingOutcomes: {
      requested,
      approved: o.approved ?? 0,
      rejected: o.rejected ?? 0,
      canceled: o.canceled ?? 0,
      expired: o.expired ?? 0,
      approvalRate: requested ? (o.approved ?? 0) / requested : 0,
    },
    daily: daily.rows.map((d) => ({ day: d.day, searches: d.searches, listingViews: d.views, bookingRequests: d.requests })),
    topListings: top.rows,
    topCities: cities.rows,
  };
}
