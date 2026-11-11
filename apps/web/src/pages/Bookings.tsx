import { useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import type { Booking, BookingStatus } from '@coopswap/shared';
import { useBookingAction, useBookings } from '@/hooks/data';
import { ApiRequestError } from '@/lib/api';
import { money, range, timeAgo } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { inputClass } from '@/components/ui/Field';
import { Badge, EmptyState, ErrorNote } from '@/components/ui/misc';
import { PageSpinner } from '@/components/ui/Spinner';

const STATUS_TONE: Record<BookingStatus, 'amber' | 'green' | 'red' | 'stone'> = {
  requested: 'amber',
  approved: 'green',
  rejected: 'red',
  canceled: 'stone',
  expired: 'stone',
};
const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: 'Pending',
  approved: 'Approved',
  rejected: 'Declined',
  canceled: 'Canceled',
  expired: 'Expired',
};

type Action = 'approve' | 'reject' | 'cancel';

function BookingRow({ b, onAct }: { b: Booking; onAct: (b: Booking, a: Action) => void }) {
  const other = b.viewerRole === 'owner' ? b.guest : b.owner;
  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center">
      <Link to={`/listings/${b.listingId}`} className="shrink-0">
        {b.listing.coverUrl ? (
          <img src={b.listing.coverUrl} alt="" className="h-20 w-28 rounded-xl object-cover" />
        ) : (
          <div className="h-20 w-28 rounded-xl bg-stone-100" />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/listings/${b.listingId}`} className="truncate font-medium hover:underline">{b.listing.title}</Link>
          <Badge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
        </div>
        <p className="text-sm text-stone-600">
          {range(b.startDate, b.endDate)} · {b.nights} nights · {b.occupants} {b.occupants === 1 ? 'person' : 'people'} · {money(b.monthlyRentCents)}/mo
        </p>
        <p className="text-xs text-stone-500">
          {b.viewerRole === 'owner' ? 'From' : 'Host'} {other.displayName} · requested {timeAgo(b.createdAt)}
          {b.status === 'requested' && ` · expires ${new Date(b.expiresAt).toLocaleDateString()}`}
        </p>
        {b.message && <p className="mt-1 line-clamp-2 text-sm text-stone-700">“{b.message}”</p>}
        {b.statusReason && <p className="mt-1 text-xs text-stone-500">{b.statusReason}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        {b.actions.includes('approved') && <Button size="sm" onClick={() => onAct(b, 'approve')}>Approve</Button>}
        {b.actions.includes('rejected') && <Button size="sm" variant="secondary" onClick={() => onAct(b, 'reject')}>Decline</Button>}
        {b.actions.includes('canceled') && <Button size="sm" variant="ghost" onClick={() => onAct(b, 'cancel')}>{b.status === 'requested' ? 'Withdraw' : 'Cancel'}</Button>}
      </div>
    </li>
  );
}

const COPY: Record<Action, { title: string; body: string; cta: string }> = {
  approve: { title: 'Approve this stay?', body: 'Approving books these dates. Any other pending requests that overlap get declined automatically, and the guest will see your exact address.', cta: 'Approve' },
  reject: { title: 'Decline this request?', body: "They'll be notified. You can add a short reason.", cta: 'Decline' },
  cancel: { title: 'Cancel?', body: 'The other person is notified and the dates open up again.', cta: 'Yes, cancel' },
};

export default function Bookings() {
  const [role, setRole] = useState<'guest' | 'owner'>('guest');
  const [tab, setTab] = useState<'open' | 'history'>('open');
  const list = useBookings(role);
  const act = useBookingAction();
  const [pending, setPending] = useState<{ b: Booking; a: Action; key: string } | null>(null);
  const [reason, setReason] = useState('');

  const items = (list.data ?? []).filter((b) => (tab === 'open' ? b.status === 'requested' || (b.status === 'approved' && b.endDate >= new Date().toISOString().slice(0, 10)) : true));
  const conflict = act.error instanceof ApiRequestError && act.error.code === 'booking_conflict';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-stone-100 p-1 text-sm" role="tablist">
          {(['guest', 'owner'] as const).map((r) => (
            <button key={r} role="tab" aria-selected={role === r} className={clsx('rounded-full px-4 py-1.5', role === r ? 'bg-white shadow-sm' : 'text-stone-600')} onClick={() => setRole(r)}>
              {r === 'guest' ? 'My trips' : 'Requests for my places'}
            </button>
          ))}
        </div>
        <div className="inline-flex gap-1 text-sm">
          {(['open', 'history'] as const).map((t) => (
            <button key={t} aria-pressed={tab === t} className={clsx('rounded-full px-3 py-1', tab === t ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100')} onClick={() => setTab(t)}>
              {t === 'open' ? 'Pending & upcoming' : 'Everything'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {list.isPending ? (
          <PageSpinner />
        ) : list.isError ? (
          <ErrorNote error={list.error} retry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title="Nothing here yet" body={role === 'guest' ? 'Requests you send show up here.' : 'When someone requests one of your places it shows up here.'} />
        ) : (
          <ul className="space-y-3">
            {items.map((b) => (
              <BookingRow key={b.id} b={b} onAct={(bk, a) => { setReason(''); act.reset(); setPending({ b: bk, a, key: crypto.randomUUID() }); }} />
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? COPY[pending.a].title : ''}
        footer={
          pending && (
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>Never mind</Button>
              <Button
                variant={pending.a === 'approve' ? 'primary' : 'danger'}
                loading={act.isPending}
                // same key for retries of this one decision
                onClick={() => act.mutate({ id: pending.b.id, action: pending.a, reason: reason || undefined, key: pending.key }, { onSuccess: () => setPending(null) })}
              >
                {COPY[pending.a].cta}
              </Button>
            </>
          )
        }
      >
        {pending && (
          <>
            <p>{COPY[pending.a].body}</p>
            {pending.a !== 'approve' && (
              <textarea aria-label="Reason (optional)" className={`${inputClass()} mt-3 min-h-20`} maxLength={300} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
            {conflict && <p className="mt-3 text-red-600" role="alert">Another stay was approved for overlapping dates, so this one can't be.</p>}
            {act.error && !conflict && <div className="mt-3"><ErrorNote error={act.error} /></div>}
          </>
        )}
      </Dialog>
    </div>
  );
}

