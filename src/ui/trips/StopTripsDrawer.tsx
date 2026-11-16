import { forwardRef, Fragment, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { RouteStopValidationError, STOPS_CHANGED_ELSEWHERE, type RouteDefinitionApplication } from '../../application/routeDefinitionService';
import { stopTripsTable } from '../../application/stopTripsView';
import { DEFAULT_STOP_ROUNDING_SECONDS, normalizePlacements, validateRouteStopSet } from '../../domain/stops';
import { formatServiceTime } from '../../domain/time';
import { type Node, type PatternStopPlacement, type RouteDefinitionAggregate, type RoutePattern, type RouteStopSet, type StopTimeRoundingSeconds, type StopTimingRule, type Trip } from '../../domain/types';
import { userFacingError } from '../errorMessages';
import { SaveBar } from '../shared/bars';
import { ShiftDiscardDialog } from '../shared/dialogs';
import { SegmentedControl } from '../shared/SegmentedControl';
import { USER_FACING_VALIDATION_MESSAGES } from '../shared/messages';

export type StopTripsService = Pick<RouteDefinitionApplication, 'getRouteStopSet' | 'saveRouteStops'>;
/** The Trips workspace's handle on the drawer, for its scope-change guard (Save or Discard before leaving). */
export interface StopTripsHandle { save: () => Promise<boolean>; discard: () => void }

const TIMING_OPTIONS: Array<{ value: StopTimingRule; text: string }> = [
  { value: 'interpolate', text: 'Interpolate' },
  { value: 'previous', text: 'Previous timepoint' },
  { value: 'next', text: 'Next timepoint' },
];
const ROUNDING_OPTIONS = [{ value: '60', text: 'Round down to 1 min' }, { value: '30', text: '30 s' }];
const clock = (seconds: number | undefined) => seconds === undefined ? '' : formatServiceTime(seconds, seconds % 60 !== 0);

/** The pattern shown first: the first selected Trip's, else the first with stops, else the first (Decision 0079, ST6 item 2). */
function defaultPatternId(patterns: RoutePattern[], trips: Trip[], selectedTripIds: string[], set: RouteStopSet | undefined) {
  const ids = new Set(patterns.map((pattern) => pattern.id));
  const selected = trips.find((trip) => selectedTripIds.includes(trip.id) && ids.has(trip.patternId));
  return selected?.patternId ?? patterns.find((pattern) => set?.placementsByPatternId[pattern.id]?.length)?.id ?? patterns[0]?.id ?? '';
}

/**
 * Decision 0079 (ST6). One pattern's derived stop times for the displayed Trips, in a right-side drawer of the Trips tab. Timing rules and the
 * Route's rounding are edited here; the times update from the draft at once and nothing is stored per Trip.
 */
export const StopTripsDrawer = forwardRef<StopTripsHandle, { service: StopTripsService; aggregate: RouteDefinitionAggregate; patterns: RoutePattern[]; nodes: Node[]; trips: Trip[]; selectedTripIds: string[]; onDirtyChange: (dirty: boolean) => void; onClose: () => void }>(function StopTripsDrawer({ service, aggregate, patterns, nodes, trips, selectedTripIds, onDirtyChange, onClose }, ref) {
  const [loaded, setLoaded] = useState<{ set?: RouteStopSet }>();
  const [patternId, setPatternId] = useState('');
  // Edited placements by pattern; a pattern without an entry shows its saved placements.
  const [edited, setEdited] = useState<Record<string, PatternStopPlacement[]>>({});
  const [rounding, setRounding] = useState<StopTimeRoundingSeconds>(DEFAULT_STOP_ROUNDING_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [closePrompt, setClosePrompt] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  const set = loaded?.set;
  const accept = useCallback((next: RouteStopSet | undefined) => { setLoaded({ set: next }); setEdited({}); setRounding(next?.roundingSeconds ?? DEFAULT_STOP_ROUNDING_SECONDS); setError(''); }, []);
  useEffect(() => {
    let current = true;
    service.getRouteStopSet(aggregate.route.id).then((next) => { if (current) accept(next); }, (reason) => { if (current) setError(userFacingError(reason, 'The stops could not be loaded.')); });
    return () => { current = false; };
  }, [service, aggregate.route.id, accept]);
  // The pattern follows the displayed Direction: a pattern that is no longer listed gives way to the default.
  useEffect(() => {
    if (!loaded) return;
    if (!patterns.some((pattern) => pattern.id === patternId)) setPatternId(defaultPatternId(patterns, trips, selectedTripIds, set));
  }, [loaded, patterns, patternId]);

  const pattern = patterns.find((candidate) => candidate.id === patternId);
  const savedPlacements = (id: string) => set?.placementsByPatternId[id] ?? [];
  const placementsOf = (id: string) => edited[id] ?? savedPlacements(id);
  const changedPatternIds = Object.keys(edited).filter((id) => JSON.stringify(edited[id]) !== JSON.stringify(savedPlacements(id)));
  const roundingChanged = Boolean(set) && rounding !== (set?.roundingSeconds ?? DEFAULT_STOP_ROUNDING_SECONDS);
  const changeCount = changedPatternIds.reduce((count, id) => count + edited[id].filter((placement, index) => placement.timing !== savedPlacements(id)[index]?.timing).length, 0) + (roundingChanged ? 1 : 0);
  const dirty = changeCount > 0;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const placements = pattern ? placementsOf(pattern.id) : [];
  const patternTrips = pattern ? trips.filter((trip) => trip.patternId === pattern.id) : [];
  const selectedOfPattern = patternTrips.filter((trip) => selectedTripIds.includes(trip.id));
  const shownTrips = selectedOfPattern.length ? selectedOfPattern : patternTrips;
  const table = pattern ? stopTripsTable({ pattern, set, nodes, trips: shownTrips, placements, roundingSeconds: rounding }) : undefined;
  const warnings = pattern && set ? new Set(validateRouteStopSet({ ...set, placementsByPatternId: { ...set.placementsByPatternId, [pattern.id]: placements } }, [pattern]).filter((finding) => finding.severity === 'warning').map((finding) => finding.entityId)) : new Set<string>();

  function setTiming(placementId: string, timing: StopTimingRule) {
    if (!pattern) return;
    setEdited((current) => ({ ...current, [pattern.id]: placementsOf(pattern.id).map((placement) => placement.id === placementId ? { ...placement, timing } : placement) }));
    setError('');
  }
  async function save(): Promise<boolean> {
    if (!set || !dirty) return true;
    setBusy(true);
    try {
      // One write per edited pattern, each on the set the previous one wrote; a rounding change alone is saved with the shown pattern.
      let current: RouteStopSet | undefined = set;
      const ids = changedPatternIds.length ? changedPatternIds : [pattern?.id ?? Object.keys(set.placementsByPatternId)[0]];
      for (const id of ids) {
        const target = aggregate.patterns.find((candidate) => candidate.id === id);
        if (!current || !target) continue;
        current = await service.saveRouteStops({ routeId: aggregate.route.id, patternId: id, stops: current.stops, placements: normalizePlacements(target, edited[id] ?? current.placementsByPatternId[id] ?? []), roundingSeconds: rounding, baseUpdatedAt: current.updatedAt });
      }
      accept(current);
      return true;
    } catch (reason) {
      if (reason instanceof RouteStopValidationError) setError([...new Set(reason.findings.filter((finding) => finding.severity === 'error').map((finding) => USER_FACING_VALIDATION_MESSAGES[finding.messageKey] ?? reason.message))].join(' '));
      else setError(reason instanceof Error && reason.message === STOPS_CHANGED_ELSEWHERE ? STOPS_CHANGED_ELSEWHERE : userFacingError(reason, 'The stop timing could not be saved.'));
      return false;
    } finally { setBusy(false); }
  }
  function discard() { setEdited({}); setRounding(set?.roundingSeconds ?? DEFAULT_STOP_ROUNDING_SECONDS); setError(''); }
  useImperativeHandle(ref, () => ({ save, discard }));

  const requestClose = useCallback(() => { if (dirty) setClosePrompt(true); else onClose(); }, [dirty, onClose]);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy && !closePrompt && !event.defaultPrevented) { event.preventDefault(); requestClose(); } };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [busy, closePrompt, requestClose]);
  useEffect(() => { closeButton.current?.focus(); }, []);

  const tripLabel = (trip: Trip) => clock(trip.stopTimes[0]?.time);
  return <aside className="shift-drawer stop-trips-drawer" role="complementary" aria-labelledby="stop-trips-title">
    <header>
      <h2 id="stop-trips-title">Stop trips</h2>
      <button ref={closeButton} className="icon-button" type="button" aria-label="Close Stop trips drawer" title="Close Stop trips drawer" onClick={requestClose} disabled={busy}>×</button>
    </header>
    <div className="shift-drawer-body stop-trips-drawer__body">
      <div className="stop-trips-controls">
        <label className="stop-trips-field">Pattern<select value={patternId} disabled={busy || !loaded} onChange={(event) => setPatternId(event.target.value)}>{patterns.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name || 'Untitled pattern'}</option>)}</select></label>
        <SegmentedControl label="Rounding" className="stop-trips-rounding" options={ROUNDING_OPTIONS} value={String(rounding)} disabled={busy || !set} title={set ? undefined : 'This route has no stops'} onChange={(value) => { setRounding(Number(value) as StopTimeRoundingSeconds); setError(''); }} />
        <span className="stop-trips-count" role="status">{shownTrips.length === patternTrips.length ? `${patternTrips.length} trip${patternTrips.length === 1 ? '' : 's'}` : `${shownTrips.length} of ${patternTrips.length} trips (selected)`}</span>
      </div>
      {!loaded && !error && <p role="status">Loading stops…</p>}
      {table && <div className="stop-trips-grid" tabIndex={0} role="region" aria-label="Stop times">
        <table aria-label={`Stop times for ${pattern?.name || 'this pattern'}`}>
          <thead><tr><th scope="col" className="stop-trips-grid__stop">Stop</th><th scope="col" className="stop-trips-grid__rule">Timing</th>{table.trips.map((trip, index) => <th key={trip.id} scope="col" className="stop-trips-grid__time"><span className="visually-hidden">Trip {index + 1} departing </span>{tripLabel(trip)}</th>)}</tr></thead>
          <tbody>{table.rows.map((row, rowIndex) => {
            const times = table.trips.map((trip) => clock(table.times.get(trip.id)?.[rowIndex]));
            if (row.kind === 'timepoint') return <tr key={`tp-${row.patternPointId}`} className="stop-trips-grid__timepoint"><th scope="row" className="stop-trips-grid__stop"><span className="stop-trips-grid__mark" aria-hidden="true" />{row.name || 'Untitled node'}{row.stopCode && <span className="stop-trips-grid__code">{row.stopCode}</span>}</th><td className="stop-trips-grid__rule"><span className="visually-hidden">Timepoint</span></td>{times.map((time, index) => <td key={index} className="stop-trips-grid__time">{time}</td>)}</tr>;
            const warning = row.placementId !== undefined && warnings.has(row.placementId);
            return <Fragment key={row.placementId}><tr className={warning ? 'stop-trips-grid__stop-row stop-trips-grid__stop-row--warning' : 'stop-trips-grid__stop-row'}>
              <th scope="row" className="stop-trips-grid__stop">{row.name}{row.stopCode && <span className="stop-trips-grid__code">{row.stopCode}</span>}{warning && <span className="stop-trips-grid__warning" role="img" aria-label={USER_FACING_VALIDATION_MESSAGES['stopPlacement.timingOutOfOrder']} title={USER_FACING_VALIDATION_MESSAGES['stopPlacement.timingOutOfOrder']}>!</span>}</th>
              <td className="stop-trips-grid__rule"><select aria-label={`Timing, ${row.name}`} value={row.timing} disabled={busy} onChange={(event) => setTiming(row.placementId!, event.target.value as StopTimingRule)}>{TIMING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}</select></td>
              {times.map((time, index) => <td key={index} className="stop-trips-grid__time">{time}</td>)}
            </tr></Fragment>;
          })}</tbody>
        </table>
      </div>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
    <footer className={dirty ? 'stop-trips-drawer__footer stop-trips-drawer__footer--dirty' : 'stop-trips-drawer__footer'}>
      {dirty ? <SaveBar message={`${changeCount} unsaved change${changeCount === 1 ? '' : 's'}`} saveLabel="Save" busy={busy} onSave={() => void save()} onDiscard={discard} /> : <button type="button" onClick={onClose} disabled={busy}>Close</button>}
    </footer>
    {closePrompt && <StopTripsClosePrompt onCancel={() => setClosePrompt(false)} onDiscard={() => { setClosePrompt(false); onClose(); }} onSave={() => { setClosePrompt(false); void save().then((saved) => { if (saved) onClose(); }); }} />}
  </aside>;
});

/** Cancel, Discard, or Save for unsaved timing rules or rounding. Also used by the Trips workspace before a scope change. */
export function StopTripsClosePrompt({ onCancel, onDiscard, onSave }: { onCancel: () => void; onDiscard: () => void; onSave: () => void }) {
  return <ShiftDiscardDialog title="Discard stop timing changes?" text="Timing rules or rounding have unsaved edits." onCancel={onCancel} onDiscard={onDiscard} onSave={onSave} />;
}
