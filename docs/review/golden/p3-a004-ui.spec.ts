// Phase 3 browser reproduction. Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p3-playwright.config.ts p3-a004-ui
// Backs finding 3-006 (A-004 hypotheses 1-3). Records CURRENT UI behaviour in its console output; passes.
// Phase 3: A-004 hypotheses 1-3 in the real app (Chromium, app database).
// Seeds the app's IndexedDB with the golden project and a duplicated Scenario created by
// RouteDefinitionService.duplicateScenario (the same call the Duplicate scenario menu makes).
import { expect, test } from '@playwright/test';
import { goldenRaw } from './p3-fixture.ts';
import { SETUP } from './p3-env';

test('A-004 hypotheses 1-3 in the Blocking workspace of a duplicated Scenario', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/src/styles.css');
  const seeded = await page.evaluate(async ({ SETUP, raw }: any) => {
    const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool');
    await e.repository.saveProjectSnapshot({ ...raw, generationSets: [] });
    const copy = await e.service.duplicateScenario(await e.repository.getScenarioRecords(raw.scenarios[0].id), 'Copy');
    e.db.close();
    return { copyScenarioId: copy.scenario.id, sourceNodeIds: raw.nodes.map((n: any) => n.id) };
  }, { SETUP, raw: goldenRaw() });

  const inspect = async (scenarioLabel: string) => {
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Scenario', exact: true }).selectOption({ label: scenarioLabel }, { timeout: 15000 });
    await page.getByRole('button', { name: 'Blocking', exact: true }).click();
    const block = page.getByLabel('Current Block');
    await expect(block.locator('tbody tr').first()).toBeVisible({ timeout: 30000 });
    const rows = await block.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim())));
    return rows.filter((r) => r.some((c) => c === 'Pull-out' || c === 'Pull-in'));
  };
  const source = await inspect('Workbook Service Plan');
  const copy = await inspect('Copy');
  console.log('[A-004 H1] source boundary rows:', JSON.stringify(source));
  console.log('[A-004 H1] copy boundary rows:', JSON.stringify(copy));

  // H2: open the pull-out edit dialog in the copy.
  const block = page.getByLabel('Current Block');
  await block.locator('tbody tr', { hasText: 'Pull-out' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const toSelect = dialog.getByRole('combobox', { name: 'To', exact: true });
  const h2 = await toSelect.evaluate((el: HTMLSelectElement) => ({ value: el.value, selectedText: el.selectedOptions[0]?.textContent, optionValues: [...el.options].map((o) => o.value) }));
  console.log('[A-004 H2] pull-out To select in copy:', JSON.stringify({ ...h2, valueIsSourceNode: seeded.sourceNodeIds.includes(h2.value), valueAmongOptions: h2.optionValues.includes(h2.value) }));

  // H3: bulk "Apply to matching Blocks" from the copy, without touching the Node fields.
  await dialog.getByLabel('Apply to matching Blocks').check();
  await dialog.getByRole('button', { name: 'Review Blocks' }).click();
  const status = await dialog.getByRole('status').textContent().catch(() => null);
  const alert = await page.getByRole('alert').allTextContents();
  console.log('[A-004 H3] bulk review status:', status, 'alerts:', JSON.stringify(alert));
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // H2 continued: save the dialog unchanged and read the stored activity.
  await block.locator('tbody tr', { hasText: 'Pull-out' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save activity' }).click();
  await page.waitForTimeout(1000);
  const stored = await page.evaluate(async ({ SETUP, copyScenarioId }: any) => {
    const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool');
    const r = await e.repository.getScenarioRecords(copyScenarioId);
    const ids = new Set(r.nodes.map((n: any) => n.id));
    const acts = r.blocks.flatMap((b: any) => b.activities).filter((a: any) => a.type === 'pullOut');
    const out = { pullOutsTotal: acts.length, pullOutToNodeInCopy: acts.filter((a: any) => ids.has(a.toNodeId)).length };
    e.db.close(); return out;
  }, { SETUP, copyScenarioId: seeded.copyScenarioId });
  console.log('[A-004 H2] after saving the unchanged dialog:', JSON.stringify(stored), 'alerts:', JSON.stringify(await page.getByRole('alert').allTextContents()));
  await page.screenshot({ path: 'test-results/p3-a004-copy-blocking.png', fullPage: true });
});
