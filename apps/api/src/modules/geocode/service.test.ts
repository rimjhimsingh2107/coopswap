import { describe, expect, it } from 'vitest';
import { toResult } from './service.js';

describe('geocoder result mapping', () => {
  it('turns a photon address into our shape with a 2 letter state', () => {
    const r = toResult(
      {
        geometry: { coordinates: [-71.0892, 42.3398] },
        properties: { countrycode: 'US', housenumber: '360', street: 'Huntington Avenue', city: 'Boston', state: 'Massachusetts', postcode: '02115-5005' },
      },
      'address',
    );
    expect(r).toEqual({
      label: '360 Huntington Avenue, Boston, MA',
      street: '360 Huntington Avenue',
      city: 'Boston',
      state: 'MA',
      postalCode: '02115',
      lat: 42.3398,
      lng: -71.0892,
      kind: 'address',
    });
  });

  it('drops anything outside the US', () => {
    expect(toResult({ geometry: { coordinates: [-79.38, 43.65] }, properties: { countrycode: 'CA', name: 'Toronto' } }, 'city')).toBeNull();
  });
});
