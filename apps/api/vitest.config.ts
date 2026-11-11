import { defineConfig } from 'vitest/config';

const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://coopswap:coopswap@localhost:5440/coopswap_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6380/1',
  SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
  WEB_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
  RATE_LIMIT_MULTIPLIER: '1000',
  DATABASE_POOL_MAX: '20',
};

// set before anything loads src/config/env.ts (global setup included)
Object.assign(process.env, testEnv);

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          env: testEnv,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.test.ts'],
          env: testEnv,
          globalSetup: ['test/global-setup.ts'],
          setupFiles: ['test/setup.ts'],
          // tests share one database, run files one after another
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
