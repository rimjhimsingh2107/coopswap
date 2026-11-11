import type { ReactNode } from 'react';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-stone-600">{subtitle}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}
