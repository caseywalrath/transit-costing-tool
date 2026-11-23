import { neutralizeFormulaText } from '../csvFormula';
import { csvField, csvTable, type CsvCell } from '../gtfsExport/csvText';
import type { Comparison, ComparisonRow, ComparisonTotals, Measure, RouteStatus } from './types';

/** Decision 0091 item 18. The heading block: the two sides, the day, the rates and counts used, and the preparation date. */
export interface ComparisonCsvHeading {
  baselineName: string;
  proposedName: string;
  day: string;
  rates: string;
  counts: string;
  preparedOn: string;
}

const STATUS_LABEL: Record<RouteStatus, string> = { changed: 'Changed', unchanged: 'Unchanged', new: 'New', discontinued: 'Discontinued' };

/** The measures in the order item 18 gives them, each as `_base`, `_proposed` and `_change` columns. */
const MEASURE_COLUMN_NAMES = ['trips', 'revenue_miles', 'revenue_hours', 'platform_hours', 'peak_vehicles', 'cost'] as const;
const COLUMNS: string[] = ['route_id', 'route', 'status', ...MEASURE_COLUMN_NAMES.flatMap((name) => [`${name}_base`, `${name}_proposed`, `${name}_change`]), 'revenue_hours_pct', 'cost_pct'];

/** Negative zero is written as 0. */
const plain = (value: number): number => (Object.is(value, -0) ? 0 : value);

/** A whole number (trips, vehicles) or whole dollars (cost). */
const whole = (value: number | undefined): CsvCell => (value === undefined ? undefined : plain(Math.round(value)));

/** Miles and hours to two decimals, as the file carries them (the screen shows one). */
function twoDecimals(value: number | undefined): CsvCell {
  if (value === undefined) return undefined;
  return plain(Math.round(value * 100) / 100).toFixed(2);
}

/** A percentage to one decimal, as Decision 0091 item 14 gives it. */
function oneDecimal(value: number | undefined): CsvCell {
  if (value === undefined) return undefined;
  return plain(Math.round(value * 10) / 10).toFixed(1);
}

const FORMAT: Record<(typeof MEASURE_COLUMN_NAMES)[number], (value: number | undefined) => CsvCell> = {
  trips: whole,
  revenue_miles: twoDecimals,
  revenue_hours: twoDecimals,
  platform_hours: twoDecimals,
  peak_vehicles: whole,
  cost: whole,
};

function measureCells(name: (typeof MEASURE_COLUMN_NAMES)[number], measure: Measure): Record<string, CsvCell> {
  const format = FORMAT[name];
  return { [`${name}_base`]: format(measure.baseline), [`${name}_proposed`]: format(measure.proposed), [`${name}_change`]: format(measure.change) };
}

function totalsRecord(totals: ComparisonTotals): Record<string, CsvCell> {
  return {
    ...measureCells('trips', totals.trips),
    ...measureCells('revenue_miles', totals.revenueMiles),
    ...measureCells('revenue_hours', totals.revenueHours),
    ...measureCells('platform_hours', totals.platformHours),
    ...measureCells('peak_vehicles', totals.peakVehicles),
    ...measureCells('cost', totals.cost),
    revenue_hours_pct: oneDecimal(totals.revenueHours.percent),
    cost_pct: oneDecimal(totals.cost.percent),
  };
}

function rowRecord(row: ComparisonRow): Record<string, CsvCell> {
  return {
    // The Route ID and name are free text from the feed and are protected; numbers are not (Decision 0091 item 18).
    route_id: neutralizeFormulaText(row.routeCode),
    route: neutralizeFormulaText(row.name),
    status: STATUS_LABEL[row.status],
    ...measureCells('trips', row.trips),
    ...measureCells('revenue_miles', row.revenueMiles),
    ...measureCells('revenue_hours', row.revenueHours),
    ...measureCells('platform_hours', row.platformHours),
    ...measureCells('peak_vehicles', row.peakVehicles),
    ...measureCells('cost', row.cost),
    revenue_hours_pct: oneDecimal(row.revenueHours.percent),
    cost_pct: oneDecimal(row.cost.percent),
  };
}

/**
 * Decision 0091 item 18. The comparison as CSV text: UTF-8 with LF line endings (the caller encodes it). A heading block of label and value
 * lines, then a blank line, then one row per Route in the order of the comparison (Unchanged and Unattributed included; never folded), then
 * a system totals row. Free-text cells (the Scenario names, the day, each Route name) are protected against spreadsheet formulas; numbers
 * are not, so a negative change stays a number.
 */
export function comparisonCsvText(comparison: Comparison, heading: ComparisonCsvHeading): string {
  const headingLines = [
    ['Baseline', heading.baselineName],
    ['Proposed', heading.proposedName],
    ['Day', heading.day],
    ['Rates', heading.rates],
    ['Counts', heading.counts],
    ['Prepared', heading.preparedOn],
  ].map(([label, value]) => `${label},${csvField(neutralizeFormulaText(value))}\n`).join('');
  const records: Array<Record<string, CsvCell>> = [
    ...comparison.rows.map(rowRecord),
    { route_id: '', route: 'System total', status: '', ...totalsRecord(comparison.totals) },
  ];
  return `${headingLines}\n${csvTable(COLUMNS, records)}`;
}

/** Decision 0091 item 18. The file name `<baseline>-vs-<proposed>-<day>.csv`: lower case, letters and digits, parts joined by dashes. */
export function comparisonFileName(baselineName: string, proposedName: string, dayName: string): string {
  return `${fileNamePart(baselineName)}-vs-${fileNamePart(proposedName)}-${fileNamePart(dayName)}.csv`;
}

function fileNamePart(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}
