import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { signInInput, type SignInInput } from '@coopswap/shared';
import { useSignIn } from '@/hooks/session';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { ErrorNote } from '@/components/ui/misc';
import { AuthShell } from './AuthShell';

// only allow relative redirects so ?next= can't send people off site
export const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/explore');

export default function SignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const signIn = useSignIn();
  const { register, handleSubmit, formState } = useForm<SignInInput>({ resolver: zodResolver(signInInput) });

  return (
    <AuthShell title="Welcome back" subtitle={<>New here? <Link to="/signup" className="font-medium text-brand-700 hover:underline">Create an account</Link></>}>
      <form className="space-y-4" noValidate onSubmit={handleSubmit((v) => signIn.mutate(v, { onSuccess: () => navigate(safeNext(params.get('next'))) }))}>
        {signIn.error && <ErrorNote error={signIn.error} />}
        <TextField label="Email" type="email" autoComplete="email" error={formState.errors.email?.message} {...register('email')} />
        <TextField label="Password" type="password" autoComplete="current-password" error={formState.errors.password?.message} {...register('password')} />
        <div className="flex items-center justify-between">
          <Link to="/forgot-password" className="text-sm text-stone-600 hover:underline">
            Forgot password?
          </Link>
          <Button type="submit" loading={signIn.isPending}>
            Sign in
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
