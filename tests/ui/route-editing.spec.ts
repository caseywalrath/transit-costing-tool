// Review package P05 (finding 5-017): the drafts and the Route lifecycle are checked against stored IndexedDB data and after a reload,
// not only against what the page shows.
import { expect, test } from '@playwright/test';
import { runInPage } from './support/dexieEnv';

test('keeps Node and Pattern drafts local until their explicit saves', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
  await page.locator('#dialog-name').fill('Draft verification');
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  await page.getByRole('button', { name: 'Route actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New route', exact: true }).click();

  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await page.getByLabel('Node name').fill('Unsaved node');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).first().click();
  await expect(page.getByLabel('Node name')).toHaveCount(0);
  expect(await runInPage(page, 'return await e.db.nodes.count()')).toBe(0);

  // Wait for each save to settle before the next step: a late reload would replace the draft the next step just created (L-16).
  const saveNodes = page.getByRole('button', { name: 'Save nodes', exact: true });
  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await page.getByLabel('Node name').fill('A');
  await saveNodes.click();
  await expect(saveNodes).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove A', exact: true })).toBeVisible();
  await expect.poll(() => runInPage(page, 'return await e.db.nodes.count()')).toBe(1);
  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await page.getByLabel('Node name').last().fill('B');
  await saveNodes.click();
  await expect(saveNodes).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove B', exact: true })).toBeVisible();
  // "Save nodes" is disabled from the moment the save starts, so it does not show that the save has finished. Wait for the stored rows;
  // "Add pattern" is also disabled until the save's reload has landed (finding L-16).
  await expect.poll(() => runInPage(page, 'return await e.db.nodes.count()')).toBe(2);

  await page.getByRole('button', { name: 'Add pattern', exact: true }).click();
  await expect(page.getByText('New Pattern — not saved')).toBeVisible();
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await expect(page.getByLabel('Point 1 node')).toBeVisible();
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await expect(page.getByLabel('Point 2 node')).toBeVisible();
  await page.getByLabel('Point 2 node').selectOption({ label: 'B' });
  await page.getByRole('button', { name: 'Save Pattern', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save Pattern and rebalance?' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and rebalance', exact: true }).click();
  await expect(page.getByText('New Pattern — not saved')).toHaveCount(0);

  // The saves reached IndexedDB and survive a reload.
  expect(await runInPage(page, 'return [(await e.db.nodes.toArray()).map((node) => node.name).sort(), await e.db.patterns.count()]')).toEqual([['A', 'B'], 1]);
  await page.reload();
  await expect(page.getByLabel('Node name')).toHaveCount(2);
  expect((await page.getByLabel('Node name').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).sort()).toEqual(['A', 'B']);
  await expect(page.getByLabel('Point 2 node').locator('option:checked')).toHaveText('B');
  await expect(page.getByRole('complementary', { name: 'Patterns' }).getByRole('button')).toHaveCount(2); // the Pattern, then Add pattern

  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save route changes before leaving?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save route changes before leaving?' })).toHaveCount(0);
});

test('renames and duplicates a Route from the module Actions menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
  await page.locator('#dialog-name').fill('Route lifecycle');
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  const routeActions = page.getByRole('button', { name: 'Route actions', exact: true });
  await routeActions.click();
  await page.getByRole('menuitem', { name: 'New route', exact: true }).click();

  await routeActions.click();
  await page.getByRole('menuitem', { name: 'Rename route', exact: true }).click();
  await page.getByRole('dialog', { name: 'Rename route' }).getByLabel('Route name').fill('Federal');
  await page.getByRole('dialog', { name: 'Rename route' }).getByRole('button', { name: 'Rename', exact: true }).click();
  const routeSelect = page.getByRole('region', { name: 'Route controls' }).getByRole('combobox', { name: 'Route' });
  await expect(routeSelect).toHaveValue(/.+/);
  await expect(routeSelect.locator('option:checked')).toHaveText('Federal');

  await routeActions.click();
  await page.getByRole('menuitem', { name: 'Duplicate route', exact: true }).click();
  await page.getByRole('dialog', { name: 'Duplicate route' }).getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(routeSelect.locator('option')).toHaveCount(3);
  await expect(routeSelect.locator('option:checked')).toHaveText('Federal Copy');

  // Both Routes are stored, and the selection survives a reload.
  expect(await runInPage(page, 'return (await e.db.routes.toArray()).map((route) => route.name).sort()')).toEqual(['Federal', 'Federal Copy']);
  await page.reload();
  await expect(routeSelect.locator('option')).toHaveCount(3);
  await expect(routeSelect.locator('option:checked')).toHaveText('Federal Copy');
});
