import { Fragment, type ReactNode, useId, useState } from 'react';
import { formatServiceTime } from '../../domain/time';
import type { ScheduledPoint } from '../../domain/types';
import { shiftText, type ProblemAction, type TripProblemExplanation } from '../shared/messages';

/**
 * The review table shared by Regenerate and Change pattern (Decisions 0071 and 0072, R5; mock-up in `docs/implementation/trip-review/`).
 * A row shows a status chip, the kept time, the change to the start, end, run time and following layover, and an Action select whose
 * options come from `explainTripProblem`. The ⓘ button opens the row's "Why?" panel as a disclosure below the row.
 */
export type ReviewRowStatus = 'ready' | 'attention' | 'warning' | 'skipped';
export interface ReviewRowView {
  tripId: string;
  /** Pattern short name and start time, and the new pattern for a pattern change. Absent in the single-trip dialog. */
  trip?: { patternChip: string; startTime?: number; newPatternChip?: string; blockLabel?: string };
  status: ReviewRowStatus;
  explanation?: TripProblemExplanation;
  /** The kept-stop control and time. */
  kept: ReactNode;
  oldTimes: ScheduledPoint[];
  newTimes?: ScheduledPoint[];
  layover?: { current?: number; revised?: number };
  actions: ProblemAction[];
  /** The selected action id, or '' for "Choose a fix…". */
  actionValue: string;
}

const clock = (value: number) => formatServiceTime(value, value % 60 !== 0);
const runTime = (times: ScheduledPoint[]) => times.length > 1 ? times.at(-1)!.time - times[0].time : undefined;
const duration = (seconds: number) => `${seconds < 0 ? '−' : ''}${Math.floor(Math.abs(seconds) / 3600)}:${String(Math.floor(Math.abs(seconds) % 3600 / 60)).padStart(2, '0')}`;

function ChangeCell({ current, next, format, unchanged = 'no change' }: { current?: number; next?: number; format: (value: number) => string; unchanged?: string }) {
  if (current === undefined && next === undefined) return <td className="num">—</td>;
  const shown = next ?? current!;
  const title = current !== undefined && next !== undefined ? `${format(current)} → ${format(next)}` : undefined;
  const difference = current !== undefined && next !== undefined ? next - current : undefined;
  const moved = difference !== undefined && difference !== 0;
  return <td className="num" title={title}>{format(shown)}<span className={moved ? 'trip-review-delta trip-review-delta--moved' : 'trip-review-delta'}>{difference === undefined ? '—' : moved ? `${difference > 0 ? '+' : '−'}${shiftText(difference).replace(/ (earlier|later)$/, '')}` : unchanged}</span></td>;
}

function Timeline({ timeline }: { timeline: NonNullable<TripProblemExplanation['timeline']> }) {
  const points = [timeline.before, timeline.kept, timeline.after].filter((value): value is number => value !== undefined);
  const low = Math.min(...points) - 120;
  const high = Math.max(...points) + 120;
  const at = (value: number) => `${((value - low) / (high - low)) * 100}%`;
  return <div className="trip-review-timeline" aria-hidden="true">Times a trip can reach {timeline.stopName}
    <div className="trip-review-timeline__bar">
      {timeline.before !== undefined && <span className="trip-review-timeline__reach" style={{ left: 0, width: at(timeline.before) }} />}
      {timeline.after !== undefined && <span className="trip-review-timeline__reach" style={{ left: at(timeline.after), right: 0 }} />}
      <span className="trip-review-timeline__mark" style={{ left: at(timeline.kept) }} />
    </div>
    <div className="trip-review-timeline__labels">
      {timeline.before !== undefined && <span style={{ left: at(timeline.before) }}>{clock(timeline.before)}</span>}
      <span className="trip-review-timeline__kept" style={{ left: at(timeline.kept) }}>{clock(timeline.kept)}</span>
      {timeline.after !== undefined && <span style={{ left: at(timeline.after) }}>{clock(timeline.after)}</span>}
    </div>
  </div>;
}

function WhyPanel({ id, explanation, onOpenRuntimes }: { id: string; explanation: TripProblemExplanation; onOpenRuntimes?: () => void }) {
  return <div id={id} className="trip-review-why" role="region" aria-label={explanation.headline}>
    <h3>{explanation.headline}</h3>
    {explanation.causes.map((line) => <p key={line}>{line}</p>)}
    {explanation.timeline && !explanation.timeline.overlap && <Timeline timeline={explanation.timeline} />}
    {explanation.fixes.length > 0 && <><p><strong>{explanation.actions.length ? 'To fix it, choose one in the Action list:' : 'What you can do:'}</strong></p><ul>{explanation.fixes.map((line) => <li key={line}>{line}</li>)}</ul></>}
    {explanation.hint && <p className="trip-review-why__hint">{explanation.hint}{onOpenRuntimes && <> <button type="button" className="link-button" onClick={onOpenRuntimes}>Open runtimes</button></>}</p>}
  </div>;
}

const CHIP_CLASS: Record<ReviewRowStatus, string> = { ready: 'trip-review-chip--ok', attention: 'trip-review-chip--error', warning: 'trip-review-chip--warn', skipped: 'trip-review-chip--skip' };

export function TripReviewTable({ rows, busy, runLabel, onAction, onOpenRuntimes }: { rows: ReviewRowView[]; busy: boolean; /** "Regenerate" or "Change pattern". */ runLabel: string; onAction: (tripId: string, actionId: string) => void; onOpenRuntimes?: () => void }) {
  const baseId = useId();
  const [openWhy, setOpenWhy] = useState<string>();
  const showTrip = rows.some((row) => row.trip);
  const columnCount = showTrip ? 8 : 7;
  return <div className="preview-times trip-review-table"><table>
    <thead><tr>{showTrip && <th scope="col">Trip</th>}<th scope="col">Status</th><th scope="col">Kept time</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Run time</th><th scope="col">Layover after</th><th scope="col">Action</th></tr></thead>
    <tbody>{rows.map((row) => {
      const panelId = `${baseId}-why-${row.tripId}`;
      const open = openWhy === row.tripId && Boolean(row.explanation);
      const startLabel = row.trip?.startTime === undefined ? 'trip' : `trip at ${clock(row.trip.startTime)}`;
      const chipText = row.explanation?.chip ?? (row.status === 'skipped' ? 'Skipped' : 'Ready');
      return <Fragment key={row.tripId}>
        <tr className={`trip-review-row trip-review-row--${row.status}`}>
          {showTrip && <td className="trip-review-trip">{row.trip && <><span className="trip-review-pattern">{row.trip.patternChip}</span>{row.trip.startTime === undefined ? '' : clock(row.trip.startTime)}{row.trip.newPatternChip && <> → <span className="trip-review-pattern">{row.trip.newPatternChip}</span></>}{row.trip.blockLabel && <small>{row.trip.blockLabel}</small>}</>}</td>}
          <td className="trip-review-status"><span className={`trip-review-chip ${CHIP_CLASS[row.status]}`}>{chipText}</span>{row.explanation && <button type="button" className="trip-review-why-button" aria-expanded={open} aria-controls={open ? panelId : undefined} aria-label={`Why: ${row.explanation.chip}, ${startLabel}`} title="Why?" onClick={() => setOpenWhy(open ? undefined : row.tripId)}>i</button>}</td>
          <td className="trip-review-kept">{row.kept}</td>
          <ChangeCell current={row.oldTimes[0]?.time} next={row.newTimes?.[0]?.time} format={clock} unchanged={row.status === 'skipped' ? 'unchanged' : 'no change'} />
          <ChangeCell current={row.oldTimes.at(-1)?.time} next={row.newTimes?.at(-1)?.time} format={clock} unchanged={row.status === 'skipped' ? 'unchanged' : 'no change'} />
          <ChangeCell current={runTime(row.oldTimes)} next={row.newTimes ? runTime(row.newTimes) : undefined} format={duration} />
          <ChangeCell current={row.layover?.current} next={row.layover?.revised} format={duration} />
          <td className="trip-review-action"><select aria-label={`Action for ${startLabel}`} className={row.status === 'attention' && !row.actionValue ? 'trip-review-action--attention' : undefined} value={row.actionValue} disabled={busy} onChange={(event) => onAction(row.tripId, event.target.value)}>
            {row.status === 'attention' && <option value="" disabled>Choose a fix…</option>}
            {row.actions.map((action) => <option key={action.id} value={action.id}>{action.id === 'run' ? runLabel : action.label}{action.cost ? ` — ${action.cost}` : ''}</option>)}
          </select></td>
        </tr>
        {open && row.explanation && <tr className="trip-review-why-row"><td colSpan={columnCount}><WhyPanel id={panelId} explanation={row.explanation} onOpenRuntimes={onOpenRuntimes} /></td></tr>}
      </Fragment>;
    })}</tbody>
  </table></div>;
}

/** The header line: "48 trips · 45 ready · 3 need attention", with the bulk Skip button when it applies. */
export function TripReviewSummary({ rows, busy, onSkipAttention, allowSkip }: { rows: ReviewRowView[]; busy: boolean; onSkipAttention: () => void; allowSkip: boolean }) {
  const ready = rows.filter((row) => row.status === 'ready' || row.status === 'warning').length;
  const attention = rows.filter((row) => row.status === 'attention').length;
  const skipped = rows.filter((row) => row.status === 'skipped').length;
  return <div className="trip-review-summary" role="status">
    <span><strong>{rows.length} {rows.length === 1 ? 'trip' : 'trips'}</strong> · <span className="trip-review-count--ok">{ready} ready</span>{attention > 0 && <> · <span className="trip-review-count--attention">{attention} {attention === 1 ? 'needs' : 'need'} attention</span></>}{skipped > 0 && <> · {skipped} skipped</>}</span>
    {allowSkip && attention > 0 && <button type="button" disabled={busy} onClick={onSkipAttention}>{attention === 1 ? 'Skip the 1 that needs attention' : `Skip all ${attention} that need attention`}</button>}
  </div>;
}

/** Ready rows that the primary button will change, and whether the button is enabled. */
export function reviewButtonState(rows: ReviewRowView[]): { count: number; enabled: boolean } {
  const count = rows.filter((row) => row.status === 'ready' || row.status === 'warning').length;
  return { count, enabled: count > 0 && !rows.some((row) => row.status === 'attention') };
}
