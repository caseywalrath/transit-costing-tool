import { useEffect, useId } from 'react';
import { formatEstimateFactorPercent, parseEstimateFactorPercent } from '../../domain/estimatedCosting';
import type { CostingEstimateFactors, CostingFactorPair, ServiceDayDefinition } from '../../domain/types';
import { useGridNavigation } from '../shared/useGridNavigation';

type FactorKey = keyof CostingFactorPair;
const ROWS: Array<{ key: FactorKey; label: string; name: string }> = [
  { key: 'layoverFraction', label: 'Layover %', name: 'layover' },
  { key: 'deadheadFraction', label: 'Deadhead %', name: 'deadhead' },
];

/** The pair of factors in column `c`: 0 is All days, then one column per service day. */
function pairOf(factors: CostingEstimateFactors | undefined, days: ServiceDayDefinition[], c: number): CostingFactorPair | undefined {
  return c === 0 ? factors?.allDays : factors?.serviceDays.find((row) => row.serviceDayId === days[c - 1].id);
}

/** A copy of `factors` with one factor of one column set or cleared. Rows keep only the factors that have a value. */
export function setEstimateFactor(factors: CostingEstimateFactors | undefined, serviceDayId: string | undefined, key: FactorKey, fraction: number | undefined): CostingEstimateFactors {
  const apply = (pair: CostingFactorPair | undefined): CostingFactorPair => {
    const next: CostingFactorPair = { ...pair };
    if (fraction === undefined) delete next[key]; else next[key] = fraction;
    return next;
  };
  const current = factors ?? { allDays: {}, serviceDays: [] };
  if (serviceDayId === undefined) return { ...current, allDays: apply(current.allDays) };
  const exists = current.serviceDays.some((row) => row.serviceDayId === serviceDayId);
  const rows = exists
    ? current.serviceDays.map((row) => row.serviceDayId === serviceDayId ? { serviceDayId, ...apply(row) } : row)
    : [...current.serviceDays, { serviceDayId, ...apply(undefined) }];
  return { ...current, serviceDays: rows };
}

/**
 * The Estimate factors spreadsheet grid (Decision 0051): All days, then each service day, for Layover % and Deadhead %. It works like the
 * Runtimes grid. A blank day cell shows the All days value it falls back to. A refused entry keeps the cell open with the grid message,
 * and `onInvalidChange` tells the screen, which disables Save factors meanwhile.
 */
export function EstimateFactorsGrid({ days, factors, savedFactors, disabled, onChange, onInvalidChange }: {
  days: ServiceDayDefinition[];
  factors: CostingEstimateFactors | undefined;
  savedFactors: CostingEstimateFactors | undefined;
  disabled: boolean;
  onChange: (next: CostingEstimateFactors) => void;
  onInvalidChange: (invalid: boolean) => void;
}) {
  const messageId = useId();
  const columnName = (c: number) => c === 0 ? 'All days' : days[c - 1].name;
  const cellLabel = (r: number, c: number) => `${columnName(c)} ${ROWS[r].name} percent`;
  const cellText = (r: number, c: number) => formatEstimateFactorPercent(pairOf(factors, days, c)?.[ROWS[r].key]);
  const grid = useGridNavigation({
    rowCount: ROWS.length, colCount: days.length + 1, isEditable: () => !disabled, cellText,
    onCommit: (r, c, text) => {
      const parsed = parseEstimateFactorPercent(text);
      if (parsed.error) return parsed.error;
      onChange(setEstimateFactor(factors, c === 0 ? undefined : days[c - 1].id, ROWS[r].key, parsed.fraction));
      return undefined;
    },
  });
  // A refused entry keeps its cell open with the message; while it does, Save factors is disabled.
  useEffect(() => onInvalidChange(Boolean(grid.message)), [grid.message, onInvalidChange]);
  return <>
    <div className="table-scroll data-grid costing-factor-grid"><table className="grid-table" role="grid" aria-label="Estimate factors">
      <thead><tr><th scope="col"><span className="visually-hidden">Factor</span></th><th scope="col" className="costing-factor-fallback">All days</th>{days.map((day) => <th scope="col" key={day.id}>{day.name}</th>)}</tr></thead>
      <tbody>{ROWS.map((row, r) => <tr key={row.key} {...grid.rowProps(r)}>
        <th scope="row">{row.label}</th>
        {Array.from({ length: days.length + 1 }, (_, c) => {
          const value = pairOf(factors, days, c)?.[row.key];
          const edited = value !== pairOf(savedFactors, days, c)?.[row.key];
          const editing = grid.editing?.r === r && grid.editing.c === c;
          const fallback = c > 0 && value === undefined ? factors?.allDays[row.key] : undefined;
          const className = ['grid-cell', edited && 'grid-cell--edited', c === 0 && 'costing-factor-fallback'].filter(Boolean).join(' ');
          return <td key={c} {...grid.cellProps(r, c)} className={className} data-cell={cellLabel(r, c)}>
            {editing
              ? <input {...grid.inputProps} className="grid-cell__input" inputMode="decimal" aria-label={cellLabel(r, c)} aria-describedby={grid.message ? messageId : undefined} />
              : value !== undefined ? <span>{formatEstimateFactorPercent(value)}</span>
                : fallback !== undefined ? <span className="grid-cell__placeholder">{formatEstimateFactorPercent(fallback)}</span> : <span />}
          </td>;
        })}
      </tr>)}</tbody>
    </table></div>
    <p id={messageId} className="grid-message" role="status" aria-live="polite">{grid.message}</p>
    <p className="costing-factor-hint">Layover % is of revenue hours; deadhead % is of platform hours, as on the Blocking summary.</p>
  </>;
}
