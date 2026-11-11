import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { MyProfile } from '@coopswap/shared';
import { useMe, useUpdateSettings } from '@/hooks/data';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/Field';
import { Card, ErrorNote } from '@/components/ui/misc';
import { PageSpinner } from '@/components/ui/Spinner';

type SettingKey = keyof MyProfile['settings'];

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-6 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-stone-500">{hint}</span>
      </span>
      <input type="checkbox" role="switch" className="mt-1 size-5 accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function Settings() {
  const me = useMe();
  const update = useUpdateSettings();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const del = useMutation({
    mutationFn: () => api('/me', { method: 'DELETE', body: { password, confirm } }),
    onSuccess: () => {
      queryClient.clear();
      navigate('/');
    },
  });

  if (me.isPending) return <PageSpinner />;
  if (!me.data) return <div className="p-6"><ErrorNote error={me.error} /></div>;
  const s = me.data.settings;
  const set = (k: SettingKey) => (v: boolean) => update.mutate({ [k]: v });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <h2 className="font-semibold">Account</h2>
        <p className="mt-1 text-sm text-stone-600">Signed in as {me.data.email}</p>
      </Card>
      <Card>
        <h2 className="font-semibold">Email notifications</h2>
        <div className="divide-y divide-stone-100">
          <Toggle label="Booking updates" hint="Requests, approvals, declines and cancellations" checked={s.emailOnBooking} onChange={set('emailOnBooking')} />
          <Toggle label="Unread messages" hint="A nudge if a message sits unread for a few minutes" checked={s.emailOnMessage} onChange={set('emailOnMessage')} />
        </div>
        <p className="mt-2 text-xs text-stone-500">In-app notifications are always on.</p>
      </Card>
      <Card>
        <h2 className="font-semibold">Privacy</h2>
        <div className="divide-y divide-stone-100">
          <Toggle label="Show my school on my profile" hint="Hidden from your public profile when off" checked={s.showSchool} onChange={set('showSchool')} />
          <Toggle label="Opt out of usage analytics" hint="We only count anonymous events (searches, listing views) and never tie them to your account" checked={s.analyticsOptOut} onChange={set('analyticsOptOut')} />
        </div>
      </Card>
      {update.error && <ErrorNote error={update.error} />}
      <Card className="border-red-200">
        <h2 className="font-semibold text-red-700">Delete account</h2>
        <p className="mt-1 text-sm text-stone-600">
          Your listings are taken down, open requests are canceled, and your name, bio and email are wiped. Past messages stay visible to the
          other person as "Deleted user".
        </p>
        <Button variant="danger" size="sm" className="mt-4" onClick={() => setDeleting(true)}>Delete my account</Button>
      </Card>
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete your account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>Cancel</Button>
            <Button variant="danger" disabled={confirm !== 'delete my account' || !password} loading={del.isPending} onClick={() => del.mutate()}>Delete forever</Button>
          </>
        }
      >
        <p>This can't be undone.</p>
        <div className="mt-4 space-y-3">
          <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <TextField label='Type "delete my account"' value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {del.error && <ErrorNote error={del.error} />}
        </div>
      </Dialog>
    </div>
  );
}
