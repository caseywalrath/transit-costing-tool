import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ModalDialog } from '../ModalDialog';
import { type RouteDefinitionApplication } from '../../application/routeDefinitionService';
import { formatDuration } from '../format';
import { addRuntimeBand, duplicateRuntimeBand, removeRuntimeBand, runtimeBandTotalSeconds, updateRuntimeBand, type RuntimeCalculationMethod } from '../../application/tripsWorkspaceView';
import { type Node, type Route, type RoutePattern, type RuntimeProfile, type Trip, type ValidationFinding } from '../../domain/types';
import { userMessage } from '../shared/messages';
import { RuntimeTimeInput } from '../shared/fields';
import { TrashIcon, CopyIcon } from '../shared/icons';

export type RuntimeEditorHandle = { addBand: () => void; discard: () => void; /** Resolves to true when the profile was validated and saved. */ save: () => Promise<boolean> };
export type RuntimeEditorState = { dirty: boolean; saving: boolean };
export const RuntimeEditor2 = forwardRef<RuntimeEditorHandle, { service: RouteDefinitionApplication; profile: RuntimeProfile; pattern: RoutePattern; nodes: Node[]; onStateChange: (state: RuntimeEditorState) => void; onSaved: () => Promise<void>; onError: (error: unknown) => void }>(function RuntimeEditor2({ service, profile, pattern, nodes, onStateChange, onSaved, onError }, ref) {
  const [draft, setDraft] = useState(profile);
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [saving, setSaving] = useState(false);
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
  useEffect(() => onStateChange({ dirty, saving }), [dirty, saving, onStateChange]);
  return <div className="runtime-editor">
    <div className="table-scroll data-grid runtime-table"><table>
      <thead><tr><th scope="col">From</th><th scope="col">To</th>{pattern.points.slice(1).map((point, index) => <th scope="col" key={point.id}><span className="segment-header">{nodeName(pattern.points[index].nodeId)} → {nodeName(point.nodeId)}</span></th>)}<th scope="col" className="runtime-total-heading">Total</th><th scope="col"><span className="visually-hidden">Time band actions</span></th></tr></thead>
      <tbody>{draft.bands.map((band, bandIndex) => <tr key={band.id} className={findings.some((finding) => finding.parameters?.bandId === band.id || finding.parameters?.previousBandId === band.id) ? 'runtime-row-error' : undefined}>
        <td><RuntimeTimeInput label={`Time band ${bandIndex + 1} start`} value={band.startTime} onCommit={(value) => updateBand(bandIndex, { startTime: value })} /></td>
        <td><RuntimeTimeInput label={`Time band ${bandIndex + 1} end`} value={band.endTime} onCommit={(value) => updateBand(bandIndex, { endTime: value })} /></td>
        {band.segmentRuntimeSeconds.map((value, segmentIndex) => <td key={`${band.id}-${segmentIndex}`}><RuntimeTimeInput label={`Time band ${bandIndex + 1} segment ${segmentIndex + 1}`} value={value} duration onCommit={(next) => updateBand(bandIndex, { segmentRuntimeSeconds: band.segmentRuntimeSeconds.map((item, index) => index === segmentIndex ? next : item) })} /></td>)}
        <td className="runtime-total">{formatDuration(runtimeBandTotalSeconds(band))}</td>
        <td><div className="row-actions"><button className="icon-button" onClick={() => duplicateBand(bandIndex)} aria-label={`Duplicate time band ${bandIndex + 1}`} title="Duplicate time band"><CopyIcon /></button><button className="icon-button icon-button--danger" onClick={() => setDraft((current) => removeRuntimeBand(current, bandIndex))} aria-label={`Remove time band ${bandIndex + 1}`} title="Remove time band"><TrashIcon /></button></div></td>
      </tr>)}{draft.bands.length === 0 && <tr><td colSpan={pattern.points.length + 3} className="table-empty">Add a time band to enter runtimes.</td></tr>}<tr className="table-add-row"><td colSpan={pattern.points.length + 3}><button type="button" className="ghost" disabled={saving} onClick={addBand}><span aria-hidden="true">+ </span>Add time band</button></td></tr></tbody>
    </table></div>
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
    <p>The calculation method applies to every Runtime profile of every Pattern on this Route, on every service day and Trip Profile.</p>
    {impact ? <p role="status">{impact.profileCount} Runtime profile{impact.profileCount === 1 ? '' : 's'} will change. {impact.tripCount} Trip{impact.tripCount === 1 ? '' : 's'} will be marked Run times changed; their saved times stay as they are until you regenerate them.</p> : <p role="status">Reviewing the change…</p>}
    <div className="dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" type="button" onClick={onConfirm} disabled={busy || !impact}>{busy ? 'Changing…' : 'Change method'}</button></div>
  </ModalDialog>;
}
