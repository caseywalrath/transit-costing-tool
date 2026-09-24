import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import { authoritativeTripsCsv, blockingActivitiesCsv, blockingBlocksCsv, blockingScenariosCsv, blockingSummariesCsv, blocksCsv, costingCsvFiles, createCsvArchive, csvEscape, generationSetsCsv, patternPointsCsv, routeCsv, scheduledPointsCsv, tripsCsv } from './csv';
import type { CostingAssumptionsInput, CostingCalculationResult } from '../domain/costing';

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

  it('exports all service-day/year rows, independently rounded totals, and exclusions in one ZIP', async () => {
    const scenario = { id: 'scenario', projectId: 'project', name: 'Base', ...metadata() };
    const blockingScenario = { id: 'blocking', scenarioId: scenario.id, tripProfileId: 'profile', name: 'Weekday blocks', ...metadata() };
    const profile = { id: 'profile', scenarioId: scenario.id, name: 'Default', ...metadata() };
    const assumptions: CostingAssumptionsInput = {
      enteredRate: 1.00005, rateYear: 2024, sourceType: 'ntd', sourceNote: 'NTD source',
      baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0.03,
    };
    const result: CostingCalculationResult = {
      state: 'partial', sourceRate: 1.00005, sourceRateYear: 2024, annualEscalation: 0.03,
      eligibleBlockCount: 2, excludedBlockCount: 1, unassignedTripCount: 2, findings: [],
      exclusions: [
        { serviceDayId: 'weekday', serviceDayName: 'Weekday', excludedBlockCount: 1, unassignedTripCount: 0, blocks: [{ blockId: 'bad-block', blockLabel: '3', reasonCodes: ['block.connectionIncomplete'] }] },
        { serviceDayId: 'saturday', serviceDayName: 'Saturday', excludedBlockCount: 0, unassignedTripCount: 2, blocks: [] },
      ],
      dailyRows: [
        { serviceDayId: 'weekday', serviceDayName: 'Weekday', serviceDayKind: 'weekday', annualServiceDays: 1, eligibleBlockCount: 1, excludedBlockCount: 1, unassignedTripCount: 0, revenueHoursPerDay: 0.005, platformHoursPerDay: 0.005, annualRevenueHours: 0.005, annualPlatformHours: 0.005, yearCosts: [{ serviceYear: 2026, costPerDayUsd: 0.005, annualCostUsd: 0.005 }] },
        { serviceDayId: 'saturday', serviceDayName: 'Saturday', serviceDayKind: 'saturday', annualServiceDays: 1, eligibleBlockCount: 1, excludedBlockCount: 0, unassignedTripCount: 2, revenueHoursPerDay: 0.005, platformHoursPerDay: 0.005, annualRevenueHours: 0.005, annualPlatformHours: 0.005, yearCosts: [{ serviceYear: 2026, costPerDayUsd: 0.005, annualCostUsd: 0.005 }] },
      ],
      yearRows: [{ serviceYear: 2026, appliedRateUsdPerRevenueHour: 1.00005, annualRevenueHours: 0.01, annualPlatformHours: 0.01, annualCostUsd: 0.01 }],
    };
    const files = costingCsvFiles(scenario, blockingScenario, profile, assumptions, result);
    expect(files.map((file) => file.suffix)).toEqual(['costing-assumptions', 'costing-results', 'costing-exclusions']);
    const rows = files[1].contents.trim().split('\r\n');
    expect(rows[0]).toContain('appliedRateUsdPerRevenueHour');
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain(',0.0050,0.0050,0.0050,0.0050,1.0001,0.01,0.01,');
    expect(rows[3]).toContain(',0.0100,0.0100,1.0001,,0.01,');
    expect(files[2].contents).toContain('bad-block,3,block.connectionIncomplete');
    expect(files[2].contents).toContain('unassignedTrips');

    const archive = createCsvArchive(files.map((file) => ({ filename: `${file.suffix}.csv`, contents: file.contents })));
    const bytes = new Uint8Array(await archive.arrayBuffer());
    expect(archive.type).toBe('application/zip');
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const archiveText = new TextDecoder().decode(bytes);
    expect(archiveText).toContain('costing-assumptions.csv');
    expect(archiveText).toContain('costing-results.csv');
    expect(archiveText).toContain('costing-exclusions.csv');
    expect([...bytes.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });
});
