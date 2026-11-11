import type { UseFormReturn } from 'react-hook-form';
import { AMENITIES, AMENITY_LABELS, FURNISHINGS, ROOM_TYPES, ROOM_TYPE_LABELS, type Amenity } from '@coopswap/shared';
import { SelectField, TextArea, TextField } from '@/components/ui/Field';
import { PlaceSearch } from '@/components/PlaceSearch';
import type { ListingFormValues } from './listingForm';

type Form = UseFormReturn<ListingFormValues>;
const FURNISH_LABELS = { furnished: 'Furnished', partially_furnished: 'Partly furnished', unfurnished: 'Unfurnished' };

export function BasicsFields({ form }: { form: Form }) {
  const { register, formState: { errors } } = form;
  return (
    <div className="space-y-4">
      <TextField label="Title" placeholder="Sunny private room 5 min from Ruggles" error={errors.title?.message} {...register('title')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Type" error={errors.roomType?.message} {...register('roomType')}>
          {ROOM_TYPES.map((t) => <option key={t} value={t}>{ROOM_TYPE_LABELS[t]}</option>)}
        </SelectField>
        <SelectField label="Furnishing" error={errors.furnishing?.message} {...register('furnishing')}>
          {FURNISHINGS.map((f) => <option key={f} value={f}>{FURNISH_LABELS[f]}</option>)}
        </SelectField>
        <TextField label="Max people" type="number" min={1} max={10} error={errors.maxOccupants?.message} {...register('maxOccupants')} />
      </div>
      <TextArea
        label="Description"
        rows={6}
        hint="Roommates, commute, what's nearby, house rules. Honest beats glossy."
        error={errors.description?.message}
        {...register('description')}
      />
    </div>
  );
}

export function LocationFields({ form }: { form: Form }) {
  const { register, setValue, watch, formState: { errors } } = form;
  const lat = watch('lat');
  return (
    <div className="space-y-4">
      <PlaceSearch
        kind="address"
        label="Address"
        placeholder="Start typing your street address"
        defaultValue={watch('addressLine1')}
        onPick={(p) => {
          const opts = { shouldValidate: true, shouldDirty: true };
          setValue('addressLine1', p.street ?? p.label, opts);
          if (p.city) setValue('city', p.city, opts);
          if (p.state) setValue('state', p.state, opts);
          if (p.postalCode) setValue('postalCode', p.postalCode, opts);
          setValue('lat', p.lat, opts);
          setValue('lng', p.lng, opts);
        }}
      />
      {(errors.addressLine1 || errors.lat) && <p className="text-xs text-red-600" role="alert">{errors.addressLine1?.message ?? errors.lat?.message}</p>}
      {lat !== undefined && <p className="text-xs text-emerald-700">Located. Only an approximate area (~400m) is shown publicly.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Apt / unit (private)" error={errors.addressLine2?.message} {...register('addressLine2')} />
        <TextField label="Neighborhood (public)" placeholder="Mission Hill" error={errors.neighborhood?.message} {...register('neighborhood')} />
        <TextField label="City" error={errors.city?.message} {...register('city')} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="State" maxLength={2} error={errors.state?.message} {...register('state')} />
          <TextField label="Zip" inputMode="numeric" maxLength={5} error={errors.postalCode?.message} {...register('postalCode')} />
        </div>
      </div>
    </div>
  );
}

export function TermsFields({ form }: { form: Form }) {
  const { register, watch, formState: { errors } } = form;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Available from" type="date" error={errors.availableFrom?.message} {...register('availableFrom')} />
        <TextField label="Available until (move-out day)" type="date" error={errors.availableTo?.message} {...register('availableTo')} />
        <TextField label="Minimum stay (days)" type="number" min={1} error={errors.minStayDays?.message} {...register('minStayDays')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Monthly rent ($)" type="number" min={100} step={10} error={errors.rent?.message} {...register('rent')} />
        <TextField label="Utilities estimate ($/mo)" type="number" min={0} disabled={watch('utilitiesIncluded')} error={errors.utilitiesEst?.message} {...register('utilitiesEst')} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-brand-600" {...register('utilitiesIncluded')} /> Utilities are included in rent
      </label>
      <TextField label="Utilities notes" placeholder="Split 3 ways, internet is $20" error={errors.utilitiesNotes?.message} {...register('utilitiesNotes')} />
    </div>
  );
}

export function AmenityFields({ form }: { form: Form }) {
  const selected = form.watch('amenities');
  const toggle = (a: Amenity) =>
    form.setValue('amenities', selected.includes(a) ? selected.filter((x) => x !== a) : [...selected, a], { shouldDirty: true });
  return (
    <fieldset>
      <legend className="mb-3 text-sm text-stone-600">Pick everything that applies.</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {AMENITIES.map((a) => (
          <label key={a} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${selected.includes(a) ? 'border-brand-500 bg-brand-50' : 'border-stone-200'}`}>
            <input type="checkbox" className="size-4 accent-brand-600" checked={selected.includes(a)} onChange={() => toggle(a)} />
            {AMENITY_LABELS[a]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
