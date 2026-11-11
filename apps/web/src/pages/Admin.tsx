import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AnalyticsSummary } from '@coopswap/shared';
import { api } from '@/lib/api';
import { useSession } from '@/hooks/session';
import { Card, ErrorNote } from '@/components/ui/misc';
import { PageSpinner } from '@/components/ui/Spinner';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
    </Card>
  );
}

// tiny inline bar chart, not worth a chart library
function Bars({ data }: { data: AnalyticsSummary['daily'] }) {
  const max = Math.max(1, ...data.map((d) => d.searches));
  return (
    <div className="flex h-40 items-end gap-1" role="img" aria-label="Searches per day">
      {data.map((d) => (
        <div key={d.day} className="group relative flex-1">
          <div className="rounded-t bg-brand-500/80" style={{ height: `${(d.searches / max) * 100}%`, minHeight: d.searches ? 2 : 0 }} />
          <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-stone-900 px-1.5 text-[10px] whitespace-nowrap text-white group-hover:block">
            {d.day.slice(5)}: {d.searches}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const { user } = useSession();
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['analytics', days], queryFn: () => api<AnalyticsSummary>(`/admin/analytics?days=${days}`), enabled: user?.role === 'admin' });

  if (user?.role !== 'admin') return <div className="p-6"><ErrorNote error={new Error('Admins only.')} /></div>;
  if (q.isPending) return <PageSpinner />;
  if (q.isError) return <div className="p-6"><ErrorNote error={q.error} /></div>;
  const a = q.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Product analytics</h1>
        <select className="rounded-lg border border-stone-300 px-2 py-1 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time range">
          {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      <p className="text-xs text-stone-500">
        Event counts come from browsers (anonymous, per-tab session ids, opt-outs and Do Not Track excluded). Booking outcomes come from the
        bookings table. In a demo environment these are seeded or test traffic, not real users.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Searches" value={a.totals.searches} />
        <Stat label="Listing views" value={a.totals.listingViews} />
        <Stat label="Search → request" value={pct(a.searchToRequest.rate)} sub={`${a.searchToRequest.sessionsWithRequest} of ${a.searchToRequest.sessionsWithSearch} sessions`} />
        <Stat label="Requests approved" value={pct(a.bookingOutcomes.approvalRate)} sub={`${a.bookingOutcomes.approved} of ${a.bookingOutcomes.requested}`} />
      </div>
      <Card>
        <h2 className="mb-4 font-semibold">Searches per day</h2>
        <Bars data={a.daily} />
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Most viewed listings</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500"><tr><th className="py-1">Listing</th><th className="text-right">Views</th><th className="text-right">Requests</th></tr></thead>
            <tbody>
              {a.topListings.map((l) => (
                <tr key={l.id} className="border-t border-stone-100"><td className="truncate py-1.5 pr-2">{l.title}</td><td className="text-right tabular-nums">{l.views}</td><td className="text-right tabular-nums">{l.requests}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Top searched cities</h2>
          <ul className="space-y-1 text-sm">
            {a.topCities.map((c) => <li key={c.city} className="flex justify-between"><span>{c.city}</span><span className="tabular-nums">{c.searches}</span></li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
