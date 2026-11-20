import { forwardRef, Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { RouteStopValidationError, STOPS_CHANGED_ELSEWHERE, type RouteDefinitionApplication, type StopDraft, type StopPlacementPreview } from '../../application/routeDefinitionService';
import { matchStopLocations, readStopLocationFile, type StopLocationMatch, type StopLocationTarget } from '../../application/stopLocationImport';
import { DEFAULT_STOP_ROUNDING_SECONDS, normalizePlacements, normalizeStopLocation, normalizeTimepointLocations, normalizeTimepointStopCodes, placementsBySegment, sameLocation, sortedPoints } from '../../domain/stops';
import { newId } from '../../domain/ids';
import { type PatternStopPlacement, type RouteDefinitionAggregate, type RoutePattern, type RouteStop, type RouteStopSet, type StopLocation, type TimepointLocations, type TimepointStopCodes, type ValidationFinding } from '../../domain/types';
import { readStoredRecord } from '../preferences';
import { locationText, StopLocationImportDialog, type StopLocationImportReview } from './StopLocationImportDialog';
import { userFacingError } from '../errorMessages';
import { MenuButton } from '../MenuButton';
import { ModalDialog } from '../ModalDialog';
import { SaveBar } from '../shared/bars';
import { DiscardRouteDraftDialog } from '../shared/dialogs';
import { LinkIcon, TrashIcon } from '../shared/icons';
import { messages } from '../shared/messages';

export type PatternStopsService = Pick<RouteDefinitionApplication, 'getRouteStopSet' | 'saveRouteStops' | 'previewStopFill' | 'applyStopFill' | 'previewStopCopy' | 'applyStopCopy' | 'getStopCopyUndo' | 'undoStopCopy'>;

/** The workspace's handle on the drawer, for its navigation guard (Save or Discard before leaving). */
export interface PatternStopsHandle { save: () => Promise<boolean>; discard: () => void }

const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`;
/** The value a stop is offered under in the name suggestions; the stop ID tells apart stops with one name. */
const suggestionValue = (stop: RouteStop) => stop.stopCode ? `${stop.name} · ${stop.stopCode}` : stop.name;

/** `codes` holds the timepoint stop IDs as typed (Decision 0080); they are trimmed on save. */
type Draft = { stops: RouteStop[]; placements: PatternStopPlacement[]; codes: TimepointStopCodes; locations: TimepointLocations };
const EMPTY_DRAFT: Draft = { stops: [], placements: [], codes: {}, locations: {} };
const draftOf = (pattern: RoutePattern, set: RouteStopSet | undefined): Draft => ({ stops: (set?.stops ?? []).map((stop) => ({ ...stop })), placements: normalizePlacements(pattern, set?.placementsByPatternId[pattern.id] ?? []), codes: normalizeTimepointStopCodes(pattern, set?.timepointStopCodesByPatternId?.[pattern.id]), locations: normalizeTimepointLocations(pattern, set?.timepointLocationsByPatternId?.[pattern.id]) });

/** Decision 0085 item 5. Whether the drawer shows the location columns, remembered on this device. */
export const STOP_LOCATIONS_OPEN_PREFERENCE_KEY = 'transit-costing-tool.stop-locations-open.v1';
function storedLocationsOpen(): boolean { return readStoredRecord(STOP_LOCATIONS_OPEN_PREFERENCE_KEY).open === true; }
function rememberLocationsOpen(open: boolean) { try { localStorage.setItem(STOP_LOCATIONS_OPEN_PREFERENCE_KEY, JSON.stringify({ open })); } catch { /* UI preference only. */ } }

type LocationField = 'latitude' | 'longitude' | 'speedLimitMph';
const LOCATION_FIELDS: { field: LocationField; label: string }[] = [{ field: 'latitude', label: 'Latitude' }, { field: 'longitude', label: 'Longitude' }, { field: 'speedLimitMph', label: 'Speed limit' }];
/** "39.91, -104.99" typed or pasted into Latitude fills both fields. */
const COORDINATE_PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/;
/** A typed location field: empty is absent, a number is kept, anything else is held as text and blocks saving. */
const parseLocationText = (text: string): number | undefined => { const trimmed = text.trim(); if (!trimmed) return undefined; const value = Number(trimmed); return Number.isFinite(value) ? value : undefined; };
const isUnusableText = (text: string) => text.trim() !== '' && !Number.isFinite(Number(text.trim()));

/** Counts placements added, removed, or moved, stops renamed or given another stop ID or location, and timepoint stop IDs and locations changed. */
function changeCount(pattern: RoutePattern, base: Draft, draft: Draft): number {
  const basePlacements = new Map(base.placements.map((placement) => [placement.id, placement]));
  const draftIds = new Set(draft.placements.map((placement) => placement.id));
  let count = base.placements.filter((placement) => !draftIds.has(placement.id)).length;
  for (const placement of draft.placements) {
    const saved = basePlacements.get(placement.id);
    if (!saved || saved.afterPatternPointId !== placement.afterPatternPointId || saved.sequence !== placement.sequence || saved.stopId !== placement.stopId) count += 1;
  }
  const baseStops = new Map(base.stops.map((stop) => [stop.id, stop]));
  for (const stop of draft.stops) {
    const saved = baseStops.get(stop.id);
    if (saved && (saved.name !== stop.name || (saved.stopCode ?? '') !== (stop.stopCode ?? '') || !sameLocation(saved, stop))) count += 1;
  }
  const baseCodes = normalizeTimepointStopCodes(pattern, base.codes);
  const draftCodes = normalizeTimepointStopCodes(pattern, draft.codes);
  for (const point of pattern.points) if ((baseCodes[point.id] ?? '') !== (draftCodes[point.id] ?? '')) count += 1;
  for (const point of pattern.points) if (!sameLocation(base.locations[point.id], draft.locations[point.id])) count += 1;
  return count;
}

/**
 * Decision 0079 (ST5). The stops of one saved pattern, edited in a right-side drawer: the pattern's timepoints in order, and after each one
 * except the last the stops of its segment. A stop belongs to the Route, so renaming it changes it on every pattern that uses it.
 */
export const PatternStopsDrawer = forwardRef<PatternStopsHandle, { service: PatternStopsService; aggregate: RouteDefinitionAggregate; pattern: RoutePattern; onDirtyChange: (dirty: boolean) => void; onClose: () => void }>(function PatternStopsDrawer({ service, aggregate, pattern, onDirtyChange, onClose }, ref) {
  const [loaded, setLoaded] = useState<{ set?: RouteStopSet }>();
  const [base, setBase] = useState<Draft>(EMPTY_DRAFT);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'fill' | 'copy'>();
  const [showLocations, setShowLocations] = useState(storedLocationsOpen);
  /** Location fields as typed, by `stop:<id>:<field>` or `point:<id>:<field>`; only fields edited since the last load are held. */
  const [locationTexts, setLocationTexts] = useState<Record<string, string>>({});
  const [importReview, setImportReview] = useState<StopLocationImportReview>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [closePrompt, setClosePrompt] = useState(false);
  const [moved, setMoved] = useState<{ id: string; tick: number }>();
  /** Decision 0087 item 10. Placement ID → the stop a typed name or stop ID linked the row to, and the row's stop before the link. */
  const [links, setLinks] = useState<Record<string, { linkedStopId: string; previous: RouteStop }>>({});
  /** Rows whose link was undone; their typing does not link them again. */
  const [linkDeclined, setLinkDeclined] = useState<Set<string>>(new Set());
  const nameInputs = useRef(new Map<string, HTMLInputElement>());
  const focusAfterRender = useRef<string | undefined>(undefined);
  const closeButton = useRef<HTMLButtonElement>(null);

  // The aggregate is rebuilt after every Route save, so the pattern is read through a ref; only a change of its points reloads the stops.
  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const accept = useCallback((set: RouteStopSet | undefined) => {
    const next = draftOf(patternRef.current, set);
    setLoaded({ set }); setBase(next); setDraft(next); setFindings([]); setError(''); setLocationTexts({}); setLinks({}); setLinkDeclined(new Set());
  }, []);
  const unusableKeys = Object.entries(locationTexts).filter(([, text]) => isUnusableText(text)).map(([key]) => key);
  // A field holding text that is not a number is an edit too, so the drawer cannot be closed without a prompt.
  const count = changeCount(pattern, base, draft) + unusableKeys.length;
  // The Fill preview reads the draft; one object per draft keeps the dialog from previewing again on every render.
  const stopDraft = useMemo<StopDraft>(() => ({ placements: draft.placements, timepointStopCodes: draft.codes, timepointLocations: draft.locations }), [draft.placements, draft.codes, draft.locations]);
  const dirty = count > 0;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // A pattern save can move this pattern's stops (Decision 0079 item 10), so the stops are read again. Unsaved stop edits are kept; their
  // save is then refused as changed elsewhere, rather than lost here.
  const patternSignature = JSON.stringify(pattern.points);
  useEffect(() => {
    if (dirtyRef.current) return;
    let current = true;
    service.getRouteStopSet(aggregate.route.id).then((set) => { if (current) accept(set); }, (reason) => { if (current) setError(userFacingError(reason, 'The stops could not be loaded.')); });
    return () => { current = false; };
  }, [service, aggregate.route.id, pattern.id, patternSignature, accept]);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    const id = focusAfterRender.current;
    if (id) { focusAfterRender.current = undefined; nameInputs.current.get(id)?.focus(); }
  });

  const points = sortedPoints(pattern);
  const segments = placementsBySegment(pattern, draft.placements);
  const stopById = new Map(draft.stops.map((stop) => [stop.id, stop]));
  const savedStopIds = new Set((loaded?.set?.stops ?? []).map((stop) => stop.id));
  const nodeById = new Map(aggregate.nodes.map((node) => [node.id, node]));
  /** How many patterns of the Route use a stop: the other saved patterns, plus this one when the draft places it. */
  const patternUse = (stopId: string) => Object.entries(loaded?.set?.placementsByPatternId ?? {}).filter(([patternId, placements]) => patternId !== pattern.id && placements.some((placement) => placement.stopId === stopId)).length + (draft.placements.some((placement) => placement.stopId === stopId) ? 1 : 0);
  const stopLabel = (stopId: string) => stopById.get(stopId)?.name.trim() || 'new stop';

  function edit(next: Draft) { setDraft(next); setFindings([]); setError(''); }
  /** Writes the segments back as placements, each on its segment's first point, numbered in order. */
  function fromSegments(next: PatternStopPlacement[][]): PatternStopPlacement[] {
    return next.flatMap((segment, index) => segment.map((placement, sequence) => ({ ...placement, afterPatternPointId: points[index].id, sequence })));
  }
  /** A stop created in this drawer and no longer placed is forgotten, so that adding and removing a stop leaves no edit behind. */
  function withoutOrphans(stops: RouteStop[], placements: PatternStopPlacement[]) {
    const used = new Set(placements.map((placement) => placement.stopId));
    return stops.filter((stop) => savedStopIds.has(stop.id) || used.has(stop.id));
  }
  function addStop(segmentIndex: number) {
    const stop: RouteStop = { id: newId(), name: '' };
    const placement: PatternStopPlacement = { id: newId(), stopId: stop.id, afterPatternPointId: points[segmentIndex].id, sequence: segments[segmentIndex].length, timing: 'interpolate' };
    focusAfterRender.current = placement.id;
    edit({ ...draft, stops: [...draft.stops, stop], placements: fromSegments(segments.map((segment, index) => index === segmentIndex ? [...segment, placement] : segment)) });
  }
  function removeStop(placementId: string) {
    const placements = draft.placements.filter((placement) => placement.id !== placementId);
    setLinks(({ [placementId]: _removed, ...rest }) => rest);
    edit({ ...draft, stops: withoutOrphans(draft.stops, placements), placements });
  }
  /** Decision 0079 (ST5 item 5): past the first or last stop of a segment, a stop moves across the timepoint into the next segment. */
  function moveStop(segmentIndex: number, position: number, direction: -1 | 1) {
    const next = segments.map((segment) => [...segment]);
    const [placement] = next[segmentIndex].splice(position, 1);
    const target = position + direction;
    if (target < 0) next[segmentIndex - 1].push(placement);
    else if (target > next[segmentIndex].length) next[segmentIndex + 1].unshift(placement);
    else next[segmentIndex].splice(target, 0, placement);
    setMoved((current) => ({ id: placement.id, tick: (current?.tick ?? 0) + 1 }));
    edit({ ...draft, placements: fromSegments(next) });
  }
  function updateStop(stopId: string, patch: Partial<RouteStop>) { dropLinkNotices(stopId); edit({ ...draft, stops: draft.stops.map((stop) => stop.id === stopId ? { ...stop, ...patch } : stop) }); }
  /** Decision 0087 item 10. Ends the link notice of the rows of a stop once that stop is edited again. */
  function dropLinkNotices(stopId: string) {
    setLinks((current) => Object.values(current).some((link) => link.linkedStopId === stopId) ? Object.fromEntries(Object.entries(current).filter(([, link]) => link.linkedStopId !== stopId)) : current);
  }
  /** Links a row to an existing stop and remembers the row's stop and values before, for Undo link. */
  function link(placementId: string, stopId: string, match: RouteStop, stops: RouteStop[]) {
    const previous = draft.stops.find((stop) => stop.id === stopId);
    const placements = draft.placements.map((placement) => placement.id === placementId ? { ...placement, stopId: match.id } : placement);
    edit({ ...draft, stops: withoutOrphans(stops, placements), placements });
    if (previous) setLinks((current) => ({ ...current, [placementId]: { linkedStopId: match.id, previous: { ...previous } } }));
  }
  /** Decision 0087 item 10. Returns the row to the stop and values it had before the link; the row is not linked again by its typing. */
  function undoLink(placementId: string) {
    const entry = links[placementId];
    if (!entry) return;
    const placements = draft.placements.map((placement) => placement.id === placementId ? { ...placement, stopId: entry.previous.id } : placement);
    const stops = draft.stops.some((stop) => stop.id === entry.previous.id) ? draft.stops.map((stop) => stop.id === entry.previous.id ? entry.previous : stop) : [...draft.stops, entry.previous];
    edit({ ...draft, stops: withoutOrphans(stops, placements), placements });
    setLinks(({ [placementId]: _removed, ...rest }) => rest);
    setLinkDeclined((current) => new Set(current).add(placementId));
  }
  /** A stop typed in this drawer that matches a suggestion links its row to that existing stop. */
  function linkIfSuggested(placementId: string, stopId: string, value: string) {
    if (linkDeclined.has(placementId) || savedStopIds.has(stopId) || patternUse(stopId) > 1) return;
    const text = value.trim().toLocaleLowerCase();
    if (!text) return;
    const match = draft.stops.find((stop) => stop.id !== stopId && savedStopIds.has(stop.id) && suggestionValue(stop).toLocaleLowerCase() === text);
    if (!match) return;
    link(placementId, stopId, match, draft.stops);
  }
  /**
   * A stop ID is unique within the Route (Decision 0079 item 2), so a stop ID typed on a row whose stop has no saved stop ID (a new stop, or a
   * saved stop without one), when it matches a saved stop of the Route, names that stop: the row links to it and shows its name, rather than
   * giving a second stop the same ID.
   */
  function linkIfSavedCode(placementId: string, stopId: string, value: string) {
    if (linkDeclined.has(placementId)) return;
    const saved = loaded?.set?.stops.find((stop) => stop.id === stopId);
    // A saved stop that already has a stop ID is being given another one: a match is a real duplicate, reported on save.
    if (saved ? (saved.stopCode?.trim() ?? '') !== '' : patternUse(stopId) > 1) return;
    const code = value.trim().toLocaleLowerCase();
    if (!code) return;
    const match = draft.stops.find((stop) => stop.id !== stopId && savedStopIds.has(stop.id) && (stop.stopCode?.trim().toLocaleLowerCase() ?? '') === code);
    if (!match) return;
    // A saved stop without a stop ID keeps its saved values for the other patterns that use it; only this row moves to the matching stop.
    const stops = saved ? draft.stops.map((stop) => stop.id === stopId ? { ...saved } : stop) : draft.stops;
    link(placementId, stopId, match, stops);
  }
  /** Decision 0080. A timepoint's stop ID on this pattern. An empty field removes it. */
  function updateCode(pointId: string, value: string) {
    const { [pointId]: _previous, ...codes } = draft.codes;
    edit({ ...draft, codes: value ? { ...codes, [pointId]: value } : codes });
  }

  /** Decision 0085. The current location of a drawer row: `stop:<id>` from the Route stop, `point:<id>` from this pattern's timepoint. */
  function locationOf(key: string): StopLocation | undefined {
    const [kind, id] = key.split(':');
    return kind === 'stop' ? stopById.get(id) : draft.locations[id];
  }
  /** Writes locations into the draft. A stop's location is the Route stop's, so it changes on every pattern that uses the stop. */
  function withLocations(current: Draft, updates: { key: string; location: StopLocation | undefined }[]): Draft {
    let stops = current.stops;
    const locations = { ...current.locations };
    for (const { key, location } of updates) {
      const [kind, id] = key.split(':');
      const value = normalizeStopLocation(location);
      if (kind === 'stop') stops = stops.map((stop) => stop.id === id ? { id: stop.id, name: stop.name, ...(stop.stopCode === undefined ? {} : { stopCode: stop.stopCode }), ...value } : stop);
      else if (value) locations[id] = value; else delete locations[id];
    }
    return { ...current, stops, locations };
  }
  function updateLocation(key: string, field: LocationField, text: string) {
    if (key.startsWith('stop:')) dropLinkNotices(key.slice('stop:'.length));
    const pair = field === 'latitude' ? COORDINATE_PAIR.exec(text) : null;
    const texts = pair ? { [`${key}:latitude`]: pair[1], [`${key}:longitude`]: pair[2] } : { [`${key}:${field}`]: text };
    setLocationTexts((current) => ({ ...current, ...texts }));
    const next: StopLocation = { ...locationOf(key) };
    for (const [textKey, value] of Object.entries(texts)) next[textKey.slice(key.length + 1) as LocationField] = parseLocationText(value);
    edit(withLocations(draft, [{ key, location: next }]));
  }
  /** The location rows in drawer order: each timepoint, then the stops of its segment. */
  function locationRowKeys(): string[] {
    return points.flatMap((point, index) => [`point:${point.id}`, ...(index < points.length - 1 ? segments[index].map((placement) => `stop:${placement.stopId}`) : [])]);
  }
  /**
   * A block copied from a spreadsheet (tab-separated columns, one line per row) fills from the pasted cell rightward across Latitude,
   * Longitude, and Speed and down the following rows. Cells past the last column or row are ignored. A single value is left to onChange.
   */
  function pasteLocations(key: string, field: LocationField, clipboard: string): boolean {
    const lines = clipboard.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map((line) => line.split('\t'));
    if (lines.length < 2 && lines[0].length < 2) return false;
    const fields = LOCATION_FIELDS.map((item) => item.field);
    const rows = locationRowKeys();
    const startRow = rows.indexOf(key);
    const startColumn = fields.indexOf(field);
    const texts: Record<string, string> = {};
    lines.forEach((cells, rowOffset) => {
      const rowKey = rows[startRow + rowOffset];
      if (!rowKey) return;
      cells.forEach((cell, columnOffset) => { const target = fields[startColumn + columnOffset]; if (target) texts[`${rowKey}:${target}`] = cell.trim(); });
    });
    setLocationTexts((current) => ({ ...current, ...texts }));
    const nextByKey = new Map<string, StopLocation>();
    for (const [textKey, value] of Object.entries(texts)) {
      const cut = textKey.lastIndexOf(':');
      const rowKey = textKey.slice(0, cut);
      const next = nextByKey.get(rowKey) ?? { ...locationOf(rowKey) };
      next[textKey.slice(cut + 1) as LocationField] = parseLocationText(value);
      nextByKey.set(rowKey, next);
    }
    edit(withLocations(draft, [...nextByKey].map(([rowKey, location]) => ({ key: rowKey, location }))));
    return true;
  }
  const locationValue = (key: string, field: LocationField) => locationTexts[`${key}:${field}`] ?? (locationOf(key)?.[field]?.toString() ?? '');
  const textErrors = (key: string) => unusableKeys.some((textKey) => textKey.startsWith(`${key}:`)) ? ['Enter latitude, longitude, and speed limit as numbers.'] : [];
  function locationCells(key: string, label: string) {
    if (!showLocations) return null;
    const invalid = textErrors(key).length > 0 || findings.some((item) => item.entityId === key.split(':')[1] && item.ruleId.startsWith('stopLocation.'));
    return LOCATION_FIELDS.map(({ field, label: fieldLabel }) => <td key={field} className="pattern-stops-location"><input className="pattern-stops-code" placeholder="—" inputMode="decimal" value={locationValue(key, field)} aria-label={`${fieldLabel}, ${label}`} aria-invalid={invalid} disabled={busy} onChange={(event) => updateLocation(key, field, event.target.value)} onPaste={(event) => { if (pasteLocations(key, field, event.clipboardData.getData('text/plain'))) event.preventDefault(); }} /></td>);
  }

  /** Decision 0085 item 7: the rows of this pattern, matched against the file by stop ID, then by a name found once on each side. */
  async function readImportFile(file: File) {
    const text = await file.text();
    const read = readStopLocationFile(text);
    const targets: StopLocationTarget[] = [];
    const labels: Record<string, string> = {};
    points.forEach((point, index) => {
      const name = nodeById.get(point.nodeId)?.name || 'Untitled node';
      targets.push({ key: `point:${point.id}`, name, ...(draft.codes[point.id]?.trim() ? { stopCode: draft.codes[point.id].trim() } : {}) });
      labels[`point:${point.id}`] = name;
      if (index < points.length - 1) for (const placement of segments[index]) {
        const stop = stopById.get(placement.stopId);
        const key = `stop:${placement.stopId}`;
        if (!stop || labels[key]) continue;
        targets.push({ key, name: stop.name, ...(stop.stopCode?.trim() ? { stopCode: stop.stopCode.trim() } : {}) });
        labels[key] = stop.name.trim() || 'New stop';
      }
    });
    const matched = matchStopLocations(read.rows, targets);
    setImportReview({ fileName: file.name, missingColumns: read.missingColumns, skippedLineCount: read.skippedLineCount, labels, ...matched });
  }
  function applyImport(matches: StopLocationMatch[]) {
    const updates = matches.map(({ key, row }) => ({ key, location: { latitude: row.latitude, longitude: row.longitude, speedLimitMph: row.speedLimitMph ?? locationOf(key)?.speedLimitMph } }));
    setLocationTexts((current) => Object.fromEntries(Object.entries(current).filter(([textKey]) => !matches.some((match) => textKey.startsWith(`${match.key}:`)))));
    edit(withLocations(draft, updates));
    setImportReview(undefined);
  }

  async function save(): Promise<boolean> {
    if (unusableKeys.length) { setError('Some location fields are not numbers. Correct or clear them before saving.'); return false; }
    setBusy(true);
    try {
      const written = await service.saveRouteStops({ routeId: aggregate.route.id, patternId: pattern.id, stops: draft.stops, placements: draft.placements, timepointStopCodes: draft.codes, timepointLocations: draft.locations, interpolation: loaded?.set?.interpolation ?? 'equal', roundingSeconds: loaded?.set?.roundingSeconds ?? DEFAULT_STOP_ROUNDING_SECONDS, baseUpdatedAt: loaded?.set?.updatedAt });
      accept(written);
      return true;
    } catch (reason) {
      if (reason instanceof RouteStopValidationError) { setFindings(reason.findings); setError(reason.message); }
      else setError(reason instanceof Error && reason.message === STOPS_CHANGED_ELSEWHERE ? STOPS_CHANGED_ELSEWHERE : userFacingError(reason, 'The stops could not be saved.'));
      return false;
    } finally { setBusy(false); }
  }
  function discard() { setDraft(base); setFindings([]); setError(''); setLocationTexts({}); setLinks({}); setLinkDeclined(new Set()); }
  useImperativeHandle(ref, () => ({ save, discard }));

  const requestClose = useCallback(() => { if (dirty) setClosePrompt(true); else onClose(); }, [dirty, onClose]);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy && !dialog && !importReview && !closePrompt && !event.defaultPrevented) { event.preventDefault(); requestClose(); } };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [busy, dialog, importReview, closePrompt, requestClose]);
  useEffect(() => { closeButton.current?.focus(); }, []);

  const undo = service.getStopCopyUndo();
  const undoApplies = undo?.routeId === aggregate.route.id;
  const hasSavedPlacements = Boolean(loaded?.set?.placementsByPatternId[pattern.id]?.length) || Object.keys(loaded?.set?.timepointStopCodesByPatternId?.[pattern.id] ?? {}).length > 0 || Object.keys(loaded?.set?.timepointLocationsByPatternId?.[pattern.id] ?? {}).length > 0;
  const hasOtherPatterns = aggregate.patterns.some((candidate) => candidate.id !== pattern.id);
  async function undoCopy() {
    setBusy(true);
    try { accept(await service.undoStopCopy()); } catch (reason) { setError(userFacingError(reason, 'The stop copy could not be undone.')); } finally { setBusy(false); }
  }
  const suggestions = (loaded?.set?.stops ?? []).map((stop) => draft.stops.find((candidate) => candidate.id === stop.id) ?? stop).filter((stop) => stop.name.trim());
  const listId = `pattern-stops-suggestions-${pattern.id}`;
  const rowErrors = (placement: PatternStopPlacement) => [...new Set([...messages(findings, placement.stopId), ...messages(findings, placement.id)])];

  const columns = showLocations ? 8 : 5;
  const toggleLocations = () => { const next = !showLocations; setShowLocations(next); rememberLocationsOpen(next); };
  return <aside className={showLocations ? 'shift-drawer pattern-stops-drawer pattern-stops-drawer--locations' : 'shift-drawer pattern-stops-drawer'} role="complementary" aria-labelledby="pattern-stops-title">
    <header>
      <h2 id="pattern-stops-title">Stops <span className="pattern-stops-drawer__pattern">{pattern.name || 'Untitled pattern'}</span></h2>
      <div className="pattern-stops-drawer__header-actions">
        <button type="button" className="toggle-button" aria-pressed={showLocations} disabled={!loaded} onClick={toggleLocations}>Show locations</button>
        <MenuButton label="Actions" menuLabel="Stop actions" disabled={busy || !loaded} groups={[{ items: [
          { id: 'import-stop-locations', label: 'Import stop locations…', onSelect: () => fileInput.current?.click() },
        ] }, { items: [
          { id: 'fill-stops', label: 'Fill from other patterns…', disabled: !hasOtherPatterns, onSelect: () => setDialog('fill') },
          { id: 'copy-stops', label: 'Copy to other patterns…', disabled: dirty || !hasSavedPlacements || !hasOtherPatterns, title: dirty ? 'Save these stops before copying them' : !hasSavedPlacements ? 'This pattern has no saved stops' : undefined, onSelect: () => setDialog('copy') },
          ...(undoApplies ? [{ id: 'undo-stop-copy', label: 'Undo last stop copy', disabled: dirty, title: dirty ? 'Save or discard these edits first' : undefined, onSelect: () => void undoCopy() }] : []),
        ] }]} />
        <button ref={closeButton} className="icon-button" type="button" aria-label="Close Stops drawer" title="Close Stops drawer" onClick={requestClose} disabled={busy}>×</button>
      </div>
    </header>
    <div className="shift-drawer-body pattern-stops-drawer__body">
      {!loaded && !error && <p role="status">Loading stops…</p>}
      {loaded && <table className="pattern-stops-table" aria-label={`Stops of ${pattern.name || 'this pattern'}`}>
        <thead><tr><th scope="col">Stop</th><th scope="col">Stop ID</th>{showLocations && LOCATION_FIELDS.map(({ field, label }) => <th key={field} scope="col" className="pattern-stops-location">{field === 'speedLimitMph' ? 'Speed (mph)' : label}</th>)}<th scope="col"><span className="visually-hidden">Shared</span></th><th scope="col"><span className="visually-hidden">Order</span></th><th scope="col"><span className="visually-hidden">Remove</span></th></tr></thead>
        <tbody>{points.map((point, index) => {
          const node = nodeById.get(point.nodeId);
          const segment = segments[index];
          const nextNode = points[index + 1] ? nodeById.get(points[index + 1].nodeId) : undefined;
          const timepointLabel = `${node?.name || 'Untitled node'}${points.filter((other) => other.nodeId === point.nodeId).length > 1 ? ` (point ${index + 1})` : ''}`;
          const pointErrors = [...new Set([...messages(findings, point.id), ...textErrors(`point:${point.id}`)])];
          return <Fragment key={point.id}>
            <tr className="pattern-stops-timepoint"><th scope="row" colSpan={1}><span className="pattern-stops-timepoint__name"><span className="pattern-stops-timepoint__mark" aria-hidden="true" />{node?.name || 'Untitled node'}</span></th><td><input className="pattern-stops-code" placeholder="—" value={draft.codes[point.id] ?? ''} aria-label={`Timepoint stop ID, ${timepointLabel}`} disabled={busy} onChange={(event) => updateCode(point.id, event.target.value)} /></td>{locationCells(`point:${point.id}`, `timepoint ${timepointLabel}`)}<td colSpan={3} /></tr>
            {pointErrors.length > 0 && <tr className="pattern-stops-error pattern-stops-error--timepoint"><td colSpan={columns}><span className="field-error">{pointErrors.join(' ')}</span></td></tr>}
            {index < points.length - 1 && segment.map((placement, position) => {
              const stop = stopById.get(placement.stopId);
              const label = stopLabel(placement.stopId);
              const uses = patternUse(placement.stopId);
              const errors = [...new Set([...rowErrors(placement), ...textErrors(`stop:${placement.stopId}`)])];
              const errorId = errors.length ? `stop-error-${placement.id}` : undefined;
              const first = index === 0 && position === 0;
              const last = index === points.length - 2 && position === segment.length - 1;
              const isNew = !savedStopIds.has(placement.stopId);
              return <Fragment key={placement.id}><tr className={moved?.id === placement.id ? `pattern-stops-stop row-moved row-moved--${moved.tick % 2}` : 'pattern-stops-stop'}>
                <td><div className="pattern-stops-name"><input ref={(element) => { if (element) nameInputs.current.set(placement.id, element); else nameInputs.current.delete(placement.id); }} value={stop?.name ?? ''} placeholder="Stop name" list={isNew ? listId : undefined} aria-label={`Stop name, ${label}`} aria-invalid={errors.length > 0} aria-describedby={errorId} disabled={busy} onChange={(event) => updateStop(placement.stopId, { name: event.target.value })} onBlur={(event) => linkIfSuggested(placement.id, placement.stopId, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') linkIfSuggested(placement.id, placement.stopId, event.currentTarget.value); }} /></div></td>
                <td><input className="pattern-stops-code" placeholder="—" value={stop?.stopCode ?? ''} aria-label={`Stop ID, ${label}`} aria-invalid={errors.length > 0} aria-describedby={errorId} disabled={busy} onChange={(event) => updateStop(placement.stopId, { stopCode: event.target.value || undefined })} onBlur={(event) => linkIfSavedCode(placement.id, placement.stopId, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') linkIfSavedCode(placement.id, placement.stopId, event.currentTarget.value); }} /></td>
                {locationCells(`stop:${placement.stopId}`, label)}
                <td className="pattern-stops-shared">{uses > 1 && <span className="pattern-stops-shared__mark" role="img" aria-label={`Used by ${uses} patterns of this route`} title={`Used by ${uses} patterns of this route`}><LinkIcon />{uses}</span>}</td>
                <td className="pattern-stops-order"><button type="button" className="icon-button" disabled={busy || first} aria-label={`Move ${label} up`} title="Move up" onClick={() => moveStop(index, position, -1)}>↑</button><button type="button" className="icon-button" disabled={busy || last} aria-label={`Move ${label} down`} title="Move down" onClick={() => moveStop(index, position, 1)}>↓</button></td>
                <td><button type="button" className="icon-button icon-button--danger" disabled={busy} aria-label={`Remove ${label}`} title={`Remove ${label}`} onClick={() => removeStop(placement.id)}><TrashIcon /></button></td>
              </tr>{links[placement.id] && <tr className="pattern-stops-link"><td colSpan={columns}><span role="status">Linked to existing stop {stop?.name.trim() || 'Untitled stop'}{stop?.stopCode?.trim() ? ` (${stop.stopCode.trim()})` : ''}</span><button type="button" className="ghost" disabled={busy} onClick={() => undoLink(placement.id)}>Undo link</button></td></tr>}{errors.length > 0 && <tr className="pattern-stops-error"><td colSpan={columns}><span className="field-error" id={errorId}>{errors.join(' ')}</span></td></tr>}</Fragment>;
            })}
            {index < points.length - 1 && <tr className="pattern-stops-add"><td colSpan={columns}><button type="button" className="ghost" disabled={busy} aria-label={`Add stop between ${node?.name || 'this timepoint'} and ${nextNode?.name || 'the next timepoint'}`} onClick={() => addStop(index)}><span aria-hidden="true">+ </span>Add stop</button></td></tr>}
          </Fragment>;
        })}</tbody>
      </table>}
      <input ref={fileInput} className="visually-hidden" tabIndex={-1} type="file" accept=".csv,text/csv" aria-label="Stop location CSV file" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readImportFile(file).catch((reason) => setError(userFacingError(reason, 'The file could not be read.'))); }} />
      <datalist id={listId}>{suggestions.map((stop) => <option key={stop.id} value={suggestionValue(stop)} />)}</datalist>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
    <footer className={dirty ? 'pattern-stops-drawer__footer pattern-stops-drawer__footer--dirty' : 'pattern-stops-drawer__footer'}>
      {dirty ? <SaveBar message={plural(count, 'unsaved change')} saveLabel="Save stops" busy={busy} onSave={() => void save()} onDiscard={discard} /> : <button type="button" onClick={onClose} disabled={busy}>Close</button>}
    </footer>
    {dialog && <PatternStopsDialog service={service} mode={dialog} aggregate={aggregate} pattern={pattern} set={loaded?.set} draft={stopDraft} onFilled={(filled) => { edit({ ...draft, placements: filled.placements, codes: filled.timepointStopCodes, locations: filled.timepointLocations ?? draft.locations }); setDialog(undefined); }} onCopied={(set) => { accept(set); setDialog(undefined); }} onClose={() => setDialog(undefined)} />}
    {importReview && <StopLocationImportDialog review={importReview} onApply={applyImport} onClose={() => setImportReview(undefined)} />}
    {closePrompt && <DiscardRouteDraftDialog title="Discard unsaved stop changes?" onClose={() => setClosePrompt(false)} onDiscard={() => { setClosePrompt(false); onClose(); }} onSave={() => { setClosePrompt(false); void save().then((saved) => { if (saved) onClose(); }); }} />}
  </aside>;
});

const SKIP_TITLES = { ambiguous: 'Segment appears more than once in a pattern', conflict: 'Other patterns disagree' } as const;
const CODE_SKIP_TITLES = { ambiguous: 'Timepoint appears more than once in a pattern', conflict: 'Other patterns disagree on a timepoint stop ID' } as const;
const LOCATION_SKIP_TITLES = { ambiguous: 'Timepoint appears more than once in a pattern (location)', conflict: 'Other patterns disagree on a timepoint location' } as const;

/** Decision 0079 (model: `PatternDistanceDialog`, Decision 0065): preview, then confirm, a fill of this draft's empty segments or a copy of its saved stops. */
function PatternStopsDialog({ service, mode, aggregate, pattern, set, draft, onFilled, onCopied, onClose }: { service: PatternStopsService; mode: 'fill' | 'copy'; aggregate: RouteDefinitionAggregate; pattern: RoutePattern; set: RouteStopSet | undefined; draft: StopDraft; onFilled: (draft: StopDraft) => void; onCopied: (set: RouteStopSet) => void; onClose: () => void }) {
  const copy = mode === 'copy';
  const [excluded, setExcluded] = useState<string[]>([]);
  const [preview, setPreview] = useState<StopPlacementPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const firstCheckbox = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    let current = true;
    const shown = (next: StopPlacementPreview) => { if (current) { setPreview(next); setError(''); } };
    const failed = (reason: unknown) => { if (current) setError(userFacingError(reason, 'The stops could not be previewed.')); };
    if (copy) service.previewStopCopy(pattern.id, excluded).then(shown, failed);
    else { try { shown(service.previewStopFill(aggregate, set, pattern, draft)); } catch (reason) { failed(reason); } }
    return () => { current = false; };
  }, [service, copy, pattern, aggregate, set, draft, excluded]);
  useEffect(() => { if (preview && copy && !focused.current) { focused.current = true; firstCheckbox.current?.focus(); } }, [preview, copy]);
  async function apply() {
    if (!preview) return;
    if (!copy) { onFilled(service.applyStopFill(pattern, draft, preview)); return; }
    setBusy(true);
    try { onCopied(await service.applyStopCopy(preview)); } catch (reason) { setError(userFacingError(reason, 'The stops could not be saved.')); setBusy(false); }
  }
  const name = (patternId: string) => preview?.patternNames[patternId] || 'Pattern';
  const label = (patternId: string, segmentIndex: number) => preview?.segmentLabels[patternId]?.[segmentIndex] ?? 'Segment';
  const stopList = (entries: { stopId: string }[]) => entries.length ? entries.map((entry) => preview?.stopNames[entry.stopId] ?? 'Stop').join(', ') : 'No stops';
  const affected = new Map((preview?.affectedPatterns ?? []).map((item) => [item.patternId, item]));
  const rows = preview && copy ? preview.copyCandidates.filter((candidate) => excluded.includes(candidate.patternId) || affected.has(candidate.patternId)) : [];
  const skipGroups = (['ambiguous', 'conflict'] as const).map((reason) => ({ reason, skips: (preview?.skips ?? []).filter((skip) => skip.reason === reason) })).filter((group) => group.skips.length);
  const skipText = (skip: StopPlacementPreview['skips'][number]) => {
    const parts = [name(skip.patternId)];
    if (skip.segmentIndex !== undefined) parts.push(label(preview?.sourcePatternId ?? pattern.id, skip.segmentIndex));
    if (skip.candidates) parts.push(skip.candidates.map((candidate) => `${stopList(candidate.entries)} (${candidate.patternIds.map(name).join(', ')})`).join(' vs '));
    return parts.join(' · ');
  };
  // Decision 0080: timepoint stop IDs, matched by Node within one direction.
  const nodeName = (nodeId: string) => preview?.nodeNames[nodeId] ?? 'Timepoint';
  const codeSkipGroups = (['ambiguous', 'conflict'] as const).map((reason) => ({ reason, skips: (preview?.codeSkips ?? []).filter((skip) => skip.reason === reason) })).filter((group) => group.skips.length);
  const codeSkipText = (skip: StopPlacementPreview['codeSkips'][number]) => [name(skip.patternId), nodeName(skip.nodeId), ...(skip.candidates ? [skip.candidates.map((candidate) => `${candidate.stopCode} (${candidate.patternIds.map(name).join(', ')})`).join(' vs ')] : [])].join(' · ');
  // Decision 0085: timepoint locations, matched like the stop IDs.
  const locationSkipGroups = (['ambiguous', 'conflict'] as const).map((reason) => ({ reason, skips: (preview?.locationSkips ?? []).filter((skip) => skip.reason === reason) })).filter((group) => group.skips.length);
  const locationSkipText = (skip: StopPlacementPreview['locationSkips'][number]) => [name(skip.patternId), nodeName(skip.nodeId), ...(skip.candidates ? [skip.candidates.map((candidate) => `${locationText(candidate.location)} (${candidate.patternIds.map(name).join(', ')})`).join(' vs ')] : [])].join(' · ');
  const nothing = !preview || (preview.changes.length === 0 && preview.codeChanges.length === 0 && preview.locationChanges.length === 0);
  return <ModalDialog labelledBy="pattern-stops-dialog-title" className="confirm-dialog preview-dialog segment-runtime-dialog" onClose={onClose} busy={busy}>
    <h2 id="pattern-stops-dialog-title">{copy ? 'Copy stops to other patterns' : 'Fill stops from other patterns'}</h2>
    {!preview && !error && <p role="status">Loading preview…</p>}
    {preview && <>
      {copy && rows.length > 0 && <div className="preview-times"><table>
        <thead><tr><th scope="col">Include</th><th scope="col">Pattern</th><th scope="col">Changes</th><th scope="col">Replaced</th></tr></thead>
        <tbody>{rows.map((row, index) => {
          const item = affected.get(row.patternId);
          return <tr key={row.patternId}>
            <td><input ref={index === 0 ? firstCheckbox : undefined} type="checkbox" checked={!excluded.includes(row.patternId)} disabled={busy} aria-label={`Include ${name(row.patternId)}`} onChange={(event) => setExcluded((current) => event.target.checked ? current.filter((id) => id !== row.patternId) : [...current, row.patternId])} /></td>
            <td>{name(row.patternId)}</td><td>{item?.changeCount ?? 0}</td><td>{item?.overwriteCount ?? 0}</td>
          </tr>;
        })}</tbody>
      </table></div>}
      {preview.changes.length > 0 && <div className="preview-times"><table>
        <thead><tr>{copy && <th scope="col">Pattern</th>}<th scope="col">Segment</th><th scope="col">Stops</th>{!copy && <th scope="col">Source</th>}</tr></thead>
        <tbody>{preview.changes.map((change) => <tr key={`${change.patternId}:${change.segmentIndex}`}>
          {copy && <td>{name(change.patternId)}</td>}
          <td>{label(change.patternId, change.segmentIndex)}</td>
          <td>{copy && change.previous.length > 0 ? `${stopList(change.previous)} → ` : ''}{stopList(change.next)}</td>
          {!copy && <td>{change.sourcePatternIds.map(name).join(', ')}</td>}
        </tr>)}</tbody>
      </table></div>}
      {preview.codeChanges.length > 0 && <div className="preview-times"><table aria-label="Timepoint stop IDs">
        <thead><tr>{copy && <th scope="col">Pattern</th>}<th scope="col">Timepoint</th><th scope="col">Stop ID</th>{!copy && <th scope="col">Source</th>}</tr></thead>
        <tbody>{preview.codeChanges.map((change) => <tr key={`${change.patternId}:${change.patternPointId}`}>
          {copy && <td>{name(change.patternId)}</td>}
          <td>{nodeName(change.nodeId)}</td>
          <td>{change.previous !== undefined ? `${change.previous} → ` : ''}{change.next}</td>
          {!copy && <td>{change.sourcePatternIds.map(name).join(', ')}</td>}
        </tr>)}</tbody>
      </table></div>}
      {preview.locationChanges.length > 0 && <div className="preview-times"><table aria-label="Timepoint locations">
        <thead><tr>{copy && <th scope="col">Pattern</th>}<th scope="col">Timepoint</th><th scope="col">Location</th>{!copy && <th scope="col">Source</th>}</tr></thead>
        <tbody>{preview.locationChanges.map((change) => <tr key={`${change.patternId}:${change.patternPointId}`}>
          {copy && <td>{name(change.patternId)}</td>}
          <td>{nodeName(change.nodeId)}</td>
          <td>{change.previous !== undefined ? `${locationText(change.previous)} → ` : ''}{locationText(change.next)}</td>
          {!copy && <td>{change.sourcePatternIds.map(name).join(', ')}</td>}
        </tr>)}</tbody>
      </table></div>}
      {nothing && <p>No stops would change.</p>}
      {skipGroups.map((group) => <div key={group.reason} className="segment-runtime-skips"><p><strong>{SKIP_TITLES[group.reason]}</strong></p><ul className="recalculation-candidates">{group.skips.map((skip, index) => <li key={index}>{skipText(skip)}</li>)}</ul></div>)}
      {codeSkipGroups.map((group) => <div key={`code-${group.reason}`} className="segment-runtime-skips"><p><strong>{CODE_SKIP_TITLES[group.reason]}</strong></p><ul className="recalculation-candidates">{group.skips.map((skip, index) => <li key={index}>{codeSkipText(skip)}</li>)}</ul></div>)}
      {locationSkipGroups.map((group) => <div key={`location-${group.reason}`} className="segment-runtime-skips"><p><strong>{LOCATION_SKIP_TITLES[group.reason]}</strong></p><ul className="recalculation-candidates">{group.skips.map((skip, index) => <li key={index}>{locationSkipText(skip)}</li>)}</ul></div>)}
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button autoFocus={!copy} type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" type="button" onClick={() => void apply()} disabled={nothing || busy}>{busy ? 'Saving…' : copy ? 'Replace stops' : 'Fill stops'}</button></div>
  </ModalDialog>;
}
