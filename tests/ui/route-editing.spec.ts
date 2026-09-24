import { expect, test } from '@playwright/test';

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

  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await page.getByLabel('Node name').fill('A');
  await page.getByRole('button', { name: 'Save nodes', exact: true }).click();
  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await page.getByLabel('Node name').last().fill('B');
  await page.getByRole('button', { name: 'Save nodes', exact: true }).click();

  await page.getByRole('button', { name: 'Add pattern', exact: true }).click();
  await expect(page.getByText('New Pattern — not saved')).toBeVisible();
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await page.getByLabel('Point 2 node').selectOption({ label: 'B' });
  await page.getByRole('button', { name: 'Save Pattern', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save Pattern and rebalance?' })).toBeVisible();
  await page.getByRole('button', { name: 'Save and rebalance', exact: true }).click();
  await expect(page.getByText('New Pattern — not saved')).toHaveCount(0);

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
});
