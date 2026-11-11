// Decision 0068: the heading of a modal dialog is its drag handle. Dragging moves the dialog, keeps the handle on screen, and each
// dialog opens centered. Dragging is off at 600 px and narrower, and for the cost summary (`draggable={false}`).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedCostingFixture } from './support/costingFixture';
import { projectSwitcher } from './support/ui';

test.use({ viewport: { width: 1280, height: 800 } });

/** Opens the New project dialog from the Project menu. The page is already at '/'. */
async function openNewProjectDialog(page: Page): Promise<Locator> {
  await projectSwitcher(page).click();
  await page.getByRole('menuitem', { name: 'New project…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New project', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Presses the handle 24 px from its left edge, at its middle height, and drags the pointer to (`toX`, `toY`) in ten steps. */
async function dragTo(page: Page, handle: Locator, toX: number, toY: number) {
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 24, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 10 });
  await page.mouse.up();
}

/** The pointer moves the same distance from where it pressed the handle. */
async function dragBy(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!;
  await dragTo(page, handle, box.x + 24 + dx, box.y + box.height / 2 + dy);
}

test('dragging the heading moves the dialog by the pointer distance', async ({ page }) => {
  await page.goto('/');
  const dialog = await openNewProjectDialog(page);
  const heading = dialog.getByRole('heading', { name: 'New project', exact: true });
  const before = (await dialog.boundingBox())!;

  await dragBy(page, heading, 200, 100);

  const after = (await dialog.boundingBox())!;
  expect(Math.abs(after.x - before.x - 200)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y - 100)).toBeLessThan(1);
});

test('the dialog stays on screen when dragged past the right, bottom, left, and top edges', async ({ page }) => {
  await page.goto('/');
  const dialog = await openNewProjectDialog(page);
  const heading = dialog.getByRole('heading', { name: 'New project', exact: true });

  await dragTo(page, heading, 1279, 799);
  const corner = (await heading.boundingBox())!;
  expect(corner.x + corner.width).toBeLessThanOrEqual(1280 + 0.5);
  expect(corner.y + corner.height).toBeLessThanOrEqual(800 + 0.5);

  await dragTo(page, heading, 0, 0);
  const origin = (await heading.boundingBox())!;
  expect(origin.x).toBeGreaterThanOrEqual(-0.5);
  expect(origin.y).toBeGreaterThanOrEqual(-0.5);
});

test('a press on a button inside the dialog does not drag it', async ({ page }) => {
  await page.goto('/');
  const dialog = await openNewProjectDialog(page);
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
  const before = (await dialog.boundingBox())!;
  const box = (await cancel.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 100, { steps: 10 });
  await page.mouse.up();

  await expect(dialog).toBeVisible();
  expect(await dialog.boundingBox()).toEqual(before);
});

test('after a drag, Tab stays inside, Escape closes, and the next opening is centered', async ({ page }) => {
  await page.goto('/');
  const dialog = await openNewProjectDialog(page);
  await dragBy(page, dialog.getByRole('heading', { name: 'New project', exact: true }), 200, 100);

  for (let step = 0; step < 3; step++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  const reopened = await openNewProjectDialog(page);
  const box = (await reopened.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(1);
  expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThan(1);
});

test('at 600 px wide or narrower the dialog does not move', async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 800 });
  await page.goto('/');
  const dialog = await openNewProjectDialog(page);
  const heading = dialog.getByRole('heading', { name: 'New project', exact: true });
  const before = (await dialog.boundingBox())!;

  await dragBy(page, heading, 100, 100);

  expect(await dialog.boundingBox()).toEqual(before);
  expect(await heading.evaluate((element) => getComputedStyle(element).cursor)).toBe('auto');
});

test('the cost summary sheet does not move', async ({ page }) => {
  await seedCostingFixture(page);
  await page.reload();
  await page.getByRole('button', { name: 'Costing' }).click();
  await page.getByRole('button', { name: 'Costing actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'View cost summary…', exact: true }).click();
  const warning = page.getByRole('alertdialog', { name: 'This estimate is partial' });
  await warning.getByRole('button', { name: 'Open summary', exact: true }).click();

  const sheet = page.getByRole('dialog', { name: 'Operating Cost Estimate' });
  await expect(sheet).toBeVisible();
  const heading = sheet.getByRole('heading', { name: 'Operating Cost Estimate', exact: true });
  const before = (await sheet.boundingBox())!;

  await dragBy(page, heading, 200, 100);

  expect(await sheet.boundingBox()).toEqual(before);
  expect(await heading.evaluate((element) => element.classList.contains('modal-drag-handle'))).toBe(false);
});
