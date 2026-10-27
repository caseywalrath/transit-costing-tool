// UR-6c: the Trips tab layout. Runtimes is a collapsible work surface (R-A), the selection commands live in a selection bar, and the
// Pattern column is a chip. These checks drive the real app, as the other Trips specs do.
import { expect, test } from '@playwright/test';
import { createShiftReadySchedule, openGoldenTrips } from './support/tripsWorkspace';
import { editRuntimeCell, openRuntimes, region, runCommand, runtimeCell } from './support/ui';

test.setTimeout(90_000);

const toggle = (page: import('@playwright/test').Page) => region(page, 'runtimes').getByRole('button', { name: 'Runtimes', exact: true });

test('Runtimes starts collapsed, and its open state is kept across a reload on this device', async ({ page }) => {
  await openGoldenTrips(page);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  // UR-14: the collapsed heading has no summary line.
  await expect(region(page, 'runtimes').locator('.work-surface__subtitle')).toHaveCount(0);
  await expect(runtimeCell(region(page, 'runtimes'), 'Time band 1 segment 1')).toHaveCount(0);

  await region(page, 'runtimes').getByRole('button', { name: 'Edit runtimes', exact: true }).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(runtimeCell(region(page, 'runtimes'), 'Time band 1 segment 1')).toBeVisible();
  await expect(region(page, 'runtimes').getByRole('button', { name: 'Add time band', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('transit-costing-tool.runtimes-open.v1'))).toBe('{"open":true}');

  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(runtimeCell(region(page, 'runtimes'), 'Time band 1 segment 1')).toBeVisible();

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
});

test('a malformed stored open state reads as collapsed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('transit-costing-tool.runtimes-open.v1', '[true]'));
  await openGoldenTrips(page);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
});

test('the Runtimes toggle is the only close control, and it is disabled while the Runtime editor has unsaved edits', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  const runtimes = region(page, 'runtimes');
  // UR-14: no Close button; the heading's toggle collapses the section.
  await expect(runtimes.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
  await expect(toggle(page)).toBeEnabled();

  await editRuntimeCell(runtimes, 'Time band 1 segment 1', ':09');
  await expect(runtimes.getByRole('region', { name: 'Unsaved changes' })).toBeVisible();
  await expect(toggle(page)).toBeDisabled();
  await expect(toggle(page)).toHaveAttribute('title', 'Save or discard runtime edits first');

  await runtimes.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(runtimes.getByRole('region', { name: 'Unsaved changes' })).toHaveCount(0);
  await expect(toggle(page)).toBeEnabled();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
});

test('the selection bar appears with a selection and goes away when it is cleared', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const bar = page.getByRole('toolbar', { name: 'Selected trips' });
  const boxes = page.locator('.schedule-table tbody input[type="checkbox"]');
  await expect(bar).toHaveCount(0);

  await boxes.nth(0).check();
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('1 trip selected');
  await boxes.nth(1).check();
  await expect(bar).toContainText('2 trips selected');
  await expect(bar.getByRole('button')).toHaveText(['Shift…', 'Change pattern…', 'Regenerate…', 'Assign block…', 'Unassign…', 'Delete…', 'Clear']);
  // Nothing has changed runtimes, and there is no Blocking scenario with Blocks, so those buttons are disabled and say why.
  await expect(bar.getByRole('button', { name: 'Regenerate…', exact: true })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Regenerate…', exact: true })).toHaveAttribute('title', 'Select trips with changed runtimes.');

  await bar.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(bar).toHaveCount(0);
  await expect(boxes.nth(0)).not.toBeChecked();

  await page.getByRole('checkbox', { name: 'Select all trips' }).check();
  await expect(bar).toContainText('3 trips selected');
  await page.getByRole('checkbox', { name: 'Select all trips' }).uncheck();
  await expect(bar).toHaveCount(0);
});

test('Change pattern with one trip opens the single-trip review, and with several it opens the batch dialog', async ({ page }) => {
  await openGoldenTrips(page);
  const boxes = page.locator('.trips-workspace .schedule-table tbody input[type="checkbox"]');
  await boxes.nth(0).check();
  await runCommand(page, 'trips.changePattern');
  const single = page.getByRole('dialog', { name: 'Change pattern of this trip' });
  await expect(single).toBeVisible();
  await expect(single.getByLabel('Target pattern')).toBeVisible();
  await single.getByRole('button', { name: 'Review change', exact: true }).click();
  // The review is signed over the trip, the target pattern, and the target profile; it states its result before anything is written.
  await expect(single.getByRole('status').or(single.getByRole('alert'))).toBeVisible();
  await single.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(single).toHaveCount(0);

  await boxes.nth(1).check();
  await runCommand(page, 'trips.changePattern');
  await expect(page.getByRole('dialog', { name: 'Change selected patterns' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('"Select these trips" selects exactly the trips marked "Run times changed"', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const runtimes = region(page, 'runtimes');
  await editRuntimeCell(runtimes, 'Time band 1 segment 1', ':10:30');
  await runtimes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Run times have changed')).toBeVisible();

  // Regenerate the first trip, so that one of the three no longer has changed runtimes.
  const boxes = page.locator('.schedule-table tbody input[type="checkbox"]');
  await boxes.first().check();
  await runCommand(page, 'trips.regenerate');
  await page.getByRole('dialog', { name: 'Regenerate selected trips' }).getByRole('button', { name: 'Regenerate trips', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Regenerate selected trips' })).toHaveCount(0);
  await expect(page.locator('.schedule-table tbody tr.trip-row-runtime-changed')).toHaveCount(2);
  await expect(page.getByRole('toolbar', { name: 'Selected trips' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Select these trips', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Selected trips' })).toContainText('2 trips selected');
  await expect(page.locator('.schedule-table tbody tr.trip-row-runtime-changed input[type="checkbox"]:checked')).toHaveCount(2);
  await expect(page.locator('.schedule-table tbody input[type="checkbox"]:checked')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Regenerate…', exact: true })).toBeEnabled();
});

test('the Pattern column shows a chip, and the Block column a pill with the block number', async ({ page }) => {
  await openGoldenTrips(page);
  const firstRow = page.locator('.trips-workspace .schedule-table tbody tr').first();
  const chip = firstRow.locator('td.trip-pattern-column .chip');
  await expect(chip).toBeVisible();
  // The chip drops a leading "Southbound: " and keeps the full name as its tooltip.
  expect(await chip.innerText()).not.toMatch(/^Southbound:/);
  expect(await chip.getAttribute('title')).toMatch(/^Southbound: /);
  await expect(firstRow.getByLabel('Trip pattern')).toHaveCount(0);
  await expect(firstRow.locator('td.trip-block-column .block-pill')).toBeVisible();
  await expect(firstRow.locator('td.trip-block-column .block-pill__dot')).toHaveCount(1);
});

test('Build trips and Add trip are header buttons, and View holds the three display options', async ({ page }) => {
  await openGoldenTrips(page);
  await openRuntimes(page);
  const trips = region(page, 'trips');
  await expect(trips.getByRole('button', { name: 'Build trips…', exact: true })).toBeEnabled();
  await runCommand(page, 'trips.add');
  await expect(trips.locator('.draft-trip-row')).toBeVisible();
  await expect(trips.getByRole('button', { name: 'Add trip', exact: true })).toBeDisabled();
  await trips.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'View' }).getByRole('menuitemcheckbox')).toHaveText(['Show runtime bands', 'Show headways', 'Round displayed times']);
});

test('the selection bar is pinned, compact, above the pinned table headings while the page is scrolled, and the live copy is always unique', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openGoldenTrips(page);
  const bar = page.getByRole('toolbar', { name: 'Selected trips' });
  const pinnedHeading = page.getByRole('region', { name: 'Trips table headings while scrolling' });
  const boxes = page.locator('.trips-workspace .schedule-table tbody input[type="checkbox"]');
  await boxes.nth(2).check();
  await expect(bar).toHaveCount(1);
  await expect(page.locator('.selection-bar-pinned')).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, 1500));
  await expect(pinnedHeading).toBeVisible();
  // One live bar: the copy above the table is hidden, and the pinned one sits at the top of the window with the headings under it.
  await expect(bar).toHaveCount(1);
  await expect(page.locator('.selection-bar-pinned')).toHaveCount(1);
  await expect(bar).toHaveClass(/selection-bar--compact/);
  await expect.poll(async () => Math.abs((await bar.boundingBox())!.y)).toBeLessThanOrEqual(1);
  const [barBox, headingBox] = await Promise.all([bar.boundingBox(), pinnedHeading.boundingBox()]);
  expect(Math.abs(headingBox!.y - (barBox!.y + barBox!.height))).toBeLessThanOrEqual(1);

  // It works from there: Shift… opens the drawer for the selected trip.
  await bar.getByRole('button', { name: 'Shift…', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Shift selected trips' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard', exact: true }).last().click();

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.selection-bar-pinned')).toHaveCount(0);
  await expect(bar).toHaveCount(1);
  await expect(bar).not.toHaveClass(/selection-bar--compact/);
  await expect(bar).toBeVisible();
});
