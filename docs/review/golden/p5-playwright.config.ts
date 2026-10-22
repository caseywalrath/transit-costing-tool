// Phase 5 review-only Playwright config for the p5-*.spec.ts browser reproductions.
// Run from the repository root:
//   PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p5-playwright.config.ts
// Uses port 4185. Defect tests are marked test.fail() and report as passing while the defect exists.
import { defineConfig } from '@playwright/test';
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
export default defineConfig({
  testDir: '.',
  testMatch: 'p5-*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  use: { baseURL: 'http://127.0.0.1:4185', browserName: 'chromium', ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}) },
  webServer: { command: 'pnpm exec vite --host 127.0.0.1 --port 4185 --strictPort', cwd: '../../..', port: 4185, reuseExistingServer: true, timeout: 120000 },
});
