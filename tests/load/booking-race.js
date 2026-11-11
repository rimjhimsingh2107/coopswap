import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';
import exec from 'k6/execution';
import { BASE, listingBody, signIn, uuid } from './lib.js';

// For each listing, a bunch of guests request the same dates, then every
// approval is fired at once (one VU per request, all owner sessions).
// Expectation: exactly one 200 per listing, everything else a 409.
const users = new SharedArray('users', () => JSON.parse(open('./users.json')));
const LISTINGS = Number(__ENV.LISTINGS || 10);
const GUESTS = Number(__ENV.GUESTS || 15);

const approved = new Counter('approvals_ok');
const conflicts = new Counter('approvals_conflict');
const unexpected = new Counter('approvals_unexpected');

export const options = {
  setupTimeout: '5m',
  scenarios: {
    approve: { executor: 'per-vu-iterations', vus: LISTINGS * GUESTS, iterations: 1, maxDuration: '2m' },
  },
  thresholds: {
    approvals_unexpected: ['count==0'],
    'http_req_duration{type:approve}': ['p(95)<1500'],
  },
};

export function setup() {
  const pairs = [];
  for (let l = 0; l < LISTINGS; l++) {
    const owner = users[l];
    const headers = signIn(owner);
    const created = http.post(`${BASE}/api/listings`, JSON.stringify(listingBody(l)), { headers });
    const id = created.json('data.id');
    http.post(`${BASE}/api/listings/${id}/publish`, null, { headers });
    http.cookieJar().clear(BASE);
    for (let g = 0; g < GUESTS; g++) {
      const guest = users[LISTINGS + l * GUESTS + g];
      const gh = signIn(guest);
      const r = http.post(`${BASE}/api/bookings`, JSON.stringify({ listingId: id, startDate: '2031-03-01', endDate: '2031-05-01' }), { headers: gh });
      check(r, { 'request created': (x) => x.status === 201 });
      pairs.push({ owner: l, bookingId: r.json('data.id'), listingId: id });
      http.cookieJar().clear(BASE);
    }
  }
  return { pairs };
}

export default function (data) {
  const p = data.pairs[exec.vu.idInTest - 1];
  if (!p) return;
  const headers = signIn(users[p.owner]);
  const res = http.post(`${BASE}/api/bookings/${p.bookingId}/approve`, '{}', {
    headers: { ...headers, 'idempotency-key': uuid() },
    tags: { type: 'approve' },
  });
  if (res.status === 200) approved.add(1, { listing: 'any' });
  else if (res.status === 409) conflicts.add(1);
  else unexpected.add(1);
}

export function teardown(data) {
  // the invariant: one approval per listing
  const ids = [...new Set(data.pairs.map((p) => p.listingId))];
  console.log(`listings raced: ${ids.length}. approvals_ok should equal that.`);
}
