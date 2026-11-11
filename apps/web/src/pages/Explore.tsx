import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Amenity, ListingSearchQuery, ListingSort, RoomType } from '@coopswap/shared';
import { useListingSearch } from '@/hooks/data';
import { useDebounced } from '@/hooks/useDebounced';
import { ListingCard, ListingCardSkeleton } from '@/components/listings/ListingCard';
import { ListingMap, type BBox } from '@/components/listings/ListingMap';
import { Filters, type FilterState } from '@/components/listings/Filters';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorNote } from '@/components/ui/misc';
import { track } from '@/lib/analytics';

const list = <T extends string>(v: string | null) => (v ? (v.split(',') as T[]) : []);

// All filter state lives in the url so results are shareable and back works.
function readFilters(sp: URLSearchParams): FilterState {
  return {
    q: sp.get('q') ?? '',
    city: sp.get('city') ?? '',
    state: sp.get('state') ?? '',
    start: sp.get('start') ?? '',
    end: sp.get('end') ?? '',
    minPrice: sp.get('minPrice') ?? '',
    maxPrice: sp.get('maxPrice') ?? '',
    roomTypes: list<RoomType>(sp.get('roomTypes')),
    amenities: list<Amenity>(sp.get('amenities')),
    sort: (sp.get('sort') as ListingSort) ?? 'newest',
  };
}

export default function Explore() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const filters = readFilters(sp);
  const [q, setQ] = useState(filters.q);
  const debouncedQ = useDebounced(q, 350);
  const [bbox, setBbox] = useState<BBox | null>(() => (sp.get('bbox') ? (sp.get('bbox')!.split(',').map(Number) as BBox) : null));
  const [hovered, setHovered] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  const update = useCallback(
    (patch: Partial<FilterState>) => {
      if ('q' in patch) {
        setQ(patch.q ?? '');
        return;
      }
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) {
        const s = Array.isArray(v) ? v.join(',') : String(v ?? '');
        if (s) next.set(k, s);
        else next.delete(k);
      }
      setSp(next, { replace: true });
    },
    [sp, setSp],
  );

  // push the debounced text into the url
  useEffect(() => {
    if (debouncedQ === (sp.get('q') ?? '')) return;
    const next = new URLSearchParams(sp);
    if (debouncedQ) next.set('q', debouncedQ);
    else next.delete('q');
    setSp(next, { replace: true });
  }, [debouncedQ, sp, setSp]);

  const query: ListingSearchQuery = useMemo(() => {
    const datesOk = filters.start && filters.end && filters.end > filters.start;
    return {
      q: filters.q || undefined,
      // once you've moved the map, the viewport wins over the city box
      city: bbox ? undefined : filters.city || undefined,
      state: bbox ? undefined : filters.state || undefined,
      bbox: bbox?.join(','),
      start: datesOk ? filters.start : undefined,
      end: datesOk ? filters.end : undefined,
      minPrice: filters.minPrice ? Number(filters.minPrice) : undefined,
      maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined,
      roomTypes: filters.roomTypes.length ? filters.roomTypes.join(',') : undefined,
      amenities: filters.amenities.length ? filters.amenities.join(',') : undefined,
      sort: filters.sort === 'distance' ? 'newest' : filters.sort,
      limit: 24,
    } as ListingSearchQuery;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString(), bbox]);

  const search = useListingSearch(query);
  const items = useMemo(() => search.data?.pages.flatMap((p) => p.items) ?? [], [search.data]);
  const total = search.data?.pages[0]?.total;

  const lastTracked = useRef('');
  useEffect(() => {
    const key = JSON.stringify(query);
    if (search.isSuccess && key !== lastTracked.current) {
      lastTracked.current = key;
      track('search', { city: query.city, hasDates: Boolean(query.start), results: total ?? 0 });
    }
  }, [search.isSuccess, query, total]);

  // infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [search]);

  const center: [number, number] | undefined = items[0] ? [items[0].approxLng, items[0].approxLat] : undefined;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {filters.city ? `Sublets in ${filters.city}${filters.state ? `, ${filters.state}` : ''}` : 'Explore sublets'}
        </h1>
        <p className="text-sm text-stone-500">{total != null ? `${total} place${total === 1 ? '' : 's'}` : ' '}</p>
      </div>
      <Filters value={{ ...filters, q }} onChange={update} hasNear={false} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <section aria-label="Results" aria-busy={search.isFetching}>
          {search.isError && <ErrorNote error={search.error} retry={() => search.refetch()} />}
          {search.isPending ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <ListingCardSkeleton key={i} />)}</div>
          ) : items.length === 0 ? (
            <EmptyState
              title="No places match that"
              body="Try widening your dates, raising the max price, or zooming the map out."
              action={
                <Button variant="secondary" onClick={() => { setBbox(null); setQ(''); setSp(new URLSearchParams(), { replace: true }); }}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className={`grid gap-6 sm:grid-cols-2 xl:grid-cols-3 ${search.isPlaceholderData ? 'opacity-60' : ''}`}>
              {items.map((l) => (
                <ListingCard key={l.id} listing={l} highlighted={hovered === l.id} onHover={setHovered} />
              ))}
            </div>
          )}
          <div ref={sentinel} className="h-10" />
          {search.isFetchingNextPage && <p className="text-center text-sm text-stone-500">Loading more…</p>}
        </section>

        <aside className={`${showMap ? 'fixed inset-0 z-40 bg-white p-3' : 'hidden'} relative lg:sticky lg:top-24 lg:block lg:h-[calc(100vh-8rem)] lg:p-0`}>
          <ListingMap
            className="size-full overflow-hidden rounded-2xl"
            listings={items}
            highlighted={hovered}
            initialCenter={center}
            onMove={setBbox}
            onSelect={(id) => navigate(`/listings/${id}`)}
          />
          {bbox && (
            <button className="absolute top-3 left-3 rounded-full bg-white px-3 py-1.5 text-sm shadow" onClick={() => setBbox(null)}>
              Searching this area · reset
            </button>
          )}
          {showMap && (
            <button className="absolute top-3 right-14 rounded-full bg-stone-900 px-4 py-1.5 text-sm text-white lg:hidden" onClick={() => setShowMap(false)}>
              Show list
            </button>
          )}
        </aside>
      </div>
      <button className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg lg:hidden" onClick={() => setShowMap(true)}>
        Map
      </button>
    </div>
  );
}
