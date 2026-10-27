import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MenuButton, type MenuGroup, type MenuSelectEvent } from '../MenuButton';
import { formatDuration, MISSING } from '../format';
import { buildTripTableView, formatStagedShift, roundServiceTimeToMinute, tripPatternChipText } from '../../application/tripsWorkspaceView';
import { formatServiceTime } from '../../domain/time';
import { type SelectionMode } from '../../application/tripSelection';
import { type BlockingBlock, type Node, type RouteDefinitionAggregate, type RoutePattern, type RuntimeProfile, type Trip } from '../../domain/types';
import { type BlockConnection } from '../../domain/blocking';
import { TrashIcon } from '../shared/icons';
import { BlockPill, BlockPillContent, blockColorToken, Chip } from '../shared/chips';

export type TripBlockAssignmentDraft = { operation: 'assign' | 'unassign'; tripIds: string[]; destinationBlockId: string; source: 'pill' | 'actions'; blockingScenarioId: string; tripProfileId: string; serviceDayId: string; sourceSignature: string };
export type TripBlockOption = { id: string; label: string; disabled?: boolean; reason?: string };
/** A selection change asked for by the header menu or a Pattern chip. The workspace resolves it against the full trip list. */
export type TripSelectionRequest =
  | { kind: 'all' | 'none' | 'invert' }
  | { kind: 'pattern'; patternId: string; mode: SelectionMode }
  | { kind: 'unassigned' | 'runtimeChanged'; mode: SelectionMode };

export function formatTripTableClock(value: number, roundToMinute: boolean): string {
  const display = roundToMinute ? roundServiceTimeToMinute(value) : value;
  return formatServiceTime(display, display % 60 !== 0);
}

export type StickyScheduleHeaderMetrics = { left: number; width: number; height: number; tableWidth: number; columnWidths: number[] };

export function ScheduleTable({ trips, previewTrips, stagedShiftSeconds, draft, patterns, direction, nodes, runtimeProfiles, showRuntimeBands, showHeadways, roundDisplayedTimes, blockAssignments, tripConnections, blockWarnings, blockOptions, blockAssignmentDisabled, onAssignBlock, onUnassignBlock, selectedIds, changedRuntimeTripIds, onToggle, onSelectAll, onSelectBy, onDelete, onDraftChange, onDraftSave, onDraftCancel, selectionBar, busy }: { selectionBar?: (compact: boolean) => ReactNode; trips: Trip[]; previewTrips?: Trip[]; stagedShiftSeconds?: number; draft?: { patternId: string; firstTrip: string }; patterns: RoutePattern[]; direction: NonNullable<RouteDefinitionAggregate['directions']>[number]; nodes: Node[]; runtimeProfiles: Map<string, RuntimeProfile | undefined>; showRuntimeBands: boolean; showHeadways: boolean; roundDisplayedTimes: boolean; blockAssignments: Map<string, BlockingBlock>; tripConnections: Map<string, { connection: BlockConnection; deadheadSeconds?: number; nextTripStart?: number }>; blockWarnings: Map<string, string[]>; blockOptions: TripBlockOption[]; blockAssignmentDisabled: boolean; onAssignBlock: (trip: Trip, blockId: string, trigger: HTMLButtonElement | null) => void; onUnassignBlock: (trip: Trip, trigger: HTMLButtonElement | null) => void; selectedIds: string[]; changedRuntimeTripIds: Set<string>; onToggle: (id: string, index: number, shiftKey: boolean) => void; onSelectAll: (selected: boolean) => void; onSelectBy: (request: TripSelectionRequest) => void; onDelete: (trip: Trip) => void; onDraftChange: (draft: { patternId: string; firstTrip: string }) => void; onDraftSave: () => void; onDraftCancel: () => void; busy: boolean }) {
  const columns = [...direction.columns].sort((left, right) => left.sequence - right.sequence);
  const pointFor = (pattern: RoutePattern, columnId: string) => pattern.points.find((point) => point.directionColumnId === columnId);
  const columnName = (column: typeof columns[number]) => column.labelOverride || nodes.find((node) => node.id === column.nodeId)?.shortName || nodes.find((node) => node.id === column.nodeId)?.name || 'Unnamed point';
  const previewById = new Map((previewTrips ?? []).map((trip) => [trip.id, trip]));
  const view = buildTripTableView({ savedTrips: trips, previewTrips, patterns, runtimeProfiles, changedRuntimeTripIds, showRuntimeBands, showHeadways });
  const headwaysByColumn = view.headways;
  const allTripsSelected = trips.length > 0 && trips.every((trip) => selectedIds.includes(trip.id));
  const stagedLabel = formatStagedShift(stagedShiftSeconds);
  const visibleBands = [...new Map([...runtimeProfiles.values()].flatMap((profile) => profile?.bands ?? []).map((band) => [band.id, band])).values()].sort((a, b) => a.startTime - b.startTime);
  const bandColor = (id: string) => ['#e5f0f5', '#e8eee0', '#f4eadf', '#ece7f4', '#f3e8e9', '#e4eeee'][Math.max(0, visibleBands.findIndex((band) => band.id === id)) % 6];
  const scheduleViewportRef = useRef<HTMLDivElement>(null);
  const stickyHeaderViewportRef = useRef<HTMLDivElement>(null);
  const [stickyHeaderMetrics, setStickyHeaderMetrics] = useState<StickyScheduleHeaderMetrics>();
  const columnKey = columns.map((column) => column.id).join('|');
  useEffect(() => {
    const viewport = scheduleViewportRef.current;
    if (!viewport) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const table = viewport.querySelector('table');
      const thead = table?.querySelector('thead');
      if (!table || !thead) return;
      const viewportRect = viewport.getBoundingClientRect();
      const headerRect = thead.getBoundingClientRect();
      const show = headerRect.bottom <= 0 && viewportRect.bottom > headerRect.height;
      if (!show) {
        setStickyHeaderMetrics((current) => current ? undefined : current);
        return;
      }
      const columnWidths = Array.from(thead.querySelectorAll('th')).map((cell) => cell.getBoundingClientRect().width);
      const next: StickyScheduleHeaderMetrics = {
        left: viewportRect.left + viewport.clientLeft,
        width: viewport.clientWidth,
        height: headerRect.height,
        tableWidth: Math.max(table.scrollWidth, table.getBoundingClientRect().width),
        columnWidths,
      };
      setStickyHeaderMetrics((current) => current && current.left === next.left && current.width === next.width && current.height === next.height && current.tableWidth === next.tableWidth && current.columnWidths.length === next.columnWidths.length && current.columnWidths.every((width, index) => width === next.columnWidths[index]) ? current : next);
    };
    const scheduleMeasure = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    const syncStickyScroll = () => {
      if (stickyHeaderViewportRef.current && stickyHeaderViewportRef.current.scrollLeft !== viewport.scrollLeft) stickyHeaderViewportRef.current.scrollLeft = viewport.scrollLeft;
      scheduleMeasure();
    };
    const observer = new ResizeObserver(scheduleMeasure);
    const table = viewport.querySelector('table');
    if (table) observer.observe(table);
    observer.observe(viewport);
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);
    viewport.addEventListener('scroll', syncStickyScroll, { passive: true });
    scheduleMeasure();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      viewport.removeEventListener('scroll', syncStickyScroll);
    };
  }, [columnKey]);
  useEffect(() => {
    const stickyViewport = stickyHeaderViewportRef.current;
    const viewport = scheduleViewportRef.current;
    if (!stickyViewport || !viewport) return;
    const syncTableScroll = () => { if (viewport.scrollLeft !== stickyViewport.scrollLeft) viewport.scrollLeft = stickyViewport.scrollLeft; };
    stickyViewport.scrollLeft = viewport.scrollLeft;
    stickyViewport.addEventListener('scroll', syncTableScroll, { passive: true });
    return () => stickyViewport.removeEventListener('scroll', syncTableScroll);
  }, [Boolean(stickyHeaderMetrics)]);
  // The selection bar is drawn twice, but only one copy is live: above the table, or (while the headings are pinned) compact above the pinned
  // headings. The copy above the table stays in the layout, so the page does not jump, and is hidden from view, focus, and the accessibility tree.
  const flowBar = selectionBar?.(false);
  const pinnedBar = stickyHeaderMetrics ? selectionBar?.(true) : null;
  const pinnedBarRef = useRef<HTMLDivElement>(null);
  const [pinnedBarHeight, setPinnedBarHeight] = useState(0);
  useLayoutEffect(() => { setPinnedBarHeight(pinnedBar ? pinnedBarRef.current?.getBoundingClientRect().height ?? 0 : 0); }, [Boolean(pinnedBar), stickyHeaderMetrics?.width]);
  // With headways on, Departs is the last pinned column; otherwise Pattern is.
  const patternColumnClass = showHeadways ? 'trip-pattern-column' : 'trip-pattern-column trip-pinned-last';
  // Choosing from the menu replaces the selection; holding Ctrl or ⌘ adds to it.
  const modeOf = (event: MenuSelectEvent): SelectionMode => event.ctrlKey || event.metaKey ? 'add' : 'replace';
  const patternCount = (patternId: string) => trips.filter((trip) => trip.patternId === patternId).length;
  const unassignedCount = trips.filter((trip) => !blockAssignments.has(trip.id)).length;
  const selectMenu: MenuGroup[] = [
    { items: [
      { id: 'all', label: `Select all (${trips.length})`, disabled: !trips.length, onSelect: () => onSelectBy({ kind: 'all' }) },
      { id: 'none', label: 'Select none', disabled: !selectedIds.length, onSelect: () => onSelectBy({ kind: 'none' }) },
      { id: 'invert', label: 'Invert selection', disabled: !trips.length, onSelect: () => onSelectBy({ kind: 'invert' }) },
    ] },
    { label: 'By pattern', items: patterns.map((pattern) => ({ id: `pattern-${pattern.id}`, label: `${tripPatternChipText(pattern, direction.name)} (${patternCount(pattern.id)})`, title: pattern.name, disabled: !patternCount(pattern.id), onSelect: (event: MenuSelectEvent) => onSelectBy({ kind: 'pattern', patternId: pattern.id, mode: modeOf(event) }) })) },
    { label: 'By status', items: [
      { id: 'unassigned', label: `Not assigned to a block (${unassignedCount})`, disabled: blockOptions.length === 0 || !unassignedCount, title: blockOptions.length === 0 ? 'Choose a blocking scenario first.' : undefined, onSelect: (event: MenuSelectEvent) => onSelectBy({ kind: 'unassigned', mode: modeOf(event) }) },
      { id: 'runtimeChanged', label: `Run times have changed (${changedRuntimeTripIds.size})`, disabled: !changedRuntimeTripIds.size, onSelect: (event: MenuSelectEvent) => onSelectBy({ kind: 'runtimeChanged', mode: modeOf(event) }) },
    ] },
  ];
  const tableHeader = <thead><tr><th scope="col" className="trip-selection-column"><div className="trip-selection-header"><input type="checkbox" aria-label="Select all trips" checked={allTripsSelected} disabled={busy} onChange={(event) => onSelectAll(event.target.checked)} /><MenuButton label="Select trips by…" menuLabel="Select trips by…" groups={selectMenu} disabled={busy} fixedMenu menuAlign="start" triggerClassName="trip-selection-menu-trigger" triggerAriaLabel="Select trips by…" triggerContent={<span aria-hidden="true">▾</span>} /></div></th><th scope="col" className={patternColumnClass}>Pattern</th>{showHeadways && <th scope="col" className="trip-departs-column trip-pinned-last">Departs</th>}{columns.map((column) => <th scope="col" className="trip-timepoint-column" key={column.id}>{columnName(column)}</th>)}<th scope="col" className="trip-run-time-column">Run time</th><th scope="col" className="trip-connection-column">Layover</th><th scope="col" className="trip-connection-column">Deadhead</th><th scope="col" className="trip-next-trip-column">Next trip</th><th scope="col" className="trip-block-column">Block</th><th scope="col" className="trip-actions-column"><span className="visually-hidden">Actions</span></th></tr></thead>;
  return <>{flowBar && <div className={pinnedBar ? 'selection-bar-slot selection-bar-slot--pinned' : 'selection-bar-slot'}>{flowBar}</div>}{<div className={showRuntimeBands ? 'schedule-band-view' : undefined}>{showRuntimeBands && <div className="runtime-band-legend" aria-label="Runtime band legend">{visibleBands.map((band) => <span key={band.id}><i style={{ backgroundColor: bandColor(band.id) }} />{band.label} {formatServiceTime(band.startTime)}–{formatServiceTime(band.endTime)}</span>)}</div>}<div ref={scheduleViewportRef} className="table-scroll data-grid schedule-table"><table>{tableHeader}<tbody>{draft && <DraftTripRow draft={draft} patterns={patterns} columns={columns} showDeparts={showHeadways}onChange={onDraftChange} onSave={onDraftSave} onCancel={onDraftCancel} busy={busy} />}{trips.map((savedTrip, tripIndex) => { const trip = previewById.get(savedTrip.id) ?? savedTrip; const pattern = patterns.find((item) => item.id === trip.patternId); const rowView = view.rows.get(savedTrip.id); const runtime = rowView?.runTimeSeconds; const singleBand = rowView?.singleBand; const segments = rowView?.segments; const duplicate = rowView?.duplicate ?? false; const runtimesChanged = changedRuntimeTripIds.has(trip.id); const staged = previewById.has(savedTrip.id) && stagedLabel; const assignedBlock = blockAssignments.get(savedTrip.id); const tripConnection = assignedBlock ? tripConnections.get(savedTrip.id) : undefined; const blockWarning = assignedBlock ? blockWarnings.get(savedTrip.id)?.join('\n') : undefined; const rowClass = [selectedIds.includes(trip.id) && 'trip-row-selected', runtimesChanged && 'trip-row-runtime-changed', staged && 'trip-row-staged-shift'].filter(Boolean).join(' ') || undefined; return <tr key={trip.id} className={rowClass}><td className="trip-selection-column"><input type="checkbox" aria-label={`Select ${pattern?.name || 'trip'}`} checked={selectedIds.includes(trip.id)} disabled={busy} onClick={(event) => onToggle(trip.id, tripIndex, event.shiftKey)} /></td><td className={patternColumnClass}>{pattern ? <PatternChipMenu pattern={pattern} text={tripPatternChipText(pattern, direction.name)} count={patternCount(pattern.id)} disabled={busy} onSelectBy={onSelectBy} /> : <Chip text={tripPatternChipText(pattern, direction.name)} title="Unnamed pattern" />}{runtimesChanged && <span className="runtime-changed-note">Run times changed</span>}{staged && <span className="staged-shift-note">{staged}</span>}{duplicate && <span className="duplicate-note">Duplicate departure</span>}</td>{showHeadways && <td className="trip-departs-column trip-pinned-last">{trip.stopTimes[0]?.time === undefined ? MISSING : formatTripTableClock(trip.stopTimes[0].time, roundDisplayedTimes)}</td>}{columns.map((column) => { const point = pattern ? pointFor(pattern, column.id) : undefined; const time = point && trip.stopTimes.find((item) => item.patternPointId === point.id)?.time; const segmentIndex = pattern?.points.findIndex((item) => item.id === point?.id) ?? -1; const contribution = segmentIndex > 0 && time !== undefined ? segments?.[segmentIndex - 1]?.contributions ?? (singleBand ? [{ bandId: singleBand.id, bandLabel: singleBand.label, seconds: 1 }] : undefined) : undefined; const total = contribution?.reduce((sum, part) => sum + part.seconds, 0) ?? 0; let percent = 0; const stops = contribution?.map((part) => { const start = percent; percent += total ? part.seconds / total * 100 : 100; return `${bandColor(part.bandId)} ${start}% ${percent}%`; }); const detail = singleBand?.label ?? contribution?.map((part) => `${part.bandLabel}: ${formatDuration(Math.round(part.seconds))}`).join(' + '); const exactTime = time === undefined ? undefined : formatTripTableClock(time, false); const roundedTime = time === undefined ? undefined : formatTripTableClock(time, roundDisplayedTimes); const headway = showHeadways && time !== undefined ? headwaysByColumn.get(column.id)?.get(trip.id) : undefined; const firstAtPoint = Boolean(headway && headway.previousTime === undefined); const headwayChanged = Boolean(headway?.changed); const displayedValue = time === undefined ? '—' : headway?.previousTime === undefined ? roundedTime : formatDuration(time - headway.previousTime); const headwayTitle = headway ? headway.previousTime === undefined ? `First scheduled time: ${exactTime}` : `Headway from ${formatTripTableClock(headway.previousTime, false)} to ${exactTime}` : undefined; const cellTitle = [detail, headwayTitle, roundDisplayedTimes && exactTime !== roundedTime ? `Exact: ${exactTime}` : undefined].filter(Boolean).join(' · '); return <td className={`trip-timepoint-column${firstAtPoint ? ' trip-headway-first' : ''}${headwayChanged ? ' trip-headway-changed' : ''}`} key={column.id} style={stops?.length ? { backgroundImage: `linear-gradient(90deg, ${stops.join(', ')})` } : undefined} title={cellTitle || undefined}>{displayedValue}</td>; })}<td className="trip-run-time-column">{runtime === undefined ? MISSING : formatDuration(runtime)}</td><td className="trip-connection-column">{tripConnection?.connection.usableLayoverSeconds === undefined ? '' : formatDuration(tripConnection.connection.usableLayoverSeconds)}</td><td className="trip-connection-column">{tripConnection?.connection.deadhead ? formatDuration(tripConnection.deadheadSeconds) : ''}</td><td className="trip-next-trip-column">{tripConnection?.nextTripStart === undefined ? '' : formatTripTableClock(tripConnection.nextTripStart, roundDisplayedTimes)}</td><td className="trip-block-column"><div className="trip-block-content"><TripBlockAssignmentControl trip={savedTrip} patternName={pattern?.name || 'Trip'} assignedBlock={assignedBlock} options={blockOptions} disabled={blockAssignmentDisabled} onChoose={(blockId, trigger) => onAssignBlock(savedTrip, blockId, trigger)} onUnassign={(trigger) => onUnassignBlock(savedTrip, trigger)} />{blockWarning && <span className="trip-block-warning" role="img" aria-label={blockWarning} title={blockWarning} tabIndex={0}>!</span>}</div></td><td className="trip-actions-column"><button className="icon-button icon-button--danger" disabled={busy} onClick={() => onDelete(savedTrip)} aria-label="Delete trip" title="Delete trip"><TrashIcon /></button></td></tr>; })}{!trips.length && !draft && <tr><td colSpan={columns.length + (showHeadways ? 9 : 8)} className="table-empty">Use Build trips or Add trip to begin this schedule.</td></tr>}</tbody></table></div></div>}{stickyHeaderMetrics && createPortal(<div ref={stickyHeaderViewportRef} className="table-scroll data-grid schedule-table sticky-schedule-header" role="region" aria-label="Trips table headings while scrolling" style={{ left: `${stickyHeaderMetrics.left}px`, top: `${pinnedBarHeight}px`, width: `${stickyHeaderMetrics.width}px`, height: `${stickyHeaderMetrics.height}px` }}><table style={{ width: `${stickyHeaderMetrics.tableWidth}px`, minWidth: `${stickyHeaderMetrics.tableWidth}px`, tableLayout: 'fixed' }}><colgroup>{stickyHeaderMetrics.columnWidths.map((width, index) => <col key={index} style={{ width: `${width}px` }} />)}</colgroup>{tableHeader}</table></div>, document.body)}{stickyHeaderMetrics && pinnedBar && createPortal(<div ref={pinnedBarRef} className="selection-bar-pinned" style={{ left: `${stickyHeaderMetrics.left}px`, width: `${stickyHeaderMetrics.width}px` }}>{pinnedBar}</div>, document.body)}</>;
}

/** The Pattern chip of a trip row. A click opens a small menu to select, add, or remove every trip on the pattern; Ctrl or ⌘ with the click adds them straight away. */
function PatternChipMenu({ pattern, text, count, disabled, onSelectBy }: { pattern: RoutePattern; text: string; count: number; disabled: boolean; onSelectBy: (request: TripSelectionRequest) => void }) {
  const select = (mode: SelectionMode) => onSelectBy({ kind: 'pattern', patternId: pattern.id, mode });
  const groups: MenuGroup[] = [{ items: [
    { id: 'select', label: `Select all ${count} on ${pattern.name || 'this pattern'}`, wrapLabel: true, onSelect: () => select('replace') },
    { id: 'add', label: 'Add them to the selection', onSelect: () => select('add') },
    { id: 'remove', label: 'Remove them from the selection', onSelect: () => select('remove') },
  ] }];
  return <MenuButton label={text} menuLabel={`Select trips on ${pattern.name || 'this pattern'}`} groups={groups} disabled={disabled} menuAlign="start" fixedMenu triggerClassName="chip chip--button chip-menu-trigger" triggerTitle={pattern.name || 'Unnamed pattern'} onTriggerModifierClick={() => select('add')} />;
}

export function TripBlockAssignmentControl({ trip, patternName, assignedBlock, options, disabled, onChoose, onUnassign }: { trip: Trip; patternName: string; assignedBlock?: BlockingBlock; options: TripBlockOption[]; disabled: boolean; onChoose: (blockId: string, trigger: HTMLButtonElement | null) => void; onUnassign: (trigger: HTMLButtonElement | null) => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!options.length) return assignedBlock ? <BlockPill label={assignedBlock.label} colorToken={blockColorToken(assignedBlock.label)} /> : <span className="trip-block-unassigned">Unassigned</span>;
  const departure = trip.stopTimes[0]?.time;
  const label = assignedBlock?.label ?? 'Unassigned';
  const groups: MenuGroup[] = [{ label: 'Available blocks', items: options.map((option) => ({
    id: option.id,
    label: option.label,
    checked: option.id === assignedBlock?.id,
    disabled: disabled || option.disabled || option.id === assignedBlock?.id,
    title: option.disabled ? option.reason : option.id === assignedBlock?.id ? 'This trip is already in this block.' : undefined,
    restoreFocus: false,
    onSelect: () => onChoose(option.id, triggerRef.current),
  })) }, ...(assignedBlock ? [{ items: [{ id: 'unassign', label: 'Unassign from block', destructive: true, disabled, restoreFocus: false, onSelect: () => onUnassign(triggerRef.current) }] }] : [])];
  return <MenuButton label={label} menuLabel={`Block assignment for ${patternName} trip`} groups={groups} disabled={disabled} selectionStyle="highlight" triggerRef={triggerRef} triggerClassName={`trip-block-assignment-trigger ${assignedBlock ? 'block-pill' : 'trip-block-unassigned-trigger'}`} triggerContent={assignedBlock ? <BlockPillContent label={assignedBlock.label} colorToken={blockColorToken(assignedBlock.label)} /> : undefined} triggerAriaLabel={`Block assignment for ${patternName} trip departing ${departure === undefined ? 'unknown time' : formatServiceTime(departure)}: ${label}`} />;
}

export function DraftTripRow({ draft, patterns, columns, showDeparts = false, onChange, onSave, onCancel, busy }: { draft: { patternId: string; firstTrip: string }; patterns: RoutePattern[]; showDeparts?: boolean; columns: NonNullable<RouteDefinitionAggregate['directions']>[number]['columns']; onChange: (draft: { patternId: string; firstTrip: string }) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const pattern = patterns.find((item) => item.id === draft.patternId); const firstPoint = pattern?.points.find((point) => point.directionColumnId && columns.some((column) => column.id === point.directionColumnId));
  return <tr className="draft-trip-row"><td className="trip-selection-column" aria-hidden="true" /><td className={showDeparts ? 'trip-pattern-column' : 'trip-pattern-column trip-pinned-last'}><select className="trip-pattern-select" autoFocus aria-label="New trip pattern" title={pattern?.name || 'Select a pattern'} value={draft.patternId} disabled={busy} onChange={(event) => onChange({ ...draft, patternId: event.target.value })}><option value="">Select pattern</option>{patterns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></td>{showDeparts && <td className="trip-departs-column trip-pinned-last" />}{columns.map((column) => <td className="trip-timepoint-column" key={column.id}>{firstPoint?.directionColumnId === column.id ? <input className="time-input" aria-label="First trip time" value={draft.firstTrip} placeholder="06:00" disabled={busy} onChange={(event) => onChange({ ...draft, firstTrip: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') onSave(); if (event.key === 'Escape') onCancel(); }} /> : '—'}</td>)}<td className="trip-run-time-column" /><td className="trip-connection-column" /><td className="trip-connection-column" /><td className="trip-next-trip-column" /><td className="trip-block-column">Unassigned</td><td className="trip-actions-column"><div className="row-actions"><button className="primary" disabled={!draft.patternId || !draft.firstTrip.trim() || busy} onClick={onSave}>Save</button><button disabled={busy} onClick={onCancel}>Cancel</button></div></td></tr>;
}
