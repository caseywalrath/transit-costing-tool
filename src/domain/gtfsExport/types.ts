// Plain shapes for the GTFS export's rules (Decision 0090). The export reads the Scenario through these shapes, so the rules do not
// depend on the stored entity types; the export service fills them from the stored records.

import type { EntityId } from '../types';

/** A GTFS stop as it is written to stops.txt. Coordinates are decimal degrees (WGS 84). */
export interface ExportStop {
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** Every refusal and warning of the export carries one of these codes (card E1, Decision 0090 item 19 and 20). */
export type GtfsExportStopIssueCode = 'gtfsExport.stopIdConflict' | 'gtfsExport.stopUnlocated' | 'gtfsExport.stopIdGenerated' | 'gtfsExport.stopNameDiffers';

/**
 * A refusal or warning about one stop record. `routeId` and `patternId` are the entity IDs (for navigation); the names are for display.
 * `stopId` is the stop ID the record takes, entered or generated.
 */
/** Where a stop record is: its Route, its pattern for a timepoint (none for a Route stop), and its name. */
export interface GtfsExportStopPlace {
  routeId: string;
  routeName: string;
  patternId?: string;
  patternName?: string;
  stopName: string;
}

export interface GtfsExportStopIssue {
  code: GtfsExportStopIssueCode;
  routeId: string;
  routeName: string;
  patternId?: string;
  patternName?: string;
  stopName: string;
  stopId: string;
  /** Only for `gtfsExport.stopIdConflict`: metres between this record and the first record of the same stop ID. */
  distanceMeters?: number;
  /** Only for `gtfsExport.stopIdConflict`: the first record of the same stop ID, which gives the stop its location. */
  conflictWith?: GtfsExportStopPlace;
}

/** A Route stop as it is stored. `stopCode` is blank when the Route stop has no stop ID. */
export interface ExportRouteStopInput {
  id: string;
  name: string;
  stopCode?: string;
  latitude?: number;
  longitude?: number;
}

/** A pattern point (a timepoint), with the stop ID and location the Route's stop set holds for this pattern (Decisions 0080, 0085). */
export interface ExportPatternPointInput {
  id: string;
  nodeId: string;
  sequence: number;
  stopCode?: string;
  /** Decision 0092. The stored timepoint stop name; blank or absent uses the Node name. */
  stopName?: string;
  latitude?: number;
  longitude?: number;
}

export interface ExportPatternInput {
  id: string;
  name: string;
  /** The direction group: `outbound` is direction_id 0, `inbound` is 1 (Decision 0090 item 10). */
  direction: 'outbound' | 'inbound';
  /** The Route stops this pattern places. A Route stop is exported only when one of the input patterns places it. */
  routeStopIds: string[];
  points: ExportPatternPointInput[];
}

export interface ExportRouteInput {
  id: string;
  name: string;
  /** The export `route_id` (Decision 0090 item 9), already made unique across the feed by the caller. */
  routeId: string;
  /** In stop-set order. */
  routeStops: ExportRouteStopInput[];
  /**
   * The exported patterns of the Route, in Route tab order. The first record of a stop ID gives its name and location
   * (Decision 0090 item 5).
   */
  patterns: ExportPatternInput[];
}

export interface ExportNodeInput {
  id: string;
  name: string;
  shortName?: string;
}

export interface ExportStopInput {
  /** The selected Routes, in export order. */
  routes: ExportRouteInput[];
  /** Every Node that a pattern point of these Routes refers to. */
  nodes: ExportNodeInput[];
}

export interface ExportStopsResult {
  /** One per stop ID, sorted by stop ID. Only accepted stops; when refusals exist the export is not written. */
  stops: ExportStop[];
  /** Route ID → Route stop ID → stop ID, for each Route stop that an exported pattern places. Includes refused ones. */
  byRouteStop: Map<string, Map<string, string>>;
  /** Pattern ID → pattern point ID → stop ID. Covers every timepoint of every selected pattern, including ones that are refused. */
  byTimepoint: Map<string, Map<string, string>>;
  refusals: GtfsExportStopIssue[];
  warnings: GtfsExportStopIssue[];
}

/**
 * Every refusal and warning of the feed builder (Decision 0090 items 19 and 20) carries one of these codes. The stop codes come from E1;
 * the rest are named here. A refusal stops the export; a warning is listed in the report.
 */
export type GtfsExportIssueCode =
  | GtfsExportStopIssueCode
  | 'gtfsExport.directionUnassigned'
  | 'gtfsExport.tripTimeMissing'
  | 'gtfsExport.rangeEmpty'
  | 'gtfsExport.agencyNameBlank'
  | 'gtfsExport.agencyUrlBlank'
  | 'gtfsExport.agencyUrlInvalid'
  | 'gtfsExport.agencyTimezoneBlank'
  | 'gtfsExport.routeSkipped'
  | 'gtfsExport.daySkipped'
  | 'gtfsExport.ownCountsNotExpressed'
  | 'gtfsExport.stopOutOfOrder'
  | 'gtfsExport.blockServesUnselectedRoute';

/**
 * A refusal or warning of the feed builder. Each field names what the issue concerns; a field that does not apply is left out. The
 * stop issues of E1 (`GtfsExportStopIssue`) are assignable to this type.
 */
export interface GtfsExportIssue {
  code: GtfsExportIssueCode;
  routeId?: EntityId;
  routeName?: string;
  patternId?: EntityId;
  patternName?: string;
  tripId?: EntityId;
  stopId?: string;
  stopName?: string;
  serviceDayId?: EntityId;
  serviceDayName?: string;
  blockLabel?: string;
  /** Only for `gtfsExport.stopIdConflict`: metres between this record and the first record of the same stop ID. */
  distanceMeters?: number;
  /** Only for `gtfsExport.stopIdConflict`: the first record of the same stop ID, which gives the stop its location. */
  conflictWith?: GtfsExportStopPlace;
  /** Only for `gtfsExport.stopOutOfOrder` (Decision 0093 rule A): the row this stop falls behind along its segment, and by how far. */
  behind?: { stopName: string; meters: number };
}

/** One file of the feed as text: LF line endings, no byte order mark (Decision 0090 item 4). */
export interface GtfsExportFile {
  name: string;
  text: string;
}

/**
 * One row of the report CSV (Decision 0090 item 21, and the plan's report: directions and map lines stated). A `serviceDay` row counts the
 * trips of one Route on one service day; `pattern` gives a pattern's direction_id and shape_id; `note` states a rule or an id that was made
 * unique.
 */
export type ExportReportRow =
  | {
      kind: 'serviceDay';
      routeId: string;
      routeName: string;
      serviceId: string;
      serviceDayName: string;
      trips: number;
      runningHours: number;
      /** Dates of the export range on which the service day runs in the feed (calendar and calendar_dates together). */
      datesInRange: number;
      /** The Scenario's annual count for the service day, as this tool counts it (not used by the feed). */
      scenarioAnnualServiceDays: number;
    }
  | { kind: 'pattern'; routeId: string; routeName: string; patternName: string; directionId: 0 | 1; shapeId?: string }
  | { kind: 'note'; text: string };

/** The feed builder's output. `files` is empty and `report` is empty when any refusal stands: nothing is written (Decision 0090 item 19). */
export interface GtfsExportResult {
  files: GtfsExportFile[];
  report: ExportReportRow[];
  refusals: GtfsExportIssue[];
  warnings: GtfsExportIssue[];
  /** Route entity ID → export route_id, for each exported Route. A skipped or unselected Route has none. */
  exportRouteIds: ReadonlyMap<EntityId, string>;
}
