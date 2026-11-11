import { useMutation } from '@tanstack/react-query';
import { useSession } from '@/hooks/session';
import { api } from '@/lib/api';

export function VerifyBanner() {
  const { user } = useSession();
  const resend = useMutation({ mutationFn: () => api('/auth/verify-email/resend', { method: 'POST' }) });
  if (!user || user.emailVerified) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
      Check {user.email} for a link to confirm your email. You'll need that before listing or booking.{' '}
      <button className="font-medium underline underline-offset-2 disabled:opacity-60" disabled={resend.isPending || resend.isSuccess} onClick={() => resend.mutate()}>
        {resend.isSuccess ? 'Sent!' : 'Resend'}
      </button>
    </div>
  );
}
