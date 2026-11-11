import { describe, expect, it } from 'vitest';
import { approximateLocation } from './geo.js';

describe('approximateLocation', () => {
  const id = '3b0c7a8e-0d0e-4f63-9d1b-2b0c4c1e6a11';

  it('is stable for the same listing', () => {
    expect(approximateLocation(id, 42.3398, -71.0892)).toEqual(approximateLocation(id, 42.3398, -71.0892));
  });

  it('stays within a few hundred meters of the real spot', () => {
    const { approxLat, approxLng } = approximateLocation(id, 42.3398, -71.0892);
    expect(Math.abs(approxLat - 42.3398)).toBeLessThan(0.0035);
    expect(Math.abs(approxLng - -71.0892)).toBeLessThan(0.0035);
  });

  it('gives the same pin for two addresses in the same grid cell', () => {
    const a = approximateLocation(id, 42.3398, -71.0892);
    const b = approximateLocation(id, 42.3401, -71.0889);
    expect(a).toEqual(b);
  });
});
