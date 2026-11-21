// DN2 (Decision 0088): direction names in Route details. A rename is kept after a reload and shown in the Direction toggle, the Pattern
// Direction picker and the generated pattern short name; a name equal to the other direction's is refused; a blank field restores the
// default. Real IndexedDB.
import { expect, test, type Page } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';

test.setTimeout(120_000);

// The suggestion list makes each name field a combobox.
const field = (page: Page, label: string) => page.getByRole('combobox', { name: label, exact: true });

async function commit(page: Page, label: string, value: string) {
  await field(page, label).fill(value);
  await field(page, label).press('Enter');
}

test('direction names are renamed, kept, refused when equal, and reset when blank', async ({ page }) => {
  await createRouteWithPattern(page, 'Direction names');
  await expect(field(page, 'Inbound name')).toHaveAttribute('placeholder', 'Inbound');
  await expect(field(page, 'Inbound name')).toHaveValue('');

  await commit(page, 'Outbound name', 'Southbound');
  await commit(page, 'Inbound name', 'Northbound');
  await expect(page.locator('.pattern-editor select').first().locator('option')).toHaveText(['Southbound', 'Northbound']);

  await page.reload();
  await expect(field(page, 'Outbound name')).toHaveValue('Southbound');
  await expect(field(page, 'Inbound name')).toHaveValue('Northbound');
  // The pattern is in the Outbound group: its Direction picker and generated short name use the new name.
  await expect(page.locator('.pattern-editor select').first().locator('option:checked')).toHaveText('Southbound');
  await expect(page.getByRole('textbox', { name: 'Pattern short name', exact: true })).toHaveAttribute('placeholder', /SB/);

  await commit(page, 'Inbound name', 'southbound');
  await expect(page.getByRole('alert').filter({ hasText: 'Each direction needs its own name.' })).toBeVisible();
  await expect(field(page, 'Inbound name')).toHaveValue('Northbound');

  // The Trips tab Direction toggle shows the names.
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const toggle = page.getByRole('radiogroup', { name: 'Direction' });
  await expect(toggle.getByRole('radio', { name: 'Southbound' })).toBeVisible();
  await expect(toggle.getByRole('radio', { name: 'Northbound' })).toBeVisible();
  await page.getByRole('button', { name: 'Route', exact: true }).click();

  await commit(page, 'Inbound name', '');
  await expect(page.locator('.pattern-editor select').first().locator('option')).toHaveText(['Southbound', 'Inbound']);
  await page.reload();
  await expect(field(page, 'Inbound name')).toHaveValue('');
  await expect(field(page, 'Inbound name')).toHaveAttribute('placeholder', 'Inbound');
});

// Screenshots and heights for review, only when DN_SHOTS names an output folder.
test('Route details is no taller than Annual service days', async ({ page }) => {
  await createRouteWithPattern(page, 'Direction names layout');
  await commit(page, 'Inbound name', 'Northbound');
  for (const width of [1440, 1200, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const height = async (title: string) => (await page.locator('.route-top-grid > *').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).boundingBox())!.height;
    const details = await height('Route details');
    const days = await height('Annual service days');
    if (width > 1100) expect(details).toBeLessThanOrEqual(days);
    if (process.env.DN_SHOTS) await page.locator('.route-top-grid').screenshot({ path: `${process.env.DN_SHOTS}/route-top-${width}.png` });
    if (process.env.DN_SHOTS) console.log(`${width}px: Route details ${Math.round(details)} px, Annual service days ${Math.round(days)} px`);
  }
});
