import sharp, { type Metadata } from 'sharp';
import { AppError } from '../../lib/errors.js';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['jpeg', 'png', 'webp']);
const MAX_INPUT_PIXELS = 50_000_000; // ~ 8k x 6k

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
}

// We never store what the user uploaded. The bytes are decoded by sharp (so
// the content has to actually be an image, whatever the filename or
// content-type says), auto-rotated, shrunk, and re-encoded as webp. That also
// drops all metadata, including GPS coordinates from phone photos, which
// would otherwise leak the exact address we're careful to hide elsewhere.
export async function processImage(input: Buffer, maxSide = 2000): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new AppError(400, 'bad_request', "that file isn't an image we can read");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) {
    throw new AppError(400, 'bad_request', 'only jpeg, png or webp images');
  }
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) {
    throw new AppError(400, 'bad_request', 'image is too small (min 200x200)');
  }

  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, width: info.width, height: info.height, bytes: info.size };
}
