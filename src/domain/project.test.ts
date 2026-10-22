import { describe, expect, it } from 'vitest';
import { asSnapshot, goldenRaw, goldenWithAltBlocking, goldenWithDeadhead } from '../testSupport/goldenBackup';
import { summarizeBlock } from './blocking';
import { evaluateBlockEligibility } from './costing';
import { metadata } from './ids';
import { createScenarioRecords, duplicateRouteRecords, duplicateScenario, snapshotForScenario } from './project';
import { assertTripProfileReferences } from './trips';
import type { Block, BlockingBlock, ProjectSnapshot } from './types';

describe('scenario duplication', () => {
  it('creates the four standard service days for a new scenario', () => {
    const records = createScenarioRecords('project', 'Base', '2026-01-01T00:00:00.000Z');
    expect(records.serviceDays.map((day) => day.kind)).toEqual(['weekday', 'saturday', 'sunday', 'holiday']);
    expect(records.serviceDays.every((day) => day.scenarioId === records.scenario.id)).toBe(true);
    expect(records.tripProfiles).toHaveLength(1);
    expect(records.tripProfiles?.[0].name).toBe('Default');
    expect(records.tripProfiles?.[0].scenarioId).toBe(records.scenario.id);
  });

  it('deep-copies route records and remaps all references', () => {
    const source = {
      scenario: { id: 'source-scenario', projectId: 'project', name: 'Base', ...metadata('2026-01-01T00:00:00.000Z') },
      serviceDays: [{ id: 'weekday', scenarioId: 'source-scenario', kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 260, sequence: 0, ...metadata('2026-01-01T00:00:00.000Z') }],
      routes: [{ id: 'route', scenarioId: 'source-scenario', name: 'Route', ...metadata('2026-01-01T00:00:00.000Z') }],
      nodes: [
        { id: 'a', scenarioId: 'source-scenario', routeId: 'route', name: 'A', kind: 'terminal' as const, ...metadata('2026-01-01T00:00:00.000Z') },
        { id: 'b', scenarioId: 'source-scenario', routeId: 'route', name: 'B', kind: 'terminal' as const, ...metadata('2026-01-01T00:00:00.000Z') },
      ],
      directions: [{ id: 'direction', scenarioId: 'source-scenario', routeId: 'route', name: 'Outbound', group: 'outbound' as const, sequence: 0, columns: [{ id: 'column-a', nodeId: 'a', sequence: 0 }, { id: 'column-b', nodeId: 'b', sequence: 1 }], ...metadata('2026-01-01T00:00:00.000Z') }],
      patterns: [{ id: 'pattern', scenarioId: 'source-scenario', routeId: 'route', name: 'A-B', points: [
        { id: 'point-a', nodeId: 'a', sequence: 0, cumulativeMiles: 0, directionColumnId: 'column-a' },
        { id: 'point-b', nodeId: 'b', sequence: 1, cumulativeMiles: 2, directionColumnId: 'column-b' },
      ], ...metadata('2026-01-01T00:00:00.000Z') }],
      runtimeProfiles: [{ id: 'profile', scenarioId: 'source-scenario', routeId: 'route', patternId: 'pattern', name: 'All day', bands: [{ id: 'band', label: 'All day', sequence: 0, startTime: 0, endTime: 100, segmentRuntimeSeconds: [60] }], ...metadata('2026-01-01T00:00:00.000Z') }],
      runtimeAssignments: [{ id: 'assignment', scenarioId: 'source-scenario', patternId: 'pattern', serviceDayId: 'weekday', runtimeProfileId: 'profile', ...metadata('2026-01-01T00:00:00.000Z') }],
      generationSets: [], trips: [], blocks: [],
    };
    const copy = duplicateScenario(source, 'Alternative', '2026-02-01T00:00:00.000Z');
    expect(copy.scenario.id).not.toBe(source.scenario.id);
    expect(copy.routes[0].id).not.toBe(source.routes[0].id);
    expect(copy.routes[0].scenarioId).toBe(copy.scenario.id);
    expect(copy.nodes[0].routeId).toBe(copy.routes[0].id);
    expect(copy.patterns[0].routeId).toBe(copy.routes[0].id);
    expect(copy.patterns[0].points[0].nodeId).toBe(copy.nodes[0].id);
    expect(copy.patterns[0].points[0].id).not.toBe(source.patterns[0].points[0].id);
    expect(copy.directions?.[0].columns.map((column) => column.nodeId)).toEqual(copy.nodes.map((node) => node.id));
    expect(copy.patterns[0].points.map((point) => point.directionColumnId)).toEqual(copy.directions?.[0].columns.map((column) => column.id));
    expect(copy.runtimeProfiles[0].id).not.toBe(source.runtimeProfiles[0].id);
    expect(copy.runtimeProfiles[0].patternId).toBe(copy.patterns[0].id);
    expect(copy.runtimeAssignments[0].runtimeProfileId).toBe(copy.runtimeProfiles[0].id);
    expect(copy.runtimeAssignments[0].serviceDayId).toBe(copy.serviceDays[0].id);
  });
});

describe('route duplication', () => {
  it('copies the route planning graph with fresh references and leaves Blocks unchanged', () => {
    const meta = metadata('2026-01-01T00:00:00.000Z');
    const source = {
      scenario: { id: 'scenario', projectId: 'project', name: 'Base', ...meta },
      serviceDays: [{ id: 'weekday', scenarioId: 'scenario', kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 260, sequence: 0, ...meta }],
      routes: [{ id: 'route', scenarioId: 'scenario', name: 'Route', ...meta }],
      nodes: [{ id: 'node-a', scenarioId: 'scenario', routeId: 'route', name: 'A', kind: 'terminal' as const, ...meta }, { id: 'node-b', scenarioId: 'scenario', routeId: 'route', name: 'B', kind: 'terminal' as const, ...meta }],
      directions: [{ id: 'direction', scenarioId: 'scenario', routeId: 'route', name: 'Outbound', group: 'outbound' as const, sequence: 0, columns: [{ id: 'column-a', nodeId: 'node-a', sequence: 0 }, { id: 'column-b', nodeId: 'node-b', sequence: 1 }], ...meta }],
      patterns: [{ id: 'pattern', scenarioId: 'scenario', routeId: 'route', directionId: 'direction', name: 'A-B', points: [{ id: 'point-a', nodeId: 'node-a', directionColumnId: 'column-a', sequence: 0, cumulativeMiles: 0 }, { id: 'point-b', nodeId: 'node-b', directionColumnId: 'column-b', sequence: 1, cumulativeMiles: 2 }], ...meta }],
      runtimeProfiles: [{ id: 'runtime', scenarioId: 'scenario', routeId: 'route', patternId: 'pattern', name: 'All day', bands: [{ id: 'band', label: 'All day', sequence: 0, startTime: 0, endTime: 86400, segmentRuntimeSeconds: [600] }], ...meta }],
      runtimeAssignments: [{ id: 'assignment', scenarioId: 'scenario', patternId: 'pattern', serviceDayId: 'weekday', runtimeProfileId: 'runtime', ...meta }],
      tripProfiles: [{ id: 'trip-profile', scenarioId: 'scenario', name: 'Default', ...meta }],
      generationSets: [],
      trips: [{ id: 'trip', scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: 'pattern', tripProfileId: 'trip-profile', stopTimes: [{ patternPointId: 'point-a', sequence: 0, time: 28800 }, { patternPointId: 'point-b', sequence: 1, time: 29400 }], provenance: { kind: 'manual' as const, manuallyChangedFields: [], runtimeProfileId: 'runtime', calculationSource: { runtimeProfileId: 'runtime', runtimeCalculationRevision: 0 } }, ...meta }],
      blocks: [{ id: 'block', scenarioId: 'scenario', serviceDayId: 'weekday', blockingScenarioId: 'blocking', label: '1', activities: [{ id: 'activity', type: 'revenueTrip' as const, sequence: 0, tripId: 'trip' }], ...meta }],
    };
    const duplicate = duplicateRouteRecords(source, 'route', 'Route Copy', '2026-02-01T00:00:00.000Z');
    const copiedPattern = duplicate.records.patterns.find((pattern) => pattern.routeId === duplicate.route.id)!;
    const copiedRuntime = duplicate.records.runtimeProfiles.find((profile) => profile.routeId === duplicate.route.id)!;
    const copiedTrip = duplicate.records.trips.find((trip) => trip.routeId === duplicate.route.id)!;

    expect(duplicate.route.name).toBe('Route Copy');
    expect(copiedPattern.directionId).not.toBe('direction');
    expect(copiedPattern.points.map((point) => point.nodeId)).not.toEqual(['node-a', 'node-b']);
    expect(copiedRuntime.patternId).toBe(copiedPattern.id);
    expect(copiedTrip.patternId).toBe(copiedPattern.id);
    expect(copiedTrip.stopTimes[0].patternPointId).toBe(copiedPattern.points[0].id);
    expect(copiedTrip.provenance.runtimeProfileId).toBe(copiedRuntime.id);
    expect(duplicate.records.blocks).toEqual(source.blocks);
  });
});

function collectIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectIds(item, ids));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if (key === 'id' && typeof item === 'string') ids.add(item); collectIds(item, ids); }
  return ids;
}
/** Field paths whose `*Id` value is a source record's ID and does not exist in the copy. `sourceScenarioId` and `sourceTripProfileId` record where a copy came from. */
function sourceReferences(copy: unknown, sourceIds: Set<string>, copyIds: Set<string>, path = '', found: Record<string, number> = {}): Record<string, number> {
  if (Array.isArray(copy)) copy.forEach((item) => sourceReferences(item, sourceIds, copyIds, `${path}[]`, found));
  else if (copy && typeof copy === 'object') {
    for (const [key, item] of Object.entries(copy)) {
      const field = `${path}.${key}`.replace(/^\./, '');
      if (key !== 'id' && /Id$/.test(key) && key !== 'sourceScenarioId' && key !== 'sourceTripProfileId' && typeof item === 'string' && sourceIds.has(item) && !copyIds.has(item)) found[field] = (found[field] ?? 0) + 1;
      else sourceReferences(item, sourceIds, copyIds, `${path}.${key}`, found);
    }
  }
  return found;
}

describe('scenario duplication of Blocks (P03: I-004, I-005)', () => {
  it('leaves no reference back to the source Scenario (was 138 Node references)', () => {
    const snapshot = asSnapshot(goldenRaw());
    const source = snapshotForScenario(snapshot, snapshot.scenarios[0].id)!;
    const copy = duplicateScenario(source, 'Copy');
    expect(sourceReferences(copy, collectIds(source), collectIds(copy))).toEqual({});
  });

  it('remaps pull-out, deadhead, and pull-in Nodes to the copy Nodes by the same Node', () => {
    const snapshot = asSnapshot(goldenWithDeadhead());
    const source = snapshotForScenario(snapshot, snapshot.scenarios[0].id)!;
    const copy = duplicateScenario(source, 'Copy');
    const copyNodeFor = new Map(source.nodes.map((node, index) => [node.id, copy.nodes[index].id]));
    const sourceActivities = source.blocks.flatMap((block) => block.activities).filter((activity) => activity.type !== 'revenueTrip');
    const copyActivities = copy.blocks.flatMap((block) => block.activities).filter((activity) => activity.type !== 'revenueTrip');
    expect(copyActivities).toHaveLength(sourceActivities.length);
    expect(copyActivities.some((activity) => activity.type === 'deadhead')).toBe(true);
    sourceActivities.forEach((activity, index) => {
      for (const end of ['fromNodeId', 'toNodeId'] as const) {
        const sourceNode = (activity as any)[end] as string | undefined;
        expect((copyActivities[index] as any)[end]).toBe(sourceNode === undefined ? undefined : copyNodeFor.get(sourceNode));
      }
    });
  });

  it('keeps the source Block eligibility, hours, and findings in the copy when a Block has a deadhead', () => {
    const snapshot = asSnapshot(goldenWithDeadhead());
    const source = snapshotForScenario(snapshot, snapshot.scenarios[0].id)!;
    const copy = duplicateScenario(source, 'Copy');
    const measure = (records: typeof source) => {
      const blockingScenario = records.blockingScenarios![0];
      const serviceDayIds = new Set(records.serviceDays.map((day) => day.id));
      return (records.blocks as BlockingBlock[]).map((block) => {
        const summary = summarizeBlock(block, { scenario: records.scenario, blockingScenario, trips: records.trips, patterns: records.patterns });
        const eligibility = evaluateBlockEligibility(block, summary, records.scenario, blockingScenario, serviceDayIds);
        return { label: block.label, day: records.serviceDays.find((day) => day.id === block.serviceDayId)!.name, eligible: Boolean(eligibility.eligible), revenueHours: summary.revenueHours, findings: summary.findings.map((found) => found.ruleId).sort() };
      });
    };
    const before = measure(source);
    expect(before.some((block) => block.eligible)).toBe(true);
    expect(measure(copy)).toEqual(before);
  });

  it('stamps no Trip Profile on normalized Blocks, so Blocking Scenarios on different Trip Profiles copy', () => {
    const snapshot = asSnapshot(goldenWithAltBlocking());
    const source = snapshotForScenario(snapshot, snapshot.scenarios[0].id)!;
    expect(source.blocks.some((block) => block.blockingScenarioId === 'alt-blocking')).toBe(true);
    const copy = duplicateScenario(source, 'Copy');
    expect(copy.blocks.filter((block) => block.blockingScenarioId && block.tripProfileId)).toHaveLength(0);
    expect(copy.blocks).toHaveLength(source.blocks.length);
    expect(() => assertTripProfileReferences(copy.trips, copy.blocks)).not.toThrow();
    // Each copied Blocking Scenario still holds the Trips of its own copied Trip Profile.
    const profileOf = new Map(copy.blockingScenarios!.map((scenario) => [scenario.id, scenario.tripProfileId]));
    const tripById = new Map(copy.trips.map((trip) => [trip.id, trip]));
    for (const block of copy.blocks) for (const activity of block.activities) if (activity.type === 'revenueTrip') expect(tripById.get(activity.tripId)!.tripProfileId).toBe(profileOf.get(block.blockingScenarioId!));
  });

  it('keeps and remaps the Trip Profile of a legacy Block that has no Blocking Scenario', () => {
    const snapshot = asSnapshot(goldenWithAltBlocking());
    const original = snapshot.blocks[0] as Block;
    const legacyOnAlt: Block = { ...original, id: 'legacy-alt', label: 'LEGACY-ALT', blockingScenarioId: undefined, tripProfileId: 'alt-profile', activities: [] };
    const legacyUnowned: Block = { ...original, id: 'legacy-none', label: 'LEGACY-NONE', blockingScenarioId: undefined, tripProfileId: undefined, activities: [] };
    const withLegacy: ProjectSnapshot = { ...snapshot, blocks: [...snapshot.blocks, legacyOnAlt, legacyUnowned] };
    const copy = duplicateScenario(snapshotForScenario(withLegacy, snapshot.scenarios[0].id)!, 'Copy');
    const copiedAlt = copy.tripProfiles!.find((profile) => profile.sourceTripProfileId === 'alt-profile')!;
    const copiedDefault = copy.tripProfiles!.find((profile) => profile.sourceTripProfileId === snapshot.tripProfiles![0].id)!;
    expect(copy.blocks.find((block) => block.label === 'LEGACY-ALT')!.tripProfileId).toBe(copiedAlt.id);
    // A legacy Block with no profile still receives the copy's first Trip Profile, as before.
    expect(copy.blocks.find((block) => block.label === 'LEGACY-NONE')!.tripProfileId).toBe(copy.tripProfiles![0].id);
    expect(copiedDefault.id).toBe(copy.tripProfiles![0].id);
  });
});
