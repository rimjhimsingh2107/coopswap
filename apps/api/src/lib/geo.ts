import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';

// Public map pins are not the real address. We snap to a ~400m grid and then
// nudge by a fixed per-listing offset so pins in the same cell don't stack.
// The offset is derived from the listing id (not random per request) so you
// can't average lots of responses to recover the true point.

const GRID_DEG = 0.004;
const MAX_NUDGE_DEG = 0.0012;

export function approximateLocation(listingId: string, lat: number, lng: number) {
  const h = createHmac('sha256', env.SESSION_SECRET).update(`loc:${listingId}`).digest();
  const nudge = (byte: number) => ((byte / 255) * 2 - 1) * MAX_NUDGE_DEG;
  const snap = (v: number) => Math.round(v / GRID_DEG) * GRID_DEG;
  return {
    approxLat: round6(snap(lat) + nudge(h[0]!)),
    approxLng: round6(snap(lng) + nudge(h[1]!)),
  };
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
