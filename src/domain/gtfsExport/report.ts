// Decision 0090 item 21 and the plan's report (Part 3, item 7): the report CSV that is downloaded beside the feed's ZIP. Pure.
// Free text (names and details) is protected against spreadsheet formulas, as in every other export (Decision 0084, item 12). The feed's
// own files are not: the importer reads them back, and a changed name would not round-trip (Decision 0090, item 4).

import { describeIssue } from './checks';
import { csvTable, type CsvCell } from './csvText';
import type { ExportReportRow, GtfsExportIssue } from './types';

const REPORT_COLUMNS = [
  'kind', 'route_id', 'route_name', 'service_id', 'service_day', 'trips', 'running_hours', 'dates_in_range', 'scenario_annual_days',
  'direction_id', 'shape_id', 'code', 'detail',
];

/** Decision 0084 item 12, as in `src/persistence/csv.ts`: a text that starts with a formula character gets an apostrophe in front. */
function protectFormula(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return /^'*[=+\-@]/.test(text) ? `'${text}` : text;
}

function reportRecord(row: ExportReportRow): Record<string, CsvCell> {
  switch (row.kind) {
    case 'serviceDay':
      return {
        kind: 'service_day',
        route_id: row.routeId,
        route_name: protectFormula(row.routeName),
        service_id: row.serviceId,
        service_day: protectFormula(row.serviceDayName),
        trips: row.trips,
        running_hours: row.runningHours.toFixed(2),
        dates_in_range: row.datesInRange,
        scenario_annual_days: row.scenarioAnnualServiceDays,
      };
    case 'pattern':
      return {
        kind: 'pattern',
        route_id: row.routeId,
        route_name: protectFormula(row.routeName),
        direction_id: row.directionId,
        shape_id: row.shapeId,
        detail: protectFormula(row.patternName),
      };
    case 'note':
      return { kind: 'note', detail: row.text };
  }
}

/**
 * The report CSV: the rows of the report, then every warning (Decision 0090 item 21). The header row names the columns; a row fills only
 * the columns its kind has. Written only when the export is written (there is no report while a refusal stands).
 */
export function reportCsvText(rows: readonly ExportReportRow[], warnings: readonly GtfsExportIssue[]): string {
  const records: Array<Record<string, CsvCell>> = [
    ...rows.map(reportRecord),
    ...warnings.map((warning) => ({
      kind: 'warning',
      route_id: warning.routeId,
      route_name: protectFormula(warning.routeName),
      code: warning.code,
      detail: protectFormula(describeIssue(warning)),
    })),
  ];
  return csvTable(REPORT_COLUMNS, records);
}
