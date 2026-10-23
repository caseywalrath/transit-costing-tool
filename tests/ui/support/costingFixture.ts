// A small Federal Boulevard project for Costing specs: one Weekday Block, one unassigned Trip, a saved rate, and four years.
// The app creates the database when it starts, so the helper waits for the app before it writes to the stores directly.
import { expect, type Page } from '@playwright/test';

export async function seedCostingFixture(page: Page): Promise<void> {
  await page.goto('/');
  // The app creates the database when it starts; wait for it before seeding the stores directly.
  await expect(page.getByRole('button', { name: 'Project actions', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('transit-costing-tool');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = ['projects', 'scenarios', 'serviceDays', 'routes', 'nodes', 'patterns', 'tripProfiles', 'blockingScenarios', 'trips', 'blocks', 'costingAssumptions'];
    const transaction = database.transaction(stores, 'readwrite');
    const now = '2026-09-23T12:00:00.000Z';
    const meta = { createdAt: now, updatedAt: now };
    transaction.objectStore('projects').put({ id: 'p', name: 'Federal Boulevard Plan', distanceUnit: 'miles', currencyCode: 'USD', ...meta });
    transaction.objectStore('scenarios').put({ id: 's', projectId: 'p', name: 'Recommended service', ...meta });
    const days = [
      { id: 'wd', kind: 'weekday', name: 'Weekday', annualServiceDays: 260, sequence: 0 },
      { id: 'sa', kind: 'saturday', name: 'Saturday', annualServiceDays: 52, sequence: 1 },
      { id: 'su', kind: 'sunday', name: 'Sunday', annualServiceDays: 52, sequence: 2 },
      { id: 'ho', kind: 'holiday', name: 'Holiday', annualServiceDays: 0, sequence: 3 },
    ];
    days.forEach((day) => transaction.objectStore('serviceDays').put({ ...day, scenarioId: 's', ...meta }));
    transaction.objectStore('routes').put({ id: 'r', scenarioId: 's', shortName: '31', name: 'Federal Boulevard', ...meta });
    transaction.objectStore('nodes').put({ id: 'n1', scenarioId: 's', routeId: 'r', name: 'Civic Center', kind: 'terminal', ...meta });
    transaction.objectStore('nodes').put({ id: 'n2', scenarioId: 's', routeId: 'r', name: 'Westminster', kind: 'terminal', ...meta });
    transaction.objectStore('patterns').put({ id: 'pat', scenarioId: 's', routeId: 'r', name: 'Full route', points: [{ id: 'pp1', nodeId: 'n1', sequence: 0, cumulativeMiles: 0 }, { id: 'pp2', nodeId: 'n2', sequence: 1, cumulativeMiles: 12 }], ...meta });
    transaction.objectStore('tripProfiles').put({ id: 'tp', scenarioId: 's', name: 'Default', ...meta });
    transaction.objectStore('blockingScenarios').put({ id: 'bs', scenarioId: 's', tripProfileId: 'tp', name: 'Weekday plan', ...meta });
    transaction.objectStore('trips').put({ id: 't1', scenarioId: 's', routeId: 'r', serviceDayId: 'wd', patternId: 'pat', tripProfileId: 'tp', stopTimes: [{ patternPointId: 'pp1', sequence: 0, time: 28800 }, { patternPointId: 'pp2', sequence: 1, time: 32400 }], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...meta });
    transaction.objectStore('trips').put({ id: 't2', scenarioId: 's', routeId: 'r', serviceDayId: 'wd', patternId: 'pat', tripProfileId: 'tp', stopTimes: [{ patternPointId: 'pp1', sequence: 0, time: 36000 }, { patternPointId: 'pp2', sequence: 1, time: 39600 }], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...meta });
    transaction.objectStore('blocks').put({ id: 'b1', scenarioId: 's', blockingScenarioId: 'bs', serviceDayId: 'wd', label: 'Block 101', activities: [{ id: 'po', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'n1', miles: 1 }, { id: 'ra', type: 'revenueTrip', sequence: 1, tripId: 't1' }, { id: 'pi', type: 'pullIn', sequence: 2, minutesAfterLastTrip: 10, fromNodeId: 'n2', miles: 1 }], ...meta });
    transaction.objectStore('costingAssumptions').put({ id: 'ca', scenarioId: 's', currencyCode: 'USD', enteredRate: 150, rateYear: 2025, sourceType: 'ntd', sourceNote: 'NTD 2025 agency profile', baseServiceYear: 2026, futureYearCount: 3, annualEscalation: 0.03, ...meta });
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    database.close();
    localStorage.setItem('transit-costing-tool.route-selection.v1', JSON.stringify({ projectId: 'p', scenarioId: 's', routeId: 'r' }));
  });
}
