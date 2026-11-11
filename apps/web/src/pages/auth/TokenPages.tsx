import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { forgotPasswordInput, passwordSchema } from '@coopswap/shared';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { ErrorNote } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/Spinner';
import { AuthShell } from './AuthShell';

// verify-email and verify-university both redeem a token from the url once
function useRedeem(path: string) {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const token = params.get('token') ?? '';
  const m = useMutation({
    mutationFn: () => api(path, { method: 'POST', body: { token } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.session });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
  const fired = useRef(false);
  useEffect(() => {
    // strict mode runs effects twice; tokens are single use
    if (fired.current || !token) return;
    fired.current = true;
    m.mutate();
  }, [token, m]);
  return { m, token };
}

function RedeemResult({ path, title, done }: { path: string; title: string; done: string }) {
  const { m, token } = useRedeem(path);
  return (
    <AuthShell title={title}>
      {!token && <ErrorNote error={new Error('This link is missing its token.')} />}
      {m.isPending && token && (
        <p className="flex items-center gap-2 text-sm text-stone-600">
          <Spinner className="size-4" /> Checking your link…
        </p>
      )}
      {m.isError && <ErrorNote error={m.error} />}
      {m.isSuccess && (
        <div className="space-y-4">
          <p className="text-sm text-stone-700">{done}</p>
          <Link to="/explore" className="text-sm font-medium text-brand-700 hover:underline">
            Start exploring →
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

export const VerifyEmail = () => <RedeemResult path="/auth/verify-email" title="Confirming your email" done="Your email is confirmed. You can now list a place and request bookings." />;
export const VerifyUniversity = () => <RedeemResult path="/auth/university/confirm" title="Linking your university email" done="Done. Your profile now shows that you've confirmed a university address." />;

export function ForgotPassword() {
  const send = useMutation({ mutationFn: (v: { email: string }) => api('/auth/forgot-password', { method: 'POST', body: v }) });
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(forgotPasswordInput) });
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link if there's an account for that address.">
      {send.isSuccess ? (
        <p className="text-sm text-stone-700">If that email has an account, a reset link is on its way. It expires in 30 minutes.</p>
      ) : (
        <form className="space-y-4" noValidate onSubmit={handleSubmit((v) => send.mutate(v))}>
          {send.error && <ErrorNote error={send.error} />}
          <TextField label="Email" type="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
          <Button type="submit" loading={send.isPending}>
            Send link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

const resetForm = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: "passwords don't match" });

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reset = useMutation({ mutationFn: (password: string) => api('/auth/reset-password', { method: 'POST', body: { token: params.get('token'), password } }) });
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(resetForm) });
  return (
    <AuthShell title="Choose a new password" subtitle="This signs you out everywhere else.">
      <form className="space-y-4" noValidate onSubmit={handleSubmit((v) => reset.mutate(v.password, { onSuccess: () => navigate('/signin') }))}>
        {reset.error && <ErrorNote error={reset.error} />}
        <TextField label="New password" type="password" autoComplete="new-password" error={formState.errors.password?.message} {...register('password')} />
        <TextField label="Confirm it" type="password" autoComplete="new-password" error={formState.errors.confirm?.message} {...register('confirm')} />
        <Button type="submit" loading={reset.isPending}>
          Save password
        </Button>
      </form>
    </AuthShell>
  );
}
