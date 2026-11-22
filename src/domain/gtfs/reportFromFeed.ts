// The import report: what was imported, what was left out and why, the fidelity figures, and the size warning (Decision 0089 items
// 36, 37 and 44). Pure. The CSV holds one row per finding; the route summaries and fidelity figures are for the screen.

export type ImportReportSection = 'route' | 'skipped' | 'trip' | 'block' | 'file' | 'fidelity';

/** One finding. A column that does not apply is an empty string. */
export interface ImportReportRow {
  section: ImportReportSection;
  routeId: string;
  serviceDay: string;
  tripId: string;
  stopId: string;
  code: string;
  detail: string;
}

export interface RouteSummary {
  /** The feed's route_id. */
  routeId: string;
  name: string;
  patterns: number;
  /** Distinct timepoint stop IDs, which are the Route's Nodes. */
  timepoints: number;
  /** Route stops, not counting timepoints. */
  stops: number;
  /** Trips imported on each service day, by the service day's name. */
  tripsByServiceDay: Record<string, number>;
  blocks: number;
}

/** Decision 0089 item 37: a route's trips and running seconds from the feed on the date, and as imported. */
export interface FidelityRow {
  routeId: string;
  serviceDay: string;
  feedTrips: number;
  importedTrips: number;
  feedRunningSeconds: number;
  importedRunningSeconds: number;
}

export interface ImportReport {
  routes: RouteSummary[];
  fidelity: FidelityRow[];
  rows: ImportReportRow[];
  /** True only when every fidelity row is equal and no trip is listed as different. */
  fidelityOk: boolean;
  sizeWarning: boolean;
}

/** Decision 0089 item 44: above this many Routes, or this many trips on one service day, the screen warns that the import may be slow. */
export const SIZE_WARNING_ROUTE_COUNT = 40;
export const SIZE_WARNING_TRIPS_PER_DAY = 5000;

export function exceedsSizeWarning(routeCount: number, busiestDayTrips: number): boolean {
  return routeCount > SIZE_WARNING_ROUTE_COUNT || busiestDayTrips > SIZE_WARNING_TRIPS_PER_DAY;
}

const CSV_HEADER = ['section', 'routeId', 'serviceDay', 'tripId', 'stopId', 'code', 'detail'] as const;

/** The findings as CSV: a header row, then one row per finding, CRLF line ends, quoted where a value needs it. */
export function importReportCsv(report: ImportReport): string {
  const lines: string[][] = [[...CSV_HEADER], ...report.rows.map((row) => [row.section, row.routeId, row.serviceDay, row.tripId, row.stopId, row.code, row.detail])];
  return lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
