import { useState } from 'react';
import type { CostingResult } from '../../application/ports';
import { MISSING } from '../format';
import { readStoredRecord } from '../preferences';
import { annualHours, BREAKDOWN_COLUMNS, dailyHours, dayBreakdownRows, money, routeBreakdownRows, type BreakdownGrouping, type BreakdownRow } from './costBreakdownText';

/** Decision 0077 item 1.5: which Route rows are expanded, per Scenario, on this device. Never in a backup. */
export const ROUTE_EXPANDED_PREFERENCE_KEY = 'transit-costing-tool.costing-route-expanded.v1';
/** Decision 0078 item 3: which service-day rows are expanded in the Service day grouping, per Scenario, on this device. */
export const DAY_EXPANDED_PREFERENCE_KEY = 'transit-costing-tool.costing-day-expanded.v1';
/** Decision 0078 item 2: the Cost breakdown grouping, per Scenario, on this device. */
export const BREAKDOWN_GROUPING_PREFERENCE_KEY = 'transit-costing-tool.costing-breakdown-grouping.v1';

function storedExpanded(storageKey: string, scenarioId: string): string[] | undefined {
  const value = readStoredRecord(storageKey)[scenarioId];
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}
function remember(storageKey: string, scenarioId: string, value: unknown) {
  try { localStorage.setItem(storageKey, JSON.stringify({ ...readStoredRecord(storageKey), [scenarioId]: value })); } catch { /* UI preference only. */ }
}

/** The Cost breakdown grouping of one Scenario (Decision 0078 item 2). Route is the default. */
export function useBreakdownGrouping(scenarioId: string): [BreakdownGrouping, (grouping: BreakdownGrouping) => void] {
  const read = (id: string): BreakdownGrouping => readStoredRecord(BREAKDOWN_GROUPING_PREFERENCE_KEY)[id] === 'day' ? 'day' : 'route';
  const [stored, setStored] = useState(() => ({ scenarioId, grouping: read(scenarioId) }));
  const grouping = stored.scenarioId === scenarioId ? stored.grouping : read(scenarioId);
  return [grouping, (next) => { setStored({ scenarioId, grouping: next }); remember(BREAKDOWN_GROUPING_PREFERENCE_KEY, scenarioId, next); }];
}

/**
 * The expanded group rows of one Scenario, stored under `storageKey`. Until the planner expands or collapses a row, a table with exactly
 * one group row shows it expanded (Decision 0077 item 1.4).
 */
export function useRouteExpansion(scenarioId: string, routeKeys: string[], storageKey = ROUTE_EXPANDED_PREFERENCE_KEY) {
  const [stored, setStored] = useState<{ scenarioId: string; storageKey: string; keys: string[] | undefined }>(() => ({ scenarioId, storageKey, keys: storedExpanded(storageKey, scenarioId) }));
  const keys = stored.scenarioId === scenarioId && stored.storageKey === storageKey ? stored.keys : storedExpanded(storageKey, scenarioId);
  const expanded = new Set(keys ?? (routeKeys.length === 1 ? routeKeys : []));
  const write = (next: string[]) => { setStored({ scenarioId, storageKey, keys: next }); remember(storageKey, scenarioId, next); };
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

/** The blocked basis's count of a Route's Trips that are in no Block (Decision 0077 item 3.3). */
function UnassignedNote({ count: trips, scope }: { count: number; scope: string }) {
  const text = `${plural(trips, 'trip')} of this route${scope} ${trips === 1 ? 'is' : 'are'} in no block and not costed`;
  return <span className="costing-route-note" title={text}><span aria-hidden="true">{trips} unassigned</span><span className="visually-hidden">, {text}</span></span>;
}

type Group = { key: string; name: string; row: BreakdownRow; withDaily: boolean; unassignedTrips?: number; children: Array<BreakdownRow & { unassignedTrips?: number }> };

/**
 * The Cost breakdown by Route (Decision 0077 item 1) or by service day (Decision 0078). Each group row expands in place to its child rows.
 * The table has a fixed layout and the toggle sits in a fixed-width slot of every group row, so expanding, collapsing or regrouping never
 * moves a column.
 */
export function RouteCostTable({ result, selectedYear, totalDays, expansion, menuTarget, grouping = 'route' }: { result: CostingResult; selectedYear: number; totalDays: number; expansion: Expansion; menuTarget: ContextTarget; grouping?: BreakdownGrouping }) {
  const byDay = grouping === 'day';
  const { total } = routeBreakdownRows(result, selectedYear);
  const groups: Group[] = byDay
    ? dayBreakdownRows(result, selectedYear).days.map((day) => ({ key: day.key, name: day.name, row: day, withDaily: true, children: day.routeRows }))
    : routeBreakdownRows(result, selectedYear).routes.map((route) => ({ key: route.key, name: route.name, row: route, withDaily: false, unassignedTrips: route.unassignedTrips, children: route.dayRows }));
  return <div className="table-scroll data-grid costing-results-table costing-route-table" {...menuTarget}><table>
    <colgroup><col className="costing-col-day" /><col className="costing-col-count" /><col className="costing-col-count" /><col className="costing-col-count" />{Array.from({ length: 3 }, (_, index) => <col key={index} className="costing-col-hours" />)}<col className="costing-col-money" /><col className="costing-col-hours" /><col className="costing-col-hours" /><col className="costing-col-total" /></colgroup>
    <thead><tr><th scope="col">{byDay ? 'Service day' : 'Route'}</th>{BREAKDOWN_COLUMNS.slice(1).map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead>
    {groups.map((group) => {
      const open = expansion.isExpanded(group.key);
      const childId = `costing-${byDay ? 'day-routes' : 'route-days'}-${group.key}`;
      return <tbody key={group.key} className={open ? 'costing-route-group is-open' : 'costing-route-group'}>
        <tr className={byDay ? 'costing-route-row costing-day-group-row' : 'costing-route-row'}>
          <th scope="row">
            <span className="costing-route-cell">
              <button type="button" className="costing-route-toggle" aria-expanded={open} aria-controls={open && group.children.length ? group.children.map((row) => `${childId}-${row.key}`).join(' ') : undefined}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${group.name}`} disabled={!group.children.length} onClick={() => expansion.toggle(group.key)}>
                <span aria-hidden="true">{open ? '▾' : '▸'}</span>
              </button>
              <span className="costing-route-name" title={group.name}>{group.name}</span>
              {group.unassignedTrips ? <UnassignedNote count={group.unassignedTrips} scope="" /> : null}
            </span>
          </th>
          {valueCells(group.row, group.withDaily)}
        </tr>
        {open && group.children.map((row) => <tr key={row.key} id={`${childId}-${row.key}`} className={byDay ? 'costing-route-day-row costing-day-route-row' : 'costing-route-day-row'}>
          <th scope="row"><span className="costing-route-cell costing-route-day"><span className="costing-route-name" title={row.name}>{row.name}</span>{row.unassignedTrips ? <UnassignedNote count={row.unassignedTrips} scope=" on this day" /> : null}</span></th>
          {valueCells(row, true)}
        </tr>)}
      </tbody>;
    })}
    <tfoot><tr><th scope="row">Total</th><td>{totalDays}</td><td>{count(total.trips)}</td><td>{count(total.blocks)}</td><td></td><td></td><td></td><td></td><td>{annual(total.annualRevenue)}</td><td>{annual(total.annualPlatform)}</td><td>{cash(total.annualCost)}</td></tr></tfoot>
  </table></div>;
}
