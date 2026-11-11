import http from 'k6/http';
import { check } from 'k6';

export const BASE = __ENV.BASE || 'http://localhost:8080';

// sign in and return the headers needed for later requests (session cookie
// lives in the vu's jar; csrf has to be echoed back as a header)
export function signIn(user) {
  const jar = http.cookieJar();
  http.get(`${BASE}/api/auth/csrf`);
  const csrf = jar.cookiesForURL(BASE).cs_csrf[0];
  const res = http.post(`${BASE}/api/auth/signin`, JSON.stringify({ email: user.email, password: user.password }), {
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
  });
  check(res, { 'signed in': (r) => r.status === 200 });
  return { 'content-type': 'application/json', 'x-csrf-token': csrf };
}

export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function listingBody(i) {
  return {
    title: `Load test room ${i}`,
    description: 'Created by the k6 load test. Not a real place, please ignore.',
    addressLine1: `${i} Load St`,
    city: 'Boston',
    state: 'MA',
    lat: 42.33 + (i % 50) * 0.001,
    lng: -71.09 - (i % 50) * 0.001,
    availableFrom: '2031-01-01',
    availableTo: '2031-12-31',
    minStayDays: 30,
    monthlyRentCents: 100000 + (i % 20) * 5000,
    furnishing: 'furnished',
    roomType: 'private_room',
    maxOccupants: 1,
    amenities: ['wifi'],
  };
}
