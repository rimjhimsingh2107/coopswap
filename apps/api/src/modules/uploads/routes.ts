import { Router } from 'express';
import multer from 'multer';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/pool.js';
import { listingImages, listings, profiles } from '../../db/schema.js';
import { withTx } from '../../db/tx.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { params, body } from '../../lib/validate.js';
import { localStorage, storage, verifyLocal } from '../../lib/storage.js';
import { audit } from '../../lib/audit.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { requireAuth, userOf } from '../../middleware/session.js';
import { MAX_UPLOAD_BYTES, processImage } from './images.js';

export const uploadsRouter = Router();

const MAX_IMAGES_PER_LISTING = 20;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 10, fields: 5 },
});
const uploadLimit = rateLimit({ name: 'upload', points: 60, durationSec: 3600, by: 'user' });

async function ownedListing(listingId: string, userId: string, role: string) {
  const [l] = await db.select({ ownerId: listings.ownerId }).from(listings).where(eq(listings.id, listingId));
  if (!l || (l.ownerId !== userId && role !== 'admin')) throw notFound('listing');
}

async function imagesOf(listingId: string) {
  const rows = await db.select().from(listingImages).where(eq(listingImages.listingId, listingId)).orderBy(asc(listingImages.position));
  return Promise.all(
    rows.map(async (r) => ({ id: r.id, url: await storage.signedUrl(r.storageKey), width: r.width, height: r.height, position: r.position })),
  );
}

uploadsRouter.post('/listings/:id/images', requireAuth, uploadLimit, upload.array('images', 10), async (req, res) => {
  const user = userOf(req);
  const { id } = params(req, z.object({ id: z.uuid() }));
  await ownedListing(id, user.id, user.role);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw badRequest('attach at least one image as "images"');

  // process everything before touching storage so one bad file fails the batch
  const processed = await Promise.all(files.map((f) => processImage(f.buffer)));
  const keys = processed.map(() => `listings/${id}/${crypto.randomUUID()}.webp`);
  await Promise.all(processed.map((p, i) => storage.put(keys[i]!, p.buffer, 'image/webp')));

  try {
    await withTx('listing_images_add', async (tx) => {
      // lock the listing so two uploads at once don't pick the same positions
      await tx.execute(sql`select 1 from listings where id = ${id} for no key update`);
      const [{ n, maxPos }] = (
        await tx.execute<{ n: number; maxPos: number }>(
          sql`select count(*)::int as n, coalesce(max(position), -1)::int as "maxPos" from listing_images where listing_id = ${id}`,
        )
      ).rows as [{ n: number; maxPos: number }];
      if (n + processed.length > MAX_IMAGES_PER_LISTING) {
        throw new AppError(400, 'bad_request', `max ${MAX_IMAGES_PER_LISTING} photos per listing`);
      }
      await tx.insert(listingImages).values(
        processed.map((p, i) => ({ listingId: id, storageKey: keys[i]!, position: maxPos + 1 + i, width: p.width, height: p.height, bytes: p.bytes })),
      );
      await audit(tx, { actorId: user.id, action: 'listing.images_added', entityType: 'listing', entityId: id, metadata: { count: processed.length } });
    });
  } catch (err) {
    // don't leave orphaned files behind
    await Promise.allSettled(keys.map((k) => storage.delete(k)));
    throw err;
  }
  res.status(201).json({ data: await imagesOf(id) });
});

uploadsRouter.delete('/listings/:id/images/:imageId', requireAuth, async (req, res) => {
  const user = userOf(req);
  const { id, imageId } = params(req, z.object({ id: z.uuid(), imageId: z.uuid() }));
  await ownedListing(id, user.id, user.role);
  const [row] = await db
    .delete(listingImages)
    .where(and(eq(listingImages.id, imageId), eq(listingImages.listingId, id)))
    .returning();
  if (!row) throw notFound('image');
  await storage.delete(row.storageKey).catch(() => {});
  res.json({ data: await imagesOf(id) });
});

uploadsRouter.put('/listings/:id/images/order', requireAuth, async (req, res) => {
  const user = userOf(req);
  const { id } = params(req, z.object({ id: z.uuid() }));
  const { ids } = body(req, z.object({ ids: z.array(z.uuid()).max(MAX_IMAGES_PER_LISTING) }));
  await ownedListing(id, user.id, user.role);
  await withTx('listing_images_reorder', async (tx) => {
    const current = await tx.select({ id: listingImages.id }).from(listingImages).where(eq(listingImages.listingId, id));
    const set = new Set(current.map((c) => c.id));
    if (ids.length !== set.size || !ids.every((x) => set.has(x))) throw badRequest('ids must be exactly the current images');
    // positions are unique but deferred, so swapping inside the tx is fine
    for (const [position, imageId] of ids.entries()) {
      await tx.update(listingImages).set({ position }).where(eq(listingImages.id, imageId));
    }
  });
  res.json({ data: await imagesOf(id) });
});

uploadsRouter.post('/me/avatar', requireAuth, uploadLimit, upload.single('avatar'), async (req, res) => {
  const user = userOf(req);
  if (!req.file) throw badRequest('attach an image as "avatar"');
  const img = await processImage(req.file.buffer, 512);
  const key = `avatars/${user.id}/${crypto.randomUUID()}.webp`;
  await storage.put(key, img.buffer, 'image/webp');
  const [old] = await db.select({ key: profiles.avatarKey }).from(profiles).where(eq(profiles.userId, user.id));
  await db.update(profiles).set({ avatarKey: key, updatedAt: new Date() }).where(eq(profiles.userId, user.id));
  if (old?.key) await storage.delete(old.key).catch(() => {});
  res.json({ data: { avatarUrl: await storage.signedUrl(key) } });
});

// Only used with the local storage driver. In prod the signed urls point at S3.
uploadsRouter.get('/files/*key', async (req, res) => {
  if (!localStorage) throw notFound('file');
  const key = ([] as string[]).concat((req.params as { key: string | string[] }).key).join('/');
  const { exp, sig } = z.object({ exp: z.coerce.number(), sig: z.string() }).parse(req.query);
  if (!verifyLocal(key, exp, sig)) throw new AppError(403, 'forbidden', 'link expired or invalid');
  const data = await localStorage.read(key).catch(() => null);
  if (!data) throw notFound('file');
  res.setHeader('content-type', 'image/webp');
  res.setHeader('cache-control', 'private, max-age=3600');
  res.setHeader('x-content-type-options', 'nosniff');
  res.send(data);
});
