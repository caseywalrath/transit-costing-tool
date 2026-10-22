// Backs finding B3-01 (no edit-time message when annual service days exceed 365). Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config <a config with testDir docs/review/golden, port 4193> p5-servicedays-365
import { expect, test } from '@playwright/test';

test.fail('Route tab warns when the annual service-day total exceeds 365 (App.tsx:508)', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles('output/federal-brt-import/federal-brt-project-backup.json');
  await page.getByText('Imported Federal').waitFor();
  const weekday = page.getByLabel('Weekday annual service days');
  await weekday.fill('300'); await weekday.press('Tab');
  await expect(page.getByText(/365/).first()).toBeVisible({ timeout: 3000 });
});
