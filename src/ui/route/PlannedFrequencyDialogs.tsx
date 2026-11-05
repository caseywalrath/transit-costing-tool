import { useEffect, useState } from 'react';
import { ModalDialog } from '../ModalDialog';
import { InlineNote } from '../shared/surfaces';
import { formatServiceTime } from '../../domain/time';
import { tripsPerHour } from '../../domain/plannedFrequencies';
import { PlannedFrequencyPreviewStaleError, type CopyFromDayPreview, type CopyFromScenarioPreview, type PlannedFrequencyService, type ScenarioRouteSource } from '../../application/plannedFrequencyService';
import type { PlannedPeriod, ServiceDayDefinition } from '../../domain/types';

export const formatHeadway = (seconds: number): string => (seconds % 60 === 0 ? String(seconds / 60) : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
const formatTime = (seconds: number): string => formatServiceTime(seconds, seconds % 60 !== 0);
const formatRate = (headwaySeconds: number): string => tripsPerHour({ headwaySeconds }).toFixed(1);

function PeriodList({ periods, label }: { periods: PlannedPeriod[]; label: string }) {
  return <div className="table-scroll"><table aria-label={label}><thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Headway</th><th scope="col">Trips/hr</th></tr></thead><tbody>
    {periods.map((period) => <tr key={period.id}><td>{formatTime(period.startTime)}</td><td>{formatTime(period.endTime)}</td><td>{formatHeadway(period.headwaySeconds)} min</td><td>{formatRate(period.headwaySeconds)}</td></tr>)}
  </tbody></table></div>;
}

/** Copy the plan of another Service day of this Route onto the open day. */
export function CopyFromDayDialog({ service, routeId, targetDay, sourceDays, onClose, onCopied, onError }: { service: PlannedFrequencyService; routeId: string; targetDay: ServiceDayDefinition; sourceDays: ServiceDayDefinition[]; onClose: () => void; onCopied: () => void; onError: (error: unknown) => void }) {
  const [sourceId, setSourceId] = useState(sourceDays[0]?.id ?? '');
  const [preview, setPreview] = useState<CopyFromDayPreview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    setPreview(undefined); setMessage('');
    if (!sourceId) return;
    service.previewCopyFromDay(routeId, sourceId, targetDay.id).then((next) => { if (current) setPreview(next); }, (error: unknown) => { if (current) setMessage(error instanceof Error ? error.message : 'Unable to preview the copy.'); });
    return () => { current = false; };
  }, [service, routeId, sourceId, targetDay.id]);
  async function apply() {
    if (!preview) return;
    setBusy(true);
    try { await service.applyCopyFromDay(preview); onCopied(); onClose(); }
    catch (error) { if (error instanceof PlannedFrequencyPreviewStaleError) { setMessage(error.message); setPreview(undefined); setSourceId((id) => id); } else onError(error); }
    finally { setBusy(false); }
  }
  return <ModalDialog labelledBy="pf-copy-day-title" className="confirm-dialog planned-copy-dialog" busy={busy} onClose={onClose}>
    <h2 id="pf-copy-day-title">Copy plan to {targetDay.name}</h2>
    <label className="dialog-field">Copy from<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{sourceDays.map((day) => <option key={day.id} value={day.id}>{day.name}</option>)}</select></label>
    {message && <p className="field-error" role="alert">{message}</p>}
    {preview && <>
      <PeriodList periods={preview.periods} label={`Periods to copy from ${sourceDays.find((day) => day.id === sourceId)?.name ?? ''}`} />
      {preview.replaces ? <InlineNote kind="warn">{targetDay.name} already has a plan with {preview.replaces.periods.length} period{preview.replaces.periods.length === 1 ? '' : 's'}. Copying replaces it.</InlineNote> : <InlineNote>{targetDay.name} has no plan yet.</InlineNote>}
    </>}
    <div className="dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="primary" disabled={busy || !preview} onClick={() => void apply()}>{busy ? 'Copying…' : 'Copy'}</button></div>
  </ModalDialog>;
}

/** One-time copy from a Route of another Scenario of the Project (Decision 0058 item 9). */
export function CopyFromScenarioDialog({ service, scenarioId, routeId, nodeName, onClose, onCopied, onError }: { service: PlannedFrequencyService; scenarioId: string; routeId: string; nodeName: (nodeId: string) => string; onClose: () => void; onCopied: () => void; onError: (error: unknown) => void }) {
  const [sources, setSources] = useState<ScenarioRouteSource[]>();
  const [sourceScenarioId, setSourceScenarioId] = useState('');
  const [sourceRouteId, setSourceRouteId] = useState('');
  const [preview, setPreview] = useState<CopyFromScenarioPreview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    service.listScenarioRouteSources(scenarioId).then((list) => {
      if (!current) return;
      setSources(list);
      const first = list.find((item) => item.routes.length) ?? list[0];
      setSourceScenarioId(first?.scenarioId ?? ''); setSourceRouteId(first?.routes[0]?.id ?? '');
    }, (error: unknown) => { if (current) onError(error); });
    return () => { current = false; };
  }, [service, scenarioId, onError]);
  const source = sources?.find((item) => item.scenarioId === sourceScenarioId);
  useEffect(() => {
    let current = true;
    setPreview(undefined); setMessage('');
    if (!sourceScenarioId || !sourceRouteId) return;
    service.previewCopyFromScenario({ sourceScenarioId, sourceRouteId, targetRouteId: routeId }).then((next) => { if (current) setPreview(next); }, (error: unknown) => { if (current) setMessage(error instanceof Error ? error.message : 'Unable to preview the copy.'); });
    return () => { current = false; };
  }, [service, sourceScenarioId, sourceRouteId, routeId]);
  async function apply() {
    if (!preview) return;
    setBusy(true);
    try { await service.applyCopyFromScenario(preview); onCopied(); onClose(); }
    catch (error) { if (error instanceof PlannedFrequencyPreviewStaleError) { setMessage(error.message); setPreview(undefined); } else onError(error); }
    finally { setBusy(false); }
  }
  return <ModalDialog labelledBy="pf-copy-scenario-title" className="confirm-dialog planned-copy-dialog" busy={busy} onClose={onClose}>
    <h2 id="pf-copy-scenario-title">Copy plans from another scenario</h2>
    {sources && sources.length === 0 ? <p>This project has no other scenario.</p> : <>
      <label className="dialog-field">Scenario<select value={sourceScenarioId} onChange={(event) => { const next = sources?.find((item) => item.scenarioId === event.target.value); setSourceScenarioId(event.target.value); setSourceRouteId(next?.routes[0]?.id ?? ''); }}>{sources?.map((item) => <option key={item.scenarioId} value={item.scenarioId}>{item.scenarioName}</option>)}</select></label>
      <label className="dialog-field">Route<select value={sourceRouteId} onChange={(event) => setSourceRouteId(event.target.value)}>{source?.routes.map((route) => <option key={route.id} value={route.id}>{route.name || 'Untitled route'} ({route.plannedDayCount} planned day{route.plannedDayCount === 1 ? '' : 's'})</option>)}</select></label>
    </>}
    {message && <p className="field-error" role="alert">{message}</p>}
    {preview && <div className="planned-copy-preview">
      {preview.days.length === 0 && <InlineNote kind="warn">No service day of that route has a plan that matches a day here.</InlineNote>}
      {preview.days.map((day) => <section key={day.sourceServiceDayId} aria-label={`${day.targetServiceDayName} plan`}>
        <h3>{day.sourceServiceDayName} → {day.targetServiceDayName} <span className="planned-copy-tag">{day.replaces ? 'Replaces the existing plan' : 'New'}</span></h3>
        <PeriodList periods={day.periods} label={`Periods for ${day.targetServiceDayName}`} />
      </section>)}
      {preview.unmatchedDays.length > 0 && <InlineNote kind="warn">Not copied, no matching service day: {preview.unmatchedDays.map((day) => day.name).join(', ')}.</InlineNote>}
      {preview.unmatchedNodes.length > 0 && <InlineNote kind="warn">No matching stop here, so the default measure stop is used: {[...new Set(preview.unmatchedNodes.map((node) => node.nodeName))].join(', ')}.</InlineNote>}
      {preview.days.some((day) => Object.keys(day.measureNodeIdByDirectionId).length > 0) && <p className="planned-copy-note">Measured at: {[...new Set(preview.days.flatMap((day) => Object.values(day.measureNodeIdByDirectionId)).map(nodeName))].join(', ')}.</p>}
    </div>}
    <div className="dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="primary" disabled={busy || !preview || preview.days.length === 0} onClick={() => void apply()}>{busy ? 'Copying…' : 'Copy plans'}</button></div>
  </ModalDialog>;
}

export function ClearPlanDialog({ dayName, busy, onConfirm, onClose }: { dayName: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return <ModalDialog role="alertdialog" labelledBy="pf-clear-title" className="confirm-dialog" busy={busy} onClose={onClose}>
    <h2 id="pf-clear-title">Clear the {dayName} plan?</h2>
    <p>This deletes the planned frequencies for {dayName}. Trips are not changed.</p>
    <div className="dialog-actions"><button type="button" autoFocus onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="danger" disabled={busy} onClick={onConfirm}>{busy ? 'Clearing…' : 'Clear plan'}</button></div>
  </ModalDialog>;
}
