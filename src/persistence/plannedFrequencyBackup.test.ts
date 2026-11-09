import { describe, expect, it } from 'vitest';
import { duplicateRouteRecords, duplicateScenario, snapshotForScenario } from '../domain/project';
import type { PlannedFrequency, ProjectSnapshot } from '../domain/types';
import { goldenRaw } from '../testSupport/goldenBackup';
import { cloneProjectSnapshot, exportProjectJson, importProjectJson } from './backup';

const stamp = { createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z' };

/** The golden Federal project with planned frequencies on its first Route, written as a version 10 file. */
function goldenWithPlans() {
  const raw = goldenRaw();
  const scenarioId: string = raw.scenarios[0].id;
  const route = raw.routes[0];
  const weekday = raw.serviceDays.find((day: any) => day.kind === 'weekday');
  const saturday = raw.serviceDays.find((day: any) => day.kind === 'saturday');
  const directions = raw.directions.filter((direction: any) => direction.routeId === route.id);
  const plans: PlannedFrequency[] = [
    {
      id: 'plan-wd', scenarioId, routeId: route.id, serviceDayId: weekday.id, ...stamp,
      periods: [{ id: 'wd-1', startTime: 6 * 3600, endTime: 8 * 3600, headwaySeconds: 1800 }, { id: 'wd-2', startTime: 8 * 3600, endTime: 19 * 3600, headwaySeconds: 900 }, { id: 'wd-3', startTime: 19 * 3600, endTime: 24 * 3600 + 1800, headwaySeconds: 1800 }],
      measureNodeIdByDirectionId: { [directions[0].id]: directions[0].columns[1].nodeId, [directions[1].id]: directions[1].columns[0].nodeId },
    },
    { id: 'plan-sa', scenarioId, routeId: route.id, serviceDayId: saturday.id, ...stamp, periods: [{ id: 'sa-1', startTime: 7 * 3600, endTime: 22 * 3600, headwaySeconds: 450 }], measureNodeIdByDirectionId: {} },
  ];
  raw.exportSchemaVersion = 10;
  raw.plannedFrequencies = plans;
  return { raw, plans, scenarioId, route, directions };
}

const withoutExportedAt = (payload: string) => { const { exportedAt: _ignored, ...rest } = JSON.parse(payload); return rest; };

describe('planned frequencies in backups (Decision 0058 item 11)', () => {
  it('round trips a version 10 file exactly: export(import(file)) equals the file', () => {
    const { raw } = goldenWithPlans();
    const text = JSON.stringify(raw);
    const snapshot = importProjectJson(text);
    expect(snapshot.plannedFrequencies).toEqual(raw.plannedFrequencies);
    const again = exportProjectJson(snapshot);
    expect(JSON.parse(again).exportSchemaVersion).toBe(11);
    expect(JSON.parse(again).plannedFrequencies).toEqual(raw.plannedFrequencies);
    // Re-export of the re-import is identical, record for record.
    expect(withoutExportedAt(exportProjectJson(importProjectJson(again)))).toEqual(withoutExportedAt(again));
  });

  it('imports a version 9 file with no plans, and ignores a plannedFrequencies key in a file older than version 10', () => {
    const raw = goldenRaw();
    raw.exportSchemaVersion = 9;
    expect(importProjectJson(JSON.stringify(raw)).plannedFrequencies).toBeUndefined();
    const { raw: withPlans } = goldenWithPlans();
    withPlans.exportSchemaVersion = 9;
    expect(importProjectJson(JSON.stringify(withPlans)).plannedFrequencies).toBeUndefined();
  });

  it('a project without plans exports no plannedFrequencies key, so older exports are unchanged', () => {
    const snapshot = importProjectJson(JSON.stringify(goldenRaw()));
    expect('plannedFrequencies' in JSON.parse(exportProjectJson(snapshot))).toBe(false);
  });

  it('import-as-copy gives plans new IDs and remaps Scenario, Route, Service day, period, direction and node IDs', () => {
    const { raw, plans } = goldenWithPlans();
    const source = importProjectJson(JSON.stringify(raw));
    const copy = importProjectJson(exportProjectJson(cloneProjectSnapshot(source, stamp.createdAt)));
    expect(copy.plannedFrequencies).toHaveLength(2);
    const sourceIds = new Set([...source.scenarios, ...source.routes, ...source.serviceDays, ...source.directions!, ...source.nodes, ...plans, ...plans.flatMap((plan) => plan.periods)].map((record) => record.id));
    for (const plan of copy.plannedFrequencies!) {
      expect(sourceIds.has(plan.id)).toBe(false);
      expect(copy.scenarios.some((scenario) => scenario.id === plan.scenarioId)).toBe(true);
      expect(copy.routes.some((route) => route.id === plan.routeId)).toBe(true);
      expect(copy.serviceDays.some((day) => day.id === plan.serviceDayId)).toBe(true);
      for (const period of plan.periods) expect(sourceIds.has(period.id)).toBe(false);
      for (const [directionId, nodeId] of Object.entries(plan.measureNodeIdByDirectionId)) {
        expect(copy.directions!.find((direction) => direction.id === directionId)?.routeId).toBe(plan.routeId);
        expect(copy.nodes.find((node) => node.id === nodeId)?.routeId).toBe(plan.routeId);
      }
    }
    // The measure node of the copy is the copy of the source's measure node (same name).
    const sourceWeekday = plans[0];
    const copyWeekday = copy.plannedFrequencies!.find((plan) => plan.periods.length === 3)!;
    const nameOf = (snapshot: ProjectSnapshot, nodeId: string) => snapshot.nodes.find((node) => node.id === nodeId)!.name;
    expect(Object.values(copyWeekday.measureNodeIdByDirectionId).map((id) => nameOf(copy, id))).toEqual(Object.values(sourceWeekday.measureNodeIdByDirectionId).map((id) => nameOf(source, id)));
    expect(copyWeekday.periods.map(({ id: _id, ...rest }) => rest)).toEqual(sourceWeekday.periods.map(({ id: _id, ...rest }) => rest));
  });

  it.each([
    ['a missing Route', (plan: any) => { plan.routeId = 'no-route'; }, /missing Route/],
    ['a missing Service day', (plan: any) => { plan.serviceDayId = 'no-day'; }, /missing Service day/],
    ['a missing direction', (plan: any) => { plan.measureNodeIdByDirectionId = { 'no-direction': Object.values(plan.measureNodeIdByDirectionId)[0] }; }, /direction that is not on its Route/],
    ['a missing node', (plan: any) => { const [directionId] = Object.keys(plan.measureNodeIdByDirectionId); plan.measureNodeIdByDirectionId = { [directionId]: 'no-node' }; }, /measure node that is not on its Route/],
    ['overlapping periods', (plan: any) => { plan.periods[1].startTime = 7 * 3600; }, /periodsOverlap/],
    ['a headway under a minute', (plan: any) => { plan.periods[0].headwaySeconds = 45; }, /headwayTooShort/],
    ['a headway longer than its period', (plan: any) => { plan.periods[0].headwaySeconds = 3 * 3600; }, /headwayLongerThanPeriod/],
    ['no periods', (plan: any) => { plan.periods = []; }, /no periods/],
    ['a non-numeric time', (plan: any) => { plan.periods[0].startTime = '06:00'; }, /startTime must be a number/],
  ])('rejects a plan with %s', (_label, change, message) => {
    const { raw } = goldenWithPlans();
    change(raw.plannedFrequencies[0]);
    expect(() => importProjectJson(JSON.stringify(raw))).toThrow(message);
  });

  it('rejects two plans for one Route and Service day', () => {
    const { raw } = goldenWithPlans();
    raw.plannedFrequencies.push({ ...raw.plannedFrequencies[0], id: 'plan-wd-2' });
    expect(() => importProjectJson(JSON.stringify(raw))).toThrow(/more than one planned frequency/);
  });
});

describe('planned frequencies in Scenario and Route duplication (Decision 0058 item 10)', () => {
  const recordsWithPlans = () => {
    const { raw, scenarioId } = goldenWithPlans();
    return snapshotForScenario(importProjectJson(JSON.stringify(raw)), scenarioId)!;
  };

  it('duplicateScenario copies every plan with new IDs pointing at the copy', () => {
    const source = recordsWithPlans();
    const copy = duplicateScenario(source, 'Copy', stamp.createdAt);
    expect(copy.plannedFrequencies).toHaveLength(2);
    const dayKind = (records: typeof source, id: string) => records.serviceDays.find((day) => day.id === id)!.kind;
    const directionName = (records: typeof source, id: string) => records.directions!.find((direction) => direction.id === id)!.name;
    const nodeName = (records: typeof source, id: string) => records.nodes.find((node) => node.id === id)!.name;
    for (const [index, plan] of copy.plannedFrequencies!.entries()) {
      const original = source.plannedFrequencies![index];
      expect(plan.id).not.toBe(original.id);
      expect(plan.scenarioId).toBe(copy.scenario.id);
      expect(copy.routes.some((route) => route.id === plan.routeId)).toBe(true);
      expect(dayKind(copy, plan.serviceDayId)).toBe(dayKind(source, original.serviceDayId));
      expect(plan.periods.map((period) => period.id).some((id) => original.periods.some((period) => period.id === id))).toBe(false);
      expect(Object.entries(plan.measureNodeIdByDirectionId).map(([d, n]) => [directionName(copy, d), nodeName(copy, n)])).toEqual(Object.entries(original.measureNodeIdByDirectionId).map(([d, n]) => [directionName(source, d), nodeName(source, n)]));
    }
    // The source is not changed.
    expect(source.plannedFrequencies!.map((plan) => plan.id)).toEqual(['plan-wd', 'plan-sa']);
  });

  it('duplicateRouteRecords copies the Route\'s plans onto the new Route, on the same Service days', () => {
    const source = recordsWithPlans();
    const { records, route } = duplicateRouteRecords(source, source.routes[0].id, 'Copy route', stamp.createdAt);
    const copied = records.plannedFrequencies!.filter((plan) => plan.routeId === route.id);
    expect(copied).toHaveLength(2);
    expect(records.plannedFrequencies).toHaveLength(4);
    expect(copied.map((plan) => plan.serviceDayId).sort()).toEqual(source.plannedFrequencies!.map((plan) => plan.serviceDayId).sort());
    for (const plan of copied) {
      for (const [directionId, nodeId] of Object.entries(plan.measureNodeIdByDirectionId)) {
        expect(records.directions!.find((direction) => direction.id === directionId)?.routeId).toBe(route.id);
        expect(records.nodes.find((node) => node.id === nodeId)?.routeId).toBe(route.id);
      }
    }
  });

  it('a Scenario without plans duplicates without a plannedFrequencies collection', () => {
    const source = snapshotForScenario(importProjectJson(JSON.stringify(goldenRaw())), goldenRaw().scenarios[0].id)!;
    expect(duplicateScenario(source, 'Copy', stamp.createdAt).plannedFrequencies).toBeUndefined();
    expect(duplicateRouteRecords(source, source.routes[0].id, 'R2', stamp.createdAt).records.plannedFrequencies).toBeUndefined();
  });
});
