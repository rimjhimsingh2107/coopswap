import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';
import { BASE, listingBody, signIn, uuid } from './lib.js';

// Socket.io over raw websockets (engine.io v4 framing):
//   "0{...}" open, "40" connect, "42[event, data]" events, "2"/"3" ping/pong.
// Even VUs are owners holding a socket and listening; odd VUs are guests
// sending messages over REST. Latency = receive time - the sentAt we embed.
const users = new SharedArray('users', () => JSON.parse(open('./users.json')));
const PAIRS = Number(__ENV.PAIRS || 100);
const HOLD = Number(__ENV.HOLD_SECONDS || 120);

const latency = new Trend('message_fanout_ms', true);
const received = new Counter('messages_received');
const sent = new Counter('messages_sent');

export const options = {
  setupTimeout: '10m',
  scenarios: {
    sockets: { executor: 'per-vu-iterations', vus: PAIRS * 2, iterations: 1, maxDuration: `${HOLD + 60}s` },
  },
  thresholds: {
    message_fanout_ms: ['p(95)<500'],
    'checks{check:socket connected}': ['rate>0.99'],
  },
};

export function setup() {
  const convs = [];
  for (let i = 0; i < PAIRS; i++) {
    const owner = users[i * 2];
    const guest = users[i * 2 + 1];
    let h = signIn(owner);
    const l = http.post(`${BASE}/api/listings`, JSON.stringify(listingBody(1000 + i)), { headers: h });
    http.post(`${BASE}/api/listings/${l.json('data.id')}/publish`, null, { headers: h });
    http.cookieJar().clear(BASE);
    h = signIn(guest);
    const c = http.post(`${BASE}/api/conversations`, JSON.stringify({ listingId: l.json('data.id') }), { headers: h });
    convs.push(c.json('data.id'));
    http.cookieJar().clear(BASE);
  }
  return { convs };
}

function listen(user) {
  signIn(user);
  const cookies = http.cookieJar().cookiesForURL(BASE);
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v[0]}`).join('; ');
  const url = `${BASE.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;
  const res = ws.connect(url, { headers: { cookie, origin: __ENV.ORIGIN || BASE } }, (socket) => {
    socket.on('message', (msg) => {
      if (msg.startsWith('0')) socket.send('40');
      else if (msg === '2') socket.send('3');
      else if (msg.startsWith('42')) {
        const [event, data] = JSON.parse(msg.slice(2));
        if (event === 'message:new' && data.body.startsWith('t=')) {
          latency.add(Date.now() - Number(data.body.slice(2)));
          received.add(1);
        }
      }
    });
    socket.setTimeout(() => socket.close(), HOLD * 1000);
  });
  check(res, { 'socket connected': (r) => r && r.status === 101 });
}

function talk(user, convId) {
  const headers = signIn(user);
  sleep(5); // let the listeners connect
  const end = Date.now() + (HOLD - 10) * 1000;
  while (Date.now() < end) {
    const r = http.post(`${BASE}/api/conversations/${convId}/messages`, JSON.stringify({ body: `t=${Date.now()}`, clientId: uuid() }), { headers });
    if (r.status === 201) sent.add(1);
    sleep(1 + Math.random());
  }
}

export default function (data) {
  const vu = exec.vu.idInTest - 1;
  const pair = Math.floor(vu / 2);
  if (vu % 2 === 0) listen(users[pair * 2]);
  else talk(users[pair * 2 + 1], data.convs[pair]);
}
