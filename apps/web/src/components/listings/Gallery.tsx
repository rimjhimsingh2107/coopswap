import { useState } from 'react';
import type { ListingImage } from '@coopswap/shared';
import { Dialog } from '@/components/ui/Dialog';

export function Gallery({ images, title }: { images: ListingImage[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) {
    return <div className="flex aspect-[16/7] items-center justify-center rounded-3xl bg-stone-100 text-sm text-stone-400">No photos yet</div>;
  }
  const [first, ...rest] = images;
  return (
    <>
      <div className="grid aspect-[16/7] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-3xl">
        <button className="col-span-4 row-span-2 sm:col-span-2" onClick={() => setOpen(0)} aria-label="Open photo 1">
          <img src={first!.url} alt={`${title}, photo 1`} className="size-full object-cover hover:brightness-95" />
        </button>
        {rest.slice(0, 4).map((img, i) => (
          <button key={img.id} className="hidden sm:block" onClick={() => setOpen(i + 1)} aria-label={`Open photo ${i + 2}`}>
            <img src={img.url} alt={`${title}, photo ${i + 2}`} loading="lazy" className="size-full object-cover hover:brightness-95" />
          </button>
        ))}
      </div>
      <Dialog open={open !== null} onClose={() => setOpen(null)} title={`Photo ${(open ?? 0) + 1} of ${images.length}`}>
        {open !== null && (
          <div>
            <img src={images[open]!.url} alt="" className="max-h-[70vh] w-full rounded-xl object-contain" />
            <div className="mt-3 flex justify-between">
              <button className="text-sm font-medium disabled:opacity-40" disabled={open === 0} onClick={() => setOpen(open - 1)}>
                ← Prev
              </button>
              <button className="text-sm font-medium disabled:opacity-40" disabled={open === images.length - 1} onClick={() => setOpen(open + 1)}>
                Next →
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
