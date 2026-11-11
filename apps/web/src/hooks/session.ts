import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionUser, SignInInput, SignUpInput } from '@coopswap/shared';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';

export function useSession() {
  const q = useQuery({ queryKey: keys.session, queryFn: () => api<SessionUser | null>('/auth/session'), staleTime: 5 * 60_000 });
  return { user: q.data ?? null, isLoading: q.isPending };
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) => api('/auth/signin', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSignUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignUpInput) => api('/auth/signup', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/signout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(keys.session, null);
    },
  });
}
