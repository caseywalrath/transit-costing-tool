// Backs finding B2-03 (static fixture tests assert hand-written DOM, not the React output). Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config <config with testDir docs/review/golden, testMatch p5-fixture-drift.spec.ts, baseURL a free vite port, webServer cwd repo root> (cwd must be the repo root for the import path)
import { expect, test } from '@playwright/test';

// The header-action-layer browser tests (tests/ui/workflow-section-layout.spec.ts, service-day-copy-layout.spec.ts)
// load a hand-written fixture. They assert button lists that the real app no longer renders, so they pass
// while the app differs. Expected: the fixture and the app agree. Actual: they differ, so test.fail() reports a pass.
test.fail('the header-action fixtures list the same buttons as the real Trips and Runtimes sections', async ({ page, browser }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles('output/federal-brt-import/federal-brt-project-backup.json');
  await page.getByText('Imported Federal').waitFor();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.runtime-table tbody tr').first()).toBeVisible({ timeout: 30000 });
  const buttons = (p: typeof page, section: string) => p.locator(`[aria-label="${section} section"] .section-header-actions button`).allTextContents().then((l) => l.map((t) => t.trim()));
  const fixture = await browser.newPage();
  await fixture.goto('/tests/fixtures/workflow-section-layout.html');
  expect(await buttons(page, 'Trips')).toEqual(await buttons(fixture, 'Trips'));
  expect(await buttons(page, 'Runtimes')).toEqual(await buttons(fixture, 'Runtimes'));
});
