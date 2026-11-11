import { AMENITY_LABELS, LISTING_SORTS, ROOM_TYPES, ROOM_TYPE_LABELS, type Amenity, type ListingSort, type RoomType } from '@coopswap/shared';
import clsx from 'clsx';
import { inputClass } from '@/components/ui/Field';

export interface FilterState {
  q: string;
  city: string;
  state: string;
  start: string;
  end: string;
  minPrice: string;
  maxPrice: string;
  roomTypes: RoomType[];
  amenities: Amenity[];
  sort: ListingSort;
}

const SORT_LABELS: Record<ListingSort, string> = {
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  soonest: 'Available soonest',
  distance: 'Closest',
};

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500')}
    >
      {children}
    </button>
  );
}

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

export function Filters({ value, onChange, hasNear }: { value: FilterState; onChange: (patch: Partial<FilterState>) => void; hasNear: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1">
          <span className="sr-only">Search</span>
          <input className={inputClass()} placeholder="Search: near ruggles, furnished, quiet…" value={value.q} onChange={(e) => onChange({ q: e.target.value })} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-stone-500">Move in</span>
          <input type="date" className={inputClass()} value={value.start} onChange={(e) => onChange({ start: e.target.value })} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-stone-500">Move out</span>
          <input type="date" className={inputClass()} value={value.end} min={value.start || undefined} onChange={(e) => onChange({ end: e.target.value })} />
        </label>
        <label className="w-28">
          <span className="mb-1 block text-xs text-stone-500">Min $/mo</span>
          <input inputMode="numeric" className={inputClass()} value={value.minPrice} onChange={(e) => onChange({ minPrice: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label className="w-28">
          <span className="mb-1 block text-xs text-stone-500">Max $/mo</span>
          <input inputMode="numeric" className={inputClass()} value={value.maxPrice} onChange={(e) => onChange({ maxPrice: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-stone-500">Sort</span>
          <select className={inputClass()} value={value.sort} onChange={(e) => onChange({ sort: e.target.value as ListingSort })}>
            {LISTING_SORTS.filter((s) => s !== 'distance' || hasNear).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Room type">
        {ROOM_TYPES.map((t) => (
          <Chip key={t} on={value.roomTypes.includes(t)} onClick={() => onChange({ roomTypes: toggle(value.roomTypes, t) })}>
            {ROOM_TYPE_LABELS[t]}
          </Chip>
        ))}
        <span className="mx-1 w-px self-stretch bg-stone-200" />
        {(['wifi', 'in_unit_laundry', 'air_conditioning', 'near_transit', 'private_bathroom', 'pets_allowed'] as const).map((a) => (
          <Chip key={a} on={value.amenities.includes(a)} onClick={() => onChange({ amenities: toggle(value.amenities, a) })}>
            {AMENITY_LABELS[a]}
          </Chip>
        ))}
      </div>
    </div>
  );
}

