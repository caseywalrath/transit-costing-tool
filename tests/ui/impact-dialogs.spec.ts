// Package F1, item 5: two impact dialogs state what they used to leave out.
// The Node save review lists the pull-out, pull-in, and deadhead activities the save removes (`nonRevenueImpact`), and the Trip profile
// delete confirmation states how many Blocking Scenarios (and their Blocks) go with the profile (`blockingScenarioCount`).
import { expect, test, type Page } from '@playwright/test';
import { goldenWithAltProfile } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(90_000);

/** Pull-out, pull-in, and deadhead activities that name `nodeName`, and the Blocks that hold them. */
function nonRevenueReferences(raw: any, nodeName: string) {
  const nodeId = raw.nodes.find((node: any) => node.name === nodeName).id;
  const blockIds = new Set<string>();
  let activities = 0;
  for (const block of raw.blocks) {
    for (const activity of block.activities) {
      if (activity.type !== 'revenueTrip' && (activity.fromNodeId === nodeId || activity.toNodeId === nodeId)) { activities += 1; blockIds.add(block.id); }
    }
  }
  return { activities, blocks: blockIds.size };
}

/**
 * Points the first `count` pull-out and pull-in activities of the golden Blocks at `nodeName`. The golden Blocks name only the terminal
 * Nodes, which a Node save cannot delete (the first point of a Pattern must stay at 0 miles), so the mid-route Node `nodeName` is used.
 */
function pointNonRevenueAt(raw: any, nodeName: string, count: number) {
  const nodeId = raw.nodes.find((node: any) => node.name === nodeName).id;
  let remaining = count;
  for (const block of raw.blocks) {
    for (const activity of block.activities) {
      if (remaining === 0) return raw;
      if (activity.type === 'pullOut') { activity.toNodeId = nodeId; remaining -= 1; }
      else if (activity.type === 'pullIn') { activity.fromNodeId = nodeId; remaining -= 1; }
    }
  }
  return raw;
}

async function openRoute(page: Page, raw: any) {
  await seedSnapshot(page, { ...raw, generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Remove Alameda', exact: true })).toBeVisible({ timeout: 30000 });
}

async function reviewNodeDeletion(page: Page, nodeName: string) {
  await page.getByRole('button', { name: `Remove ${nodeName}`, exact: true }).click();
  await page.getByRole('button', { name: 'Save nodes', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Update service for deleted Nodes?' });
  await expect(dialog).toBeVisible({ timeout: 30000 });
  return dialog;
}

test('the Node save review lists the pull-out, pull-in, and deadhead activities it removes', async ({ page }) => {
  const raw = pointNonRevenueAt(goldenWithAltProfile(), 'Alameda', 3);
  expect(nonRevenueReferences(raw, 'Alameda')).toEqual({ activities: 3, blocks: 2 });
  await openRoute(page, raw);
  const dialog = await reviewNodeDeletion(page, 'Alameda');
  await expect(dialog).toContainText('Removes 3 pull-out, pull-in, or deadhead activities in 2 Blocks.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await runInPage(page, 'return await e.db.nodes.count()')).toBe(11);
});

test('the Node save review uses the singular for one activity in one Block', async ({ page }) => {
  const raw = pointNonRevenueAt(goldenWithAltProfile(), 'Alameda', 1);
  expect(nonRevenueReferences(raw, 'Alameda')).toEqual({ activities: 1, blocks: 1 });
  await openRoute(page, raw);
  const dialog = await reviewNodeDeletion(page, 'Alameda');
  await expect(dialog).toContainText('Removes 1 pull-out, pull-in, or deadhead activity in 1 Block.');
});

test('the Node save review shows no such line when no pull-out, pull-in, or deadhead names the Node', async ({ page }) => {
  const raw = goldenWithAltProfile();
  expect(nonRevenueReferences(raw, 'Alameda')).toEqual({ activities: 0, blocks: 0 });
  await openRoute(page, raw);
  const dialog = await reviewNodeDeletion(page, 'Alameda');
  await expect(dialog).toContainText('This will remove the selected Node occurrences');
  await expect(dialog).not.toContainText('pull-out, pull-in, or deadhead');
});

async function openTripProfileDeletion(page: Page, raw: any, profileName: string) {
  await seedSnapshot(page, { ...raw, generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const profileButton = page.locator('[aria-label="Trips section"]').locator('.menu-field').filter({ hasText: 'Profile' }).getByRole('button');
  await expect(profileButton).toBeVisible();
  if (!(await profileButton.textContent())?.includes(profileName)) {
    await profileButton.click();
    await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitemradio', { name: profileName }).click();
    await expect(profileButton).toContainText(profileName);
  }
  await profileButton.click();
  await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitem', { name: 'Delete profile…' }).click();
  const dialog = page.getByRole('alertdialog').filter({ hasText: 'Delete Trip Profile?' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('the Trip profile delete confirmation states how many Blocking Scenarios go with it', async ({ page }) => {
  const raw = goldenWithAltProfile();
  const [first] = raw.blockingScenarios;
  raw.blockingScenarios.push({ ...first, id: 'second-blocking-scenario', name: 'Second' });
  const dialog = await openTripProfileDeletion(page, raw, 'Default');
  await expect(dialog).toContainText('Also deletes 2 Blocking Scenarios and their Blocks.');
  await dialog.getByRole('button', { name: 'Delete Trip Profile', exact: true }).click();
  await expect.poll(() => runInPage(page, 'return await e.db.blockingScenarios.count()')).toBe(0);
  expect(await runInPage(page, 'return await e.db.blocks.count()')).toBe(0);
});

test('the Trip profile delete confirmation uses the singular for one Blocking Scenario', async ({ page }) => {
  const dialog = await openTripProfileDeletion(page, goldenWithAltProfile(), 'Default');
  await expect(dialog).toContainText('Also deletes 1 Blocking Scenario and its Blocks.');
});

test('the Trip profile delete confirmation shows no such line for a profile without a Blocking Scenario', async ({ page }) => {
  const dialog = await openTripProfileDeletion(page, goldenWithAltProfile(), 'Alt');
  await expect(dialog).toContainText('This cannot be undone.');
  await expect(dialog).not.toContainText('Blocking Scenario');
});
