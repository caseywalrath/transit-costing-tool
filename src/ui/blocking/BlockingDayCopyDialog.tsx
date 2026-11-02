import { useEffect, useState } from 'react';
import type { BlockingCommands, BlockingDayCopyReview, BlockingQueries } from '../../application/ports';
import { BlockingValidationError } from '../../domain/blocking';
import type { BlockingScenario, Route, ServiceDayDefinition } from '../../domain/types';
import { ModalDialog } from '../ModalDialog';
import { userFacingError } from '../errorMessages';
import { InlineNote } from '../shared/surfaces';
import { CopyImpact } from '../trips/dialogs';

type Props = {
  blockingService: BlockingCommands & BlockingQueries;
  scenarioId: string;
  blockingScenario: BlockingScenario;
  targetDay: ServiceDayDefinition;
  days: ServiceDayDefinition[];
  routes: Route[];
  onDone: () => Promise<void>;
  onClose: () => void;
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Decision 0052: copy the Blocks of the Blocking Scenario from another service day into the selected Day. */
export function BlockingDayCopyDialog({ blockingService, scenarioId, blockingScenario, targetDay, days, routes, onDone, onClose }: Props) {
  const sources = days.filter((day) => day.id !== targetDay.id);
  const [sourceServiceDayId, setSourceServiceDayId] = useState(sources[0]?.id ?? '');
  const [review, setReview] = useState<BlockingDayCopyReview>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(sourceId: string) {
    if (!sourceId) return;
    setBusy(true); setError(''); setReview(undefined); setAcknowledged(false);
    try { setReview(await blockingService.previewBlockingDayCopy({ scenarioId, blockingScenarioId: blockingScenario.id, sourceServiceDayId: sourceId, targetServiceDayId: targetDay.id })); }
    catch (caught) { setError(userFacingError(caught, 'Unable to review this copy. Close this dialog and try again.')); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(sourceServiceDayId); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = review?.preview; const impact = preview?.impact;
  const sourceName = days.find((day) => day.id === sourceServiceDayId)?.name ?? 'the source day';
  const emptySource = impact?.requiresExplicitEmptySourceReview ?? false;
  const refused = Boolean(impact?.belowThreshold) || Boolean(preview?.findings.some((finding) => finding.severity === 'error' && finding.ruleId !== 'blockingDayCopy.mismatchRequiresAcknowledgment' && finding.ruleId !== 'blockingDayCopy.emptySourceRequiresExplicitClear'));
  const needsAcknowledgment = !refused && (impact?.requiresMismatchAcknowledgment ?? false);
  const canApply = Boolean(preview) && !refused && !busy && (!needsAcknowledgment || acknowledged);
  const routeName = (id: string) => routes.find((route) => route.id === id)?.name || 'Untitled route';
  const emptiedLabels = preview ? preview.blocks.filter((block) => impact!.emptiedBlockIds.includes(block.id)).map((block) => block.label) : [];
  const newFindings = preview ? preview.blockFindings.length : 0;

  async function apply() {
    if (!review || !canApply) return;
    setBusy(true); setError('');
    const request = { ...review.preview.request, allowEmptySource: emptySource, acknowledgeMismatch: needsAcknowledgment && acknowledged };
    try { await blockingService.applyBlockingDayCopy({ ...review, preview: { ...review.preview, request } }); await onDone(); onClose(); }
    catch (caught) {
      if (caught instanceof BlockingValidationError && caught.findings.some((finding) => finding.ruleId === 'blockingScenario.sourceChanged')) { setBusy(false); await load(sourceServiceDayId); setError('Blocks or trips changed since this review. The review has been updated; check it and copy again.'); return; }
      setError(userFacingError(caught, 'Unable to copy blocks. Review the copy again, then apply.'));
    }
    finally { setBusy(false); }
  }

  return <ModalDialog labelledBy="block-copy-title" className="confirm-dialog preview-dialog block-copy-dialog" onClose={onClose} busy={busy}>
    <h2 id="block-copy-title">Copy blocks</h2>
    <p className="copy-scope">To {targetDay.name} · {blockingScenario.name} · All routes</p>
    <label className="dialog-field">Source day<select autoFocus value={sourceServiceDayId} disabled={busy} onChange={(event) => { setSourceServiceDayId(event.target.value); void load(event.target.value); }}>{sources.map((day) => <option key={day.id} value={day.id}>{day.name}</option>)}</select></label>
    {busy && !preview && <p role="status">Reviewing…</p>}
    {preview && impact && <>
      <CopyImpact items={[['Blocks copied', impact.copiedBlockCount], [`${targetDay.name} blocks replaced`, impact.replacedTargetBlockCount], ['Trips matched', impact.matchedTripCount]]} />
      {impact.routes.length > 0 && <table className="block-copy-routes" aria-label="Trip matches by route">
        <thead><tr><th scope="col">Route</th><th scope="col">Trips in blocks</th><th scope="col">Exact</th><th scope="col">Times differ</th><th scope="col">Not found</th><th scope="col">Left unassigned</th></tr></thead>
        <tbody>{impact.routes.map((row) => <tr key={row.routeId}><th scope="row">{routeName(row.routeId)}</th><td>{row.heldTripCount}</td><td>{row.exactCount}</td><td>{row.firstDepartureCount}</td><td>{row.unmatchedCount}</td><td>{row.unassignedTargetTripCount}</td></tr>)}</tbody>
      </table>}
      {(impact.firstDepartureCount > 0 || impact.unmatchedSourceTripIds.length > 0 || impact.removedDeadheadCount > 0 || emptiedLabels.length > 0 || impact.ambiguousCount > 0 || newFindings > 0) && <ul className="impact-list">
        {impact.firstDepartureCount > 0 && <li>{plural(impact.firstDepartureCount, 'trip')} matched by first departure only; later times differ on {targetDay.name}.</li>}
        {impact.unmatchedSourceTripIds.length > 0 && <li>{plural(impact.unmatchedSourceTripIds.length, 'trip')} not found on {targetDay.name}; removed from the copied blocks.</li>}
        {impact.removedDeadheadCount > 0 && <li>{plural(impact.removedDeadheadCount, 'deadhead')} next to removed trips removed.</li>}
        {emptiedLabels.length > 0 && <li>Kept without trips: {emptiedLabels.join(', ')}.</li>}
        {impact.ambiguousCount > 0 && <li>{plural(impact.ambiguousCount, 'trip')} had more than one identical candidate; paired in time order.</li>}
        {newFindings > 0 && <li>{plural(newFindings, 'validation finding')} on the copied blocks ({preview.sourceBlockFindingCount} on {sourceName}).</li>}
      </ul>}
      {refused && <InlineNote kind="warn">{impact.belowThreshold ? `Only ${impact.matchedTripCount} of ${impact.heldTripCount} trips in the ${sourceName} blocks match ${targetDay.name} trips. The timetables differ too much to copy blocks. Copy trips first, or build these blocks by hand.` : 'This copy cannot be made. Choose another source day.'}</InlineNote>}
      {emptySource && !refused && <InlineNote kind="warn">{sourceName} has no blocks in this blocking scenario. Copying deletes {plural(impact.replacedTargetBlockCount, `${targetDay.name} block`)}.</InlineNote>}
      {!emptySource && !refused && impact.replacedTargetBlockCount > 0 && <p>The {plural(impact.replacedTargetBlockCount, 'block')} now on {targetDay.name} are replaced. This cannot be undone.</p>}
      {needsAcknowledgment && <label className="clear-target"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} /> Copy anyway; trips that are not found are removed from their blocks</label>}
      {!refused && !needsAcknowledgment && !emptySource && impact.heldTripCount > 0 && <InlineNote kind="ok">Every trip matches a {targetDay.name} trip exactly.</InlineNote>}
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions">
      <button onClick={onClose} disabled={busy}>Cancel</button>
      {preview && <button className={emptySource ? 'danger' : 'primary'} onClick={() => void apply()} disabled={!canApply}>{busy ? 'Copying…' : emptySource ? 'Clear blocks' : 'Copy blocks'}</button>}
    </div>
  </ModalDialog>;
}
