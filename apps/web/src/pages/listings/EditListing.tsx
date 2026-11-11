import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useParams } from 'react-router';
import { useListing, useListingStatus, useUpdateListing } from '@/hooks/data';
import { ApiRequestError } from '@/lib/api';
import { fromListing, listingFormSchema, toApi, type ListingFormValues } from '@/components/listings/listingForm';
import { AmenityFields, BasicsFields, LocationFields, TermsFields } from '@/components/listings/ListingFields';
import { PhotoManager } from '@/components/listings/PhotoManager';
import { Button } from '@/components/ui/Button';
import { Card, ErrorNote } from '@/components/ui/misc';
import { PageSpinner } from '@/components/ui/Spinner';

export default function EditListing() {
  const { id = '' } = useParams();
  const listing = useListing(id);
  const update = useUpdateListing(id);
  const status = useListingStatus(id);
  const form = useForm<ListingFormValues>({ resolver: zodResolver(listingFormSchema) });

  useEffect(() => {
    if (listing.data && !form.formState.isDirty) form.reset(fromListing(listing.data));
  }, [listing.data, form]);

  if (listing.isPending) return <PageSpinner />;
  if (!listing.data) return <div className="p-6"><ErrorNote error={listing.error} /></div>;
  const l = listing.data;
  if (!l.isOwner) return <div className="p-6"><ErrorNote error={new Error("You can only edit your own listings.")} /></div>;

  const stale = update.error instanceof ApiRequestError && update.error.status === 409 && update.error.code === 'conflict';

  return (
    <form
      className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6"
      onSubmit={form.handleSubmit((v) => update.mutate({ ...toApi(listingFormSchema.parse(v)), version: l.version }, { onSuccess: (n) => form.reset(fromListing(n)) }))}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Edit listing</h1>
        <Link to={`/listings/${id}`} className="text-sm text-brand-700 hover:underline">View</Link>
      </div>
      {stale && (
        <ErrorNote error={new Error('This listing changed in another tab or by an admin. Reload to get the latest before saving.')} retry={() => { form.reset(); void listing.refetch(); update.reset(); }} />
      )}
      {update.error && !stale && <ErrorNote error={update.error} />}
      {update.isSuccess && !form.formState.isDirty && <p className="text-sm text-emerald-700">Saved.</p>}
      <Card><h2 className="mb-4 font-semibold">Basics</h2><BasicsFields form={form} /></Card>
      <Card><h2 className="mb-4 font-semibold">Location</h2><LocationFields form={form} /></Card>
      <Card><h2 className="mb-4 font-semibold">Dates & price</h2><TermsFields form={form} /></Card>
      <Card><h2 className="mb-4 font-semibold">Amenities</h2><AmenityFields form={form} /></Card>
      <Card><h2 className="mb-4 font-semibold">Photos</h2><PhotoManager listingId={id} images={l.images} /></Card>
      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          {l.status !== 'active' && <Button variant="secondary" loading={status.isPending} onClick={() => status.mutate('publish')}>Publish</Button>}
          {l.status !== 'archived' && <Button variant="ghost" loading={status.isPending} onClick={() => status.mutate('archive')}>Archive</Button>}
        </div>
        <Button type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>Save changes</Button>
      </div>
    </form>
  );
}
