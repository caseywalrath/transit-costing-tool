import { UNATTRIBUTED_ROUTE_NAME } from '../costSummary';
import { sortRouteResults, type CostingRouteResult } from '../routeCosting';
import type { EntityId, Route, ServiceSeconds } from '../types';
import { HEADWAY_PERIODS, headwaysByPeriod } from './routeMeasures';
import type {
  CompareWarning,
  Comparison,
  ComparisonInput,
  ComparisonRow,
  ComparisonTotals,
  DaySpan,
  DirectionComparison,
  Measure,
  RoutePair,
  RouteStatus,
  ServiceDayPair,
  SideDay,
} from './types';

/** One direction of one side's Route on one day. */
interface DirectionCell { name: string; departures: ServiceSeconds[]; span?: DaySpan }

/**
 * One side's figures for one row on one day, or the annual sum of those days. An absent side counts as 0 in a change (Decision 0091 items 4
 * and 15: a New or Discontinued Route compares against nothing), but `present` is false there, which the screen shows as "—".
 */
interface Cell {
  present: boolean;
  /** The annual count in use; 0 when absent. */
  annualServiceDays: number;
  trips: number;
  revenueMiles?: number;
  revenueHours: number;
  platformHours?: number;
  /** Undefined when the side is not blocked (item 12). */
  peakVehicles?: number;
  cost?: number;
  /** Annual view only: the day that gives the peak (item 13). */
  peakDayName?: string;
  directions: Map<string, DirectionCell>;
}

/** The row's Route pair, or the Unattributed row (`null`). */
type RowSource = RoutePair | null;

const absentCell = (): Cell => ({ present: false, annualServiceDays: 0, trips: 0, revenueMiles: 0, revenueHours: 0, platformHours: 0, peakVehicles: 0, cost: 0, directions: new Map() });

/** A side's cell for one Route (or Unattributed, `routeId` null) on one day. A side without the day, or without the Route, is absent. */
function cellOf(side: SideDay | undefined, routeId: EntityId | null, routeOnSide: boolean): Cell {
  if (!side || !routeOnSide) return absentCell();
  const peakVehicles = side.peaks === 'notBlocked' ? undefined : (side.peaks.byRoute.get(routeId) ?? 0);
  const figures = side.routes.get(routeId);
  // Miles belong to a Route (item 9), so the Unattributed row has none, on either side: it shows "—" (README, Weekday by route).
  if (!figures) return { present: true, annualServiceDays: 0, trips: 0, revenueMiles: routeId === null ? undefined : 0, revenueHours: 0, platformHours: 0, peakVehicles, cost: 0, directions: new Map() };
  const directions = new Map<string, DirectionCell>(figures.measures.directions.map((direction) => [direction.key, { name: direction.name, departures: direction.departures, ...(direction.span ? { span: direction.span } : {}) }]));
  return {
    present: true,
    annualServiceDays: figures.annualServiceDays,
    trips: figures.measures.trips,
    revenueMiles: figures.measures.revenueMiles,
    revenueHours: figures.revenueHoursPerDay,
    platformHours: figures.platformHoursPerDay,
    peakVehicles,
    cost: figures.firstYearCost,
    directions,
  };
}

/**
 * Decision 0091 item 13. The annual cell: trips, miles, hours and platform hours are each day's figure times that day's count, summed over
 * the days; cost is the first-year cost already summed in the same way; the peak is the highest day's figure, with that day named. A
 * measure is undefined when a day the side has lacks it (a Route with no miles, a side that is not blocked).
 */
function annualCell(cells: Cell[], dayNames: string[], routeOnSide: boolean): Cell {
  const present = routeOnSide && cells.some((cell) => cell.present);
  const presentCells = cells.filter((cell) => cell.present);
  const annualSum = (pick: (cell: Cell) => number | undefined, times: (cell: Cell) => number): number | undefined =>
    presentCells.some((cell) => pick(cell) === undefined) ? undefined : cells.reduce((sum, cell) => sum + (pick(cell) ?? 0) * times(cell), 0);

  let peakVehicles: number | undefined;
  let peakDayName: string | undefined;
  if (!presentCells.some((cell) => cell.peakVehicles === undefined)) {
    const values = cells.map((cell) => cell.peakVehicles ?? 0);
    const highest = Math.max(0, ...values);
    const index = cells.findIndex((cell, position) => cell.present && values[position] === highest);
    peakVehicles = highest;
    peakDayName = dayNames[index >= 0 ? index : values.indexOf(highest)];
  }

  return {
    present,
    annualServiceDays: 0,
    trips: cells.reduce((sum, cell) => sum + cell.trips * cell.annualServiceDays, 0),
    revenueMiles: annualSum((cell) => cell.revenueMiles, (cell) => cell.annualServiceDays),
    revenueHours: cells.reduce((sum, cell) => sum + cell.revenueHours * cell.annualServiceDays, 0),
    platformHours: annualSum((cell) => cell.platformHours, (cell) => cell.annualServiceDays),
    peakVehicles,
    peakDayName,
    cost: annualSum((cell) => cell.cost, () => 1),
    directions: new Map(),
  };
}

/** Decision 0091 item 14. A percentage of the Baseline to one decimal; undefined when the Baseline is 0 or missing. */
function percentOf(change: number | undefined, baseline: number | undefined): number | undefined {
  if (change === undefined || baseline === undefined || baseline === 0) return undefined;
  const tenths = Math.round((change / baseline) * 100 * 10) / 10;
  return tenths === 0 ? 0 : tenths;
}

/**
 * Decision 0091 item 14. A row's measure. The percent is shown only for a Route on both sides, so a New or Discontinued row shows "—".
 * RULE CONFLICT (reported, not resolved by the card): item 14 read literally gives a percent for a Discontinued Route whose Baseline is
 * not 0 (R2 hours would be -100.0%), but the worked example shows "—" there. This follows the worked example, because the README is the
 * acceptance test. The one rule to change, if the decision is amended, is the `matched` test here.
 */
function rowMeasure(baseline: Cell, proposed: Cell, pick: (cell: Cell) => number | undefined): Measure {
  const baselineValue = pick(baseline);
  const proposedValue = pick(proposed);
  const change = baselineValue === undefined || proposedValue === undefined ? undefined : proposedValue - baselineValue;
  const matched = baseline.present && proposed.present;
  return {
    baseline: baseline.present ? baselineValue : undefined,
    proposed: proposed.present ? proposedValue : undefined,
    change,
    percent: matched ? percentOf(change, baselineValue) : undefined,
  };
}

const roundedMiles = (miles: number | undefined): number | undefined => (miles === undefined ? undefined : Math.round(miles * 100));
const wholeSeconds = (hours: number): number => Math.round(hours * 3600);

function sameMinutes(left: number | undefined, right: number | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return Math.abs(left - right) < 1e-9;
}

function sameSpan(left: DaySpan | undefined, right: DaySpan | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.start === right.start && left.end === right.end;
}

const headwaysOf = (direction: DirectionCell | undefined): Array<number | undefined> => headwaysByPeriod(direction?.departures ?? []);

/** Decision 0091 item 15. A direction differs when its span or any headway differs. */
function directionChanged(baseline: DirectionCell | undefined, proposed: DirectionCell | undefined): boolean {
  if (!sameSpan(baseline?.span, proposed?.span)) return true;
  const left = headwaysOf(baseline);
  const right = headwaysOf(proposed);
  return HEADWAY_PERIODS.some((_, index) => !sameMinutes(left[index], right[index]));
}

/**
 * Decision 0091 item 15. Changed when trips, miles (to 0.01), span, any headway, or revenue hours (by a minute or more) differ. Peak
 * vehicles and cost do not count: they can move without a service change.
 */
function cellsChanged(baseline: Cell, proposed: Cell): boolean {
  if (baseline.trips !== proposed.trips) return true;
  if (roundedMiles(baseline.revenueMiles) !== roundedMiles(proposed.revenueMiles)) return true;
  if (Math.abs(wholeSeconds(baseline.revenueHours) - wholeSeconds(proposed.revenueHours)) >= 60) return true;
  const keys = new Set([...baseline.directions.keys(), ...proposed.directions.keys()]);
  return [...keys].some((key) => directionChanged(baseline.directions.get(key), proposed.directions.get(key)));
}

/** Decision 0091 item 9 (day view). Each direction of a Route on the day, with both spans and the headway of each period. */
function directionComparisons(baseline: Cell, proposed: Cell): DirectionComparison[] {
  const keys = [...new Set([...baseline.directions.keys(), ...proposed.directions.keys()])];
  const rank = (key: string) => (key === 'outbound' ? 0 : key === 'inbound' ? 1 : 2);
  return keys
    .map((key) => {
      const left = baseline.directions.get(key);
      const right = proposed.directions.get(key);
      const leftHeadways = headwaysOf(left);
      const rightHeadways = headwaysOf(right);
      return {
        key,
        name: right?.name ?? left?.name ?? key,
        span: { ...(left?.span ? { baseline: left.span } : {}), ...(right?.span ? { proposed: right.span } : {}) },
        headways: HEADWAY_PERIODS.map((period, index) => ({ period: period.key, baseline: leftHeadways[index], proposed: rightHeadways[index] })),
        changed: directionChanged(left, right),
      };
    })
    .sort((left, right) => rank(left.key) - rank(right.key) || left.name.localeCompare(right.name));
}

/** Decision 0091 item 1 and the mock-up: the Route's display name, with its short name first (as the Routes are listed, item 17). */
function displayName(route: Route): string {
  const shortName = route.shortName?.trim();
  const name = route.name.trim();
  return shortName ? `${shortName} ${name}` : name;
}

/** The identifier a CSV row lists the Route by: its GTFS route ID, else its short name. */
function routeCode(route: Route): string {
  return route.gtfsRouteId?.trim() || route.shortName?.trim() || '';
}

/** Decision 0091 item 12 (system figure) for one side on one day: the system peak, undefined when the side is not blocked. */
function systemPeakOf(side: SideDay | undefined): number | undefined {
  if (side === undefined) return 0;
  return side.peaks === 'notBlocked' ? undefined : side.peaks.system;
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length === 0 ? undefined : defined.reduce((sum, value) => sum + value, 0);
}

function totalMeasure(baseline: number | undefined, proposed: number | undefined, dayName?: { baseline?: string; proposed?: string }): Measure {
  const change = baseline === undefined || proposed === undefined ? undefined : proposed - baseline;
  return { baseline, proposed, change, percent: percentOf(change, baseline), ...(dayName ? { dayName } : {}) };
}

/** Decision 0091 item 17. The largest revenue-hours change first (to the second, so a tie is a real tie), then route order. */
function hoursChangeSeconds(row: ComparisonRow): number {
  return Math.abs(wholeSeconds(row.revenueHours.change ?? 0));
}

/**
 * Decision 0091 items 13 to 17. The comparison of one service day, or of the Annual view (`day: 'annual'`, every day pair weighted by its
 * count). Routes are the match's pairs; the Unattributed row appears when a shown day has one on either side. Rows are in the default
 * order of item 17, not folded (the screen folds `foldable` rows). The totals are the sums of the rows, except the system peak, which
 * counts all Blocks. The warnings are the ambiguous Route keys (`compare.ambiguousRoute`).
 */
export function buildComparison(input: ComparisonInput): Comparison {
  const annual = input.day === 'annual';
  const days: ServiceDayPair[] = annual ? input.dayPairs : input.dayPairs.filter((day) => day.key === input.day);
  if (days.length === 0) throw new Error(`compare: no service-day pair "${input.day}"`);
  const sideDay = (side: 'baseline' | 'proposed', day: ServiceDayPair): SideDay | undefined => (side === 'baseline' ? input.baseline : input.proposed).get(day.key);

  const sources: RowSource[] = [...input.routeMatch.pairs];
  const unattributedShown = days.some((day) => sideDay('baseline', day)?.routes.has(null) || sideDay('proposed', day)?.routes.has(null));
  if (unattributedShown) sources.push(null);

  const built = sources.map((source) => {
    // The Unattributed row is the `null` Route, which every side with the day has. A Route pair's missing side is absent.
    const baselineRoute = source?.baseline;
    const proposedRoute = source?.proposed;
    const baselineId = source === null ? null : (baselineRoute?.id ?? null);
    const proposedId = source === null ? null : (proposedRoute?.id ?? null);
    const onBaseline = source === null || baselineRoute !== undefined;
    const onProposed = source === null || proposedRoute !== undefined;
    const perDay = days.map((day) => ({
      name: day.name,
      baseline: cellOf(sideDay('baseline', day), baselineId, onBaseline),
      proposed: cellOf(sideDay('proposed', day), proposedId, onProposed),
    }));
    const dayNames = perDay.map((entry) => entry.name);
    const baseline = annual ? annualCell(perDay.map((entry) => entry.baseline), dayNames, onBaseline) : perDay[0].baseline;
    const proposed = annual ? annualCell(perDay.map((entry) => entry.proposed), dayNames, onProposed) : perDay[0].proposed;
    // Decision 0091 item 15, Annual view: a Route is Changed when any day is.
    const changed = perDay.some((entry) => cellsChanged(entry.baseline, entry.proposed));

    if (source === null) {
      const status: RouteStatus = changed ? 'changed' : 'unchanged';
      return { row: unattributedRow(baseline, proposed, status, annual), baseline, proposed };
    }
    const status: RouteStatus = !baselineRoute ? 'new' : !proposedRoute ? 'discontinued' : changed ? 'changed' : 'unchanged';
    const shownRoute = proposedRoute ?? baselineRoute;
    const row: ComparisonRow = {
      key: `route:${baselineRoute?.id ?? ''}:${proposedRoute?.id ?? ''}`,
      routeCode: shownRoute ? routeCode(shownRoute) : '',
      name: shownRoute ? displayName(shownRoute) : '',
      unattributed: false,
      status,
      foldable: status === 'unchanged',
      trips: rowMeasure(baseline, proposed, (cell) => cell.trips),
      revenueMiles: rowMeasure(baseline, proposed, (cell) => cell.revenueMiles),
      revenueHours: rowMeasure(baseline, proposed, (cell) => cell.revenueHours),
      platformHours: rowMeasure(baseline, proposed, (cell) => cell.platformHours),
      peakVehicles: peakMeasure(baseline, proposed, annual),
      cost: rowMeasure(baseline, proposed, (cell) => cell.cost),
      ...(annual ? {} : { directions: directionComparisons(baseline, proposed) }),
    };
    return { row, baseline, proposed };
  });

  // Decision 0091 item 17: largest revenue-hours change first, then the route order that sortRouteResults gives; Unattributed last.
  const orderStubs: CostingRouteResult[] = built.map(({ row }) => ({ routeId: row.unattributed ? null : row.key, routeName: row.name, days: [] }));
  const routeOrder = sortRouteResults(orderStubs);
  const rank = new Map<string | null, number>(routeOrder.map((entry, index) => [entry.routeId, index]));
  const ordered = [...built].sort((left, right) =>
    Number(left.row.unattributed) - Number(right.row.unattributed)
    || hoursChangeSeconds(right.row) - hoursChangeSeconds(left.row)
    || (rank.get(left.row.unattributed ? null : left.row.key) ?? 0) - (rank.get(right.row.unattributed ? null : right.row.key) ?? 0));

  return {
    totals: totalsOf(built, days, annual, sideDay),
    rows: ordered.map(({ row }) => row),
    warnings: input.routeMatch.ambiguous.map((entry): CompareWarning => ({ code: 'compare.ambiguousRoute', side: entry.side, key: entry.key, routeIds: entry.routeIds })),
  };
}

function peakMeasure(baseline: Cell, proposed: Cell, annual: boolean): Measure {
  const measure = rowMeasure(baseline, proposed, (cell) => cell.peakVehicles);
  if (!annual) return measure;
  return { ...measure, dayName: { ...(baseline.peakDayName ? { baseline: baseline.peakDayName } : {}), ...(proposed.peakDayName ? { proposed: proposed.peakDayName } : {}) } };
}

function unattributedRow(baseline: Cell, proposed: Cell, status: RouteStatus, annual: boolean): ComparisonRow {
  return {
    key: 'unattributed',
    routeCode: '',
    name: UNATTRIBUTED_ROUTE_NAME,
    unattributed: true,
    status,
    foldable: false,
    trips: rowMeasure(baseline, proposed, (cell) => cell.trips),
    revenueMiles: rowMeasure(baseline, proposed, (cell) => cell.revenueMiles),
    revenueHours: rowMeasure(baseline, proposed, (cell) => cell.revenueHours),
    platformHours: rowMeasure(baseline, proposed, (cell) => cell.platformHours),
    peakVehicles: peakMeasure(baseline, proposed, annual),
    cost: rowMeasure(baseline, proposed, (cell) => cell.cost),
  };
}

/**
 * Decision 0091 items 13 and 14. The totals of the rows, so that they agree with the rows; the peak is the system's, and in the Annual view
 * the highest day's, with that day named.
 */
function totalsOf(
  built: Array<{ baseline: Cell; proposed: Cell }>,
  days: ServiceDayPair[],
  annual: boolean,
  sideDay: (side: 'baseline' | 'proposed', day: ServiceDayPair) => SideDay | undefined,
): ComparisonTotals {
  const total = (pick: (cell: Cell) => number | undefined) => ({
    baseline: sumDefined(built.map((entry) => pick(entry.baseline))),
    proposed: sumDefined(built.map((entry) => pick(entry.proposed))),
  });
  const sumsOf = (pick: (cell: Cell) => number | undefined) => {
    const { baseline, proposed } = total(pick);
    return totalMeasure(baseline, proposed);
  };

  let peakVehicles: Measure;
  if (annual) {
    const peakOver = (side: 'baseline' | 'proposed') => {
      const values = days.map((day) => systemPeakOf(sideDay(side, day)));
      const defined = values.filter((value): value is number => value !== undefined);
      if (defined.length === 0) return { peak: undefined, dayName: undefined };
      const peak = Math.max(...defined);
      return { peak, dayName: days[values.indexOf(peak)]?.name };
    };
    const left = peakOver('baseline');
    const right = peakOver('proposed');
    peakVehicles = totalMeasure(left.peak, right.peak, { ...(left.dayName ? { baseline: left.dayName } : {}), ...(right.dayName ? { proposed: right.dayName } : {}) });
  } else {
    peakVehicles = totalMeasure(systemPeakOf(sideDay('baseline', days[0])), systemPeakOf(sideDay('proposed', days[0])));
  }

  return {
    trips: sumsOf((cell) => cell.trips),
    revenueMiles: sumsOf((cell) => cell.revenueMiles),
    revenueHours: sumsOf((cell) => cell.revenueHours),
    platformHours: sumsOf((cell) => cell.platformHours),
    peakVehicles,
    cost: sumsOf((cell) => cell.cost),
  };
}
