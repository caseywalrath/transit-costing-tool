import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { RouteStopValidationError, STOPS_CHANGED_ELSEWHERE, type RouteDefinitionApplication } from '../../application/routeDefinitionService';
import { matchStopLocations, readStopLocationFile, type StopLocationMatch, type StopLocationTarget } from '../../application/stopLocationImport';
import { orderDirections } from '../../domain/directions';
import { routeStopUsage, type RouteStopFields } from '../../domain/routeStopManagement';
import { normalizeStopLocation, sameLocation } from '../../domain/stops';
import type { RouteDefinitionAggregate, RouteStop, RouteStopSet, ValidationFinding } from '../../domain/types';
import { userFacingError } from '../errorMessages';
import { MenuButton } from '../MenuButton';
import { readStoredRecord } from '../preferences';
import { SaveBar, SelectionBar } from '../shared/bars';
import { LinkIcon } from '../shared/icons';
import { messages, userMessage } from '../shared/messages';
import { SegmentedControl } from '../shared/SegmentedControl';
import { WorkSurface } from '../shared/surfaces';
import { StopLocationImportDialog, type StopLocationImportReview } from './StopLocationImportDialog';
import { DeleteStopsDialog, MergeStopsDialog, SplitAllStopsDialog, SplitStopDialog, type DirectionChoice, type StopUseRow } from './routeStopDialogs';

export type RouteStopsService = Pick<RouteDefinitionApplication, 'getRouteStopSet' | 'saveRouteStopRecords' | 'splitRouteStop' | 'splitSharedRouteStops' | 'deleteRouteStops' | 'mergeRouteStops'>;
/** The workspace's handle on the section, for its navigation guard (Save or Discard before leaving). */
export interface RouteStopsHandle { save: () => Promise<boolean>; discard: () => void }

/** Decision 0087 item 1. Whether the Stops section is open, remembered on this device. */
export const ROUTE_STOPS_OPEN_PREFERENCE_KEY = 'transit-costing-tool.route-stops-open.v1';
function storedOpen(): boolean | undefined { const open = readStoredRecord(ROUTE_STOPS_OPEN_PREFERENCE_KEY).open; return typeof open === 'boolean' ? open : undefined; }
function rememberOpen(open: boolean) { try { localStorage.setItem(ROUTE_STOPS_OPEN_PREFERENCE_KEY, JSON.stringify({ open })); } catch { /* UI preference only. */ } }

const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`;
type Field = 'name' | 'stopCode' | 'latitude' | 'longitude' | 'speedLimitMph';
/** The editable columns, left to right; a pasted block fills across them in this order. */
const FIELDS: { field: Field; label: string; numeric: boolean }[] = [
  { field: 'name', label: 'Stop', numeric: false }, { field: 'stopCode', label: 'Stop ID', numeric: false },
  { field: 'latitude', label: 'Latitude', numeric: true }, { field: 'longitude', label: 'Longitude', numeric: true }, { field: 'speedLimitMph', label: 'Speed (mph)', numeric: true },
];
const isUnusable = (text: string) => text.trim() !== '' && !Number.isFinite(Number(text.trim()));
const parseNumber = (text: string) => { const trimmed = text.trim(); return trimmed && Number.isFinite(Number(trimmed)) ? Number(trimmed) : undefined; };
type Filter = 'all' | 'shared' | 'noCode' | 'noLocation';

/** The stored stop with the typed texts applied: what Save would write for it. */
function editedStop(stop: RouteStop, texts: Record<string, string>): RouteStop {
  const text = (field: Field) => texts[`${stop.id}:${field}`];
  const location = normalizeStopLocation({
    latitude: text('latitude') !== undefined ? parseNumber(text('latitude')) : stop.latitude,
    longitude: text('longitude') !== undefined ? parseNumber(text('longitude')) : stop.longitude,
    speedLimitMph: text('speedLimitMph') !== undefined ? parseNumber(text('speedLimitMph')) : stop.speedLimitMph,
  });
  const stopCode = (text('stopCode') ?? stop.stopCode ?? '').trim();
  return { id: stop.id, name: (text('name') ?? stop.name).trim(), ...(stopCode ? { stopCode } : {}), ...(location ?? {}) };
}
const sameStop = (left: RouteStop, right: RouteStop) => left.name === right.name && (left.stopCode ?? '') === (right.stopCode ?? '') && sameLocation(left, right);

type Dialog = { kind: 'split'; stopId: string } | { kind: 'splitAll' } | { kind: 'delete'; stopIds: string[] } | { kind: 'merge'; stopIds: string[] };

/**
 * Decision 0087. The stop records of the Route, with the directions that use each one. Fields are edited in place and saved together; split,
 * delete, and merge are reviewed in a dialog and store a restore point. Placing and ordering stops stays in the Stops drawer, and while the
 * drawer is open this section is read-only, so the two never edit one stop set at once.
 */
export const RouteStopsSurface = forwardRef<RouteStopsHandle, { service: RouteStopsService; aggregate: RouteDefinitionAggregate; drawerOpen: boolean; onDirtyChange: (dirty: boolean) => void }>(function RouteStopsSurface({ service, aggregate, drawerOpen, onDirtyChange }, ref) {
  const [loaded, setLoaded] = useState<{ set?: RouteStopSet }>();
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<boolean | undefined>(storedOpen);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog>();
  const [importReview, setImportReview] = useState<StopLocationImportReview>();
  const fileInput = useRef<HTMLInputElement>(null);

  const accept = useCallback((set: RouteStopSet | undefined) => { setLoaded({ set }); setTexts({}); setFindings([]); setError(''); setSelected((current) => current.filter((id) => set?.stops.some((stop) => stop.id === id))); }, []);
  const stops = loaded?.set?.stops ?? [];
  const editedStops = stops.map((stop) => editedStop(stop, texts));
  const unusableKeys = Object.entries(texts).filter(([key, text]) => !key.endsWith(':name') && !key.endsWith(':stopCode') && isUnusable(text)).map(([key]) => key);
  // Compared with the stored stop read the same way, so an untrimmed stored name is not counted as an edit.
  const baseline = stops.map((stop) => editedStop(stop, {}));
  const changed = editedStops.filter((stop, index) => !sameStop(stop, baseline[index]));
  const count = changed.length + unusableKeys.filter((key) => !changed.some((stop) => key.startsWith(`${stop.id}:`))).length;
  const dirty = count > 0;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  // A Route save, a restore, or the Stops drawer closing can change the stops, so they are read again; unsaved edits are kept, and their save
  // is then refused as changed elsewhere rather than lost here.
  useEffect(() => {
    if (dirty || drawerOpen) return;
    let current = true;
    service.getRouteStopSet(aggregate.route.id).then((set) => { if (current) accept(set); }, (reason) => { if (current) setError(userFacingError(reason, 'The stops could not be loaded.')); });
    return () => { current = false; };
    // `dirty` is left out on purpose: saving clears it and accepts the written set itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, aggregate, drawerOpen, accept]);

  const usage = useMemo(() => loaded?.set ? routeStopUsage(loaded.set, aggregate.patterns) : new Map(), [loaded, aggregate.patterns]);
  const directions = orderDirections(aggregate.directions ?? []);
  const directionName = (id: string) => directions.find((direction) => direction.id === id)?.name ?? 'No direction';
  const patternName = (id: string) => aggregate.patterns.find((pattern) => pattern.id === id)?.name || 'Untitled pattern';
  const usedBy = (stopId: string) => {
    const counts: Record<string, number> = usage.get(stopId)?.countByDirectionId ?? {};
    const keys = [...directions.map((direction) => direction.id).filter((id) => counts[id]), ...(counts[''] ? [''] : [])];
    return keys.map((key) => `${key ? directionName(key) : 'No direction'} ${counts[key]}`).join(' · ') || 'No patterns';
  };
  const shared = (stopId: string) => usage.get(stopId)?.sharedAcrossDirections === true;
  const matches: Record<Filter, (stop: RouteStop) => boolean> = {
    all: () => true,
    shared: (stop) => shared(stop.id),
    noCode: (stop) => !stop.stopCode,
    noLocation: (stop) => stop.latitude === undefined || stop.longitude === undefined,
  };
  const needle = query.trim().toLocaleLowerCase();
  const visible = editedStops.filter((stop) => matches[filter](stop) && (!needle || stop.name.toLocaleLowerCase().includes(needle) || (stop.stopCode ?? '').toLocaleLowerCase().includes(needle)));
  const filterCount = (key: Filter) => editedStops.filter(matches[key]).length;
  const sharedStops = stops.filter((stop) => shared(stop.id));
  const readOnly = busy || drawerOpen;
  const structuralBlock = drawerOpen ? 'Close the Stops drawer first' : dirty ? 'Save or discard the edits first' : undefined;

  const value = (stop: RouteStop, field: Field) => texts[`${stop.id}:${field}`] ?? (stop[field]?.toString() ?? '');
  function update(stopId: string, field: Field, text: string) { setTexts((current) => ({ ...current, [`${stopId}:${field}`]: text })); setFindings([]); setError(''); }
  /** A block copied from a spreadsheet fills from the pasted cell rightward across the columns and down the visible rows. */
  function paste(stopId: string, field: Field, clipboard: string): boolean {
    const lines = clipboard.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map((line) => line.split('\t'));
    if (lines.length < 2 && lines[0].length < 2) return false;
    const startRow = visible.findIndex((stop) => stop.id === stopId);
    const startColumn = FIELDS.findIndex((item) => item.field === field);
    const next: Record<string, string> = {};
    lines.forEach((cells, rowOffset) => {
      const row = visible[startRow + rowOffset];
      if (row) cells.forEach((cell, columnOffset) => { const target = FIELDS[startColumn + columnOffset]; if (target) next[`${row.id}:${target.field}`] = cell.trim(); });
    });
    setTexts((current) => ({ ...current, ...next })); setFindings([]); setError('');
    return true;
  }

  /** The text shown when a command is refused, with the patterns a repeated stop is on (Decision 0087 item 7). */
  function refusal(reason: unknown, fallback: string): string {
    if (reason instanceof RouteStopValidationError) {
      const placementPattern = new Map(Object.entries(loaded?.set?.placementsByPatternId ?? {}).flatMap(([patternId, placements]) => placements.map((placement) => [placement.id, patternId] as const)));
      const details = [...new Set(reason.findings.filter((finding) => finding.severity === 'error').map((finding) => { const patternId = placementPattern.get(finding.entityId); return patternId ? `${userMessage(finding)} (${patternName(patternId)})` : userMessage(finding); }))];
      return [reason.message, ...details].join(' ');
    }
    return reason instanceof Error && reason.message === STOPS_CHANGED_ELSEWHERE ? STOPS_CHANGED_ELSEWHERE : userFacingError(reason, fallback);
  }
  /** Runs a structural command from a dialog. The restore point notice comes from the app; this section shows the written stops. */
  async function run(command: (baseUpdatedAt: string) => Promise<RouteStopSet | undefined>, fallback: string): Promise<string | undefined> {
    if (!loaded?.set) return STOPS_CHANGED_ELSEWHERE;
    try { accept(await command(loaded.set.updatedAt)); setDialog(undefined); return undefined; } catch (reason) { return refusal(reason, fallback); }
  }

  async function save(): Promise<boolean> {
    if (unusableKeys.length) { setError('Some latitude, longitude, or speed fields are not numbers. Correct or clear them before saving.'); return false; }
    if (!loaded?.set || changed.length === 0) { setTexts({}); return true; }
    setBusy(true);
    try {
      const edits = changed.map((stop): { id: string } & RouteStopFields => ({ id: stop.id, name: stop.name, stopCode: stop.stopCode, latitude: stop.latitude, longitude: stop.longitude, speedLimitMph: stop.speedLimitMph }));
      accept(await service.saveRouteStopRecords({ routeId: aggregate.route.id, edits, baseUpdatedAt: loaded.set.updatedAt }));
      return true;
    } catch (reason) {
      if (reason instanceof RouteStopValidationError) { setFindings(reason.findings); setError(reason.message); } else setError(refusal(reason, 'The stops could not be saved.'));
      return false;
    } finally { setBusy(false); }
  }
  /** Decision 0087 item 9. Every stop of the Route is a target, matched by its stop ID, then by a name found once on each side. */
  async function readImportFile(file: File) {
    const read = readStopLocationFile(await file.text());
    const targets: StopLocationTarget[] = editedStops.map((stop) => ({ key: `stop:${stop.id}`, name: stop.name, ...(stop.stopCode ? { stopCode: stop.stopCode } : {}) }));
    const labels = Object.fromEntries(editedStops.map((stop) => [`stop:${stop.id}`, [stop.name || 'Untitled stop', stop.stopCode].filter(Boolean).join(' · ')]));
    setImportReview({ fileName: file.name, missingColumns: read.missingColumns, skippedLineCount: read.skippedLineCount, labels, ...matchStopLocations(read.rows, targets) });
  }
  /** Apply writes into the unsaved edits; Save stops writes them. A file row without a speed keeps the stop's speed. */
  function applyImport(matches: StopLocationMatch[]) {
    const next: Record<string, string> = {};
    for (const { key, row } of matches) {
      const id = key.slice('stop:'.length);
      next[`${id}:latitude`] = String(row.latitude);
      next[`${id}:longitude`] = String(row.longitude);
      if (row.speedLimitMph !== undefined) next[`${id}:speedLimitMph`] = String(row.speedLimitMph);
    }
    setTexts((current) => ({ ...current, ...next })); setFindings([]); setError('');
    setImportReview(undefined);
  }
  function discard() { setTexts({}); setFindings([]); setError(''); }
  useImperativeHandle(ref, () => ({ save, discard }));

  const rowsOf = (ids: string[]): StopUseRow[] => stops.filter((stop) => ids.includes(stop.id)).map((stop) => ({ stop, patternNames: (usage.get(stop.id)?.patternIds ?? []).map(patternName).sort((left: string, right: string) => left.localeCompare(right, undefined, { numeric: true })) }));
  const choicesFor = (stopId: string): DirectionChoice[] => directions.filter((direction) => (usage.get(stopId)?.countByDirectionId[direction.id] ?? 0) > 0).map((direction) => ({ id: direction.id, name: direction.name }));
  const isOpen = open ?? stops.length > 0;
  const toggle = (next: boolean) => { setOpen(next); rememberOpen(next); };
  const allVisibleSelected = visible.length > 0 && visible.every((stop) => selected.includes(stop.id));
  const dialogStop = dialog?.kind === 'split' ? stops.find((stop) => stop.id === dialog.stopId) : undefined;

  return <WorkSurface title="Stops" count={stops.length} className="route-stops" ariaLabel="Route stops" collapse={{ open: isOpen, onToggle: toggle, id: 'route-stops-body' }}
    actions={isOpen ? <MenuButton label="Actions" menuLabel="Route stop actions" disabled={readOnly || !loaded} groups={[{ items: [
      { id: 'import-route-stop-locations', label: 'Import stop locations…', onSelect: () => fileInput.current?.click() },
    ] }, { items: [
      { id: 'split-all-stops', label: 'Split all shared stops…', disabled: Boolean(structuralBlock) || sharedStops.length === 0, title: structuralBlock ?? (sharedStops.length === 0 ? 'No stop is used by more than one direction' : undefined), onSelect: () => setDialog({ kind: 'splitAll' }) },
    ] }]} /> : undefined}
    footer={dirty ? <SaveBar message={`${plural(count, 'unsaved change')} in Stops`} saveLabel="Save stops" busy={busy} onSave={() => void save()} onDiscard={discard} /> : undefined}>
    {!loaded && !error && <p role="status">Loading stops…</p>}
    {loaded && stops.length === 0 && <p className="route-stops__empty">No stops. Add stops to a pattern with Stops… in its Pattern actions.</p>}
    {loaded && stops.length > 0 && <>
      {drawerOpen && <p className="route-stops__note" role="status">The Stops drawer is open. Close it to edit stops here.</p>}
      <div className="route-stops__filters">
        <SegmentedControl label="Show stops" value={filter} onChange={(next) => setFilter(next as Filter)} options={[
          { value: 'all', text: `All ${filterCount('all')}` }, { value: 'shared', text: `Shared across directions ${filterCount('shared')}` },
          { value: 'noCode', text: `Missing stop ID ${filterCount('noCode')}` }, { value: 'noLocation', text: `Missing location ${filterCount('noLocation')}` },
        ]} />
        <input type="search" className="route-stops__search" placeholder="Filter by name or stop ID" aria-label="Filter stops by name or stop ID" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {selected.length > 0 && <SelectionBar count={selected.length} noun="stop" onClear={() => setSelected([])}>
        <button type="button" disabled={Boolean(structuralBlock) || selected.length < 2} title={structuralBlock ?? (selected.length < 2 ? 'Select two or more stops to merge' : undefined)} onClick={() => setDialog({ kind: 'merge', stopIds: selected })}>Merge…</button>
        <button type="button" disabled={Boolean(structuralBlock)} title={structuralBlock} onClick={() => setDialog({ kind: 'delete', stopIds: selected })}>Delete…</button>
      </SelectionBar>}
      <div className="table-scroll route-stops__scroll"><table className="route-stops-table" aria-label="Stops of this route">
        <thead><tr>
          <th scope="col" className="route-stops__check"><input type="checkbox" checked={allVisibleSelected} disabled={visible.length === 0} aria-label="Select all shown stops" onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...visible.map((stop) => stop.id)])] : selected.filter((id) => !visible.some((stop) => stop.id === id)))} /></th>
          {FIELDS.map((item) => <th key={item.field} scope="col" className={item.numeric ? 'route-stops__number' : undefined}>{item.label}</th>)}
          <th scope="col">Used by</th><th scope="col"><span className="visually-hidden">Actions</span></th>
        </tr></thead>
        <tbody>{visible.map((stop) => {
          const saved = stops.find((candidate) => candidate.id === stop.id)!;
          const label = saved.name.trim() || 'Untitled stop';
          const errors = [...new Set([...messages(findings, stop.id), ...(unusableKeys.some((key) => key.startsWith(`${stop.id}:`)) ? ['Enter latitude, longitude, and speed as numbers.'] : [])])];
          const errorId = errors.length ? `route-stop-error-${stop.id}` : undefined;
          return [<tr key={stop.id} className={!changed.includes(stop) ? undefined : 'route-stops__row--edited'}>
            <td className="route-stops__check"><input type="checkbox" checked={selected.includes(stop.id)} aria-label={`Select ${label}`} onChange={(event) => setSelected((current) => event.target.checked ? [...current, stop.id] : current.filter((id) => id !== stop.id))} /></td>
            {FIELDS.map((item) => <td key={item.field} className={item.numeric ? 'route-stops__number' : undefined}><input value={value(saved, item.field)} inputMode={item.numeric ? 'decimal' : undefined} aria-label={`${item.label}, ${label}`} aria-invalid={errors.length > 0} aria-describedby={errorId} disabled={readOnly} onChange={(event) => update(stop.id, item.field, event.target.value)} onPaste={(event) => { if (paste(stop.id, item.field, event.clipboardData.getData('text/plain'))) event.preventDefault(); }} /></td>)}
            <td className="route-stops__used"><span>{usedBy(stop.id)}</span>{shared(stop.id) && <span className="route-stops__shared" role="img" aria-label="Used by more than one direction" title="Used by more than one direction"><LinkIcon /><span aria-hidden="true">Shared</span></span>}</td>
            <td className="route-stops__actions"><MenuButton label="Actions" menuLabel={`Actions for ${label}`} triggerAriaLabel={`Actions for ${label}`} disabled={readOnly} groups={[{ items: [
              { id: 'split-stop', label: 'Split by direction…', disabled: Boolean(structuralBlock) || !shared(stop.id), title: structuralBlock ?? (!shared(stop.id) ? 'Only one direction uses this stop' : undefined), onSelect: () => setDialog({ kind: 'split', stopId: stop.id }) },
              { id: 'delete-stop', label: 'Delete…', disabled: Boolean(structuralBlock), title: structuralBlock, onSelect: () => setDialog({ kind: 'delete', stopIds: [stop.id] }) },
            ] }]} /></td>
          </tr>, errors.length > 0 && <tr key={`${stop.id}-error`} className="route-stops__error"><td /><td colSpan={7}><span className="field-error" id={errorId}>{errors.join(' ')}</span></td></tr>];
        })}</tbody>
      </table></div>
      {visible.length === 0 && <p className="route-stops__empty">No stops match this filter.</p>}
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <input ref={fileInput} className="visually-hidden" tabIndex={-1} type="file" accept=".csv,text/csv" aria-label="Route stop location CSV file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readImportFile(file).catch((reason) => setError(userFacingError(reason, 'The file could not be read.'))); }} />
    {importReview && <StopLocationImportDialog review={importReview} scope="route" onApply={applyImport} onClose={() => setImportReview(undefined)} />}
    {dialogStop && <SplitStopDialog stop={dialogStop} directions={choicesFor(dialogStop.id)} onClose={() => setDialog(undefined)} onConfirm={(directionId, newStop) => run((baseUpdatedAt) => service.splitRouteStop({ routeId: aggregate.route.id, stopId: dialogStop.id, directionId, newStop, baseUpdatedAt }), 'The stop could not be split.')} />}
    {dialog?.kind === 'splitAll' && <SplitAllStopsDialog directions={directions.map((direction) => ({ id: direction.id, name: direction.name }))} stops={sharedStops} onClose={() => setDialog(undefined)} onConfirm={(input) => run((baseUpdatedAt) => service.splitSharedRouteStops({ routeId: aggregate.route.id, ...input, baseUpdatedAt }), 'The stops could not be split.')} />}
    {dialog?.kind === 'delete' && <DeleteStopsDialog rows={rowsOf(dialog.stopIds)} onClose={() => setDialog(undefined)} onConfirm={() => run((baseUpdatedAt) => service.deleteRouteStops({ routeId: aggregate.route.id, stopIds: dialog.stopIds, baseUpdatedAt }), 'The stops could not be deleted.')} />}
    {dialog?.kind === 'merge' && <MergeStopsDialog rows={rowsOf(dialog.stopIds)} onClose={() => setDialog(undefined)} onConfirm={(keepStopId) => run((baseUpdatedAt) => service.mergeRouteStops({ routeId: aggregate.route.id, keepStopId, mergeStopIds: dialog.stopIds.filter((id) => id !== keepStopId), baseUpdatedAt }), 'The stops could not be merged.')} />}
  </WorkSurface>;
});
