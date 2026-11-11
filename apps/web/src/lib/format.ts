import { format, parseISO } from 'date-fns';

export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

export const shortDate = (d: string) => format(parseISO(d), 'MMM d, yyyy');
export const monthDay = (d: string) => format(parseISO(d), 'MMM d');
export const range = (a: string, b: string) => {
  const sameYear = a.slice(0, 4) === b.slice(0, 4);
  return `${sameYear ? monthDay(a) : shortDate(a)} – ${shortDate(b)}`;
};

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d`;
  return format(new Date(iso), 'MMM d');
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
