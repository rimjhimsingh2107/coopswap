import { describe, expect, it } from 'vitest';
import { TestClient, signedUpClient } from './helpers/client.js';
import { baseListing, createListing } from './helpers/fixtures.js';

describe('listings', () => {
  it('needs a verified email to create', async () => {
    const c = await signedUpClient({ verified: false });
    expect((await c.post('/api/listings', baseListing())).status).toBe(403);
  });

  it('hides the exact address and coordinates from everyone but the owner', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    expect(l.privateLocation.addressLine1).toBe('10 Tremont St');

    const anon = await new TestClient().init();
    const pub = await anon.get(`/api/listings/${l.id}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.privateLocation).toBeNull();
    expect(JSON.stringify(pub.body)).not.toContain('Tremont');
    expect(pub.body.data.approxLat).not.toBe(42.3332);
    expect(pub.body.data.owner).not.toHaveProperty('email');
  });

  it('drafts are invisible to other users', async () => {
    const owner = await signedUpClient();
    const draft = await createListing(owner, {}, false);
    const other = await signedUpClient();
    expect((await other.get(`/api/listings/${draft.id}`)).status).toBe(404);
    expect((await owner.get(`/api/listings/${draft.id}`)).status).toBe(200);
  });

  it("can't edit or archive someone else's listing", async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const other = await signedUpClient();
    expect((await other.patch(`/api/listings/${l.id}`, { title: 'mine now!!', version: l.version })).status).toBe(404);
    expect((await other.post(`/api/listings/${l.id}/archive`)).status).toBe(404);
  });

  it('rejects edits made against a stale version', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const first = await owner.patch(`/api/listings/${l.id}`, { monthlyRentCents: 130_000, version: l.version });
    expect(first.status).toBe(200);
    const stale = await owner.patch(`/api/listings/${l.id}`, { monthlyRentCents: 99_000, version: l.version });
    expect(stale.status).toBe(409);
    expect((await owner.get(`/api/listings/${l.id}`)).body.data.monthlyRentCents).toBe(130_000);
  });

  it('enforces listing status transitions', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    expect((await owner.post(`/api/listings/${l.id}/archive`)).body.data.status).toBe('archived');
    expect((await owner.post(`/api/listings/${l.id}/publish`)).body.data.status).toBe('active');
  });

  it('validates input on the server too', async () => {
    const owner = await signedUpClient();
    const res = await owner.post('/api/listings', baseListing({ monthlyRentCents: 5, state: 'Massachusetts' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['monthlyRentCents', 'state']));
  });

  it('saves and unsaves favorites', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const fan = await signedUpClient();
    expect((await fan.agent.put(`/api/me/saved/${l.id}`).set('x-csrf-token', fan.csrf)).status).toBe(204);
    // twice is fine
    expect((await fan.agent.put(`/api/me/saved/${l.id}`).set('x-csrf-token', fan.csrf)).status).toBe(204);
    const saved = await fan.get('/api/me/saved');
    expect(saved.body.data.map((x: { id: string }) => x.id)).toEqual([l.id]);
    expect((await fan.get(`/api/listings/${l.id}`)).body.data.saved).toBe(true);
    await fan.delete(`/api/me/saved/${l.id}`);
    expect((await fan.get('/api/me/saved')).body.data).toEqual([]);
  });
});

describe('listing search', () => {
  async function seed() {
    const owner = await signedUpClient();
    const a = await createListing(owner, { title: 'Cheap room near Ruggles', monthlyRentCents: 90_000, amenities: ['wifi'] });
    const b = await createListing(owner, {
      title: 'Whole studio in Fenway',
      roomType: 'studio',
      monthlyRentCents: 210_000,
      lat: 42.3456,
      lng: -71.0977,
      amenities: ['wifi', 'in_unit_laundry', 'air_conditioning'],
    });
    const c = await createListing(owner, {
      title: 'Summer sublet in SF Mission',
      city: 'San Francisco',
      state: 'CA',
      lat: 37.7599,
      lng: -122.4148,
      postalCode: '94110',
      monthlyRentCents: 180_000,
      availableFrom: '2027-05-01',
      availableTo: '2027-09-01',
    });
    const draft = await createListing(owner, { title: 'Not published yet' }, false);
    return { a, b, c, draft };
  }

  const ids = (res: { body: { data: { items: { id: string }[] } } }) => res.body.data.items.map((i) => i.id);

  it('only returns active listings, filtered by city', async () => {
    const { a, b } = await seed();
    const anon = await new TestClient().init();
    const res = await anon.get('/api/listings?city=boston&state=ma');
    expect(res.status).toBe(200);
    expect(ids(res).sort()).toEqual([a.id, b.id].sort());
    expect(res.body.data.total).toBe(2);
  });

  it('filters by price, room type and amenities', async () => {
    const { a, b } = await seed();
    const anon = await new TestClient().init();
    expect(ids(await anon.get('/api/listings?maxPrice=1000'))).toEqual([a.id]);
    expect(ids(await anon.get('/api/listings?roomTypes=studio,entire_place'))).toEqual([b.id]);
    expect(ids(await anon.get('/api/listings?amenities=wifi,in_unit_laundry'))).toEqual([b.id]);
  });

  it('filters by map viewport', async () => {
    const { c } = await seed();
    const anon = await new TestClient().init();
    expect(ids(await anon.get('/api/listings?bbox=-122.6,37.6,-122.3,37.9'))).toEqual([c.id]);
  });

  it('only matches listings whose window covers the requested dates', async () => {
    const { c } = await seed();
    const anon = await new TestClient().init();
    // jun-aug only fits the SF one; boston ones end jul 1
    expect(ids(await anon.get('/api/listings?start=2027-06-01&end=2027-08-01'))).toEqual([c.id]);
    // shorter than min stay
    expect(ids(await anon.get('/api/listings?start=2027-06-01&end=2027-06-10'))).toEqual([]);
  });

  it('does full text search', async () => {
    const { b } = await seed();
    const anon = await new TestClient().init();
    expect(ids(await anon.get('/api/listings?q=fenway studio'))).toEqual([b.id]);
  });

  it('sorts by price and by distance', async () => {
    const { a, b, c } = await seed();
    const anon = await new TestClient().init();
    expect(ids(await anon.get('/api/listings?sort=price_asc'))).toEqual([a.id, c.id, b.id]);
    expect(ids(await anon.get('/api/listings?sort=price_desc'))).toEqual([b.id, c.id, a.id]);
    // from fenway park, the fenway studio is closest and SF is furthest
    const near = ids(await anon.get('/api/listings?sort=distance&near=42.3467,-71.0972'));
    expect(near[0]).toBe(b.id);
    expect(near.at(-1)).toBe(c.id);
  });

  it('pages through results with a cursor without gaps or repeats', async () => {
    const owner = await signedUpClient();
    const made: string[] = [];
    for (let i = 0; i < 7; i++) {
      // a few share the same price so the id tiebreak matters
      made.push((await createListing(owner, { monthlyRentCents: 100_000 + (i % 3) * 10_000 })).id);
    }
    const anon = await new TestClient().init();
    for (const sort of ['newest', 'price_asc', 'price_desc', 'soonest']) {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res = await anon.get(`/api/listings?sort=${sort}&limit=3${cursor ? `&cursor=${cursor}` : ''}`);
        expect(res.status).toBe(200);
        seen.push(...ids(res));
        cursor = res.body.data.nextCursor;
        pages++;
      } while (cursor && pages < 10);
      expect(seen.sort()).toEqual([...made].sort());
      expect(pages).toBe(3);
    }
  });

  it('rejects garbage cursors and bad params', async () => {
    const anon = await new TestClient().init();
    expect((await anon.get('/api/listings?cursor=nope')).status).toBe(400);
    expect((await anon.get('/api/listings?bbox=1,2,3')).status).toBe(400);
    expect((await anon.get('/api/listings?sort=distance')).status).toBe(400);
  });
});
