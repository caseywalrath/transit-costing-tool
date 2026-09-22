import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import { authoritativeTripsCsv, blockingActivitiesCsv, blockingBlocksCsv, blockingScenariosCsv, blockingSummariesCsv, blocksCsv, csvEscape, generationSetsCsv, patternPointsCsv, routeCsv, scheduledPointsCsv, tripsCsv } from './csv';

describe('CSV serializers', () => {
  it('escapes commas, quotes, and newlines', () => {
    expect(csvEscape('A, "quoted"\nstop')).toBe('"A, ""quoted""\nstop"');
  });

  it('keeps stable headers and repeated pattern points', () => {
    const route = { id: 'r', scenarioId: 's', name: 'Federal, Blvd', ...metadata() };
    expect(routeCsv(route).split('\r\n')[0]).toBe('id,scenarioId,name,shortName,description');
    const patterns = [{ id: 'p', scenarioId: 's', routeId: 'r', name: 'Loop', points: [
      { id: 'a', nodeId: 'n1', sequence: 0, cumulativeMiles: 0 },
      { id: 'b', nodeId: 'n1', sequence: 1, cumulativeMiles: 4.25 },
    ], ...metadata() }];
    const rows = patternPointsCsv(patterns).trim().split('\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toContain('4.25');
  });

  it('exports generation controls and extended scheduled times with stable headers', () => {
    const set = { id: 'gs', scenarioId: 's', routeId: 'r', serviceDayId: 'd', patternId: 'p', name: 'All day', firstDeparture: 90000, headwaySeconds: 420, limit: { mode: 'endTime' as const, endTime: 93600 }, generationRevision: 1, ...metadata() };
    const trip = { id: 't', scenarioId: 's', routeId: 'r', serviceDayId: 'd', patternId: 'p', stopTimes: [{ patternPointId: 'a', sequence: 0, time: 90000 }], provenance: { kind: 'generated' as const, generationSetId: 'gs', generationRevision: 1, generationSequence: 0, manuallyChangedFields: [] }, ...metadata() };
    expect(generationSetsCsv([set]).split('\r\n')[0]).toContain('firstDeparture');
    expect(generationSetsCsv([set])).toContain('25:00');
    expect(tripsCsv([trip]).split('\r\n')[0]).toContain('manualTimeShiftSeconds');
    expect(scheduledPointsCsv([trip])).toContain('25:00');
  });

  it('exports authoritative source fields without generation-set columns', () => {
    const trip = { id: 't', scenarioId: 's', routeId: 'r', serviceDayId: 'd', tripProfileId: 'tp', patternId: 'p', stopTimes: [{ patternPointId: 'a', sequence: 0, time: 90000 }], provenance: { kind: 'manual' as const, creationMethod: 'manual' as const, manuallyChangedFields: [], calculationSource: { runtimeProfileId: 'rp', runtimeCalculationRevision: 2 } }, ...metadata() };
    const output = authoritativeTripsCsv([trip], [{ id: 'tp', scenarioId: 's', name: 'Default', ...metadata() }]);
    expect(output.split('\r\n')[0]).toContain('creationMethod');
    expect(output.split('\r\n')[0]).toContain('tripProfileName');
    expect(output).toContain('Default');
    expect(output.split('\r\n')[0]).not.toContain('generationSetId');
    expect(output).toContain('manual');
  });

  it('exports block Trip profile name alongside its ID', () => {
    const output = blocksCsv([{ id: 'b', scenarioId: 's', serviceDayId: 'd', tripProfileId: 'tp', label: '1', activities: [], ...metadata() }], [{ id: 'tp', scenarioId: 's', name: 'Default', ...metadata() }]);
    expect(output.split('\r\n')[0]).toContain('tripProfileId,tripProfileName');
    expect(output).toContain('tp,Default');
  });

  it('exports normalized Blocking Scenario records and ordered activity rows', () => {
    const scenario = { id: 'bs', scenarioId: 's', tripProfileId: 'tp', name: 'Base', ...metadata() };
    const block = { id: 'b', scenarioId: 's', blockingScenarioId: 'bs', serviceDayId: 'd', label: '1', activities: [{ id: 'trip', type: 'revenueTrip' as const, sequence: 1, tripId: 't' }, { id: 'pullout', type: 'pullOut' as const, sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'n', miles: 1 }, { id: 'deadhead', type: 'deadhead' as const, sequence: 2, minutesAfterPreviousTrip: 8, fromNodeId: 'n', toNodeId: 'm', miles: 1 }], ...metadata() };
    expect(blockingScenariosCsv([scenario], [{ id: 'tp', scenarioId: 's', name: 'Weekday', ...metadata() }]).split('\r\n')[0]).toContain('tripProfileName');
    expect(blockingBlocksCsv([block]).split('\r\n')[0]).toContain('blockingScenarioId');
    const rows = blockingActivitiesCsv([block]).trim().split('\r\n');
    expect(rows[0]).toContain('minutesBeforeFirstTrip');
    expect(rows[0]).toContain('minutesAfterPreviousTrip');
    expect(rows[1]).toContain('pullOut'); expect(rows[1]).toContain(',10,');
    expect(rows[2]).toContain('revenueTrip');
    expect(rows[3]).toContain('deadhead'); expect(rows[3]).toContain(',8,');
  });

  it('exports revenue hours alongside the separate running-time measure', () => {
    const summary = { blockId: 'b', revenueHours: 1.5, runningHours: 1, platformHours: 2, deadheadHours: 0, layoverHours: 0.5, revenueMiles: 10, platformMiles: 10, status: 'incomplete' as const, complete: false, valid: true, findings: [], connections: [], activityTimings: [] };
    const rows = blockingSummariesCsv([summary]).trim().split('\r\n');
    expect(rows[0]).toContain('revenueHours,runningHours,platformHours');
    expect(rows[1]).toContain('1.5,1,2');
  });
});
