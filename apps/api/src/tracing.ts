// Loaded with `node --import ./dist/tracing.js` so instrumentation patches
// http/express/pg/ioredis before they're required. No-op unless an OTLP
// endpoint is configured.
import { IncomingMessage } from 'node:http';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'coopswap-api',
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? 'dev',
      'service.instance.id': process.env.INSTANCE_ID ?? String(process.pid),
    }),
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(Number(process.env.OTEL_SAMPLE_RATIO ?? 1)) }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }))],
  });
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => req.url === '/healthz' || req.url === '/readyz' || req.url === '/metrics',
        // the default span name includes the raw url. we only want method + route
        requestHook: (span, req) => {
          if (req instanceof IncomingMessage) {
            span.updateName(`${req.method} ${(req.url ?? '').split('?')[0]?.replace(/[0-9a-f-]{36}/g, ':id')}`);
          }
        },
        // don't record query strings, they hold search text / tokens
        headersToSpanAttributes: { server: { requestHeaders: [], responseHeaders: [] } },
      }),
      new ExpressInstrumentation(),
      // statement text only, never parameter values (those can be emails, messages...)
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
      new IORedisInstrumentation({ dbStatementSerializer: (cmd) => cmd }),
    ],
  });

  const shutdown = () => void provider.shutdown().catch(() => {});
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
