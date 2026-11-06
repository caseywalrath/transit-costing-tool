// Service day abbreviations are entered in the Route tab's Annual service days table (Decision 0059, package ST3).
import { expect, test } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(90_000);

const stored = (page: import('@playwright/test').Page, kind: string) => runInPage(page, `return (await e.db.serviceDays.toArray()).find((day) => day.kind === '${kind}').abbreviation ?? null`);

test('a planner can enter, refuse, and clear a service day abbreviation', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  const weekday = page.getByLabel('Abbreviation for Weekday');
  const saturday = page.getByLabel('Abbreviation for Saturday');
  await expect(weekday).toBeVisible({ timeout: 30_000 });
  await expect(weekday).toHaveAttribute('placeholder', 'WKD');
  await expect(saturday).toHaveAttribute('placeholder', 'SAT');
  await expect(weekday).toHaveValue('');

  await weekday.fill('wk');
  await weekday.press('Enter');
  await expect.poll(() => stored(page, 'weekday')).toBe('WK');
  await expect(weekday).toHaveValue('WK');

  // A duplicate (another day's default) is refused, the message shows, and the field returns to its saved value.
  await saturday.fill('wk');
  await saturday.press('Enter');
  await expect(page.locator('.field-error')).toContainText('Another service day already uses the abbreviation WK.');
  await expect(saturday).toHaveValue('');
  expect(await stored(page, 'saturday')).toBeNull();

  // Escape restores the saved value without saving.
  await weekday.fill('XY');
  await weekday.press('Escape');
  await expect(weekday).toHaveValue('WK');
  expect(await stored(page, 'weekday')).toBe('WK');

  // Clearing returns to the default.
  await weekday.fill('');
  await weekday.press('Enter');
  await expect.poll(() => stored(page, 'weekday')).toBeNull();
  await expect(weekday).toHaveValue('');
});

test('the service days table keeps its width at desktop and 1100 px', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  for (const width of [1440, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const panel = page.locator('.service-days-table');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    const box = (await panel.boundingBox())!;
    const table = (await panel.locator('table').boundingBox())!;
    expect(table.width).toBeLessThanOrEqual(box.width + 1);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
});
