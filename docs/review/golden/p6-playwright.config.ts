// Phase 6 review-only Playwright config for the p6-*.spec.ts browser reproductions.
// Run from the repository root:
//   PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p6-playwright.config.ts
// Uses port 4186. Defect tests are marked test.fail() and report as passing while the defect exists.
import { defineConfig } from '@playwright/test';
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
export default defineConfig({
  testDir: '.',
  testMatch: 'p6-*.spec.ts',
  fullyParallel: false,
  workers: 1, retries: 0,
  timeout: 180000,
  use: { baseURL: 'http://127.0.0.1:4186', browserName: 'chromium', ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}) },
  // P6_DIST=<dir> serves a production build (vite preview) instead of the dev server.
  webServer: { command: process.env.P6_DIST ? `pnpm exec vite preview --outDir ${process.env.P6_DIST} --host 127.0.0.1 --port 4186 --strictPort` : 'pnpm exec vite --host 127.0.0.1 --port 4186 --strictPort', cwd: '../../..', port: 4186, reuseExistingServer: true, timeout: 120000 },
});
