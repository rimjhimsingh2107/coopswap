import type { ApiError } from '@coopswap/shared';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.message);
  }
  get code() {
    return this.body.code;
  }
  // zod issues from the server, keyed by field path
  get fieldErrors(): Record<string, string> {
    const details = this.body.details;
    if (!Array.isArray(details)) return {};
    return Object.fromEntries(details.map((d: { path: string; message: string }) => [d.path, d.message]));
  }
}

function csrfToken() {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith('cs_csrf='))
    ?.slice('cs_csrf='.length);
}

let csrfPromise: Promise<void> | null = null;
async function ensureCsrf() {
  if (csrfToken()) return;
  csrfPromise ??= fetch('/api/auth/csrf', { credentials: 'include' }).then(() => {
    csrfPromise = null;
  });
  await csrfPromise;
}

interface Options extends Omit<RequestInit, 'body'> {
  body?: unknown;
  idempotencyKey?: string;
}

export async function api<T>(path: string, { body, idempotencyKey, headers, ...init }: Options = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET') await ensureCsrf();
  const isForm = body instanceof FormData;

  const res = await fetch(`/api${path}`, {
    ...init,
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-csrf-token': csrfToken() ?? '' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(res.status, json?.error ?? { code: 'internal', message: `request failed (${res.status})` });
  }
  return json.data as T;
}

export const qs = (params: Record<string, string | number | boolean | string[] | undefined | null>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
};
