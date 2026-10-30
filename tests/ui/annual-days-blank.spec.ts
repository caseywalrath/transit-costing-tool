// A blank Annual Service Days field is recorded as zero instead of being refused.
import { expect, test } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(90_000);

test('a blank annual service days count is recorded as zero', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  const weekdayDays = page.getByLabel('Weekday annual service days');
  await expect(weekdayDays).toHaveValue('255', { timeout: 30_000 });

  await weekdayDays.fill('');
  await weekdayDays.press('Enter');
  await expect.poll(() => runInPage(page, "return (await e.db.serviceDays.toArray()).find((day) => day.kind === 'weekday').annualServiceDays")).toBe(0);
  await expect(weekdayDays).toHaveValue('0');
  await expect(page.locator('.field-error')).toHaveCount(0);
});
