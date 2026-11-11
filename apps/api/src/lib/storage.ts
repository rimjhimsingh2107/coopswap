import { createHmac } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { safeEqual } from './crypto.js';

// Images are private. Clients only ever get short lived signed URLs.
// Locally we write to disk and sign URLs ourselves; in prod it's an S3 bucket
// with public access blocked.

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  signedUrl(key: string, ttlSec?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

const KEY_RE = /^[a-z0-9/_-]+\.webp$/;
const DEFAULT_TTL = 60 * 60;

class LocalStorage implements Storage {
  private root = path.resolve(env.STORAGE_DIR);

  private file(key: string) {
    if (!KEY_RE.test(key)) throw new Error('bad storage key');
    return path.join(this.root, key);
  }

  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }

  async signedUrl(key: string, ttlSec = DEFAULT_TTL) {
    // round expiry to the hour-ish so the same image gets the same url for a
    // while and the browser cache actually works
    const exp = Math.ceil((Date.now() / 1000 + ttlSec) / 600) * 600;
    return `/api/files/${key}?exp=${exp}&sig=${signLocal(key, exp)}`;
  }

  async read(key: string) {
    return readFile(this.file(key));
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}

class S3Storage implements Storage {
  private client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: 'private, max-age=86400' }),
    );
  }

  signedUrl(key: string, ttlSec = DEFAULT_TTL) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: ttlSec });
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
}

export function signLocal(key: string, exp: number) {
  return createHmac('sha256', env.SESSION_SECRET).update(`file:${key}:${exp}`).digest('base64url');
}

export function verifyLocal(key: string, exp: number, sig: string) {
  return exp * 1000 > Date.now() && safeEqual(signLocal(key, exp), sig);
}

export const localStorage = env.STORAGE_DRIVER === 'local' ? new LocalStorage() : null;
export const storage: Storage = localStorage ?? new S3Storage();
