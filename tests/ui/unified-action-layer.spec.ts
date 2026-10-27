import { expect, test } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createShiftReadySchedule, settleFrames } from './support/tripsWorkspace';

test.setTimeout(60_000);

test('duplicates a Runtime time band into the draft and discards it without saving', async ({ page }) => {
  await createShiftReadySchedule(page);
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  await expect(runtimeSection.getByLabel('Time band 1 segment 1')).toHaveValue(':07');
  const firstBandStart = await runtimeSection.getByLabel('Time band 1 start').inputValue();
  const firstBandEnd = await runtimeSection.getByLabel('Time band 1 end').inputValue();

  await runtimeSection.getByRole('button', { name: 'Duplicate time band 1' }).click();
  await expect(runtimeSection.getByLabel('Time band 2 start')).toHaveValue(firstBandStart);
  await expect(runtimeSection.getByLabel('Time band 2 end')).toHaveValue(firstBandEnd);
  await expect(runtimeSection.getByLabel('Time band 2 segment 1')).toHaveValue(':07');
  await expect(runtimeSection.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  expect(await runInPage(page, 'return (await e.db.runtimeProfiles.toArray()).map((profile) => profile.bands.length)')).toEqual([1]);

  await runtimeSection.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(runtimeSection.getByLabel('Time band 2 start')).toHaveCount(0);
  await expect(runtimeSection.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(await runInPage(page, 'return (await e.db.runtimeProfiles.toArray()).map((profile) => profile.bands.length)')).toEqual([1]);
});

test('Build Trips uses a right drawer and supports inclusive last-trip and count limits', async ({ page }) => {
  await createShiftReadySchedule(page);
  const tripsSection = page.locator('[aria-label="Trips section"]');
  const openBuildDrawer = async () => {
    await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
    await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Build trips…' }).click();
    const drawer = page.getByRole('complementary', { name: 'Build Trips' });
    await drawer.getByLabel('Pattern').selectOption({ index: 1 });
    return drawer;
  };

  const byLastTrip = await openBuildDrawer();
  await byLastTrip.getByLabel('First Trip').fill('05:00');
  await byLastTrip.getByLabel('Headway').fill('15');
  await byLastTrip.getByLabel('Last Trip').fill('06:00');
  await expect(byLastTrip.getByLabel('Number of Trips')).toBeDisabled();
  await byLastTrip.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(6);

  const byCount = await openBuildDrawer();
  await byCount.getByLabel('First Trip').fill('07:00');
  await byCount.getByLabel('Headway').fill('10');
  await byCount.getByLabel('Number of Trips').fill('3');
  await expect(byCount.getByLabel('Last Trip')).toBeDisabled();
  await byCount.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(9);
  await expect(page.locator('.schedule-table')).toContainText('7:20');
});

test('regeneration preview shows signed time and Run Time changes for each anchor', async ({ page }) => {
  await createShiftReadySchedule(page);
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  await runtimeSection.getByLabel('Time band 1 segment 1').fill(':10:30');
  await runtimeSection.getByLabel('Time band 1 segment 1').press('Tab');
  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText('Run Times Have Changed')).toBeVisible();
  await page.locator('.schedule-table tbody input[type="checkbox"]').check();
  await expect(page.locator('.schedule-table tbody input[type="checkbox"]').first()).toBeChecked();
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Regenerate selected…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Regenerate selected trips' });
  await expect(dialog.locator('.preview-times thead th')).toHaveText([
    'Trip', 'Anchor', 'Fixed time', 'First change', 'First: current → new',
    'Last change', 'Last: current → new', 'Run Time change', 'Layover change', 'Layover: current → new',
  ]);
  const cells = dialog.locator('.preview-times tbody tr').first().locator('td');
  await expect(cells.nth(3)).toHaveText('0:00');
  await expect(cells.nth(5)).toHaveText('+0:03:30');
  await expect(cells.nth(7)).toHaveText('+0:03:30');

  await dialog.getByRole('button', { name: 'Last timepoint' }).click();
  await expect(cells.nth(3)).toHaveText('−0:03:30');
  await expect(cells.nth(5)).toHaveText('0:00');
  await expect(cells.nth(7)).toHaveText('+0:03:30');
});

test('keeps one regeneration undo through reload and restores the prior trip times', async ({ page }) => {
  await createShiftReadySchedule(page);
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  await runtimeSection.getByLabel('Time band 1 segment 1').fill(':10:30');
  await runtimeSection.getByLabel('Time band 1 segment 1').press('Tab');
  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();

  const tripsSection = page.locator('[aria-label="Trips section"]');
  await expect(page.getByText('Run Times Have Changed')).toBeVisible();
  const tripCheckbox = page.locator('.schedule-table tbody input[type="checkbox"]').first();
  await tripCheckbox.check();
  await expect(tripCheckbox).toBeChecked();
  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Regenerate selected…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Regenerate selected trips' });
  await dialog.getByRole('button', { name: 'Regenerate trips', exact: true }).click();
  await expect(page.locator('.schedule-table')).toContainText('6:10:30');

  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const actions = page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true });
  await actions.click();
  const menu = page.getByRole('menu', { name: 'Trip actions' });
  const undo = menu.getByRole('menuitem', { name: 'Undo last regeneration (1 Trips)', exact: true });
  await expect(undo).toBeEnabled();
  // Undo is its own item; Regenerate stays in the menu beside it (Decision 0046).
  await expect(menu.getByRole('menuitem', { name: 'Regenerate selected…' })).toBeVisible();
  await undo.click();
  await expect(page.locator('.schedule-table')).toContainText('6:07');
  await actions.click();
  await expect(page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: /^Undo last regeneration/ })).toHaveCount(0);
});

test('Regenerate stays available while an undo is saved, regenerates only the Trips whose runtimes changed, and replaces the undo', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  await runtimeSection.getByLabel('Time band 1 segment 1').fill(':10:30');
  await runtimeSection.getByLabel('Time band 1 segment 1').press('Tab');
  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Run Times Have Changed')).toBeVisible();

  const tripsSection = page.locator('[aria-label="Trips section"]');
  const openMenu = async () => {
    await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
    return page.getByRole('menu', { name: 'Trip actions' });
  };
  // No regeneration has happened yet, so there is nothing to undo and the menu shows no Undo item.
  let menu = await openMenu();
  await expect(menu.getByRole('menuitem', { name: /^Undo last regeneration/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Regenerate one Trip; the other two still have changed runtimes.
  await page.locator('.schedule-table tbody input[type="checkbox"]').first().check();
  menu = await openMenu();
  await menu.getByRole('menuitem', { name: 'Regenerate selected…' }).click();
  await page.getByRole('dialog', { name: 'Regenerate selected trips' }).getByRole('button', { name: 'Regenerate trips', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Regenerate selected trips' })).toHaveCount(0);

  // The undo is offered, and Regenerate is still in the menu; it is disabled only until a Trip with changed runtimes is selected.
  menu = await openMenu();
  await expect(menu.getByRole('menuitem', { name: 'Undo last regeneration (1 Trips)', exact: true })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Regenerate selected…' })).toBeDisabled();
  await page.keyboard.press('Escape');

  // Select all, which includes the Trip that no longer needs it: only the two Trips with changed runtimes are regenerated.
  await page.getByRole('checkbox', { name: 'Select all trips' }).check();
  menu = await openMenu();
  await expect(menu.getByRole('menuitem', { name: 'Regenerate selected…' })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Regenerate selected…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Regenerate selected trips' });
  await expect(dialog.locator('.preview-times tbody tr')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Regenerate trips', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Run Times Have Changed')).toHaveCount(0);

  // The new regeneration replaced the earlier undo.
  menu = await openMenu();
  await expect(menu.getByRole('menuitem', { name: 'Undo last regeneration (2 Trips)', exact: true })).toBeEnabled();
});

test('restores the page scroll position after committing a shift', async ({ page }) => {
  // Decision 0035 item 5: Trips scrolls at page level. The schedule region is not a vertical scroller, so the page position is what
  // must survive a committed Shift.
  await page.setViewportSize({ width: 1280, height: 600 });
  await createShiftReadySchedule(page, '12:00');
  const table = page.locator('.trips-workspace .schedule-table');
  await expect(table).toHaveCSS('max-height', 'none');
  expect(await table.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeGreaterThan(300);

  await page.locator('.schedule-table tbody input[type="checkbox"]').nth(8).check();
  const tripsSection = page.locator('[aria-label="Trips section"]');
  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Shift selected…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  await drawer.getByRole('button', { name: /min later/ }).click();
  await expect(page.getByText('Staged 1 minute later')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(300);
  await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(table.locator('tbody tr').nth(8)).toContainText('7:21');
  await settleFrames(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(300);
});

test('stages Shift actions, guards scope changes, and persists only on Done', async ({ page }) => {
  await createShiftReadySchedule(page);

  const tripsSection = page.locator('[aria-label="Trips section"]');
  await page.locator('.schedule-table tbody input[type="checkbox"]').check();
  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Shift selected…' }).click();

  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: /min earlier/ }).click();
  await expect(page.getByText('Staged 1 minute earlier')).toBeVisible();
  await expect(page.locator('.schedule-table')).toContainText('5:59');

  await page.locator('.route-picker').getByLabel('Day').selectOption({ index: 1 });
  await expect(page.getByRole('heading', { name: 'Discard staged shift?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discard staged shift?' })).toHaveCount(0);

  await drawer.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Staged 1 minute earlier')).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByText('Staged 1 minute earlier')).toBeVisible();
  await drawer.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('.schedule-table')).toContainText('6:00');

  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Shift selected…' }).click();
  await drawer.getByRole('button', { name: /min later/ }).click();
  await expect(page.getByText('Staged 1 minute later')).toBeVisible();
  await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('.schedule-table')).toContainText('6:01');

  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table')).toContainText('6:01');
});

test('shift-click selects the inclusive range in the Trips table', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const checkboxes = page.locator('.schedule-table tbody input[type="checkbox"]');
  await checkboxes.nth(0).click();
  await checkboxes.nth(2).click({ modifiers: ['Shift'] });
  await expect(checkboxes).toHaveCount(3);
  await expect(checkboxes.nth(0)).toBeChecked();
  await expect(checkboxes.nth(1)).toBeChecked();
  await expect(checkboxes.nth(2)).toBeChecked();
});
