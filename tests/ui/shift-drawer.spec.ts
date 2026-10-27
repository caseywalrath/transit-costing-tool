import { expect, test } from '@playwright/test';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { runCommand } from './support/ui';

// U10: the compact Shift drawer. The step buttons name their size and direction; a step size is one press away, or typed.
test('step sizes are chosen with one press or typed, the buttons name the step, and an invalid step is refused', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const rows = page.locator('.schedule-table tbody tr');
  await rows.first().locator('input[type="checkbox"]').check();
  await runCommand(page, 'trips.shift');
  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  const status = drawer.getByRole('status');
  await expect(status).toHaveText('No net shift1 selected');

  await drawer.getByRole('radio', { name: '10', exact: true }).check();
  await expect(drawer.getByLabel('Step minutes')).toHaveValue('10');
  await drawer.getByRole('button', { name: '10 min later' }).click();
  await expect(status).toContainText('10 minutes later');
  await expect(rows.first()).toContainText('Staged 10 minutes later');

  const step = drawer.getByLabel('Step minutes');
  await step.fill('0');
  await expect(step).toHaveAttribute('aria-invalid', 'true');
  await expect(drawer.getByText('Enter a whole number of minutes above 0.')).toBeVisible();
  await expect(drawer.getByRole('button', { name: /earlier/ })).toBeDisabled();
  await expect(drawer.getByRole('button', { name: /later/ })).toBeDisabled();

  await step.fill('3');
  await expect(drawer.getByRole('radio', { checked: true })).toHaveCount(0);
  await drawer.getByRole('button', { name: '3 min earlier' }).click();
  await expect(status).toContainText('7 minutes later');
  await drawer.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(status).toContainText('10 minutes later');
  await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(rows.first()).toContainText('6:10');
});

test('the step sizes are a keyboard radio group', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await page.locator('.schedule-table tbody tr').first().locator('input[type="checkbox"]').check();
  await runCommand(page, 'trips.shift');
  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  // The drawer previews the selection as it opens and disables its controls until that is done; when the preview ends, a control
  // that lost the focus to the disabled state gives it to the first step button. A step size focused before then loses the focus
  // (the cause of intermittent CI failures), so wait until the step buttons are enabled, which happens only after the preview.
  const one = drawer.getByRole('radio', { name: '1', exact: true });
  await expect(drawer.getByRole('button', { name: /min earlier/ })).toBeEnabled();
  await expect(one).toBeEnabled();
  await one.focus();
  await expect(one).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(drawer.getByRole('radio', { name: '5', exact: true })).toBeChecked();
  await expect(drawer.getByRole('button', { name: '5 min later' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
});
