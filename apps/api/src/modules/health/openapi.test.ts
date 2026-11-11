import { describe, expect, it } from 'vitest';
import { buildOpenApi } from './openapi.js';

describe('openapi', () => {
  it('builds request schemas from the shared zod schemas', () => {
    const doc = buildOpenApi() as { paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: { required?: string[] } }> }; parameters: { name: string }[] }>> };
    const create = doc.paths['/bookings']!.post!;
    expect(create.requestBody!.content['application/json']!.schema.required).toEqual(expect.arrayContaining(['listingId', 'startDate', 'endDate']));
    expect(create.parameters.map((p) => p.name)).toContain('Idempotency-Key');
    const search = doc.paths['/listings']!.get!;
    expect(search.parameters.map((p) => p.name)).toEqual(expect.arrayContaining(['bbox', 'start', 'end', 'sort', 'cursor']));
  });
});
