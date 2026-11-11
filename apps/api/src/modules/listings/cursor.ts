import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';

// opaque keyset cursor: the sort value of the last row plus its id as a tiebreak
const shape = z.object({ s: z.string(), v: z.union([z.string(), z.number()]), id: z.uuid() });
export type Cursor = z.infer<typeof shape>;

export const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');

export function decodeCursor(raw: string, sort: string): Cursor {
  try {
    const c = shape.parse(JSON.parse(Buffer.from(raw, 'base64url').toString()));
    if (c.s !== sort) throw new Error('sort changed');
    return c;
  } catch {
    throw badRequest('invalid cursor');
  }
}
