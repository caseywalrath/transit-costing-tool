import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { Block, BlockingBlock, BlockingScenario, Node, Route, RouteDirection, RoutePattern, RuntimeProfile, Scenario, Trip, TripGenerationSet, TripProfile } from '../domain/types';
import { csvRows as rfc4180 } from '../testSupport/csvRows';
import type { CostingAssumptionsInput, CostingCalculationResult } from '../domain/costing';
import {
  authoritativeTripsCsv, blockActivitiesCsv, blockingActivitiesCsv, blockingBlocksCsv, blockingScenariosCsv, blockingSummariesCsv, blocksCsv, costingCsvFiles,
  csvEscape, directionColumnsCsv, directionsCsv, generationSetsCsv, neutralizeFormulaText, nodesCsv, patternPointsCsv, patternsCsv, restoreFormulaText, routeCsv,
  runtimeBandsCsv, scheduledPointsCsv, toCsv, tripsCsv,
} from './csv';

// Package P13 (issues I-019, I-070, I-071; decision 5): header escaping, bare CR, and formula-injection protection of free-text cells.

describe('CSV escaping rules', () => {
  it('quotes a field with a comma, a double quote, LF, CR, or CRLF, and leaves plain text alone', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape('a\nb')).toBe('"a\nb"');
    expect(csvEscape('a\r\nb')).toBe('"a\r\nb"');
    expect(csvEscape('a\rb')).toBe('"a\rb"');
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape(undefined)).toBe('');
  });

  it('keeps a Block note with a bare CR in one row for an RFC 4180 reader', () => {
    const block: BlockingBlock = { id: 'b', scenarioId: 's', blockingScenarioId: 'bs', serviceDayId: 'd', label: '1', notes: 'line1\rline2', activities: [], ...metadata() };
    const rows = rfc4180(blockingBlocksCsv([block]));
    expect(rows).toHaveLength(2);
    expect(rows[1][5]).toBe('line1\rline2');
  });

  it('escapes header cells with the same rule as value cells', () => {
    const csv = toCsv(['plain', 'a,b', 'say "hi"', 'two\rlines'], [{ plain: 1, 'a,b': 2, 'say "hi"': 3, 'two\rlines': 4 }]);
    expect(csv).toBe('plain,"a,b","say ""hi""","two\rlines"\r\n1,2,3,4\r\n');
    expect(rfc4180(csv)[0]).toEqual(['plain', 'a,b', 'say "hi"', 'two\rlines']);
  });
});

describe('formula-injection protection (decision 5)', () => {
  it.each(['=1+1', '+1+1', '-2+3', '@SUM(1,1)', '=HYPERLINK("http://x","y")'])('prefixes an apostrophe to %s and restores it', (text) => {
    const protectedText = neutralizeFormulaText(text);
    expect(protectedText).toBe(`'${text}`);
    expect(restoreFormulaText(protectedText)).toBe(text);
  });

  it.each(['Federal', '', "'Til midnight", "it's", 'A=B', '5 minutes', ' =1', 'x-ray'])('leaves %j as it is', (text) => {
    expect(neutralizeFormulaText(text)).toBe(text);
    expect(restoreFormulaText(text)).toBe(text);
  });

  it.each(["'=1+1", "''=1+1", "'-5", "'@home"])('round trips %j, which already starts with an apostrophe before a trigger', (text) => {
    expect(restoreFormulaText(neutralizeFormulaText(text))).toBe(text);
    expect(neutralizeFormulaText(text)).toBe(`'${text}`);
  });

  it('restores only an apostrophe that protects a trigger character', () => {
    expect(restoreFormulaText("'abc")).toBe("'abc");
    expect(restoreFormulaText("'")).toBe("'");
  });
});

const H = '=1+1';
const meta = metadata('2026-01-01T00:00:00.000Z');
const profile: TripProfile = { id: H, scenarioId: 's', name: H, ...meta };

/**
 * Every string field of every record below holds `=1+1`. A column in `freeText` must come out as `'=1+1`; every other column
 * (identifiers, kinds, enumerations) must come out as `=1+1`, unchanged.
 */
interface Case { name: string; csv: string[]; freeText: string[] }
function cases(): Case[] {
  const route: Route = { id: H, scenarioId: H, name: H, shortName: H, description: H, ...meta };
  const node: Node = { id: H, scenarioId: H, routeId: H, name: H, shortName: H, kind: H as Node['kind'], notes: H, ...meta };
  const pattern: RoutePattern = { id: H, scenarioId: H, routeId: H, name: H, directionId: H, sequence: 0, directionLabel: H, notes: H, points: [{ id: H, nodeId: H, sequence: 0, cumulativeMiles: -1, directionColumnId: H }], ...meta } as RoutePattern;
  const direction: RouteDirection = { id: H, scenarioId: H, routeId: H, name: H, sequence: 0, columns: [{ id: H, nodeId: H, sequence: 0, labelOverride: H }], ...meta } as RouteDirection;
  const runtime: RuntimeProfile = { id: H, scenarioId: H, routeId: H, patternId: H, name: H, bands: [{ id: H, label: H, sequence: 0, startTime: 3600, endTime: 7200, segmentRuntimeSeconds: [60] }], ...meta } as RuntimeProfile;
  const set: TripGenerationSet = { id: H, scenarioId: H, routeId: H, serviceDayId: H, patternId: H, name: H, firstDeparture: 3600, headwaySeconds: 600, limit: { mode: 'tripCount', tripCount: 2 }, generationRevision: 1, ...meta } as TripGenerationSet;
  const trip: Trip = { id: H, scenarioId: H, routeId: H, serviceDayId: H, tripProfileId: H, patternId: H, publicLabel: H, stopTimes: [{ patternPointId: H, sequence: 0, time: 3600 }], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [H], manualTimeShiftSeconds: -60, calculationSource: { runtimeProfileId: H, runtimeCalculationRevision: 1 } } as unknown as Trip['provenance'], ...meta };
  const activities = [
    { id: H, type: 'pullOut' as const, sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: H, miles: -1 },
    { id: H, type: 'revenueTrip' as const, sequence: 1, tripId: H },
    { id: H, type: 'deadhead' as const, sequence: 2, startTime: 3600, endTime: 3900, fromNodeId: H, toNodeId: H, miles: 1 },
  ];
  const block: Block = { id: H, scenarioId: H, serviceDayId: H, tripProfileId: H, label: H, notes: H, activities, ...meta } as Block;
  const blockingBlock: BlockingBlock = { id: H, scenarioId: H, blockingScenarioId: H, serviceDayId: H, label: H, notes: H, activities, ...meta };
  const blockingScenario: BlockingScenario = { id: H, scenarioId: H, tripProfileId: H, name: H, description: H, ...meta };
  const summary = { blockId: H, revenueHours: 1, runningHours: 1, platformHours: 1, deadheadHours: 0, layoverHours: 0, status: 'complete' as const, complete: true, valid: true, findings: [], connections: [], activityTimings: [] };
  const scenario: Scenario = { id: H, projectId: H, name: H, ...meta };
  const assumptions: CostingAssumptionsInput = { enteredRate: 100, rateYear: 2024, sourceType: 'user', sourceNote: H, baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0.03 };
  const result: CostingCalculationResult = {
    basis: 'blocked', state: 'partial', sourceRate: 100, sourceRateYear: 2024, annualEscalation: 0.03, eligibleBlockCount: 1, excludedBlockCount: 1, unassignedTripCount: 1, findings: [],
    exclusions: [{ serviceDayId: H, serviceDayName: H, excludedBlockCount: 1, unassignedTripCount: 1, blocks: [{ blockId: H, blockLabel: H, reasonCodes: ['block.invalid'] }] }],
    dailyRows: [{ serviceDayId: H, serviceDayName: H, serviceDayKind: 'weekday', annualServiceDays: 1, eligibleBlockCount: 1, excludedBlockCount: 1, unassignedTripCount: 1, revenueHoursPerDay: 1, platformHoursPerDay: 1, annualRevenueHours: 1, annualPlatformHours: 1, yearCosts: [{ serviceYear: 2026, costPerDayUsd: 100, annualCostUsd: 100 }] }],
    yearRows: [{ serviceYear: 2026, appliedRateUsdPerRevenueHour: 100, annualRevenueHours: 1, annualPlatformHours: 1, annualCostUsd: 100 }],
  };
  const [costAssumptions, costResults, costExclusions] = costingCsvFiles(scenario, blockingScenario, profile, assumptions, result).map((file) => file.contents);
  return [
    { name: 'routeCsv', csv: [routeCsv(route)], freeText: ['name', 'shortName', 'description'] },
    { name: 'nodesCsv', csv: [nodesCsv([node])], freeText: ['name', 'shortName', 'notes'] },
    { name: 'patternsCsv', csv: [patternsCsv([pattern])], freeText: ['name', 'directionLabel', 'notes'] },
    { name: 'patternPointsCsv', csv: [patternPointsCsv([pattern])], freeText: [] },
    { name: 'directionsCsv', csv: [directionsCsv([direction])], freeText: ['name'] },
    { name: 'directionColumnsCsv', csv: [directionColumnsCsv([direction])], freeText: ['labelOverride'] },
    { name: 'runtimeBandsCsv', csv: [runtimeBandsCsv([runtime])], freeText: ['profileName', 'label'] },
    { name: 'generationSetsCsv', csv: [generationSetsCsv([set])], freeText: ['name'] },
    { name: 'tripsCsv', csv: [tripsCsv([trip], [profile])], freeText: ['tripProfileName', 'publicLabel'] },
    { name: 'authoritativeTripsCsv', csv: [authoritativeTripsCsv([trip], [profile])], freeText: ['tripProfileName', 'publicLabel'] },
    { name: 'scheduledPointsCsv', csv: [scheduledPointsCsv([trip])], freeText: [] },
    { name: 'blocksCsv', csv: [blocksCsv([block], [profile])], freeText: ['tripProfileName', 'label', 'notes'] },
    { name: 'blockActivitiesCsv', csv: [blockActivitiesCsv([block])], freeText: [] },
    { name: 'blockingScenariosCsv', csv: [blockingScenariosCsv([blockingScenario], [profile])], freeText: ['tripProfileName', 'name', 'description'] },
    { name: 'blockingBlocksCsv', csv: [blockingBlocksCsv([blockingBlock])], freeText: ['label', 'notes'] },
    { name: 'blockingActivitiesCsv', csv: [blockingActivitiesCsv([blockingBlock])], freeText: [] },
    { name: 'blockingSummariesCsv', csv: [blockingSummariesCsv([summary])], freeText: [] },
    { name: 'costing-assumptions', csv: [costAssumptions], freeText: ['scenarioName', 'blockingScenarioName', 'tripProfileName', 'sourceNote'] },
    { name: 'costing-results', csv: [costResults], freeText: ['scenarioName', 'blockingScenarioName', 'tripProfileName', 'serviceDayName'] },
    { name: 'costing-exclusions', csv: [costExclusions], freeText: ['scenarioName', 'blockingScenarioName', 'tripProfileName', 'serviceDayName', 'blockLabel'] },
  ];
}

describe('every exporter protects its free-text columns and only those', () => {
  it.each(cases().map((entry) => [entry.name, entry] as const))('%s', (_name, entry) => {
    const [headers, ...rows] = rfc4180(entry.csv[0]);
    expect(rows.length).toBeGreaterThan(0);
    const seenFreeText = new Set<string>();
    for (const row of rows) {
      headers.forEach((header, index) => {
        const cell = row[index];
        if (entry.freeText.includes(header)) { if (cell !== '') { expect(cell, `${header} must be protected`).toBe(`'${H}`); seenFreeText.add(header); } }
        else if (cell === H || cell === `'${H}`) expect(cell, `${header} is an identifier and must not be prefixed`).toBe(H);
      });
    }
    expect([...seenFreeText].sort()).toEqual([...entry.freeText].sort());
  });

  it('never prefixes a number, a time, or a negative amount', () => {
    const block: BlockingBlock = { id: '-id', scenarioId: 's', blockingScenarioId: 'bs', serviceDayId: 'd', label: '-5 stops', activities: [{ id: 'a', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: '-node', miles: -1 }, { id: 'b', type: 'deadhead', sequence: 1, startTime: 90000, endTime: 90600, fromNodeId: 'x', toNodeId: 'y' }], ...meta };
    const rows = rfc4180(blockingActivitiesCsv([block]));
    expect(rows[1][rows[0].indexOf('miles')]).toBe('-1');
    expect(rows[1][rows[0].indexOf('toNodeId')]).toBe('-node');
    expect(rows[2][rows[0].indexOf('startTime')]).toBe('25:00');
    expect(rfc4180(blockingBlocksCsv([block]))[1].slice(0, 5)).toEqual(['-id', 's', 'bs', 'd', "'-5 stops"]);
  });
});
