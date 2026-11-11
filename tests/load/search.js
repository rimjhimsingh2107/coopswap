import http from 'k6/http';
import { check } from 'k6';
import { BASE } from './lib.js';

// Anonymous search traffic at a rising request rate. Mix of the queries the
// explore page actually sends.
export const options = {
  scenarios: {
    search: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { target: 50, duration: '1m' },
        { target: 150, duration: '2m' },
        { target: 300, duration: '2m' },
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: {
    'http_req_failed{type:search}': ['rate<0.01'],
    'http_req_duration{type:search}': ['p(95)<400'],
  },
};

const QUERIES = [
  'city=Boston&state=MA',
  'city=Boston&state=MA&sort=price_asc',
  'city=Boston&state=MA&start=2031-02-01&end=2031-05-01',
  'city=Boston&state=MA&maxPrice=1500&roomTypes=private_room,studio',
  'bbox=-71.13,42.32,-71.05,42.36',
  'bbox=-71.13,42.32,-71.05,42.36&amenities=wifi&start=2031-03-01&end=2031-06-01',
  'q=furnished%20quiet',
  'city=New%20York&state=NY&sort=soonest',
];

export default function () {
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  // spread across ips so the per-ip limiter measures the api, not itself
  const res = http.get(`${BASE}/api/listings?${q}&limit=24`, {
    tags: { type: 'search' },
    headers: { 'x-forwarded-for': `10.${__VU % 255}.${Math.floor(__ITER / 255) % 255}.${__ITER % 255}` },
  });
  check(res, { '200': (r) => r.status === 200 });
}
