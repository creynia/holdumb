import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 4173);

// Browsers: set PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers locally (preinstalled chromium-1194).
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'retain-on-failure' },
  projects: [
    // 390x844 phone portrait
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    // 844x390 phone landscape
    {
      name: 'phone-landscape',
      use: { ...devices['Pixel 7 landscape'], viewport: { width: 844, height: 390 } },
      testMatch: /(sandbox|lessons|layout|drill|tabs|screenshots)\.spec\.ts/,
    },
    // perf.spec.ts runs in the mobile project only (CPU-throttled budgets)
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /perf\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build:all && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
