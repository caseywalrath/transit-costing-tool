// Phase 4 review-only Playwright config for the p4-*.spec.ts browser reproductions.
// Run from the repository root:
//   PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p4-playwright.config.ts
// Uses port 4184. Defect tests are marked test.fail() and report as passing while the defect exists.
import { defineConfig } from '@playwright/test';
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
export default defineConfig({
  testDir: '.',
  testMatch: 'p4-*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  use: { baseURL: 'http://127.0.0.1:4184', browserName: 'chromium', ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}) },
  webServer: { command: 'pnpm exec vite --host 127.0.0.1 --port 4184 --strictPort', cwd: '../../..', port: 4184, reuseExistingServer: true, timeout: 120000 },
});
