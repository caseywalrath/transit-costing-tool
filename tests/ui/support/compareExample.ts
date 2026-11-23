// The worked example of Decision 0091 (tests/fixtures/scenario-compare/README.md) as a Project in the app's own database, for the Compare
// tab's specs. The records come from the same builders the comparison service's tests use, loaded through the dev server, so the app and
// those tests compare the same Scenarios. The app creates the database when it starts, so the helper waits for it before writing.
import { expect, type Page } from '@playwright/test';

type Row = { id: string; scenarioId: string; [field: string]: unknown };
interface ExampleRecords {
  scenarios: Row[]; serviceDays: Row[]; routes: Row[]; directions: Row[]; tripProfiles: Row[]; blockingScenarios: Row[]; trips: Row[]; blocks: Row[]; costingAssumptions: Row[];
  patterns: Array<Row & { routeId: string; points: Array<{ nodeId: string }> }>;
}

export interface CompareExampleOptions {
  /** Remove the proposed Scenario's saved rate, so that its Costing cannot be estimated. */
  proposedHasNoRate?: boolean;
  /** Give the proposed Scenario this saved rate (the baseline's is $100 per revenue hour). */
  proposedRate?: number;
}

/** What a direct Costing estimate of each example Scenario gives, summed over its Routes: revenue hours per day and first-year cost per day. */
export interface DirectCostingFigures { weekdayHours: number; saturdayHours: number; weekdayCost: number; saturdayCost: number }

/**
 * Costing itself, run on the example's records in the page (the same call the Costing tab makes). The Compare tab must show these figures,
 * so the spec compares against them rather than against the README's hours, which are inputs to the pure comparison tests, not Costing output.
 */
export async function directCostingFigures(page: Page): Promise<{ baseline: DirectCostingFigures; proposed: DirectCostingFigures }> {
  return page.evaluate(async () => {
    const support = await new Function("return import('/src/application/compare/compareTestSupport.ts')")();
    const records = support.exampleRecords();
    const assumptions = { enteredRate: 100, rateYear: 2027, sourceType: 'user', baseServiceYear: 2027, futureYearCount: 0, annualEscalation: 0.03, estimateFactors: { allDays: { layoverFraction: 0.182, deadheadFraction: 0.056 }, serviceDays: [] }, routeEstimateFactors: [] };
    type Day = { serviceDayName: string; revenueHoursPerDay?: number; yearCosts: Array<{ annualCostUsd: number }> };
    const figures = async (scenarioId: string, blockingScenarioId: string) => {
      const result = await support.directEstimate(records, scenarioId, { kind: 'blocked', blockingScenarioId }, assumptions);
      const days: Day[] = result.routeRows.flatMap((route: { days: Day[] }) => route.days);
      const sum = (name: string, pick: (day: Day) => number) => days.filter((day) => day.serviceDayName === name).reduce((total, day) => total + pick(day), 0);
      return {
        weekdayHours: sum('Weekday', (day) => day.revenueHoursPerDay ?? 0), saturdayHours: sum('Saturday', (day) => day.revenueHoursPerDay ?? 0),
        weekdayCost: sum('Weekday', (day) => day.yearCosts[0]?.annualCostUsd ?? 0), saturdayCost: sum('Saturday', (day) => day.yearCosts[0]?.annualCostUsd ?? 0),
      };
    };
    return { baseline: await figures('scn-existing', 'base-blocks'), proposed: await figures('scn-redesign', 'draft-blocks') };
  });
}

export async function seedCompareExample(page: Page, options: CompareExampleOptions = {}): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Project: / })).toBeVisible();
  await page.evaluate(async (options) => {
    // Loaded by the dev server at run time (the same way dexieEnv.ts loads the application's modules).
    const support = await new Function("return import('/src/application/compare/compareTestSupport.ts')")();
    const records = support.exampleRecords() as ExampleRecords;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('transit-costing-tool');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = ['projects', 'scenarios', 'serviceDays', 'routes', 'nodes', 'patterns', 'directions', 'tripProfiles', 'blockingScenarios', 'trips', 'blocks', 'costingAssumptions'];
    const transaction = database.transaction(stores, 'readwrite');
    const meta = { createdAt: '2026-11-22T12:00:00.000Z', updatedAt: '2026-11-22T12:00:00.000Z' };
    const put = (store: string, record: unknown) => transaction.objectStore(store).put(record);
    put('projects', { id: 'project', name: 'Compare example', distanceUnit: 'miles', currencyCode: 'USD', ...meta });
    const names: Record<string, string> = { 'scn-existing': 'Existing', 'scn-redesign': 'Redesign' };
    for (const scenario of records.scenarios) put('scenarios', { ...scenario, name: names[scenario.id] ?? scenario.name });
    for (const item of records.serviceDays) put('serviceDays', item);
    for (const item of records.routes) put('routes', item);
    for (const item of records.patterns) put('patterns', item);
    for (const item of records.directions) put('directions', item);
    for (const item of records.tripProfiles) put('tripProfiles', { ...item, name: 'Default' });
    const blockNames: Record<string, string> = { 'base-blocks': 'Base blocks', 'draft-blocks': 'Draft blocks' };
    for (const item of records.blockingScenarios) put('blockingScenarios', { ...item, name: blockNames[item.id] ?? item.name });
    for (const item of records.trips) put('trips', item);
    for (const item of records.blocks) put('blocks', item);
    for (const item of records.costingAssumptions) {
      const { enteredRate, ...withoutRate } = item;
      const proposed = item.scenarioId === 'scn-redesign';
      put('costingAssumptions', options.proposedHasNoRate && proposed ? withoutRate : { ...item, enteredRate: proposed && options.proposedRate !== undefined ? options.proposedRate : enteredRate });
    }
    // The Route screen reads the nodes of its patterns: one record for each node of the first Scenario that uses it.
    const seen = new Set<string>();
    for (const pattern of records.patterns) {
      for (const point of pattern.points) {
        if (seen.has(point.nodeId)) continue;
        seen.add(point.nodeId);
        put('nodes', { id: point.nodeId, scenarioId: pattern.scenarioId, routeId: pattern.routeId, name: `Stop ${point.nodeId}`, kind: 'terminal', ...meta });
      }
    }
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    database.close();
    localStorage.setItem('transit-costing-tool.route-selection.v1', JSON.stringify({ projectId: 'project', scenarioId: 'scn-existing', routeId: 'b-r1' }));
  }, options);
}
