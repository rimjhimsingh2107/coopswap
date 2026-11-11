import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, qs } from '@/lib/api';
import { useDebounced } from '@/hooks/useDebounced';
import { inputClass } from '@/components/ui/Field';

export interface Place {
  label: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
}

interface Props {
  kind: 'city' | 'address';
  label: string;
  placeholder?: string;
  onPick: (p: Place) => void;
  defaultValue?: string;
  hideLabel?: boolean;
  inputClassName?: string;
}

// ARIA combobox: arrow keys move, enter picks, escape closes.
export function PlaceSearch({ kind, label, placeholder, onPick, defaultValue = '', hideLabel, inputClassName }: Props) {
  const [text, setText] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(text.trim(), 300);
  const id = useId();

  const results = useQuery({
    queryKey: ['geocode', kind, q],
    queryFn: () => api<Place[]>(`/geocode${qs({ q, kind })}`),
    enabled: open && q.length >= 3,
    staleTime: Infinity,
  });
  const items = results.data ?? [];

  const pick = (p: Place) => {
    setText(p.label);
    setOpen(false);
    onPick(p);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-sm font-medium text-stone-700'}>
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        className={clsx(inputClass(), inputClassName)}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && items[active]) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && q.length >= 3 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-stone-200 bg-white py-1 text-sm shadow-lg">
          {results.isFetching && !items.length && <li className="px-4 py-2 text-stone-500">Searching…</li>}
          {!results.isFetching && !items.length && <li className="px-4 py-2 text-stone-500">No matches in the US</li>}
          {items.map((p, i) => (
            <li
              key={`${p.lat},${p.lng},${i}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={clsx('cursor-pointer px-4 py-2', i === active ? 'bg-stone-100' : 'hover:bg-stone-50')}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              {p.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
