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
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      body?.error ?? { code: 'internal', message: `request failed (${res.status})` },
    );
  }
  return body.data as T;
}
