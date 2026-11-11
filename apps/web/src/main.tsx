import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { HealthStatus } from '@coopswap/shared';
import { api } from './lib/api';
import './index.css';

const queryClient = new QueryClient();

function Health() {
  const { data, error, isPending } = useQuery({
    queryKey: ['health'],
    queryFn: () => api<HealthStatus>('/readyz'),
  });
  if (isPending) return <p>checking api…</p>;
  if (error) return <p className="text-red-600">api unreachable: {error.message}</p>;
  return <pre className="text-sm">{JSON.stringify(data, null, 2)}</pre>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto max-w-xl p-10">
        <h1 className="text-3xl font-bold text-brand-600">CoopSwap</h1>
        <Health />
      </main>
    </QueryClientProvider>
  </StrictMode>,
);
