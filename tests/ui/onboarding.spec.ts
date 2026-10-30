// UR-16: a blank database, a project without routes, and a Route without a usable Pattern each show the next action as a button.
import { expect, test } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { editGridCell, gridCell, scopeField } from './support/ui';

test.setTimeout(90_000);

test('the empty screens lead from no project to a new Route, and the setup line tracks the Route', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No project', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore from backup…', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New project…', exact: true }).click();
  await page.locator('#dialog-name').fill('Onboarding');
  await page.getByRole('button', { name: 'New project', exact: true }).last().click();

  await expect(page.getByRole('heading', { name: 'No routes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New route', exact: true }).click();
  const setup = page.getByRole('navigation', { name: 'Route setup' });
  await expect(setup).toBeVisible();
  await expect(setup.getByRole('listitem')).toHaveText(['1Route name', '2Nodes 0/2', '3Pattern, 2+ points', '4Runtimes and trips: Trips tab']);
  await expect(setup.locator('[aria-current="step"]')).toHaveText('1Route name');

  // Each step moves the focus to the control that does it.
  await setup.getByRole('button', { name: /Route name/ }).click();
  await expect(page.getByLabel('Route name')).toBeFocused();
  await page.getByLabel('Route name').fill('Line 1');
  await page.getByLabel('Route name').blur();
  await expect(setup.locator('[aria-current="step"]')).toHaveText('2Nodes 0/2');
  await setup.getByRole('button', { name: /Nodes/ }).click();
  const newNode = page.getByRole('button', { name: 'New node', exact: true });
  await expect(newNode).toBeFocused();
  await expect(newNode).toHaveClass(/primary/);
  await expect(page.getByRole('button', { name: 'Add pattern', exact: true })).toHaveClass(/primary/);

  for (const name of ['A', 'B']) {
    await newNode.click();
    await editGridCell(gridCell(page, 'Node name').last(), name);
    await page.getByRole('button', { name: 'Save nodes', exact: true }).click();
    await expect(page.getByRole('button', { name: `Remove ${name}`, exact: true })).toBeVisible();
  }
  await expect(setup.locator('[aria-current="step"]')).toHaveText('3Pattern, 2+ points');
  await expect(newNode).not.toHaveClass(/primary/);
  await setup.getByRole('button', { name: /Pattern/ }).click();
  await expect(page.getByRole('button', { name: 'Add pattern', exact: true })).toBeFocused();
});

test('the setup line is gone once the Route has a usable Pattern, and the Route selector adds a Route', async ({ page }) => {
  await createRouteWithPattern(page, 'Onboarding done');
  await expect(page.getByRole('navigation', { name: 'Route setup' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add pattern', exact: true })).not.toHaveClass(/primary/);

  await scopeField(page, 'Route').selectOption({ label: '+ New route' });
  await expect.poll(() => runInPage(page, 'return await e.db.routes.count()')).toBe(2);
  await expect(page.getByRole('navigation', { name: 'Route setup' })).toBeVisible();
  await expect(scopeField(page, 'Route')).not.toHaveValue('__new-route__');
});

test('Costing without a blocking scenario offers Open Blocking', async ({ page }) => {
  await createRouteWithPattern(page, 'Onboarding costing');
  // A new Scenario starts with a Default Blocking Scenario, so the prerequisite shows only once it is deleted.
  await runInPage(page, 'await e.db.blockingScenarios.clear()');
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await page.getByRole('button', { name: 'Open Blocking', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Blocking', exact: true })).toHaveAttribute('aria-current', /page|true/);
});
