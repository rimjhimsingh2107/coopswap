import { describe, expect, it } from 'vitest';
import { createListingInput, listingSearchQuery } from './listings.js';

const valid = {
  title: 'Sunny room near Ruggles',
  description: 'Big window, quiet roommates, 5 minute walk to the orange line.',
  addressLine1: '123 Fake St',
  city: 'Boston',
  state: 'ma',
  lat: 42.336,
  lng: -71.09,
  availableFrom: '2026-01-05',
  availableTo: '2026-06-30',
  monthlyRentCents: 145000,
  furnishing: 'furnished',
  roomType: 'private_room',
  maxOccupants: 1,
};

describe('createListingInput', () => {
  it('accepts a normal listing and uppercases the state', () => {
    const parsed = createListingInput.parse(valid);
    expect(parsed.state).toBe('MA');
    expect(parsed.minStayDays).toBe(30);
  });

  it('rejects a window that ends before it starts', () => {
    const r = createListingInput.safeParse({ ...valid, availableTo: '2026-01-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['availableTo']);
  });

  it('rejects min stay longer than the window', () => {
    const r = createListingInput.safeParse({ ...valid, availableTo: '2026-01-20', minStayDays: 30 });
    expect(r.success).toBe(false);
  });

  it('rejects unknown amenities', () => {
    expect(createListingInput.safeParse({ ...valid, amenities: ['hot_tub'] }).success).toBe(false);
  });
});

describe('listingSearchQuery', () => {
  it('parses comma separated filters from a query string', () => {
    const q = listingSearchQuery.parse({ roomTypes: 'studio,private_room', amenities: 'wifi', bbox: '-71.2,42.2,-71.0,42.4' });
    expect(q.roomTypes).toEqual(['studio', 'private_room']);
    expect(q.bbox).toEqual([-71.2, 42.2, -71.0, 42.4]);
    expect(q.sort).toBe('newest');
  });

  it('requires both dates', () => {
    expect(listingSearchQuery.safeParse({ start: '2026-01-01' }).success).toBe(false);
  });

  it('requires near for distance sort', () => {
    expect(listingSearchQuery.safeParse({ sort: 'distance' }).success).toBe(false);
    expect(listingSearchQuery.safeParse({ sort: 'distance', near: '42.34,-71.09' }).success).toBe(true);
  });
});
