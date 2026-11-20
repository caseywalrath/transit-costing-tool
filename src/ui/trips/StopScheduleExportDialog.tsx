import { useState, type FormEvent } from 'react';
import { ModalDialog } from '../ModalDialog';
import { InlineNote } from '../shared/surfaces';
import type { StopScheduleColumnMode } from '../../domain/stopSchedule';

export interface StopScheduleExportOptions { columnMode: StopScheduleColumnMode; omitTimepointsWithoutStopId: boolean; }

/**
 * Decision 0084. Options of the stop schedule export. `onExport` downloads the file and returns whether any direction had an order
 * conflict; with a conflict the dialog stays open with a note, so the planner knows why a stop appears twice.
 */
export function StopScheduleExportDialog({ scope, onExport, onClose }: { scope: string; onExport: (options: StopScheduleExportOptions) => Promise<boolean>; onClose: () => void }) {
  const [columnMode, setColumnMode] = useState<StopScheduleColumnMode>('sample');
  const [omit, setOmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const hasConflict = await onExport({ columnMode, omitTimepointsWithoutStopId: omit });
      if (hasConflict) setConflict(true); else onClose();
    } finally { setBusy(false); }
  }
  return <ModalDialog labelledBy="stop-schedule-export-title" className="confirm-dialog stop-schedule-export-dialog" onClose={onClose} busy={busy} onSubmit={(event) => void submit(event)} as="form">
    <h2 id="stop-schedule-export-title">Export stop schedule</h2>
    <p className="copy-scope">{scope} · Both directions</p>
    <fieldset className="copy-mode" disabled={busy}>
      <legend>Columns</legend>
      <label><input type="radio" name="stop-schedule-columns" value="sample" checked={columnMode === 'sample'} onChange={() => setColumnMode('sample')} autoFocus /> One sample trip per period</label>
      <label><input type="radio" name="stop-schedule-columns" value="all" checked={columnMode === 'all'} onChange={() => setColumnMode('all')} /> Every trip</label>
    </fieldset>
    <fieldset className="copy-mode" disabled={busy}>
      <legend>Rows</legend>
      <label><input type="checkbox" checked={omit} onChange={(event) => setOmit(event.target.checked)} /> Leave out timepoints without a stop ID</label>
    </fieldset>
    {conflict && <InlineNote kind="warn" live>Exported. Some stops are listed twice because patterns visit them in different orders.</InlineNote>}
    <div className="dialog-actions">
      <button type="button" onClick={onClose} disabled={busy}>{conflict ? 'Close' : 'Cancel'}</button>
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Exporting…' : 'Export'}</button>
    </div>
  </ModalDialog>;
}
