import { useState } from 'react';
import type { CostingResult } from '../../application/ports';
import { MISSING } from '../format';
import { readStoredRecord } from '../preferences';
import { annualHours, BREAKDOWN_COLUMNS, dailyHours, money, routeBreakdownRows, type BreakdownRow } from './costBreakdownText';

/** Decision 0077 item 1.5: which Route rows are expanded, per Scenario, on this device. Never in a backup. */
export const ROUTE_EXPANDED_PREFERENCE_KEY = 'transit-costing-tool.costing-route-expanded.v1';

function storedExpanded(scenarioId: string): string[] | undefined {
  const value = readStoredRecord(ROUTE_EXPANDED_PREFERENCE_KEY)[scenarioId];
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}
function rememberExpanded(scenarioId: string, keys: string[]) {
  try { localStorage.setItem(ROUTE_EXPANDED_PREFERENCE_KEY, JSON.stringify({ ...readStoredRecord(ROUTE_EXPANDED_PREFERENCE_KEY), [scenarioId]: keys })); } catch { /* UI preference only. */ }
}

/**
 * The expanded Route rows of one Scenario. Until the planner expands or collapses a row, a table with exactly one Route row shows it
 * expanded (Decision 0077 item 1.4).
 */
export function useRouteExpansion(scenarioId: string, routeKeys: string[]) {
  const [stored, setStored] = useState<{ scenarioId: string; keys: string[] | undefined }>(() => ({ scenarioId, keys: storedExpanded(scenarioId) }));
  const keys = stored.scenarioId === scenarioId ? stored.keys : storedExpanded(scenarioId);
  const expanded = new Set(keys ?? (routeKeys.length === 1 ? routeKeys : []));
  const write = (next: string[]) => { setStored({ scenarioId, keys: next }); rememberExpanded(scenarioId, next); };
  return {
    isExpanded: (key: string) => expanded.has(key),
    toggle: (key: string) => write(expanded.has(key) ? [...expanded].filter((item) => item !== key) : [...expanded, key]),
    expandAll: () => write([...new Set([...expanded, ...routeKeys])]),
    collapseAll: () => write([]),
    allExpanded: routeKeys.every((key) => expanded.has(key)),
    noneExpanded: routeKeys.every((key) => !expanded.has(key)),
  };
}

type ContextTarget = Record<string, unknown>;
type Expansion = ReturnType<typeof useRouteExpansion>;

const count = (value: number | undefined) => value === undefined ? MISSING : String(value);
const daily = (value: number | undefined) => value === undefined ? MISSING : dailyHours(value);
const annual = (value: number | undefined) => value === undefined ? MISSING : annualHours(value);
const cash = (value: number | undefined) => value === undefined ? MISSING : money(value);
const plural = (value: number, singular: string) => `${value} ${singular}${value === 1 ? '' : 's'}`;

/** The ten value cells after the first, in `BREAKDOWN_COLUMNS` order. A Route or Total row leaves the daily columns blank. */
function valueCells(row: BreakdownRow, withDaily: boolean) {
  return <>
    <td>{row.days}</td><td>{count(row.trips)}</td><td>{count(row.blocks)}</td>
    {withDaily ? <><td>{daily(row.running)}</td><td>{daily(row.revenue)}</td><td>{daily(row.platform)}</td><td>{cash(row.dailyCost)}</td></> : <><td /><td /><td /><td /></>}
    <td>{annual(row.annualRevenue)}</td><td>{annual(row.annualPlatform)}</td><td>{cash(row.annualCost)}</td>
  </>;
}

/**
 * The Cost breakdown by Route (Decision 0077 item 1). Each Route row expands in place to its service-day rows. The table has a fixed layout
 * and the toggle sits in a fixed-width slot of every Route row, so expanding or collapsing never moves a column.
 */
export function RouteCostTable({ result, selectedYear, totalDays, expansion, menuTarget }: { result: CostingResult; selectedYear: number; totalDays: number; expansion: Expansion; menuTarget: ContextTarget }) {
  const { routes, total } = routeBreakdownRows(result, selectedYear);
  return <div className="table-scroll data-grid costing-results-table costing-route-table" {...menuTarget}><table>
    <colgroup><col className="costing-col-day" /><col className="costing-col-count" /><col className="costing-col-count" /><col className="costing-col-count" />{Array.from({ length: 3 }, (_, index) => <col key={index} className="costing-col-hours" />)}<col className="costing-col-money" /><col className="costing-col-hours" /><col className="costing-col-hours" /><col className="costing-col-total" /></colgroup>
    <thead><tr><th scope="col">Route</th>{BREAKDOWN_COLUMNS.slice(1).map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead>
    {routes.map((route) => {
      const open = expansion.isExpanded(route.key);
      const childId = `costing-route-days-${route.key}`;
      return <tbody key={route.key} className={open ? 'costing-route-group is-open' : 'costing-route-group'}>
        <tr className="costing-route-row">
          <th scope="row">
            <span className="costing-route-cell">
              <button type="button" className="costing-route-toggle" aria-expanded={open} aria-controls={open && route.dayRows.length ? route.dayRows.map((row) => `${childId}-${row.key}`).join(' ') : undefined}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${route.name}`} disabled={!route.dayRows.length} onClick={() => expansion.toggle(route.key)}>
                <span aria-hidden="true">{open ? '▾' : '▸'}</span>
              </button>
              <span className="costing-route-name" title={route.name}>{route.name}</span>
              {route.unassignedTrips ? <span className="costing-route-note" title={`${plural(route.unassignedTrips, 'trip')} of this route ${route.unassignedTrips === 1 ? 'is' : 'are'} in no block and not costed`}>
                <span aria-hidden="true">{route.unassignedTrips} unassigned</span>
                <span className="visually-hidden">, {plural(route.unassignedTrips, 'trip')} of this route {route.unassignedTrips === 1 ? 'is' : 'are'} in no block and not costed</span>
              </span> : null}
            </span>
          </th>
          {valueCells(route, false)}
        </tr>
        {open && route.dayRows.map((row) => <tr key={row.key} id={`${childId}-${row.key}`} className="costing-route-day-row">
          <th scope="row"><span className="costing-route-day">{row.name}</span></th>
          {valueCells(row, true)}
        </tr>)}
      </tbody>;
    })}
    <tfoot><tr><th scope="row">Total</th><td>{totalDays}</td><td>{count(total.trips)}</td><td>{count(total.blocks)}</td><td></td><td></td><td></td><td></td><td>{annual(total.annualRevenue)}</td><td>{annual(total.annualPlatform)}</td><td>{cash(total.annualCost)}</td></tr></tfoot>
  </table></div>;
}
