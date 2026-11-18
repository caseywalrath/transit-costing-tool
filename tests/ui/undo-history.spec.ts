// FX4 (Decision 0081): the Undo notice, Undo in the Project menu, the Undo history dialog, and restoring a deleted project.
import { expect, test, type Page } from '@playwright/test';
import { goldenWithAltProfile } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(90_000);

const notice = (page: Page) => page.locator('.notice');
const profileCount = (page: Page) => runInPage(page, 'return await e.db.tripProfiles.count()');

async function open(page: Page) {
  await seedSnapshot(page, { ...goldenWithAltProfile(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
}

/** Deletes the Trip profile named `name` from the Trips tab. */
async function deleteTripProfile(page: Page, name: string) {
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const profileButton = page.getByRole('region', { name: 'Scope', exact: true }).getByRole('button', { name: /^Trip profile: / });
  await expect(profileButton).toBeVisible();
  if (!(await profileButton.textContent())?.includes(name)) {
    await profileButton.click();
    await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitemradio', { name }).click();
    await expect(profileButton).toContainText(name);
  }
  await profileButton.click();
  await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitem', { name: 'Delete profile…' }).click();
  await page.getByRole('alertdialog').filter({ hasText: 'Delete trip profile?' }).getByRole('button', { name: 'Delete trip profile', exact: true }).click();
}

test('deleting a Trip profile shows an Undo notice that names it, and Undo brings it back', async ({ page }) => {
  await open(page);
  const before = await profileCount(page);
  await deleteTripProfile(page, 'Alt');
  await expect(notice(page)).toContainText('Deleted trip profile Alt');
  await expect.poll(() => profileCount(page)).toBe(before - 1);
  await notice(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => profileCount(page)).toBe(before);
  await expect(notice(page)).toContainText('Undid: Deleted trip profile Alt');
});

test('the Project menu offers Undo for the newest change of the open project', async ({ page }) => {
  await open(page);
  const before = await profileCount(page);
  await deleteTripProfile(page, 'Alt');
  await expect(notice(page)).toContainText('Deleted trip profile Alt');
  await notice(page).getByRole('button', { name: 'Dismiss message' }).click();
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'Undo deleted trip profile Alt', exact: true }).click();
  await expect.poll(() => profileCount(page)).toBe(before);
});

test('Undo history explains a restore point that cannot be restored, and restores one that can', async ({ page }) => {
  await open(page);
  await deleteTripProfile(page, 'Alt');
  await expect(notice(page)).toContainText('Deleted trip profile Alt');
  // Recreate a record the restore would bring back: the same id, so the restore is refused.
  await runInPage(page, "const point = (await e.db.restorePoints.toArray())[0]; const payload = await e.db.restorePointPayloads.get(point.id); const profile = payload.change.removed.tripProfiles[0]; await e.db.tripProfiles.put({ ...profile, name: 'Alt again' });");
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'Undo history…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Undo history' });
  await expect(dialog).toContainText('Deleted trip profile Alt');
  await expect(dialog).toContainText('Changed since: Alt again');
  await expect(dialog.getByRole('button', { name: /^Restore: / })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('a deleted project is restored from the empty state', async ({ page }) => {
  await open(page);
  const projectName = await runInPage(page, 'return (await e.db.projects.toArray())[0].name');
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'Delete project…', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No project' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore deleted project…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Undo history' });
  await expect(dialog).toContainText(`Deleted project ${projectName}`);
  await dialog.getByRole('button', { name: `Restore: Deleted project ${projectName}` }).click();
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: /^Project: / })).toContainText(projectName);
});
