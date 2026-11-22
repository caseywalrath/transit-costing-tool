import { greatCircleMiles } from '../geo';
import { hasCoordinates } from '../stops';
import type {
  ExportNodeInput,
  ExportStop,
  ExportStopInput,
  ExportStopsResult,
  GtfsExportStopIssue,
  GtfsExportStopIssueCode,
} from './types';

/** Decision 0090 item 5. Records with the same stop ID within this distance (great-circle) are one stop. */
export const STOP_MERGE_METERS = 30;

const METERS_PER_MILE = 1609.344;

interface Location {
  latitude: number;
  longitude: number;
}

/** A stop record before merging: a Route stop or a timepoint. A record without a location is refused and never merged. */
interface StopRecord {
  kind: 'routeStop' | 'timepoint';
  /** The Route's entity ID, which a refusal or warning names. */
  routeId: string;
  routeName: string;
  patternId?: string;
  patternName?: string;
  stopName: string;
  stopId: string;
  /** True when the stop ID was generated (Decision 0090 item 6) rather than entered. */
  generated: boolean;
  /** Set only on a generated timepoint ID: the Node and direction it names. Records with equal keys may share that ID. */
  generatedMergeKey?: string;
  location?: Location;
}

interface LocatedRecord extends StopRecord {
  location: Location;
}

/**
 * Decision 0090 items 5 to 8. Builds the GTFS stops of the selected Routes and maps each exported Route stop and timepoint to its stop ID.
 *
 * `patterns` of each Route are the exported patterns. A Route stop is exported only when one of them places it.
 *
 * Records are read in this order: each Route in input order, its exported Route stops in stop-set order, then its patterns in input
 * order, each pattern's points by sequence. The first record of a stop ID gives the stop's name and location.
 *
 * The maps have an entry for every record, refused ones included. `stops` and the maps may be written to a file only when `refusals`
 * is empty.
 */
export function exportStops(input: ExportStopInput): ExportStopsResult {
  const nodes = new Map<string, ExportNodeInput>(input.nodes.map((node) => [node.id, node]));
  const refusals: GtfsExportStopIssue[] = [];
  const warnings: GtfsExportStopIssue[] = [];
  const records: StopRecord[] = [];
  const byRouteStop = new Map<string, Map<string, string>>();
  const byTimepoint = new Map<string, Map<string, string>>();

  const addRecord = (record: StopRecord): void => {
    records.push(record);
    if (record.generated) warnings.push(issueOf('gtfsExport.stopIdGenerated', record));
    if (record.location === undefined) refusals.push(issueOf('gtfsExport.stopUnlocated', record));
  };

  for (const route of input.routes) {
    const placed = new Set(route.patterns.flatMap((pattern) => pattern.routeStopIds));
    const routeStopIds = new Map<string, string>();
    byRouteStop.set(route.id, routeStopIds);
    let unnamedCount = 0;
    for (const routeStop of route.routeStops) {
      let stopId = blankToUndefined(routeStop.stopCode);
      const generated = stopId === undefined;
      if (stopId === undefined) {
        // Decision 0090 item 6: counted among the Route's stops without an ID, in Route stop order, from 1. Stops that no exported
        // pattern places are counted too, so an ID does not change when a placement changes.
        unnamedCount += 1;
        stopId = `${route.routeId}-${unnamedCount}`;
      }
      if (!placed.has(routeStop.id)) continue;
      routeStopIds.set(routeStop.id, stopId);
      addRecord({
        kind: 'routeStop',
        routeId: route.id,
        routeName: route.name,
        stopName: routeStop.name.trim(),
        stopId,
        generated,
        location: hasCoordinates(routeStop) ? { latitude: routeStop.latitude, longitude: routeStop.longitude } : undefined,
      });
    }

    for (const pattern of route.patterns) {
      const timepointIds = new Map<string, string>();
      byTimepoint.set(pattern.id, timepointIds);
      // Decision 0090 item 10: direction_id 0 for Outbound, 1 for Inbound.
      const directionDigit = pattern.direction === 'outbound' ? 0 : 1;
      for (const point of [...pattern.points].sort((a, b) => a.sequence - b.sequence)) {
        const node = nodes.get(point.nodeId);
        if (node === undefined) {
          throw new Error(`gtfsExport: pattern point ${point.id} refers to Node ${point.nodeId}, which is not in the export input.`);
        }
        const name = node.name.trim();
        const enteredCode = blankToUndefined(point.stopCode);
        // Decision 0090 item 6: a timepoint without an ID is named after its Node's short name, or its name, and its direction.
        const stopId = enteredCode ?? `${route.routeId}-${node.shortName?.trim() || name}-${directionDigit}`;
        timepointIds.set(point.id, stopId);
        addRecord({
          kind: 'timepoint',
          routeId: route.id,
          routeName: route.name,
          patternId: pattern.id,
          patternName: pattern.name,
          // Decision 0090 item 8: a timepoint's stop name is its Node's name.
          stopName: name,
          stopId,
          generated: enteredCode === undefined,
          generatedMergeKey: enteredCode === undefined ? `${node.id}|${directionDigit}` : undefined,
          location: hasCoordinates(point) ? { latitude: point.latitude, longitude: point.longitude } : undefined,
        });
      }
    }
  }

  // Decision 0090 item 7: a record without a location refuses the export (already listed by addRecord). It is not a stop.
  const groups = new Map<string, LocatedRecord[]>();
  for (const record of records.filter(isLocated)) {
    const group = groups.get(record.stopId);
    if (group) group.push(record);
    else groups.set(record.stopId, [record]);
  }

  const stops: ExportStop[] = [];
  for (const [stopId, group] of groups) {
    const first = group[0];
    stops.push({ stopId, name: first.stopName, latitude: first.location.latitude, longitude: first.location.longitude });
    // Each later record is compared with the stop's first record. Merged records keep the first record's name and location.
    for (const other of group.slice(1)) {
      const distanceMeters = greatCircleMiles(first.location, other.location) * METERS_PER_MILE;
      if (mayMerge(first, other) && distanceMeters <= STOP_MERGE_METERS) continue;
      refusals.push({ ...issueOf('gtfsExport.stopIdConflict', other), distanceMeters });
    }
  }
  stops.sort((left, right) => compareStopIds(left.stopId, right.stopId));

  return { stops, byRouteStop, byTimepoint, refusals, warnings };
}

function isLocated(record: StopRecord): record is LocatedRecord {
  return record.location !== undefined;
}

/**
 * Decision 0090 items 5 and 6, as amended. Entered IDs may merge (the distance is checked by the caller). A generated timepoint ID may
 * merge only with a record of the same Node and direction. A generated Route stop ID never merges, and a generated ID never merges
 * with a record of another kind or another Node.
 */
function mayMerge(first: StopRecord, other: StopRecord): boolean {
  if (!first.generated && !other.generated) return true;
  return first.generatedMergeKey !== undefined && first.generatedMergeKey === other.generatedMergeKey;
}

function issueOf(code: GtfsExportStopIssueCode, record: StopRecord): GtfsExportStopIssue {
  return {
    code,
    routeId: record.routeId,
    routeName: record.routeName,
    ...(record.patternId === undefined ? {} : { patternId: record.patternId, patternName: record.patternName }),
    stopName: record.stopName,
    stopId: record.stopId,
  };
}

/** A stop ID as entered, trimmed. A blank entry is no ID (the same rule as the Route stop set, `validateRouteStopSet`). */
function blankToUndefined(text: string | undefined): string | undefined {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}

/** Code-unit order, as the feed's rows are sorted by stop_id (Decision 0090 item 12). */
function compareStopIds(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}
