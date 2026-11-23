// The pure part of the Compare tab (Decision 0091; card V4): which sides to open with, how rows are folded and filtered, how figures and
// messages read on screen. No React, no storage. The screen (CompareWorkspace.tsx) only draws what these functions return.

import type { CompareDifference, CompareError, CompareProgress, CompareRateValues, CompareRequest, CompareSideRequest } from '../../application/compare/compareTypes';
import type { CompareWarning, Comparison, ComparisonRow, ComparisonTotals, DaySpan, DirectionComparison, HeadwayPeriodKey, Measure, ServiceDayPair, SideChoice } from '../../domain/compare/types';
import type { ServiceDayDefinition } from '../../domain/types';
import { roundCostingDisplay, type CostingFinding } from '../../domain/costing';
import { HEADWAY_PERIODS } from '../../domain/compare/routeMeasures';
import type { CompareShowPreference, CompareSidePreference, CompareSortPreference } from '../preferences';
import { MISSING } from '../format';

/** One Scenario of the Project as the side pickers list it. */
export interface CompareScenarioChoice {
  id: string;
  name: string;
  serviceDays: ServiceDayDefinition[];
  /** For naming the Routes a warning is about. */
  routes: Array<{ id: string; name: string }>;
  tripProfiles: Array<{ id: string; name: string }>;
  blockingScenarios: Array<{ id: string; name: string; tripProfileId: string }>;
}

/** What the Compare tab opens a side with when nothing usable is remembered. */
export interface SideDefaults {
  /** The Scenario selected in the app, and the Trip profile working in it. */
  appScenarioId: string;
  appTripProfileId: string;
  /** Decision 0081: the Blocking scenario last chosen for each Trip profile of a Scenario. */
  rememberedBlocking(scenarioId: string): Record<string, string>;
}

/** A Blocking scenario of the profile: the remembered one, else the first, else none (the estimate). */
function defaultBlocking(scenario: CompareScenarioChoice, tripProfileId: string, defaults: SideDefaults): string | null {
  const available = scenario.blockingScenarios.filter((item) => item.tripProfileId === tripProfileId);
  const remembered = defaults.rememberedBlocking(scenario.id)[tripProfileId];
  return available.find((item) => item.id === remembered)?.id ?? available[0]?.id ?? null;
}

/**
 * One side. A remembered Scenario that no longer exists puts the whole side back on the first-open rule (card V4 item 9); a remembered Trip
 * profile or Blocking scenario that no longer fits falls back to its own default. `fallbackScenarioId` is the first-open Scenario.
 */
export function resolveSide(scenarios: readonly CompareScenarioChoice[], preferred: CompareSidePreference | undefined, fallbackScenarioId: string, defaults: SideDefaults): CompareSideRequest | undefined {
  const remembered = scenarios.find((item) => item.id === preferred?.scenarioId);
  const scenario = remembered ?? scenarios.find((item) => item.id === fallbackScenarioId) ?? scenarios[0];
  if (!scenario) return undefined;
  const profile = (remembered ? scenario.tripProfiles.find((item) => item.id === preferred?.tripProfileId) : undefined)
    ?? (scenario.id === defaults.appScenarioId ? scenario.tripProfiles.find((item) => item.id === defaults.appTripProfileId) : undefined)
    ?? scenario.tripProfiles[0];
  if (!profile) return undefined;
  const available = scenario.blockingScenarios.filter((item) => item.tripProfileId === profile.id);
  const wanted = remembered ? preferred?.blockingScenarioId : undefined;
  let blockingScenarioId: string | null;
  if (wanted === null) blockingScenarioId = null;
  else if (typeof wanted === 'string' && available.some((item) => item.id === wanted)) blockingScenarioId = wanted;
  else blockingScenarioId = defaultBlocking(scenario, profile.id, defaults);
  return { scenarioId: scenario.id, tripProfileId: profile.id, blockingScenarioId };
}

/** Both sides. First open: Baseline is the Scenario selected in the app; Proposed is the first other Scenario, or the same one when it is the only one. */
export function resolveSides(scenarios: readonly CompareScenarioChoice[], preference: { baseline?: CompareSidePreference; proposed?: CompareSidePreference }, defaults: SideDefaults): { baseline: CompareSideRequest; proposed: CompareSideRequest } | undefined {
  const baseline = resolveSide(scenarios, preference.baseline, defaults.appScenarioId, defaults);
  if (!baseline) return undefined;
  const firstOther = scenarios.find((item) => item.id !== baseline.scenarioId)?.id ?? baseline.scenarioId;
  const proposed = resolveSide(scenarios, preference.proposed, firstOther, defaults);
  return proposed ? { baseline, proposed } : undefined;
}

/** The side as a stored preference, for every id the screen resolved. */
export const sidePreference = (side: CompareSideRequest): CompareSidePreference => ({ scenarioId: side.scenarioId, tripProfileId: side.tripProfileId, blockingScenarioId: side.blockingScenarioId });

/** The heading text of the CSV: "Scenario / Trip profile / Blocking scenario". */
export function sideLabel(scenarios: readonly CompareScenarioChoice[], side: CompareSideRequest): string {
  const scenario = scenarios.find((item) => item.id === side.scenarioId);
  const profile = scenario?.tripProfiles.find((item) => item.id === side.tripProfileId);
  const blocking = scenario?.blockingScenarios.find((item) => item.id === side.blockingScenarioId);
  return [scenario?.name ?? '', profile?.name ?? '', blocking?.name ?? 'No blocking scenario'].join(' / ');
}

/** The day to compare: the remembered one while both sides still have it, else the Weekday, else the first day the sides share. */
export function chooseDay(dayPairs: readonly ServiceDayPair[], preferred: string | undefined): string {
  if (preferred === 'annual' && dayPairs.length > 0) return 'annual';
  return dayPairs.find((pair) => pair.key === preferred)?.key ?? dayPairs.find((pair) => pair.key === 'weekday')?.key ?? dayPairs[0]?.key ?? 'annual';
}

export const dayLabel = (day: string, dayPairs: readonly ServiceDayPair[]): string => (day === 'annual' ? 'Annual' : dayPairs.find((pair) => pair.key === day)?.name ?? day);

/** Menu text of the Rates and Counts choices. */
export const CHOICE_LABELS: Record<SideChoice, string> = { baseline: "Baseline's", proposed: "Proposed's", own: "Each side's own" };

/** The request key: two equal requests are the same comparison. */
export const requestKey = (request: CompareRequest): string => JSON.stringify(request);

// ---------- Figures ----------

export type MeasureKind = 'whole' | 'miles' | 'hours' | 'money';
export type Tone = 'up' | 'down' | 'same';

const GROUPED = [0, 1, 2].map((digits) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const grouped = (value: number, digits: 0 | 1 | 2): string => GROUPED[digits].format(roundCostingDisplay(value, digits));

/** Decision 0091 item 14: trips and vehicles are whole numbers; miles and hours have one decimal on screen; cost is in dollars (millions in tiles). */
function plainText(kind: MeasureKind, value: number, millions: boolean, millionDigits: 1 | 2): string {
  if (kind === 'whole') return grouped(value, 0);
  if (kind === 'miles' || kind === 'hours') return grouped(value, 1);
  const sign = value < 0 ? '−' : '';
  if (millions && Math.abs(value) >= 1_000_000) return `${sign}$${grouped(Math.abs(value) / 1_000_000, millionDigits)}M`;
  return `${sign}$${grouped(Math.abs(value), 0)}`;
}

/** A figure for a cell or a tile. Cost of a million dollars or more is shown in millions in tiles (`tile`), and in whole dollars in the table. */
export function formatMeasure(kind: MeasureKind, value: number | undefined, options: { tile?: boolean } = {}): string {
  return value === undefined ? MISSING : plainText(kind, value, options.tile === true, 1);
}

/** A signed change ("+1", "−0.4", "0"), with its tone. A change that rounds to zero is written without a sign. */
export function formatChange(kind: MeasureKind, change: number | undefined, options: { tile?: boolean } = {}): { text: string; tone: Tone } {
  if (change === undefined) return { text: MISSING, tone: 'same' };
  const digits = kind === 'whole' || kind === 'money' ? 0 : 1;
  if (roundCostingDisplay(Math.abs(change), digits) === 0) return { text: plainText(kind, 0, false, 1), tone: 'same' };
  // Millions: one decimal in a tile ("+$7.6M"), two in a table cell ("+$5.47M").
  const text = plainText(kind, Math.abs(change), true, options.tile ? 1 : 2);
  return change > 0 ? { text: `+${text}`, tone: 'up' } : { text: `−${text}`, tone: 'down' };
}

/** "+16.9%", "−11.4%", "0.0%", or "—" where Decision 0091 item 14 gives none. */
export function formatPercentChange(percent: number | undefined): string {
  if (percent === undefined) return MISSING;
  if (roundCostingDisplay(Math.abs(percent), 1) === 0) return '0.0%';
  return `${percent > 0 ? '+' : '−'}${grouped(Math.abs(percent), 1)}%`;
}

export interface FromTo { from: string; to: string }

/** A measure as "from → to". An absent side is "—", or `missing` when a side's figure is not measured for a reason (for example "Not blocked"). */
export function fromTo(kind: MeasureKind, measure: Measure, options: { tile?: boolean; missing?: { baseline?: string; proposed?: string } } = {}): FromTo {
  return {
    from: measure.baseline === undefined ? options.missing?.baseline ?? MISSING : formatMeasure(kind, measure.baseline, options),
    to: measure.proposed === undefined ? options.missing?.proposed ?? MISSING : formatMeasure(kind, measure.proposed, options),
  };
}

/** Whether the two sides of a measure read differently on screen, which is what the detail marks in bold. */
export function differs(kind: MeasureKind, measure: Measure): boolean {
  const { from, to } = fromTo(kind, measure);
  return from !== to;
}

// ---------- Rows ----------

export interface RowFilter { show: CompareShowPreference; sort: CompareSortPreference; find: string }

export interface ArrangedRows {
  /** The rows listed one by one: Routes first, Unattributed last. */
  rows: ComparisonRow[];
  /** Unchanged Routes folded under one row (Decision 0091 item 17); empty when a filter or find is active. */
  folded: ComparisonRow[];
}

const byRouteOrder = (left: ComparisonRow, right: ComparisonRow): number => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });

/** Decision 0091 item 17 with the table's Show, Sort and Find. The rows arrive in the comparison's own order (largest hours change first). */
export function arrangeRows(comparison: Pick<Comparison, 'rows'>, filter: RowFilter): ArrangedRows {
  const text = filter.find.trim().toLowerCase();
  let rows = comparison.rows.filter((row) => (filter.show === 'all' ? true : row.status === filter.show));
  if (text) rows = rows.filter((row) => row.name.toLowerCase().includes(text) || row.routeCode.toLowerCase().includes(text));
  if (filter.sort === 'route') rows = [...rows.filter((row) => !row.unattributed).sort(byRouteOrder), ...rows.filter((row) => row.unattributed)];
  const fold = filter.show === 'all' && !text;
  return { rows: rows.filter((row) => !(fold && row.foldable)), folded: fold ? rows.filter((row) => row.foldable) : [] };
}

/** The one-line totals of the folded row: its Routes, trips and revenue hours (an unchanged Route has the same on both sides). */
export function foldedSummary(folded: readonly ComparisonRow[]): { routes: number; trips: number; revenueHours: number } {
  return {
    routes: folded.length,
    trips: folded.reduce((sum, row) => sum + (row.trips.proposed ?? row.trips.baseline ?? 0), 0),
    revenueHours: folded.reduce((sum, row) => sum + (row.revenueHours.proposed ?? row.revenueHours.baseline ?? 0), 0),
  };
}

/** The status chip text. */
export const STATUS_TEXT: Record<ComparisonRow['status'], string> = { changed: 'Changed', unchanged: 'Unchanged', new: 'New', discontinued: 'Discontinued' };

/** What a side's missing peak says: "Not blocked" for a side with no Blocking scenario, and never 0 (Decision 0091 item 12). */
export function peakMissing(blocked: { baseline: boolean; proposed: boolean }): { baseline?: string; proposed?: string } {
  return { ...(blocked.baseline ? {} : { baseline: 'Not blocked' }), ...(blocked.proposed ? {} : { proposed: 'Not blocked' }) };
}

/** The bar's length for a row's hours change, as a fraction of the largest change shown. */
export function barFraction(change: number | undefined, largest: number): number {
  if (change === undefined || largest <= 0) return 0;
  return Math.min(1, Math.abs(change) / largest);
}

export const largestHoursChange = (rows: readonly ComparisonRow[]): number => rows.reduce((largest, row) => Math.max(largest, Math.abs(row.revenueHours.change ?? 0)), 0);

// ---------- Detail ----------

/** A headway in minutes: "10", "7½", or "—". */
export function formatHeadway(minutes: number | undefined): string {
  if (minutes === undefined) return MISSING;
  const whole = Math.floor(minutes);
  return minutes - whole === 0.5 ? `${whole === 0 ? '' : whole}½` : String(whole);
}

/** One cell of the headway grid: one value when both sides read alike, otherwise "before → after". */
export function headwayCell(baseline: number | undefined, proposed: number | undefined): { text: string; changed: boolean } {
  const left = formatHeadway(baseline);
  const right = formatHeadway(proposed);
  return left === right ? { text: left, changed: false } : { text: `${left} → ${right}`, changed: true };
}

const PERIOD_RANGES: Record<HeadwayPeriodKey, string> = { early: '< 6:00', amPeak: '6–9', midday: '9–15', pmPeak: '15–18', evening: '18–21', night: '21 +' };

export const headwayColumns: ReadonlyArray<{ key: HeadwayPeriodKey; label: string; range: string }> = HEADWAY_PERIODS.map((period) => ({ key: period.key, label: period.label, range: PERIOD_RANGES[period.key] }));

/** A span as "6:00–10:30"; times past 24:00 keep counting (25:10), as the Trips tab shows them. */
export function formatSpan(span: DaySpan | undefined, clock: (seconds: number) => string): string {
  return span ? `${clock(span.start)}–${clock(span.end)}` : MISSING;
}

/** A length of time as hours and minutes: "0:42", "4:36". */
const hoursAndMinutes = (seconds: number): string => `${Math.floor(Math.abs(seconds) / 3600)}:${String(Math.floor((Math.abs(seconds) % 3600) / 60)).padStart(2, '0')}`;

/** The change in a span's length, as a signed length of time: "+0:42", "−0:06", "0:00". */
export function spanChange(direction: DirectionComparison): { text: string; tone: Tone } {
  const { baseline, proposed } = direction.span;
  if (!baseline || !proposed) return { text: MISSING, tone: 'same' };
  const change = (proposed.end - proposed.start) - (baseline.end - baseline.start);
  if (change === 0) return { text: hoursAndMinutes(0), tone: 'same' };
  return { text: `${change > 0 ? '+' : '−'}${hoursAndMinutes(change)}`, tone: change > 0 ? 'up' : 'down' };
}

// ---------- Messages ----------

export interface SideNames { baseline: string; proposed: string }

const SIDE_TITLE = { baseline: 'Baseline', proposed: 'Proposed' } as const;

/**
 * Card V4 item 3. The plain-language lines for a side or request that cannot be compared, each saying how to fix it. A Costing finding is
 * shown through `describe` (the Costing tab's own wording).
 */
export function errorLines(error: CompareError, scenarioNames: SideNames, describe: (finding: CostingFinding) => string): string[] {
  const side = error.side;
  const name = side ? scenarioNames[side] : '';
  const prefix = side ? `${SIDE_TITLE[side]} (${name}): ` : '';
  switch (error.code) {
    case 'compare.sideMissing': return [`${prefix}${error.detail ?? 'This side cannot be read.'} Choose it again.`];
    case 'compare.dayMissing': return ['The two sides have no service day in common to compare. Give both Scenarios a Weekday, Saturday, Sunday or Holiday, or a custom day with the same name.'];
    case 'compare.costingNoEstimate':
    case 'compare.costingInvalid': {
      const noRate = error.detail === 'rateMissing' || error.findings.some((finding) => finding.messageKey === 'costing.rateMissing');
      if (noRate) return [`${prefix}Enter a rate on the Costing tab for ${name}, or set Rates to the other side's.`];
      if (error.code === 'compare.costingNoEstimate') {
        if (error.detail === 'noEligibleBlocks') return [`${prefix}no blocks can be costed. Finish blocking ${name} on the Blocking tab, or choose "None (estimate)" as its Blocking scenario.`];
        if (error.detail === 'noTrips') return [`${prefix}the Trip profile has no trips. Build trips on the Trips tab, or choose another Trip profile.`];
        if (error.detail === 'layoverFactorMissing') return [`${prefix}the estimate needs a layover factor. Enter it on the Costing tab for ${name}, or choose a Blocking scenario.`];
      }
      return [`${prefix}Costing cannot calculate this side.`, ...error.findings.filter((finding) => finding.severity === 'error').map((finding) => describe(finding))];
    }
  }
}

/** The rate fields that differ, in words. */
function rateParts(baseline: CompareRateValues, proposed: CompareRateValues): string[] {
  const rate = (values: CompareRateValues) => (values.enteredRate === undefined ? 'no rate entered' : `$${values.enteredRate.toFixed(2)}/hr`);
  const parts: string[] = [];
  if (baseline.enteredRate !== proposed.enteredRate) parts.push(`baseline ${rate(baseline)}, proposed ${rate(proposed)}`);
  if (baseline.rateYear !== proposed.rateYear) parts.push(`rate year ${baseline.rateYear} vs ${proposed.rateYear}`);
  if (baseline.baseServiceYear !== proposed.baseServiceYear) parts.push(`first service year ${baseline.baseServiceYear} vs ${proposed.baseServiceYear}`);
  if (baseline.annualEscalation !== proposed.annualEscalation) parts.push(`escalation ${grouped(baseline.annualEscalation * 100, 1)}% vs ${grouped(proposed.annualEscalation * 100, 1)}%`);
  if (baseline.futureYearCount !== proposed.futureYearCount) parts.push(`future years ${baseline.futureYearCount} vs ${proposed.futureYearCount}`);
  return parts;
}

const IN_USE_TEXT: Record<SideChoice, string> = {
  baseline: "Both sides use the baseline's.",
  proposed: "Both sides use the proposed side's.",
  own: 'Cost and annual figures include these differences, not only service changes.',
};

export interface DifferenceLine {
  code: CompareDifference['code'];
  text: string;
  /** The menu that the "Use the baseline's for both" link resets, when each side uses its own. */
  resets?: 'rates' | 'counts';
}

/** Decision 0091 item 8. One line for each way the sides differ: rates, counts, basis. */
export function differenceLines(differences: readonly CompareDifference[], scenarioNames: SideNames): DifferenceLine[] {
  return differences.map((difference): DifferenceLine => {
    if (difference.code === 'compare.ratesDiffer') {
      return { code: difference.code, text: `The sides have different rates (${rateParts(difference.baseline, difference.proposed).join('; ')}). ${IN_USE_TEXT[difference.applied]}`, ...(difference.applied === 'own' ? { resets: 'rates' as const } : {}) };
    }
    if (difference.code === 'compare.countsDiffer') {
      const days = difference.days.map((day) => `${day.name} ${day.baseline} vs ${day.proposed}`);
      const routes = difference.routes.length === 0 ? [] : [`counts of their own on ${difference.routes.length === 1 ? 'one route' : `${difference.routes.length} routes`} (${difference.routes.map((route) => route.name).join(', ')})`];
      const parts = [...(days.length ? [`annual service days (${days.join(', ')})`] : []), ...routes];
      return { code: difference.code, text: `The sides have different ${parts.join(' and ')}. ${IN_USE_TEXT[difference.applied]}`, ...(difference.applied === 'own' ? { resets: 'counts' as const } : {}) };
    }
    const basis = (kind: 'blocked' | 'estimated') => (kind === 'blocked' ? 'blocked hours' : 'an estimate from factors');
    const estimated = [difference.baseline === 'estimated' ? `baseline "${scenarioNames.baseline}"` : '', difference.proposed === 'estimated' ? `proposed "${scenarioNames.proposed}"` : ''].filter(Boolean);
    return { code: difference.code, text: `The sides are costed differently: baseline from ${basis(difference.baseline)}, proposed from ${basis(difference.proposed)}. Peak vehicles are not shown for the ${estimated.join(' and ')}, which has no Blocking scenario.` };
  });
}

/** The comparison's own warnings, in plain words. */
export function warningLines(warnings: readonly CompareWarning[], routeNames: (routeId: string) => string | undefined): string[] {
  return warnings.map((warning) => {
    const names = warning.routeIds.map((id) => routeNames(id) ?? 'a route');
    return `${SIDE_TITLE[warning.side]} has more than one route with the key "${warning.key}" (${names.join(', ')}), so they are not matched. They appear as New or Discontinued.`;
  });
}

export const progressFraction = (progress: CompareProgress | undefined): number => (progress && progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0);

/** The totals tile order of the screen. */
export function totalsTiles(totals: ComparisonTotals): Array<{ id: 'trips' | 'revenueMiles' | 'revenueHours' | 'peakVehicles' | 'cost'; kind: MeasureKind; measure: Measure }> {
  return [
    { id: 'trips', kind: 'whole', measure: totals.trips },
    { id: 'revenueMiles', kind: 'miles', measure: totals.revenueMiles },
    { id: 'revenueHours', kind: 'hours', measure: totals.revenueHours },
    { id: 'peakVehicles', kind: 'whole', measure: totals.peakVehicles },
    { id: 'cost', kind: 'money', measure: totals.cost },
  ];
}
