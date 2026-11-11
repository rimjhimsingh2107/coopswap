// Privacy-light product analytics. No cookies, no user id: a random id that
// lives in sessionStorage (gone when the tab closes), and the server hashes it
// again with a salt that rotates daily. Enough to compute search -> booking
// conversion within a visit, not enough to follow anyone around.

type Props = Record<string, string | number | boolean | undefined | null>;

function sessionId() {
  try {
    let id = sessionStorage.getItem('cs_sid');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('cs_sid', id);
    }
    return id;
  } catch {
    return 'no-storage';
  }
}

export function track(name: 'search' | 'listing_view' | 'booking_request' | 'message_start', props: Props = {}) {
  if (navigator.doNotTrack === '1') return;
  const body = JSON.stringify({ name, sid: sessionId(), props });
  // beacon survives navigation; fall back to fetch
  const ok = navigator.sendBeacon?.('/api/analytics/events', new Blob([body], { type: 'application/json' }));
  if (!ok) void fetch('/api/analytics/events', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
}
