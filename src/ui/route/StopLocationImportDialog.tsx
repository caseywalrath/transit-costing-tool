import { useState } from 'react';
import type { StopLocationFileRow, StopLocationMatch } from '../../application/stopLocationImport';
import { ModalDialog } from '../ModalDialog';

/** The review of one stop location file against the drawer's rows (Decision 0085 item 7). */
export interface StopLocationImportReview {
  fileName: string;
  missingColumns: boolean;
  matches: StopLocationMatch[];
  conflictStopCodes: string[];
  unmatchedTargetKeys: string[];
  unusedRowLines: number[];
  skippedLineCount: number;
  /** Drawer row key → the row's label. */
  labels: Record<string, string>;
}

const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`;
export const locationText = (row: { latitude?: number; longitude?: number; speedLimitMph?: number }) =>
  [row.latitude !== undefined && row.longitude !== undefined ? `${row.latitude}, ${row.longitude}` : '', row.speedLimitMph !== undefined ? `${row.speedLimitMph} mph` : ''].filter(Boolean).join(' · ') || 'No location';

/**
 * Decision 0085 item 7. Matches by stop ID are applied; matches by name are offered unchecked, because a name can be shared by two different
 * places. Apply writes into the drawer's draft only; the planner saves with Save stops.
 */
export function StopLocationImportDialog({ review, onApply, onClose }: { review: StopLocationImportReview; onApply: (matches: StopLocationMatch[]) => void; onClose: () => void }) {
  const [checked, setChecked] = useState<string[]>([]);
  const byId = review.matches.filter((match) => match.by === 'id');
  const byName = review.matches.filter((match) => match.by === 'name');
  const chosen = [...byId, ...byName.filter((match) => checked.includes(match.key))];
  const label = (key: string) => review.labels[key] ?? 'Row';
  const fileRow = (row: StopLocationFileRow) => [row.stopCode, row.name].filter(Boolean).join(' · ') || `Line ${row.line}`;
  return <ModalDialog labelledBy="stop-location-import-title" className="confirm-dialog preview-dialog stop-location-import-dialog" onClose={onClose}>
    <h2 id="stop-location-import-title">Import stop locations</h2>
    <p className="copy-scope">{review.fileName}</p>
    {review.missingColumns ? <p className="field-error" role="alert">The file has no Latitude and Longitude columns.</p> : <>
      {byId.length > 0 && <div className="preview-times"><table aria-label="Matched by stop ID">
        <caption>Matched by stop ID · {plural(byId.length, 'row')}</caption>
        <thead><tr><th scope="col">Drawer row</th><th scope="col">Location</th></tr></thead>
        <tbody>{byId.map((match) => <tr key={match.key}><td>{label(match.key)}</td><td>{locationText(match.row)}</td></tr>)}</tbody>
      </table></div>}
      {byName.length > 0 && <div className="preview-times"><table aria-label="Matched by name">
        <caption>Matched by name · check the rows to apply</caption>
        <thead><tr><th scope="col">Apply</th><th scope="col">Drawer row</th><th scope="col">File row</th><th scope="col">Location</th></tr></thead>
        <tbody>{byName.map((match) => <tr key={match.key}>
          <td><input type="checkbox" checked={checked.includes(match.key)} aria-label={`Apply to ${label(match.key)}`} onChange={(event) => setChecked((current) => event.target.checked ? [...current, match.key] : current.filter((key) => key !== match.key))} /></td>
          <td>{label(match.key)}</td><td>{fileRow(match.row)}</td><td>{locationText(match.row)}</td>
        </tr>)}</tbody>
      </table></div>}
      {review.matches.length === 0 && <p>No rows of this file match the stops of this pattern.</p>}
      {review.conflictStopCodes.length > 0 && <div className="segment-runtime-skips"><p><strong>Stop IDs with different locations in the file</strong></p><ul className="recalculation-candidates">{review.conflictStopCodes.map((code) => <li key={code}>{code}</li>)}</ul></div>}
      {review.unmatchedTargetKeys.length > 0 && <div className="segment-runtime-skips"><p><strong>Not found in the file</strong></p><ul className="recalculation-candidates">{review.unmatchedTargetKeys.map((key) => <li key={key}>{label(key)}</li>)}</ul></div>}
      {review.unusedRowLines.length > 0 && <p className="stop-location-import-note">{plural(review.unusedRowLines.length, 'file row')} not used: line{review.unusedRowLines.length === 1 ? '' : 's'} {review.unusedRowLines.join(', ')}.</p>}
      {review.skippedLineCount > 0 && <p className="stop-location-import-note">{plural(review.skippedLineCount, 'line')} skipped without a latitude and longitude.</p>}
    </>}
    <div className="dialog-actions"><button type="button" autoFocus onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={chosen.length === 0} onClick={() => onApply(chosen)}>{chosen.length ? `Apply ${plural(chosen.length, 'location')}` : 'Apply'}</button></div>
  </ModalDialog>;
}
