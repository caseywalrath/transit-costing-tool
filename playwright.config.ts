import { defineConfig } from '@playwright/test';

// Optional override for environments that provide their own Chromium build
// instead of the one bundled with the installed Playwright version.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  // On CI a failed test runs once more. A test that then passes is listed as "flaky" in the report, so the timing race stays visible and can
  // be fixed, but it no longer fails the run and blocks the Pages deploy. A real fault fails both attempts. Local runs never retry.
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4174',
    port: 4174,
    reuseExistingServer: false,
  },
});
