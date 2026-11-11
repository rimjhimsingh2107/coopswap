import { memo } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { ROOM_TYPE_LABELS, type ListingSummary } from '@coopswap/shared';
import { money, range } from '@/lib/format';

export const ListingCard = memo(function ListingCard({ listing, highlighted, onHover }: { listing: ListingSummary; highlighted?: boolean; onHover?: (id: string | null) => void }) {
  return (
    <Link
      to={`/listings/${listing.id}`}
      className={clsx('group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500', highlighted && 'ring-2 ring-brand-500/60')}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-stone-200">
        {listing.coverImage ? (
          <img src={listing.coverImage.url} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 text-stone-400">
            <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
              <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
            </svg>
          </div>
        )}
        {listing.saved && <span className="absolute top-3 right-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-brand-700">Saved</span>}
        <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-stone-800 backdrop-blur">
          {ROOM_TYPE_LABELS[listing.roomType]}
        </span>
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-stone-900">{listing.title}</h3>
          <p className="truncate text-sm text-stone-500">
            {listing.neighborhood ? `${listing.neighborhood}, ` : ''}
            {listing.city}, {listing.state}
          </p>
          <p className="text-sm text-stone-500">{range(listing.availableFrom, listing.availableTo)}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="font-semibold">{money(listing.monthlyRentCents)}</span>
          <span className="text-sm text-stone-500">/mo</span>
        </p>
      </div>
    </Link>
  );
});

export function ListingCardSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="aspect-[4/3] rounded-2xl bg-stone-200" />
      <div className="mt-3 h-4 w-3/4 rounded bg-stone-200" />
      <div className="mt-2 h-3 w-1/2 rounded bg-stone-200" />
    </div>
  );
}
