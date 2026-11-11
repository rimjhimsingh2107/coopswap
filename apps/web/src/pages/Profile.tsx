import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { updateProfileInput, universityEmailInput, type UpdateProfileInput } from '@coopswap/shared';
import { useMe, useMyListings, usePublicProfile, useSaved, useUpdateProfile } from '@/hooks/data';
import { api } from '@/lib/api';
import { keys } from '@/lib/query';
import { shortDate } from '@/lib/format';
import { ListingCard } from '@/components/listings/ListingCard';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TextArea, TextField } from '@/components/ui/Field';
import { Avatar, Badge, Card, EmptyState, ErrorNote } from '@/components/ui/misc';
import { PageSpinner } from '@/components/ui/Spinner';

function UniversityLink() {
  const form = useForm<{ email: string }>({ resolver: zodResolver(universityEmailInput) });
  const send = useMutation({ mutationFn: (v: { email: string }) => api('/auth/university', { method: 'POST', body: v }) });
  if (send.isSuccess) return <p className="text-sm text-stone-700">Check that inbox for a confirmation link.</p>;
  return (
    <form className="flex items-end gap-2" onSubmit={form.handleSubmit((v) => send.mutate(v))}>
      <TextField wrapperClassName="flex-1" label="Link a university email" placeholder="you@northeastern.edu" error={form.formState.errors.email?.message ?? send.error?.message} {...form.register('email')} />
      <Button type="submit" variant="secondary" loading={send.isPending}>Send link</Button>
    </form>
  );
}

function AvatarUpload({ name, url }: { name: string; url: string | null }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const up = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append('avatar', f);
      return api('/me/avatar', { method: 'POST', body: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} url={url} size="lg" />
      <Button variant="secondary" size="sm" loading={up.isPending} onClick={() => input.current?.click()}>Change photo</Button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && up.mutate(e.target.files[0])} />
      {up.error && <span className="text-xs text-red-600">{up.error.message}</span>}
    </div>
  );
}

export default function Profile() {
  const me = useMe();
  const mine = useMyListings();
  const saved = useSaved();
  const update = useUpdateProfile();
  const form = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileInput) });

  useEffect(() => {
    if (me.data) form.reset({ displayName: me.data.displayName, bio: me.data.bio, school: me.data.school ?? '' });
  }, [me.data, form]);

  if (me.isPending) return <PageSpinner />;
  if (!me.data) return <div className="p-6"><ErrorNote error={me.error} /></div>;
  const p = me.data;

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6">
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <Card>
          <h1 className="text-xl font-semibold">Your profile</h1>
          <p className="text-sm text-stone-500">What people see when they look at your listing or your request.</p>
          <div className="mt-5"><AvatarUpload name={p.displayName} url={p.avatarUrl} /></div>
          <form className="mt-5 space-y-4" onSubmit={form.handleSubmit((v) => update.mutate({ ...v, school: v.school || null }))}>
            <TextField label="Name" error={form.formState.errors.displayName?.message} {...form.register('displayName')} />
            <TextField label="School / program" placeholder="Northeastern, CS + Design" {...form.register('school')} />
            <TextArea label="About you" placeholder="Where you're from, where your co-op is, what you're like as a roommate" {...form.register('bio')} />
            <div className="flex items-center gap-3">
              <Button type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>Save</Button>
              {update.isSuccess && !form.formState.isDirty && <span className="text-sm text-emerald-700">Saved</span>}
            </div>
          </form>
        </Card>
        <Card>
          <h2 className="font-semibold">Verification</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span>Account email</span>
              {p.emailVerified ? <Badge tone="green">Confirmed</Badge> : <Badge tone="amber">Not confirmed</Badge>}
            </li>
            {p.verifiedDomains.map((d) => (
              <li key={d} className="flex items-center justify-between">
                <span>@{d}</span>
                <Badge tone="blue">Confirmed</Badge>
              </li>
            ))}
          </ul>
          {p.verifiedDomains.length === 0 && <div className="mt-4"><UniversityLink /></div>}
          <p className="mt-4 text-xs text-stone-500">
            Confirmed just means you clicked a link sent to that address. It isn't an ID check or endorsement by your school.
          </p>
        </Card>
      </div>

      <section id="listings">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your listings</h2>
          <ButtonLink to="/listings/new" size="sm">New listing</ButtonLink>
        </div>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {mine.data?.length ? (
            mine.data.map((l) => (
              <div key={l.id}>
                <ListingCard listing={l} />
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <Badge tone={l.status === 'active' ? 'green' : 'stone'}>{l.status}</Badge>
                  <Link to={`/listings/${l.id}/edit`} className="text-brand-700 hover:underline">Edit</Link>
                </div>
              </div>
            ))
          ) : (
            <div className="sm:col-span-4"><EmptyState title="No listings" body="Heading out on co-op? List your room." /></div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Saved</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {saved.data?.length ? saved.data.map((l) => <ListingCard key={l.id} listing={l} />) : <p className="text-sm text-stone-500">Nothing saved yet.</p>}
        </div>
      </section>
    </div>
  );
}

export function PublicProfile() {
  const { id = '' } = useParams();
  const p = usePublicProfile(id);
  if (p.isPending) return <PageSpinner />;
  if (!p.data) return <div className="p-6"><ErrorNote error={p.error} /></div>;
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center gap-4">
        <Avatar name={p.data.displayName} url={p.data.avatarUrl} size="lg" />
        <div>
          <h1 className="text-xl font-semibold">{p.data.displayName}</h1>
          <p className="text-sm text-stone-500">{p.data.school ? `${p.data.school} · ` : ''}joined {shortDate(p.data.memberSince.slice(0, 10))}</p>
          <div className="mt-1 flex gap-1">{p.data.verifiedDomains.map((d) => <Badge key={d} tone="blue">Confirmed @{d} email</Badge>)}</div>
        </div>
      </div>
      {p.data.bio && <p className="mt-6 whitespace-pre-line text-stone-700">{p.data.bio}</p>}
    </div>
  );
}
