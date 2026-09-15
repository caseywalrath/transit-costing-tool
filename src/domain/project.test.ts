import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { createScenarioRecords, duplicateScenario } from './project';

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
      patterns: [{ id: 'pattern', scenarioId: 'source-scenario', routeId: 'route', name: 'A-B', points: [
        { id: 'point-a', nodeId: 'a', sequence: 0, cumulativeMiles: 0 },
        { id: 'point-b', nodeId: 'b', sequence: 1, cumulativeMiles: 2 },
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
    expect(copy.runtimeProfiles[0].id).not.toBe(source.runtimeProfiles[0].id);
    expect(copy.runtimeProfiles[0].patternId).toBe(copy.patterns[0].id);
    expect(copy.runtimeAssignments[0].runtimeProfileId).toBe(copy.runtimeProfiles[0].id);
    expect(copy.runtimeAssignments[0].serviceDayId).toBe(copy.serviceDays[0].id);
  });
});
