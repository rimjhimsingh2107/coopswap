import { Link } from 'react-router';
import clsx from 'clsx';
import { describeNotification, type AppNotification } from '@coopswap/shared';
import { useMarkAllNotificationsRead, useNotifications } from '@/hooks/data';
import { timeAgo } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorNote } from '@/components/ui/misc';
import { PageSpinner } from '@/components/ui/Spinner';

const hrefFor = (n: AppNotification) =>
  n.payload.conversationId ? `/messages/${n.payload.conversationId}` : n.payload.bookingId ? '/bookings' : n.payload.listingId ? `/listings/${n.payload.listingId}` : '#';

export default function Notifications() {
  const q = useNotifications();
  const readAll = useMarkAllNotificationsRead();
  if (q.isPending) return <PageSpinner />;
  if (q.isError) return <div className="p-6"><ErrorNote error={q.error} /></div>;
  const items = q.data.items;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {items.some((n) => !n.readAt) && <Button variant="ghost" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate()}>Mark all read</Button>}
      </div>
      {items.length === 0 ? (
        <div className="mt-6"><EmptyState title="You're all caught up" /></div>
      ) : (
        <ul className="mt-6 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <Link to={hrefFor(n)} className={clsx('flex items-start gap-3 px-5 py-4 hover:bg-stone-50', !n.readAt && 'bg-brand-50/40')}>
                <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-600')} />
                <span className="flex-1 text-sm">{describeNotification(n)}</span>
                <span className="shrink-0 text-xs text-stone-400">{timeAgo(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
