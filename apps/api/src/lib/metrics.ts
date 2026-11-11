import client from 'prom-client';

// Labels are kept low-cardinality on purpose: route templates, status classes,
// outcome enums. Never ids.

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const metrics = {
  httpDuration: new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency',
    labelNames: ['method', 'route', 'status_class'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  }),
  txDuration: new client.Histogram({
    name: 'db_transaction_duration_seconds',
    help: 'Duration of named database transactions',
    labelNames: ['tx', 'outcome'],
    buckets: [0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  }),
  bookingConflicts: new client.Counter({
    name: 'booking_conflicts_total',
    help: 'Booking operations rejected because the dates were taken',
    labelNames: ['operation'],
    registers: [registry],
  }),
  bookingTransitions: new client.Counter({
    name: 'booking_transitions_total',
    help: 'Booking state changes',
    labelNames: ['to', 'actor'],
    registers: [registry],
  }),
  idempotentReplays: new client.Counter({
    name: 'idempotent_replays_total',
    help: 'Requests answered from a stored idempotent response',
    labelNames: ['scope'],
    registers: [registry],
  }),
  jobDuration: new client.Histogram({
    name: 'job_duration_seconds',
    help: 'Background job run time',
    labelNames: ['job', 'outcome'],
    registers: [registry],
  }),
  jobFailures: new client.Counter({
    name: 'job_failures_total',
    help: 'Background job runs that threw',
    labelNames: ['job'],
    registers: [registry],
  }),
  rateLimited: new client.Counter({
    name: 'rate_limited_requests_total',
    help: 'Requests rejected by a rate limiter',
    labelNames: ['limiter'],
    registers: [registry],
  }),
};
