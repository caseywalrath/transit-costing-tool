import { expect, test } from '@playwright/test';

test('keeps Node and Pattern drafts local until their explicit saves', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.locator('#dialog-name').fill('Draft verification');
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  await page.getByRole('button', { name: 'Add route', exact: true }).click();

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
