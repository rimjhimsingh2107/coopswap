// Demo data for local dev / screenshots. Everything here is made up.
//   pnpm db:seed            (refuses to run against production)
import argon2 from 'argon2';
import sharp from 'sharp';
import { addDays, AMENITIES, todayIn } from '@coopswap/shared';
import { env, isProd } from '../config/env.js';
import { pool } from './pool.js';
import { approximateLocation } from '../lib/geo.js';
import { storage } from '../lib/storage.js';

if (isProd) throw new Error('not seeding a production database');

const PASSWORD = process.env.SEED_PASSWORD ?? 'coopswap-demo-password';

const CITIES = [
  { city: 'Boston', state: 'MA', lat: 42.3398, lng: -71.0892, hoods: ['Mission Hill', 'Fenway', 'Back Bay', 'Jamaica Plain', 'South End', 'Roxbury'] },
  { city: 'Cambridge', state: 'MA', lat: 42.3736, lng: -71.1097, hoods: ['Central Square', 'Inman', 'Porter'] },
  { city: 'New York', state: 'NY', lat: 40.7306, lng: -73.9866, hoods: ['East Village', 'Astoria', 'Williamsburg', 'Upper West Side'] },
  { city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194, hoods: ['Mission', 'SoMa', 'Inner Sunset'] },
  { city: 'Seattle', state: 'WA', lat: 47.6205, lng: -122.3493, hoods: ['Capitol Hill', 'South Lake Union', 'Fremont'] },
  { city: 'Chicago', state: 'IL', lat: 41.8858, lng: -87.6229, hoods: ['Logan Square', 'West Loop', 'Lincoln Park'] },
  { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431, hoods: ['East Austin', 'Hyde Park'] },
];

const NAMES = ['Priya', 'Marcus', 'Jen', 'Diego', 'Aisha', 'Tom', 'Mei', 'Sam', 'Olivia', 'Kwame', 'Lena', 'Ravi', 'Grace', 'Noah', 'Fatima', 'Ben'];
const TITLES = [
  'Sunny private room, 5 min to the T',
  'Furnished room in a quiet 3 bed',
  'Whole studio while I’m on co-op',
  'Big room with bay windows',
  'Room in a friendly student apartment',
  'Cozy room near campus, utilities in',
  'Top floor room with a desk setup',
  'Shared room, super cheap, great roommates',
];
const BLURBS = [
  "I'm heading out for a spring co-op and need someone to take my room. Two roommates, both students, both pretty chill. Kitchen is shared and actually clean.",
  'Furnished with a bed, desk, chair and dresser. Laundry in the basement. Landlord is fine with subletting, I asked. Close to groceries and the bus.',
  "Whole place to yourself. It's small but bright, and the commute downtown is about 20 minutes. Happy to leave pots, pans and a monitor.",
  'Looking for someone tidy and respectful. We have a cat (very friendly). Wifi is fast. Quiet street, lots of cafes nearby.',
];

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;

async function placeholderPhoto(hue: number) {
  // soft gradient "photo" so the ui has something to show without shipping images
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},45%,82%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},40%,62%)"/>
    </linearGradient></defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <rect x="120" y="420" width="420" height="300" rx="16" fill="hsla(${hue},30%,96%,.55)"/>
    <rect x="640" y="200" width="380" height="260" rx="12" fill="hsla(${hue},30%,98%,.65)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 70 }).toBuffer({ resolveWithObject: true });
}

async function main() {
  const client = await pool.connect();
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  try {
    await client.query('begin');
    const { rows: existing } = await client.query(`select count(*)::int as n from users where email like '%@demo.coopswap.dev'`);
    if (existing[0].n > 0) {
      console.log('demo data already there, skipping');
      await client.query('rollback');
      return;
    }

    const userIds: string[] = [];
    for (const [i, name] of NAMES.entries()) {
      const email = i === 0 ? 'admin@demo.coopswap.dev' : `${name.toLowerCase()}@demo.coopswap.dev`;
      const { rows } = await client.query(
        `insert into users (email, password_hash, role, email_verified_at) values ($1, $2, $3, now()) returning id`,
        [email, hash, i === 0 ? 'admin' : 'student'],
      );
      const id = rows[0].id as string;
      userIds.push(id);
      await client.query(`insert into profiles (user_id, display_name, bio, school) values ($1, $2, $3, $4)`, [
        id,
        name,
        `${pick(['CS', 'Business', 'Bioengineering', 'Design', 'Economics'])} student, on co-op ${pick(['this spring', 'this fall', 'in the summer'])}.`,
        'Northeastern University',
      ]);
      await client.query(`insert into user_settings (user_id) values ($1)`, [id]);
      if (i % 3 !== 2) {
        await client.query(`insert into university_verifications (user_id, email, domain) values ($1, $2, 'northeastern.edu')`, [
          id,
          `${name.toLowerCase()}.demo@northeastern.edu`,
        ]);
      }
    }

    const today = todayIn();
    let listings = 0;
    for (let i = 0; i < 48; i++) {
      const c = i < 18 ? CITIES[0]! : pick(CITIES);
      const owner = userIds[1 + (i % (userIds.length - 1))]!;
      const lat = c.lat + (rand() - 0.5) * 0.06;
      const lng = c.lng + (rand() - 0.5) * 0.08;
      const from = addDays(today, Math.floor(rand() * 90));
      const to = addDays(from, 90 + Math.floor(rand() * 150));
      const roomType = pick(['private_room', 'private_room', 'shared_room', 'studio', 'entire_place'] as const);
      const id = crypto.randomUUID();
      const approx = approximateLocation(id, lat, lng);
      const amenities = AMENITIES.filter(() => rand() < 0.35);
      await client.query(
        `insert into listings (id, owner_id, status, title, description, address_line1, lat, lng, neighborhood, city, state,
           approx_lat, approx_lng, available_from, available_to, min_stay_days, monthly_rent_cents, utilities_included,
           furnishing, room_type, max_occupants, amenities, published_at)
         values ($1,$2,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now() - ($22 || ' hours')::interval)`,
        [
          id, owner, pick(TITLES), pick(BLURBS), `${100 + Math.floor(rand() * 900)} Demo St`, lat, lng, pick(c.hoods), c.city, c.state,
          approx.approxLat, approx.approxLng, from, to, pick([30, 30, 60, 90]),
          Math.round((roomType === 'shared_room' ? 700 : roomType === 'entire_place' ? 2400 : 1100 + rand() * 900) / 10) * 1000,
          rand() < 0.4, pick(['furnished', 'furnished', 'partially_furnished', 'unfurnished']), roomType,
          roomType === 'entire_place' ? 3 : roomType === 'shared_room' ? 2 : 1, amenities, String(i * 5),
        ],
      );
      const photos = 2 + Math.floor(rand() * 3);
      for (let p = 0; p < photos; p++) {
        const img = await placeholderPhoto(Math.floor(rand() * 360));
        const key = `listings/${id}/${crypto.randomUUID()}.webp`;
        await storage.put(key, img.data, 'image/webp');
        await client.query(
          `insert into listing_images (listing_id, storage_key, position, width, height, bytes) values ($1,$2,$3,$4,$5,$6)`,
          [id, key, p, img.info.width, img.info.height, img.info.size],
        );
      }
      listings++;
    }
    await client.query('commit');
    console.log(`seeded ${userIds.length} users and ${listings} listings (password: ${PASSWORD}, admin: admin@demo.coopswap.dev)`);
    console.log(`storage: ${env.STORAGE_DRIVER}`);
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
