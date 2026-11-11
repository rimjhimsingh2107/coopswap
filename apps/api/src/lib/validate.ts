import type { Request } from 'express';
import type { z } from 'zod';

export const body = <S extends z.ZodType>(req: Request, schema: S): z.infer<S> =>
  schema.parse(req.body ?? {});

export const query = <S extends z.ZodType>(req: Request, schema: S): z.infer<S> =>
  schema.parse(req.query);

export const params = <S extends z.ZodType>(req: Request, schema: S): z.infer<S> =>
  schema.parse(req.params);
