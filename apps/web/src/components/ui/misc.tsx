import type { ReactNode } from 'react';
import clsx from 'clsx';

export function Badge({ tone = 'stone', children }: { tone?: 'stone' | 'green' | 'amber' | 'red' | 'brand' | 'blue'; children: ReactNode }) {
  const tones = {
    stone: 'bg-stone-100 text-stone-700',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    red: 'bg-red-50 text-red-700 ring-red-600/20',
    brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
    blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  };
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-transparent ring-inset', tones[tone])}>{children}</span>;
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      {icon && <div className="mb-3 text-stone-400">{icon}</div>}
      <h3 className="text-base font-semibold text-stone-900">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-stone-500">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {msg}
      {retry && (
        <button onClick={retry} className="ml-2 font-medium underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

export function Avatar({ name, url, size = 'md' }: { name: string; url?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-16 text-lg' }[size];
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (url) return <img src={url} alt="" className={clsx(s, 'rounded-full object-cover')} />;
  return (
    <span aria-hidden className={clsx(s, 'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-amber-100 font-semibold text-brand-700')}>
      {initials || '?'}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-2xl border border-stone-200 bg-white p-6 shadow-xs', className)}>{children}</div>;
}
