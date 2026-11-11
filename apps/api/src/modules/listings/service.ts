import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  createListingInput,
  updateListingInput,
  type ListingDetail,
  type ListingStatus,
  type ListingSummary,
  type SessionUser,
} from '@coopswap/shared';
import type { z } from 'zod';
import { db } from '../../db/pool.js';
import { listingImages, listings, savedListings } from '../../db/schema.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { approximateLocation } from '../../lib/geo.js';
import { audit } from '../../lib/audit.js';
import { getPublicProfile } from '../users/service.js';
import { toImage, toSummary } from './mappers.js';
import { listingHooks } from './hooks.js';

type CreateInput = z.output<typeof createListingInput>;
type UpdateInput = z.output<typeof updateListingInput>;

export async function createListing(ownerId: string, input: CreateInput) {
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(listings)
    .values({ ...input, id, ownerId, ...approximateLocation(id, input.lat, input.lng) })
    .returning({ id: listings.id });
  await audit(db, { actorId: ownerId, action: 'listing.created', entityType: 'listing', entityId: id });
  return row!.id;
}

async function loadOwned(listingId: string, user: SessionUser) {
  const [row] = await db.select().from(listings).where(eq(listings.id, listingId));
  if (!row) throw notFound('listing');
  // 404 not 403 so we don't confirm that a draft exists
  if (row.ownerId !== user.id && user.role !== 'admin') throw notFound('listing');
  return row;
}

export async function updateListing(listingId: string, user: SessionUser, input: UpdateInput) {
  const current = await loadOwned(listingId, user);
  const { version, ...changes } = input;

  // the shared schema validates the window when both ends are in the patch,
  // this covers the case where only one end changes
  const from = changes.availableFrom ?? current.availableFrom;
  const to = changes.availableTo ?? current.availableTo;
  if (to <= from) throw new AppError(400, 'validation_failed', 'available-to must be after available-from');

  const loc =
    changes.lat !== undefined || changes.lng !== undefined
      ? approximateLocation(listingId, changes.lat ?? current.lat, changes.lng ?? current.lng)
      : {};

  return db.transaction(async (tx) => {
    // Availability can't shrink past a booking someone already has. Runs in the
    // same transaction as the update; approvals lock the listing row with FOR
    // SHARE so they can't sneak in between this check and the write.
    for (const hook of listingHooks.beforeWindowChange) {
      await hook(tx, listingId, from, to);
    }

    const [row] = await tx
      .update(listings)
      .set({ ...changes, ...loc, version: sql`${listings.version} + 1`, updatedAt: new Date() })
      .where(and(eq(listings.id, listingId), eq(listings.version, version)))
      .returning();
    if (!row) {
      throw conflict('this listing was changed somewhere else, reload and try again', {
        currentVersion: current.version,
      });
    }
    await audit(tx, {
      actorId: user.id,
      action: 'listing.updated',
      entityType: 'listing',
      entityId: listingId,
      metadata: { fields: Object.keys(changes) },
    });
    for (const hook of listingHooks.afterUpdate) await hook(tx, row, Object.keys(changes));
    return row;
  });
}

const TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: ['active', 'archived'],
  active: ['archived'],
  archived: ['active'],
};

export async function setListingStatus(listingId: string, user: SessionUser, to: ListingStatus) {
  const current = await loadOwned(listingId, user);
  if (current.status === to) return current;
  if (!TRANSITIONS[current.status].includes(to)) {
    throw new AppError(409, 'invalid_transition', `can't go from ${current.status} to ${to}`);
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(listings)
      .set({
        status: to,
        publishedAt: to === 'active' ? (current.publishedAt ?? new Date()) : current.publishedAt,
        version: sql`${listings.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(listings.id, listingId), eq(listings.status, current.status)))
      .returning();
    if (!row) throw conflict('listing status changed, reload and try again');
    await audit(tx, {
      actorId: user.id,
      action: `listing.${to === 'active' ? 'published' : 'archived'}`,
      entityType: 'listing',
      entityId: listingId,
    });
    if (to === 'archived') for (const hook of listingHooks.afterArchive) await hook(tx, row, user.id);
    return row;
  });
}

export async function getListing(listingId: string, viewer?: SessionUser): Promise<ListingDetail> {
  const [row] = await db.select().from(listings).where(eq(listings.id, listingId));
  if (!row) throw notFound('listing');
  const isOwner = viewer?.id === row.ownerId;
  if (row.status !== 'active' && !isOwner && viewer?.role !== 'admin') throw notFound('listing');

  const [images, owner, saved, bookedRanges, canSeeAddress] = await Promise.all([
    db
      .select()
      .from(listingImages)
      .where(eq(listingImages.listingId, listingId))
      .orderBy(asc(listingImages.position)),
    getPublicProfile(row.ownerId).catch(() => null),
    viewer
      ? db
          .select({ x: sql`1` })
          .from(savedListings)
          .where(and(eq(savedListings.userId, viewer.id), eq(savedListings.listingId, listingId)))
          .then((r) => r.length > 0)
      : Promise.resolve(undefined),
    listingHooks.bookedRanges(listingId),
    isOwner ? Promise.resolve(true) : viewer ? listingHooks.canSeeAddress(listingId, viewer.id) : Promise.resolve(false),
  ]);

  const mapped = await Promise.all(images.map(toImage));
  const summary = await toSummary(row, images[0] ?? null, saved);

  return {
    ...summary,
    description: row.description,
    postalCode: row.postalCode,
    utilitiesEstCents: row.utilitiesEstCents,
    utilitiesNotes: row.utilitiesNotes,
    images: mapped,
    owner: owner ?? {
      id: row.ownerId,
      displayName: 'Deleted user',
      bio: '',
      school: null,
      avatarUrl: null,
      memberSince: row.createdAt.toISOString(),
      verifiedDomains: [],
    },
    version: row.version,
    bookedRanges,
    privateLocation: canSeeAddress
      ? { addressLine1: row.addressLine1, addressLine2: row.addressLine2, lat: row.lat, lng: row.lng }
      : null,
    isOwner,
  };
}

async function withCovers(rows: (typeof listings.$inferSelect)[], savedIds?: Set<string>) {
  if (!rows.length) return [];
  const covers = await db
    .selectDistinctOn([listingImages.listingId])
    .from(listingImages)
    .where(inArray(listingImages.listingId, rows.map((r) => r.id)))
    .orderBy(listingImages.listingId, asc(listingImages.position));
  const byListing = new Map(covers.map((c) => [c.listingId, c]));
  return Promise.all(rows.map((r) => toSummary(r, byListing.get(r.id) ?? null, savedIds?.has(r.id))));
}

export async function listMine(ownerId: string): Promise<ListingSummary[]> {
  const rows = await db.select().from(listings).where(eq(listings.ownerId, ownerId)).orderBy(desc(listings.createdAt));
  return withCovers(rows);
}

export async function listFeatured(limit = 8): Promise<ListingSummary[]> {
  // newest active listings that have photos. good enough for the landing page.
  const rows = await db
    .select()
    .from(listings)
    .where(and(eq(listings.status, 'active'), sql`exists (select 1 from listing_images i where i.listing_id = ${listings.id})`))
    .orderBy(desc(listings.publishedAt))
    .limit(limit);
  return withCovers(rows);
}

export async function saveListing(userId: string, listingId: string) {
  const [l] = await db.select({ status: listings.status }).from(listings).where(eq(listings.id, listingId));
  if (!l || l.status !== 'active') throw notFound('listing');
  await db.insert(savedListings).values({ userId, listingId }).onConflictDoNothing();
}

export async function unsaveListing(userId: string, listingId: string) {
  await db.delete(savedListings).where(and(eq(savedListings.userId, userId), eq(savedListings.listingId, listingId)));
}

export async function listSaved(userId: string): Promise<ListingSummary[]> {
  const rows = await db
    .select({ l: listings })
    .from(savedListings)
    .innerJoin(listings, eq(listings.id, savedListings.listingId))
    .where(and(eq(savedListings.userId, userId), eq(listings.status, 'active')))
    .orderBy(desc(savedListings.createdAt));
  const ls = rows.map((r) => r.l);
  return withCovers(ls, new Set(ls.map((l) => l.id)));
}
