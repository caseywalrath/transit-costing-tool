import { useEffect, useMemo, useState } from 'react';
import { patternShortName } from '../../application/shortNames';
import { type TripGenerationApplication } from '../../application/tripGenerationService';
import { type BatchPatternChangePreview } from '../../domain/serviceDayCopy';
import { formatServiceTime } from '../../domain/time';
import { type PatternChangePreview, type RecalculationConnection, type RecalculationReview } from '../../domain/trips';
import { type Node, type RoutePattern, type Trip, type ValidationFinding } from '../../domain/types';
import { userFacingError } from '../errorMessages';
import { ModalDialog } from '../ModalDialog';
import { explainTripProblem, type ProblemAction } from '../shared/messages';
import { AnchorSelect } from './dialogs';
import { reviewButtonState, type ReviewRowView, TripReviewSummary, TripReviewTable } from './TripReviewTable';

/**
 * Regenerate and Change pattern dialogs built on `TripReviewTable` (Decisions 0071 and 0072, R5). Each row's Action select chooses a fix
 * for that Trip. A fix is a review input (an anchor, a kept time, a time period, or Skip). The review is rebuilt after every change, and
 * nothing is written until the primary button is pressed.
 */

const clock = (value: number) => formatServiceTime(value, value % 60 !== 0);
const RUN: ProblemAction = { id: 'run', label: 'run' };
const SKIP: ProblemAction = { id: 'skip', label: 'Skip this trip', cost: 'leave it unchanged' };
const UNDO: ProblemAction = { id: 'undo', label: 'Undo this fix' };

export interface ReviewContext {
  patterns: RoutePattern[];
  nodes: Pick<Node, 'id' | 'name' | 'shortName'>[];
  directionName?: string;
  serviceDayName?: string;
  /** Block label by Trip id, for the "Block 104" line. */
  blockLabels?: ReadonlyMap<string, string>;
  /** Closes the dialog and opens the Runtimes section. */
  onOpenRuntimes?: () => void;
}

function useNames(context: ReviewContext) {
  return useMemo(() => {
    const nodeById = new Map(context.nodes.map((node) => [node.id, node]));
    const patternById = new Map(context.patterns.map((pattern) => [pattern.id, pattern]));
    const nodeName = (nodeId: string | undefined) => { const node = nodeId ? nodeById.get(nodeId) : undefined; return node?.shortName || node?.name || 'this stop'; };
    /** The full name, for the stop lists above the table (as before R5). */
    const fullName = (nodeId: string | undefined) => { const node = nodeId ? nodeById.get(nodeId) : undefined; return node?.name || node?.shortName || nodeId || 'this stop'; };
    const chip = (patternId: string) => patternShortName(patternById.get(patternId), context.directionName, nodeById);
    const segmentName = (pattern: RoutePattern | undefined) => (index: number) => pattern ? `${nodeName(pattern.points[index]?.nodeId)} to ${nodeName(pattern.points[index + 1]?.nodeId)}` : 'this segment';
    return { nodeName, fullName, chip, patternById, segmentName };
  }, [context.nodes, context.patterns, context.directionName]);
}

/** The layover after each Trip: the smallest gap of its block connections. */
function layoverByTrip(connections: RecalculationConnection[]): Map<string, { current?: number; revised?: number }> {
  const byTrip = new Map<string, RecalculationConnection>();
  const gap = (item: RecalculationConnection) => item.revisedLayoverSeconds ?? item.revisedGapSeconds;
  for (const item of connections) { const current = byTrip.get(item.tripId); if (!current || gap(item) < gap(current)) byTrip.set(item.tripId, item); }
  return new Map([...byTrip].map(([tripId, item]) => [tripId, { current: item.currentLayoverSeconds ?? item.currentGapSeconds, revised: item.revisedLayoverSeconds ?? item.revisedGapSeconds }]));
}

function warningsByTrip(findings: ValidationFinding[]): Map<string, ValidationFinding[]> {
  const byTrip = new Map<string, ValidationFinding[]>();
  for (const finding of findings) if (finding.severity !== 'error') byTrip.set(finding.entityId, [...(byTrip.get(finding.entityId) ?? []), finding]);
  return byTrip;
}

/** The Action options of a row that is ready, skipped, or fixed. */
function settledActions(status: 'ready' | 'skipped', chosen: ProblemAction | undefined, allowSkip: boolean): { actions: ProblemAction[]; value: string } {
  if (status === 'skipped') return { actions: [SKIP, RUN], value: 'skip' };
  if (chosen) return { actions: [chosen, UNDO, ...(allowSkip ? [SKIP] : [])], value: chosen.id };
  return { actions: [RUN, ...(allowSkip ? [SKIP] : [])], value: 'run' };
}

function primaryLabel(verb: string, count: number, busy: boolean, reviewing: boolean, busyText: string): string {
  if (busy) return busyText;
  if (reviewing) return 'Reviewing…';
  return `${verb} ${count} ${count === 1 ? 'trip' : 'trips'}`;
}

// ───────────────────────────── Regenerate ─────────────────────────────

export function RecalculationDialog({ tripService, tripIds, trips, context, onDone, onClose }: { tripService: Pick<TripGenerationApplication, 'reviewRecalculation' | 'applyRecalculationReview'>; tripIds: string[]; trips: Trip[]; context: ReviewContext; onDone: (changedTripIds: string[]) => Promise<void>; onClose: () => void }) {
  const names = useNames(context);
  const selected = useMemo(() => { const byId = new Map(trips.map((trip) => [trip.id, trip])); return tripIds.map((id) => byId.get(id)).filter((trip): trip is Trip => Boolean(trip)); }, [trips, tripIds]);
  const pointsOf = (trip: Trip) => names.patternById.get(trip.patternId)?.points ?? [];
  const [bulk, setBulk] = useState<{ kind: 'first' | 'last' } | { kind: 'shared'; nodeId: string }>({ kind: 'first' });
  const [anchors, setAnchors] = useState<Record<string, string>>({});
  const [anchorTimes, setAnchorTimes] = useState<Record<string, number>>({});
  const [bands, setBands] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Record<string, ProblemAction>>({});
  const [review, setReview] = useState<RecalculationReview>();
  const [reviewing, setReviewing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const bulkAnchor = (trip: Trip): string => {
    const points = pointsOf(trip);
    if (bulk.kind === 'last') return points.at(-1)?.id ?? '';
    if (bulk.kind === 'shared') return points.find((point) => point.nodeId === bulk.nodeId)?.id ?? points[0]?.id ?? '';
    return points[0]?.id ?? '';
  };
  const anchorOf = (trip: Trip) => anchors[trip.id] ?? bulkAnchor(trip);

  useEffect(() => {
    let live = true;
    setReviewing(true); setError('');
    const anchorByTripId = Object.fromEntries(selected.map((trip) => [trip.id, anchorOf(trip)]));
    void tripService.reviewRecalculation(tripIds, { anchorByTripId, anchorTimeByTripId: anchorTimes, bandOverrideByTripId: bands, skipTripIds: skipped })
      .then((result) => { if (live) setReview(result); })
      .catch((issue: unknown) => { if (live) { setReview(undefined); setError(userFacingError(issue, 'Unable to review the trips. Close this dialog and try again.')); } })
      .finally(() => { if (live) setReviewing(false); });
    return () => { live = false; };
    // anchorOf reads bulk and anchors, which are listed.
  }, [tripService, tripIds, selected, bulk, anchors, anchorTimes, bands, skipped, revision]);

  const rowById = useMemo(() => new Map((review?.rows ?? []).map((row) => [row.tripId, row])), [review]);
  const layovers = useMemo(() => layoverByTrip(review?.connections ?? []), [review]);
  const warnings = useMemo(() => warningsByTrip(review?.findings ?? []), [review]);

  const rows: ReviewRowView[] = selected.map((trip) => {
    const row = rowById.get(trip.id);
    const pattern = names.patternById.get(trip.patternId);
    const points = pointsOf(trip);
    const anchorId = anchorOf(trip);
    const anchorIndex = Math.max(0, points.findIndex((point) => point.id === anchorId));
    const keptAtStart = anchorIndex === 0;
    const keptStopName = names.nodeName(points[anchorIndex]?.nodeId);
    const keptTime = anchorTimes[trip.id] ?? trip.stopTimes.find((point) => point.patternPointId === anchorId)?.time;
    const startTime = trip.stopTimes[0]?.time;
    const status = !row ? 'ready' : row.status === 'skipped' ? 'skipped' : row.status === 'ready' ? (warnings.get(trip.id)?.length ? 'warning' : 'ready') : 'attention';
    const findings = status === 'attention' ? row?.findings ?? [] : status === 'warning' ? warnings.get(trip.id) ?? [] : [];
    const explanation = explainTripProblem({ mode: 'regenerate', findings, diagnosis: row?.diagnosis, keptStopName, keptAtStart, startTime, bandChoices: row?.bandChoices, bandPickable: row?.bandPickable, segmentName: names.segmentName(pattern), serviceDayName: context.serviceDayName, allowSkip: true });
    const settled = status === 'attention' ? { actions: explanation?.actions ?? [SKIP], value: '' } : settledActions(status === 'skipped' ? 'skipped' : 'ready', chosen[trip.id], true);
    const fallback = row?.bandSelection;
    const startLabel = startTime === undefined ? '' : clock(startTime);
    return {
      tripId: trip.id,
      trip: { patternChip: names.chip(trip.patternId), startTime, blockLabel: context.blockLabels?.get(trip.id) },
      status, explanation,
      kept: <><AnchorSelect label={`Stop to keep for trip at ${startLabel}`} value={anchorId} disabled={busy} choices={() => points.map((point, index) => ({ id: point.id, label: index === 0 ? 'Start' : index === points.length - 1 ? 'End' : names.nodeName(point.nodeId) }))} onChange={(value) => { resetTrip(trip.id); setAnchors((current) => ({ ...current, [trip.id]: value })); }} /><span className="trip-review-kept-time">{keptTime === undefined ? '—' : clock(keptTime)}</span>{fallback && <small className="recalculation-fallback">Uses {fallback.bandLabel}{fallback.side ? `, ${Number((fallback.distanceSeconds / 60).toFixed(1))} min ${fallback.side === 'before' ? 'before it starts' : 'after it ends'}` : ''}</small>}</>,
      oldTimes: trip.stopTimes,
      newTimes: row?.status === 'ready' ? row.revisedTrip?.stopTimes : undefined,
      layover: layovers.get(trip.id),
      actions: settled.actions, actionValue: settled.value,
    };
  });

  function resetTrip(tripId: string) {
    const without = <T,>(record: Record<string, T>) => { const next = { ...record }; delete next[tripId]; return next; };
    setAnchorTimes(without); setBands(without); setChosen(without); setAnchors(without);
  }
  function onAction(tripId: string, actionId: string) {
    const trip = selected.find((item) => item.id === tripId);
    if (!trip) return;
    const firstPoint = pointsOf(trip)[0]?.id ?? '';
    const option = rows.find((row) => row.tripId === tripId)?.actions.find((action) => action.id === actionId);
    if (actionId === 'skip') { setSkipped((current) => current.includes(tripId) ? current : [...current, tripId]); return; }
    if (actionId === 'run') { setSkipped((current) => current.filter((id) => id !== tripId)); return; }
    if (actionId === 'undo') { resetTrip(tripId); return; }
    resetTrip(tripId);
    if (actionId === 'keepStart') setAnchors((current) => ({ ...current, [tripId]: firstPoint }));
    else if (actionId.startsWith('keep:')) { setAnchors((current) => ({ ...current, [tripId]: anchorOf(trip) })); setAnchorTimes((current) => ({ ...current, [tripId]: Number(actionId.slice(5)) })); }
    else if (actionId.startsWith('start:')) { setAnchors((current) => ({ ...current, [tripId]: firstPoint })); setAnchorTimes((current) => ({ ...current, [tripId]: Number(actionId.slice(6)) })); }
    else if (actionId.startsWith('band:')) { setAnchors((current) => ({ ...current, [tripId]: anchorOf(trip) })); setBands((current) => ({ ...current, [tripId]: actionId.slice(5) })); }
    if (option) setChosen((current) => ({ ...current, [tripId]: option }));
  }
  function setAll(next: typeof bulk) { setBulk(next); setAnchors({}); setAnchorTimes({}); setBands({}); setChosen({}); }

  const commonNodes = selected.length ? pointsOf(selected[0]).map((point) => point.nodeId).filter((nodeId, index, all) => all.indexOf(nodeId) === index && selected.every((trip) => pointsOf(trip).some((point) => point.nodeId === nodeId))) : [];
  const button = reviewButtonState(rows);
  async function apply() {
    if (!review) return;
    setBusy(true); setError('');
    try { const written = await tripService.applyRecalculationReview(review, true); await onDone(written.trips.map((trip) => trip.id)); }
    catch (issue) { setError(userFacingError(issue, 'Unable to regenerate the trips. Review them again, then apply.')); setRevision((value) => value + 1); }
    finally { setBusy(false); }
  }
  return <ModalDialog labelledBy="recalculation-title" className="confirm-dialog preview-dialog trip-review-dialog" onClose={onClose} busy={busy}>
    <h2 id="recalculation-title">Regenerate selected trips</h2>
    <p>Each trip keeps one of its times, and its other times are recalculated from the current runtimes.</p>
    <div className="recalculation-bulk">
      <span>Keep for all trips</span>
      <button type="button" className={bulk.kind === 'first' ? 'is-selected' : undefined} aria-pressed={bulk.kind === 'first'} onClick={() => setAll({ kind: 'first' })} disabled={busy}>Start time</button>
      <button type="button" className={bulk.kind === 'last' ? 'is-selected' : undefined} aria-pressed={bulk.kind === 'last'} onClick={() => setAll({ kind: 'last' })} disabled={busy}>End time</button>
      {commonNodes.length > 0 && <select aria-label="Keep a stop all trips serve" className={bulk.kind === 'shared' ? 'is-selected' : undefined} value={bulk.kind === 'shared' ? bulk.nodeId : ''} disabled={busy} onChange={(event) => { if (event.target.value) setAll({ kind: 'shared', nodeId: event.target.value }); }}><option value="" disabled>…or a stop all trips serve</option>{commonNodes.map((nodeId) => <option key={nodeId} value={nodeId}>{names.nodeName(nodeId)}</option>)}</select>}
    </div>
    <TripReviewSummary rows={rows} busy={busy || reviewing} allowSkip onSkipAttention={() => setSkipped((current) => [...new Set([...current, ...rows.filter((row) => row.status === 'attention').map((row) => row.tripId)])])} />
    <TripReviewTable rows={rows} busy={busy} runLabel="Regenerate" onAction={onAction} onOpenRuntimes={context.onOpenRuntimes} />
    {review?.impact.requiresConfirmation && <p>Regenerating will replace manual times or affect blocks. Review the times above before applying.</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions trip-review-footer">
      <span className="trip-review-footer__note">{rows.some((row) => row.status === 'attention') ? 'Trips that need attention are not changed until you choose a fix or skip them.' : ''}</span>
      <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
      {!review && error && <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={reviewing || busy}>Review again</button>}
      <button className="primary" type="button" onClick={() => void apply()} disabled={!review || !button.enabled || reviewing || busy}>{primaryLabel('Regenerate', button.count, busy, reviewing, 'Regenerating…')}</button>
    </div>
  </ModalDialog>;
}

// ───────────────────────────── Change pattern ─────────────────────────────

interface PatternInputs { anchorNode: Record<string, string>; anchorTime: Record<string, number>; band: Record<string, string>; chosen: Record<string, ProblemAction> }
const NO_INPUTS: PatternInputs = { anchorNode: {}, anchorTime: {}, band: {}, chosen: {} };

/** One pattern-change row, shared by the batch and the single-trip dialogs. */
function patternChangeRow(change: PatternChangePreview, trip: Trip, keptNodeId: string, inputs: PatternInputs, names: ReturnType<typeof useNames>, context: ReviewContext, warnings: ValidationFinding[], layover: { current?: number; revised?: number } | undefined, allowSkip: boolean, showTrip: boolean): ReviewRowView {
  const target = names.patternById.get(change.targetPatternId);
  const keptAtStart = !keptNodeId;
  const keptStopName = keptAtStart ? names.nodeName(target?.points[0]?.nodeId) : names.nodeName(keptNodeId);
  const keptTime = keptAtStart ? trip.stopTimes[0]?.time : inputs.anchorTime[trip.id] ?? change.anchorTime;
  const status = change.skipped ? 'skipped' : change.finding ? 'attention' : warnings.length ? 'warning' : 'ready';
  const findings = status === 'attention' ? [change.finding!] : status === 'warning' ? warnings : [];
  const explanation = explainTripProblem({ mode: 'patternChange', findings, diagnosis: change.diagnosis, keptStopName, keptAtStart, startTime: trip.stopTimes[0]?.time, bandChoices: change.bandChoices, bandPickable: Boolean(change.bandChoices?.length), segmentName: names.segmentName(target), serviceDayName: context.serviceDayName, allowSkip });
  const settled = status === 'attention' ? { actions: explanation?.actions ?? (allowSkip ? [SKIP] : []), value: '' } : settledActions(status === 'skipped' ? 'skipped' : 'ready', inputs.chosen[trip.id], allowSkip);
  return {
    tripId: trip.id,
    ...(showTrip ? { trip: { patternChip: names.chip(trip.patternId), startTime: trip.stopTimes[0]?.time, newPatternChip: names.chip(change.targetPatternId), blockLabel: context.blockLabels?.get(trip.id) } } : {}),
    status, explanation,
    kept: <>{keptAtStart ? 'Start' : keptStopName}<span className="trip-review-kept-time">{keptTime === undefined ? '—' : clock(keptTime)}</span></>,
    oldTimes: change.oldStopTimes, newTimes: change.newStopTimes, layover,
    actions: settled.actions, actionValue: settled.value,
  };
}

/** Applies a pattern-change row action to the per-trip inputs. Returns the new inputs, or 'skip' / 'run' for the caller's skip list. */
function patternAction(inputs: PatternInputs, tripId: string, actionId: string, option: ProblemAction | undefined): PatternInputs {
  const without = <T,>(record: Record<string, T>) => { const next = { ...record }; delete next[tripId]; return next; };
  const cleared: PatternInputs = { anchorNode: without(inputs.anchorNode), anchorTime: without(inputs.anchorTime), band: without(inputs.band), chosen: without(inputs.chosen) };
  if (actionId === 'undo') return cleared;
  const next = { ...cleared, chosen: option ? { ...cleared.chosen, [tripId]: option } : cleared.chosen };
  if (actionId === 'keepStart') return { ...next, anchorNode: { ...next.anchorNode, [tripId]: '' } };
  if (actionId.startsWith('keep:')) return { ...next, anchorTime: { ...next.anchorTime, [tripId]: Number(actionId.slice(5)) } };
  if (actionId.startsWith('band:')) return { ...next, band: { ...next.band, [tripId]: actionId.slice(5) } };
  return inputs;
}

function anchorChoicesFor(patterns: RoutePattern[], targetPatternId: string, names: ReturnType<typeof useNames>) {
  const seen = new Set<string>();
  return (patterns.find((pattern) => pattern.id === targetPatternId)?.points ?? []).flatMap((point) => seen.has(point.nodeId) ? [] : (seen.add(point.nodeId), [{ nodeId: point.nodeId, name: names.fullName(point.nodeId) }]));
}

export function BatchPatternChangeDialog({ tripService, tripIds, trips, context, onDone, onClose }: { tripService: Pick<TripGenerationApplication, 'previewBatchPatternChange' | 'applyBatchPatternChange'>; tripIds: string[]; trips: Trip[]; context: ReviewContext; onDone: (changedTripIds: string[]) => Promise<void>; onClose: () => void }) {
  const names = useNames(context);
  const [targetPatternId, setTargetPatternId] = useState(context.patterns[0]?.id ?? '');
  const [anchorNodeId, setAnchorNodeId] = useState('');
  const [inputs, setInputs] = useState<PatternInputs>(NO_INPUTS);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [preview, setPreview] = useState<BatchPatternChangePreview>();
  const [reviewing, setReviewing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const anchorChoices = useMemo(() => anchorChoicesFor(context.patterns, targetPatternId, names), [context.patterns, targetPatternId, names]);

  useEffect(() => {
    let live = true;
    setReviewing(true); setError('');
    void tripService.previewBatchPatternChange({ tripIds, targetPatternId, anchorNodeId: anchorNodeId || undefined, skipTripIds: skipped, anchorNodeIdByTripId: inputs.anchorNode, anchorTimeByTripId: inputs.anchorTime, chosenBandIdByTripId: inputs.band })
      .then((result) => { if (live) setPreview(result); })
      .catch((issue: unknown) => { if (live) { setPreview(undefined); setError(userFacingError(issue, 'Unable to review this pattern change. Close this dialog and try again.')); } })
      .finally(() => { if (live) setReviewing(false); });
    return () => { live = false; };
  }, [tripService, tripIds, targetPatternId, anchorNodeId, inputs, skipped, revision]);

  const tripById = useMemo(() => new Map(trips.map((trip) => [trip.id, trip])), [trips]);
  const layovers = useMemo(() => layoverByTrip(preview?.connections ?? []), [preview]);
  const warnings = useMemo(() => warningsByTrip(preview?.connectionFindings ?? []), [preview]);
  const rows: ReviewRowView[] = (preview?.changes ?? []).flatMap((change) => {
    const trip = tripById.get(change.tripId);
    if (!trip) return [];
    const keptNodeId = inputs.anchorNode[trip.id] ?? anchorNodeId;
    return [patternChangeRow(change, trip, keptNodeId, inputs, names, context, warnings.get(trip.id) ?? [], layovers.get(trip.id), true, true)];
  });
  function onAction(tripId: string, actionId: string) {
    if (actionId === 'skip') { setSkipped((current) => current.includes(tripId) ? current : [...current, tripId]); return; }
    if (actionId === 'run') { setSkipped((current) => current.filter((id) => id !== tripId)); return; }
    setInputs((current) => patternAction(current, tripId, actionId, rows.find((row) => row.tripId === tripId)?.actions.find((action) => action.id === actionId)));
  }
  const button = reviewButtonState(rows);
  async function apply() {
    if (!preview) return;
    setBusy(true); setError('');
    try { await tripService.applyBatchPatternChange(preview); await onDone(preview.eligibleTripIds); onClose(); }
    catch (caught) { setError(caught instanceof Error && caught.name === 'ServiceDayCopyStalePreviewError' ? 'Selected trips changed. Review again.' : userFacingError(caught, 'Unable to change patterns. Review the change again, then apply.')); setRevision((value) => value + 1); }
    finally { setBusy(false); }
  }
  return <ModalDialog labelledBy="batch-pattern-title" className="confirm-dialog preview-dialog trip-review-dialog" onClose={onClose} busy={busy}>
    <h2 id="batch-pattern-title">Change the pattern of {tripIds.length} {tripIds.length === 1 ? 'trip' : 'trips'}</h2>
    <p>Each trip moves to the new pattern and keeps the time you choose. Its other times are recalculated.</p>
    <div className="trip-review-controls">
      <label className="dialog-field">New pattern<select autoFocus value={targetPatternId} disabled={busy} onChange={(event) => { setTargetPatternId(event.target.value); setAnchorNodeId(''); setInputs(NO_INPUTS); }}>{context.patterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select></label>
      <label className="dialog-field">Keep the time at<select value={anchorNodeId} disabled={busy} onChange={(event) => { setAnchorNodeId(event.target.value); setInputs(NO_INPUTS); }}><option value="">Start (each trip's first stop)</option>{anchorChoices.map((choice) => <option key={choice.nodeId} value={choice.nodeId}>{choice.name}</option>)}</select></label>
    </div>
    <TripReviewSummary rows={rows} busy={busy || reviewing} allowSkip onSkipAttention={() => setSkipped((current) => [...new Set([...current, ...rows.filter((row) => row.status === 'attention').map((row) => row.tripId)])])} />
    <TripReviewTable rows={rows} busy={busy} runLabel="Change pattern" onAction={onAction} onOpenRuntimes={context.onOpenRuntimes} />
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions trip-review-footer">
      <span className="trip-review-footer__note">{preview?.affectedBlockIds.length ? `${preview.affectedBlockIds.length} ${preview.affectedBlockIds.length === 1 ? 'block is' : 'blocks are'} affected.` : ''}</span>
      <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="primary" type="button" onClick={() => void apply()} disabled={!preview || !button.enabled || reviewing || busy}>{primaryLabel('Change', button.count, busy, reviewing, 'Saving…')}</button>
    </div>
  </ModalDialog>;
}

/**
 * Change pattern with one Trip selected. It keeps the single-Trip signed review (`previewTripPatternChange`, Decision 0067): the change is
 * refused when the Trip, the target Pattern, or the target profile changed after the review.
 */
export function TripPatternChangeDialog({ tripService, trip, directionId, context, onDone, onClose }: { tripService: Pick<TripGenerationApplication, 'previewTripPatternChange' | 'changeTripPattern' | 'listSharedAnchorNodes'>; trip: Trip; directionId: string; context: ReviewContext; onDone: (changedTripIds: string[]) => Promise<void>; onClose: () => void }) {
  const names = useNames(context);
  const targets = context.patterns.filter((pattern) => pattern.id !== trip.patternId);
  const [targetPatternId, setTargetPatternId] = useState(targets[0]?.id ?? '');
  const [anchorNodeId, setAnchorNodeId] = useState('');
  const [anchorChoices, setAnchorChoices] = useState<{ nodeId: string; name: string }[]>([]);
  const [inputs, setInputs] = useState<PatternInputs>(NO_INPUTS);
  const [review, setReview] = useState<Awaited<ReturnType<TripGenerationApplication['previewTripPatternChange']>>>();
  const [reviewing, setReviewing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setAnchorChoices([]);
    // A failed load leaves only Start; the review still reports a stop the patterns do not share.
    if (targetPatternId) void tripService.listSharedAnchorNodes(trip.id, targetPatternId).then((choices) => { if (live) setAnchorChoices(choices); }).catch(() => { if (live) setAnchorChoices([]); });
    return () => { live = false; };
  }, [tripService, trip.id, targetPatternId, names]);
  const keptNodeId = inputs.anchorNode[trip.id] ?? anchorNodeId;
  useEffect(() => {
    let live = true;
    if (!targetPatternId) { setReviewing(false); return; }
    setReviewing(true); setError('');
    void tripService.previewTripPatternChange(trip.id, targetPatternId, directionId, { anchorNodeId: keptNodeId || undefined, chosenBandId: inputs.band[trip.id], anchorTime: inputs.anchorTime[trip.id] })
      .then((result) => { if (live) setReview(result); })
      .catch((issue: unknown) => { if (live) { setReview(undefined); setError(userFacingError(issue, 'Unable to review this pattern change. Close this dialog and try again.')); } })
      .finally(() => { if (live) setReviewing(false); });
    return () => { live = false; };
  }, [tripService, trip.id, targetPatternId, directionId, keptNodeId, inputs, revision]);
  const rows = review ? [patternChangeRow(review, trip, keptNodeId, inputs, names, context, [], undefined, false, false)] : [];
  const button = reviewButtonState(rows);
  async function apply() {
    if (!review || review.finding) return;
    setBusy(true); setError('');
    try { const changed = await tripService.changeTripPattern(review); await onDone([changed.id]); onClose(); }
    catch (caught) { setError(caught instanceof Error && caught.name === 'TripPatternChangeStalePreviewError' ? 'The trip or pattern changed. Review the change again.' : userFacingError(caught, 'Unable to change the pattern. Review the change again, then apply.')); setRevision((value) => value + 1); }
    finally { setBusy(false); }
  }
  const blocks = review?.affectedBlockIds?.length ?? 0;
  const startTime = trip.stopTimes[0]?.time;
  return <ModalDialog labelledBy="trip-pattern-title" className="confirm-dialog preview-dialog trip-review-dialog trip-review-dialog--single" onClose={onClose} busy={busy}>
    <h2 id="trip-pattern-title">Change the pattern of this trip</h2>
    <p><span className="trip-review-pattern">{names.chip(trip.patternId)}</span><span>{names.patternById.get(trip.patternId)?.name ?? 'Unnamed pattern'}</span>{startTime === undefined ? '' : ` · ${clock(startTime)}`}{context.blockLabels?.get(trip.id) ? ` · ${context.blockLabels.get(trip.id)}` : ''}</p>
    <div className="trip-review-controls">
      <label className="dialog-field">New pattern<select autoFocus value={targetPatternId} disabled={busy} onChange={(event) => { setTargetPatternId(event.target.value); setAnchorNodeId(''); setInputs(NO_INPUTS); }}>{targets.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select></label>
      <label className="dialog-field">Keep the time at<select value={anchorNodeId} disabled={busy} onChange={(event) => { setAnchorNodeId(event.target.value); setInputs(NO_INPUTS); }}><option value="">Start</option>{anchorChoices.map((choice) => <option key={choice.nodeId} value={choice.nodeId}>{choice.name}</option>)}</select></label>
    </div>
    <TripReviewTable rows={rows} busy={busy} runLabel="Change pattern" onAction={(tripId, actionId) => { if (actionId !== 'run') setInputs((current) => patternAction(current, tripId, actionId, rows[0]?.actions.find((action) => action.id === actionId))); }} onOpenRuntimes={context.onOpenRuntimes} />
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions trip-review-footer">
      <span className="trip-review-footer__note">{review ? blocks ? `${blocks} ${blocks === 1 ? 'block is' : 'blocks are'} affected.` : 'No blocks are affected.' : ''}</span>
      <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="primary" type="button" onClick={() => void apply()} disabled={!review || !button.enabled || reviewing || busy}>{busy ? 'Saving…' : 'Change pattern'}</button>
    </div>
  </ModalDialog>;
}
