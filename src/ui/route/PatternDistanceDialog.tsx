import { useEffect, useRef, useState } from 'react';
import { type RouteDefinitionApplication, type RouteEditCommitResult, type SegmentDistancePreview } from '../../application/routeDefinitionService';
import { userFacingError } from '../errorMessages';
import { formatMiles } from '../format';
import { ModalDialog } from '../ModalDialog';
import { type RouteDefinitionAggregate, type RoutePattern } from '../../domain/types';

const SKIP_TITLES = {
  ambiguous: 'Segment appears more than once in a pattern',
  conflict: 'Other patterns disagree',
} as const;

/** Decision 0065: preview, then confirm, a fill of this draft's 0 segments from other patterns, or a copy of its saved segments to them. Copies the structure of `SegmentRuntimeDialog`. */
export function PatternDistanceDialog({ service, mode, aggregate, draft, onFilled, onCopied, onClose }: { service: Pick<RouteDefinitionApplication, 'previewDistanceFill' | 'applyDistanceFill' | 'previewDistanceCopy' | 'applyDistanceCopy'>; mode: 'copy' | 'fill'; aggregate: RouteDefinitionAggregate; draft: RoutePattern; onFilled: (next: RoutePattern) => void; onCopied: (result: RouteEditCommitResult) => void; onClose: () => void }) {
  const copy = mode === 'copy';
  const [excluded, setExcluded] = useState<string[]>([]);
  const [preview, setPreview] = useState<SegmentDistancePreview>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const firstCheckbox = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    let current = true;
    const shown = (next: SegmentDistancePreview) => { if (current) { setPreview(next); setError(''); } };
    const failed = (reason: unknown) => { if (current) setError(userFacingError(reason, 'The distances could not be previewed.')); };
    if (copy) service.previewDistanceCopy(draft.id, excluded).then(shown, failed);
    else { try { shown(service.previewDistanceFill(aggregate, draft)); } catch (reason) { failed(reason); } }
    return () => { current = false; };
  }, [service, copy, draft, aggregate, excluded]);
  useEffect(() => { if (preview && copy && !focused.current) { focused.current = true; firstCheckbox.current?.focus(); } }, [preview, copy]);
  async function apply() {
    if (!preview) return;
    if (!copy) { onFilled(service.applyDistanceFill(draft, preview)); return; }
    setBusy(true);
    try { onCopied(await service.applyDistanceCopy(preview)); } catch (reason) { setError(userFacingError(reason, 'The distances could not be saved.')); setBusy(false); }
  }
  const name = (patternId: string) => preview?.patternNames[patternId] ?? 'Pattern';
  const label = (patternId: string, segmentIndex: number) => preview?.segmentLabels[patternId]?.[segmentIndex] ?? 'Segment';
  const affected = new Map((preview?.affectedPatterns ?? []).map((item) => [item.patternId, item]));
  const rows = preview && copy ? preview.copyCandidates.filter((candidate) => excluded.includes(candidate.patternId) || affected.has(candidate.patternId)) : [];
  const skipGroups = (['ambiguous', 'conflict'] as const).map((reason) => ({ reason, skips: (preview?.skips ?? []).filter((skip) => skip.reason === reason) })).filter((group) => group.skips.length);
  const skipText = (skip: SegmentDistancePreview['skips'][number]) => {
    const parts = [name(skip.patternId)];
    if (skip.segmentIndex !== undefined) parts.push(label(preview?.sourcePatternId ?? draft.id, skip.segmentIndex)); // A skip's segment index is the open pattern's.
    if (skip.candidates) parts.push(skip.candidates.map((candidate) => `${formatMiles(candidate.miles)} (${candidate.patternIds.map(name).join(', ')})`).join(' vs '));
    return parts.join(' · ');
  };
  return <ModalDialog labelledBy="pattern-distance-title" className="confirm-dialog preview-dialog segment-runtime-dialog" onClose={onClose} busy={busy}>
    <h2 id="pattern-distance-title">{copy ? 'Copy distances to other patterns' : 'Fill distances from other patterns'}</h2>
    <p>{copy ? "Distances for segments shared with other patterns of this route will be replaced with this pattern's values. Opposite-direction segments are not changed." : 'Segments of 0.00 mi in this pattern will be filled from other patterns of this route that share the segment. When no pattern shares it in this direction, the opposite direction is used.'}</p>
    {!preview && !error && <p role="status">Loading preview…</p>}
    {preview && <>
      {copy && rows.length > 0 && <div className="preview-times"><table>
        <thead><tr><th scope="col">Include</th><th scope="col">Pattern</th><th scope="col">Segments changed</th><th scope="col">Replaced</th></tr></thead>
        <tbody>{rows.map((row, index) => {
          const item = affected.get(row.patternId);
          return <tr key={row.patternId}>
            <td><input ref={index === 0 ? firstCheckbox : undefined} type="checkbox" checked={!excluded.includes(row.patternId)} disabled={busy} aria-label={`Include ${name(row.patternId)}`} onChange={(event) => setExcluded((current) => event.target.checked ? current.filter((id) => id !== row.patternId) : [...current, row.patternId])} /></td>
            <td>{name(row.patternId)}</td><td>{item?.changeCount ?? 0}</td><td>{item?.overwriteCount ?? 0}</td>
          </tr>;
        })}</tbody>
      </table></div>}
      {!copy && preview.changes.length > 0 && <div className="preview-times"><table>
        <thead><tr><th scope="col">Segment</th><th scope="col">Miles</th><th scope="col">Source</th></tr></thead>
        <tbody>{preview.changes.map((change) => <tr key={change.segmentIndex}>
          <td>{preview.segmentLabels[draft.id]?.[change.segmentIndex] ?? 'Segment'}</td>
          <td>{formatMiles(change.nextMiles)}</td>
          <td>{change.sourcePatternIds.map(name).join(', ')}{change.fromReverse ? ' (from reverse)' : ''}</td>
        </tr>)}</tbody>
      </table></div>}
      {preview.changes.length === 0 && <p>No distances would change.</p>}
      {copy && preview.changes.length > 0 && <>
        <button type="button" className="disclosure" aria-expanded={detailsOpen} aria-controls="pattern-distance-details" onClick={() => setDetailsOpen((open) => !open)}><span aria-hidden="true" className="disclosure__arrow">{detailsOpen ? '▾' : '▸'}</span>Show segment details</button>
        {detailsOpen && <ul id="pattern-distance-details" className="recalculation-candidates">{preview.changes.map((change) => <li key={`${change.patternId}:${change.segmentIndex}`}>{name(change.patternId)} · {label(change.patternId, change.segmentIndex)} · {formatMiles(change.previousMiles)} → {formatMiles(change.nextMiles)} mi</li>)}</ul>}
      </>}
      {skipGroups.map((group) => <div key={group.reason} className="segment-runtime-skips"><p><strong>{SKIP_TITLES[group.reason]}</strong></p><ul className="recalculation-candidates">{group.skips.map((skip, index) => <li key={index}>{skipText(skip)}</li>)}</ul></div>)}
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button autoFocus={!copy} type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" type="button" onClick={() => void apply()} disabled={!preview || preview.changes.length === 0 || busy}>{busy ? 'Saving…' : copy ? 'Replace distances' : 'Fill distances'}</button></div>
  </ModalDialog>;
}
