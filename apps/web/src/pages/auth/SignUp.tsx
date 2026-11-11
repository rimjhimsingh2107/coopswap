import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { signUpInput, type SignUpInput } from '@coopswap/shared';
import { useSignUp } from '@/hooks/session';
import { ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { ErrorNote } from '@/components/ui/misc';
import { AuthShell } from './AuthShell';

export default function SignUp() {
  const navigate = useNavigate();
  const signUp = useSignUp();
  const { register, handleSubmit, formState, setError } = useForm<SignUpInput>({ resolver: zodResolver(signUpInput) });

  const onSubmit = handleSubmit((v) =>
    signUp.mutate(v, {
      onSuccess: () => navigate('/explore?welcome=1'),
      onError: (err) => {
        if (err instanceof ApiRequestError) {
          for (const [path, message] of Object.entries(err.fieldErrors)) setError(path as keyof SignUpInput, { message });
        }
      },
    }),
  );

  return (
    <AuthShell
      title="Create your account"
      subtitle={<>Already have one? <Link to="/signin" className="font-medium text-brand-700 hover:underline">Sign in</Link></>}
    >
      <form className="space-y-4" noValidate onSubmit={onSubmit}>
        {signUp.error && !(signUp.error instanceof ApiRequestError && signUp.error.code === 'validation_failed') && <ErrorNote error={signUp.error} />}
        <TextField label="Your name" autoComplete="name" hint="First name is fine. This is what others see." error={formState.errors.displayName?.message} {...register('displayName')} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          hint="Using your @northeastern.edu address gets you a verified-email badge once you confirm it."
          error={formState.errors.email?.message}
          {...register('email')}
        />
        <TextField label="Password" type="password" autoComplete="new-password" hint="10+ characters. A short sentence works well." error={formState.errors.password?.message} {...register('password')} />
        <Button type="submit" className="w-full" loading={signUp.isPending}>
          Create account
        </Button>
        <p className="text-xs text-stone-500">
          We'll send a link to confirm your email. A verified university email only shows you can read mail at that address, it doesn't
          mean CoopSwap has checked who you are.
        </p>
      </form>
    </AuthShell>
  );
}
