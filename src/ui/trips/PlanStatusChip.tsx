import { useEffect, useId, useRef, useState } from 'react';
import { type PlanComparisonResult } from '../../application/plannedFrequencyService';
import { type PeriodComparison, type PlanComparison } from '../../domain/plannedFrequencyComparison';
import { formatServiceTime } from '../../domain/time';
import { type Node, type PlannedPeriod } from '../../domain/types';

/** A direction with no trips at all has nothing to compare yet; it is shown as such and does not count as a difference. */
export const hasBuiltTrips = (comparison: PlanComparison): boolean => comparison.periods.some((period) => period.builtTrips > 0) || comparison.outsidePlan > 0 || comparison.notMeasured > 0;

/** The number of periods that differ from the plan, over the directions that have trips. */
export function differingPeriodCount(result: PlanComparisonResult): number {
  return result.directions.filter((item) => hasBuiltTrips(item.comparison)).reduce((sum, item) => sum + item.comparison.periods.filter((period) => period.status !== 'matches').length, 0);
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const minutes = (seconds: number) => Math.max(1, Math.round(Math.abs(seconds) / 60));

/** Plain-language reasons a period differs ("1 extra trip", "starts 10 min late", "3 gaps off"). */
export function describePeriod(period: PeriodComparison, planned: PlannedPeriod | undefined): string[] {
  if (period.status === 'matches') return [];
  if (period.status === 'noTrips') return ['no trips'];
  const out: string[] = [];
  for (const reason of period.reasons) {
    if (reason === 'extraTrips') out.push(plural(period.builtTrips - period.plannedTrips, 'extra trip'));
    else if (reason === 'missingTrips') out.push(`${plural(period.plannedTrips - period.builtTrips, 'trip')} missing`);
    else if (reason === 'gapsOff') out.push(plural(period.gaps.filter((gap) => !gap.withinTolerance).length, 'gap') + ' off');
    else if (reason === 'startEdge' && planned && period.firstTime !== undefined) out.push(`starts ${minutes(period.firstTime - planned.startTime)} min ${period.firstTime > planned.startTime ? 'late' : 'early'}`);
    else if (reason === 'endEdge' && planned && period.lastTime !== undefined) {
      const lastSlot = planned.startTime + Math.floor((planned.endTime - 1 - planned.startTime) / planned.headwaySeconds) * planned.headwaySeconds;
      out.push(`ends ${minutes(period.lastTime - lastSlot)} min ${period.lastTime > lastSlot ? 'late' : 'early'}`);
    }
  }
  return out;
}

/** Minutes, with seconds only when they are not zero: 15 or 7:30. */
export const minutesText = (seconds: number) => (seconds % 60 === 0 ? String(seconds / 60) : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);

/**
 * "Plan: matches" or "Plan: 2 periods differ" in the Trips header (Decision 0058 item 6). Hidden when the day has no plan. A button that
 * opens a table per direction. Never a banner and never a validation finding.
 */
export function PlanStatusChip({ result, nodes }: { result?: PlanComparisonResult; nodes: Node[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); } };
    const onPointer = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Element)) setOpen(false); };
    document.addEventListener('keydown', onKey, true); document.addEventListener('pointerdown', onPointer);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onPointer); };
  }, [open]);
  if (!result?.plan) return null;
  const plan = result.plan;
  const differing = differingPeriodCount(result);
  const anyBuilt = result.directions.some((item) => hasBuiltTrips(item.comparison));
  const label = !anyBuilt ? 'Plan: no trips yet' : differing === 0 ? 'Plan: matches' : `Plan: ${plural(differing, 'period')} differ${differing === 1 ? 's' : ''}`;
  const nodeName = (id?: string) => nodes.find((node) => node.id === id)?.name ?? 'No stop available';
  return <div className="plan-chip" ref={root}>
    <button ref={button} type="button" className={differing > 0 ? 'chip chip--button plan-chip__button plan-chip__button--differs' : 'chip chip--button plan-chip__button'} aria-expanded={open} aria-controls={open ? panelId : undefined} title="Compare the trips with the planned frequencies" onClick={() => setOpen((current) => !current)}>{label}</button>
    {open && <div className="plan-chip__panel" id={panelId} role="dialog" aria-label="Planned frequencies compared with built trips">
      {result.directions.map((item) => <section key={item.directionId} className="plan-chip__direction">
        <h3>{item.directionName}</h3>
        {item.comparison.measureNodeId !== undefined && <p className="plan-chip__node">Measured at {nodeName(item.comparison.measureNodeId)}{item.comparison.measureNodeFellBack ? ' (the saved stop is no longer served, so the default is used)' : ''}</p>}
        {hasBuiltTrips(item.comparison) ? <table>
          <thead><tr><th scope="col">Period</th><th scope="col">Planned</th><th scope="col">Built</th><th scope="col">Status</th></tr></thead>
          <tbody>{item.comparison.periods.map((period) => {
            const planned = plan.periods.find((candidate) => candidate.id === period.periodId);
            const reasons = describePeriod(period, planned);
            return <tr key={period.periodId}>
              <td>{planned ? `${formatServiceTime(planned.startTime)}–${formatServiceTime(planned.endTime)} · every ${minutesText(planned.headwaySeconds)}` : ''}</td>
              <td>{plural(period.plannedTrips, 'trip')}</td>
              <td>{plural(period.builtTrips, 'trip')}</td>
              <td className={period.status === 'matches' ? undefined : 'plan-chip__differs'}>{period.status === 'matches' ? 'Matches' : reasons.join(', ')}</td>
            </tr>;
          })}</tbody>
        </table> : <p>No trips built in this direction.</p>}
        {(item.comparison.outsidePlan > 0 || item.comparison.notMeasured > 0) && <p className="plan-chip__counts">{item.comparison.outsidePlan > 0 ? `${plural(item.comparison.outsidePlan, 'trip')} outside the plan. ` : ''}{item.comparison.notMeasured > 0 ? `${plural(item.comparison.notMeasured, 'trip')} not measured (the pattern does not stop there).` : ''}</p>}
      </section>)}
    </div>}
  </div>;
}
