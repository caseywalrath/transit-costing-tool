// A zero run time is shaded, a missing one is shaded and outlined; both stay allowed and no text is added.
import { expect, test } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';
import { openRuntimes, region, runtimeCell } from './support/ui';

test('a zero segment run time is shaded, and a filled one is not', async ({ page }) => {
  await openGoldenTrips(page);
  await openRuntimes(page);
  const runtimes = region(page, 'runtimes');
  const filled = runtimeCell(runtimes, 'Time band 2 segment 1');
  const target = runtimeCell(runtimes, 'Time band 2 segment 2');
  await expect(filled).not.toHaveClass(/grid-cell--(zero|missing)/);
  await target.click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await expect(target).toHaveClass(/grid-cell--zero/);
  await expect(filled).not.toHaveClass(/grid-cell--(zero|missing)/);
  const shade = await target.evaluate((element) => getComputedStyle(element).backgroundColor);
  const plain = await filled.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(shade).not.toBe(plain);
});
