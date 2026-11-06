import { expect, test } from '@playwright/test';
import { seedSnapshot } from './support/dexieEnv';
import { goldenRaw } from './support/goldenFixture';
import { chooseScope, scopeField } from './support/ui';

test.setTimeout(90_000);

// Decision 0052. In the Federal BRT golden project the Sunday and Holiday timetables are identical, Saturday shares 193 of its
// 260 blocked Trips with Holiday, and Weekday shares 37 of 276. The three sources show the exact, acknowledged, and refused states.
test('copies blocks from another day with exact, acknowledged, and refused matches', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Holiday' });
  await expect(scopeField(page, 'Blocking scenario')).toHaveValue(/.+/);

  await page.getByRole('button', { name: 'Blocks actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy blocks from another day…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Copy blocks' });
  await expect(dialog).toContainText('To Holiday');
  const source = dialog.getByLabel('Source day');
  const copy = dialog.getByRole('button', { name: 'Copy blocks', exact: true });

  // Weekday: 37 of 276 match, below the 50% threshold. No acknowledgment is offered.
  await source.selectOption({ label: 'Weekday' });
  await expect(dialog).toContainText('Only 37 of 276 trips');
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(copy).toBeDisabled();

  // Saturday: 193 of 260 match. The copy needs the checkbox.
  await source.selectOption({ label: 'Saturday' });
  await expect(dialog).toContainText('67 trips not found on Holiday');
  const acknowledge = dialog.getByRole('checkbox', { name: /Copy anyway/ });
  await expect(copy).toBeDisabled();
  await acknowledge.check();
  await expect(copy).toBeEnabled();

  // Sunday: identical timetable. Normal confirmation.
  await source.selectOption({ label: 'Sunday' });
  await expect(dialog).toContainText('Every trip matches a Holiday trip exactly.');
  await expect(dialog.getByRole('table', { name: 'Trip matches by route' })).toContainText('224');
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Unable to', { exact: false })).toHaveCount(0);
});
