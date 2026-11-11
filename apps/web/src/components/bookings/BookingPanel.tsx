import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { daysBetween, rangesOverlap, todayIn, type ListingDetail } from '@coopswap/shared';
import { useRequestBooking } from '@/hooks/data';
import { useSession } from '@/hooks/session';
import { ApiRequestError } from '@/lib/api';
import { money, range } from '@/lib/format';
import { track } from '@/lib/analytics';
import { Button, ButtonLink } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { ErrorNote } from '@/components/ui/misc';

export function BookingPanel({ listing }: { listing: ListingDetail }) {
  const { user } = useSession();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [occupants, setOccupants] = useState(1);
  const [message, setMessage] = useState('');
  // one key per attempt: a double click or a retry after a timeout reuses it,
  // changing the dates makes a new one
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());
  const request = useRequestBooking();
  const today = todayIn();

  const problem = useMemo(() => {
    if (!start || !end) return null;
    if (end <= start) return 'Move-out has to be after move-in';
    if (start < today) return 'Move-in is in the past';
    if (start < listing.availableFrom || end > listing.availableTo) return `Only available ${range(listing.availableFrom, listing.availableTo)}`;
    if (daysBetween(start, end) < listing.minStayDays) return `Minimum stay is ${listing.minStayDays} days`;
    const clash = listing.bookedRanges.find((r) => rangesOverlap(r, { start, end }));
    if (clash) return `Already booked ${range(clash.start, clash.end)}`;
    return null;
  }, [start, end, today, listing]);

  if (listing.isOwner) {
    return (
      <div className="rounded-2xl border border-stone-200 p-5 text-sm">
        <p className="font-medium">This is your listing.</p>
        <Link to={`/listings/${listing.id}/edit`} className="mt-2 inline-block text-brand-700 hover:underline">
          Edit listing
        </Link>
      </div>
    );
  }

  if (request.isSuccess) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-semibold">Request sent</p>
        <p className="mt-1">
          {listing.owner.displayName} has until {new Date(request.data.expiresAt).toLocaleString()} to respond. You'll get a notification either way.
        </p>
        <ButtonLink to="/bookings" variant="secondary" size="sm" className="mt-3">
          View my requests
        </ButtonLink>
      </div>
    );
  }

  const nights = start && end && end > start ? daysBetween(start, end) : 0;
  const err = request.error instanceof ApiRequestError ? request.error : null;

  return (
    <form
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!user || problem || !nights) return;
        request.mutate(
          { input: { listingId: listing.id, startDate: start, endDate: end, occupants, message: message || undefined }, key: attempt },
          { onSuccess: () => track('booking_request', { listingId: listing.id, nights }) },
        );
      }}
    >
      <p>
        <span className="text-2xl font-semibold">{money(listing.monthlyRentCents)}</span>
        <span className="text-stone-500"> / month</span>
      </p>
      <p className="text-xs text-stone-500">{listing.utilitiesIncluded ? 'Utilities included' : listing.utilitiesEstCents ? `+ about ${money(listing.utilitiesEstCents)} utilities` : 'Utilities extra'}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="text-xs text-stone-500">
          Move in
          <input type="date" className={inputClass()} min={listing.availableFrom > today ? listing.availableFrom : today} max={listing.availableTo} value={start} onChange={(e) => { setStart(e.target.value); setAttempt(crypto.randomUUID()); request.reset(); }} />
        </label>
        <label className="text-xs text-stone-500">
          Move out
          <input type="date" className={inputClass()} min={start || listing.availableFrom} max={listing.availableTo} value={end} onChange={(e) => { setEnd(e.target.value); setAttempt(crypto.randomUUID()); request.reset(); }} />
        </label>
        <label className="col-span-2 text-xs text-stone-500">
          People
          <select className={inputClass()} value={occupants} onChange={(e) => setOccupants(Number(e.target.value))}>
            {Array.from({ length: listing.maxOccupants }, (_, i) => (
              <option key={i} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 text-xs text-stone-500">
          Note to {listing.owner.displayName} (optional)
          <textarea className={`${inputClass()} min-h-20`} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Where's your co-op? Anything they should know?" />
        </label>
      </div>

      {problem && <p className="mt-3 text-sm text-red-600" role="alert">{problem}</p>}
      {err?.code === 'booking_conflict' && (
        <p className="mt-3 text-sm text-red-600" role="alert">Someone else just got those dates. Try different ones.</p>
      )}
      {request.error && err?.code !== 'booking_conflict' && <div className="mt-3"><ErrorNote error={request.error} /></div>}

      {nights > 0 && !problem && <p className="mt-3 text-sm text-stone-600">{nights} nights · about {money(Math.round((listing.monthlyRentCents * nights) / 30))} total</p>}

      {user ? (
        <Button type="submit" className="mt-4 w-full" disabled={!nights || !!problem || !user.emailVerified} loading={request.isPending}>
          Request to book
        </Button>
      ) : (
        <ButtonLink to={`/signin?next=/listings/${listing.id}`} className="mt-4 w-full">
          Sign in to request
        </ButtonLink>
      )}
      {user && !user.emailVerified && <p className="mt-2 text-xs text-amber-700">Confirm your email to send requests.</p>}
      <p className="mt-3 text-xs text-stone-500">Requesting doesn't charge anything or sign a lease. The owner approves or declines.</p>
    </form>
  );
}
