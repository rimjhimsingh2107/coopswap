import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { expireStaleRequests } from '../src/modules/bookings/service.js';
import { TestClient, signedUpClient } from './helpers/client.js';
import { createListing } from './helpers/fixtures.js';
import { act, overlappingApprovedPairs, requestBooking, statusCounts } from './helpers/bookings.js';

async function setup() {
  const owner = await signedUpClient({ name: 'Owner' });
  const listing = await createListing(owner, { availableFrom: '2027-01-01', availableTo: '2027-09-01' });
  return { owner, listing };
}

describe('booking requests', () => {
  it('creates a request with a price snapshot and lets both sides see it', async () => {
    const { owner, listing } = await setup();
    const guest = await signedUpClient({ name: 'Guest' });
    const res = await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'requested',
      nights: 59,
      monthlyRentCents: listing.monthlyRentCents,
      viewerRole: 'guest',
      actions: ['canceled'],
    });

    const asOwner = await owner.get(`/api/bookings/${res.body.data.id}`);
    expect(asOwner.body.data.viewerRole).toBe('owner');
    expect(asOwner.body.data.actions.sort()).toEqual(['approved', 'rejected']);

    const stranger = await signedUpClient();
    expect((await stranger.get(`/api/bookings/${res.body.data.id}`)).status).toBe(404);
  });

  it('validates dates against the listing', async () => {
    const { owner, listing } = await setup();
    const guest = await signedUpClient();
    expect((await requestBooking(guest, listing.id, '2026-01-01', '2026-03-01')).status).toBe(400); // past
    expect((await requestBooking(guest, listing.id, '2027-08-01', '2027-10-01')).status).toBe(400); // past window
    expect((await requestBooking(guest, listing.id, '2027-02-01', '2027-02-10')).status).toBe(400); // < min stay
    expect((await requestBooking(guest, listing.id, '2027-03-01', '2027-02-01')).status).toBe(400); // backwards
    expect((await requestBooking(owner, listing.id, '2027-02-01', '2027-04-01')).status).toBe(400); // own listing
  });

  it("doesn't let a guest spam overlapping requests on one listing", async () => {
    const { listing } = await setup();
    const guest = await signedUpClient();
    expect((await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).status).toBe(201);
    const again = await requestBooking(guest, listing.id, '2027-03-01', '2027-05-01');
    expect(again.status).toBe(409);
  });

  it('only the owner can approve', async () => {
    const { listing } = await setup();
    const guest = await signedUpClient();
    const b = (await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).body.data;
    const res = await act(guest, b.id, 'approve');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('invalid_transition');
    const stranger = await signedUpClient();
    expect((await act(stranger, b.id, 'approve')).status).toBe(404);
  });

  it('approving auto-rejects overlapping requests but leaves others alone', async () => {
    const { owner, listing } = await setup();
    const [g1, g2, g3] = await Promise.all([signedUpClient(), signedUpClient(), signedUpClient()]);
    const winner = (await requestBooking(g1, listing.id, '2027-02-01', '2027-04-01')).body.data;
    const overlapping = (await requestBooking(g2, listing.id, '2027-03-15', '2027-05-01')).body.data;
    const separate = (await requestBooking(g3, listing.id, '2027-04-01', '2027-06-01')).body.data;

    expect((await act(owner, winner.id, 'approve')).body.data.status).toBe('approved');
    const lost = (await g2.get(`/api/bookings/${overlapping.id}`)).body.data;
    expect(lost.status).toBe('rejected');
    expect(lost.statusReason).toMatch(/booked by someone else/);
    expect((await g3.get(`/api/bookings/${separate.id}`)).body.data.status).toBe('requested');
  });

  it('treats checkout day as free: back to back stays both get approved', async () => {
    const { owner, listing } = await setup();
    const [g1, g2] = await Promise.all([signedUpClient(), signedUpClient()]);
    // checkout and checkin on the same day, mar 15
    const a = (await requestBooking(g1, listing.id, '2027-02-01', '2027-03-15')).body.data;
    const b = (await requestBooking(g2, listing.id, '2027-03-15', '2027-05-01')).body.data;
    expect((await act(owner, a.id, 'approve')).status).toBe(200);
    expect((await act(owner, b.id, 'approve')).status).toBe(200);
    expect(await statusCounts(listing.id)).toEqual({ approved: 2 });
  });

  it('rejects new requests for dates that are already approved', async () => {
    const { owner, listing } = await setup();
    const [g1, g2] = await Promise.all([signedUpClient(), signedUpClient()]);
    const a = (await requestBooking(g1, listing.id, '2027-02-01', '2027-04-01')).body.data;
    await act(owner, a.id, 'approve');
    const res = await requestBooking(g2, listing.id, '2027-03-01', '2027-05-01');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('booking_conflict');
    expect(res.body.error.details.taken).toEqual([{ start: '2027-02-01', end: '2027-04-01' }]);
  });

  it('cancelling an approved stay frees the dates again', async () => {
    const { owner, listing } = await setup();
    const [g1, g2] = await Promise.all([signedUpClient(), signedUpClient()]);
    const a = (await requestBooking(g1, listing.id, '2027-02-01', '2027-04-01')).body.data;
    await act(owner, a.id, 'approve');
    expect((await act(g1, a.id, 'cancel')).body.data.status).toBe('canceled');
    const b = await requestBooking(g2, listing.id, '2027-02-01', '2027-04-01');
    expect(b.status).toBe(201);
    expect((await act(owner, b.body.data.id, 'approve')).status).toBe(200);
  });

  it('final states stay final', async () => {
    const { owner, listing } = await setup();
    const guest = await signedUpClient();
    const b = (await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).body.data;
    await act(owner, b.id, 'reject');
    expect((await act(owner, b.id, 'approve')).status).toBe(409);
    expect((await act(guest, b.id, 'cancel')).status).toBe(409);
  });

  it('repeating the same transition is a no-op, not an error', async () => {
    const { owner, listing } = await setup();
    const guest = await signedUpClient();
    const b = (await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).body.data;
    expect((await act(owner, b.id, 'approve')).status).toBe(200);
    const again = await act(owner, b.id, 'approve');
    expect(again.status).toBe(200);
    expect(again.body.data.version).toBe(2);
  });

  it('shares the exact address only after approval', async () => {
    const { owner, listing } = await setup();
    const guest = await signedUpClient();
    const b = (await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).body.data;
    expect((await guest.get(`/api/listings/${listing.id}`)).body.data.privateLocation).toBeNull();
    await act(owner, b.id, 'approve');
    const after = (await guest.get(`/api/listings/${listing.id}`)).body.data;
    expect(after.privateLocation.addressLine1).toBe('10 Tremont St');
    expect(after.bookedRanges).toEqual([{ start: '2027-02-01', end: '2027-04-01' }]);
  });

  it("won't let the owner shrink availability past an approved stay", async () => {
    const { owner, listing } = await setup();
    const guest = await signedUpClient();
    const b = (await requestBooking(guest, listing.id, '2027-05-01', '2027-07-01')).body.data;
    await act(owner, b.id, 'approve');
    const res = await owner.patch(`/api/listings/${listing.id}`, { availableTo: '2027-06-01', version: listing.version });
    expect(res.status).toBe(409);
    const ok = await owner.patch(`/api/listings/${listing.id}`, { availableTo: '2027-07-01', version: listing.version });
    expect(ok.status).toBe(200);
  });

  it('archiving a listing rejects its open requests', async () => {
    const { owner, listing } = await setup();
    const guest = await signedUpClient();
    const b = (await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).body.data;
    await owner.post(`/api/listings/${listing.id}/archive`);
    const after = (await guest.get(`/api/bookings/${b.id}`)).body.data;
    expect(after.status).toBe('rejected');
  });

  it('search hides listings that are booked for the requested dates', async () => {
    const { owner, listing } = await setup();
    const guest = await signedUpClient();
    const b = (await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).body.data;
    const anon = await new TestClient().init();
    const ids = async (q: string) => (await anon.get(`/api/listings?${q}`)).body.data.items.map((i: { id: string }) => i.id);

    // a pending request doesn't hide it
    expect(await ids('start=2027-03-01&end=2027-04-15')).toEqual([listing.id]);
    await act(owner, b.id, 'approve');
    expect(await ids('start=2027-03-01&end=2027-04-15')).toEqual([]);
    expect(await ids('start=2027-04-01&end=2027-05-15')).toEqual([listing.id]);
  });

  it('expires requests the owner never answered', async () => {
    const { owner, listing } = await setup();
    const guest = await signedUpClient();
    const b = (await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).body.data;
    await pool.query(`update bookings set expires_at = now() - interval '1 minute' where id = $1`, [b.id]);

    // even before the sweeper runs, an expired request can't be approved
    const tooLate = await act(owner, b.id, 'approve');
    expect(tooLate.status).toBe(409);
    expect(tooLate.body.error.message).toMatch(/expired/);

    expect(await expireStaleRequests()).toBe(1);
    expect((await guest.get(`/api/bookings/${b.id}`)).body.data.status).toBe('expired');
    expect(await expireStaleRequests()).toBe(0);
  });

  it('keeps a full history of state changes', async () => {
    const { owner, listing } = await setup();
    const guest = await signedUpClient();
    const b = (await requestBooking(guest, listing.id, '2027-02-01', '2027-04-01')).body.data;
    await act(owner, b.id, 'approve');
    await act(guest, b.id, 'cancel');
    const { rows } = await pool.query('select from_status, to_status from booking_events where booking_id = $1 order by id', [b.id]);
    expect(rows).toEqual([
      { from_status: null, to_status: 'requested' },
      { from_status: 'requested', to_status: 'approved' },
      { from_status: 'approved', to_status: 'canceled' },
    ]);
    expect(await overlappingApprovedPairs()).toEqual([]);
  });
});
