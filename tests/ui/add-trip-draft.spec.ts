// Package F1, item 1: an Add-trip row with a Pattern or a first time entered is not dropped silently when the service day, Direction,
// Trip Profile, or tab changes. It asks Cancel or Discard first; an empty row is dropped without a question.
import { expect, test, type Page } from '@playwright/test';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { runCommand, scopeField } from './support/ui';

test.setTimeout(150_000);
test.use({ actionTimeout: 15_000 });

const tripsSection = (page: Page) => page.locator('[aria-label="Trips section"]');
const draftRow = (page: Page) => page.locator('.schedule-table tbody tr.draft-trip-row');
const draftDialog = (page: Page) => page.getByRole('heading', { name: 'Discard new Trip?' });
const draftDialogBox = (page: Page) => page.getByRole('dialog', { name: 'Discard new Trip?' });
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
  { name: 'service day', change: (page) => scopeField(page, 'Day').selectOption({ index: 1 }).then(() => undefined), unchanged: (page) => scopeField(page, 'Day').inputValue() },
  { name: 'Direction', change: (page) => scopeField(page, 'Direction').selectOption({ index: 1 }).then(() => undefined), unchanged: (page) => scopeField(page, 'Direction').inputValue() },
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
    await expect(draftDialogBox(page).getByRole('button')).toHaveText(['Cancel', 'Discard']);
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
  const day = scopeField(page, 'Day');
  const original = await day.inputValue();

  await openDraft(page, 'pattern');
  await day.selectOption({ index: 1 });
  await expect(draftDialog(page)).toBeVisible();
  await draftDialogBox(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(day).toHaveValue(original);
  await draftRow(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(draftRow(page)).toHaveCount(0);

  await openDraft(page, 'nothing');
  await day.selectOption({ index: 1 });
  await expect(draftDialog(page)).toHaveCount(0);
  await expect(day).not.toHaveValue(original);
  await expect(draftRow(page)).toHaveCount(0);
});

test('with a staged Shift and an entered row open, each press asks one question: the staged Shift first, then the row', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  await openDraft(page, 'time');
  // A staged Shift needs a selected Trip, and Add trip is disabled while one is staged, so stage first with the row already open.
  await page.locator('.schedule-table tbody input[type="checkbox"]').first().check();
  await runCommand(page, 'trips.shift');
  await page.getByRole('complementary', { name: 'Shift selected Trips' }).getByRole('button', { name: /min earlier/ }).click();
  await expect(page.getByText('Staged 1 minute earlier')).toBeVisible();

  const day = scopeField(page, 'Day');
  const original = await day.inputValue();
  await day.selectOption({ index: 1 });
  await expect(shiftDialog(page)).toBeVisible();
  await expect(draftDialog(page)).toHaveCount(0);
  await shiftDialogBox(page).getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(shiftDialog(page)).toHaveCount(0);
  await expect(draftDialog(page)).toBeVisible();
  await expect(day).toHaveValue(original);
  await draftDialogBox(page).getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(draftDialog(page)).toHaveCount(0);
  await expect(day).not.toHaveValue(original);
});

test('saving the Runtime profile keeps an entered Add-trip row', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  await openDraft(page, 'time');
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  const firstSegment = runtimeSection.getByLabel('Time band 1 segment 1');
  await firstSegment.fill(':09');
  await firstSegment.press('Tab');
  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(runtimeSection.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLInputElement>('[aria-label="Time band 1 segment 1"]')?.value)).toBe(':09');
  // The save's reload of the Trips follows the write; give it time to land before looking at the row.
  await page.waitForTimeout(1500);
  await expect(draftDialog(page)).toHaveCount(0);
  await expect(draftRow(page)).toHaveCount(1);
  await expect(draftRow(page).getByLabel('First trip time')).toHaveValue('09:30');
});
