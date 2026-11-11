import { createServer } from 'node:http';
import { registry } from './lib/metrics.js';
import { logger } from './lib/logger.js';

// Prometheus scrapes this on its own port, which is not exposed publicly.
export function startMetricsServer(port: number) {
  const server = createServer(async (req, res) => {
    if (req.url !== '/metrics') {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('content-type', registry.contentType);
    res.end(await registry.metrics());
  });
  server.listen(port, () => logger.info({ port }, 'metrics listening'));
  return server;
}
