import type { Amenity, ListingImage, ListingSummary } from '@coopswap/shared';
import type { listings } from '../../db/schema.js';
import { storage } from '../../lib/storage.js';

type ListingRow = typeof listings.$inferSelect;

export interface ImageRow {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  position: number;
}

export async function toImage(row: ImageRow): Promise<ListingImage> {
  return {
    id: row.id,
    url: await storage.signedUrl(row.storageKey),
    width: row.width,
    height: row.height,
    position: row.position,
  };
}

export async function toSummary(row: ListingRow, cover: ImageRow | null, saved?: boolean): Promise<ListingSummary> {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    approxLat: row.approxLat,
    approxLng: row.approxLng,
    availableFrom: row.availableFrom,
    availableTo: row.availableTo,
    minStayDays: row.minStayDays,
    monthlyRentCents: row.monthlyRentCents,
    utilitiesIncluded: row.utilitiesIncluded,
    roomType: row.roomType,
    furnishing: row.furnishing,
    maxOccupants: row.maxOccupants,
    amenities: row.amenities as Amenity[],
    coverImage: cover ? await toImage(cover) : null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    saved,
  };
}
