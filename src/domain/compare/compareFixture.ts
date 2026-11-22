// The worked example of Decision 0091 (tests/fixtures/scenario-compare/README.md), built in code for the comparison tests. Trips, patterns,
// directions and Blocks are real domain records, and their summaries come from `summarizeBlock`. Hours are given inputs, as if read
// from Costing's Route rows (the README says so); the first-year cost is hours × count × the worked rate. Not used by the app.

import { summarizeBlock } from '../blocking';
import { ownOrScenarioCount } from '../costing';
import type { BlockActivity, BlockingBlock, EntityId, Route, RouteDirection, RoutePattern, ServiceDayDefinition, ServiceDayKind, Trip } from '../types';
import { applyCountChoice } from './countChoice';
import { peakByRoute, type PeakBlock } from './peaks';
import { routeDayMeasures } from './routeMeasures';
import { matchRoutes } from './routeMatch';
import { matchServiceDays } from './serviceDayMatch';
import type { ComparisonInput, SideChoice, SideDay, SideRouteFigures, ServiceDayPair } from './types';

/** README "Shared settings": $100 per revenue hour, first service year 2027, on both sides. */
export const WORKED_RATE_PER_HOUR = 100;

const META = { createdAt: '2026-11-22T00:00:00.000Z', updatedAt: '2026-11-22T00:00:00.000Z' };

/** Service seconds from a clock text such as "06:45" (hours past 23 allowed). */
export function clock(text: string): number {
  const [hours, minutes] = text.split(':').map(Number);
  return hours * 3600 + minutes * 60;
}

/** One Costing Route row as given: revenue hours per service day. `routeId` null is the Unattributed row. */
export interface ExampleCostingRow { routeId: EntityId | null; dayKind: ServiceDayKind; revenueHours: number }

/** One side of a comparison: the records of one Scenario and its Blocking scenario, plus Costing's Route rows as given. */
export interface ExampleSide {
  routes: Route[];
  serviceDays: ServiceDayDefinition[];
  patterns: RoutePattern[];
  directions: RouteDirection[];
  trips: Trip[];
  blocks: BlockingBlock[];
  costing: ExampleCostingRow[];
}

export function route(scenarioId: string, id: string, name: string, shortName?: string, gtfsRouteId?: string): Route {
  return { id, scenarioId, name, ...(shortName ? { shortName } : {}), ...(gtfsRouteId ? { gtfsRouteId } : {}), ...META };
}

export function serviceDay(scenarioId: string, id: string, kind: ServiceDayKind, name: string, annualServiceDays: number, sequence: number): ServiceDayDefinition {
  return { id, scenarioId, kind, name, annualServiceDays, sequence, ...META };
}

export function direction(scenarioId: string, routeId: string, group: 'outbound' | 'inbound', sequence: number): RouteDirection {
  return { id: `${routeId}-${group}`, scenarioId, routeId, name: group === 'outbound' ? 'Outbound' : 'Inbound', group, sequence, columns: [], ...META };
}

/** A pattern from its points (node name and cumulative miles). The pattern's direction is the route's direction of that group. */
export function pattern(scenarioId: string, id: string, routeId: string, group: 'outbound' | 'inbound', points: Array<[string, number]>): RoutePattern {
  return {
    id,
    scenarioId,
    routeId,
    name: id,
    directionId: `${routeId}-${group}`,
    points: points.map(([node, cumulativeMiles], index) => ({ id: `${id}-${node}`, nodeId: node, sequence: index, cumulativeMiles })),
    ...META,
  };
}

/** A Trip that starts at `start` and runs `minutes` over its pattern; stop times are spread evenly across the pattern's points. */
export function trip(scenarioId: string, id: string, patternRecord: RoutePattern, serviceDayId: string, start: string, minutes: number): Trip {
  const startSeconds = clock(start);
  const span = minutes * 60;
  const last = patternRecord.points.length - 1;
  return {
    id,
    scenarioId,
    routeId: patternRecord.routeId,
    serviceDayId,
    patternId: patternRecord.id,
    stopTimes: patternRecord.points.map((point, index) => ({ patternPointId: point.id, sequence: index, time: startSeconds + Math.round((span * index) / last) })),
    provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [] },
    ...META,
  };
}

/** A Block: pull-out and pull-in with their clock times, and the revenue Trips in order. Times are explicit, as Blocking's summary reads them. */
export function block(scenarioId: string, blockingScenarioId: string, serviceDayId: string, id: string, label: string, pullOut: [string, string], trips: Trip[], pullIn: [string, string]): BlockingBlock {
  const activities: BlockActivity[] = [
    { id: `${id}-out`, type: 'pullOut', sequence: 0, startTime: clock(pullOut[0]), endTime: clock(pullOut[1]), toNodeId: 'garage' },
    ...trips.map((item, index): BlockActivity => ({ id: `${id}-trip-${index}`, type: 'revenueTrip', sequence: index + 1, tripId: item.id })),
    { id: `${id}-in`, type: 'pullIn', sequence: trips.length + 1, startTime: clock(pullIn[0]), endTime: clock(pullIn[1]), fromNodeId: 'garage' },
  ];
  return { id, scenarioId, blockingScenarioId, serviceDayId, label, activities, ...META };
}

/** The per-day figures of one side: count in use, hours (given), first-year cost, measures, and the peaks of that day's Blocks. */
function sideDays(data: ExampleSide, side: 'baseline' | 'proposed', dayPairs: ServiceDayPair[]): Map<string, SideDay> {
  const result = new Map<string, SideDay>();
  for (const pair of dayPairs) {
    const original = pair[side];
    if (!original) continue;
    // The counts may have been changed by applyCountChoice; the day used is the copy in `data`.
    const day = data.serviceDays.find((candidate) => candidate.id === original.id) ?? original;
    const routes = new Map<EntityId | null, SideRouteFigures>();
    const measuresOf = (routeId: EntityId) => routeDayMeasures({ routeId, serviceDayId: day.id, trips: data.trips, patterns: data.patterns, directions: data.directions });

    for (const routeRecord of data.routes) {
      const count = ownOrScenarioCount(routeRecord, day).count;
      const hours = data.costing.find((row) => row.routeId === routeRecord.id && row.dayKind === day.kind)?.revenueHours ?? 0;
      routes.set(routeRecord.id, { annualServiceDays: count, revenueHoursPerDay: hours, firstYearCost: hours * count * WORKED_RATE_PER_HOUR, measures: measuresOf(routeRecord.id) });
    }
    const unattributed = data.costing.find((row) => row.routeId === null && row.dayKind === day.kind);
    if (unattributed) {
      // The Unattributed row takes the largest count of its Routes; in the example every Route's count on the day is the Scenario's.
      const count = day.annualServiceDays;
      routes.set(null, { annualServiceDays: count, revenueHoursPerDay: unattributed.revenueHours, firstYearCost: unattributed.revenueHours * count * WORKED_RATE_PER_HOUR, measures: { trips: 0, directions: [] } });
    }

    const peakBlocks: PeakBlock[] = data.blocks
      .filter((blockRecord) => blockRecord.serviceDayId === day.id)
      .map((blockRecord) => ({ block: blockRecord, summary: summarizeBlock(blockRecord, { trips: data.trips, patterns: data.patterns }) }));
    result.set(pair.key, { routes, peaks: peakByRoute(peakBlocks, data.trips) });
  }
  return result;
}

/**
 * Everything `buildComparison` needs, from two sides, with the counts applied as the count choice says (Decision 0091 item 7). The
 * Baseline and Proposed are the arguments' roles, so swapping the arguments swaps the sides.
 */
export function prepareComparison(baseline: ExampleSide, proposed: ExampleSide, choice: SideChoice = 'baseline'): Omit<ComparisonInput, 'day'> {
  const routeMatch = matchRoutes(baseline.routes, proposed.routes);
  const dayPairs = matchServiceDays(baseline.serviceDays, proposed.serviceDays);
  const counted = applyCountChoice(
    choice,
    { serviceDays: baseline.serviceDays, routes: baseline.routes },
    { serviceDays: proposed.serviceDays, routes: proposed.routes },
    routeMatch.pairs,
    dayPairs,
  );
  return {
    routeMatch,
    dayPairs,
    baseline: sideDays({ ...baseline, serviceDays: counted.baseline.serviceDays, routes: counted.baseline.routes }, 'baseline', dayPairs),
    proposed: sideDays({ ...proposed, serviceDays: counted.proposed.serviceDays, routes: counted.proposed.routes }, 'proposed', dayPairs),
  };
}

const SCENARIO_BASELINE = 'scn-existing';
const SCENARIO_PROPOSED = 'scn-redesign';

/** "Existing" (README, Baseline). Route R1 is short 1 with GTFS route 1; R2 has no GTFS route ID; R5 is matched by short name. */
export function baselineSide(): ExampleSide {
  const S = SCENARIO_BASELINE;
  const weekday = serviceDay(S, 'b-wd', 'weekday', 'Weekday', 251, 1);
  const saturday = serviceDay(S, 'b-sat', 'saturday', 'Saturday', 52, 2);
  const outbound1 = pattern(S, 'b-r1-out', 'b-r1', 'outbound', [['A', 0], ['B', 2.5], ['C', 6]]);
  const inbound1 = pattern(S, 'b-r1-in', 'b-r1', 'inbound', [['C', 0], ['B', 3.5], ['A', 6]]);
  const outbound2 = pattern(S, 'b-r2-out', 'b-r2', 'outbound', [['D', 0], ['E', 4]]);
  const outbound5 = pattern(S, 'b-r5-out', 'b-r5', 'outbound', [['L', 0], ['M', 3]]);
  const trips: Trip[] = [
    trip(S, 'b-wd-r1-out-0600', outbound1, weekday.id, '06:00', 30),
    trip(S, 'b-wd-r1-out-0630', outbound1, weekday.id, '06:30', 30),
    trip(S, 'b-wd-r1-out-0700', outbound1, weekday.id, '07:00', 30),
    trip(S, 'b-wd-r1-out-0900', outbound1, weekday.id, '09:00', 30),
    trip(S, 'b-wd-r1-out-1000', outbound1, weekday.id, '10:00', 30),
    trip(S, 'b-wd-r1-in-0645', inbound1, weekday.id, '06:45', 30),
    trip(S, 'b-wd-r1-in-0745', inbound1, weekday.id, '07:45', 30),
    trip(S, 'b-wd-r2-out-0800', outbound2, weekday.id, '08:00', 20),
    trip(S, 'b-wd-r5-out-0800', outbound5, weekday.id, '08:00', 15),
    trip(S, 'b-sat-r2-out-0800', outbound2, saturday.id, '08:00', 20),
  ];
  const byId = (id: string) => trips.find((item) => item.id === id) as Trip;
  return {
    routes: [route(S, 'b-r1', 'Main Street', '1', '1'), route(S, 'b-r2', 'Crosstown', '2'), route(S, 'b-r5', 'Loop', '5')],
    serviceDays: [weekday, saturday],
    patterns: [outbound1, inbound1, outbound2, outbound5],
    directions: [direction(S, 'b-r1', 'outbound', 1), direction(S, 'b-r1', 'inbound', 2), direction(S, 'b-r2', 'outbound', 1), direction(S, 'b-r5', 'outbound', 1)],
    trips,
    blocks: [
      block(S, 'base-blocks', weekday.id, 'b-x1', 'X1', ['05:50', '06:00'], [byId('b-wd-r1-out-0600'), byId('b-wd-r1-in-0645')], ['07:15', '07:25']),
      block(S, 'base-blocks', weekday.id, 'b-x2', 'X2', ['06:20', '06:30'], [byId('b-wd-r1-out-0630'), byId('b-wd-r1-in-0745')], ['08:15', '08:25']),
      block(S, 'base-blocks', weekday.id, 'b-x3', 'X3', ['07:50', '08:00'], [byId('b-wd-r2-out-0800')], ['08:20', '08:30']),
    ],
    costing: [
      { routeId: 'b-r1', dayKind: 'weekday', revenueHours: 3.5 },
      { routeId: 'b-r2', dayKind: 'weekday', revenueHours: 0.4 },
      { routeId: 'b-r5', dayKind: 'weekday', revenueHours: 0.25 },
      { routeId: 'b-r2', dayKind: 'saturday', revenueHours: 0.4 },
    ],
  };
}

/** "Redesign" (README, Proposed). R1 is renamed "Main St" and extended to F; R3 is new; R2 is gone. */
export function proposedSide(): ExampleSide {
  const S = SCENARIO_PROPOSED;
  const weekday = serviceDay(S, 'p-wd', 'weekday', 'Weekday', 251, 1);
  const saturday = serviceDay(S, 'p-sat', 'saturday', 'Saturday', 52, 2);
  const outbound1 = pattern(S, 'p-r1-out', 'p-r1', 'outbound', [['A', 0], ['B', 2.5], ['C', 6], ['F', 7.5]]);
  const inbound1 = pattern(S, 'p-r1-in', 'p-r1', 'inbound', [['C', 0], ['B', 3.5], ['A', 6]]);
  const outbound3 = pattern(S, 'p-r3-out', 'p-r3', 'outbound', [['G', 0], ['H', 12]]);
  const outbound5 = pattern(S, 'p-r5-out', 'p-r5', 'outbound', [['L', 0], ['M', 3]]);
  const trips: Trip[] = [
    trip(S, 'p-wd-r1-out-0600', outbound1, weekday.id, '06:00', 36),
    trip(S, 'p-wd-r1-out-0620', outbound1, weekday.id, '06:20', 36),
    trip(S, 'p-wd-r1-out-0640', outbound1, weekday.id, '06:40', 36),
    trip(S, 'p-wd-r1-out-0700', outbound1, weekday.id, '07:00', 36),
    trip(S, 'p-wd-r1-out-0900', outbound1, weekday.id, '09:00', 36),
    trip(S, 'p-wd-r1-out-1000', outbound1, weekday.id, '10:00', 36),
    trip(S, 'p-wd-r1-in-0645', inbound1, weekday.id, '06:45', 30),
    trip(S, 'p-wd-r1-in-0745', inbound1, weekday.id, '07:45', 30),
    trip(S, 'p-wd-r3-out-0720', outbound3, weekday.id, '07:20', 40),
    trip(S, 'p-wd-r5-out-0800', outbound5, weekday.id, '08:00', 15),
    trip(S, 'p-sat-r1-out-0800', outbound1, saturday.id, '08:00', 36),
  ];
  const byId = (id: string) => trips.find((item) => item.id === id) as Trip;
  return {
    routes: [route(S, 'p-r1', 'Main St', '1', '1'), route(S, 'p-r3', 'Airport', '3', '3'), route(S, 'p-r5', 'Loop', '5')],
    serviceDays: [weekday, saturday],
    patterns: [outbound1, inbound1, outbound3, outbound5],
    directions: [direction(S, 'p-r1', 'outbound', 1), direction(S, 'p-r1', 'inbound', 2), direction(S, 'p-r3', 'outbound', 1), direction(S, 'p-r5', 'outbound', 1)],
    trips,
    blocks: [
      block(S, 'draft-blocks', weekday.id, 'y-1', 'Y1', ['05:50', '06:00'], [byId('p-wd-r1-out-0600'), byId('p-wd-r1-in-0645')], ['07:15', '07:25']),
      block(S, 'draft-blocks', weekday.id, 'y-2', 'Y2', ['06:10', '06:20'], [byId('p-wd-r1-out-0620'), byId('p-wd-r1-in-0745')], ['08:15', '08:25']),
      block(S, 'draft-blocks', weekday.id, 'y-3', 'Y3', ['06:30', '06:40'], [byId('p-wd-r1-out-0640'), byId('p-wd-r3-out-0720')], ['08:00', '08:10']),
    ],
    costing: [
      { routeId: 'p-r1', dayKind: 'weekday', revenueHours: 3.1 },
      { routeId: 'p-r3', dayKind: 'weekday', revenueHours: 0 },
      { routeId: null, dayKind: 'weekday', revenueHours: 1.5 },
      { routeId: 'p-r5', dayKind: 'weekday', revenueHours: 0.25 },
      { routeId: 'p-r1', dayKind: 'saturday', revenueHours: 0.6 },
    ],
  };
}

/** The worked example, both sides. */
export function workedExample(): { baseline: ExampleSide; proposed: ExampleSide } {
  return { baseline: baselineSide(), proposed: proposedSide() };
}
