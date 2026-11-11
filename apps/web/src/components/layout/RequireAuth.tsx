import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '@/hooks/session';
import { PageSpinner } from '@/components/ui/Spinner';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const loc = useLocation();
  if (isLoading) return <PageSpinner />;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}
