// Review package U05 (issues I-034, I-035, I-040, I-083, I-088, I-089; findings 5-008, 5-009, 5-015, 5-020, 5-021; user decision 15).
// Removing an activity asks first, deleting a Block or a Blocking Scenario shows what it removes, Trips of another Route say which Route
// they belong to, hours use the Costing rounding, and the labels are exact. Every test runs on the Federal BRT project in real IndexedDB.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

async function openBlocking(page: Page, day = 'Weekday') {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(page.getByLabel('Blocking controls')).toBeVisible();
  if (day !== 'Weekday') await page.getByRole('region', { name: 'Blocking controls' }).getByLabel('Day').selectOption({ label: day });
}

const blocksTable = (page: Page) => page.getByLabel('Blocks', { exact: true });
const currentBlock = (page: Page) => page.getByLabel('Current Block');
async function selectBlock(page: Page, label: string) {
  await blocksTable(page).locator('.link-button').filter({ hasText: new RegExp(`^${label}$`) }).click();
  await expect(currentBlock(page).locator('.menu-field').getByRole('button').first()).toContainText(label);
}

/** The activities of the Block with this label on the Weekday, from the stored data. */
const storedBlock = (page: Page, label: string) => runInPage(page, "const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday'); const block = (await e.db.blocks.toArray()).find((item) => item.label === arg && item.serviceDayId === day.id); return block ? { id: block.id, types: block.activities.map((activity) => activity.type), updatedAt: block.updatedAt } : undefined;", label);

test('removing a Trip, a Pull-out, or a Pull-in asks first and names the activity', async ({ page }) => {
  await openBlocking(page);
  await selectBlock(page, '26');
  const before = await storedBlock(page, '26');
  expect(before.types).toContain('pullOut');
  expect(before.types).toContain('pullIn');
  const confirm = page.getByRole('alertdialog');

  // A Trip: the dialog names it and the Block; Cancel keeps everything.
  await currentBlock(page).getByRole('button', { name: 'Remove Trip 3', exact: true }).click();
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('heading', { name: 'Remove Trip 3?' })).toBeVisible();
  await expect(confirm).toContainText('Remove Trip 3 from Block “26”');
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect((await storedBlock(page, '26')).types).toEqual(before.types);

  // A Pull-out: asking, then Cancel.
  await currentBlock(page).getByRole('button', { name: 'Remove Pull-out', exact: true }).click();
  await expect(confirm.getByRole('heading', { name: 'Remove pull-out?' })).toBeVisible();
  await expect(confirm).toContainText('Remove the pull-out from Block “26”');
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await storedBlock(page, '26')).types).toEqual(before.types);

  // Confirming removes exactly that activity.
  await currentBlock(page).getByRole('button', { name: 'Remove Pull-out', exact: true }).click();
  await confirm.getByRole('button', { name: 'Remove pull-out', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect.poll(async () => (await storedBlock(page, '26')).types).toEqual(before.types.filter((type: string) => type !== 'pullOut'));

  await currentBlock(page).getByRole('button', { name: 'Remove Pull-in', exact: true }).click();
  await expect(confirm.getByRole('heading', { name: 'Remove pull-in?' })).toBeVisible();
  await confirm.getByRole('button', { name: 'Remove pull-in', exact: true }).click();
  await expect.poll(async () => (await storedBlock(page, '26')).types).toEqual(before.types.filter((type: string) => type !== 'pullOut' && type !== 'pullIn'));

  await currentBlock(page).getByRole('button', { name: 'Remove Trip 3', exact: true }).click();
  await confirm.getByRole('button', { name: 'Remove Trip 3', exact: true }).click();
  await expect.poll(async () => (await storedBlock(page, '26')).types.filter((type: string) => type === 'revenueTrip').length).toBe(before.types.filter((type: string) => type === 'revenueTrip').length - 1);
});

test('Delete Block shows what it removes, deletes with the reviewed source, and is refused if the Block changed after the review', async ({ page }) => {
  await openBlocking(page);
  await selectBlock(page, '26');
  const counts = await runInPage(page, "const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday'); const block = (await e.db.blocks.toArray()).find((item) => item.label === '26' && item.serviceDayId === day.id); return { trips: block.activities.filter((a) => a.type === 'revenueTrip').length, deadheads: block.activities.filter((a) => a.type === 'deadhead').length, activities: block.activities.length };");
  const confirm = page.getByRole('alertdialog');
  const open = async () => { await currentBlock(page).getByRole('button', { name: 'Current Block actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Delete Block…', exact: true }).click(); };

  await open();
  await expect(confirm.getByRole('heading', { name: 'Delete Block?' })).toBeVisible();
  const plural = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`;
  await expect(confirm).toContainText(`Delete Block “26” with ${plural(counts.trips, 'Trip')}, ${plural(counts.deadheads, 'deadhead')}, and ${plural(counts.activities, 'activity', 'activities')} in all?`);
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await storedBlock(page, '26')).toBeTruthy();

  // The Block changes after the review: the deletion is refused and nothing is removed.
  await open();
  await runInPage(page, "const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday'); const block = (await e.db.blocks.toArray()).find((item) => item.label === '26' && item.serviceDayId === day.id); await e.db.blocks.put({ ...block, notes: 'Changed after the review' });");
  await confirm.getByRole('button', { name: 'Delete Block', exact: true }).click();
  await expect(page.locator('.notice.error')).toContainText('Blocking Scenario changed since the operation was reviewed');
  expect(await storedBlock(page, '26')).toBeTruthy();
  await expect(confirm).toHaveCount(0);

  // A fresh review deletes it.
  await open();
  await confirm.getByRole('button', { name: 'Delete Block', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect.poll(() => storedBlock(page, '26')).toBeUndefined();
});

test('Delete Block uses the source it reviewed, even when the screen was loaded before another change', async ({ page }) => {
  await openBlocking(page);
  await selectBlock(page, '27');
  // Another path changes a Block after the screen loaded it. The review reads the stored data, so deleting what was reviewed works.
  await runInPage(page, "const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday'); const block = (await e.db.blocks.toArray()).find((item) => item.label === '26' && item.serviceDayId === day.id); await e.db.blocks.put({ ...block, notes: 'Changed before the review' });");
  await currentBlock(page).getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete Block…', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: 'Delete Block', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator('.notice.error')).toHaveCount(0);
  await expect.poll(() => storedBlock(page, '27')).toBeUndefined();
  expect(await storedBlock(page, '26')).toBeTruthy();
});

test('Delete Blocking Scenario shows its Blocks and activities, and is refused if it changed after the review', async ({ page }) => {
  await openBlocking(page);
  const counts = await runInPage(page, "const blocks = await e.db.blocks.toArray(); return { blocks: blocks.length, activities: blocks.reduce((sum, block) => sum + block.activities.length, 0), name: (await e.db.blockingScenarios.toArray())[0].name };");
  const confirm = page.getByRole('alertdialog');
  const open = async () => { await page.getByRole('button', { name: 'Blocking actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Delete Blocking Scenario…', exact: true }).click(); };

  await open();
  await expect(confirm.getByRole('heading', { name: 'Delete Blocking Scenario?' })).toBeVisible();
  await expect(confirm).toContainText(`Delete “${counts.name}” with ${counts.blocks} Blocks and ${counts.activities} activities across every service day?`);
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await runInPage(page, 'return await e.db.blockingScenarios.count()')).toBe(1);

  await open();
  await runInPage(page, "const block = (await e.db.blocks.toArray())[0]; await e.db.blocks.put({ ...block, notes: 'Changed after the review' });");
  await confirm.getByRole('button', { name: 'Delete Blocking Scenario', exact: true }).click();
  await expect(page.locator('.notice.error')).toContainText('Blocking Scenario changed since the operation was reviewed');
  expect(await runInPage(page, 'return await e.db.blockingScenarios.count()')).toBe(1);
  await expect(confirm).toHaveCount(0);

  await open();
  await confirm.getByRole('button', { name: 'Delete Blocking Scenario', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect.poll(() => runInPage(page, 'return [await e.db.blockingScenarios.count(), await e.db.blocks.count()]')).toEqual([0, 0]);
});

test('the Delete Pattern button and its confirmation both read "Delete Pattern"', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  const button = page.getByRole('button', { name: /^Delete Pattern/ });
  await expect(button).toBeVisible({ timeout: 30_000 });
  await expect(button).toHaveText('Delete Pattern');
  await button.click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete Pattern?' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Delete Pattern', exact: true })).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Confirm', exact: true })).toHaveCount(0);
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('a Trip from another Route shows that Route in its Pattern pill and resolves its Nodes; Trips of the selected Route are unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await runInPage(page, `
    const scenario = (await e.db.scenarios.toArray())[0];
    const route = (await e.db.routes.toArray())[0];
    const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday');
    const [blockingScenario] = await e.db.blockingScenarios.toArray();
    await e.db.routes.put({ ...route, id: 'route-two', shortName: '31B', name: 'Cross Route' });
    const nodeMap = new Map();
    for (const node of (await e.db.nodes.toArray()).filter((item) => item.routeId === route.id)) { const copy = { ...node, id: 'two-' + node.id, routeId: 'route-two' }; nodeMap.set(node.id, copy.id); await e.db.nodes.put(copy); }
    const trips = (await e.db.trips.toArray()).filter((trip) => trip.serviceDayId === day.id && trip.tripProfileId === blockingScenario.tripProfileId);
    const own = trips[0]; const pattern = (await e.db.patterns.toArray()).find((item) => item.id === own.patternId);
    const pattern2 = { ...pattern, id: 'two-' + pattern.id, routeId: 'route-two', name: 'Cross Pattern', points: pattern.points.map((point) => ({ ...point, id: 'two-' + point.id, nodeId: nodeMap.get(point.nodeId) })) };
    await e.db.patterns.put(pattern2);
    const other = { ...own, id: 'trip-two', routeId: 'route-two', patternId: pattern2.id, stopTimes: own.stopTimes.map((stop, index) => ({ ...stop, patternPointId: pattern2.points[index].id })) };
    await e.db.trips.put(other);
    const stamp = '2026-10-23T00:00:00.000Z';
    await e.db.blocks.put({ id: 'block-cross', scenarioId: scenario.id, blockingScenarioId: blockingScenario.id, serviceDayId: day.id, label: 'Cross', activities: [{ id: 'cross-1', type: 'revenueTrip', sequence: 0, tripId: own.id }, { id: 'cross-2', type: 'revenueTrip', sequence: 1, tripId: other.id }], createdAt: stamp, updatedAt: stamp });
    return own.patternId;`);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await selectBlock(page, 'Cross');

  const rows = currentBlock(page).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  const ownPill = rows.nth(0).locator('.pattern-pill');
  const otherPill = rows.nth(1).locator('.pattern-pill');
  await expect(otherPill).toHaveText('31B · Cross Pattern');
  await expect(otherPill).toHaveAttribute('title', '31B · Cross Pattern');
  await expect(ownPill).not.toContainText('·');
  expect((await ownPill.innerText()).trim().length).toBeGreaterThan(0);
  await expect(ownPill).toHaveAttribute('title', (await ownPill.innerText()).trim());
  await expect(rows.nth(1)).not.toContainText('Missing pattern');
  // The other Route's Trip resolves its start and end Nodes instead of showing dashes.
  await expect(rows.nth(1).locator('.blocking-node-column').first()).not.toHaveText('—');
  await expect(rows.nth(1).locator('.blocking-node-column').nth(1)).not.toHaveText('—');
});

test('Blocking shows hours with the Costing rounding: Saturday Block 22 reads 14.58', async ({ page }) => {
  await openBlocking(page, 'Saturday');
  const row = blocksTable(page).locator('tbody tr').filter({ has: page.locator('.link-button', { hasText: /^22$/ }) });
  await expect(row).toContainText('14.58');
  await expect(row).not.toContainText('14.57');
});

test('the labels are exact: Move Trip counts Trips only, "No current issues." is neutral, Pattern pills carry the full name, and the menus say Trip Profile', async ({ page }) => {
  await openBlocking(page);
  await selectBlock(page, '26');
  // Block 26 has a Pull-out row first: the first Trip is still "Trip 1".
  await expect(currentBlock(page).getByRole('button', { name: 'Move Trip 1 down', exact: true })).toBeVisible();
  await expect(currentBlock(page).getByRole('button', { name: 'Move Trip 1 up', exact: true })).toBeDisabled();
  await expect(currentBlock(page).getByRole('button', { name: /^Move Trip 0/ })).toHaveCount(0);
  for (const pill of await currentBlock(page).locator('.pattern-pill').all()) await expect(pill).toHaveAttribute('title', (await pill.innerText()).trim());

  // A Block without issues says so in a neutral style, not the amber warning style that real issues use.
  const noIssues = page.getByText('No current issues.');
  await expect(noIssues).toBeVisible();
  expect(await noIssues.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgb(255, 248, 233)');
  expect(await noIssues.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe('0px');

  await expect(page.getByRole('region', { name: 'Blocking controls' }).getByLabel('Trip Profile')).toBeVisible();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.locator('[aria-label="Trips section"] .menu-field').filter({ hasText: 'Profile' }).getByRole('button').click();
  await expect(page.locator('[role="menu"][aria-label="Trip Profile"]')).toHaveCount(1);
  expect(await page.locator('[aria-label="Trip profile"]').count()).toBe(0);
});
