import { defineConfig, devices } from '@playwright/test';

// Runs against real services: postgres, redis and mailpit from CI service
// containers (or docker compose locally), the built api, and vite preview.
const API_PORT = 4000;
const WEB = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './specs',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node --import ../../apps/api/dist/tracing.js ../../apps/api/dist/server.js',
          url: `http://localhost:${API_PORT}/readyz`,
          reuseExistingServer: !process.env.CI,
          env: {
            NODE_ENV: 'test',
            PORT: String(API_PORT),
            DISABLE_METRICS_SERVER: '1',
            WEB_ORIGIN: WEB,
            DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://coopswap:coopswap@localhost:5440/coopswap',
            REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6380',
            SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123',
            SMTP_URL: process.env.SMTP_URL ?? 'smtp://localhost:1025',
            STORAGE_DIR: '.data/e2e-uploads',
            RATE_LIMIT_MULTIPLIER: '50',
            LOG_LEVEL: 'warn',
          },
        },
        {
          command: 'pnpm --filter @coopswap/web preview --port 4173 --strictPort',
          url: WEB,
          reuseExistingServer: !process.env.CI,
        },
      ],
});
