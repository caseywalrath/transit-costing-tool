import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { ModalDialog } from '../ModalDialog';
import { type RouteDefinitionApplication } from '../../application/routeDefinitionService';
import { formatDuration } from '../format';
import { addRuntimeBand, duplicateRuntimeBand, removeRuntimeBand, runtimeBandTotalSeconds, updateRuntimeBand, type RuntimeCalculationMethod } from '../../application/tripsWorkspaceView';
import { formatRuntimeDuration, parseRuntimeDuration } from '../../domain/durations';
import { formatServiceTime, parseServiceTime } from '../../domain/time';
import { type Node, type RoutePattern, type RuntimeProfile, type ValidationFinding } from '../../domain/types';
import { userMessage } from '../shared/messages';
import { useGridNavigation } from '../shared/useGridNavigation';
import { TrashIcon, CopyIcon } from '../shared/icons';

type RuntimeBand = RuntimeProfile['bands'][number];
export type RuntimeEditorHandle = { addBand: () => void; discard: () => void; /** Resolves to true when the profile was validated and saved. */ save: () => Promise<boolean> };
/** `changeCount` counts the edited cells (From, To, and segments) against the saved profile, plus one for each removed band. */
export type RuntimeEditorState = { dirty: boolean; saving: boolean; changeCount: number };

export function countRuntimeChanges(saved: RuntimeProfile, draft: RuntimeProfile): number {
  const savedBands = new Map(saved.bands.map((band) => [band.id, band]));
  const draftIds = new Set(draft.bands.map((band) => band.id));
  const cells = (band: RuntimeBand) => [band.startTime, band.endTime, ...band.segmentRuntimeSeconds];
  const edited = draft.bands.reduce((total, band) => { const before = savedBands.get(band.id); const after = cells(band); return total + (before ? after.filter((value, index) => cells(before)[index] !== value).length : after.length); }, 0);
  return edited + saved.bands.filter((band) => !draftIds.has(band.id)).length;
}
export const RuntimeEditor2 = forwardRef<RuntimeEditorHandle, { service: RouteDefinitionApplication; profile: RuntimeProfile; pattern: RoutePattern; nodes: Node[]; onStateChange: (state: RuntimeEditorState) => void; onSaved: () => Promise<void>; onError: (error: unknown) => void }>(function RuntimeEditor2({ service, profile, pattern, nodes, onStateChange, onSaved, onError }, ref) {
  const [draft, setDraft] = useState(profile);
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [saving, setSaving] = useState(false);
  const messageId = useId();
  const profileSignature = JSON.stringify(profile);
  const lastProfileSignature = useRef(profileSignature);
  useEffect(() => {
    if (lastProfileSignature.current === profileSignature) return;
    lastProfileSignature.current = profileSignature;
    setDraft(profile);
    setFindings([]);
  }, [profile, profileSignature]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const nodeName = (id: string) => nodes.find((node) => node.id === id)?.shortName || nodes.find((node) => node.id === id)?.name || 'Unnamed point';
  const updateBand = (index: number, patch: Partial<RuntimeProfile['bands'][number]>) => setDraft((current) => updateRuntimeBand(current, index, patch));
  const addBand = () => setDraft((current) => addRuntimeBand(current, pattern.points.length - 1));
  const duplicateBand = (index: number) => setDraft((current) => duplicateRuntimeBand(current, index));
  const discard = () => { setDraft(profile); setFindings([]); };
  async function save(): Promise<boolean> {
    const nextFindings = await service.validateRuntimeProfile(draft, pattern);
    setFindings(nextFindings);
    if (nextFindings.some((finding) => finding.severity === 'error')) return false;
    setSaving(true);
    try { await service.saveRuntimeProfile(draft); await onSaved(); return true; } catch (error) { onError(error); return false; } finally { setSaving(false); }
  }
  useImperativeHandle(ref, () => ({ addBand, discard, save }), [draft, profile, pattern]);
  const changeCount = countRuntimeChanges(profile, draft);
  useEffect(() => onStateChange({ dirty, saving, changeCount }), [dirty, saving, changeCount, onStateChange]);
  // Grid columns: 0 is From, 1 is To, then one column per segment.
  const segmentCount = pattern.points.length - 1;
  const cellValue = (band: RuntimeBand, c: number) => c === 0 ? band.startTime : c === 1 ? band.endTime : band.segmentRuntimeSeconds[c - 2];
  const cellText = (r: number, c: number) => { const value = cellValue(draft.bands[r], c); return c < 2 ? formatServiceTime(value, value % 60 !== 0) : formatRuntimeDuration(value); };
  const cellLabel = (r: number, c: number) => `Time band ${r + 1} ${c === 0 ? 'start' : c === 1 ? 'end' : `segment ${c - 1}`}`;
  const grid = useGridNavigation({
    rowCount: draft.bands.length, colCount: segmentCount + 2, isEditable: () => !saving, cellText,
    onCommit: (r, c, text) => {
      const duration = c >= 2;
      if (!text.trim()) return duration ? 'Enter a runtime. Zero is valid.' : 'Enter a time.';
      let next: number | undefined;
      try { next = duration ? parseRuntimeDuration(text) : parseServiceTime(text); } catch { next = undefined; }
      if (next === undefined) return duration ? 'Use minutes such as 7, :07, or 7:30.' : 'Use a time such as 6:30 or 25:00.';
      const value = next;
      updateBand(r, c === 0 ? { startTime: value } : c === 1 ? { endTime: value } : { segmentRuntimeSeconds: draft.bands[r].segmentRuntimeSeconds.map((item, index) => index === c - 2 ? value : item) });
      return undefined;
    },
  });
  // "+ Add time band" focuses the new band's first cell once it renders.
  const focusNewBand = useRef(false);
  useEffect(() => { if (!focusNewBand.current) return; focusNewBand.current = false; grid.moveTo({ r: draft.bands.length - 1, c: 0 }); }, [draft.bands.length]);
  const savedBands = new Map(profile.bands.map((band) => [band.id, band]));
  return <div className="runtime-editor">
    <div className="table-scroll data-grid runtime-table"><table className="grid-table" role="grid" aria-label="Runtimes">
      <thead><tr><th scope="col">From</th><th scope="col">To</th>{pattern.points.slice(1).map((point, index) => <th scope="col" key={point.id}><span className="segment-header">{nodeName(pattern.points[index].nodeId)} → {nodeName(point.nodeId)}</span></th>)}<th scope="col" className="runtime-total-heading">Total</th><th scope="col"><span className="visually-hidden">Time band actions</span></th></tr></thead>
      <tbody>{draft.bands.map((band, bandIndex) => <tr key={band.id} {...grid.rowProps(bandIndex)} className={findings.some((finding) => finding.parameters?.bandId === band.id || finding.parameters?.previousBandId === band.id) ? 'runtime-row-error' : undefined}>
        {Array.from({ length: segmentCount + 2 }, (_, c) => {
          const saved = savedBands.get(band.id);
          const edited = !saved || cellValue(saved, c) !== cellValue(band, c);
          const editing = grid.editing?.r === bandIndex && grid.editing.c === c;
          return <td key={c} {...grid.cellProps(bandIndex, c)} className={edited ? 'grid-cell grid-cell--edited' : 'grid-cell'} data-cell={cellLabel(bandIndex, c)}>
            {editing ? <input {...grid.inputProps} className="grid-cell__input" aria-label={cellLabel(bandIndex, c)} aria-describedby={grid.message ? messageId : undefined} /> : <span>{cellText(bandIndex, c)}</span>}
          </td>;
        })}
        <td className="runtime-total">{formatDuration(runtimeBandTotalSeconds(band))}</td>
        <td><div className="row-actions"><button className="icon-button" onClick={() => duplicateBand(bandIndex)} aria-label={`Duplicate time band ${bandIndex + 1}`} title="Duplicate time band"><CopyIcon /></button><button className="icon-button icon-button--danger" onClick={() => setDraft((current) => removeRuntimeBand(current, bandIndex))} aria-label={`Remove time band ${bandIndex + 1}`} title="Remove time band"><TrashIcon /></button></div></td>
      </tr>)}{draft.bands.length === 0 && <tr><td colSpan={pattern.points.length + 3} className="table-empty">Add a time band to enter runtimes.</td></tr>}<tr className="table-add-row"><td colSpan={pattern.points.length + 3}><button type="button" className="ghost" disabled={saving} onClick={() => { focusNewBand.current = true; addBand(); }}><span aria-hidden="true">+ </span>Add time band</button></td></tr></tbody>
    </table></div>
    <p id={messageId} className="grid-message" role="status" aria-live="polite">{grid.message}</p>
    {findings.length > 0 && <p className="field-error" role="alert">{[...new Set(findings.map(userMessage))].join(' ')}</p>}
  </div>;
});

export const CALCULATION_METHOD_LABELS: Record<NonNullable<RuntimeProfile['calculationMethod']>, string> = { singleBand: 'Single band for trip', segmentStart: 'Band at segment start', blendSegments: 'Legacy continuous blend' };
export const methodLabel = (method: RuntimeProfile['calculationMethod']) => CALCULATION_METHOD_LABELS[method ?? 'singleBand'];
/**
 * Confirms a change of the Route's runtime calculation method (Decision 0045). The method applies to every Runtime profile of every
 * Pattern on the Route; the Trips calculated from a profile whose method changes are reported as having changed runtimes.
 */
export function RouteRuntimeMethodDialog({ routeName, method, impact, busy, onConfirm, onClose }: { routeName: string; method: RuntimeCalculationMethod; impact?: { profileCount: number; tripCount: number }; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return <ModalDialog labelledBy="route-runtime-method-title" className="confirm-dialog" onClose={onClose} busy={busy}>
    <h2 id="route-runtime-method-title">Use {methodLabel(method)} for {routeName}?</h2>
    <p>The calculation method applies to every runtime profile of every pattern on this route, on every service day and trip profile.</p>
    {impact ? <p role="status">{impact.profileCount} runtime profile{impact.profileCount === 1 ? '' : 's'} will change. {impact.tripCount} trip{impact.tripCount === 1 ? '' : 's'} will be marked Run times changed; their saved times stay as they are until you regenerate them.</p> : <p role="status">Reviewing the change…</p>}
    <div className="dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" type="button" onClick={onConfirm} disabled={busy || !impact}>{busy ? 'Changing…' : 'Change method'}</button></div>
  </ModalDialog>;
}
