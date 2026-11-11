import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { TestClient, signedUpClient } from './helpers/client.js';
import { createListing } from './helpers/fixtures.js';

async function jpegWithGps(width = 800, height = 600) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 60 } } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '42/1 20/1 23/1', GPSLongitudeRef: 'W', GPSLongitude: '71/1 5/1 21/1' } })
    .toBuffer();
}

const upload = (c: TestClient, listingId: string, files: Array<{ buf: Buffer; name: string; type?: string }>) => {
  let r = c.agent.post(`/api/listings/${listingId}/images`).set('x-csrf-token', c.csrf);
  for (const f of files) r = r.attach('images', f.buf, { filename: f.name, contentType: f.type ?? 'image/jpeg' });
  return r;
};

describe('listing images', () => {
  it('stores a re-encoded webp with the gps data stripped', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const original = await jpegWithGps();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const res = await upload(owner, l.id, [{ buf: original, name: 'room.jpg' }]);
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1);

    const img = await owner.get(res.body.data[0].url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/webp');
    const meta = await sharp(img.body).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
  });

  it('shrinks big photos', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const res = await upload(owner, l.id, [{ buf: big, name: 'big.jpg' }]);
    expect(res.body.data[0]).toMatchObject({ width: 2000, height: 1500 });
  });

  it('rejects files that are not really images, whatever they claim', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const fake = Buffer.from('<script>alert(1)</script>'.repeat(50));
    const res = await upload(owner, l.id, [{ buf: fake, name: 'cute.jpg', type: 'image/jpeg' }]);
    expect(res.status).toBe(400);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><script>alert(1)</script></svg>');
    expect((await upload(owner, l.id, [{ buf: svg, name: 'x.svg', type: 'image/svg+xml' }])).status).toBe(400);
  });

  it('rejects files over the size limit', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const res = await upload(owner, l.id, [{ buf: Buffer.alloc(9 * 1024 * 1024, 1), name: 'huge.jpg' }]);
    expect(res.status).toBe(413);
  });

  it("can't upload to someone else's listing", async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const other = await signedUpClient();
    expect((await upload(other, l.id, [{ buf: await jpegWithGps(), name: 'a.jpg' }])).status).toBe(404);
  });

  it('signed urls expire and cannot be tampered with', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const res = await upload(owner, l.id, [{ buf: await jpegWithGps(), name: 'a.jpg' }]);
    const url: string = res.body.data[0].url;
    const anon = await new TestClient().init();
    expect((await anon.get(url)).status).toBe(200);
    expect((await anon.get(url.replace(/sig=[^&]+/, 'sig=nope'))).status).toBe(403);
    expect((await anon.get(url.replace(/exp=\d+/, 'exp=1000'))).status).toBe(403);
  });

  it('reorders and deletes, and the first one becomes the cover', async () => {
    const owner = await signedUpClient();
    const l = await createListing(owner);
    const res = await upload(owner, l.id, [
      { buf: await jpegWithGps(), name: 'a.jpg' },
      { buf: await jpegWithGps(600, 600), name: 'b.jpg' },
      { buf: await jpegWithGps(900, 600), name: 'c.jpg' },
    ]);
    const ids: string[] = res.body.data.map((i: { id: string }) => i.id);
    const reordered = await owner.agent.put(`/api/listings/${l.id}/images/order`).set('x-csrf-token', owner.csrf).send({ ids: [ids[2], ids[0], ids[1]] });
    expect(reordered.body.data.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[0], ids[1]]);

    const detail = (await owner.get(`/api/listings/${l.id}`)).body.data;
    expect(detail.coverImage.id).toBe(ids[2]);

    await owner.delete(`/api/listings/${l.id}/images/${ids[2]}`);
    const { rows } = await pool.query('select count(*)::int as n from listing_images where listing_id = $1', [l.id]);
    expect(rows[0].n).toBe(2);
  });
});
