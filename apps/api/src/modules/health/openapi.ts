import { z } from 'zod';
import * as s from '@coopswap/shared';

// OpenAPI built from the same zod schemas the handlers validate with, so the
// request side can't drift. Responses are described loosely (they're typed in
// @coopswap/shared for the web client).

type Op = { summary: string; auth?: boolean; body?: z.ZodType; query?: z.ZodType; idempotent?: boolean; tag: string };

const routes: Record<string, Record<string, Op>> = {
  '/auth/signup': { post: { tag: 'auth', summary: 'Create an account and start a session', body: s.signUpInput } },
  '/auth/signin': { post: { tag: 'auth', summary: 'Sign in', body: s.signInInput } },
  '/auth/signout': { post: { tag: 'auth', summary: 'End the current session' } },
  '/auth/session': { get: { tag: 'auth', summary: 'Current user, or null' } },
  '/auth/csrf': { get: { tag: 'auth', summary: 'Get (and set) the csrf token' } },
  '/auth/verify-email': { post: { tag: 'auth', summary: 'Redeem an email verification token', body: s.tokenInput } },
  '/auth/forgot-password': { post: { tag: 'auth', summary: 'Send a reset link (always 202)', body: s.forgotPasswordInput } },
  '/auth/reset-password': { post: { tag: 'auth', summary: 'Set a new password with a reset token', body: s.resetPasswordInput } },
  '/auth/university': { post: { tag: 'auth', auth: true, summary: 'Send a link to a university address', body: s.universityEmailInput } },
  '/me': { get: { tag: 'users', auth: true, summary: 'My profile + settings' }, delete: { tag: 'users', auth: true, summary: 'Delete (anonymise) my account', body: s.deleteAccountInput } },
  '/me/profile': { patch: { tag: 'users', auth: true, summary: 'Update profile', body: s.updateProfileInput } },
  '/me/settings': { patch: { tag: 'users', auth: true, summary: 'Update settings', body: s.updateSettingsInput } },
  '/users/{id}': { get: { tag: 'users', summary: 'Public profile' } },
  '/listings': {
    get: { tag: 'listings', summary: 'Search listings (keyset paginated)', query: s.listingSearchQuery },
    post: { tag: 'listings', auth: true, summary: 'Create a draft listing', body: s.createListingInput },
  },
  '/listings/{id}': { get: { tag: 'listings', summary: 'Listing detail' }, patch: { tag: 'listings', auth: true, summary: 'Edit (optimistic, needs version)', body: s.updateListingInput } },
  '/listings/{id}/publish': { post: { tag: 'listings', auth: true, summary: 'Publish' } },
  '/listings/{id}/archive': { post: { tag: 'listings', auth: true, summary: 'Archive (rejects open requests)' } },
  '/listings/{id}/images': { post: { tag: 'listings', auth: true, summary: 'Upload photos (multipart field "images")' } },
  '/me/saved/{id}': { put: { tag: 'listings', auth: true, summary: 'Save' }, delete: { tag: 'listings', auth: true, summary: 'Unsave' } },
  '/bookings': {
    get: { tag: 'bookings', auth: true, summary: 'My bookings as guest or owner', query: s.bookingListQuery },
    post: { tag: 'bookings', auth: true, idempotent: true, summary: 'Request a booking', body: s.createBookingInput },
  },
  '/bookings/{id}/approve': { post: { tag: 'bookings', auth: true, idempotent: true, summary: 'Owner approves (409 booking_conflict if dates are taken)', body: s.bookingDecisionInput } },
  '/bookings/{id}/reject': { post: { tag: 'bookings', auth: true, idempotent: true, summary: 'Owner declines', body: s.bookingDecisionInput } },
  '/bookings/{id}/cancel': { post: { tag: 'bookings', auth: true, idempotent: true, summary: 'Guest withdraws / either side cancels before start', body: s.bookingDecisionInput } },
  '/conversations': { get: { tag: 'messaging', auth: true, summary: 'My conversations' }, post: { tag: 'messaging', auth: true, summary: 'Open (or reuse) a conversation about a listing', body: s.startConversationInput } },
  '/conversations/{id}/messages': {
    get: { tag: 'messaging', auth: true, summary: 'History: ?before=seq to scroll back, ?after=seq to catch up', query: s.messageHistoryQuery },
    post: { tag: 'messaging', auth: true, summary: 'Send (dedupes on clientId)', body: s.sendMessageInput },
  },
  '/conversations/{id}/read': { post: { tag: 'messaging', auth: true, summary: 'Move my read cursor', body: s.markReadInput } },
  '/notifications': { get: { tag: 'notifications', auth: true, summary: 'My notifications' } },
  '/notifications/read-all': { post: { tag: 'notifications', auth: true, summary: 'Mark all read' } },
};

const errorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' }, details: {}, requestId: { type: 'string' } },
    },
  },
};

const toSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, methods] of Object.entries(routes)) {
    paths[path] = {};
    for (const [method, op] of Object.entries(methods)) {
      const parameters: unknown[] = [];
      if (path.includes('{id}')) parameters.push({ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
      if (op.query) {
        const js = toSchema(op.query) as { properties?: Record<string, unknown> };
        for (const [name, schema] of Object.entries(js.properties ?? {})) parameters.push({ name, in: 'query', schema });
      }
      if (op.idempotent) {
        parameters.push({ name: 'Idempotency-Key', in: 'header', schema: { type: 'string', minLength: 8, maxLength: 100 }, description: 'Retries with the same key replay the first successful response' });
      }
      if (method !== 'get') parameters.push({ name: 'X-CSRF-Token', in: 'header', required: true, schema: { type: 'string' }, description: 'Echo of the cs_csrf cookie' });
      paths[path]![method] = {
        tags: [op.tag],
        summary: op.summary,
        security: op.auth ? [{ session: [] }] : [],
        parameters,
        ...(op.body ? { requestBody: { required: true, content: { 'application/json': { schema: toSchema(op.body) } } } } : {}),
        responses: {
          '200': { description: 'OK, body is { data }' },
          default: { description: 'Error', content: { 'application/json': { schema: errorSchema } } },
        },
      };
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: 'CoopSwap API', version: process.env.APP_VERSION ?? 'dev' },
    servers: [{ url: '/api' }],
    components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'cs_session' } } },
    paths,
  };
}
