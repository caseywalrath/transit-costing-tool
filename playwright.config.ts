import { defineConfig } from '@playwright/test';

// Optional override for environments that provide their own Chromium build
// instead of the one bundled with the installed Playwright version.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  // GitHub's runners are slower than a development machine, and a few timing-sensitive tests fail there once in a while. CI runs a failed
  // test up to two more times; a test that fails every time still fails the run, and one that passes on a retry is reported as flaky.
  retries: process.env.CI ? 2 : 0,
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
