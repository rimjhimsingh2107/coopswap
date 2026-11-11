import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useFeatured } from '@/hooks/data';
import { PlaceSearch, type Place } from '@/components/PlaceSearch';
import { ListingCard, ListingCardSkeleton } from '@/components/listings/ListingCard';
import { Button, ButtonLink } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';

const POPULAR = [
  { city: 'Boston', state: 'MA' },
  { city: 'New York', state: 'NY' },
  { city: 'San Francisco', state: 'CA' },
  { city: 'Seattle', state: 'WA' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Austin', state: 'TX' },
];

export default function Landing() {
  const navigate = useNavigate();
  const featured = useFeatured();
  const [place, setPlace] = useState<Place | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const go = () => {
    const sp = new URLSearchParams();
    if (place?.city) sp.set('city', place.city);
    if (place?.state) sp.set('state', place.state);
    if (start && end) {
      sp.set('start', start);
      sp.set('end', end);
    }
    navigate(`/explore?${sp}`);
  };

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-stone-50">
        <div className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-brand-100/60 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 sm:pt-28">
          <p className="text-sm font-medium tracking-wide text-brand-700">For students heading out on co-op</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-stone-900 sm:text-6xl">
            Your room is empty for six months. Someone else needs one.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-stone-600">
            Sublet your place while you're away, or find one in the city your co-op takes you to, from other students doing the same thing.
          </p>

          <form
            className="mt-10 grid max-w-4xl gap-3 rounded-3xl bg-white p-3 shadow-xl ring-1 ring-stone-200 sm:grid-cols-[1.4fr_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              go();
            }}
          >
            <PlaceSearch kind="city" label="Where's your co-op?" hideLabel placeholder="Where's your co-op? e.g. Seattle" onPick={setPlace} inputClassName="border-0 shadow-none" />
            <label>
              <span className="sr-only">Move in</span>
              <input type="date" aria-label="Move in" className={`${inputClass()} border-0 shadow-none`} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              <span className="sr-only">Move out</span>
              <input type="date" aria-label="Move out" className={`${inputClass()} border-0 shadow-none`} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <Button type="submit" size="lg">
              Search
            </Button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            {POPULAR.map((p) => (
              <Link key={p.city} to={`/explore?city=${encodeURIComponent(p.city)}&state=${p.state}`} className="rounded-full bg-white/80 px-3 py-1 text-stone-700 ring-1 ring-stone-200 hover:ring-stone-400">
                {p.city}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Recently listed</h2>
          <Link to="/explore" className="text-sm font-medium text-brand-700 hover:underline">
            See everything →
          </Link>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featured.isPending
            ? Array.from({ length: 4 }, (_, i) => <ListingCardSkeleton key={i} />)
            : featured.data?.length
              ? featured.data.map((l) => <ListingCard key={l.id} listing={l} />)
              : <p className="text-sm text-stone-500 sm:col-span-4">Nothing listed yet. Be the first.</p>}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              ['List or search', 'Post your place with dates and photos, or search where your co-op is by date, budget and room type.'],
              ['Talk it through', 'Message the other student. Ask about roommates, the commute, the landlord, whatever matters to you.'],
              ['Request and confirm', "Send a booking request for your dates. The owner approves one, and the calendar can't double book."],
            ].map(([t, b], i) => (
              <div key={t} className="rounded-2xl border border-stone-200 p-6">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-1.5 text-sm text-stone-600">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-10 rounded-3xl bg-stone-900 p-10 text-stone-100 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">Trust and safety, honestly</h2>
            <p className="mt-3 text-stone-300">
              CoopSwap helps students find each other. It doesn't inspect apartments, check leases or handle rent, so here's what we do and
              don't do.
            </p>
            <ButtonLink to="/signup" className="mt-6" variant="secondary">
              Get started
            </ButtonLink>
          </div>
          <ul className="space-y-4 text-sm">
            <li>
              <b className="text-white">Verified email ≠ verified person.</b> A university badge means someone clicked a link sent to that
              address. That's all.
            </li>
            <li>
              <b className="text-white">Exact addresses stay private.</b> Maps show an approximate area until an owner approves your stay.
            </li>
            <li>
              <b className="text-white">No payments here.</b> A booking is an agreement to move forward, not a lease. Check your lease allows
              subletting and put the terms in writing.
            </li>
            <li>
              <b className="text-white">Never pay before you've seen the place</b> (in person or on a live video call), and be wary of anyone
              in a hurry to get a deposit.
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
