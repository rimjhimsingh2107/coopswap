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
  wsConnections: new client.Gauge({
    name: 'ws_connections',
    help: 'Open socket.io connections on this instance',
    registers: [registry],
  }),
  messagesSent: new client.Counter({
    name: 'messages_sent_total',
    help: 'Chat messages persisted',
    registers: [registry],
  }),
  messageDeliveryLatency: new client.Histogram({
    name: 'message_delivery_latency_seconds',
    help: 'Time from a message being stored to the recipient acking delivery',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 60],
    registers: [registry],
  }),
  redisErrors: new client.Counter({
    name: 'redis_errors_total',
    help: 'Redis client errors',
    labelNames: ['client'],
    registers: [registry],
  }),
  outboxProcessed: new client.Counter({
    name: 'outbox_events_processed_total',
    help: 'Outbox events handled by the relay',
    labelNames: ['topic', 'outcome'],
    registers: [registry],
  }),
  outboxBacklog: new client.Gauge({
    name: 'outbox_backlog',
    help: 'Unpublished outbox events',
    registers: [registry],
  }),
  analyticsEvents: new client.Counter({
    name: 'analytics_events_total',
    help: 'Product analytics events accepted',
    labelNames: ['name'],
    registers: [registry],
  }),
  rateLimited: new client.Counter({
    name: 'rate_limited_requests_total',
    help: 'Requests rejected by a rate limiter',
    labelNames: ['limiter'],
    registers: [registry],
  }),
};
