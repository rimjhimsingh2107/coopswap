import { useRef, useState } from 'react';
import type { ListingImage } from '@coopswap/shared';
import { useDeleteImage, useReorderImages, useUploadImages } from '@/hooks/data';
import { Button } from '@/components/ui/Button';
import { ErrorNote } from '@/components/ui/misc';

const MAX_MB = 8;

export function PhotoManager({ listingId, images }: { listingId: string; images: ListingImage[] }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadImages(listingId);
  const remove = useDeleteImage(listingId);
  const reorder = useReorderImages(listingId);
  const [localError, setLocalError] = useState<string | null>(null);

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    const bad = list.find((f) => !/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > MAX_MB * 1024 * 1024);
    if (bad) {
      setLocalError(`${bad.name}: jpeg, png or webp under ${MAX_MB}MB please`);
      return;
    }
    setLocalError(null);
    upload.mutate(list.slice(0, 10));
  };

  const move = (i: number, dir: -1 | 1) => {
    const ids = images.map((x) => x.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };

  return (
    <div>
      <div
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-white px-6 py-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
      >
        <p className="text-sm text-stone-600">Drag photos here, or</p>
        <Button variant="secondary" size="sm" className="mt-2" loading={upload.isPending} onClick={() => input.current?.click()}>
          Choose photos
        </Button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <p className="mt-2 text-xs text-stone-500">Up to 20. Location data in the files is removed when we process them.</p>
      </div>
      {(localError || upload.error) && <div className="mt-3"><ErrorNote error={upload.error ?? new Error(localError!)} /></div>}
      {images.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="group relative overflow-hidden rounded-xl">
              <img src={img.url} alt={`Photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
              {i === 0 && <span className="absolute top-2 left-2 rounded-full bg-white/90 px-2 text-xs font-medium">Cover</span>}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 p-2 text-xs text-white">
                <span className="flex gap-1">
                  <button aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} className="rounded bg-black/40 px-1.5 disabled:opacity-30">←</button>
                  <button aria-label="Move later" disabled={i === images.length - 1} onClick={() => move(i, 1)} className="rounded bg-black/40 px-1.5 disabled:opacity-30">→</button>
                </span>
                <button onClick={() => remove.mutate(img.id)} className="rounded bg-black/40 px-1.5">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
