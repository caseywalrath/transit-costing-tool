import { describe, expect, it } from 'vitest';
import { neutralizeFormulaText, restoreFormulaText } from '../csvFormula';
import { buildComparison } from './buildComparison';
import { prepareComparison, workedExample } from './compareFixture';
import { comparisonCsvText, comparisonFileName, type ComparisonCsvHeading } from './comparisonCsv';
import type { Comparison } from './types';

const example = workedExample();
const comparison: Comparison = buildComparison({ ...prepareComparison(example.baseline, example.proposed, 'baseline'), day: 'weekday' });
const heading: ComparisonCsvHeading = {
  baselineName: 'Existing',
  proposedName: 'Redesign',
  day: 'Weekday',
  rates: '$100 per revenue hour, first service year 2027',
  counts: "Baseline's",
  preparedOn: '2026-11-22',
};

const lines = (text: string) => text.split('\n');
const headerOf = (text: string) => lines(text)[7].split(',');
/** The cells of the row whose `route_id` and `route` cells match, by column name. */
function rowCells(text: string, routeCell: string): Record<string, string> {
  const header = headerOf(text);
  const found = lines(text).slice(8).map((line) => line.split(',')).find((cells) => cells[1] === routeCell);
  if (!found) throw new Error(`no row ${routeCell}`);
  return Object.fromEntries(header.map((column, index) => [column, found[index] ?? '']));
}

describe('comparisonCsvText (Decision 0091 item 18)', () => {
  const text = comparisonCsvText(comparison, heading);

  it('starts with the heading block, then a blank line', () => {
    expect(lines(text).slice(0, 7)).toEqual([
      'Baseline,Existing',
      'Proposed,Redesign',
      'Day,Weekday',
      'Rates,"$100 per revenue hour, first service year 2027"',
      "Counts,Baseline's",
      'Prepared,2026-11-22',
      '',
    ]);
  });

  it('has the item 18 columns in order, then one row per Route and Unattributed, then the system totals row', () => {
    expect(headerOf(text)).toEqual([
      'route_id', 'route', 'status',
      'trips_base', 'trips_proposed', 'trips_change',
      'revenue_miles_base', 'revenue_miles_proposed', 'revenue_miles_change',
      'revenue_hours_base', 'revenue_hours_proposed', 'revenue_hours_change',
      'platform_hours_base', 'platform_hours_proposed', 'platform_hours_change',
      'peak_vehicles_base', 'peak_vehicles_proposed', 'peak_vehicles_change',
      'cost_base', 'cost_proposed', 'cost_change',
      'revenue_hours_pct', 'cost_pct',
    ]);
    const routeColumn = lines(text).slice(8).filter((line) => line.length > 0).map((line) => line.split(',')[1]);
    expect(routeColumn).toEqual(['1 Main St', '2 Crosstown', '3 Airport', '5 Loop', 'Unattributed (multi-route blocks)', 'System total']);
  });

  it('writes the Route 1 row with miles and hours to two decimals and cost in whole dollars', () => {
    expect(rowCells(text, '1 Main St')).toMatchObject({
      route_id: '1',
      status: 'Changed',
      trips_base: '7',
      trips_proposed: '8',
      trips_change: '1',
      revenue_miles_base: '42.00',
      revenue_miles_proposed: '57.00',
      revenue_miles_change: '15.00',
      revenue_hours_base: '3.50',
      revenue_hours_proposed: '3.10',
      revenue_hours_change: '-0.40',
      peak_vehicles_base: '2',
      peak_vehicles_proposed: '2',
      peak_vehicles_change: '0',
      cost_base: '87850',
      cost_proposed: '77810',
      cost_change: '-10040',
      revenue_hours_pct: '-11.4',
      cost_pct: '-11.4',
    });
  });

  it('leaves a value that is "—" empty: Route 2 has no proposed figures', () => {
    expect(rowCells(text, '2 Crosstown')).toMatchObject({ status: 'Discontinued', trips_base: '1', trips_proposed: '', trips_change: '-1', revenue_hours_pct: '', cost_proposed: '' });
  });

  it('writes the system totals row with the totals of the comparison', () => {
    expect(rowCells(text, 'System total')).toMatchObject({
      route_id: '',
      status: '',
      trips_base: '9',
      trips_proposed: '10',
      trips_change: '1',
      revenue_miles_base: '49.00',
      revenue_miles_proposed: '72.00',
      revenue_miles_change: '23.00',
      revenue_hours_base: '4.15',
      revenue_hours_proposed: '4.85',
      revenue_hours_change: '0.70',
      peak_vehicles_base: '2',
      peak_vehicles_proposed: '3',
      cost_base: '104165',
      cost_proposed: '121735',
      cost_change: '17570',
      revenue_hours_pct: '16.9',
      cost_pct: '16.9',
    });
  });

  it('includes the Unchanged Route (never folded) and writes plain LF line endings', () => {
    expect(rowCells(text, '5 Loop')).toMatchObject({ status: 'Unchanged', trips_change: '0', revenue_hours_pct: '0.0' });
    expect(text.includes('\r')).toBe(false);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('protects a free-text heading value against spreadsheet formulas, but not a number', () => {
    const risky = comparisonCsvText(comparison, { ...heading, baselineName: '=Sum(A1)' });
    expect(lines(risky)[0]).toBe("Baseline,'=Sum(A1)");
    expect(rowCells(risky, '2 Crosstown').revenue_hours_change).toBe('-0.40');
  });

  it('protects a free-text Route name, and leaves a negative change as a number', () => {
    const risky: Comparison = { ...comparison, rows: comparison.rows.map((row) => (row.routeCode === '5' ? { ...row, name: '=HYPERLINK("x")' } : row)) };
    const out = comparisonCsvText(risky, heading);
    expect(lines(out).some((line) => line.startsWith(`5,"'=HYPERLINK(""x"")",Unchanged,`))).toBe(true);
    expect(rowCells(out, 'System total').revenue_hours_change).toBe('0.70');
  });
});

describe('comparisonCsvText route_id column', () => {
  it('protects a Route ID that starts with a formula character, and leaves a plain one alone', () => {
    const risky: Comparison = { ...comparison, rows: comparison.rows.map((row) => (row.routeCode === '5' ? { ...row, routeCode: '=cmd|x' } : row)) };
    const out = comparisonCsvText(risky, heading);
    expect(lines(out).some((line) => line.startsWith("'=cmd|x,5 Loop,Unchanged,"))).toBe(true);
    expect(lines(out).some((line) => line.startsWith('1,1 Main St,Changed,'))).toBe(true);
  });
});

describe('formula protection (moved to the domain; persistence re-exports it, and its own tests cover that)', () => {
  it('neutralizes a leading formula character, and restores it exactly', () => {
    for (const value of ['=1+1', '+x', '-y', '@z', "'=already", 'plain']) {
      expect(restoreFormulaText(neutralizeFormulaText(value))).toBe(value);
    }
    expect(neutralizeFormulaText('=1+1')).toBe("'=1+1");
    expect(neutralizeFormulaText('plain')).toBe('plain');
  });
});

describe('comparisonFileName (Decision 0091 item 18)', () => {
  it('joins the lower-case parts with dashes and ends in .csv', () => {
    expect(comparisonFileName('Existing', 'Redesign', 'Weekday')).toBe('existing-vs-redesign-weekday.csv');
  });

  it('makes each part safe for a file name, and never leaves a part empty', () => {
    expect(comparisonFileName('Scenario A / B (v2)', 'Plan: Option 2', 'Sat')).toBe('scenario-a-b-v2-vs-plan-option-2-sat.csv');
    expect(comparisonFileName('', 'Redesign', 'Weekday')).toBe('untitled-vs-redesign-weekday.csv');
  });
});
