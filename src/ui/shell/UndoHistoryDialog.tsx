import { useEffect, useState } from 'react';
import type { RestorePointListing, RestorePointStatus } from '../../application/restorePointService';
import { ModalDialog } from '../ModalDialog';
import { restorePointContext, restorePointLabel } from '../shared/messages';

/** Why a restore point cannot be restored now, in plain words. */
export function restoreRefusalText(status: RestorePointStatus): string {
  if (status.state === 'projectMissing') return 'Its project was deleted. Restore the project first.';
  if (status.state === 'projectExists') return 'This project exists.';
  if (status.state !== 'conflict') return '';
  if (!status.named.length) return 'Changed since.';
  const names = status.named.map((conflict) => conflict.name);
  return `Changed since: ${names.join(', ')}${status.more ? ` and ${status.more} more` : ''}.`;
}

/** The age of a restore point, coarse: "just now", "5 min ago", "3 h ago", "2 days ago". */
export function restorePointAge(createdAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(createdAt)) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Decision 0081: the restore points of the open project and the deleted projects, newest first. `projectId` empty lists only deleted
 * projects (the no-project empty state).
 */
export function UndoHistoryDialog({ projectId, list, onRestore, onClose }: {
  projectId: string;
  list: () => Promise<RestorePointListing[]>;
  onRestore: (point: RestorePointListing) => Promise<void>;
  onClose: () => void;
}) {
  const [points, setPoints] = useState<RestorePointListing[]>();
  const [busyId, setBusyId] = useState('');
  useEffect(() => {
    let live = true;
    void list().then((all) => { if (live) setPoints(all.filter((point) => point.scope === 'project' ? point.status.state === 'restorable' : point.projectId === projectId)); }).catch(() => { if (live) setPoints([]); });
    return () => { live = false; };
  }, [list, projectId]);
  return <ModalDialog labelledBy="undo-history-title" className="confirm-dialog undo-history" onClose={onClose} busy={Boolean(busyId)}>
    <h2 id="undo-history-title">Undo history</h2>
    {!points ? <p>Loading…</p> : !points.length ? <p>Nothing to undo.</p> : <ul className="undo-history__list">
      {points.map((point) => {
        const context = point.scope === 'project' ? 'Deleted project' : restorePointContext(point);
        return <li key={point.id} className="undo-history__row">
          <div className="undo-history__text">
            <span className="undo-history__label">{restorePointLabel(point)}</span>
            <span className="undo-history__meta">{[context, restorePointAge(point.createdAt)].filter(Boolean).join(' · ')}</span>
          </div>
          {point.status.state === 'restorable'
            ? <button type="button" disabled={Boolean(busyId)} aria-label={`Restore: ${restorePointLabel(point)}`} onClick={() => { setBusyId(point.id); void onRestore(point).finally(() => setBusyId('')); }}>Restore</button>
            : <span className="undo-history__reason">{restoreRefusalText(point.status)}</span>}
        </li>;
      })}
    </ul>}
    <div><button type="button" autoFocus onClick={onClose}>Close</button></div>
  </ModalDialog>;
}
