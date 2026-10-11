import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    channel: process.env.CAMPUS_BROWSER_CHANNEL,
  },
  webServer: {
    command: 'node scripts/dev.mjs',
    url: 'http://127.0.0.1:5174',
    env: {
      CAMPUS_CHAIN_PORT: '8546',
      CAMPUS_WEB_PORT: '5174',
      CAMPUS_DEPLOYMENT_FILE: 'public/deployment.e2e.json',
      VITE_CAMPUS_DEPLOYMENT_URL: '/deployment.e2e.json',
    },
    reuseExistingServer: false,
    timeout: 60000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
