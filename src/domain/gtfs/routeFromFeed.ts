// Translates one feed route, with every trip it runs on the chosen dates, into a Route: its directions, patterns, Nodes,
// Route stops, timepoint stop IDs and locations, the time of every trip at every pattern point, and the findings
// the planner should see. Pure: it reads the parsed feed and returns records; nothing is written here.

import { type DirectionGroup, createManagedDirections, directionGroupName, mapPatternPointsToDirection } from '../directions';
import { metadata, newId } from '../ids';
import type {
  EntityId,
  Node,
  PatternPoint,
  PatternStopPlacement,
  Route,
  RouteDirection,
  RoutePattern,
  RouteStop,
  RouteStopSet,
  TimepointLocations,
  TimepointStopCodes,
} from '../types';
import { commonShapeId, measurePattern, stopCoordinates } from './distancesFromFeed';
import { commonHeadsign, directionNames, splitDirections } from './directionsFromFeed';
import { GtfsFeedError, type Row } from './feedTables';
import {
  commonVariant,
  directionalPatternNames,
  draftPatterns,
  mergedVariantTrips,
  patternKeyOf,
  patternNameOf,
  type PatternDraft,
  type TripTimepoints,
  uniquePatternNames,
} from './patternsFromFeed';
import {
  flaggedStops,
  hasTimepointFlags,
  resolveTimepointTimes,
  suggestedStops,
  thinStops,
  timepointIdsOf,
  tripTimepointIndexes,
} from './timepointsFromFeed';
import type { FeedTrip } from './tripsOnDate';

/** One point of a shape in shapes.txt. */
export interface FeedShapePoint {
  latitude: number;
  longitude: number;
  sequence: number;
}

export interface RouteFromFeedInput {
  scenarioId: EntityId;
  /** The routes.txt row of the route. */
  routeRow: Row;
  /** Every trip of the route on every chosen date, already expanded from frequencies. */
  trips: FeedTrip[];
  /** stops.txt rows by stop_id. A stop missing from the map is named by its ID and has no location. */
  stops: ReadonlyMap<string, Row>;
  /** Shape points by shape_id. */
  shapes: ReadonlyMap<string, FeedShapePoint[]>;
  /** Pattern key before the override → the stop IDs the planner chose as its timepoints (Decision 0089 item 26). */
  timepointOverrides?: Record<string, string[]>;
  now: string;
}

/** The time of one trip at one pattern point. `filled` is true when the feed left the time blank and it was filled in. */
export interface TripPlacement {
  tripId: string;
  patternId: EntityId;
  points: Array<{ patternPointId: EntityId; departure: number; arrival: number; filled: boolean }>;
}

export type GtfsFindingCode =
  | 'mergedVariant'
  | 'thinnedTimepoints'
  | 'filledTime'
  | 'straightLineMiles'
  | 'stopWithoutLocation'
  | 'directionsGuessed'
  | 'dwellAtTimepoint'
  | 'badRouteField'
  | 'unmeasuredPattern';

/** Something the planner should see about the import of a route. `routeId` is the feed's route_id. */
export interface GtfsFinding {
  code: GtfsFindingCode;
  routeId: string;
  patternKey?: string;
  tripId?: string;
  stopId?: string;
  detail?: string;
}

export interface RouteFromFeed {
  route: Route;
  nodes: Node[];
  /** Outbound, then Inbound; both always present, the Inbound one may have no patterns. */
  directions: RouteDirection[];
  patterns: RoutePattern[];
  /** Absent when the route has no patterns. */
  stopSet?: RouteStopSet;
  placements: TripPlacement[];
  /** Pattern ID → the pattern key the pattern was built from, after any override. */
  patternKeys: Record<EntityId, string>;
  findings: GtfsFinding[];
}

const DIRECTIONS: DirectionGroup[] = ['outbound', 'inbound'];

export function routeFromFeed(input: RouteFromFeedInput): RouteFromFeed {
  const { scenarioId, trips, stops, shapes, now } = input;
  const overrides = input.timepointOverrides ?? {};
  const feedRouteId = input.routeRow.route_id;
  const findings: GtfsFinding[] = [];

  const route = routeFromRow(scenarioId, input.routeRow, now, findings);
  const stopName = (stopId: string): string => (stops.get(stopId)?.stop_name ?? '').trim() || stopId;
  const locationOf = (stopId: string) => stopCoordinates(stops.get(stopId));
  const isStopForRoute = (stopId: string): boolean => {
    const locationType = (stops.get(stopId)?.location_type ?? '').trim();
    return locationType === '' || locationType === '0';
  };

  // Directions: the split, the proposed names, and the two managed records (Decision 0089 items 24 and 25).
  const split = splitDirections(trips);
  if (split.noDirectionColumn && trips.length > 0) {
    findings.push({ code: 'directionsGuessed', routeId: feedRouteId, detail: 'noDirectionColumn' });
  }
  for (const tripId of split.guessedTripIds) {
    findings.push({ code: 'directionsGuessed', routeId: feedRouteId, tripId, detail: 'blankDirection' });
  }
  const names = directionNames(trips, split.groupOf);
  const managed = createManagedDirections(scenarioId, route.id, now);
  const directionOf: Record<DirectionGroup, RouteDirection> = {
    outbound: withName(managed, 'outbound', names.outbound),
    inbound: withName(managed, 'inbound', names.inbound),
  };

  // Timepoints and pattern keys, per direction. A stop flagged on any trip of a direction is a timepoint on every trip that serves it.
  // An override is keyed by the key from before the override, and its stops replace the set for the trips on that pattern.
  const hasFlags = hasTimepointFlags(trips);
  const drafts: PatternDraft[] = [];
  const indexesOfTrip = new Map<FeedTrip, number[]>();
  for (const group of DIRECTIONS) {
    const groupTrips = trips.filter((_, index) => split.groupOf[index] === group);
    if (groupTrips.length === 0) continue;
    const thinned = thinStops(hasFlags ? flaggedStops(groupTrips) : suggestedStops(groupTrips), groupTrips);
    if (thinned.dropped.length > 0) {
      findings.push({
        code: 'thinnedTimepoints',
        routeId: feedRouteId,
        detail: `${directionGroupName(group)}: dropped ${thinned.dropped.join(', ')}`,
      });
    }
    const assignments: TripTimepoints[] = groupTrips.map((trip) => {
      const indexes = tripTimepointIndexes(trip, thinned.stops);
      const override = overrides[patternKeyOf(group, timepointIdsOf(trip, indexes))];
      const finalIndexes = override === undefined ? indexes : tripTimepointIndexes(trip, new Set(override));
      indexesOfTrip.set(trip, finalIndexes);
      return { trip, group, timepointIds: timepointIdsOf(trip, finalIndexes) };
    });
    drafts.push(...draftPatterns(assignments));
  }

  // Measured distances and names are settled before Nodes, because a Node's kind depends on every pattern.
  const measured = drafts.map((draft) => {
    const variant = must(commonVariant(draft.trips), 'pattern without trips');
    for (const merged of mergedVariantTrips(draft.trips)) {
      findings.push({ code: 'mergedVariant', routeId: feedRouteId, patternKey: draft.key, tripId: merged.tripId });
    }
    const representative = variant.trips[0];
    const shapeId = commonShapeId(variant.trips);
    const result = measurePattern({
      stops: representative.stopTimes.map((stop) => locationOf(stop.stopId)),
      pointAt: must(indexesOfTrip.get(representative), 'trip without timepoints'),
      shape: shapeId === undefined ? undefined : shapes.get(shapeId),
    });
    if (result.method === 'straightLine') findings.push({ code: 'straightLineMiles', routeId: feedRouteId, patternKey: draft.key });
    if (result.method === 'unmeasured') findings.push({ code: 'unmeasuredPattern', routeId: feedRouteId, patternKey: draft.key });
    return result.cumulativeMiles;
  });
  // Rule C first (sub-plan I8, section 18), then the " 2", " 3" suffixes for any name that still clashes across the whole Route.
  const patternNames = uniquePatternNames(
    directionalPatternNames(
      drafts.map((draft) => {
        const lastName = stopName(lastOf(draft.timepointIds));
        return {
          group: draft.group,
          name: patternNameOf(draft.trips, stopName(draft.timepointIds[0]), lastName),
          headsign: commonHeadsign(draft.trips),
          lastName,
        };
      }),
    ),
  );

  // Nodes: one per distinct timepoint stop ID. A terminal is a first or last point of some pattern.
  const terminalStopIds = new Set<string>();
  for (const draft of drafts) {
    terminalStopIds.add(draft.timepointIds[0]);
    terminalStopIds.add(lastOf(draft.timepointIds));
  }
  const nodeOf = new Map<string, Node>();
  for (const draft of drafts) {
    for (const stopId of draft.timepointIds) {
      if (nodeOf.has(stopId)) continue;
      nodeOf.set(stopId, {
        id: newId(),
        scenarioId,
        routeId: route.id,
        name: stopName(stopId),
        kind: terminalStopIds.has(stopId) ? 'terminal' : 'timepoint',
        ...metadata(now),
      });
    }
  }

  // Patterns: points, direction columns (through the shared mapping), and the trip-to-pattern links.
  const patterns: RoutePattern[] = [];
  const patternKeys: Record<EntityId, string> = {};
  const patternOfTrip = new Map<FeedTrip, RoutePattern>();
  const sequenceOf: Record<DirectionGroup, number> = { outbound: 0, inbound: 0 };
  drafts.forEach((draft, index) => {
    const direction = directionOf[draft.group];
    const points: PatternPoint[] = draft.timepointIds.map((stopId, position) => ({
      id: newId(),
      nodeId: must(nodeOf.get(stopId), 'timepoint without a Node').id,
      sequence: position,
      cumulativeMiles: measured[index][position],
    }));
    const pattern: RoutePattern = {
      id: newId(),
      scenarioId,
      routeId: route.id,
      name: patternNames[index],
      directionId: direction.id,
      sequence: sequenceOf[draft.group],
      points,
      ...metadata(now),
    };
    sequenceOf[draft.group] += 1;
    const mapped = mapPatternPointsToDirection(pattern, direction, now);
    directionOf[draft.group] = mapped.direction;
    patterns.push(mapped.pattern);
    patternKeys[mapped.pattern.id] = draft.key;
    for (const trip of draft.trips) patternOfTrip.set(trip, mapped.pattern);
  });

  // Route stops: served stops with location type 0 or blank that are not a Node of the route. Placed on the segment after the
  // timepoint before them, in stop order, timed by interpolation. A stop is one record, however many patterns use it.
  const routeStopOf = new Map<string, RouteStop>();
  const placementsByPatternId: Record<EntityId, PatternStopPlacement[]> = {};
  drafts.forEach((draft, index) => {
    const pattern = patterns[index];
    const representative = must(commonVariant(draft.trips), 'pattern without trips').trips[0];
    const timepointPositions = must(indexesOfTrip.get(representative), 'trip without timepoints');
    const placements: PatternStopPlacement[] = [];
    let segment = 0;
    let sequenceInSegment = 0;
    representative.stopTimes.forEach((stop, position) => {
      const pointIndex = timepointPositions.indexOf(position);
      if (pointIndex >= 0) {
        segment = pointIndex;
        sequenceInSegment = 0;
        return;
      }
      if (nodeOf.has(stop.stopId) || !isStopForRoute(stop.stopId)) return;
      let routeStop = routeStopOf.get(stop.stopId);
      if (!routeStop) {
        const at = locationOf(stop.stopId);
        routeStop = {
          id: newId(),
          name: stopName(stop.stopId),
          stopCode: stop.stopId.trim(),
          ...(at ? { latitude: at.latitude, longitude: at.longitude } : {}),
        };
        routeStopOf.set(stop.stopId, routeStop);
      }
      placements.push({
        id: newId(),
        stopId: routeStop.id,
        afterPatternPointId: pattern.points[segment].id,
        sequence: sequenceInSegment,
        timing: 'interpolate',
      });
      sequenceInSegment += 1;
    });
    if (placements.length > 0) placementsByPatternId[pattern.id] = placements;
  });
  const routeStops = [...routeStopOf.values()];

  for (const stopId of nodeOf.keys()) {
    if (!locationOf(stopId)) findings.push({ code: 'stopWithoutLocation', routeId: feedRouteId, stopId });
  }
  for (const [stopId, routeStop] of routeStopOf) {
    if (routeStop.latitude === undefined) findings.push({ code: 'stopWithoutLocation', routeId: feedRouteId, stopId });
  }

  // Timepoint stop IDs and locations, per pattern point (Decisions 0080 and 0085).
  const timepointStopCodesByPatternId: Record<EntityId, TimepointStopCodes> = {};
  const timepointLocationsByPatternId: Record<EntityId, TimepointLocations> = {};
  drafts.forEach((draft, index) => {
    const pattern = patterns[index];
    const codes: TimepointStopCodes = {};
    const locations: TimepointLocations = {};
    pattern.points.forEach((point, position) => {
      const stopId = draft.timepointIds[position];
      codes[point.id] = stopId.trim();
      const at = locationOf(stopId);
      if (at) locations[point.id] = { latitude: at.latitude, longitude: at.longitude };
    });
    timepointStopCodesByPatternId[pattern.id] = codes;
    if (Object.keys(locations).length > 0) timepointLocationsByPatternId[pattern.id] = locations;
  });

  const stopSet: RouteStopSet | undefined = patterns.length === 0
    ? undefined
    : {
        id: newId(),
        scenarioId,
        routeId: route.id,
        roundingSeconds: 1,
        stops: routeStops,
        placementsByPatternId,
        timepointStopCodesByPatternId,
        timepointLocationsByPatternId,
        interpolation: 'distance',
        ...metadata(now),
      };

  // Trip times at every pattern point. Each trip keeps its own position in the feed's order. A trip that runs on two chosen
  // dates reaches this loop twice, so a filled time is reported once per trip and stop.
  const reportedFilledTimes = new Set<string>();
  const placements: TripPlacement[] = trips.map((trip) => {
    const pattern = must(patternOfTrip.get(trip), 'trip without a pattern');
    const indexes = must(indexesOfTrip.get(trip), 'trip without timepoints');
    const resolved = resolveTimepointTimes(trip, indexes, locationOf);
    const key = must(patternKeys[pattern.id], 'pattern without a key');
    resolved.forEach((time, position) => {
      const stop = trip.stopTimes[indexes[position]];
      if (time.filled !== undefined) {
        const reportKey = `${trip.tripId}\u0001${stop.stopId}`;
        if (!reportedFilledTimes.has(reportKey)) {
          reportedFilledTimes.add(reportKey);
          findings.push({ code: 'filledTime', routeId: feedRouteId, patternKey: key, tripId: trip.tripId, stopId: stop.stopId, detail: time.filled });
        }
      }
      if (stop.departure !== undefined && stop.arrival !== undefined && stop.departure !== stop.arrival) {
        findings.push({ code: 'dwellAtTimepoint', routeId: feedRouteId, patternKey: key, tripId: trip.tripId, stopId: stop.stopId });
      }
    });
    return {
      tripId: trip.tripId,
      patternId: pattern.id,
      points: pattern.points.map((point, position) => ({
        patternPointId: point.id,
        departure: resolved[position].departure,
        arrival: resolved[position].arrival,
        filled: resolved[position].filled !== undefined,
      })),
    };
  });

  return {
    route,
    nodes: [...nodeOf.values()],
    directions: DIRECTIONS.map((group) => directionOf[group]),
    patterns,
    stopSet,
    placements,
    patternKeys,
    findings,
  };
}

function routeFromRow(scenarioId: EntityId, row: Row, now: string, findings: GtfsFinding[]): Route {
  const feedRouteId = row.route_id;
  const longName = (row.route_long_name ?? '').trim();
  const shortName = (row.route_short_name ?? '').trim();
  const color = colorOf(row.route_color, feedRouteId, findings);
  const gtfsRouteType = routeTypeOf(row.route_type, feedRouteId, findings);
  return {
    id: newId(),
    scenarioId,
    // A route with neither name is identified by its feed ID rather than an empty name.
    name: longName || shortName || feedRouteId,
    ...(shortName ? { shortName } : {}),
    gtfsRouteId: feedRouteId,
    ...(gtfsRouteType === undefined ? {} : { gtfsRouteType }),
    ...(color === undefined ? {} : { color }),
    ...metadata(now),
  };
}

// Decision 0089 item 38. A leading "#" is removed and the six digits are stored in upper case. A blank value is absent rather than
// bad, following the feed reader's rule that blank optional fields are not errors; a value that is not usable is left unset and reported.
function colorOf(raw: string | undefined, routeId: string, findings: GtfsFinding[]): string | undefined {
  const text = (raw ?? '').trim();
  if (text === '') return undefined;
  const digits = text.startsWith('#') ? text.slice(1) : text;
  if (/^[0-9A-Fa-f]{6}$/.test(digits)) return digits.toUpperCase();
  findings.push({ code: 'badRouteField', routeId, detail: 'route_color' });
  return undefined;
}

function routeTypeOf(raw: string | undefined, routeId: string, findings: GtfsFinding[]): number | undefined {
  const text = (raw ?? '').trim();
  if (text === '') return undefined;
  if (/^\d+$/.test(text)) return Number(text);
  findings.push({ code: 'badRouteField', routeId, detail: 'route_type' });
  return undefined;
}

function withName(managed: RouteDirection[], group: DirectionGroup, name: string): RouteDirection {
  return { ...must(managed.find((direction) => direction.group === group), 'missing managed direction'), name };
}

function lastOf(values: readonly string[]): string {
  return values[values.length - 1];
}

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new GtfsFeedError(message);
  return value;
}
