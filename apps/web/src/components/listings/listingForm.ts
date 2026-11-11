import { z } from 'zod';
import { AMENITIES, FURNISHINGS, ROOM_TYPES, dateString, type CreateListingInput, type ListingDetail } from '@coopswap/shared';

// The form works in dollars and strings; the api wants cents and numbers.
export const listingFormSchema = z
  .object({
    title: z.string().trim().min(5, 'at least 5 characters').max(120),
    description: z.string().trim().min(20, 'tell people a bit more (20+ characters)').max(5000),
    roomType: z.enum(ROOM_TYPES),
    furnishing: z.enum(FURNISHINGS),
    maxOccupants: z.coerce.number().int().min(1).max(10),
    addressLine1: z.string().trim().min(3, 'pick an address from the list or type it'),
    addressLine2: z.string().trim().max(100).optional(),
    neighborhood: z.string().trim().max(80).optional(),
    city: z.string().trim().min(1, 'required'),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'two letters, e.g. MA'),
    postalCode: z.string().trim().regex(/^\d{5}$/, '5 digit zip').or(z.literal('')).optional(),
    lat: z.number({ message: 'choose the address from the suggestions so we can place it on the map' }),
    lng: z.number(),
    availableFrom: dateString,
    availableTo: dateString,
    minStayDays: z.coerce.number().int().min(1).max(365),
    rent: z.coerce.number().min(100, 'rent seems too low').max(20000),
    utilitiesIncluded: z.boolean(),
    utilitiesEst: z.coerce.number().min(0).max(2000).optional(),
    utilitiesNotes: z.string().trim().max(300).optional(),
    amenities: z.array(z.enum(AMENITIES)),
  })
  .refine((v) => v.availableTo > v.availableFrom, { path: ['availableTo'], message: 'must be after the start date' });

export type ListingFormValues = z.input<typeof listingFormSchema>;
type Parsed = z.output<typeof listingFormSchema>;

export const STEP_FIELDS: Array<Array<keyof ListingFormValues>> = [
  ['title', 'description', 'roomType', 'furnishing', 'maxOccupants'],
  ['addressLine1', 'addressLine2', 'neighborhood', 'city', 'state', 'postalCode', 'lat', 'lng'],
  ['availableFrom', 'availableTo', 'minStayDays', 'rent', 'utilitiesIncluded', 'utilitiesEst', 'utilitiesNotes'],
  ['amenities'],
];

export function toApi(v: Parsed): CreateListingInput {
  return {
    title: v.title,
    description: v.description,
    roomType: v.roomType,
    furnishing: v.furnishing,
    maxOccupants: v.maxOccupants,
    addressLine1: v.addressLine1,
    addressLine2: v.addressLine2 || null,
    neighborhood: v.neighborhood || null,
    city: v.city,
    state: v.state,
    postalCode: v.postalCode || null,
    lat: v.lat,
    lng: v.lng,
    availableFrom: v.availableFrom,
    availableTo: v.availableTo,
    minStayDays: v.minStayDays,
    monthlyRentCents: Math.round(v.rent * 100),
    utilitiesIncluded: v.utilitiesIncluded,
    utilitiesEstCents: v.utilitiesEst ? Math.round(v.utilitiesEst * 100) : null,
    utilitiesNotes: v.utilitiesNotes || null,
    amenities: v.amenities,
  };
}

export function fromListing(l: ListingDetail): ListingFormValues {
  return {
    title: l.title,
    description: l.description,
    roomType: l.roomType,
    furnishing: l.furnishing,
    maxOccupants: l.maxOccupants,
    addressLine1: l.privateLocation?.addressLine1 ?? '',
    addressLine2: l.privateLocation?.addressLine2 ?? '',
    neighborhood: l.neighborhood ?? '',
    city: l.city,
    state: l.state,
    postalCode: l.postalCode ?? '',
    lat: l.privateLocation?.lat ?? l.approxLat,
    lng: l.privateLocation?.lng ?? l.approxLng,
    availableFrom: l.availableFrom,
    availableTo: l.availableTo,
    minStayDays: l.minStayDays,
    rent: l.monthlyRentCents / 100,
    utilitiesIncluded: l.utilitiesIncluded,
    utilitiesEst: l.utilitiesEstCents ? l.utilitiesEstCents / 100 : undefined,
    utilitiesNotes: l.utilitiesNotes ?? '',
    amenities: l.amenities,
  };
}
