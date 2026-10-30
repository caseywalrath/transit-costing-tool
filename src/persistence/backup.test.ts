import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import { duplicateScenario, projectSnapshotWithScenario, snapshotForScenario } from '../domain/project';
import type { Block, BlockActivity, ProjectSnapshot } from '../domain/types';
import { goldenJson } from '../testSupport/goldenBackup';
import { exportProjectJson, importProjectJson, cloneProjectSnapshot, parseProjectBackupWithReport } from './backup';

describe('backup', () => {
  it('round trips the complete Phase 1 project graph', () => {
    const project = { id: 'p', name: 'Demo', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata('2026-01-01T00:00:00.000Z') };
    const scenario = { id: 's', projectId: 'p', name: 'Base', ...metadata('2026-01-01T00:00:00.000Z') };
    const route = { id: 'r', scenarioId: 's', name: 'Route 1', ...metadata('2026-01-01T00:00:00.000Z') };
    const nodeA = { id: 'n1', scenarioId: 's', routeId: 'r', name: 'A', kind: 'terminal' as const, ...metadata('2026-01-01T00:00:00.000Z') };
    const nodeB = { id: 'n2', scenarioId: 's', routeId: 'r', name: 'B', kind: 'terminal' as const, ...metadata('2026-01-01T00:00:00.000Z') };
    const pattern = { id: 'pat', scenarioId: 's', routeId: 'r', name: 'A-B', points: [
      { id: 'pp1', nodeId: 'n1', sequence: 0, cumulativeMiles: 0 },
      { id: 'pp2', nodeId: 'n2', sequence: 1, cumulativeMiles: 1.25 },
    ], ...metadata('2026-01-01T00:00:00.000Z') };
    const tripProfile = { id: 'tp', scenarioId: 's', name: 'Default', ...metadata('2026-01-01T00:00:00.000Z') };
    const snapshot = { project, scenarios: [scenario], serviceDays: [], routes: [route], nodes: [nodeA, nodeB], patterns: [pattern], runtimeProfiles: [], runtimeAssignments: [], tripProfiles: [tripProfile], generationSets: [], trips: [], blocks: [] };
    expect(importProjectJson(exportProjectJson(snapshot))).toEqual(snapshot);
  });

  it('omits the historical generation-set collection from an authoritative empty export', () => {
    const snapshot = { project: { id: 'p', name: 'Authoritative', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata() }, scenarios: [], serviceDays: [], routes: [], nodes: [], patterns: [], runtimeProfiles: [], runtimeAssignments: [], generationSets: [], trips: [], blocks: [] };
    const exported = JSON.parse(exportProjectJson(snapshot));
    expect(exported.generationSets).toBeUndefined();
    expect(importProjectJson(JSON.stringify(exported)).generationSets).toEqual([]);
  });

  it('rejects unsupported or malformed backups before import', () => {
    expect(() => importProjectJson(JSON.stringify({ format: 'transit-costing-tool.project', exportSchemaVersion: 99 }))).toThrow(/Unsupported/);
    expect(() => importProjectJson('{not-json')).toThrow(/malformed JSON/);
  });

  it('creates an independent import-as-copy graph', () => {
    const project = { id: 'p', name: 'Demo', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata() };
    const scenario = { id: 's', projectId: 'p', name: 'Base', ...metadata() };
    const snapshot = { project, scenarios: [scenario], serviceDays: [], routes: [], nodes: [], patterns: [], runtimeProfiles: [], runtimeAssignments: [], generationSets: [], trips: [], blocks: [] };
    const copy = cloneProjectSnapshot(snapshot, '2026-01-01T00:00:00.000Z');
    expect(copy.project.id).not.toBe(project.id);
    expect(copy.project.name).toBe('Demo Copy');
    expect(copy.scenarios[0].projectId).toBe(copy.project.id);
  });

  it('imports a version 1 backup with empty runtime collections', () => {
    const legacy = JSON.parse(exportProjectJson({ project: { id: 'p', name: 'Legacy', distanceUnit: 'miles', currencyCode: 'USD', ...metadata() }, scenarios: [], serviceDays: [], routes: [], nodes: [], patterns: [], runtimeProfiles: [], runtimeAssignments: [], generationSets: [], trips: [], blocks: [] }));
    legacy.exportSchemaVersion = 1;
    delete legacy.runtimeProfiles;
    delete legacy.runtimeAssignments;
    expect(importProjectJson(JSON.stringify(legacy)).runtimeProfiles).toEqual([]);
    expect(importProjectJson(JSON.stringify(legacy)).runtimeAssignments).toEqual([]);
  });

  it('keeps version 4 backups readable at the normalized import boundary', () => {
    const payload = JSON.parse(exportProjectJson({ project: { id: 'p', name: 'Legacy 4', distanceUnit: 'miles', currencyCode: 'USD', ...metadata() }, scenarios: [], serviceDays: [], routes: [], nodes: [], patterns: [], runtimeProfiles: [], runtimeAssignments: [], generationSets: [], trips: [], blocks: [] }));
    payload.exportSchemaVersion = 4;
    delete payload.blockingScenarios;
    expect(importProjectJson(JSON.stringify(payload)).blockingScenarios).toBeUndefined();
    expect(importProjectJson(JSON.stringify(payload)).blocks).toEqual([]);
  });

  it('clones runtime records with remapped references and independent bands', () => {
    const source = {
      project: { id: 'p', name: 'Demo', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata() },
      scenarios: [{ id: 's', projectId: 'p', name: 'Base', ...metadata() }],
      serviceDays: [{ id: 'd', scenarioId: 's', kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 260, sequence: 0, ...metadata() }],
      routes: [{ id: 'r', scenarioId: 's', name: 'Route', ...metadata() }],
      nodes: [{ id: 'a', scenarioId: 's', routeId: 'r', name: 'A', kind: 'terminal' as const, ...metadata() }, { id: 'b', scenarioId: 's', routeId: 'r', name: 'B', kind: 'terminal' as const, ...metadata() }],
      patterns: [{ id: 'pat', scenarioId: 's', routeId: 'r', name: 'A-B', points: [{ id: 'pa', nodeId: 'a', sequence: 0, cumulativeMiles: 0 }, { id: 'pb', nodeId: 'b', sequence: 1, cumulativeMiles: 1 }], ...metadata() }],
      runtimeProfiles: [{ id: 'rp', scenarioId: 's', routeId: 'r', patternId: 'pat', name: 'All day', calculationMethod: 'blendSegments' as const, bands: [{ id: 'rb', label: 'All day', sequence: 0, startTime: 0, endTime: 100, segmentRuntimeSeconds: [60] }], ...metadata() }],
      runtimeAssignments: [{ id: 'ra', scenarioId: 's', patternId: 'pat', serviceDayId: 'd', runtimeProfileId: 'rp', ...metadata() }],
      generationSets: [], trips: [], blocks: [],
    };
    const copy = cloneProjectSnapshot(source, '2026-01-01T00:00:00.000Z');
    expect(importProjectJson(exportProjectJson(source)).runtimeProfiles[0].calculationMethod).toBe('blendSegments');
    expect(copy.runtimeProfiles[0].calculationMethod).toBe('blendSegments');
    expect(copy.runtimeProfiles[0].id).not.toBe(source.runtimeProfiles[0].id);
    expect(copy.runtimeProfiles[0].patternId).toBe(copy.patterns[0].id);
    expect(copy.runtimeProfiles[0].bands[0].id).not.toBe(source.runtimeProfiles[0].bands[0].id);
    expect(copy.runtimeAssignments[0].runtimeProfileId).toBe(copy.runtimeProfiles[0].id);
    expect(copy.runtimeAssignments[0].serviceDayId).toBe(copy.serviceDays[0].id);
  });

  it('round trips and remaps generation sets, trips, scheduled points, and blocks', () => {
    const base = {
      project: { id: 'p', name: 'Demo', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata() },
      scenarios: [{ id: 's', projectId: 'p', name: 'Base', ...metadata() }],
      serviceDays: [{ id: 'd', scenarioId: 's', kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 260, sequence: 0, ...metadata() }],
      routes: [{ id: 'r', scenarioId: 's', name: 'Route', ...metadata() }],
      nodes: [{ id: 'a', scenarioId: 's', routeId: 'r', name: 'A', kind: 'terminal' as const, ...metadata() }, { id: 'b', scenarioId: 's', routeId: 'r', name: 'B', kind: 'terminal' as const, ...metadata() }],
      patterns: [{ id: 'pat', scenarioId: 's', routeId: 'r', name: 'A-B', points: [{ id: 'pa', nodeId: 'a', sequence: 0, cumulativeMiles: 0 }, { id: 'pb', nodeId: 'b', sequence: 1, cumulativeMiles: 1 }], ...metadata() }],
      runtimeProfiles: [], runtimeAssignments: [],
      generationSets: [{ id: 'gs', scenarioId: 's', routeId: 'r', serviceDayId: 'd', patternId: 'pat', name: 'Weekday set', firstDeparture: 0, headwaySeconds: 600, limit: { mode: 'tripCount' as const, tripCount: 1 }, generationRevision: 1, ...metadata() }],
      trips: [{ id: 't', scenarioId: 's', routeId: 'r', serviceDayId: 'd', patternId: 'pat', stopTimes: [{ patternPointId: 'pa', sequence: 0, time: 0 }, { patternPointId: 'pb', sequence: 1, time: 60 }], provenance: { kind: 'generated' as const, generationSetId: 'gs', generationRevision: 1, generationSequence: 0, manuallyChangedFields: [] }, ...metadata() }],
      blocks: [{ id: 'b', scenarioId: 's', serviceDayId: 'd', label: '1', activities: [{ id: 'activity', type: 'revenueTrip' as const, sequence: 0, tripId: 't' }], ...metadata() }],
    };
    const restored = importProjectJson(exportProjectJson(base));
    expect(restored.trips[0].stopTimes[1].time).toBe(60);
    const copy = cloneProjectSnapshot(base, '2026-01-01T00:00:00.000Z');
    expect(copy.generationSets[0].id).not.toBe('gs');
    expect(copy.trips[0].provenance.generationSetId).toBe(copy.generationSets[0].id);
    expect(copy.trips[0].stopTimes[0].patternPointId).toBe(copy.patterns[0].points[0].id);
    expect(copy.blocks[0].activities[0].type === 'revenueTrip' && copy.blocks[0].activities[0].tripId).toBe(copy.trips[0].id);
  });

  it('round trips normalized Blocking Scenarios and remaps ownership, Trips, and Nodes', () => {
    const source = {
      project: { id: 'p', name: 'Demo', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata() },
      scenarios: [{ id: 's', projectId: 'p', name: 'Base', ...metadata() }],
      serviceDays: [{ id: 'd', scenarioId: 's', kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 260, sequence: 0, ...metadata() }],
      routes: [{ id: 'r', scenarioId: 's', name: 'Route', ...metadata() }],
      nodes: [{ id: 'a', scenarioId: 's', routeId: 'r', name: 'A', kind: 'terminal' as const, ...metadata() }, { id: 'b', scenarioId: 's', routeId: 'r', name: 'B', kind: 'terminal' as const, ...metadata() }],
      patterns: [{ id: 'pat', scenarioId: 's', routeId: 'r', name: 'A-B', points: [{ id: 'pa', nodeId: 'a', sequence: 0, cumulativeMiles: 0 }, { id: 'pb', nodeId: 'b', sequence: 1, cumulativeMiles: 1 }], ...metadata() }],
      runtimeProfiles: [], runtimeAssignments: [], tripProfiles: [{ id: 'tp', scenarioId: 's', name: 'Weekday', ...metadata() }],
      blockingScenarios: [{ id: 'bs', scenarioId: 's', tripProfileId: 'tp', name: 'Base blocks', ...metadata() }],
      generationSets: [], trips: [], blocks: [{ id: 'b', scenarioId: 's', blockingScenarioId: 'bs', serviceDayId: 'd', label: '1', activities: [{ id: 'po', type: 'pullOut' as const, sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'a', miles: 1 }], ...metadata() }],
    };
    const restored = importProjectJson(exportProjectJson(source));
    expect(restored.blockingScenarios?.[0].tripProfileId).toBe('tp');
    const copy = cloneProjectSnapshot(source, '2026-01-01T00:00:00.000Z');
    expect(copy.blockingScenarios?.[0].id).not.toBe('bs');
    expect(copy.blocks[0].blockingScenarioId).toBe(copy.blockingScenarios?.[0].id);
    expect(copy.blocks[0].activities[0].type === 'pullOut' && copy.blocks[0].activities[0].toNodeId).toBe(copy.nodes.find((node) => node.name === 'A')?.id);
    expect(copy.blocks[0].activities[0].type === 'pullOut' && copy.blocks[0].activities[0].minutesBeforeFirstTrip).toBe(10);
  });

  it('round trips costing assumptions in schema 6 and remaps them during import-as-copy', () => {
    const source = {
      project: { id: 'p', name: 'Costing', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata() },
      scenarios: [{ id: 's', projectId: 'p', name: 'Base', ...metadata() }],
      serviceDays: [], routes: [], nodes: [], patterns: [], runtimeProfiles: [], runtimeAssignments: [],
      tripProfiles: [{ id: 'tp', scenarioId: 's', name: 'Default', ...metadata() }], blockingScenarios: [],
      costingAssumptions: [{ id: 'cost', scenarioId: 's', currencyCode: 'USD' as const, enteredRate: 100, rateYear: 2024, sourceType: 'ntd' as const, sourceNote: 'NTD 2024', baseServiceYear: 2026, futureYearCount: 2, annualEscalation: 0.03, ...metadata() }],
      generationSets: [], trips: [], blocks: [],
    };
    const exported = JSON.parse(exportProjectJson(source));
    expect(exported.exportSchemaVersion).toBe(7);
    expect(exported.costingAssumptions).toEqual(source.costingAssumptions);
    expect(importProjectJson(JSON.stringify(exported)).costingAssumptions).toEqual(source.costingAssumptions);

    const copy = cloneProjectSnapshot(source, '2026-01-01T00:00:00.000Z');
    expect(copy.costingAssumptions?.[0].id).not.toBe('cost');
    expect(copy.costingAssumptions?.[0].scenarioId).toBe(copy.scenarios[0].id);
    expect(copy.costingAssumptions?.[0].enteredRate).toBe(100);
  });

  describe('estimate factors (schema 7, Decision 0051)', () => {
    const factors = { allDays: { layoverFraction: 0.182, deadheadFraction: 0.056 }, serviceDays: [{ serviceDayId: 'd', layoverFraction: 0.178 }, { serviceDayId: 'e', deadheadFraction: 0.05 }] };
    const sourceWith = (estimateFactors: unknown) => ({
      project: { id: 'p', name: 'Costing', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata() },
      scenarios: [{ id: 's', projectId: 'p', name: 'Base', ...metadata() }, { id: 's2', projectId: 'p', name: 'Other', ...metadata() }],
      serviceDays: [
        { id: 'd', scenarioId: 's', kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 255, sequence: 0, ...metadata() },
        { id: 'e', scenarioId: 's', kind: 'saturday' as const, name: 'Saturday', annualServiceDays: 52, sequence: 1, ...metadata() },
        { id: 'x', scenarioId: 's2', kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 255, sequence: 0, ...metadata() },
      ],
      routes: [], nodes: [], patterns: [], runtimeProfiles: [], runtimeAssignments: [],
      tripProfiles: [{ id: 'tp', scenarioId: 's', name: 'Default', ...metadata() }, { id: 'tp2', scenarioId: 's2', name: 'Default', ...metadata() }], blockingScenarios: [],
      costingAssumptions: [{ id: 'cost', scenarioId: 's', currencyCode: 'USD' as const, enteredRate: 100, rateYear: 2026, sourceType: 'user' as const, baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0.03, estimateFactors, ...metadata() }],
      generationSets: [], trips: [], blocks: [],
    }) as unknown as Parameters<typeof exportProjectJson>[0];

    it('round trips every factor in a version 7 file', () => {
      const payload = exportProjectJson(sourceWith(factors));
      expect(JSON.parse(payload).exportSchemaVersion).toBe(7);
      expect(importProjectJson(payload).costingAssumptions?.[0].estimateFactors).toEqual(factors);
    });

    it('imports a version 6 file with costing assumptions and no factors', () => {
      const file = JSON.parse(exportProjectJson(sourceWith(undefined)));
      file.exportSchemaVersion = 6;
      const restored = importProjectJson(JSON.stringify(file));
      expect(restored.costingAssumptions?.[0].enteredRate).toBe(100);
      expect(restored.costingAssumptions?.[0].estimateFactors).toBeUndefined();
    });

    it.each([
      ['a non-object', 5, /costingAssumptions\[0\]\.estimateFactors must be an object/],
      ['allDays that is not an object', { allDays: 3, serviceDays: [] }, /estimateFactors allDays must be an object/],
      ['serviceDays that is not an array', { allDays: {}, serviceDays: {} }, /estimateFactors serviceDays must be an array/],
      ['a row without a service day id', { allDays: {}, serviceDays: [{ layoverFraction: 0.1 }] }, /serviceDays\[0\]\.serviceDayId must be a non-empty string/],
      ['a layover of 1', { allDays: { layoverFraction: 1 }, serviceDays: [] }, /allDays\.layoverFraction must be a number from 0 up to but not including 1/],
      ['a negative deadhead', { allDays: {}, serviceDays: [{ serviceDayId: 'd', deadheadFraction: -0.1 }] }, /serviceDays\[0\]\.deadheadFraction/],
      ['a text fraction', { allDays: { layoverFraction: '0.1' }, serviceDays: [] }, /allDays\.layoverFraction/],
      ['a service day listed twice', { allDays: {}, serviceDays: [{ serviceDayId: 'd' }, { serviceDayId: 'd' }] }, /serviceDays\[1\] repeats service day d/],
      ['a service day of another Scenario', { allDays: {}, serviceDays: [{ serviceDayId: 'x', layoverFraction: 0.1 }] }, /serviceDays\[0\]\.serviceDayId names a service day that is not in this Scenario/],
    ])('refuses %s', (_label, estimateFactors, message) => {
      const payload = JSON.parse(exportProjectJson(sourceWith(undefined)));
      payload.costingAssumptions[0].estimateFactors = estimateFactors;
      expect(() => importProjectJson(JSON.stringify(payload))).toThrow(message);
    });

    it('remaps the service-day identifiers when imported as a copy', () => {
      const source = importProjectJson(exportProjectJson(sourceWith(factors)));
      const copy = cloneProjectSnapshot(source, '2026-01-01T00:00:00.000Z');
      const ownDays = copy.serviceDays.filter((day) => day.scenarioId === copy.costingAssumptions![0].scenarioId);
      const rows = copy.costingAssumptions![0].estimateFactors!.serviceDays;
      expect(rows.map((row) => row.serviceDayId)).toEqual(ownDays.map((day) => day.id));
      expect(rows.map((row) => row.serviceDayId)).not.toContain('d');
      expect(rows.map((row) => row.layoverFraction)).toEqual([0.178, undefined]);
      expect(copy.costingAssumptions![0].estimateFactors!.allDays).toEqual(factors.allDays);
      expect(source.costingAssumptions![0].estimateFactors!.serviceDays.map((row) => row.serviceDayId)).toEqual(['d', 'e']);
    });
  });

  it('accepts version 5 backups without costing assumptions and keeps historical 366-day totals', () => {
    const payload = JSON.parse(exportProjectJson({
      project: { id: 'p', name: 'Legacy 5', distanceUnit: 'miles', currencyCode: 'USD', ...metadata() },
      scenarios: [{ id: 's', projectId: 'p', name: 'Base', ...metadata() }],
      serviceDays: [{ id: 'd', scenarioId: 's', kind: 'weekday', name: 'Weekday', annualServiceDays: 366, sequence: 0, ...metadata() }],
      routes: [], nodes: [], patterns: [], runtimeProfiles: [], runtimeAssignments: [], tripProfiles: [{ id: 'tp', scenarioId: 's', name: 'Default', ...metadata() }],
      blockingScenarios: [], costingAssumptions: [], generationSets: [], trips: [], blocks: [],
    }));
    payload.exportSchemaVersion = 5;
    delete payload.costingAssumptions;
    const restored = importProjectJson(JSON.stringify(payload));
    expect(restored.costingAssumptions).toBeUndefined();
    expect(restored.serviceDays[0].annualServiceDays).toBe(366);
  });

  it('rejects malformed costing assumptions before import', () => {
    const payload = JSON.parse(exportProjectJson({
      project: { id: 'p', name: 'Invalid costing', distanceUnit: 'miles', currencyCode: 'USD', ...metadata() },
      scenarios: [{ id: 's', projectId: 'p', name: 'Base', ...metadata() }],
      serviceDays: [], routes: [], nodes: [], patterns: [], runtimeProfiles: [], runtimeAssignments: [], tripProfiles: [],
      costingAssumptions: [{ id: 'cost', scenarioId: 's', currencyCode: 'USD', enteredRate: -1, rateYear: 2027, sourceType: 'ntd', baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0.03, ...metadata() }],
      generationSets: [], trips: [], blocks: [],
    }));
    expect(() => importProjectJson(JSON.stringify(payload))).toThrow(/enteredRate/);

    payload.costingAssumptions[0].enteredRate = 100;
    payload.costingAssumptions[0].currencyCode = 'CAD';
    expect(() => importProjectJson(JSON.stringify(payload))).toThrow(/currencyCode must be USD/);

    payload.costingAssumptions[0].currencyCode = 'USD';
    payload.costingAssumptions[0].scenarioId = 'missing-scenario';
    expect(() => importProjectJson(JSON.stringify(payload))).toThrow(/references a missing Scenario/);
  });
});

describe('backup import repairs Scenario copies made before duplication remapped Node references (P03, decision 4)', () => {
  const nodeIdsOf = (blocks: Block[]) => blocks.flatMap((block) => block.activities.flatMap((activity: BlockActivity) => (activity.type === 'revenueTrip' ? [] : [activity.fromNodeId, activity.toNodeId].filter((id): id is string => Boolean(id)))));

  /** A backup of the golden project with a Scenario copy as the older code made it: the copy's pull-out and pull-in name the source's Nodes. */
  function backupWithLeakyCopy(options: { removeSource?: boolean } = {}) {
    const snapshot = importProjectJson(goldenJson());
    const source = snapshotForScenario(snapshot, snapshot.scenarios[0].id)!;
    const copy = duplicateScenario(source, 'Copy');
    const toSource = new Map(copy.nodes.map((node, index) => [node.id, source.nodes[index].id]));
    const leakyCopy = { ...copy, blocks: copy.blocks.map((block) => ({ ...block, activities: block.activities.map((activity) => (activity.type === 'revenueTrip' ? activity : { ...activity, ...(activity.fromNodeId ? { fromNodeId: toSource.get(activity.fromNodeId) } : {}), ...(activity.toNodeId ? { toNodeId: toSource.get(activity.toNodeId) } : {}) })) })) };
    const combined: ProjectSnapshot = projectSnapshotWithScenario(snapshot, leakyCopy);
    combined.scenarios = options.removeSource ? [leakyCopy.scenario] : [snapshot.scenarios[0], leakyCopy.scenario];
    if (options.removeSource) {
      const copyScenarioId = leakyCopy.scenario.id;
      const owned = <T extends { scenarioId: string }>(rows: T[]) => rows.filter((row) => row.scenarioId === copyScenarioId);
      Object.assign(combined, { serviceDays: owned(combined.serviceDays), routes: owned(combined.routes), nodes: owned(combined.nodes), patterns: owned(combined.patterns), directions: owned(combined.directions ?? []), runtimeProfiles: owned(combined.runtimeProfiles), runtimeAssignments: owned(combined.runtimeAssignments), tripProfiles: owned(combined.tripProfiles ?? []), blockingScenarios: owned(combined.blockingScenarios ?? []), trips: owned(combined.trips), blocks: owned(combined.blocks) });
    }
    return { text: exportProjectJson(combined), source, copy, leakyCopy };
  }

  it('repoints the 138 leaking references to the copy Nodes and leaves every other record as exported', () => {
    const { text, source, copy, leakyCopy } = backupWithLeakyCopy();
    const sourceNodeIds = new Set(source.nodes.map((node) => node.id));
    expect(nodeIdsOf(leakyCopy.blocks).filter((id) => sourceNodeIds.has(id))).toHaveLength(138);

    const { snapshot, report } = parseProjectBackupWithReport(text);

    expect(report.recoveredNodeReferences).toBe(138);
    expect(report.recoveryFindings).toEqual([]);
    const copyBlocks = snapshot.blocks.filter((block) => block.scenarioId === copy.scenario.id);
    expect(nodeIdsOf(copyBlocks).filter((id) => sourceNodeIds.has(id))).toHaveLength(0);
    expect(copyBlocks).toEqual(copy.blocks);
    // Everything outside the copy's Blocks is exactly what the file held.
    const exported = JSON.parse(text);
    for (const key of ['project', 'scenarios', 'serviceDays', 'routes', 'nodes', 'patterns', 'directions', 'runtimeProfiles', 'runtimeAssignments', 'tripProfiles', 'blockingScenarios', 'trips']) {
      expect(JSON.parse(JSON.stringify((snapshot as any)[key])), key).toEqual(exported[key]);
    }
    expect(snapshot.blocks.filter((block) => block.scenarioId === source.scenario.id)).toEqual(exported.blocks.filter((block: Block) => block.scenarioId === source.scenario.id));
  });

  it('round trips the recovered backup without further changes', () => {
    const { text } = backupWithLeakyCopy();
    const first = parseProjectBackupWithReport(text).snapshot;
    const second = parseProjectBackupWithReport(exportProjectJson(first));
    expect(second.report.recoveredNodeReferences).toBe(0);
    expect(second.snapshot).toEqual(first);
  });

  it('imports the same file through import-as-copy with no reference to the source Scenario', () => {
    const { text, source } = backupWithLeakyCopy();
    const sourceNodeIds = new Set(source.nodes.map((node) => node.id));
    const copied = importProjectJson(exportProjectJson(cloneProjectSnapshot(importProjectJson(text))));
    expect(nodeIdsOf(copied.blocks).filter((id) => sourceNodeIds.has(id))).toHaveLength(0);
  });

  it('infers the Nodes of a copy whose source Scenario is not in the file (decision C8)', () => {
    const { text, copy } = backupWithLeakyCopy({ removeSource: true });
    const { snapshot, report } = parseProjectBackupWithReport(text);
    expect(report.recoveredNodeReferences).toBe(138);
    expect(report.recoveryFindings).toEqual([]);
    expect(snapshot.blocks).toEqual(copy.blocks);
  });
});
