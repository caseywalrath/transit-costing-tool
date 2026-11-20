import { useState } from 'react';
import type { RouteStopFields } from '../../domain/routeStopManagement';
import type { RouteStop } from '../../domain/types';
import { ModalDialog } from '../ModalDialog';

const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`;
const stopTitle = (stop: RouteStop) => [stop.name.trim() || 'Untitled stop', stop.stopCode?.trim()].filter(Boolean).join(' · ');
const numberOrUndefined = (text: string) => { const trimmed = text.trim(); if (!trimmed) return undefined; const value = Number(trimmed); return Number.isFinite(value) ? value : Number.NaN; };

export interface DirectionChoice { id: string; name: string }
/** A stop row of a review: the stop and the names of the patterns that place it. */
export interface StopUseRow { stop: RouteStop; patternNames: string[] }

/** The footer and error line every stop dialog shares. `onConfirm` resolves to an error text when the write is refused. */
function useConfirm(onConfirm: () => Promise<string | undefined>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    setBusy(true);
    const refused = await onConfirm();
    if (refused) { setError(refused); setBusy(false); }
  }
  return { busy, error, confirm };
}

/** Decision 0087 item 4. Moves one direction's placements of a stop to a new record, whose name, stop ID, and location are entered here. */
export function SplitStopDialog({ stop, directions, onConfirm, onClose }: { stop: RouteStop; directions: DirectionChoice[]; onConfirm: (directionId: string, newStop: RouteStopFields) => Promise<string | undefined>; onClose: () => void }) {
  const [directionId, setDirectionId] = useState(directions[directions.length - 1]?.id ?? '');
  const [name, setName] = useState(stop.name);
  const [stopCode, setStopCode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [speed, setSpeed] = useState(stop.speedLimitMph?.toString() ?? '');
  const values = { latitude: numberOrUndefined(latitude), longitude: numberOrUndefined(longitude), speedLimitMph: numberOrUndefined(speed) };
  const notNumbers = Object.values(values).some((value) => Number.isNaN(value));
  const { busy, error, confirm } = useConfirm(() => onConfirm(directionId, { name, stopCode, ...values }));
  const direction = directions.find((candidate) => candidate.id === directionId);
  return <ModalDialog labelledBy="split-stop-title" className="confirm-dialog route-stop-dialog" onClose={onClose} busy={busy}>
    <h2 id="split-stop-title">Split {stopTitle(stop)} by direction</h2>
    <p>The patterns of the direction you choose move to a new stop. The other directions keep {stop.name.trim() || 'this stop'}, with its stop ID and location.</p>
    <fieldset className="route-stop-dialog__choices"><legend>Direction that moves to the new stop</legend>
      {directions.map((candidate) => <label key={candidate.id}><input type="radio" name="split-direction" checked={candidate.id === directionId} disabled={busy} onChange={() => setDirectionId(candidate.id)} />{candidate.name}</label>)}
    </fieldset>
    <div className="route-stop-dialog__fields">
      <label>New stop name<input value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <label>Stop ID<input value={stopCode} disabled={busy} onChange={(event) => setStopCode(event.target.value)} /></label>
      <label>Latitude<input inputMode="decimal" value={latitude} disabled={busy} onChange={(event) => setLatitude(event.target.value)} /></label>
      <label>Longitude<input inputMode="decimal" value={longitude} disabled={busy} onChange={(event) => setLongitude(event.target.value)} /></label>
      <label>Speed (mph)<input inputMode="decimal" value={speed} disabled={busy} onChange={(event) => setSpeed(event.target.value)} /></label>
    </div>
    {notNumbers && <p className="field-error">Enter latitude, longitude, and speed as numbers.</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" autoFocus onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="primary" disabled={busy || !name.trim() || notNumbers || !direction} onClick={() => void confirm()}>{busy ? 'Splitting…' : `Split for ${direction?.name ?? 'direction'}`}</button></div>
  </ModalDialog>;
}

/** Decision 0087 item 5. Splits every stop shared across directions; the kept direction keeps the stop IDs and locations. */
export function SplitAllStopsDialog({ directions, stops, onConfirm, onClose }: { directions: DirectionChoice[]; stops: RouteStop[]; onConfirm: (input: { keepDirectionId: string; suffixByDirectionId: Record<string, string>; renameKept: boolean }) => Promise<string | undefined>; onClose: () => void }) {
  const [keepDirectionId, setKeepDirectionId] = useState(directions[0]?.id ?? '');
  const [suffixes, setSuffixes] = useState<Record<string, string>>({});
  const [renameKept, setRenameKept] = useState(false);
  const { busy, error, confirm } = useConfirm(() => onConfirm({ keepDirectionId, suffixByDirectionId: suffixes, renameKept }));
  return <ModalDialog labelledBy="split-all-stops-title" className="confirm-dialog preview-dialog route-stop-dialog" onClose={onClose} busy={busy}>
    <h2 id="split-all-stops-title">Split all shared stops</h2>
    <p>Each stop used by more than one direction becomes one stop per direction. The kept direction keeps the stop IDs and locations. The new stops have no stop ID and no location; enter or import them afterwards.</p>
    <label className="route-stop-dialog__keep">Direction that keeps the existing stops<select value={keepDirectionId} disabled={busy} onChange={(event) => setKeepDirectionId(event.target.value)}>{directions.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select></label>
    <div className="route-stop-dialog__fields">{directions.map((direction) => <label key={direction.id}>Name suffix, {direction.name}<input value={suffixes[direction.id] ?? ''} placeholder="None" disabled={busy} onChange={(event) => setSuffixes((current) => ({ ...current, [direction.id]: event.target.value }))} /></label>)}</div>
    <label className="route-stop-dialog__check"><input type="checkbox" checked={renameKept} disabled={busy} onChange={(event) => setRenameKept(event.target.checked)} />Add the suffix to the kept stops too</label>
    <div className="segment-runtime-skips"><p><strong>{plural(stops.length, 'stop')} to split</strong></p><ul className="recalculation-candidates">{stops.map((stop) => <li key={stop.id}>{stopTitle(stop)}</li>)}</ul></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" autoFocus onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="primary" disabled={busy || stops.length === 0} onClick={() => void confirm()}>{busy ? 'Splitting…' : `Split ${plural(stops.length, 'stop')}`}</button></div>
  </ModalDialog>;
}

/** Decision 0087 item 6. Lists the patterns each stop is removed from. */
export function DeleteStopsDialog({ rows, onConfirm, onClose }: { rows: StopUseRow[]; onConfirm: () => Promise<string | undefined>; onClose: () => void }) {
  const { busy, error, confirm } = useConfirm(onConfirm);
  return <ModalDialog labelledBy="delete-stops-title" className="confirm-dialog preview-dialog route-stop-dialog" onClose={onClose} busy={busy}>
    <h2 id="delete-stops-title">Delete {plural(rows.length, 'stop')}?</h2>
    <p>Each stop is removed from every pattern that places it. You can undo this from the notice or from Undo history.</p>
    <div className="preview-times"><table aria-label="Stops to delete"><thead><tr><th scope="col">Stop</th><th scope="col">Removed from</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.stop.id}><td>{stopTitle(row.stop)}</td><td>{row.patternNames.join(', ') || 'No patterns'}</td></tr>)}</tbody></table></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" autoFocus onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="danger" disabled={busy} onClick={() => void confirm()}>{busy ? 'Deleting…' : `Delete ${plural(rows.length, 'stop')}`}</button></div>
  </ModalDialog>;
}

/** Decision 0087 item 7. The chosen stop is kept with its fields; the others' placements point to it. */
export function MergeStopsDialog({ rows, onConfirm, onClose }: { rows: StopUseRow[]; onConfirm: (keepStopId: string) => Promise<string | undefined>; onClose: () => void }) {
  const [keepStopId, setKeepStopId] = useState(rows[0]?.stop.id ?? '');
  const { busy, error, confirm } = useConfirm(() => onConfirm(keepStopId));
  return <ModalDialog labelledBy="merge-stops-title" className="confirm-dialog preview-dialog route-stop-dialog" onClose={onClose} busy={busy}>
    <h2 id="merge-stops-title">Merge {plural(rows.length, 'stop')}</h2>
    <p>Choose the stop to keep. Its name, stop ID, and location stay as they are; the other stops are removed and their patterns use the kept stop.</p>
    <div className="preview-times"><table aria-label="Stops to merge"><thead><tr><th scope="col">Keep</th><th scope="col">Stop</th><th scope="col">Patterns</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.stop.id}><td><input type="radio" name="merge-keep" checked={row.stop.id === keepStopId} disabled={busy} aria-label={`Keep ${stopTitle(row.stop)}`} onChange={() => setKeepStopId(row.stop.id)} /></td><td>{stopTitle(row.stop)}</td><td>{row.patternNames.join(', ') || 'No patterns'}</td></tr>)}</tbody></table></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" autoFocus onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="primary" disabled={busy || !keepStopId} onClick={() => void confirm()}>{busy ? 'Merging…' : 'Merge stops'}</button></div>
  </ModalDialog>;
}
