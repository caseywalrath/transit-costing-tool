// Package F1, item 1: an Add-trip row with a Pattern or a first time entered is not dropped silently when the service day, Direction,
// Trip Profile, or tab changes. It asks Cancel or Discard first; an empty row is dropped without a question.
import { expect, test, type Page } from '@playwright/test';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { editRuntimeCell, runCommand, chooseScope, scopeValue, shiftBar } from './support/ui';

test.setTimeout(150_000);
test.use({ actionTimeout: 15_000 });

const tripsSection = (page: Page) => page.locator('[aria-label="Trips section"]');
const draftRow = (page: Page) => page.locator('.schedule-table tbody tr.draft-trip-row');
const draftDialog = (page: Page) => page.getByRole('heading', { name: 'Discard new trip?' });
const draftDialogBox = (page: Page) => page.getByRole('dialog', { name: 'Discard new trip?' });
const shiftDialogBox = (page: Page) => page.getByRole('dialog', { name: 'Discard staged shift?' });
const shiftDialog = (page: Page) => page.getByRole('heading', { name: 'Discard staged shift?' });
const profileMenuButton = (page: Page) => tripsSection(page).locator('.menu-field').filter({ hasText: 'Profile' }).getByRole('button');

async function openDraft(page: Page, enter: 'pattern' | 'time' | 'nothing') {
  await runCommand(page, 'trips.add');
  await expect(draftRow(page)).toHaveCount(1);
  if (enter === 'nothing') return;
  await draftRow(page).getByLabel('New trip pattern').selectOption({ index: 1 });
  if (enter === 'time') await draftRow(page).getByLabel('First trip time').fill('09:30');
}

const scopeChanges: Array<{ name: string; change: (page: Page) => Promise<void>; unchanged: (page: Page) => Promise<unknown> }> = [
  { name: 'service day', change: (page) => chooseScope(page, 'Day', { index: 1 }), unchanged: (page) => scopeValue(page, 'Day') },
  { name: 'Direction', change: (page) => chooseScope(page, 'Direction', { index: 1 }), unchanged: (page) => scopeValue(page, 'Direction') },
  { name: 'tab', change: (page) => page.getByRole('button', { name: 'Route', exact: true }).click(), unchanged: (page) => page.getByRole('button', { name: 'Trips', exact: true }).getAttribute('class') },
  {
    name: 'Trip Profile',
    change: async (page) => {
      await profileMenuButton(page).click();
      await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitemradio', { checked: false }).first().click();
    },
    unchanged: (page) => profileMenuButton(page).textContent(),
  },
];

for (const scope of scopeChanges) {
  test(`an entered Add-trip row asks before the ${scope.name} changes`, async ({ page }) => {
    await createShiftReadySchedule(page, '06:10');
    if (scope.name === 'Trip Profile') {
      await profileMenuButton(page).click();
      await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitem', { name: 'Copy profile…' }).click();
      await page.locator('#dialog-name').fill('Alternative');
      await page.getByRole('button', { name: 'Copy', exact: true }).last().click();
      await expect(profileMenuButton(page)).toContainText('Alternative');
      // The copy has its own Trips (a copy of the first profile's), so wait for the table before the draft opens.
      await expect(page.locator('.schedule-table tbody tr:not(.draft-trip-row)')).toHaveCount(2);
    }
    await openDraft(page, 'time');
    const before = await scope.unchanged(page);

    // Cancel keeps the row, its entries, and the scope.
    await scope.change(page);
    await expect(draftDialog(page)).toBeVisible();
    await expect(draftDialogBox(page).getByRole('button')).toHaveText(['Cancel', 'Discard', 'Save']);
    await draftDialogBox(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(draftDialog(page)).toHaveCount(0);
    await expect(draftRow(page)).toHaveCount(1);
    await expect(draftRow(page).getByLabel('First trip time')).toHaveValue('09:30');
    expect(await scope.unchanged(page)).toEqual(before);

    // Discard changes the scope and drops the row.
    await scope.change(page);
    await expect(draftDialog(page)).toBeVisible();
    await draftDialogBox(page).getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(draftDialog(page)).toHaveCount(0);
    await expect.poll(() => scope.unchanged(page)).not.toEqual(before);
    if (scope.name !== 'tab') await expect(draftRow(page)).toHaveCount(0);
  });
}

test('a Pattern alone counts as entered, and an empty Add-trip row is dropped without a question', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  const original = await scopeValue(page, 'Day');

  await openDraft(page, 'pattern');
  await chooseScope(page, 'Day', { index: 1 });
  await expect(draftDialog(page)).toBeVisible();
  // The row has no first time yet, so it cannot be saved and the dialog offers no Save.
  await expect(draftDialogBox(page).getByRole('button')).toHaveText(['Cancel', 'Discard']);
  await draftDialogBox(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => scopeValue(page, 'Day')).toBe(original);
  await draftRow(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(draftRow(page)).toHaveCount(0);

  await openDraft(page, 'nothing');
  await chooseScope(page, 'Day', { index: 1 });
  await expect(draftDialog(page)).toHaveCount(0);
  await expect.poll(() => scopeValue(page, 'Day')).not.toBe(original);
  await expect(draftRow(page)).toHaveCount(0);
});

test('with a staged Shift and an entered row open, each press asks one question: the staged Shift first, then the row', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  await openDraft(page, 'time');
  // A staged Shift needs a selected Trip, and Add trip is disabled while one is staged, so stage first with the row already open.
  await page.locator('.schedule-table tbody input[type="checkbox"]').first().check();
  await runCommand(page, 'trips.shift');
  await shiftBar(page).getByRole('button', { name: /min earlier/ }).click();
  await expect(page.getByText('Staged 1 minute earlier')).toBeVisible();

  const original = await scopeValue(page, 'Day');
  await chooseScope(page, 'Day', { index: 1 });
  await expect(shiftDialog(page)).toBeVisible();
  await expect(draftDialog(page)).toHaveCount(0);
  await shiftDialogBox(page).getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(shiftDialog(page)).toHaveCount(0);
  await expect(draftDialog(page)).toBeVisible();
  await expect.poll(() => scopeValue(page, 'Day')).toBe(original);
  await draftDialogBox(page).getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(draftDialog(page)).toHaveCount(0);
  await expect.poll(() => scopeValue(page, 'Day')).not.toBe(original);
});

test('saving the Runtime profile keeps an entered Add-trip row', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  await openDraft(page, 'time');
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  await editRuntimeCell(runtimeSection, 'Time band 1 segment 1', ':09');
  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(runtimeSection.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-cell="Time band 1 segment 1"]')?.textContent)).toBe(':09');
  // The save's reload of the Trips follows the write; give it time to land before looking at the row.
  await page.waitForTimeout(1500);
  await expect(draftDialog(page)).toHaveCount(0);
  await expect(draftRow(page)).toHaveCount(1);
  await expect(draftRow(page).getByLabel('First trip time')).toHaveValue('09:30');
});

test('Save in the Discard-new-trip dialog adds the row and then changes the scope', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  const original = await scopeValue(page, 'Day');
  const rows = page.locator('.schedule-table tbody tr:not(.draft-trip-row)');
  const before = await rows.count();
  await openDraft(page, 'time');
  await chooseScope(page, 'Day', { index: 1 });
  await draftDialogBox(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(draftDialog(page)).toHaveCount(0);
  await expect.poll(() => scopeValue(page, 'Day')).not.toBe(original);
  await chooseScope(page, 'Day', { value: original });
  await expect(rows).toHaveCount(before + 1);
});

test('Save in the Discard-staged-shift dialog applies the shift and then changes the scope', async ({ page }) => {
  await createShiftReadySchedule(page);
  await page.locator('.schedule-table tbody input[type="checkbox"]').check();
  await runCommand(page, 'trips.shift');
  await shiftBar(page).getByRole('button', { name: /min later/ }).click();
  await expect(page.getByText('Staged 1 minute later')).toBeVisible();
  const original = await scopeValue(page, 'Day');
  await chooseScope(page, 'Day', { index: 1 });
  await expect(shiftDialogBox(page).getByRole('button')).toHaveText(['Cancel', 'Discard', 'Save']);
  await shiftDialogBox(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(shiftDialog(page)).toHaveCount(0);
  await expect.poll(() => scopeValue(page, 'Day')).not.toBe(original);
  await chooseScope(page, 'Day', { value: original });
  await expect(page.locator('.schedule-table')).toContainText('6:01');
});
