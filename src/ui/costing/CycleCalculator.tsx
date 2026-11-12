import { useState } from 'react';
import { calculatorRevenueHours, solveCycle, type CycleResult, type CycleSolveFor } from '../../domain/cycleCalculator';
import type { EstimatedCostingCalculationResult, ImpliedRouteService, RouteFactorSource } from '../../domain/estimatedCosting';
import { SegmentedControl } from '../shared/SegmentedControl';
import { formatMoney, MISSING } from '../format';

type Field = 'run' | 'layover' | 'headway' | 'vehicles';
type Overrides = Record<string, Partial<Record<Field, string>>>;

const SOLVE_OPTIONS = [
  { value: 'vehicles', text: 'Vehicles' },
  { value: 'layover', text: 'Layover %' },
  { value: 'headway', text: 'Headway' },
];

const fixed = (value: number | undefined, digits: number) => value === undefined || !Number.isFinite(value) ? MISSING : value.toFixed(digits);
/** Vehicles: whole numbers without decimals, others to two places. */
const vehiclesText = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? MISSING : Number.isInteger(value) ? String(value) : value.toFixed(2);
const parse = (text: string | undefined) => text === undefined || !text.trim() ? undefined : Number(text.trim().replace(/%$/, ''));

/** The schedule's values for one row: the mean running cycle, the median headway when every direction shares it, and the day's layover. */
function scheduleValues(route: ImpliedRouteService, layoverFraction: number | undefined) {
  const headways = [...new Set(route.directions.map((direction) => direction.headwaySeconds))];
  return {
    run: route.roundTripRunSeconds / 60,
    headway: headways.length === 1 && headways[0] !== undefined ? headways[0] / 60 : undefined,
    layover: layoverFraction,
    vehicles: route.impliedVehicles === undefined ? undefined : Math.ceil(route.impliedVehicles - 1e-9),
  };
}

type Row = {
  key: string; serviceDayId: string; routeId: string; dayName: string; routeName?: string; annualServiceDays: number;
  text: Record<Field, string>; result: CycleResult; revenue?: number; annualCost?: number; savedLayover?: number;
  /** Decision 0077: the starting layover % is the Route's own value (day or All days), not inherited from the Trip Profile. */
  routeOwnLayover: boolean;
};

const isRouteSource = (source: RouteFactorSource | undefined) => source === 'routeServiceDay' || source === 'routeAllDays';

/**
 * The Vehicle requirement surface (Decision 0063): one row per service day and Route of an estimated cost basis. The running cycle, headway, and
 * layover start from the trips and the Route's resolved layover % (Decision 0077); one of layover, headway, and vehicles is solved from the
 * others. Typed values stay on this screen until "Use" writes a row's layover % into that day's Estimate factors cell as an unsaved change.
 * "Use" writes only where the Estimate factors grid shows the result: with All routes, on rows whose Route inherits the Trip Profile's
 * layover; with one Route chosen, on that Route's rows (the others are dimmed).
 */
export function CycleCalculator({ result, rate, disabled, factorRouteId, onUseLayover }: {
  result: EstimatedCostingCalculationResult;
  /** The applied rate of the selected year; costs show "—" without it. */
  rate?: number;
  disabled?: boolean;
  /** The level the Estimate factors grid edits: '' is All routes, otherwise a Route ID. */
  factorRouteId: string;
  onUseLayover: (serviceDayId: string, layoverFraction: number) => void;
}) {
  const [solveFor, setSolveFor] = useState<CycleSolveFor>('vehicles');
  const [roundVehicles, setRoundVehicles] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({});

  const rows: Row[] = result.dailyRows.flatMap((day) => (day.impliedService ?? []).map((route): Row => {
    const key = `${day.serviceDayId}:${route.routeId}`;
    const startLayover = route.layoverSource !== undefined || route.layoverFraction !== undefined ? route.layoverFraction : day.factors.layoverFraction;
    const schedule = scheduleValues(route, startLayover);
    const typed = overrides[key] ?? {};
    const text: Record<Field, string> = {
      run: typed.run ?? fixed(schedule.run, 1),
      layover: typed.layover ?? (schedule.layover === undefined ? '' : String(Number((schedule.layover * 100).toFixed(2)))),
      headway: typed.headway ?? (schedule.headway === undefined ? '' : fixed(schedule.headway, 1)),
      vehicles: typed.vehicles ?? (schedule.vehicles === undefined ? '' : String(schedule.vehicles)),
    };
    const layoverPercent = parse(text.layover);
    const solved = solveCycle({
      runningMinutes: parse(text.run) ?? Number.NaN,
      layoverFraction: layoverPercent === undefined ? undefined : layoverPercent / 100,
      headwayMinutes: parse(text.headway),
      vehicles: parse(text.vehicles),
    }, solveFor, roundVehicles);
    const revenue = calculatorRevenueHours(route.runningHours, schedule.run, solved);
    return {
      key, serviceDayId: day.serviceDayId, routeId: route.routeId, dayName: day.serviceDayName, routeName: route.routeName, annualServiceDays: day.annualServiceDays,
      text, result: solved, revenue, savedLayover: startLayover, routeOwnLayover: isRouteSource(route.layoverSource),
      annualCost: revenue === undefined || rate === undefined ? undefined : revenue * rate * day.annualServiceDays,
    };
  }));
  if (!rows.length) return null;

  const showRoute = new Set(rows.map((row) => row.key.split(':')[1])).size > 1;
  const solvedLayover = solveFor === 'layover' || (solveFor === 'vehicles' && roundVehicles);
  const edit = (key: string, field: Field, value: string) => setOverrides((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  /** A value that was solved becomes a typed value when the solved field changes, so changing what is solved never loses it. */
  function changeSolveFor(next: string) {
    const frozen: Overrides = {};
    for (const row of rows) {
      const { layoverFraction, headwayMinutes, vehicles } = row.result;
      frozen[row.key] = {
        ...overrides[row.key],
        ...(layoverFraction !== undefined ? { layover: String(Number((layoverFraction * 100).toFixed(2))) } : {}),
        ...(headwayMinutes !== undefined ? { headway: headwayMinutes.toFixed(1) } : {}),
        ...(vehicles !== undefined ? { vehicles: String(solveFor === 'vehicles' && !roundVehicles ? Math.ceil(vehicles - 1e-9) : Number(vehicles.toFixed(2))) } : {}),
      };
    }
    setOverrides(frozen);
    setSolveFor(next as CycleSolveFor);
  }
  const allCosts = rows.every((row) => row.annualCost !== undefined);
  const total = allCosts ? rows.reduce((sum, row) => sum + row.annualCost!, 0) : undefined;
  const cell = (row: Row, field: Field, label: string, solved: boolean, value: string) => solved
    ? <output className="cycle-solved" aria-label={`${row.dayName} ${label}`}>{value}</output>
    : <input className="cycle-input" type="text" inputMode="decimal" aria-label={`${row.dayName}${row.routeName && showRoute ? ` ${row.routeName}` : ''} ${label}`} value={row.text[field]} disabled={disabled} onChange={(event) => edit(row.key, field, event.target.value)} />;

  return <>
    <div className="cycle-controls">
      <span className="cycle-controls__label" aria-hidden="true">Solve for</span>
      <SegmentedControl label="Solve for" options={SOLVE_OPTIONS} value={solveFor} disabled={disabled} onChange={changeSolveFor} />
      {solveFor === 'vehicles' && <label className="cycle-round"><input type="checkbox" checked={roundVehicles} disabled={disabled} onChange={(event) => setRoundVehicles(event.target.checked)} />Whole vehicles</label>}
      {Object.keys(overrides).length > 0 && <button type="button" className="cycle-reset" disabled={disabled} onClick={() => setOverrides({})}>Reset to schedule</button>}
    </div>
    <div className="table-scroll data-grid cycle-table"><table>
      <thead><tr>
        <th scope="col">Service day</th>{showRoute && <th scope="col">Route</th>}
        <th scope="col">Cycle running, mean (min)</th><th scope="col">Layover %</th><th scope="col">Cycle with layover (min)</th>
        <th scope="col">Headway, median (min)</th><th scope="col">Vehicles</th><th scope="col">Revenue (h/day)</th><th scope="col">Annual cost</th>
        <th scope="col"><span className="visually-hidden">Use layover</span></th>
      </tr></thead>
      <tbody>{rows.map((row) => {
        const layover = row.result.layoverFraction;
        const changed = layover !== undefined && (row.savedLayover === undefined || Math.abs(layover - row.savedLayover) > 1e-9);
        // Decision 0077: Use writes only to the level the Estimate factors grid shows.
        const otherRoute = factorRouteId !== '' && row.routeId !== factorRouteId;
        const blockedReason = otherRoute ? `This row belongs to another route. Choose ${row.routeName ?? 'it'} in the Route menu to change it.`
          : factorRouteId === '' && row.routeOwnLayover ? 'This route has its own layover %. Choose it in the Route menu to change it.' : undefined;
        const useable = changed && !blockedReason;
        const percent = layover === undefined ? MISSING : (layover * 100).toFixed(2);
        return <tr key={row.key} className={otherRoute ? 'cycle-row--other' : undefined}>
          <th scope="row">{row.dayName}</th>{showRoute && <td>{row.routeName ?? MISSING}</td>}
          <td>{cell(row, 'run', 'cycle running minutes', false, '')}</td>
          <td><span className="cycle-layover">{cell(row, 'layover', 'layover percent', solvedLayover, percent)}<span className="cycle-source">{row.routeOwnLayover ? 'route' : 'trip profile'}</span></span></td>
          <td>{fixed(row.result.cycleMinutes, 1)}</td>
          <td>{cell(row, 'headway', 'headway minutes', solveFor === 'headway', fixed(row.result.headwayMinutes, 1))}</td>
          <td>{cell(row, 'vehicles', 'vehicles', solveFor === 'vehicles', vehiclesText(row.result.vehicles))}</td>
          <td>{fixed(row.revenue, 2)}</td>
          <td>{row.annualCost === undefined ? MISSING : formatMoney(row.annualCost)}</td>
          <td><button type="button" className="cycle-use" disabled={disabled || !useable} title={blockedReason} aria-label={`Use ${percent}% layover for ${row.dayName}`} onClick={() => layover !== undefined && onUseLayover(row.serviceDayId, layover)}>Use</button></td>
        </tr>;
      })}</tbody>
      {total !== undefined && <tfoot><tr><th scope="row">Total</th>{showRoute && <td />}<td /><td /><td /><td /><td /><td /><td>{formatMoney(total)}</td><td /></tr></tfoot>}
    </table></div>
    {rows.some((row) => row.result.problem === 'cycleShorterThanRunning') && <p className="field-error" role="alert">The cycle with layover is shorter than the running cycle.</p>}
  </>;
}
