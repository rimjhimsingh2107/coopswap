import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';

// Address/city autocomplete via Photon (komoot's OSM geocoder). Free, no key,
// fair-use limits, so we cache hard and rate limit per user. The query text is
// sent to a third party; we don't attach anything that identifies the user.

const PHOTON_URL = process.env.GEOCODER_URL ?? 'https://photon.komoot.io/api/';
const CACHE_TTL = 60 * 60 * 24;

export interface GeoResult {
  label: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
  kind: 'address' | 'city';
}

const US_STATES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT',
  Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE',
  Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA',
  Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};

const photonFeature = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    countrycode: z.string().optional(),
    name: z.string().optional(),
    housenumber: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postcode: z.string().optional(),
    type: z.string().optional(),
  }),
});

export function toResult(f: z.infer<typeof photonFeature>, kind: 'address' | 'city'): GeoResult | null {
  const p = f.properties;
  if (p.countrycode !== 'US') return null;
  const state = p.state ? (US_STATES[p.state] ?? null) : null;
  const city = kind === 'city' ? (p.name ?? null) : (p.city ?? null);
  const street = p.street ? `${p.housenumber ? `${p.housenumber} ` : ''}${p.street}` : null;
  const zip = p.postcode && /^\d{5}/.test(p.postcode) ? p.postcode.slice(0, 5) : null;
  const label = kind === 'city' ? [city, state].filter(Boolean).join(', ') : [street ?? p.name, city, state].filter(Boolean).join(', ');
  return { label, street, city, state, postalCode: zip, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], kind };
}

export async function geocode(q: string, kind: 'address' | 'city'): Promise<GeoResult[]> {
  const norm = q.trim().toLowerCase().replace(/\s+/g, ' ');
  const cacheKey = `geo:${kind}:${norm}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const url = new URL(PHOTON_URL);
  url.searchParams.set('q', norm);
  url.searchParams.set('limit', '8');
  url.searchParams.set('lang', 'en');
  // rough continental US box, keeps results from other countries out
  url.searchParams.set('bbox', '-125,24,-66,50');
  if (kind === 'city') {
    url.searchParams.append('osm_tag', 'place:city');
    url.searchParams.append('osm_tag', 'place:town');
  }

  let body: unknown;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'CoopSwap/0.1 (student housing demo)' }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`geocoder ${res.status}`);
    body = await res.json();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'geocoder request failed');
    return [];
  }
  const parsed = z.object({ features: z.array(photonFeature) }).safeParse(body);
  const results = parsed.success
    ? parsed.data.features.map((f) => toResult(f, kind)).filter((r): r is GeoResult => r !== null)
    : [];
  await redis.set(cacheKey, JSON.stringify(results), 'EX', CACHE_TTL).catch(() => {});
  return results;
}
