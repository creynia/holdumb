import { defineConfig } from '@playwright/test';
import type { Project } from '@playwright/test';

// Visual regression suite (tests/visual). Baselines are only valid when generated inside
// mcr.microsoft.com/playwright:v1.56.1-noble (same Chromium, fonts and rasteriser as CI):
//   npm run test:visual:update        regenerate baselines in that container (needs Docker)
//   npm run test:visual               compare against the committed baselines
// See CONTRIBUTING.md, "Visual tests".
const PORT = Number(process.env.PORT ?? 4180);

const VIEWPORTS = {
  p360: { width: 360, height: 740 },
  p390: { width: 390, height: 844 },
  l844: { width: 844, height: 390 },
  l667: { width: 667, height: 375 },
} as const;

const projects: Project[] = [];
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  for (const colorScheme of ['light', 'dark'] as const) {
    projects.push({
      name: `${name}-${colorScheme}`,
      use: {
        viewport,
        colorScheme,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        browserName: 'chromium',
      },
    });
  }
}

export default defineConfig({
  testDir: 'tests/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Flakes must surface, not hide behind a retry.
  retries: 0,
  workers: process.env.CI ? 4 : 2,
  timeout: 60_000,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'visual-report.json' }]]
    : [['list'], ['html', { open: 'never' }]],
  expect: {
    // Set once here; a per-test override needs a comment saying why.
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, threshold: 0.2, animations: 'disabled' },
  },
  use: {
    baseURL: `http://localhost:${PORT}/`,
    locale: 'en-US',
    timezoneId: 'UTC',
    contextOptions: { reducedMotion: 'reduce' },
    // No service worker: an "update available" toast must never appear in a baseline.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects,
  webServer: {
    // PREBUILT=1 (CI's visual job): serve the check job's `build` artifact without rebuilding (I043).
    command: process.env.PREBUILT
      ? `npx vite preview --port ${PORT} --strictPort`
      : `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
