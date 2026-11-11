import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';

// Tables are tiny in tests so the planner would happily seq scan everything.
// Turning seq scans off asks a narrower question: *can* an index serve this
// query shape? If someone drops or changes an index, these start failing.
async function plan(sql: string, params: unknown[] = []) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local enable_seqscan = off');
    const { rows } = await client.query(`explain (format json) ${sql}`, params);
    await client.query('rollback');
    return JSON.stringify(rows[0]['QUERY PLAN']);
  } finally {
    client.release();
  }
}

describe('indexes back the common queries', () => {
  it('city search sorted by price', async () => {
    const p = await plan(`select id from listings where status = 'active' and city_key = 'boston,ma' order by monthly_rent_cents, id limit 25`);
    expect(p).toContain('listings_city_price_idx');
  });

  it('city search, newest first', async () => {
    const p = await plan(`select id from listings where status = 'active' and city_key = 'boston,ma' order by published_at desc, id desc limit 25`);
    expect(p).toContain('listings_city_published_idx');
  });

  it('map viewport', async () => {
    const p = await plan(`select id from listings where status = 'active' and geo <@ box(point(-71.2, 42.2), point(-71.0, 42.4))`);
    expect(p).toContain('listings_geo_idx');
  });

  it('nearest first', async () => {
    const p = await plan(`select id from listings where status = 'active' order by geo <-> point(-71.09, 42.34) limit 25`);
    expect(p).toContain('listings_geo_idx');
  });

  it('amenities filter', async () => {
    const p = await plan(`select id from listings where status = 'active' and amenities @> array['wifi']`);
    expect(p).toContain('listings_amenities_idx');
  });

  it('availability check uses the exclusion constraint index', async () => {
    const p = await plan(
      `select 1 from bookings b where b.listing_id = gen_random_uuid() and b.status = 'approved' and b.stay && daterange('2027-01-01', '2027-03-01', '[)')`,
    );
    expect(p).toContain('bookings_no_overlapping_approved');
  });

  it('unread counts and conversation list', async () => {
    expect(await plan(`select * from conversation_participants where user_id = gen_random_uuid()`)).toContain('conversation_participants_user_idx');
    expect(await plan(`select * from messages where conversation_id = gen_random_uuid() and seq > 10 order by seq limit 50`)).toContain(
      'messages_conversation_seq_key',
    );
  });

  it('outbox relay claim', async () => {
    const p = await plan(`select id from outbox_events where published_at is null and available_at <= now() order by available_at, id limit 50`);
    expect(p).toContain('outbox_pending_idx');
  });
});
