import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AMENITY_LABELS, ROOM_TYPE_LABELS, type Amenity } from '@coopswap/shared';
import { useListing, useStartConversation, useToggleSaved } from '@/hooks/data';
import { useSession } from '@/hooks/session';
import { money, range, shortDate } from '@/lib/format';
import { track } from '@/lib/analytics';
import { Gallery } from '@/components/listings/Gallery';
import { ListingMap } from '@/components/listings/ListingMap';
import { BookingPanel } from '@/components/bookings/BookingPanel';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { Avatar, Badge, ErrorNote } from '@/components/ui/misc';
import { PageSpinner } from '@/components/ui/Spinner';

const FURNISH = { furnished: 'Furnished', partially_furnished: 'Partly furnished', unfurnished: 'Unfurnished' };

export default function ListingDetail() {
  const { id = '' } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const { data: l, isPending, error } = useListing(id);
  const toggleSaved = useToggleSaved();
  const start = useStartConversation();
  const [msgOpen, setMsgOpen] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (l && !l.isOwner) track('listing_view', { listingId: l.id, city: l.city });
  }, [l?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) return <PageSpinner />;
  if (error || !l) return <div className="mx-auto max-w-3xl p-6"><ErrorNote error={error ?? new Error('Not found')} /></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {l.status !== 'active' && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          This listing is <b>{l.status}</b> and only you can see it.
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{l.title}</h1>
          <p className="mt-1 text-stone-600">
            {l.neighborhood ? `${l.neighborhood} · ` : ''}
            {l.city}, {l.state}
          </p>
        </div>
        {user && !l.isOwner && (
          <Button variant="secondary" size="sm" aria-pressed={!!l.saved} onClick={() => toggleSaved.mutate({ id: l.id, saved: !l.saved })}>
            {l.saved ? '♥ Saved' : '♡ Save'}
          </Button>
        )}
      </div>

      <Gallery images={l.images} title={l.title} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <div className="flex flex-wrap gap-2">
            <Badge>{ROOM_TYPE_LABELS[l.roomType]}</Badge>
            <Badge>{FURNISH[l.furnishing]}</Badge>
            <Badge>Up to {l.maxOccupants} {l.maxOccupants === 1 ? 'person' : 'people'}</Badge>
            <Badge>Min stay {l.minStayDays} days</Badge>
          </div>

          <section>
            <h2 className="text-lg font-semibold">About the place</h2>
            <p className="mt-2 whitespace-pre-line text-stone-700">{l.description}</p>
          </section>

          {l.amenities.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold">What's included</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-sm text-stone-700 sm:grid-cols-3">
                {l.amenities.map((a) => (
                  <li key={a} className="flex items-center gap-2">
                    <span className="text-brand-600">✓</span> {AMENITY_LABELS[a as Amenity]}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold">Availability</h2>
            <p className="mt-2 text-sm text-stone-700">
              Open {range(l.availableFrom, l.availableTo)}. Move-out day is free for the next person.
            </p>
            {l.bookedRanges.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-stone-500">
                {l.bookedRanges.map((r) => (
                  <li key={r.start}>Booked {range(r.start, r.end)}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-sm text-stone-600">
              Rent {money(l.monthlyRentCents)}/mo · {l.utilitiesIncluded ? 'utilities included' : 'utilities extra'}
              {l.utilitiesNotes ? ` (${l.utilitiesNotes})` : ''}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Location</h2>
            {l.privateLocation ? (
              <p className="mt-2 text-sm text-stone-700">
                {l.privateLocation.addressLine1}
                {l.privateLocation.addressLine2 ? `, ${l.privateLocation.addressLine2}` : ''}, {l.city}, {l.state} {l.postalCode}
              </p>
            ) : (
              <p className="mt-2 text-sm text-stone-600">The exact address is shared once your stay is approved. The map shows the general area.</p>
            )}
            <ListingMap className="mt-3 h-72 overflow-hidden rounded-2xl" listings={[l]} initialCenter={[l.approxLng, l.approxLat]} />
          </section>

          <section className="flex items-start gap-4 rounded-2xl border border-stone-200 p-5">
            <Avatar name={l.owner.displayName} url={l.owner.avatarUrl} size="lg" />
            <div className="flex-1">
              <Link to={`/users/${l.owner.id}`} className="font-semibold hover:underline">
                {l.owner.displayName}
              </Link>
              <p className="text-sm text-stone-500">
                {l.owner.school ? `${l.owner.school} · ` : ''}on CoopSwap since {shortDate(l.owner.memberSince.slice(0, 10))}
              </p>
              {l.owner.verifiedDomains.map((d) => (
                <span key={d} className="mt-1 mr-1 inline-block">
                  <Badge tone="blue" >Confirmed @{d} email</Badge>
                </span>
              ))}
              {l.owner.bio && <p className="mt-2 text-sm text-stone-700">{l.owner.bio}</p>}
              {user && !l.isOwner && (
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => setMsgOpen(true)}>
                  Message {l.owner.displayName}
                </Button>
              )}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <BookingPanel listing={l} />
        </aside>
      </div>

      <Dialog
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        title={`Message ${l.owner.displayName}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMsgOpen(false)}>Cancel</Button>
            <Button
              loading={start.isPending}
              disabled={!text.trim()}
              onClick={() =>
                start.mutate(
                  { listingId: l.id, body: text.trim() },
                  { onSuccess: (c) => { track('message_start', { listingId: l.id }); navigate(`/messages/${c.id}`); } },
                )
              }
            >
              Send
            </Button>
          </>
        }
      >
        <label className="sr-only" htmlFor="first-msg">Message</label>
        <textarea id="first-msg" className={`${inputClass()} min-h-28`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Hi! I have a co-op near here Jan–Jun. Is the room still free?" />
        {start.error && <div className="mt-2"><ErrorNote error={start.error} /></div>}
      </Dialog>
    </div>
  );
}
