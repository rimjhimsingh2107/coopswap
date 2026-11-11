import { env } from '../../config/env.js';

const domains = env.UNIVERSITY_DOMAINS.split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

// "husky.neu.edu" should match "husky.neu.edu" and "x.husky.neu.edu" but not "evilneu.edu"
export function universityDomainOf(email: string): string | null {
  const host = email.split('@')[1]?.toLowerCase();
  if (!host) return null;
  return domains.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;
}
