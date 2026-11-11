import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { addDays, todayIn } from '@coopswap/shared';
import { useCreateListing, useListing, useListingStatus } from '@/hooks/data';
import { ApiRequestError } from '@/lib/api';
import { money, range } from '@/lib/format';
import { listingFormSchema, STEP_FIELDS, toApi, type ListingFormValues } from '@/components/listings/listingForm';
import { AmenityFields, BasicsFields, LocationFields, TermsFields } from '@/components/listings/ListingFields';
import { PhotoManager } from '@/components/listings/PhotoManager';
import { ListingCard } from '@/components/listings/ListingCard';
import { Button } from '@/components/ui/Button';
import { ErrorNote } from '@/components/ui/misc';

const STEPS = ['Basics', 'Location', 'Dates & price', 'Amenities', 'Photos', 'Preview'];

export default function CreateListing() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const create = useCreateListing();
  const draft = useListing(draftId ?? '');
  const status = useListingStatus(draftId ?? '');
  const today = todayIn();

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    mode: 'onTouched',
    defaultValues: {
      roomType: 'private_room',
      furnishing: 'furnished',
      maxOccupants: 1,
      minStayDays: 30,
      utilitiesIncluded: false,
      amenities: [],
      availableFrom: addDays(today, 30),
      availableTo: addDays(today, 30 + 180),
    },
  });

  const next = async () => {
    if (step < 4) {
      const ok = await form.trigger(STEP_FIELDS[step]);
      if (!ok) return;
    }
    if (step === 3 && !draftId) {
      // save as a draft before photos, uploads need a listing to attach to
      await form.handleSubmit((v) =>
        create.mutate(toApi(listingFormSchema.parse(v)), {
          onSuccess: (l) => {
            setDraftId(l.id);
            setStep(4);
          },
          onError: (err) => {
            if (err instanceof ApiRequestError) {
              for (const [path, message] of Object.entries(err.fieldErrors)) form.setError(path as keyof ListingFormValues, { message });
            }
          },
        }),
      )();
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const v = form.watch();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">List your place</h1>
      <ol className="mt-6 flex flex-wrap gap-2 text-xs" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={`rounded-full px-3 py-1 ${i === step ? 'bg-stone-900 text-white' : i < step ? 'bg-brand-50 text-brand-700' : 'bg-stone-100 text-stone-500'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
        {step === 0 && <BasicsFields form={form} />}
        {step === 1 && <LocationFields form={form} />}
        {step === 2 && <TermsFields form={form} />}
        {step === 3 && <AmenityFields form={form} />}
        {step === 4 && draftId && <PhotoManager listingId={draftId} images={draft.data?.images ?? []} />}
        {step === 5 && draft.data && (
          <div className="grid gap-6 sm:grid-cols-[260px_1fr]">
            <ListingCard listing={draft.data} />
            <div className="text-sm text-stone-700">
              <p className="font-medium">{draft.data.title}</p>
              <p className="mt-1">{range(v.availableFrom, v.availableTo)} · {money(Math.round(Number(v.rent) * 100))}/mo</p>
              <p className="mt-3 text-stone-500">
                Publishing makes it searchable. The map shows an approximate area; the exact address is only shared with someone after you approve their stay.
              </p>
              {draft.data.images.length === 0 && <p className="mt-3 text-amber-700">Listings with photos get a lot more interest.</p>}
            </div>
          </div>
        )}
        {create.error && !(create.error instanceof ApiRequestError && create.error.code === 'validation_failed') && <div className="mt-4"><ErrorNote error={create.error} /></div>}
        {status.error && <div className="mt-4"><ErrorNote error={status.error} /></div>}
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" disabled={step === 0 || step === 4} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < 5 ? (
          <Button onClick={next} loading={create.isPending}>
            {step === 3 ? 'Save & add photos' : 'Continue'}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/profile#listings')}>Keep as draft</Button>
            <Button loading={status.isPending} onClick={() => status.mutate('publish', { onSuccess: (l) => navigate(`/listings/${l.id}`) })}>
              Publish
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
