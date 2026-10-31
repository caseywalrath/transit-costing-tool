// The Runtimes Pattern select stays inside the Runtimes header at every width, even with a long Pattern name. It is drawn with the
// shared scope-bar select style (no native appearance), so a browser cannot draw it outside its box.
import { expect, test } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';
import { openRuntimes, region } from './support/ui';

test('the Runtimes Pattern select stays inside its header with a long Pattern name', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGoldenTrips(page);
  await openRuntimes(page);
  const select = region(page, 'runtimes').getByRole('combobox', { name: 'Pattern' });
  await select.selectOption({ label: 'Southbound: Westminster Station to Englewood' });
  await select.evaluate((element: HTMLSelectElement) => { element.options[element.selectedIndex].textContent += ' via Federal Boulevard and Alameda Avenue'; });
  expect(await select.evaluate((element) => getComputedStyle(element).appearance)).toBe('none');

  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await select.evaluate((element) => {
      const box = (target: Element) => { const rect = target.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; };
      const header = element.closest('.work-surface__header')!;
      const padding = parseFloat(getComputedStyle(header).paddingRight);
      return { select: box(element), field: box(element.closest('.context-field')!), header: box(header), padding };
    });
    expect(boxes.select.right, `select right edge at ${width} px`).toBeLessThanOrEqual(boxes.header.right - boxes.padding + 0.5);
    expect(boxes.select.right, `select inside its field at ${width} px`).toBeLessThanOrEqual(boxes.field.right + 0.5);
    expect(boxes.select.left).toBeGreaterThanOrEqual(boxes.header.left);
    expect(boxes.select.bottom).toBeLessThanOrEqual(boxes.header.bottom);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
