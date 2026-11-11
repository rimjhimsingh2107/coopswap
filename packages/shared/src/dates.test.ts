import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isValidDate, rangeContains, rangesOverlap, todayIn } from './dates.js';

describe('date ranges', () => {
  const r = (start: string, end: string) => ({ start, end });

  it('treats end as exclusive so back to back stays do not overlap', () => {
    expect(rangesOverlap(r('2026-01-01', '2026-02-01'), r('2026-02-01', '2026-03-01'))).toBe(false);
    expect(rangesOverlap(r('2026-02-01', '2026-03-01'), r('2026-01-01', '2026-02-01'))).toBe(false);
  });

  it('detects partial, contained and identical overlaps', () => {
    expect(rangesOverlap(r('2026-01-01', '2026-02-01'), r('2026-01-31', '2026-03-01'))).toBe(true);
    expect(rangesOverlap(r('2026-01-01', '2026-06-01'), r('2026-02-01', '2026-03-01'))).toBe(true);
    expect(rangesOverlap(r('2026-01-01', '2026-02-01'), r('2026-01-01', '2026-02-01'))).toBe(true);
  });

  it('containment is inclusive at both ends', () => {
    expect(rangeContains(r('2026-01-01', '2026-06-01'), r('2026-01-01', '2026-06-01'))).toBe(true);
    expect(rangeContains(r('2026-01-01', '2026-06-01'), r('2025-12-31', '2026-02-01'))).toBe(false);
  });

  it('does arithmetic across DST and leap years', () => {
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(daysBetween('2028-02-01', '2028-03-01')).toBe(29);
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('rejects impossible dates', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-2-3')).toBe(false);
    expect(isValidDate('2026-02-28')).toBe(true);
  });

  it('computes today in Boston, not UTC', () => {
    // 2am UTC on the 2nd is still the evening of the 1st in Boston
    expect(todayIn('America/New_York', new Date('2026-06-02T02:00:00Z'))).toBe('2026-06-01');
  });
});
