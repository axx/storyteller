import { defineConfig } from '@playwright/test';
import { env } from 'node:process';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !env.CI },
});