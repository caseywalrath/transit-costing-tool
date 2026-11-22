// Plain shapes for the GTFS export's rules (Decision 0090). The export reads the Scenario through these shapes, so the rules do not
// depend on the stored entity types; the export service fills them from the stored records.

/** A GTFS stop as it is written to stops.txt. Coordinates are decimal degrees (WGS 84). */
export interface ExportStop {
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** Every refusal and warning of the export carries one of these codes (card E1, Decision 0090 item 19 and 20). */
export type GtfsExportStopIssueCode = 'gtfsExport.stopIdConflict' | 'gtfsExport.stopUnlocated' | 'gtfsExport.stopIdGenerated';

/**
 * A refusal or warning about one stop record. `routeId` and `patternId` are the entity IDs (for navigation); the names are for display.
 * `stopId` is the stop ID the record takes, entered or generated.
 */
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
