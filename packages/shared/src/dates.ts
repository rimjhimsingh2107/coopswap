// All stay dates are calendar dates ('YYYY-MM-DD') with no timezone. Ranges are
// half open: [start, end). `end` is the move-out day, so a stay ending on the
// 1st and another starting on the 1st do not overlap.

const DAY_MS = 86_400_000;

export function parseDate(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y!, m! - 1, day!);
}

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  return formatDate(parseDate(d) + n * DAY_MS);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseDate(end) - parseDate(start)) / DAY_MS);
}

export function rangesOverlap(a: { start: string; end: string }, b: { start: string; end: string }) {
  // string compare works for ISO dates
  return a.start < b.end && b.start < a.end;
}

export function rangeContains(outer: { start: string; end: string }, inner: { start: string; end: string }) {
  return outer.start <= inner.start && inner.end <= outer.end;
}

export function isValidDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return formatDate(parseDate(d)) === d;
}

// today in the given IANA zone. Boston by default since that's where most
// users are; it only matters for "can't book in the past" checks.
export function todayIn(timeZone = 'America/New_York', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
