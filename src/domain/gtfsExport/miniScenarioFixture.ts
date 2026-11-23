// The Scenario of tests/fixtures/gtfs-export/README.md, built in code for the feed builder's tests (Decision 0090). Test support only:
// nothing in the application imports this file. `miniInput()` returns a fresh copy on every call, so a test may change it.

import type {
  BlockingBlock,
  GtfsExportSettings,
  Node,
  Route,
  RouteDefinitionAggregate,
  RouteDirection,
  RoutePattern,
  RouteStopSet,
  ServiceDayDefinition,
  Trip,
} from '../types';
import type { BuildGtfsExportInput } from './feed';

const SCENARIO_ID = 'scenario-mini';
const ROUTE_ID = 'route-t1';
const META = { createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z' } as const;

/** The export inputs of the README: agency, range, holiday, map lines and export date. */
export const MINI_SETTINGS: GtfsExportSettings = {
  startDate: '2027-01-04',
  endDate: '2027-01-31',
  holidays: [{ date: '2027-01-18', serviceDayId: 'day-hol' }],
  agencyName: 'Test Transit',
  agencyUrl: 'https://example.org',
  agencyTimezone: 'America/Denver',
  mapLines: 'straight',
};

/** Clock times in seconds after midnight, for the trips below. */
export const at = (hours: number, minutes: number): number => hours * 3600 + minutes * 60;

const route: Route = { id: ROUTE_ID, scenarioId: SCENARIO_ID, name: 'Test Line', shortName: 'T1', ...META };

const nodes: Node[] = [
  { id: 'node-alpha', scenarioId: SCENARIO_ID, routeId: ROUTE_ID, name: 'Alpha', kind: 'terminal', ...META },
  { id: 'node-bravo', scenarioId: SCENARIO_ID, routeId: ROUTE_ID, name: 'Bravo', kind: 'timepoint', ...META },
  { id: 'node-charlie', scenarioId: SCENARIO_ID, routeId: ROUTE_ID, name: 'Charlie', kind: 'terminal', ...META },
];

const directions: RouteDirection[] = [
  { id: 'direction-out', scenarioId: SCENARIO_ID, routeId: ROUTE_ID, name: 'To Charlie', group: 'outbound', sequence: 0, columns: [], ...META },
  { id: 'direction-in', scenarioId: SCENARIO_ID, routeId: ROUTE_ID, name: 'To Alpha', group: 'inbound', sequence: 1, columns: [], ...META },
];

const patterns: RoutePattern[] = [
  {
    id: 'pattern-ac',
    scenarioId: SCENARIO_ID,
    routeId: ROUTE_ID,
    name: 'Alpha to Charlie',
    directionId: 'direction-out',
    directionLabel: 'A-C',
    sequence: 1,
    points: [
      { id: 'pp-ac-alpha', nodeId: 'node-alpha', sequence: 1, cumulativeMiles: 0 },
      { id: 'pp-ac-bravo', nodeId: 'node-bravo', sequence: 2, cumulativeMiles: 2 },
      { id: 'pp-ac-charlie', nodeId: 'node-charlie', sequence: 3, cumulativeMiles: 5 },
    ],
    ...META,
  },
  {
    id: 'pattern-ca',
    scenarioId: SCENARIO_ID,
    routeId: ROUTE_ID,
    name: 'Charlie to Alpha',
    directionId: 'direction-in',
    directionLabel: 'C-A',
    sequence: 2,
    points: [
      { id: 'pp-ca-charlie', nodeId: 'node-charlie', sequence: 1, cumulativeMiles: 0 },
      { id: 'pp-ca-bravo', nodeId: 'node-bravo', sequence: 2, cumulativeMiles: 3 },
      { id: 'pp-ca-alpha', nodeId: 'node-alpha', sequence: 3, cumulativeMiles: 5 },
    ],
    ...META,
  },
];

const stopSet: RouteStopSet = {
  id: 'stop-set-t1',
  scenarioId: SCENARIO_ID,
  routeId: ROUTE_ID,
  roundingSeconds: 60,
  // "Main & 1st" has no stop ID, so it is generated as T1-1 (Decision 0090 item 6).
  stops: [{ id: 'rs-main', name: 'Main & 1st', latitude: 39.709, longitude: -105 }],
  placementsByPatternId: {
    'pattern-ac': [{ id: 'placement-main', stopId: 'rs-main', afterPatternPointId: 'pp-ac-alpha', sequence: 1, timing: 'interpolate' }],
  },
  timepointStopCodesByPatternId: {
    'pattern-ac': { 'pp-ac-alpha': '1001', 'pp-ac-bravo': '1002', 'pp-ac-charlie': '1003' },
    'pattern-ca': { 'pp-ca-charlie': '1003', 'pp-ca-bravo': '2002', 'pp-ca-alpha': '1001' },
  },
  timepointLocationsByPatternId: {
    'pattern-ac': {
      'pp-ac-alpha': { latitude: 39.7, longitude: -105 },
      'pp-ac-bravo': { latitude: 39.718, longitude: -105 },
      'pp-ac-charlie': { latitude: 39.745, longitude: -105 },
    },
    'pattern-ca': {
      'pp-ca-charlie': { latitude: 39.745, longitude: -105 },
      'pp-ca-bravo': { latitude: 39.7181, longitude: -105.0001 },
      'pp-ca-alpha': { latitude: 39.7, longitude: -105 },
    },
  },
  ...META,
};

const serviceDays: ServiceDayDefinition[] = [
  { id: 'day-wkd', scenarioId: SCENARIO_ID, kind: 'weekday', name: 'Weekday', annualServiceDays: 260, sequence: 0, abbreviation: 'WKD', ...META },
  { id: 'day-sat', scenarioId: SCENARIO_ID, kind: 'saturday', name: 'Saturday', annualServiceDays: 52, sequence: 1, abbreviation: 'SAT', ...META },
  { id: 'day-hol', scenarioId: SCENARIO_ID, kind: 'holiday', name: 'Holiday', annualServiceDays: 9, sequence: 3, abbreviation: 'HOL', ...META },
];

/** A Trip with timepoint times (Decision 0080 points), no dwell: the model stores none. */
function tripOf(id: string, patternId: string, serviceDayId: string, times: Array<[string, number]>): Trip {
  return {
    id,
    scenarioId: SCENARIO_ID,
    routeId: ROUTE_ID,
    serviceDayId,
    patternId,
    tripProfileId: 'profile-base',
    stopTimes: times.map(([patternPointId, time], index) => ({ patternPointId, sequence: index + 1, time })),
    provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] },
    ...META,
  };
}

const trips: Trip[] = [
  tripOf('trip-wkd-0600', 'pattern-ac', 'day-wkd', [['pp-ac-alpha', at(6, 0)], ['pp-ac-bravo', at(6, 10)], ['pp-ac-charlie', at(6, 25)]]),
  tripOf('trip-wkd-0630', 'pattern-ac', 'day-wkd', [['pp-ac-alpha', at(6, 30)], ['pp-ac-bravo', at(6, 40)], ['pp-ac-charlie', at(6, 55)]]),
  tripOf('trip-wkd-inbound-0700', 'pattern-ca', 'day-wkd', [['pp-ca-charlie', at(7, 0)], ['pp-ca-bravo', at(7, 12)], ['pp-ca-alpha', at(7, 25)]]),
  tripOf('trip-sat-0800', 'pattern-ac', 'day-sat', [['pp-ac-alpha', at(8, 0)], ['pp-ac-bravo', at(8, 10)], ['pp-ac-charlie', at(8, 25)]]),
  tripOf('trip-hol-0900', 'pattern-ac', 'day-hol', [['pp-ac-alpha', at(9, 0)], ['pp-ac-bravo', at(9, 10)], ['pp-ac-charlie', at(9, 25)]]),
];

/** Block 1 of the README: the weekday 06:00 Outbound, then the 07:00 Inbound. The 06:30 Trip is unblocked. */
const block1: BlockingBlock = {
  id: 'block-1',
  scenarioId: SCENARIO_ID,
  blockingScenarioId: 'blocking-base',
  serviceDayId: 'day-wkd',
  label: '1',
  activities: [
    { id: 'activity-1', type: 'revenueTrip', sequence: 1, tripId: 'trip-wkd-0600' },
    { id: 'activity-2', type: 'revenueTrip', sequence: 2, tripId: 'trip-wkd-inbound-0700' },
  ],
  ...META,
};

/** The README Scenario, as the feed builder's input: one Route, the Base Trip profile, the Base blocks, the export date 2027-01-01. */
export function miniInput(): BuildGtfsExportInput {
  const aggregate: RouteDefinitionAggregate = {
    route: { ...route },
    nodes: nodes.map((node) => ({ ...node })),
    patterns: patterns.map((pattern) => ({ ...pattern, points: pattern.points.map((point) => ({ ...point })) })),
    directions: directions.map((direction) => ({ ...direction })),
  };
  return {
    routes: [aggregate],
    routeStopSets: [structuredClone(stopSet)],
    trips: trips.map((trip) => structuredClone(trip)),
    tripProfileId: 'profile-base',
    serviceDays: serviceDays.map((day) => ({ ...day })),
    blocks: [structuredClone(block1)],
    settings: structuredClone(MINI_SETTINGS),
    exportDate: '2027-01-01',
  };
}
