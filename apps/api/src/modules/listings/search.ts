import { sql, type SQL } from 'drizzle-orm';
import type { ListingSearchResult, ListingSort } from '@coopswap/shared';
import { listingSearchQuery } from '@coopswap/shared';
import type { z } from 'zod';
import { db } from '../../db/pool.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { toSummary, type ImageRow } from './mappers.js';
import type { listings } from '../../db/schema.js';

type Query = z.output<typeof listingSearchQuery>;

interface SortSpec {
  // expression we order by, and the direction
  expr: SQL;
  dir: 'asc' | 'desc';
}

function sortSpec(sort: ListingSort, near?: [number, number]): SortSpec {
  switch (sort) {
    case 'price_asc':
      return { expr: sql`l.monthly_rent_cents`, dir: 'asc' };
    case 'price_desc':
      return { expr: sql`l.monthly_rent_cents`, dir: 'desc' };
    case 'soonest':
      return { expr: sql`l.available_from`, dir: 'asc' };
    case 'distance':
      return { expr: sql`(l.geo <-> point(${near![1]}, ${near![0]}))`, dir: 'asc' };
    case 'newest':
    default:
      return { expr: sql`l.published_at`, dir: 'desc' };
  }
}

function filters(q: Query): SQL[] {
  const where: SQL[] = [sql`l.status = 'active'`];

  if (q.city && q.state) {
    where.push(sql`l.city_key = ${`${q.city.toLowerCase()},${q.state.toLowerCase()}`}`);
  } else if (q.city) {
    where.push(sql`lower(l.city) = ${q.city.toLowerCase()}`);
  } else if (q.state) {
    where.push(sql`l.state = ${q.state}`);
  }

  if (q.bbox) {
    const [minLng, minLat, maxLng, maxLat] = q.bbox;
    where.push(sql`l.geo <@ box(point(${minLng}, ${minLat}), point(${maxLng}, ${maxLat}))`);
  }

  if (q.start && q.end) {
    where.push(sql`l.available_from <= ${q.start}::date and l.available_to >= ${q.end}::date`);
    where.push(sql`(${q.end}::date - ${q.start}::date) >= l.min_stay_days`);
    where.push(availabilityFilter(q.start, q.end));
  }

  if (q.minPrice !== undefined) where.push(sql`l.monthly_rent_cents >= ${q.minPrice * 100}`);
  if (q.maxPrice !== undefined) where.push(sql`l.monthly_rent_cents <= ${q.maxPrice * 100}`);
  // sql.param so the array goes over as one pg array, not a list of params
  if (q.roomTypes?.length) where.push(sql`l.room_type = any(${sql.param(q.roomTypes)}::room_type[])`);
  if (q.furnishing?.length) where.push(sql`l.furnishing = any(${sql.param(q.furnishing)}::furnishing[])`);
  if (q.amenities?.length) where.push(sql`l.amenities @> ${sql.param(q.amenities)}::text[]`);
  if (q.occupants) where.push(sql`l.max_occupants >= ${q.occupants}`);
  if (q.q) where.push(sql`l.search_doc @@ websearch_to_tsquery('english', ${q.q})`);

  return where;
}

// overridden once bookings exist (see bookings module)
let availabilityFilter = (_start: string, _end: string): SQL => sql`true`;
export function setAvailabilityFilter(fn: typeof availabilityFilter) {
  availabilityFilter = fn;
}

export async function searchListings(rawQuery: unknown, viewerId?: string): Promise<ListingSearchResult> {
  const q = listingSearchQuery.parse(rawQuery);
  const spec = sortSpec(q.sort, q.near);
  const where = filters(q);

  if (q.cursor) {
    const c = decodeCursor(q.cursor, q.sort);
    const op = spec.dir === 'asc' ? sql`>` : sql`<`;
    // the sort value travels as text so timestamps keep their microseconds
    const cast = { newest: sql`timestamptz`, soonest: sql`date`, price_asc: sql`int`, price_desc: sql`int`, distance: sql`float8` }[q.sort];
    const v = sql`${String(c.v)}::${cast}`;
    where.push(sql`(${spec.expr}, l.id) ${op} (${v}, ${c.id}::uuid)`);
  }

  const whereSql = sql.join(where, sql` and `);
  const dir = spec.dir === 'asc' ? sql`asc` : sql`desc`;

  const rows = await db.execute<
    typeof listings.$inferSelect & { sort_value: string; cover: ImageRow | null; saved: boolean }
  >(sql`
    select
      l.id, l.owner_id as "ownerId", l.status, l.title, l.description,
      l.neighborhood, l.city, l.state, l.postal_code as "postalCode",
      l.approx_lat as "approxLat", l.approx_lng as "approxLng",
      l.available_from::text as "availableFrom", l.available_to::text as "availableTo",
      l.min_stay_days as "minStayDays", l.monthly_rent_cents as "monthlyRentCents",
      l.utilities_included as "utilitiesIncluded", l.room_type as "roomType",
      l.furnishing, l.max_occupants as "maxOccupants", l.amenities,
      l.published_at as "publishedAt",
      (${spec.expr})::text as sort_value,
      (select json_build_object('id', i.id, 'storageKey', i.storage_key, 'width', i.width, 'height', i.height, 'position', i.position)
         from listing_images i where i.listing_id = l.id order by i.position limit 1) as cover,
      ${viewerId ? sql`exists(select 1 from saved_listings s where s.listing_id = l.id and s.user_id = ${viewerId})` : sql`false`} as saved
    from listings l
    where ${whereSql}
    order by ${spec.expr} ${dir}, l.id ${dir}
    limit ${q.limit + 1}
  `);

  const page = rows.rows.slice(0, q.limit);
  const hasMore = rows.rows.length > q.limit;
  const last = page.at(-1);

  let total: number | null = null;
  if (!q.cursor) {
    // count without the cursor clause, only on the first page
    const countRes = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from listings l where ${sql.join(filters(q), sql` and `)}`,
    );
    total = countRes.rows[0]?.n ?? 0;
  }

  const items = await Promise.all(
    page.map((r) =>
      toSummary(
        { ...r, publishedAt: r.publishedAt ? new Date(r.publishedAt) : null } as typeof listings.$inferSelect,
        r.cover,
        viewerId ? r.saved : undefined,
      ),
    ),
  );

  return {
    items,
    total,
    nextCursor:
      hasMore && last
        ? encodeCursor({
            s: q.sort,
            v: last.sort_value,
            id: last.id,
          })
        : null,
  };
}
