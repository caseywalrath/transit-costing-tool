// Review package P10 (issues I-023 and I-045; user decisions 11 and 16): the visible save status covers every write of the four services,
// a full browser store is reported in plain words, the browser is asked once to keep the store, and the time of the last JSON backup
// export is kept on the device. The quota failure is simulated as in the review's p6-quota.spec.ts: IDBObjectStore.put and .add throw
// the DOMException that a full store raises, after the app has loaded.
//
// The Costing steps get a longer allowance than the default five seconds. Before Package P11 they needed 90 seconds: opening or changing
// Costing started an estimate that read every Trip and Pattern once per Block (review issue I-044), and the read-write transaction of the
// save waited behind those reads. The estimate now reads once, so the save takes well under a second on the golden project; the allowance
// only covers eight browsers sharing one machine.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { scopeField } from './support/ui';

test.setTimeout(240_000);
const SLOW = 30_000;

const FULL = 'Browser storage is full. Export a backup, then free space.';
const PROTECTION_KEY = 'transit-costing-tool.local-data-protection.v1';

async function openGolden(page: Page) {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
}

/** From now on every write to IndexedDB fails as it does when the browser store is full. Returns the function that ends the simulation. */
async function fillStore(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    for (const name of ['put', 'add'] as const) {
      w[`__original_${name}`] = IDBObjectStore.prototype[name];
      IDBObjectStore.prototype[name] = function () { throw new DOMException('The current transaction exceeded its quota limitations.', 'QuotaExceededError'); };
    }
  });
  return () => page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    for (const name of ['put', 'add'] as const) IDBObjectStore.prototype[name] = w[`__original_${name}`] as never;
  });
}

const status = (page: Page) => page.locator('.save-status');
const refusal = (page: Page) => page.getByText(FULL).first();

/**
 * Starts from a clean save status, makes every write fail as a full store does, runs `write`, and checks that the plain message and the
 * failed status show. Then the store has room again, `retry` runs, and the status clears. Starting clean means a failure shown here was
 * published by this write, not left over from an earlier step.
 */
async function failThenRecover(page: Page, write: () => Promise<void>, retry: () => Promise<void>, timeout = 5000) {
  await expect(status(page)).toContainText('Saved locally');
  const endSimulation = await fillStore(page);
  await write();
  await expect(refusal(page)).toBeVisible({ timeout });
  await expect(status(page)).toHaveText('Local save failed', { timeout });
  await endSimulation();
  await retry();
  await expect(status(page)).toContainText('Saved locally', { timeout });
  const dismiss = page.getByRole('button', { name: 'Dismiss message' });
  if (await dismiss.count()) await dismiss.click();
}

test('a full browser store is reported in plain words, and the save status shows it, for Route, Trips, Blocking, and Costing writes', async ({ page }) => {
  await openGolden(page);

  // Route write.
  const description = page.getByLabel('Description').first();
  await failThenRecover(page, async () => {
    await description.fill('quota test');
    await description.blur();
    expect(await runInPage(page, 'return (await e.db.routes.toArray())[0].description ?? null')).not.toBe('quota test');
  }, async () => {
    await description.fill('room again');
    await description.blur();
    await expect.poll(() => runInPage(page, 'return (await e.db.routes.toArray())[0].description ?? null')).toBe('room again');
  });

  // Trips write: Build Trips.
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await scopeField(page, 'Day').selectOption({ label: 'Weekday' });
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Build trips…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Build Trips' });
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByLabel('First Trip').fill('23:00');
  await drawer.getByLabel('Headway').fill('30');
  await drawer.getByLabel('Last Trip').fill('23:30');
  const tripsBefore = await runInPage(page, 'return await e.db.trips.count()');
  await failThenRecover(page, async () => {
    await drawer.getByRole('button', { name: 'Build', exact: true }).click();
    await expect(refusal(page)).toBeVisible();
    expect(await runInPage(page, 'return await e.db.trips.count()')).toBe(tripsBefore);
  }, async () => {
    await drawer.getByRole('button', { name: 'Build', exact: true }).click();
    await expect.poll(() => runInPage(page, 'return await e.db.trips.count()')).toBe(tripsBefore + 2);
  });

  // Blocking write: New Block.
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await page.getByLabel('Current Block').getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Block' });
  await dialog.getByLabel('Name').fill('QuotaBlock');
  const blocksBefore = await runInPage(page, 'return await e.db.blocks.count()');
  await failThenRecover(page, async () => {
    await dialog.getByRole('button', { name: 'Create Block', exact: true }).click();
    await expect(refusal(page)).toBeVisible();
    expect(await runInPage(page, 'return await e.db.blocks.count()')).toBe(blocksBefore);
  }, async () => {
    await dialog.getByRole('button', { name: 'Create Block', exact: true }).click();
    await expect.poll(() => runInPage(page, 'return await e.db.blocks.count()')).toBe(blocksBefore + 1);
  });

  // Costing write: save the assumptions.
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await page.getByLabel('Operating cost per Revenue Hour in USD').fill('151.25');
  await failThenRecover(page, async () => {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
  }, async () => {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => runInPage(page, 'return (await e.db.costingAssumptions.toArray())[0]?.enteredRate ?? null'), { timeout: SLOW }).toBe(151.25);
  }, SLOW);
});

/**
 * Keeps a read-write transaction on every store open for `ms`, so the app's next write waits behind it and "Saving locally…" stays on
 * screen long enough to be seen. A write on a fast machine can finish before React draws the saving state at all.
 */
async function holdStore(page: Page, ms: number) {
  await page.evaluate((hold) => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('transit-costing-tool');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction([...db.objectStoreNames], 'readwrite');
      const store = transaction.objectStore('projects');
      const until = performance.now() + hold;
      const keepOpen = () => { if (performance.now() < until) store.get('none').onsuccess = keepOpen; };
      keepOpen();
      transaction.oncomplete = () => db.close();
      resolve();
    };
  }), ms);
}

test('a write of each service shows "Saving locally…" in the one indicator in the header', async ({ page }) => {
  await openGolden(page);
  // The indicator is on screen only while a save runs or after one failed. Record every text it shows.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __statusSeen: string[] }).__statusSeen = seen;
    new MutationObserver(() => { const text = document.querySelector('.save-status')?.textContent; if (text) seen.push(text); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  const startWatching = async (action: () => Promise<void>, timeout = 5000) => {
    await page.evaluate(() => { (window as unknown as { __statusSeen: string[] }).__statusSeen.length = 0; });
    await holdStore(page, 800);
    await action();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __statusSeen: string[] }).__statusSeen.includes('Saving locally…')), { timeout }).toBe(true);
    await expect(status(page)).toContainText('Saved locally', { timeout });
  };

  const description = page.getByLabel('Description').first();
  await startWatching(async () => { await description.fill('indicator test'); await description.blur(); });
  await expect.poll(() => runInPage(page, 'return (await e.db.routes.toArray())[0].description ?? null')).toBe('indicator test');

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await scopeField(page, 'Day').selectOption({ label: 'Weekday' });
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Build trips…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Build Trips' });
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByLabel('First Trip').fill('23:00');
  await drawer.getByLabel('Headway').fill('30');
  await drawer.getByLabel('Last Trip').fill('23:30');
  const tripsBefore = await runInPage(page, 'return await e.db.trips.count()');
  await startWatching(() => drawer.getByRole('button', { name: 'Build', exact: true }).click());
  await expect.poll(() => runInPage(page, 'return await e.db.trips.count()')).toBe(tripsBefore + 2);

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await page.getByLabel('Current Block').getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Block' });
  await dialog.getByLabel('Name').fill('IndicatorBlock');
  const blocksBefore = await runInPage(page, 'return await e.db.blocks.count()');
  await startWatching(() => dialog.getByRole('button', { name: 'Create Block', exact: true }).click());
  await expect.poll(() => runInPage(page, 'return await e.db.blocks.count()')).toBe(blocksBefore + 1);

  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await page.getByLabel('Operating cost per Revenue Hour in USD').fill('151.25');
  await startWatching(() => page.getByRole('button', { name: 'Save', exact: true }).click(), SLOW);
  await expect.poll(() => runInPage(page, 'return (await e.db.costingAssumptions.toArray())[0]?.enteredRate ?? null'), { timeout: SLOW }).toBe(151.25);
});

test('the browser is asked once to keep the store, after the first successful save, and the answer is recorded', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __persistCalls: number };
    w.__persistCalls = 0;
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false });
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => { w.__persistCalls += 1; return true; } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Project: / })).toBeVisible();
  const calls = () => page.evaluate(() => (window as unknown as { __persistCalls: number }).__persistCalls);
  const record = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PROTECTION_KEY);
  // Opening the app saves nothing, so nothing is asked yet.
  expect(await calls()).toBe(0);
  expect(await record()).toBeNull();

  // The first save.
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'New project…', exact: true }).click();
  await page.locator('#dialog-name').fill('Persistence');
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  await expect.poll(calls).toBe(1);
  await expect.poll(record).toMatchObject({ persistentStorage: 'granted' });

  // More saves ask nothing more.
  await page.getByRole('button', { name: 'Route actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New route', exact: true }).click();
  await expect.poll(() => runInPage(page, 'return await e.db.routes.count()')).toBe(1);
  expect(await calls()).toBe(1);

  // A later visit of the same browser profile does not ask again.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Route actions', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Route actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New route', exact: true }).click();
  await expect.poll(() => runInPage(page, 'return await e.db.routes.count()')).toBe(2);
  expect(await calls()).toBe(0);
});

test('a refusal to keep the store is recorded and not repeated, and a browser without the request is recorded as unavailable', async ({ browser }) => {
  for (const mode of ['denied', 'unavailable'] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript((answer) => {
      if (answer === 'denied') {
        Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false });
        Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => false });
      } else {
        Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: undefined });
        Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: undefined });
      }
    }, mode);
    await page.goto('/');
    await page.getByRole('button', { name: /^Project: / }).click();
    await page.getByRole('menuitem', { name: 'New project…', exact: true }).click();
    await page.locator('#dialog-name').fill(`Persistence ${mode}`);
    await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.persistentStorage, PROTECTION_KEY)).toBe(mode);
    await context.close();
  }
});

// Package F1, item 7: the browser's answer to the request to keep the store is shown in the Project menu when it is "not granted".
const CLEAR_WARNING = 'This browser may clear local data. Export backups regularly.';

test('the Project menu warns that the browser may clear local data only when the browser did not grant persistent storage', async ({ browser }) => {
  const cases = [
    { mode: 'denied', warned: true },
    { mode: 'unavailable', warned: true },
    { mode: 'granted', warned: false },
  ] as const;
  for (const { mode, warned } of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript((answer) => {
      if (answer === 'unavailable') {
        Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: undefined });
        Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: undefined });
      } else {
        Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => answer === 'granted' });
        Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => answer === 'granted' });
      }
    }, mode);
    await page.goto('/');
    const projectMenu = () => page.getByRole('menu', { name: 'Project actions' });
    // Not yet known: nothing has been saved, so the browser has not been asked and no line is added.
    await page.getByRole('button', { name: /^Project: / }).click();
    await expect(projectMenu()).toContainText('No backup exported yet');
    await expect(projectMenu()).not.toContainText(CLEAR_WARNING);
    await page.getByRole('menuitem', { name: 'New project…', exact: true }).click();
    await page.locator('#dialog-name').fill(`Persistence ${mode}`);
    await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.persistentStorage, PROTECTION_KEY)).toBe(mode);

    await page.getByRole('button', { name: /^Project: / }).click();
    await expect(projectMenu()).toContainText('No backup exported yet');
    if (warned) {
      await expect(projectMenu().locator('.action-menu-note')).toHaveText(['No backup exported yet', CLEAR_WARNING]);
      await expect(projectMenu().getByRole('menuitem', { name: 'Back up project (JSON)', exact: true })).toHaveAccessibleDescription(`No backup exported yet ${CLEAR_WARNING}`);
    } else {
      await expect(projectMenu().locator('.action-menu-note')).toHaveText(['No backup exported yet']);
    }
    await context.close();
  }
});

test('exporting a project backup records the time on this device, and nothing else does', async ({ page }) => {
  await openGolden(page);
  const read = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.lastBackupExportedAt ?? null, PROTECTION_KEY);
  expect(await read()).toBeNull();
  const before = Date.now();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'Back up project (JSON)', exact: true }).click();
  await download;
  await expect.poll(read).not.toBeNull();
  const recorded = Date.parse((await read()) as string);
  expect(recorded).toBeGreaterThanOrEqual(before - 1000);
  expect(recorded).toBeLessThanOrEqual(Date.now() + 1000);
  // The record is device state: the backup file itself does not contain it.
  const file = await (await download).path();
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(file!, 'utf8')).not.toContain('lastBackupExportedAt');
});
