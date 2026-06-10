import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'extension.spec.mjs',
  // One persistent browser context drives every test; no parallelism.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: 'list',
  projects: [{ name: 'chromium' }],
});
