import type { CreateListingInput } from '@coopswap/shared';
import type { TestClient } from './client.js';

export const baseListing = (overrides: Partial<CreateListingInput> = {}): CreateListingInput => ({
  title: 'Private room in Mission Hill',
  description: 'Two roommates, both on co-op. Close to the E line and the gym.',
  addressLine1: '10 Tremont St',
  addressLine2: 'Apt 3',
  neighborhood: 'Mission Hill',
  city: 'Boston',
  state: 'MA',
  postalCode: '02120',
  lat: 42.3332,
  lng: -71.1031,
  availableFrom: '2027-01-01',
  availableTo: '2027-07-01',
  minStayDays: 30,
  monthlyRentCents: 120_000,
  furnishing: 'furnished',
  roomType: 'private_room',
  maxOccupants: 1,
  amenities: ['wifi', 'near_transit'],
  ...overrides,
});

export async function createListing(c: TestClient, overrides: Partial<CreateListingInput> = {}, publish = true) {
  const res = await c.post('/api/listings', baseListing(overrides));
  if (res.status !== 201) throw new Error(`create listing failed ${res.status} ${JSON.stringify(res.body)}`);
  if (publish) {
    const p = await c.post(`/api/listings/${res.body.data.id}/publish`);
    if (p.status !== 200) throw new Error(`publish failed ${p.status}`);
    return p.body.data;
  }
  return res.body.data;
}
