import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type { SessionUser } from '@coopswap/shared';
import { ToastProvider } from '@/components/ui/Toast';
import { keys } from '@/lib/query';

export function renderWithProviders(ui: ReactElement, { user = null, route = '/' }: { user?: SessionUser | null; route?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(keys.session, user);
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

type Handler = (url: string, init: RequestInit) => { status?: number; body?: unknown } | undefined;

// fake fetch with a tiny router. returns the mock so tests can inspect calls
export function mockApi(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const r = handler(url, init) ?? { status: 404, body: { error: { code: 'not_found', message: `unmocked ${url}` } } };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const testUser: SessionUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'me@northeastern.edu',
  role: 'student',
  emailVerified: true,
  displayName: 'Me',
  universityDomains: ['northeastern.edu'],
};
