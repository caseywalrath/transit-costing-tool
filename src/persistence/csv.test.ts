import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import { authoritativeTripsCsv, blockingActivitiesCsv, blockingBlocksCsv, blockingScenariosCsv, blockingSummariesCsv, blocksCsv, costingCsvFiles, createCsvArchive, csvEscape, generationSetsCsv, patternPointsCsv, routeCsv, scheduledPointsCsv, tripsCsv } from './csv';
import type { CostingAssumptionsInput, CostingCalculationResult } from '../domain/costing';
import type { EstimatedCostingCalculationResult } from '../domain/estimatedCosting';

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

  describe('Costing CSV headers and the estimated basis (Decision 0051)', () => {
    const scenario = { id: 'scenario', projectId: 'project', name: 'Alt', ...metadata() };
    const profile = { id: 'profile', scenarioId: scenario.id, name: 'Alt B', ...metadata() };
    const assumptions: CostingAssumptionsInput = {
      enteredRate: 100, rateYear: 2026, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0.03,
      estimateFactors: { allDays: { layoverFraction: 0.1823455, deadheadFraction: 0.056 }, serviceDays: [] },
    };
    const estimated: EstimatedCostingCalculationResult = {
      basis: 'estimated', tripProfileId: profile.id, state: 'partial', sourceRate: 100, sourceRateYear: 2026, annualEscalation: 0.03, tripCount: 5, tripsWithoutRunTimeCount: 1, findings: [],
      dailyRows: [
        { serviceDayId: 'weekday', serviceDayName: 'Weekday', serviceDayKind: 'weekday', annualServiceDays: 255, tripCount: 4, tripsWithoutRunTimeCount: 1, runningHoursPerDay: 8, annualRunningHours: 2040, factors: { layoverFraction: 0.2, layoverSource: 'serviceDay', deadheadFraction: 0.2, deadheadSource: 'allDays' }, revenueHoursPerDay: 10, platformHoursPerDay: 12.5, annualRevenueHours: 2550, annualPlatformHours: 3187.5, yearCosts: [{ serviceYear: 2026, costPerDayUsd: 1000, annualCostUsd: 255000 }] },
        { serviceDayId: 'saturday', serviceDayName: 'Saturday', serviceDayKind: 'saturday', annualServiceDays: 52, tripCount: 1, tripsWithoutRunTimeCount: 0, runningHoursPerDay: 2, annualRunningHours: 104, factors: { layoverFraction: 0.1823455, layoverSource: 'allDays' }, revenueHoursPerDay: 2.5, annualRevenueHours: 130, yearCosts: [{ serviceYear: 2026, costPerDayUsd: 250, annualCostUsd: 13000 }] },
      ],
      yearRows: [{ serviceYear: 2026, appliedRateUsdPerRevenueHour: 100, annualRunningHours: 2144, annualRevenueHours: 2680, annualCostUsd: 268000 }],
    };

    it('writes the new headers of all three files', () => {
      const [a, r, e] = costingCsvFiles(scenario, { kind: 'estimated', tripProfile: profile }, assumptions, estimated).map((file) => file.contents.split('\r\n')[0]);
      expect(a).toBe('projectId,scenarioId,scenarioName,blockingScenarioId,blockingScenarioName,tripProfileId,tripProfileName,costBasisKind,costBasis,currencyCode,rateUnit,enteredRateUsdPerRevenueHour,rateYear,sourceType,sourceNote,baseServiceYear,futureYearCount,annualEscalationFraction,allDaysLayoverFraction,allDaysDeadheadFraction,roundingNote');
      expect(r).toBe('rowType,projectId,scenarioId,scenarioName,blockingScenarioId,blockingScenarioName,tripProfileId,tripProfileName,costBasisKind,estimateState,noEstimateReason,serviceYear,serviceDayId,serviceDayName,annualServiceDays,eligibleBlockCount,excludedBlockCount,unassignedTripCount,tripCount,tripsWithoutRunTimeCount,runningHoursPerDay,annualRunningHours,layoverFraction,layoverFactorSource,deadheadFraction,deadheadFactorSource,revenueHoursPerDay,platformHoursPerDay,annualRevenueHours,annualPlatformHours,appliedRateUsdPerRevenueHour,costPerDayUsd,annualCostUsd,roundingNote');
      expect(e).toBe('projectId,scenarioId,scenarioName,blockingScenarioId,blockingScenarioName,tripProfileId,tripProfileName,serviceDayId,serviceDayName,exclusionType,blockId,blockLabel,reasonCodes,unassignedTripCount,tripsWithoutRunTimeCount');
    });

    it('writes an estimated basis row by row: blank Block columns, blank platform when unknown, factors to 6 decimals', () => {
      const [a, r, e] = costingCsvFiles(scenario, { kind: 'estimated', tripProfile: profile }, assumptions, estimated).map((file) => file.contents.trim().split('\r\n'));
      expect(a[1]).toBe('project,scenario,Alt,,,profile,Alt B,estimated,Revenue Hours,USD,USD/VRH,100.0000,2026,user,,2026,0,0.03,0.182346,0.056000,USD amounts and applied rates are independently rounded to 2 and 4 decimals; hours to 4 decimals; factors to 6 decimals.');
      expect(r[1]).toBe('serviceDay,project,scenario,Alt,,,profile,Alt B,estimated,partial,,2026,weekday,Weekday,255,,,,4,1,8.0000,2040.0000,0.200000,serviceDay,0.200000,allDays,10.0000,12.5000,2550.0000,3187.5000,100.0000,1000.00,255000.00,');
      expect(r[2]).toBe('serviceDay,project,scenario,Alt,,,profile,Alt B,estimated,partial,,2026,saturday,Saturday,52,,,,1,0,2.0000,104.0000,0.182346,allDays,,,2.5000,,130.0000,,100.0000,250.00,13000.00,');
      expect(r[3]).toBe('total,project,scenario,Alt,,,profile,Alt B,estimated,partial,,2026,,,,,,,5,1,,2144.0000,,,,,,,2680.0000,,100.0000,,268000.00,Total is rounded independently from unrounded service-day values.');
      expect(e).toEqual([
        e[0],
        'project,scenario,Alt,,,profile,Alt B,weekday,Weekday,tripsWithoutRunTime,,,,,1',
      ]);
    });

    it('rounds a factor tie away from zero', () => {
      const tie = costingCsvFiles(scenario, { kind: 'estimated', tripProfile: profile }, { ...assumptions, estimateFactors: { allDays: { layoverFraction: 0.0000005, deadheadFraction: 0.1234565 }, serviceDays: [] } }, estimated)[0].contents;
      expect(tie).toContain(',0.000001,0.123457,');
    });

    it('leaves the estimate columns blank on a blocked row and writes the kind', () => {
      const blocked: CostingCalculationResult = {
        basis: 'blocked', state: 'complete', sourceRate: 100, sourceRateYear: 2026, annualEscalation: 0.03, eligibleBlockCount: 1, excludedBlockCount: 0, unassignedTripCount: 0, findings: [],
        exclusions: [{ serviceDayId: 'weekday', serviceDayName: 'Weekday', excludedBlockCount: 0, unassignedTripCount: 0, blocks: [] }],
        dailyRows: [{ serviceDayId: 'weekday', serviceDayName: 'Weekday', serviceDayKind: 'weekday', annualServiceDays: 1, eligibleBlockCount: 1, excludedBlockCount: 0, unassignedTripCount: 0, revenueHoursPerDay: 1, platformHoursPerDay: 2, annualRevenueHours: 1, annualPlatformHours: 2, yearCosts: [{ serviceYear: 2026, costPerDayUsd: 100, annualCostUsd: 100 }] }],
        yearRows: [{ serviceYear: 2026, appliedRateUsdPerRevenueHour: 100, annualRevenueHours: 1, annualPlatformHours: 2, annualCostUsd: 100 }],
      };
      const blockingScenario = { id: 'blocking', scenarioId: scenario.id, tripProfileId: profile.id, name: 'Plan', ...metadata() };
      const [a, r] = costingCsvFiles(scenario, { kind: 'blocked', blockingScenario, tripProfile: profile }, { ...assumptions, estimateFactors: undefined }, blocked).map((file) => file.contents.trim().split('\r\n'));
      expect(a[1]).toContain('project,scenario,Alt,blocking,Plan,profile,Alt B,blocked,Revenue Hours,');
      expect(a[1]).toContain(',0.03,,,USD amounts');
      expect(r[1]).toBe('serviceDay,project,scenario,Alt,blocking,Plan,profile,Alt B,blocked,complete,,2026,weekday,Weekday,1,1,0,0,,,,,,,,,1.0000,2.0000,1.0000,2.0000,100.0000,100.00,100.00,');
    });

    it('leaves platform and running totals blank when no rate is entered and a day has no platform hours', () => {
      const noRate: EstimatedCostingCalculationResult = { ...estimated, state: 'noEstimate', noEstimateReason: 'rateMissing', yearRows: [], dailyRows: estimated.dailyRows.map((day) => ({ ...day, yearCosts: [] })) };
      const rows = costingCsvFiles(scenario, { kind: 'estimated', tripProfile: profile }, assumptions, noRate)[1].contents.trim().split('\r\n');
      expect(rows.at(-1)).toBe('total,project,scenario,Alt,,,profile,Alt B,estimated,noEstimate,rateMissing,,,,,,,,5,1,,2144.0000,,,,,,,2680.0000,,,,,Quantities are rounded independently from unrounded service-day values; no cost rate is available.');
    });
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
      basis: 'blocked', state: 'partial', sourceRate: 1.00005, sourceRateYear: 2024, annualEscalation: 0.03,
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
    const files = costingCsvFiles(scenario, { kind: 'blocked', blockingScenario, tripProfile: profile }, assumptions, result);
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
