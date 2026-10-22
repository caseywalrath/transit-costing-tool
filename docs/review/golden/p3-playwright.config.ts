// Phase 3 review-only Playwright config for the p3-*.spec.ts browser reproductions.
// They run real Dexie/IndexedDB code in Chromium by importing src modules from the Vite dev server.
// Run from the repository root:
//   pnpm exec playwright test --config docs/review/golden/p3-playwright.config.ts
// Uses PLAYWRIGHT_CHROMIUM_EXECUTABLE when set (e.g. /opt/pw-browsers/chromium) and port 4183.
// Tests that document a defect are marked test.fail(...) and report as passing while the defect exists.
import { defineConfig } from '@playwright/test';
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
export default defineConfig({
  testDir: '.',
  testMatch: 'p3-*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  use: { baseURL: 'http://127.0.0.1:4183', browserName: 'chromium', ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}) },
  webServer: { command: 'pnpm exec vite --host 127.0.0.1 --port 4183 --strictPort', cwd: '../../..', port: 4183, reuseExistingServer: true, timeout: 120000 },
});
