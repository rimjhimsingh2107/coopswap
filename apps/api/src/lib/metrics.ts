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
  rateLimited: new client.Counter({
    name: 'rate_limited_requests_total',
    help: 'Requests rejected by a rate limiter',
    labelNames: ['limiter'],
    registers: [registry],
  }),
};
