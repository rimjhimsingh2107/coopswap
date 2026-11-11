import { z } from 'zod';
import { daysBetween, isValidDate } from './dates.js';
import type { PublicProfile } from './profile.js';

export const AMENITIES = [
  'wifi',
  'in_unit_laundry',
  'building_laundry',
  'dishwasher',
  'air_conditioning',
  'heating_included',
  'parking',
  'bike_storage',
  'gym',
  'elevator',
  'pets_allowed',
  'near_transit',
  'private_bathroom',
  'kitchen_access',
  'workspace',
  'outdoor_space',
] as const;
export type Amenity = (typeof AMENITIES)[number];

export const AMENITY_LABELS: Record<Amenity, string> = {
  wifi: 'Wi-Fi',
  in_unit_laundry: 'In-unit laundry',
  building_laundry: 'Laundry in building',
  dishwasher: 'Dishwasher',
  air_conditioning: 'A/C',
  heating_included: 'Heat included',
  parking: 'Parking',
  bike_storage: 'Bike storage',
  gym: 'Gym',
  elevator: 'Elevator',
  pets_allowed: 'Pets allowed',
  near_transit: 'Near transit',
  private_bathroom: 'Private bathroom',
  kitchen_access: 'Kitchen access',
  workspace: 'Desk / workspace',
  outdoor_space: 'Outdoor space',
};

export const ROOM_TYPES = ['private_room', 'shared_room', 'studio', 'entire_place'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];
export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  private_room: 'Private room',
  shared_room: 'Shared room',
  studio: 'Studio',
  entire_place: 'Entire place',
};

export const FURNISHINGS = ['furnished', 'partially_furnished', 'unfurnished'] as const;
export type Furnishing = (typeof FURNISHINGS)[number];

export const LISTING_STATUSES = ['draft', 'active', 'archived'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const dateString = z.string().refine(isValidDate, 'expected a date like 2026-05-01');

const listingFields = {
  title: z.string().trim().min(5, 'at least 5 characters').max(120),
  description: z.string().trim().min(20, 'tell people a bit more (20+ characters)').max(5000),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(100).nullish(),
  neighborhood: z.string().trim().max(80).nullish(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'two letter state code'),
  postalCode: z.string().trim().regex(/^\d{5}$/, '5 digit zip').nullish(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  availableFrom: dateString,
  availableTo: dateString,
  minStayDays: z.number().int().min(1).max(365).default(30),
  monthlyRentCents: z.number().int().min(10_000, 'rent seems too low').max(2_000_000),
  utilitiesIncluded: z.boolean().default(false),
  utilitiesEstCents: z.number().int().min(0).max(200_000).nullish(),
  utilitiesNotes: z.string().trim().max(300).nullish(),
  furnishing: z.enum(FURNISHINGS),
  roomType: z.enum(ROOM_TYPES),
  maxOccupants: z.number().int().min(1).max(10),
  amenities: z.array(z.enum(AMENITIES)).max(AMENITIES.length).default([]),
};

const windowRules = <T extends { availableFrom?: string; availableTo?: string; minStayDays?: number }>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  if (!v.availableFrom || !v.availableTo) return;
  if (v.availableTo <= v.availableFrom) {
    ctx.addIssue({ code: 'custom', path: ['availableTo'], message: 'must be after the start date' });
    return;
  }
  const len = daysBetween(v.availableFrom, v.availableTo);
  if (len > 730) {
    ctx.addIssue({ code: 'custom', path: ['availableTo'], message: 'max two years' });
  }
  if (v.minStayDays && v.minStayDays > len) {
    ctx.addIssue({ code: 'custom', path: ['minStayDays'], message: 'longer than the whole window' });
  }
};

export const createListingInput = z.object(listingFields).superRefine(windowRules);
export type CreateListingInput = z.input<typeof createListingInput>;

export const updateListingInput = z
  .object(listingFields)
  .partial()
  .extend({ version: z.number().int().positive() })
  .superRefine(windowRules);
export type UpdateListingInput = z.input<typeof updateListingInput>;

const csv = <T extends z.ZodType<string, string>>(item: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(item));

export const LISTING_SORTS = ['newest', 'price_asc', 'price_desc', 'soonest', 'distance'] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export const listingSearchQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().toUpperCase().length(2).optional(),
    // minLng,minLat,maxLng,maxLat
    bbox: z
      .string()
      .transform((s) => s.split(',').map(Number))
      .pipe(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]))
      .optional(),
    near: z
      .string()
      .transform((s) => s.split(',').map(Number))
      .pipe(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
      .optional(),
    start: dateString.optional(),
    end: dateString.optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    roomTypes: csv(z.enum(ROOM_TYPES)).optional(),
    furnishing: csv(z.enum(FURNISHINGS)).optional(),
    amenities: csv(z.enum(AMENITIES)).optional(),
    occupants: z.coerce.number().int().min(1).max(10).optional(),
    sort: z.enum(LISTING_SORTS).default('newest'),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(24),
  })
  .superRefine((v, ctx) => {
    if ((v.start && !v.end) || (!v.start && v.end)) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'start and end go together' });
    }
    if (v.start && v.end && v.end <= v.start) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'end must be after start' });
    }
    if (v.sort === 'distance' && !v.near) {
      ctx.addIssue({ code: 'custom', path: ['sort'], message: 'distance sort needs near=lat,lng' });
    }
  });
export type ListingSearchQuery = z.input<typeof listingSearchQuery>;

export interface ListingImage {
  id: string;
  url: string;
  width: number;
  height: number;
  position: number;
}

export interface ListingSummary {
  id: string;
  title: string;
  status: ListingStatus;
  neighborhood: string | null;
  city: string;
  state: string;
  approxLat: number;
  approxLng: number;
  availableFrom: string;
  availableTo: string;
  minStayDays: number;
  monthlyRentCents: number;
  utilitiesIncluded: boolean;
  roomType: RoomType;
  furnishing: Furnishing;
  maxOccupants: number;
  amenities: Amenity[];
  coverImage: ListingImage | null;
  publishedAt: string | null;
  saved?: boolean;
}

export interface ListingDetail extends ListingSummary {
  description: string;
  postalCode: string | null;
  utilitiesEstCents: number | null;
  utilitiesNotes: string | null;
  images: ListingImage[];
  owner: PublicProfile;
  version: number;
  // dates already taken by approved bookings, so the calendar can grey them out
  bookedRanges: Array<{ start: string; end: string }>;
  // null unless you own the listing or have an approved booking for it
  privateLocation: {
    addressLine1: string;
    addressLine2: string | null;
    lat: number;
    lng: number;
  } | null;
  isOwner: boolean;
}

export interface ListingSearchResult {
  items: ListingSummary[];
  nextCursor: string | null;
  total: number | null;
}
