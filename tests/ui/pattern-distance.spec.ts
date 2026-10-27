// Review package P15 (finding 4-014 and the 2026-10-23 decision). A Pattern whose distance was never entered (a total of 0, the rule that
// Blocking uses for incomplete mileage, P12) shows "incomplete" for its segment miles instead of "0.00". Every other value is unchanged.
import { expect, test } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { editGridCell, gridCell } from './support/ui';

test.setTimeout(120_000);

test('a Pattern with no distance shows "incomplete" for its segment miles, and the miles once a distance is entered', async ({ page }) => {
  await createRouteWithPattern(page, 'Pattern distance');
  const segments = page.locator('.pattern-editor tbody tr output');
  await expect(segments).toHaveText(['incomplete', 'incomplete']);
  await expect(page.locator('.pattern-editor')).not.toContainText('0.00');

  const distance = gridCell(page, 'Point 2 cumulative miles');
  await editGridCell(distance, '4.5');
  // The first point has no segment before it; its 0.00 is unchanged.
  await expect(segments).toHaveText(['0.00', '4.50']);

  await editGridCell(distance, '0');
  await expect(segments).toHaveText(['incomplete', 'incomplete']);
});
