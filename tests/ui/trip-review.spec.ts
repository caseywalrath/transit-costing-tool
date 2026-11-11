import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { runCommand } from './support/ui';

// R5 (Decisions 0071 and 0072): the shared trip review. A segment-start profile whose A→B runtime rises from 5 to 10 minutes at 6:00
// leaves arrival times from 6:05 to 6:09:59 unreachable. The trip starting at 5:56 and saved to end at 6:08 cannot keep its end time.
async function openReview(page: Page) {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await createShiftReadySchedule(page, '06:00');
  await runInPage(page, `
    const [profile] = await e.db.runtimeProfiles.toArray();
    await e.service.saveRuntimeProfile({ ...profile, calculationMethod: 'segmentStart', bands: [
      { ...profile.bands[0], label: 'Early', sequence: 0, startTime: 0, endTime: 21600, segmentRuntimeSeconds: [300] },
      { id: 'band-am', label: 'AM Peak', sequence: 1, startTime: 21600, endTime: 108000, segmentRuntimeSeconds: [600] },
    ] });
    const [trip] = await e.db.trips.toArray();
    const at = (id, start, end) => ({ ...trip, id, stopTimes: [{ ...trip.stopTimes[0], time: start }, { ...trip.stopTimes[1], time: end }] });
    await e.db.trips.bulkPut([at(trip.id, 21000, 21300), at('t2', 21360, 22080), at('t3', 22200, 22800), at('t4', 23400, 24000)]);
  `);
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  // Wait for the four rows before selecting all; under parallel load the header checkbox can be pressed before they load.
  await expect(page.locator('.schedule-table tbody tr:has(input[type="checkbox"])')).toHaveCount(4);
  await page.getByRole('checkbox', { name: 'Select all trips' }).check();
  await runCommand(page, 'trips.regenerate');
  const dialog = page.getByRole('dialog', { name: 'Regenerate selected trips' });
  await dialog.getByRole('button', { name: 'End time', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: '4 trips' })).toContainText('3 ready · 1 needs attention');
  return dialog;
}

const savedTimes = (page: Page) => runInPage(page, `return (await e.db.trips.toArray()).map((trip) => trip.stopTimes.map((point) => point.time)).sort((a, b) => a[0] - b[0])`);

test('a trip that cannot keep its time is flagged, explained, and fixed from its Action list; the others regenerate with it', async ({ page }) => {
  const dialog = await openReview(page);
  await expect(dialog.locator('.trip-review-chip')).toHaveText(['Ready', "Can't keep 6:08", 'Ready', 'Ready']);
  // The primary button waits until the flagged trip has a fix or is skipped.
  await expect(dialog.getByRole('button', { name: 'Regenerate 3 trips' })).toBeDisabled();

  await dialog.getByRole('button', { name: /^Why: Can't keep 6:08/ }).click();
  const why = dialog.locator('.trip-review-why');
  await expect(why.locator('h3')).toHaveText("This trip can't reach B at exactly 6:08.");
  await expect(why).toContainText('Travel times get longer when AM Peak starts at 6:00.');
  await expect(why).toContainText('A trip that starts at 6:00 reaches it at 6:10.');
  await expect(why).toContainText('In AM Peak, travel takes 5:00 longer from A to B than in Early.');

  const action = dialog.getByRole('combobox', { name: 'Action for trip at 5:56' });
  // Smallest change first (2 min later before 3:01 min earlier), Skip last.
  await expect(action.locator('option:not([disabled])')).toHaveText(['Keep B at 6:10 instead — 2 min later', 'Keep B at 6:04:59 instead — 3:01 min earlier', /^Keep the start time \(5:56\)/, /^Skip this trip/]);
  await action.selectOption('keep:22200');
  await expect(dialog.locator('.trip-review-chip').nth(1)).toHaveText('Ready');
  await expect(action.locator('option')).toHaveText([/^Keep B at 6:10 instead/, 'Undo this fix', /^Skip this trip/]);
  await dialog.getByRole('button', { name: 'Regenerate 4 trips' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await savedTimes(page)).toEqual([[21000, 21300], [21600, 22200], [22200, 22800], [23400, 24000]]);
});

test('Skip all that need attention regenerates the others and leaves the flagged trip unchanged', async ({ page }) => {
  const dialog = await openReview(page);
  await dialog.getByRole('button', { name: 'Skip the 1 that needs attention' }).click();
  await expect(dialog.locator('.trip-review-chip').nth(1)).toHaveText('Skipped');
  await dialog.getByRole('button', { name: 'Regenerate 3 trips' }).click();
  await expect(dialog).toHaveCount(0);
  expect((await savedTimes(page))[1]).toEqual([21360, 22080]);
});

test('the review dialog passes the axe checks with a Why panel open', async ({ page }) => {
  const dialog = await openReview(page);
  await dialog.getByRole('button', { name: /^Why: Can't keep 6:08/ }).click();
  const source = readFileSync(fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url)), 'utf8');
  await page.addScriptTag({ content: source });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: unknown[] }> }> }> } }).axe;
    const result = await axe.run(document.querySelector('[role=dialog]'), { runOnly: { type: 'rule', values: ['aria-dialog-name', 'label', 'scope-attr-valid', 'color-contrast', 'target-size', 'aria-allowed-role', 'button-name', 'select-name'] } });
    return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`);
  });
  expect(violations).toEqual([]);
});
