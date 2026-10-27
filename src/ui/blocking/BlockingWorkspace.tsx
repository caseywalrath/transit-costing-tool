import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BlockingCommands, BlockingQueries } from '../../application/ports';
import type { TripGenerationApplication } from '../../application/tripGenerationService';
import { BlockingValidationError, createBlockingScenarioSourceSignature, type BlockDeletionImpact, type BlockingScenarioDeletionImpact, type BlockSummary, type BulkBoundaryPreview, type BulkBoundaryRequest, type CompatibilityStatus, type MinimumLayoverRule } from '../../domain/blocking';
import { newId } from '../../domain/ids';
import { parseServiceTime } from '../../domain/time';
import { sortServiceDays } from '../../domain/serviceDays';
import type { BlockActivity, BlockingBlock, BlockingScenario, Node, Route, RouteDefinitionAggregate, RoutePattern, Trip, ValidationFinding } from '../../domain/types';
import type { ScenarioRecords } from '../../domain/project';
import { MenuButton, type MenuGroup } from '../MenuButton';
import { createCsvArchive } from '../../application/csvDownload';
import { userFacingError } from '../errorMessages';
import { ModalDialog } from '../ModalDialog';
import { readStoredRecord, storedText, storedTextMap } from '../preferences';
import { createLatestRequest } from '../latestRequest';
import { formatClock, formatDuration, formatHours, formatMiles, formatPercent, MISSING, withUnit } from '../format';
import { figure } from '../shared/figures';
import { ContextField } from '../shared/ContextField';
import { SelectionBar } from '../shared/bars';
import { InlineNote, SupportPanel, WorkSurface } from '../shared/surfaces';
import { routeOptionLabel } from '../shell/headerStatus';
import { nodeShortName, patternShortName } from '../../application/shortNames';

type BlockingApplication = BlockingCommands & BlockingQueries;
type Props = { /** The element in the header's scope bar that receives the scope selectors (UR-5). */ scopeSlot: HTMLElement | null; blockingService: BlockingApplication; tripService: TripGenerationApplication; aggregate: RouteDefinitionAggregate; records: ScenarioRecords; routes: Route[]; routeId: string; onRouteChange: (routeId: string) => void; onReload: () => Promise<void>; onError: (error: unknown, fallback?: string) => void };
type ActivityDraft = { block: BlockingBlock; activity?: Exclude<BlockActivity, { type: 'revenueTrip' }>; type: 'pullOut' | 'deadhead' | 'pullIn'; afterTripId?: string; connectionDescription?: string; defaultFromNodeId?: string; defaultToNodeId?: string };
type ActivityValues = { minutes: string; fromNodeId: string; toNodeId: string; miles: string; applyToSimilar: boolean };
type BoundaryReview = { request: BulkBoundaryRequest; preview: BulkBoundaryPreview };
type DeadheadDeleteRequest = { draft: ActivityDraft; fromNodeId: string; toNodeId: string; applyToSimilar: boolean };
type UnassignedSortColumn = 'pattern' | 'start' | 'fromTime' | 'toTime' | 'end';
type UnassignedSort = { column: UnassignedSortColumn; direction: 'ascending' | 'descending' };
type BlockSortColumn = 'block' | 'trips' | 'pullOut' | 'start' | 'end' | 'pullIn' | 'running' | 'revenue' | 'platform' | 'layover' | 'layoverPercent' | 'deadhead';
type BlockSort = { column: BlockSortColumn; direction: 'ascending' | 'descending' };
type BlockTableTimes = { pullOut?: number; start?: number; end?: number; pullIn?: number };
type BlockTableRow = { block: BlockingBlock; value?: BlockSummary; trips: number; times: BlockTableTimes; layoverPercent?: number };
type TimeRangeFilter = { from: string; to: string };
type UnassignedFilters = { patternIds: string[]; startNodeIds: string[]; endNodeIds: string[]; fromTime: TimeRangeFilter; toTime: TimeRangeFilter };

const emptyUnassignedFilters = (): UnassignedFilters => ({ patternIds: [], startNodeIds: [], endNodeIds: [], fromTime: { from: '', to: '' }, toTime: { from: '', to: '' } });

const preferenceKey = 'transit-costing-tool.blocking-selection.v1';
type BlockingSelectionPreference = { tripProfileId?: string; blockingScenarioId?: string; blockingScenarioByProfile?: Record<string, string>; serviceDayId?: string; minimumLayover?: MinimumLayoverRule; blockSelections?: Record<string, string> };
function storedLayoverRule(value: unknown): MinimumLayoverRule | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const { mode, value: amount } = value as Record<string, unknown>;
  return (mode === 'minutes' || mode === 'percent') && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? { mode, value: amount } : undefined;
}
/** The stored selection, with every field checked: a value of the wrong shape reads as not stored (finding 4-010). */
function preference(): BlockingSelectionPreference {
  const stored = readStoredRecord(preferenceKey);
  const minimumLayover = storedLayoverRule(stored.minimumLayover);
  return { tripProfileId: storedText(stored.tripProfileId), blockingScenarioId: storedText(stored.blockingScenarioId), blockingScenarioByProfile: storedTextMap(stored.blockingScenarioByProfile), serviceDayId: storedText(stored.serviceDayId), ...(minimumLayover ? { minimumLayover } : {}), blockSelections: storedTextMap(stored.blockSelections) };
}
/** Whether the planner collapsed the Unassigned trips panel to its rail. Kept per device (BL-A). Anything but `{"collapsed":true}` reads as not collapsed. */
export const UNASSIGNED_COLLAPSED_PREFERENCE_KEY = 'transit-costing-tool.blocking-unassigned-collapsed.v1';
function storedUnassignedCollapsed(): boolean { return readStoredRecord(UNASSIGNED_COLLAPSED_PREFERENCE_KEY).collapsed === true; }
function rememberUnassignedCollapsed(collapsed: boolean) { try { localStorage.setItem(UNASSIGNED_COLLAPSED_PREFERENCE_KEY, JSON.stringify({ collapsed })); } catch { /* UI preference only. */ } }
function savePreference(value: object) { try { localStorage.setItem(preferenceKey, JSON.stringify(value)); } catch { /* UI preference only. */ } }
function blockSelectionKey(blockingScenarioId: string, serviceDayId: string) { return `${blockingScenarioId}:${serviceDayId}`; }
const blockingMessages: Record<string, string> = {
  'block.connectionOverlap': 'Trips overlap in time.',
  'block.connectionTimesMissing': 'Trip times are incomplete, so this connection cannot be evaluated.',
  'block.deadheadDoesNotFit': 'The deadhead is longer than the available connection time.',
  'block.deadheadMissing': 'Add a deadhead between trips that end and begin at different nodes.',
  'block.deadheadNodeDiscontinuity': 'The deadhead nodes do not connect the surrounding trips.',
  'block.deadheadPlacement': 'A deadhead must be placed between two revenue trips.',
  'block.deadheadOutsideGap': 'The deadhead times fall outside the time between its two trips. Edit the deadhead to fit between them.',
  'block.boundaryOverlap': 'The pull-out or pull-in overlaps its adjacent trip. Shorten it, or change the trip times.',
  'block.deadheadRequired': 'A deadhead is required between these trips.',
  'block.pullInNodeRequired': 'Select a From node for the pull-in.',
  'block.pullOutNodeRequired': 'Select a To node for the pull-out.',
  'block.deadheadNodesRequired': 'Select both From and To nodes for the deadhead.',
  'block.invalidActivityTime': 'Enter a valid non-negative activity duration.',
  'block.invalidBoundaryTiming': 'Enter a valid non-negative pull-in or pull-out duration.',
  'block.invalidMiles': 'Miles must be a non-negative number.',
  'block.minutesRequired': 'Enter a non-negative whole-minute duration.',
  'block.minutesInvalid': 'Enter a non-negative whole-minute duration.',
  'block.missingPattern': 'The trip references a pattern that no longer exists.',
  'block.missingTrip': 'The block references a trip that no longer exists. Remove that trip from the block.',
  'block.minimumLayoverShort': 'The connection is shorter than the configured minimum layover.',
  'block.multipleDeadheads': 'Only one deadhead is allowed between consecutive revenue trips.',
  'block.multiplePullIn': 'A block can have only one pull-in.',
  'block.multiplePullOut': 'A block can have only one pull-out.',
  'block.platformBoundaryMissing': 'Add both a pull-out and pull-in to complete platform totals.',
  'block.platformBoundaryTimeInvalid': 'The pull-out or pull-in time cannot be calculated from its adjacent trip.',
  'block.platformBoundaryTripMissing': 'A pull-out or pull-in requires an adjacent revenue trip.',
  'block.platformMilesIncomplete': 'Enter all non-revenue miles to complete platform-mile totals.',
  'block.pullInMustBeLast': 'The pull-in must be the final block activity.',
  'block.pullOutMustBeFirst': 'The pull-out must be the first block activity.',
  'block.revenueMilesIncomplete': 'One or more trip patterns are missing complete revenue miles.',
  'block.duplicateTripAssignment': 'A trip can be assigned only once in this blocking scenario and service day.',
  'block.tripContextMismatch': 'The trip belongs to a different scenario or service day.',
  'block.tripProfileMismatch': 'The trip belongs to a different trip profile.',
};
function message(finding: ValidationFinding) { return blockingMessages[finding.messageKey] ?? finding.messageKey.replace(/^block\./, '').replaceAll(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase()); }
const mileageFindingRules = new Set(['block.revenueMilesIncomplete', 'block.platformMilesIncomplete']);
function isMileageFinding(finding: ValidationFinding) { return mileageFindingRules.has(finding.ruleId); }
function BlockStatusIcon({ summary }: { summary?: BlockSummary }) {
  const issues = summary?.findings.filter((finding) => !isMileageFinding(finding)) ?? [];
  if (!summary || !issues.length) return null;
  const status = summary.status === 'invalid' ? 'Conflict' : 'Incomplete';
  const explanation = [...new Set(issues.map(message))].join(' ');
  return <span className={`blocking-block-status blocking-block-status--${summary.status}`} role="img" tabIndex={0} aria-label={`${status}: ${explanation}`} title={`${status}: ${explanation}`}>!</span>;
}
const MESSAGE_KEY = /^[a-z]+\.[A-Za-z]+$/;
/** The sentence to show for a refused Blocking action. A list of message keys is looked up in `blockingMessages`; any other text is shown as written unless it is technical. */
export function blockingError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const parts = error.message.split(', ');
  if (parts.every((part) => MESSAGE_KEY.test(part))) return [...new Set(parts.map((part) => blockingMessages[part] ?? fallback))].join(' ');
  return userFacingError(error, fallback);
}
const STALE_SOURCE_RULES = new Set(['blockingScenario.sourceChanged', 'block.endpointsChanged']);
function isStaleSourceError(error: unknown): error is BlockingValidationError { return error instanceof BlockingValidationError && error.findings.some((finding) => STALE_SOURCE_RULES.has(finding.ruleId)); }
const STALE_SOURCE_MESSAGE = 'Blocking scenario changed since the operation was reviewed. Nothing was saved, and the latest blocks are loaded. Review them and try again.';
function time(value?: number) { return value === undefined ? MISSING : formatClock(value); }
/** Hours and miles use the Costing rounding (half away from zero on the decimal text), so a Block shows the same figure in Blocking and Costing (finding 5-020). Table cells drop the unit; the headings name it (F5-A). */
const hours = (value?: number) => figure(formatHours(value, 'daily'));
const miles = (value?: number) => figure(formatMiles(value));
/** Summary tiles keep the unit. */
const tileHours = (value?: number) => figure(withUnit(formatHours(value, 'daily'), 'h'));
const tileMiles = (value?: number) => figure(withUnit(formatMiles(value), 'mi'));
function plural(count: number, singular: string, pluralForm = singular + 's') { return `${count} ${count === 1 ? singular : pluralForm}`; }
const percentage = formatPercent;
function downloadBlob(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
function fitLabel(status?: CompatibilityStatus) { return status === 'deadheadRequired' ? 'Deadhead' : status === 'insufficientLayover' ? 'Layover' : status === 'conflict' ? 'Conflict' : status === 'incomplete' ? 'Review' : status === 'compatible' ? 'Assign' : 'Select'; }
function fitAccessibleLabel(status?: CompatibilityStatus) { return status === 'deadheadRequired' ? 'Needs deadhead' : status === 'insufficientLayover' ? 'Short layover' : status === 'conflict' ? 'Conflict' : status === 'incomplete' ? 'Review' : status === 'compatible' ? 'Assign' : 'Select block'; }
function fitHelp(status?: CompatibilityStatus) { return status === 'deadheadRequired' ? 'Assignment is allowed, but a deadhead is needed.' : status === 'insufficientLayover' ? 'The connection has less than the configured minimum layover.' : status === 'conflict' ? 'The proposed placement creates an overlapping or invalid connection.' : status === 'incomplete' ? 'Compatibility needs complete trip timing.' : status === 'compatible' ? 'Compatible with the proposed time-based position.' : 'Select a block to evaluate compatibility.'; }
function patternPillClass(patternId?: string) { let hash = 0; for (const character of patternId ?? '') hash = (hash * 31 + character.charCodeAt(0)) >>> 0; return `pattern-pill pattern-pill-${hash % 6}`; }
function parsedFilterTime(value: string): number | undefined { if (!value.trim()) return undefined; try { return parseServiceTime(value); } catch { return undefined; } }
function validOrBlankFilterTime(value: string) { return !value.trim() || parsedFilterTime(value) !== undefined; }
function boundaryNode(block: BlockingBlock, type: 'pullOut' | 'pullIn', trips: Trip[], patterns: Map<string, RoutePattern>) {
  const revenueActivities = block.activities.filter((activity) => activity.type === 'revenueTrip');
  const boundaryActivity = type === 'pullOut' ? revenueActivities[0] : revenueActivities.at(-1);
  const trip = boundaryActivity?.type === 'revenueTrip' ? trips.find((candidate) => candidate.id === boundaryActivity.tripId) : undefined;
  const pattern = trip ? patterns.get(trip.patternId) : undefined;
  return type === 'pullOut' ? pattern?.points[0]?.nodeId : pattern?.points.at(-1)?.nodeId;
}
function blockSortValue(row: BlockTableRow, column: BlockSortColumn): string | number | undefined {
  if (column === 'block') return row.block.label;
  if (column === 'trips') return row.trips;
  if (column === 'pullOut') return row.times.pullOut;
  if (column === 'start') return row.times.start;
  if (column === 'end') return row.times.end;
  if (column === 'pullIn') return row.times.pullIn;
  if (column === 'running') return row.value?.runningHours;
  if (column === 'revenue') return row.value?.revenueHours;
  if (column === 'platform') return row.value?.platformHours;
  if (column === 'layover') return row.value?.layoverHours;
  if (column === 'layoverPercent') return row.layoverPercent;
  return row.value?.deadheadHours;
}

export function BlockingWorkspace({ scopeSlot, blockingService, tripService, aggregate, records, routes, routeId, onRouteChange, onReload, onError }: Props) {
  const days = sortServiceDays(records.serviceDays); const profiles = records.tripProfiles ?? [];
  const [tripProfileId, setTripProfileId] = useState(''); const [blockingScenarioId, setBlockingScenarioId] = useState(''); const [serviceDayId, setServiceDayId] = useState('');
  const [scenarios, setScenarios] = useState<BlockingScenario[]>([]); const [allBlocks, setAllBlocks] = useState<BlockingBlock[]>([]); const [selectedBlockId, setSelectedBlockId] = useState(''); const [scenarioSelectionCleared, setScenarioSelectionCleared] = useState(false);
  const [summary, setSummary] = useState<Awaited<ReturnType<BlockingQueries['getScenarioSummary']>>>(); const [compatibility, setCompatibility] = useState(new Map<string, CompatibilityStatus>()); const [compatibilityPending, setCompatibilityPending] = useState(false); const [compatibleOnly, setCompatibleOnly] = useState(false); const [unassignedSort, setUnassignedSort] = useState<UnassignedSort>({ column: 'fromTime', direction: 'ascending' }); const [blockSort, setBlockSort] = useState<BlockSort>({ column: 'block', direction: 'ascending' }); const [unassignedFilters, setUnassignedFilters] = useState<UnassignedFilters>(emptyUnassignedFilters); const [minimumLayover, setMinimumLayover] = useState<MinimumLayoverRule | undefined>(() => preference().minimumLayover); const [layoverDialogOpen, setLayoverDialogOpen] = useState(false); const [trips, setTrips] = useState<Trip[]>([]); const [unassigned, setUnassigned] = useState<Trip[]>([]);
  const [scenarioDialog, setScenarioDialog] = useState<{ mode: 'create' | 'duplicate' | 'rename'; value: string }>(); const [deleteScenario, setDeleteScenario] = useState<{ scenario: BlockingScenario; impact: BlockingScenarioDeletionImpact }>(); const [blockDialog, setBlockDialog] = useState<{ mode: 'create' | 'rename'; block?: BlockingBlock; value: string }>(); const [notesDialog, setNotesDialog] = useState<BlockingBlock>(); const [deleteBlock, setDeleteBlock] = useState<{ block: BlockingBlock; impact: BlockDeletionImpact }>(); const [removeActivityPending, setRemoveActivityPending] = useState<{ activity: BlockActivity; title: string; text: string; label: string }>(); const blocksRequests = useRef(createLatestRequest()).current; const scenariosRequests = useRef(createLatestRequest()).current; const [activityDraft, setActivityDraft] = useState<ActivityDraft>(); const [boundaryReview, setBoundaryReview] = useState<BoundaryReview>(); const [deleteDeadhead, setDeleteDeadhead] = useState<DeadheadDeleteRequest>(); const [reassignTrips, setReassignTrips] = useState<{ trips: Trip[]; sourceBlockId: string }>(); const [removeTripsPending, setRemoveTripsPending] = useState(false); const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]); const [selectedUnassignedTripIds, setSelectedUnassignedTripIds] = useState<string[]>([]); const blockSelectionAnchorId = useRef<string | undefined>(undefined); const unassignedSelectionAnchorId = useRef<string | undefined>(undefined); const compatibilityRequestRef = useRef(0); const [busy, setBusy] = useState(false);
  const [unassignedCollapsed, setUnassignedCollapsed] = useState(storedUnassignedCollapsed); const [unassignedReady, setUnassignedReady] = useState(false);
  const unassignedRailRef = useRef<HTMLButtonElement>(null); const unassignedCollapseRef = useRef<HTMLButtonElement>(null); const railModeSeen = useRef<boolean | undefined>(undefined);
  const profile = profiles.find((item) => item.id === tripProfileId); const blockingScenario = scenarios.find((item) => item.id === blockingScenarioId); const day = days.find((item) => item.id === serviceDayId); const dayBlocks = allBlocks.filter((item) => item.serviceDayId === serviceDayId); const selectedBlock = dayBlocks.find((item) => item.id === selectedBlockId);
  const patterns = new Map(aggregate.patterns.map((item) => [item.id, item])); const allPatterns = new Map(records.patterns.map((item) => [item.id, item])); const nodes = new Map(aggregate.nodes.map((item) => [item.id, item])); const allNodes = new Map(records.nodes.map((item) => [item.id, item]));
  const directionNames = new Map([...(records.directions ?? []), ...(aggregate.directions ?? [])].map((item) => [item.id, item.name]));
  const patternLabel = (pattern: RoutePattern) => patternShortName(pattern, directionNames.get(pattern.directionId ?? ''), allNodes);
  const unassignedPatternOptions = [...new Set(unassigned.map((trip) => trip.patternId))].map((id) => ({ id, label: patterns.get(id)?.name ?? 'Missing pattern' })).sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
  const unassignedStartNodeOptions = [...new Set(unassigned.map((trip) => patterns.get(trip.patternId)?.points[0]?.nodeId).filter((id): id is string => Boolean(id)))].map((id) => ({ id, label: nodes.get(id)?.name ?? 'Missing node' })).sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
  const unassignedEndNodeOptions = [...new Set(unassigned.map((trip) => patterns.get(trip.patternId)?.points.at(-1)?.nodeId).filter((id): id is string => Boolean(id)))].map((id) => ({ id, label: nodes.get(id)?.name ?? 'Missing node' })).sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
  const fromTimeMinimum = parsedFilterTime(unassignedFilters.fromTime.from); const fromTimeMaximum = parsedFilterTime(unassignedFilters.fromTime.to); const toTimeMinimum = parsedFilterTime(unassignedFilters.toTime.from); const toTimeMaximum = parsedFilterTime(unassignedFilters.toTime.to);
  const filteredUnassigned = unassigned.filter((trip) => {
    const pattern = patterns.get(trip.patternId); const startNodeId = pattern?.points[0]?.nodeId; const endNodeId = pattern?.points.at(-1)?.nodeId; const fromTime = trip.stopTimes[0]?.time; const toTime = trip.stopTimes.at(-1)?.time;
    return (!unassignedFilters.patternIds.length || unassignedFilters.patternIds.includes(trip.patternId))
      && (!unassignedFilters.startNodeIds.length || (startNodeId !== undefined && unassignedFilters.startNodeIds.includes(startNodeId)))
      && (!unassignedFilters.endNodeIds.length || (endNodeId !== undefined && unassignedFilters.endNodeIds.includes(endNodeId)))
      && (fromTimeMinimum === undefined || (fromTime !== undefined && fromTime >= fromTimeMinimum))
      && (fromTimeMaximum === undefined || (fromTime !== undefined && fromTime <= fromTimeMaximum))
      && (toTimeMinimum === undefined || (toTime !== undefined && toTime >= toTimeMinimum))
      && (toTimeMaximum === undefined || (toTime !== undefined && toTime <= toTimeMaximum));
  });
  const visibleUnassigned = [...(compatibleOnly && selectedBlock ? filteredUnassigned.filter((trip) => compatibility.get(trip.id) === 'compatible') : filteredUnassigned)].sort((left, right) => {
    const leftPattern = patterns.get(left.patternId); const rightPattern = patterns.get(right.patternId); let comparison = 0;
    if (unassignedSort.column === 'pattern') comparison = (leftPattern?.name ?? '').localeCompare(rightPattern?.name ?? '', undefined, { numeric: true, sensitivity: 'base' });
    if (unassignedSort.column === 'start') comparison = (nodes.get(leftPattern?.points[0]?.nodeId ?? '')?.name ?? '').localeCompare(nodes.get(rightPattern?.points[0]?.nodeId ?? '')?.name ?? '', undefined, { numeric: true, sensitivity: 'base' });
    if (unassignedSort.column === 'end') comparison = (nodes.get(leftPattern?.points.at(-1)?.nodeId ?? '')?.name ?? '').localeCompare(nodes.get(rightPattern?.points.at(-1)?.nodeId ?? '')?.name ?? '', undefined, { numeric: true, sensitivity: 'base' });
    if (unassignedSort.column === 'fromTime' || unassignedSort.column === 'toTime') { const leftTime = unassignedSort.column === 'fromTime' ? left.stopTimes[0]?.time : left.stopTimes.at(-1)?.time; const rightTime = unassignedSort.column === 'fromTime' ? right.stopTimes[0]?.time : right.stopTimes.at(-1)?.time; comparison = leftTime === undefined ? rightTime === undefined ? 0 : 1 : rightTime === undefined ? -1 : leftTime - rightTime; }
    if (!comparison) comparison = left.id.localeCompare(right.id);
    return unassignedSort.direction === 'ascending' ? comparison : -comparison;
  });
  const unassignedFiltersActive = Boolean(unassignedFilters.patternIds.length || unassignedFilters.startNodeIds.length || unassignedFilters.endNodeIds.length || unassignedFilters.fromTime.from.trim() || unassignedFilters.fromTime.to.trim() || unassignedFilters.toTime.from.trim() || unassignedFilters.toTime.to.trim());
  const selectedBlockActivitySignature = selectedBlock ? JSON.stringify(selectedBlock.activities) : '';
  const sourceSignature = () => blockingScenario ? createBlockingScenarioSourceSignature(blockingScenario, allBlocks) : '';
  const selectedRevenueTripIds = selectedBlock?.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : []) ?? [];
  const visibleBlockActivities = selectedBlock?.activities.filter((activity) => activity.type !== 'deadhead') ?? [];
  // BL-A: side by side while there is something to assign, a rail when the list is empty or the planner collapsed it. The first load does not decide
  // the mode, so a day with unassigned Trips does not open as a rail.
  const unassignedRail = unassignedCollapsed || (unassignedReady && unassigned.length === 0);
  const selectedVisibleUnassignedIds = visibleUnassigned.filter((trip) => selectedUnassignedTripIds.includes(trip.id)).map((trip) => trip.id);

  function toggleRangeSelection(items: string[], selected: string[], anchorRef: { current?: string }, id: string, rowIndex: number, shiftKey: boolean) {
    const anchorIndex = anchorRef.current ? items.indexOf(anchorRef.current) : -1;
    if (shiftKey && anchorIndex >= 0) {
      const start = Math.min(anchorIndex, rowIndex); const end = Math.max(anchorIndex, rowIndex);
      return [...new Set([...selected, ...items.slice(start, end + 1)])];
    }
    anchorRef.current = id;
    return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
  }

  function toggleUnassignedTrip(tripId: string, rowIndex: number, shiftKey: boolean) {
    setSelectedUnassignedTripIds((current) => toggleRangeSelection(visibleUnassigned.map((trip) => trip.id), current, unassignedSelectionAnchorId, tripId, rowIndex, shiftKey));
  }

  function toggleBlockTrip(tripId: string, rowIndex: number, shiftKey: boolean) {
    setSelectedTripIds((current) => toggleRangeSelection(selectedRevenueTripIds, current, blockSelectionAnchorId, tripId, rowIndex, shiftKey));
  }

  function toggleUnassignedFilterValue(field: 'patternIds' | 'startNodeIds' | 'endNodeIds', id: string) {
    setUnassignedFilters((current) => ({ ...current, [field]: current[field].includes(id) ? current[field].filter((value) => value !== id) : [...current[field], id] }));
  }

  function updateUnassignedTimeFilter(field: 'fromTime' | 'toTime', boundary: keyof TimeRangeFilter, value: string) {
    setUnassignedFilters((current) => ({ ...current, [field]: { ...current[field], [boundary]: value } }));
  }

  function sortUnassigned(column: UnassignedSortColumn) {
    setUnassignedSort((current) => current.column === column ? { ...current, direction: current.direction === 'ascending' ? 'descending' : 'ascending' } : { column, direction: 'ascending' });
  }
  function sortBlocks(column: BlockSortColumn) {
    setBlockSort((current) => current.column === column ? { ...current, direction: current.direction === 'ascending' ? 'descending' : 'ascending' } : { column, direction: 'ascending' });
  }

  useEffect(() => { const prior = preference(); setTripProfileId((current) => current && profiles.some((item) => item.id === current) ? current : profiles.find((item) => item.id === prior.tripProfileId)?.id ?? profiles[0]?.id ?? ''); setServiceDayId((current) => current && days.some((item) => item.id === current) ? current : days.find((item) => item.id === prior.serviceDayId)?.id ?? days[0]?.id ?? ''); }, [records.scenario.id, profiles.length, days.length]);
  async function loadScenarios() { const isCurrent = scenariosRequests.begin(); try { const next = await blockingService.listBlockingScenarios(records.scenario.id); if (isCurrent()) setScenarios(next); } catch (error) { if (isCurrent()) onError(error, 'Unable to load blocking scenarios.'); } }
  useEffect(() => { void loadScenarios(); }, [records.scenario.id]);
  useEffect(() => { const prior = preference(); const candidates = scenarios.filter((item) => item.tripProfileId === tripProfileId); if (scenarioSelectionCleared) { setBlockingScenarioId(''); return; } setBlockingScenarioId((current) => current && candidates.some((item) => item.id === current) ? current : candidates.find((item) => item.id === prior.blockingScenarioByProfile?.[tripProfileId])?.id ?? candidates.find((item) => item.id === prior.blockingScenarioId)?.id ?? candidates[0]?.id ?? ''); }, [scenarios, tripProfileId, scenarioSelectionCleared]);
  // Each load starts a numbered request, and only the latest one may apply its result: a slow earlier response must not replace a later one (finding 4-026).
  async function loadBlocks() { const isCurrent = blocksRequests.begin(); if (!blockingScenarioId) { setAllBlocks([]); setSummary(undefined); setUnassigned([]); return; } try { const values = await Promise.all([blockingService.listBlockingBlocks(blockingScenarioId), blockingService.getScenarioSummary(blockingScenarioId, serviceDayId), blockingService.listUnassignedTrips(blockingScenarioId, serviceDayId, aggregate.route.id)]); if (!isCurrent()) return; setAllBlocks(values[0]); setSummary(values[1]); setUnassigned(values[2]); setUnassignedReady(true); const savedBlockId = preference().blockSelections?.[blockSelectionKey(blockingScenarioId, serviceDayId)]; setSelectedBlockId((current) => current && values[0].some((block) => block.id === current && block.serviceDayId === serviceDayId) ? current : values[0].find((block) => block.id === savedBlockId && block.serviceDayId === serviceDayId)?.id ?? values[0].find((block) => block.serviceDayId === serviceDayId)?.id ?? ''); } catch (error) { if (isCurrent()) onError(error, 'Unable to load blocks.'); } }
  useEffect(() => { void loadBlocks(); }, [blockingScenarioId, serviceDayId, aggregate.route.id]);
  useEffect(() => { let live = true; if (!serviceDayId || !tripProfileId) { setTrips([]); return; } void tripService.listScheduleTrips(serviceDayId, undefined, tripProfileId).then((value) => { if (live) setTrips(value); }).catch((error) => onError(error, 'Unable to load the selected service-day trips.')); return () => { live = false; }; }, [tripService, serviceDayId, tripProfileId]);
  // Save the selection only once it has been restored: the first render holds empty values, and writing them would erase what was remembered.
  // The blocking scenario is kept for each trip profile, so a change of trip profile does not replace another profile's choice (finding 5-025).
  useEffect(() => {
    if (!tripProfileId || !serviceDayId) return;
    const prior = preference(); const blockSelections = { ...(prior.blockSelections ?? {}) }; if (blockingScenarioId && serviceDayId && selectedBlockId) blockSelections[blockSelectionKey(blockingScenarioId, serviceDayId)] = selectedBlockId;
    const settled = scenarios.some((item) => item.id === blockingScenarioId && item.tripProfileId === tripProfileId);
    savePreference({ ...prior, tripProfileId, serviceDayId, ...(settled ? { blockingScenarioId, blockingScenarioByProfile: { ...(prior.blockingScenarioByProfile ?? {}), [tripProfileId]: blockingScenarioId } } : {}), ...(minimumLayover ? { minimumLayover } : {}), blockSelections });
  }, [tripProfileId, blockingScenarioId, serviceDayId, selectedBlockId, scenarios, minimumLayover?.mode, minimumLayover?.value]);
  useEffect(() => { setUnassignedFilters(emptyUnassignedFilters()); }, [aggregate.route.id, serviceDayId, tripProfileId]);
  useEffect(() => { setSelectedTripIds([]); setSelectedUnassignedTripIds([]); blockSelectionAnchorId.current = undefined; unassignedSelectionAnchorId.current = undefined; }, [blockingScenarioId, serviceDayId, selectedBlockId]);
  useEffect(() => {
    const requestId = ++compatibilityRequestRef.current;
    if (!selectedBlock) { setCompatibility(new Map()); setCompatibilityPending(false); return; }
    let live = true;
    setCompatibility(new Map());
    setCompatibilityPending(true);
    void blockingService.classifyInsertions(blockingScenarioId, selectedBlock.id, unassigned.map((trip) => trip.id), undefined, minimumLayover)
      .then((items) => { if (live && requestId === compatibilityRequestRef.current) { setCompatibility(new Map([...items].map(([tripId, item]) => [tripId, item.status] as const))); setCompatibilityPending(false); } })
      .catch((error) => { if (live && requestId === compatibilityRequestRef.current) { setCompatibilityPending(false); onError(error, 'Unable to review insertion compatibility.'); } });
    return () => { live = false; };
  }, [blockingScenarioId, selectedBlock?.id, selectedBlockActivitySignature, unassigned.map((item) => item.id).join(','), minimumLayover?.mode, minimumLayover?.value]);

  // When the panel and the rail swap and the focused control goes away, focus goes to the control that replaces it (keyboard users keep their place).
  useLayoutEffect(() => {
    const previous = railModeSeen.current; railModeSeen.current = unassignedRail;
    if (previous === undefined || previous === unassignedRail) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    (unassignedRail ? unassignedRailRef.current : unassignedCollapseRef.current)?.focus();
  }, [unassignedRail]);
  function setUnassignedCollapsedPreference(collapsed: boolean) { setUnassignedCollapsed(collapsed); rememberUnassignedCollapsed(collapsed); }
  async function refresh() { await Promise.all([loadScenarios(), loadBlocks(), onReload()]); }
  /** Reports a refused write. After a stale-source refusal the Blocking data is reloaded, so the next edit uses the current source (finding 5-014). */
  function failed(error: unknown, fallback: string) {
    if (isStaleSourceError(error)) {
      onError(new Error(error.findings.some((finding) => finding.ruleId === 'blockingScenario.sourceChanged') ? STALE_SOURCE_MESSAGE : error.message), fallback);
      void Promise.all([loadScenarios(), loadBlocks()]);
      return;
    }
    onError(new Error(blockingError(error, fallback)), fallback);
  }
  async function saveScenario(name: string) { if (!profile) return; setBusy(true); try { if (scenarioDialog?.mode === 'rename' && blockingScenario) await blockingService.renameBlockingScenario(blockingScenario.id, name, sourceSignature()); else if (scenarioDialog?.mode === 'duplicate' && blockingScenario) await blockingService.duplicateBlockingScenario(blockingScenario.id, name, sourceSignature()); else await blockingService.createBlockingScenario({ scenarioId: records.scenario.id, tripProfileId: profile.id, name }); setScenarioDialog(undefined); await refresh(); } catch (error) { failed(error, 'Unable to save the blocking scenario.'); } finally { setBusy(false); } }
  async function openNewBlockDialog() { if (!blockingScenario || !serviceDayId) return; try { setBlockDialog({ mode: 'create', value: await blockingService.proposeBlockLabel(blockingScenario.id, serviceDayId) }); } catch (error) { onError(error, 'Unable to propose a block label.'); } }
  async function saveBlock(name: string) { if (!blockingScenario || !serviceDayId) return; setBusy(true); try { const saved = blockDialog?.mode === 'rename' && blockDialog.block ? await blockingService.updateBlock({ ...blockDialog.block, label: name }, sourceSignature()) : await blockingService.createBlock(blockingScenario.id, serviceDayId, name, sourceSignature()); setSelectedBlockId(saved.id); setBlockDialog(undefined); await loadBlocks(); } catch (error) { failed(error, 'Unable to save the block.'); } finally { setBusy(false); } }
  async function assign(trip: Trip) { if (!selectedBlock || !blockingScenario || busy || compatibilityPending) return; compatibilityRequestRef.current += 1; setBusy(true); setCompatibilityPending(true); try { await blockingService.assignTrip({ blockingScenarioId: blockingScenario.id, serviceDayId, tripId: trip.id, destinationBlockId: selectedBlock.id, sourceSignature: sourceSignature() }); setSelectedUnassignedTripIds((ids) => ids.filter((id) => id !== trip.id)); await loadBlocks(); } catch (error) { setCompatibilityPending(false); failed(error, 'Unable to assign the trip.'); } finally { setBusy(false); } }
  /** Assigns every selected, visible unassigned Trip to the current Block in one save; the service places each by its From Time. */
  async function assignSelectedUnassigned() {
    if (!selectedBlock || !blockingScenario || busy || compatibilityPending || !selectedVisibleUnassignedIds.length) return;
    compatibilityRequestRef.current += 1; setBusy(true); setCompatibilityPending(true);
    try { await blockingService.assignTripsToBlock({ blockingScenarioId: blockingScenario.id, serviceDayId, tripIds: selectedVisibleUnassignedIds, destinationBlockId: selectedBlock.id, sourceSignature: sourceSignature() }); setSelectedUnassignedTripIds([]); await loadBlocks(); }
    catch (error) { setCompatibilityPending(false); failed(error, 'Unable to assign the selected trips.'); }
    finally { setBusy(false); }
  }
  function addBoundaryActivity(type: 'pullOut' | 'pullIn') {
    if (!selectedBlock) return;
    setActivityDraft(type === 'pullOut' ? { block: selectedBlock, type, defaultToNodeId: boundaryNode(selectedBlock, 'pullOut', trips, allPatterns) } : { block: selectedBlock, type, defaultFromNodeId: boundaryNode(selectedBlock, 'pullIn', trips, allPatterns) });
  }
  function requestReassignSelectedTrips() {
    if (!selectedBlock) return;
    const selected = selectedBlock.activities.flatMap((activity) => activity.type === 'revenueTrip' && selectedTripIds.includes(activity.tripId) ? [trips.find((trip) => trip.id === activity.tripId)] : []).filter((trip): trip is Trip => Boolean(trip));
    setReassignTrips({ trips: selected, sourceBlockId: selectedBlock.id });
  }
  /** Asks before an activity leaves the Block (finding 5-008); the dialog names the activity. */
  function requestRemoveActivity(activity: BlockActivity, name: string) {
    if (!selectedBlock) return;
    const block = '“' + selectedBlock.label + '”';
    setRemoveActivityPending(activity.type === 'revenueTrip'
      ? { activity, title: `Remove ${name}?`, text: `Remove ${name} from block ${block}? The trip will become unassigned and its connected deadheads will be removed.`, label: `Remove ${name}` }
      : { activity, title: `Remove ${name.toLowerCase()}?`, text: `Remove the ${name.toLowerCase()} from block ${block}? Platform hours and miles are incomplete until a new ${name.toLowerCase()} is added.`, label: `Remove ${name.toLowerCase()}` });
  }
  async function removeActivity(activity: BlockActivity) { if (!selectedBlock || !blockingScenario) return; setBusy(true); try { if (activity.type === 'revenueTrip') await blockingService.removeTrip(blockingScenario.id, serviceDayId, activity.tripId, sourceSignature()); else await blockingService.updateBlock({ ...selectedBlock, activities: selectedBlock.activities.filter((item) => item.id !== activity.id) }, sourceSignature()); setRemoveActivityPending(undefined); await loadBlocks(); } catch (error) { failed(error, 'Unable to remove the activity.'); } finally { setBusy(false); } }
  async function requestDeleteScenario() { if (!blockingScenario) return; try { setDeleteScenario({ scenario: blockingScenario, impact: await blockingService.previewDeleteBlockingScenario(blockingScenario.id) }); } catch (error) { failed(error, 'Unable to review the blocking scenario deletion.'); } }
  async function requestDeleteBlock() { if (!blockingScenario || !selectedBlock) return; try { setDeleteBlock({ block: selectedBlock, impact: await blockingService.previewDeleteBlock(blockingScenario.id, selectedBlock.id) }); } catch (error) { failed(error, 'Unable to review the block deletion.'); } }
  async function removeSelectedTrips() { if (!selectedBlock || !blockingScenario || !selectedTripIds.length) return; setBusy(true); try { await blockingService.removeTrips(blockingScenario.id, serviceDayId, selectedTripIds, sourceSignature()); setSelectedTripIds([]); setRemoveTripsPending(false); await loadBlocks(); } catch (error) { failed(error, 'Unable to remove the selected trips.'); } finally { setBusy(false); } }
  async function saveNotes(notes: string) { if (!notesDialog) return; setBusy(true); try { await blockingService.updateBlock({ ...notesDialog, notes: notes.trim() || undefined }, sourceSignature()); setNotesDialog(undefined); await loadBlocks(); } catch (error) { failed(error, 'Unable to save block notes.'); } finally { setBusy(false); } }
  async function removeDeadhead(request: DeadheadDeleteRequest) { if (!blockingScenario || request.draft.type !== 'deadhead' || !request.draft.activity || request.draft.activity.type !== 'deadhead') return; setBusy(true); try { const removeIds = request.applyToSimilar ? new Set(request.draft.block.activities.filter((activity): activity is Extract<BlockActivity, { type: 'deadhead' }> => activity.type === 'deadhead' && activity.fromNodeId === request.fromNodeId && activity.toNodeId === request.toNodeId).map((activity) => activity.id)) : new Set([request.draft.activity.id]); await blockingService.updateBlock({ ...request.draft.block, activities: request.draft.block.activities.filter((activity) => !removeIds.has(activity.id)) }, sourceSignature()); setDeleteDeadhead(undefined); await loadBlocks(); } catch (error) { failed(error, 'Unable to delete the deadhead.'); } finally { setBusy(false); } }
  async function reorderTripGroup(activityId: string, movement: -1 | 1) { if (!selectedBlock || !blockingScenario) return; setBusy(true); try { await blockingService.moveTripGroup(blockingScenario.id, selectedBlock.id, activityId, movement, sourceSignature()); await loadBlocks(); } catch (error) { failed(error, 'That trip order is not allowed.'); } finally { setBusy(false); } }
  function activityInputError(findings: ValidationFinding[]) { return new Error(blockingError(new Error(findings.map((finding) => finding.messageKey).join(', ')), 'Enter a whole-minute duration, locations, and optional non-negative miles.')); }
  async function saveActivity(values: ActivityValues) {
    if (!activityDraft || !blockingScenario) return;
    const input = blockingService.parseActivityInput({ minutes: values.minutes, miles: values.miles });
    if (input.findings.length || input.minutes === undefined) { onError(activityInputError(input.findings)); return; }
    try {
      const offset = input.minutes; const milesValue = input.miles;
      const base = { id: activityDraft.activity?.id ?? newId(), sequence: activityDraft.activity?.sequence ?? activityDraft.block.activities.length };
      const activity: Exclude<BlockActivity, { type: 'revenueTrip' }> = activityDraft.type === 'pullOut' ? { ...base, type: 'pullOut', minutesBeforeFirstTrip: offset, ...(values.fromNodeId ? { fromNodeId: values.fromNodeId } : {}), toNodeId: values.toNodeId, ...(milesValue === undefined ? {} : { miles: milesValue }) } : activityDraft.type === 'pullIn' ? { ...base, type: 'pullIn', minutesAfterLastTrip: offset, fromNodeId: values.fromNodeId, ...(values.toNodeId ? { toNodeId: values.toNodeId } : {}), ...(milesValue === undefined ? {} : { miles: milesValue }) } : { ...base, type: 'deadhead', minutesAfterPreviousTrip: offset, fromNodeId: values.fromNodeId, toNodeId: values.toNodeId, ...(milesValue === undefined ? {} : { miles: milesValue }) };
      setBusy(true);
      if (activity.type === 'deadhead' && values.applyToSimilar) await blockingService.applyDeadheadToMatchingConnections({ blockingScenarioId: blockingScenario.id, blockId: activityDraft.block.id, deadhead: activity, sourceSignature: sourceSignature() });
      else if (activityDraft.activity) await blockingService.editActivity({ blockingScenarioId: blockingScenario.id, blockId: activityDraft.block.id, activity, sourceSignature: sourceSignature() });
      else await blockingService.addActivity({ blockingScenarioId: blockingScenario.id, blockId: activityDraft.block.id, activity, afterTripId: activityDraft.afterTripId, sourceSignature: sourceSignature() });
      setActivityDraft(undefined); await loadBlocks();
    } catch (error) { failed(error, 'Enter a whole-minute duration, locations, and optional non-negative miles.'); } finally { setBusy(false); }
  }
  async function reviewBulkBoundary(values: ActivityValues, replaceExisting: boolean) {
    if (!activityDraft || !blockingScenario || activityDraft.type === 'deadhead') return;
    const input = blockingService.parseActivityInput({ minutes: values.minutes, miles: values.miles });
    if (input.findings.length || input.minutes === undefined) { onError(activityInputError(input.findings)); return; }
    const minutes = input.minutes; const miles = input.miles;
    if (activityDraft.type === 'pullOut' && !values.toNodeId || activityDraft.type === 'pullIn' && !values.fromNodeId) { onError(new Error('Select the matching node.')); return; }
    const base = { id: activityDraft.activity?.id ?? newId(), sequence: activityDraft.activity?.sequence ?? 0 };
    const activity = activityDraft.type === 'pullOut'
      ? { ...base, type: 'pullOut' as const, minutesBeforeFirstTrip: minutes, ...(values.fromNodeId ? { fromNodeId: values.fromNodeId } : {}), toNodeId: values.toNodeId, ...(miles === undefined ? {} : { miles }) }
      : { ...base, type: 'pullIn' as const, minutesAfterLastTrip: minutes, fromNodeId: values.fromNodeId, ...(values.toNodeId ? { toNodeId: values.toNodeId } : {}), ...(miles === undefined ? {} : { miles }) };
    const request: BulkBoundaryRequest = { blockingScenarioId: blockingScenario.id, serviceDayId, sourceBlockId: activityDraft.block.id, activity, replaceExisting, sourceSignature: sourceSignature() };
    setBusy(true);
    try { setBoundaryReview({ request, preview: await blockingService.previewBulkBoundaryActivities(request) }); }
    catch (error) { failed(error, 'Unable to review matching blocks.'); }
    finally { setBusy(false); }
  }
  async function applyBulkBoundary() {
    if (!boundaryReview) return;
    setBusy(true);
    try { await blockingService.applyBulkBoundaryActivities({ ...boundaryReview.request, expectedEndpointSignature: boundaryReview.preview.endpointSignature }); setBoundaryReview(undefined); setActivityDraft(undefined); await loadBlocks(); }
    catch (error) { setBoundaryReview(undefined); failed(error, 'Unable to update matching blocks.'); }
    finally { setBusy(false); }
  }
  async function exportCsv() { if (!blockingScenario) return; setBusy(true); try { const base = blockingScenario.name.replaceAll(/[^a-z0-9]+/gi, '-').replaceAll(/^-|-$/g, '') || 'blocking-scenario'; const files = await blockingService.exportBlockingScenarioCsv(blockingScenario.id); downloadBlob(base + '-csv.zip', createCsvArchive(files.map((file) => ({ filename: base + '-' + file.suffix + '.csv', contents: file.contents })))); } catch (error) { onError(error, 'Unable to export blocking scenario CSV files.'); } finally { setBusy(false); } }

  if (!profile) return <section className="empty-state"><h1 className="box-heading">No trip profile available</h1><p>Create a trip profile on the Trips tab before creating a blocking scenario.</p></section>;
  const scenarioOptions = scenarios.filter((item) => item.tripProfileId === tripProfileId);
  const blockingActionsMenu: MenuGroup[] = [
    { label: 'Blocking scenario', items: [
      { id: 'new', label: 'New blocking scenario…', restoreFocus: false, disabled: busy, onSelect: () => { setScenarioSelectionCleared(false); setScenarioDialog({ mode: 'create', value: '' }); } },
      { id: 'duplicate', label: 'Duplicate blocking scenario…', restoreFocus: false, disabled: !blockingScenario || busy, onSelect: () => blockingScenario && setScenarioDialog({ mode: 'duplicate', value: blockingScenario.name + ' Copy' }) },
      { id: 'rename', label: 'Rename blocking scenario…', restoreFocus: false, disabled: !blockingScenario || busy, onSelect: () => blockingScenario && setScenarioDialog({ mode: 'rename', value: blockingScenario.name }) },
      { id: 'delete', label: 'Delete blocking scenario…', destructive: true, restoreFocus: false, disabled: !blockingScenario || busy, onSelect: () => void requestDeleteScenario() },
    ] },
    { label: 'Data', items: [{ id: 'export', label: 'Export blocking CSV (ZIP)', disabled: !blockingScenario || busy, onSelect: () => { void exportCsv(); } }] },
  ];
  const currentBlockMenu: MenuGroup[] = [
    { label: 'Blocks', items: [...dayBlocks].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' })).map((block) => ({ id: block.id, label: block.label, checked: block.id === selectedBlockId, disabled: busy, onSelect: () => setSelectedBlockId(block.id) })) },
  ];
  const layoverLabel = minimumLayover ? `Minimum layover: ${minimumLayover.value}${minimumLayover.mode === 'minutes' ? ' min' : '%'}` : 'Minimum layover…';
  const unassignedActionsMenu: MenuGroup[] = [
    // "Compatible only" and "Clear filters" are visible in the panel header (BL-A); the minimum layover has no visible control, so it stays here.
    { label: 'Compatibility', items: [{ id: 'minimum-layover', label: layoverLabel, restoreFocus: false, onSelect: () => setLayoverDialogOpen(true) }] },
  ];
  const currentBlockActionsMenu: MenuGroup[] = [
    // New block is a header button, boundary activities are table rows, and the selected-trip commands are in the selection bar (BL-A).
    { label: 'Block', items: [
      { id: 'rename', label: 'Rename block…', restoreFocus: false, disabled: !selectedBlock || busy, onSelect: () => selectedBlock && setBlockDialog({ mode: 'rename', block: selectedBlock, value: selectedBlock.label }) },
      { id: 'notes', label: 'Edit notes…', restoreFocus: false, disabled: !selectedBlock || busy, onSelect: () => selectedBlock && setNotesDialog(selectedBlock) },
      { id: 'delete', label: 'Delete block…', destructive: true, restoreFocus: false, disabled: !selectedBlock || busy, onSelect: () => void requestDeleteBlock() },
    ] },
  ];
  const selectedSummary = summary?.blockSummaries.find((item) => item.blockId === selectedBlock?.id);
  const blockRows: BlockTableRow[] = dayBlocks.map((block) => {
    const value = summary?.blockSummaries.find((item) => item.blockId === block.id);
    const activityTimings = new Map(value?.activityTimings.map((timing) => [timing.activityId, timing]) ?? []);
    const revenueActivities = block.activities.filter((activity) => activity.type === 'revenueTrip');
    const pullOutActivity = block.activities.find((activity) => activity.type === 'pullOut');
    const pullInActivity = block.activities.find((activity) => activity.type === 'pullIn');
    return {
      block,
      value,
      trips: revenueActivities.length,
      times: {
        pullOut: pullOutActivity ? activityTimings.get(pullOutActivity.id)?.startTime : undefined,
        start: revenueActivities[0] ? activityTimings.get(revenueActivities[0].id)?.startTime : undefined,
        end: revenueActivities.at(-1) ? activityTimings.get(revenueActivities.at(-1)!.id)?.endTime : undefined,
        pullIn: pullInActivity ? activityTimings.get(pullInActivity.id)?.endTime : undefined,
      },
      layoverPercent: value?.layoverPercent,
    };
  }).sort((left, right) => {
    const leftValue = blockSortValue(left, blockSort.column); const rightValue = blockSortValue(right, blockSort.column);
    if (leftValue === undefined || rightValue === undefined) return leftValue === rightValue ? left.block.label.localeCompare(right.block.label, undefined, { numeric: true, sensitivity: 'base' }) : leftValue === undefined ? 1 : -1;
    let comparison = typeof leftValue === 'string' && typeof rightValue === 'string' ? leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' }) : Number(leftValue) - Number(rightValue);
    if (!comparison) comparison = left.block.label.localeCompare(right.block.label, undefined, { numeric: true, sensitivity: 'base' });
    return blockSort.direction === 'ascending' ? comparison : -comparison;
  });
  const selectedRow = blockRows.find((row) => row.block.id === selectedBlock?.id);
  const currentBlockSubtitle = selectedBlock && selectedRow ? <>{plural(selectedRow.trips, 'trip')} · {time(selectedRow.times.pullOut ?? selectedRow.times.start)} – {time(selectedRow.times.pullIn ?? selectedRow.times.end)} · Revenue {tileHours(selectedRow.value?.revenueHours)} · Layover {percentage(selectedRow.layoverPercent)}</> : undefined;
  return <div className="blocking-workspace" aria-label="Blocking workspace">
    <h1 className="visually-hidden">Blocking</h1>
    {scopeSlot && createPortal(<><ContextField label="Route" maxWidth={190}><select aria-label="Route" value={routeId} title={routes.find((route) => route.id === routeId)?.name || undefined} onChange={(event) => onRouteChange(event.target.value)}>{routes.map((route) => <option key={route.id} value={route.id}>{routeOptionLabel(route, routes)}</option>)}</select></ContextField><ContextField label="Trip profile"><select aria-label="Trip profile" value={tripProfileId} onChange={(event) => { setScenarioSelectionCleared(false); setTripProfileId(event.target.value); }}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></ContextField><ContextField label="Blocking scenario" maxWidth={210}><select aria-label="Blocking scenario" value={blockingScenarioId} disabled={busy} onChange={(event) => { setScenarioSelectionCleared(!event.target.value); setBlockingScenarioId(event.target.value); }}><option value="">No blocking scenario</option>{scenarioOptions.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></ContextField><ContextField label="Day"><select aria-label="Day" value={serviceDayId} onChange={(event) => setServiceDayId(event.target.value)}>{days.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></ContextField><span className="scope-bar__spacer" /><MenuButton label="Actions" triggerAriaLabel="Blocking actions" menuLabel="Blocking actions" groups={blockingActionsMenu} disabled={busy} /></>, scopeSlot)}
    {!blockingScenario ? <section className="prerequisite"><h2>Create or select a blocking scenario</h2><p>A blocking scenario is a named vehicle-blocking alternative for the selected trip profile. It spans all service days.</p></section> : <><div className={'blocking-top blocking-top--' + (unassignedRail ? 'rail' : 'side')}>
      {unassignedRail ? <button ref={unassignedRailRef} type="button" className="unassigned-rail" aria-label={`Expand unassigned trips, ${unassigned.length}`} title={unassigned.length ? 'Show the unassigned trips' : 'No unassigned trips on this day'} onClick={() => setUnassignedCollapsedPreference(false)}>
        <span className="unassigned-rail__arrow" aria-hidden="true">▸</span><span className={'unassigned-rail__badge ' + (unassigned.length ? 'unassigned-rail__badge--warn' : 'unassigned-rail__badge--ok')} aria-hidden="true">{unassigned.length}</span><span className="unassigned-rail__label" aria-hidden="true">Unassigned trips · {unassigned.length ? unassigned.length : 'none left'}</span>
      </button> : <WorkSurface title="Unassigned trips" ariaLabel="Unassigned trips" className="unassigned-surface" count={unassigned.length} actions={<>
        <button type="button" className="toggle-button" aria-pressed={compatibleOnly} disabled={!selectedBlock || busy} title={selectedBlock ? 'Show only trips that fit the current block.' : 'Select a block first.'} onClick={() => setCompatibleOnly((current) => !current)}>Compatible only</button>
        {unassignedFiltersActive && <button type="button" className="ghost" onClick={() => setUnassignedFilters(emptyUnassignedFilters())}>Clear filters</button>}
        <MenuButton label="Actions" menuLabel="Unassigned trip actions" groups={unassignedActionsMenu} disabled={busy || compatibilityPending} />
        <button ref={unassignedCollapseRef} type="button" className="icon-button" aria-label="Collapse unassigned trips" title="Collapse unassigned trips" onClick={() => setUnassignedCollapsedPreference(true)}>◂</button>
      </>}>{selectedVisibleUnassignedIds.length > 0 && <SelectionBar count={selectedVisibleUnassignedIds.length} noun="" ariaLabel="Selected unassigned trips" onClear={() => { unassignedSelectionAnchorId.current = undefined; setSelectedUnassignedTripIds([]); }}>
        <button type="button" className="primary" disabled={!selectedBlock || busy || compatibilityPending} title={selectedBlock ? undefined : 'Select a block first.'} onClick={() => void assignSelectedUnassigned()}>Assign to Block {selectedBlock?.label ?? ''}</button>
      </SelectionBar>}{compatibilityPending && <p className="blocking-compatibility-status" role="status" aria-live="polite">Reviewing trip compatibility…</p>}<div className="table-scroll data-grid blocking-trips-table"><table><colgroup><col className="blocking-selection-column" /><col className="blocking-pattern-column" /><col className="blocking-node-column" /><col className="blocking-time-column" /><col className="blocking-time-column" /><col className="blocking-node-column" /><col className="blocking-assign-column" /></colgroup><thead><tr><th scope="col" className="blocking-selection-column"><input type="checkbox" aria-label="Select all unassigned trips" checked={visibleUnassigned.length > 0 && visibleUnassigned.every((trip) => selectedUnassignedTripIds.includes(trip.id))} disabled={!visibleUnassigned.length || busy} onChange={(event) => { unassignedSelectionAnchorId.current = undefined; setSelectedUnassignedTripIds(event.target.checked ? visibleUnassigned.map((trip) => trip.id) : []); }} /></th><SortableFilterHeader label="Pattern" active={unassignedSort.column === 'pattern'} direction={unassignedSort.direction} filterActive={unassignedFilters.patternIds.length > 0} onSort={() => sortUnassigned('pattern')}><FilterOptionList options={unassignedPatternOptions} selected={unassignedFilters.patternIds} onToggle={(id) => toggleUnassignedFilterValue('patternIds', id)} /></SortableFilterHeader><SortableFilterHeader label="Start" active={unassignedSort.column === 'start'} direction={unassignedSort.direction} filterActive={unassignedFilters.startNodeIds.length > 0} onSort={() => sortUnassigned('start')}><FilterOptionList options={unassignedStartNodeOptions} selected={unassignedFilters.startNodeIds} onToggle={(id) => toggleUnassignedFilterValue('startNodeIds', id)} /></SortableFilterHeader><SortableFilterHeader label="From time" active={unassignedSort.column === 'fromTime'} direction={unassignedSort.direction} filterActive={Boolean(unassignedFilters.fromTime.from.trim() || unassignedFilters.fromTime.to.trim())} onSort={() => sortUnassigned('fromTime')}><TimeRangeFilter value={unassignedFilters.fromTime} onChange={(boundary, value) => updateUnassignedTimeFilter('fromTime', boundary, value)} /></SortableFilterHeader><SortableFilterHeader label="To time" active={unassignedSort.column === 'toTime'} direction={unassignedSort.direction} filterActive={Boolean(unassignedFilters.toTime.from.trim() || unassignedFilters.toTime.to.trim())} onSort={() => sortUnassigned('toTime')}><TimeRangeFilter value={unassignedFilters.toTime} onChange={(boundary, value) => updateUnassignedTimeFilter('toTime', boundary, value)} /></SortableFilterHeader><SortableFilterHeader label="End" active={unassignedSort.column === 'end'} direction={unassignedSort.direction} filterActive={unassignedFilters.endNodeIds.length > 0} onSort={() => sortUnassigned('end')}><FilterOptionList options={unassignedEndNodeOptions} selected={unassignedFilters.endNodeIds} onToggle={(id) => toggleUnassignedFilterValue('endNodeIds', id)} /></SortableFilterHeader><th scope="col" className="blocking-assign-column">Assign</th></tr></thead><tbody>{visibleUnassigned.map((trip, index) => <UnassignedRow key={trip.id} trip={trip} pattern={patterns.get(trip.patternId)} patternLabel={patternLabel} nodes={nodes} status={compatibility.get(trip.id)} selected={selectedUnassignedTripIds.includes(trip.id)} disabled={!selectedBlock || compatibilityPending} busy={busy} onToggle={(shiftKey) => toggleUnassignedTrip(trip.id, index, shiftKey)} onAssign={() => void assign(trip)} />)}{!visibleUnassigned.length && <tr><td colSpan={7} className="table-empty">{compatibleOnly ? 'No compatible unassigned trips at the proposed time-based position.' : unassignedFiltersActive ? 'No unassigned trips match the current filters.' : 'No unassigned trips on the selected route and service day.'}</td></tr>}</tbody></table></div></WorkSurface>}
      <WorkSurface title="Current block" ariaLabel="Current block" className="current-block-surface" context={<MenuButton fieldLabel="Block" label={selectedBlock?.label ?? 'Select block'} menuLabel="Current block"groups={currentBlockMenu} disabled={busy} selectionStyle="highlight" />} subtitle={currentBlockSubtitle} actions={<>
        <button type="button" disabled={busy} onClick={() => void openNewBlockDialog()}>New block</button>
        <MenuButton label="Actions" menuLabel="Current block actions" groups={currentBlockActionsMenu} disabled={busy} />
      </>}>{selectedBlock ? <>{selectedTripIds.length > 0 && <SelectionBar count={selectedTripIds.length} noun="trip" ariaLabel="Selected block trips" onClear={() => { blockSelectionAnchorId.current = undefined; setSelectedTripIds([]); }}>
        <button type="button" className="subtle-danger" disabled={busy} onClick={() => setRemoveTripsPending(true)}>Remove from block…</button>
        <button type="button" disabled={dayBlocks.length < 2 || busy} title={dayBlocks.length < 2 ? 'Create another block to move trips to.' : undefined} onClick={requestReassignSelectedTrips}>Move to block…</button>
      </SelectionBar>}<div className="table-scroll data-grid block-activities-table"><table><thead><tr><th scope="col" className="blocking-selection-column"><input type="checkbox" aria-label="Select all trips in current block" checked={selectedRevenueTripIds.length > 0 && selectedTripIds.length === selectedRevenueTripIds.length} disabled={!selectedRevenueTripIds.length || busy} onChange={(event) => { blockSelectionAnchorId.current = undefined; setSelectedTripIds(event.target.checked ? selectedRevenueTripIds : []); }} /></th><th scope="col" className="blocking-index-column">#</th><th scope="col" className="blocking-pattern-column">Pattern</th><th scope="col" className="blocking-node-column">Start</th><th scope="col" className="blocking-time-column">From time</th><th scope="col" className="blocking-time-column">To time</th><th scope="col" className="blocking-node-column">End</th><th scope="col" className="blocking-deadhead-column">Deadhead</th><th scope="col" className="blocking-layover-column">Layover</th><th scope="col" className="blocking-actions-column">Actions</th></tr></thead><tbody>{!selectedBlock.activities.some((activity) => activity.type === 'pullOut') && <tr className="blocking-add-row"><td colSpan={10}><button type="button" className="link-button" disabled={busy} onClick={() => addBoundaryActivity('pullOut')}>+ Add pull-out</button></td></tr>}{visibleBlockActivities.map((activity, index) => <ActivityRow key={activity.id} activity={activity} index={index} tripNumber={activity.type === 'revenueTrip' ? selectedBlock.activities.filter((candidate) => candidate.type === 'revenueTrip' && candidate.sequence <= activity.sequence).length : undefined} trips={trips} patterns={allPatterns} patternLabel={patternLabel} nodes={allNodes} routes={routes} selectedRouteId={routeId} summary={selectedSummary} selected={activity.type === 'revenueTrip' && selectedTripIds.includes(activity.tripId)} onToggle={(shiftKey) => activity.type === 'revenueTrip' && toggleBlockTrip(activity.tripId, selectedRevenueTripIds.indexOf(activity.tripId), shiftKey)} onRemove={(name) => requestRemoveActivity(activity, name)} onEdit={() => activity.type !== 'revenueTrip' && setActivityDraft({ block: selectedBlock, activity, type: activity.type })} onMove={(movement) => void reorderTripGroup(activity.id, movement)} onDeadhead={(connection, existing) => { const predecessor = trips.find((trip) => trip.id === connection.previousTripId); const successor = trips.find((trip) => trip.id === connection.nextTripId); const predecessorPattern = predecessor ? patterns.get(predecessor.patternId) : undefined; const successorPattern = successor ? patterns.get(successor.patternId) : undefined; setActivityDraft({ block: selectedBlock, activity: existing, type: 'deadhead', afterTripId: connection.previousTripId, connectionDescription: `Between ${predecessorPattern?.name ?? 'the preceding Trip'} ending ${time(predecessor?.stopTimes.at(-1)?.time)} and ${successorPattern?.name ?? 'the next Trip'} beginning ${time(successor?.stopTimes[0]?.time)}.`, defaultFromNodeId: predecessorPattern?.points.at(-1)?.nodeId, defaultToNodeId: successorPattern?.points[0]?.nodeId }); }} />)}{!visibleBlockActivities.length && <tr><td colSpan={10} className="table-empty">This empty block is valid. Assign a trip or add a boundary activity.</td></tr>}{!selectedBlock.activities.some((activity) => activity.type === 'pullIn') && <tr className="blocking-add-row"><td colSpan={10}><button type="button" className="link-button" disabled={busy} onClick={() => addBoundaryActivity('pullIn')}>+ Add pull-in</button></td></tr>}</tbody></table></div><Findings summary={selectedSummary} /></> : <p className="profile-usage">Choose an existing block or create one with New block.</p>}</WorkSurface>
    </div><SummaryPanel summary={summary} serviceDayName={day?.name ?? 'Service day'} blockCount={dayBlocks.length} /><WorkSurface title="Blocks" ariaLabel="Blocks" className="blocks-surface" subtitle={`${day?.name ?? 'Service day'} · select a block name to open it`}><div className="table-scroll data-grid blocking-blocks-table"><table><colgroup><col className="blocking-block-name-column" /><col className="blocking-block-trips-column" /><col className="blocking-block-time-column" /><col className="blocking-block-time-column" /><col className="blocking-block-time-column" /><col className="blocking-block-time-column" /><col className="blocking-block-hours-column" /><col className="blocking-block-hours-column" /><col className="blocking-block-percent-column" /><col className="blocking-block-hours-column" /><col className="blocking-block-deadhead-column" /><col className="blocking-block-hours-column" /></colgroup><thead><tr><BlockSortHeader label="Block" column="block" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Trips" column="trips" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Pull-out" column="pullOut" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Start" column="start" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="End" column="end" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Pull-in" column="pullIn" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Running (h)" column="running" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Layover (h)" column="layover" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Layover %" column="layoverPercent" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Revenue (h)" column="revenue" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Deadhead (h)" column="deadhead" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Platform (h)" column="platform" sort={blockSort} onSort={sortBlocks} /></tr></thead><tbody>{blockRows.map(({ block, value, trips: tripCount, times }) => <tr key={block.id} className={block.id === selectedBlockId ? 'selected-block-row' : undefined}><td><span className="blocking-block-name"><button className="link-button" onClick={() => setSelectedBlockId(block.id)}>{block.label}</button><BlockStatusIcon summary={value} /></span></td><td>{tripCount}</td><td>{time(times.pullOut)}</td><td>{time(times.start)}</td><td>{time(times.end)}</td><td>{time(times.pullIn)}</td><td>{hours(value?.runningHours)}</td><td>{hours(value?.layoverHours)}</td><td>{percentage(value?.layoverPercent)}</td><td>{hours(value?.revenueHours)}</td><td>{hours(value?.deadheadHours)}</td><td>{hours(value?.platformHours)}</td></tr>)}{!blockRows.length && <tr><td colSpan={12} className="table-empty">No blocks for this service day. Create an empty block to start.</td></tr>}</tbody><tfoot><tr><th scope="row" colSpan={6}>Total · {plural(blockRows.length, 'block')}</th><td>{hours(summary?.runningHours)}</td><td>{hours(summary?.layoverHours)}</td><td>{percentage(summary?.layoverPercent)}</td><td>{hours(summary?.revenueHours)}</td><td>{hours(summary?.deadheadHours)}</td><td>{hours(summary?.platformHours)}</td></tr></tfoot></table></div></WorkSurface></>}
    {scenarioDialog && <NameDialog title={scenarioDialog.mode === 'create' ? 'New blocking scenario' : scenarioDialog.mode === 'duplicate' ? 'Duplicate blocking scenario' : 'Rename blocking scenario'} initialValue={scenarioDialog.value} submitLabel={scenarioDialog.mode === 'duplicate' ? 'Duplicate' : scenarioDialog.mode === 'rename' ? 'Rename' : 'Create'} busy={busy} onSubmit={saveScenario} onClose={() => setScenarioDialog(undefined)} />}
    {blockDialog && <NameDialog title={blockDialog.mode === 'create' ? 'New block' : 'Rename block'} initialValue={blockDialog.value} submitLabel={blockDialog.mode === 'create' ? 'Create block' : 'Rename'} busy={busy} onSubmit={saveBlock} onClose={() => setBlockDialog(undefined)} />}
    {notesDialog && <NotesDialog block={notesDialog} busy={busy} onSubmit={saveNotes} onClose={() => setNotesDialog(undefined)} />}
    {layoverDialogOpen && <MinimumLayoverDialog value={minimumLayover} parse={(mode, amount) => blockingService.parseMinimumLayover(mode, amount)} onSubmit={(value) => { setMinimumLayover(value); setLayoverDialogOpen(false); }} onClose={() => setLayoverDialogOpen(false)} />}
    {deleteScenario && <Confirm title="Delete blocking scenario?" text={`Delete “${deleteScenario.scenario.name}” with ${plural(deleteScenario.impact.blockCount, 'block')} and ${plural(deleteScenario.impact.activityCount, 'activity', 'activities')} across every service day? This cannot be undone.`} label="Delete blocking scenario" busy={busy} onConfirm={() => { setBusy(true); void blockingService.deleteBlockingScenario(deleteScenario.scenario.id, deleteScenario.impact.sourceSignature).then(async () => { setScenarioSelectionCleared(true); setBlockingScenarioId(''); setDeleteScenario(undefined); await refresh(); }).catch((error) => { setDeleteScenario(undefined); failed(error, 'Unable to delete the blocking scenario.'); }).finally(() => setBusy(false)); }} onClose={() => setDeleteScenario(undefined)} />}
    {deleteBlock && <Confirm title="Delete block?" text={`Delete block “${deleteBlock.block.label}” with ${plural(deleteBlock.impact.tripCount, 'trip')}, ${plural(deleteBlock.impact.deadheadCount, 'deadhead')}, and ${plural(deleteBlock.impact.activityCount, 'activity', 'activities')} in all? Its trips will become unassigned in this blocking scenario. This cannot be undone.`} label="Delete block" busy={busy} onConfirm={() => { if (!blockingScenario) return; setBusy(true); void blockingService.deleteBlock(blockingScenario.id, deleteBlock.block.id, deleteBlock.impact.sourceSignature).then(async () => { setDeleteBlock(undefined); await loadBlocks(); }).catch((error) => { setDeleteBlock(undefined); failed(error, 'Unable to delete the block.'); }).finally(() => setBusy(false)); }} onClose={() => setDeleteBlock(undefined)} />}
    {activityDraft && <ActivityDialog draft={activityDraft} nodes={activityDraft.type === 'deadhead' ? [...nodes.values()] : records.nodes} busy={busy} boundaryPreview={boundaryReview?.preview} onSubmit={saveActivity} onReviewBulk={reviewBulkBoundary} onApplyBulk={() => void applyBulkBoundary()} onResetBulk={() => setBoundaryReview(undefined)} onRequestDelete={(values) => { if (!activityDraft.activity || activityDraft.type !== 'deadhead') return; setDeleteDeadhead({ draft: activityDraft, fromNodeId: values.fromNodeId, toNodeId: values.toNodeId, applyToSimilar: values.applyToSimilar }); setActivityDraft(undefined); }} onClose={() => { setBoundaryReview(undefined); setActivityDraft(undefined); }} />}
    {deleteDeadhead && <Confirm title={deleteDeadhead.applyToSimilar ? 'Delete similar deadheads?' : 'Delete deadhead?'} text={deleteDeadhead.applyToSimilar ? 'Delete every deadhead in this block with the selected From and To nodes? This cannot be undone.' : 'Delete this deadhead? This cannot be undone.'} label={deleteDeadhead.applyToSimilar ? 'Delete similar deadheads' : 'Delete deadhead'} busy={busy} onConfirm={() => void removeDeadhead(deleteDeadhead)} onClose={() => setDeleteDeadhead(undefined)} />}
    {removeActivityPending && <Confirm title={removeActivityPending.title} text={removeActivityPending.text} label={removeActivityPending.label} busy={busy} onConfirm={() => void removeActivity(removeActivityPending.activity)} onClose={() => setRemoveActivityPending(undefined)} />}
    {removeTripsPending && <Confirm title="Remove selected trips?" text={`Remove ${selectedTripIds.length} selected trip${selectedTripIds.length === 1 ? '' : 's'} from “${selectedBlock?.label ?? 'this block'}”? The trips will become unassigned and connected deadheads will be removed.`} label="Remove from block" busy={busy} onConfirm={() => void removeSelectedTrips()} onClose={() => setRemoveTripsPending(false)} />}
    {reassignTrips && <ReassignDialog tripCount={reassignTrips.trips.length} sourceBlock={dayBlocks.find((block) => block.id === reassignTrips.sourceBlockId)} destinationBlocks={dayBlocks.filter((block) => block.id !== reassignTrips.sourceBlockId)} busy={busy} onSubmit={(destinationBlockId) => { if (!blockingScenario) return; setBusy(true); void blockingService.reassignTrips({ blockingScenarioId: blockingScenario.id, serviceDayId, tripIds: reassignTrips.trips.map((trip) => trip.id), sourceBlockId: reassignTrips.sourceBlockId, destinationBlockId, sourceSignature: sourceSignature() }).then(async () => { setReassignTrips(undefined); setSelectedTripIds([]); setSelectedBlockId(destinationBlockId); await loadBlocks(); }).catch((error) => failed(error, 'Unable to move the selected trips.')).finally(() => setBusy(false)); }} onClose={() => setReassignTrips(undefined)} />}
  </div>;
}

function BlockSortHeader({ label, column, sort, onSort }: { label: string; column: BlockSortColumn; sort: BlockSort; onSort: (column: BlockSortColumn) => void }) {
  const active = sort.column === column;
  return <th scope="col" aria-sort={active ? sort.direction : 'none'}><button type="button" className="column-sort-button" aria-label={`Sort by ${label}${active ? `, ${sort.direction}` : ''}`} onClick={() => onSort(column)}><span className="column-sort-label">{label}</span><SortIndicator active={active} direction={sort.direction} /></button></th>;
}

/** ▲ or ▼ on the sorted column. Other columns keep the space of a ↕ that shows only on hover or keyboard focus, so labels do not move. */
function SortIndicator({ active, direction }: { active: boolean; direction: 'ascending' | 'descending' }) {
  return <span className={active ? 'column-sort-indicator' : 'column-sort-indicator column-sort-indicator--idle'} aria-hidden="true">{active ? direction === 'ascending' ? '▲' : '▼' : '↕'}</span>;
}

function SortableFilterHeader({ label, active, direction, filterActive, onSort, children }: { label: string; active: boolean; direction: UnassignedSort['direction']; filterActive: boolean; onSort: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as globalThis.Node)) setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);
  const directionLabel = active ? direction : 'none';
  return <th scope="col" className="sortable-filter-header" aria-sort={active ? direction : 'none'}><div className="table-header-controls" ref={rootRef} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
    <button type="button" className="column-sort-button" aria-label={`Sort by ${label}. Current order: ${directionLabel}.`} onClick={onSort}><span className="column-sort-label">{label}</span><SortIndicator active={active} direction={direction} /></button>
    <button type="button" className={'column-filter-button' + (filterActive ? ' active' : '')} aria-label={`Filter ${label}`} aria-haspopup="dialog" aria-expanded={open} title={`Filter ${label}`} onClick={() => setOpen((current) => !current)}><span aria-hidden="true">▾</span></button>
    {open && <div className="column-filter-popover" role="dialog" aria-label={`Filter ${label}`}>{children}</div>}
  </div></th>;
}

function FilterOptionList({ options, selected, onToggle }: { options: Array<{ id: string; label: string }>; selected: string[]; onToggle: (id: string) => void }) {
  return options.length ? <div className="column-filter-options">{options.map((option) => <label key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={() => onToggle(option.id)} />{option.label}</label>)}</div> : <p className="column-filter-empty">No values available.</p>;
}

function TimeRangeFilter({ value, onChange }: { value: TimeRangeFilter; onChange: (boundary: keyof TimeRangeFilter, value: string) => void }) {
  const fromValid = validOrBlankFilterTime(value.from); const toValid = validOrBlankFilterTime(value.to);
  return <div className="column-filter-range"><label>On or after<input aria-label="On or after" placeholder="6:30" value={value.from} aria-invalid={!fromValid} onChange={(event) => onChange('from', event.target.value)} /></label><label>On or before<input aria-label="On or before" placeholder="25:00" value={value.to} aria-invalid={!toValid} onChange={(event) => onChange('to', event.target.value)} /></label>{(!fromValid || !toValid) && <p className="column-filter-error">Use a time such as 6:30 or 25:00.</p>}</div>;
}

/** A Node cell in the Blocking tables: the Node's short name (generated when none is entered), with the full name as its tooltip. */
function NodeName({ node }: { node?: Node }) { return node ? <span title={node.name}>{nodeShortName(node)}</span> : <>—</>; }
function UnassignedRow({ trip, pattern, patternLabel, nodes, status, selected, disabled, busy, onToggle, onAssign }: { trip: Trip; pattern?: RouteDefinitionAggregate['patterns'][number]; patternLabel: (pattern: RoutePattern) => string; nodes: Map<string, Node>; status?: CompatibilityStatus; selected: boolean; disabled: boolean; busy: boolean; onToggle: (shiftKey: boolean) => void; onAssign: () => void }) { const first = pattern?.points[0]; const last = pattern?.points.at(-1); return <tr className={status && status !== 'compatible' ? 'blocking-row-' + status : undefined}><td className="blocking-selection-column"><input type="checkbox" aria-label={`Select unassigned trip ${time(trip.stopTimes[0]?.time)}`} checked={selected} disabled={busy} onClick={(event) => onToggle(event.shiftKey)} /></td><td className="blocking-pattern-column">{pattern ? <span className={patternPillClass(pattern.id)} title={pattern.name}>{patternLabel(pattern)}</span> : 'Missing pattern'}</td><td className="blocking-node-column"><NodeName node={nodes.get(first?.nodeId ?? '')} /></td><td className="blocking-time-column">{time(trip.stopTimes[0]?.time)}</td><td className="blocking-time-column">{time(trip.stopTimes.at(-1)?.time)}</td><td className="blocking-node-column"><NodeName node={nodes.get(last?.nodeId ?? '')} /></td><td className="blocking-assign-column"><button className={'assign-button ' + (status ?? 'unselected')} disabled={disabled || busy} title={fitHelp(status)} aria-label={fitAccessibleLabel(status) + ': ' + fitHelp(status)} onClick={onAssign}>{fitLabel(status)}</button></td></tr>; }
function ActivityRow({ activity, tripNumber, trips, patterns, patternLabel, nodes, routes, selectedRouteId, summary, selected, onToggle, onRemove, onEdit, onMove, onDeadhead }: {
  activity: BlockActivity; index: number; tripNumber?: number; trips: Trip[]; patterns: Map<string, RouteDefinitionAggregate['patterns'][number]>; patternLabel: (pattern: RoutePattern) => string; nodes: Map<string, Node>; routes: Route[]; selectedRouteId: string; summary?: BlockSummary;
  selected: boolean; onToggle: (shiftKey: boolean) => void; onRemove: (name: string) => void; onEdit: () => void; onMove: (movement: -1 | 1) => void; onDeadhead: (connection: BlockSummary['connections'][number], activity?: Extract<BlockActivity, { type: 'deadhead' }>) => void;
}) {
  const trip = activity.type === 'revenueTrip' ? trips.find((item) => item.id === activity.tripId) : undefined;
  const pattern = trip ? patterns.get(trip.patternId) : undefined;
  const timing = summary?.activityTimings.find((item) => item.activityId === activity.id);
  const connection = activity.type === 'revenueTrip' ? summary?.connections.find((item) => item.previousTripId === activity.tripId) : undefined;
  const hasPreviousRevenue = activity.type === 'revenueTrip' && Boolean(summary?.connections.some((item) => item.nextTripId === activity.tripId));
  // A Trip from another Route shows that Route's short name in its pill; a Trip of the selected Route is unchanged (user decision 15).
  const otherRoute = trip && trip.routeId !== selectedRouteId ? routes.find((route) => route.id === trip.routeId) : undefined;
  const routePrefix = otherRoute ? `${otherRoute.shortName || otherRoute.name || 'Other route'} · ` : '';
  const label = activity.type === 'revenueTrip' ? routePrefix + (pattern ? patternLabel(pattern) : 'Missing pattern') : activity.type === 'pullOut' ? 'Pull-out' : activity.type === 'pullIn' ? 'Pull-in' : 'Deadhead';
  const fullLabel = activity.type === 'revenueTrip' && pattern ? routePrefix + pattern.name : label;
  const activityName = activity.type === 'revenueTrip' ? `Trip ${tripNumber}` : label;
  const startId = activity.type === 'revenueTrip' ? pattern?.points[0]?.nodeId : activity.fromNodeId;
  const endId = activity.type === 'revenueTrip' ? pattern?.points.at(-1)?.nodeId : activity.toNodeId;
  const status = connection?.status;
  const deadheadTiming = connection?.deadhead ? summary?.activityTimings.find((item) => item.activityId === connection.deadhead?.id) : undefined;
  const deadheadDuration = deadheadTiming?.endTime === undefined || deadheadTiming.startTime === undefined ? undefined : deadheadTiming.endTime - deadheadTiming.startTime;
  return <tr className={status && status !== 'valid' ? 'blocking-row-' + status : undefined}>
    <td className="blocking-selection-column">{activity.type === 'revenueTrip' && <input type="checkbox" aria-label={`Select trip ${tripNumber}`} checked={selected} onClick={(event) => onToggle(event.shiftKey)} />}</td><td className="blocking-index-column">{tripNumber ?? ''}</td><td className="blocking-pattern-column">{activity.type === 'revenueTrip' && pattern ? <span className={patternPillClass(pattern.id)} title={fullLabel}>{label}</span> : label}</td><td className="blocking-node-column"><NodeName node={nodes.get(startId ?? '')} /></td><td className="blocking-time-column">{time(timing?.startTime)}</td><td className="blocking-time-column">{time(timing?.endTime)}</td><td className="blocking-node-column"><NodeName node={nodes.get(endId ?? '')} /></td>
    <td className="blocking-deadhead-column">{activity.type === 'revenueTrip' && connection ? connection.deadhead ? <button className="deadhead-value" onClick={() => onDeadhead(connection, connection.deadhead)} aria-label={`Edit deadhead ${formatDuration(deadheadDuration)}`}>{formatDuration(deadheadDuration)}</button> : <button className="icon-button compact-icon-button" onClick={() => onDeadhead(connection)} aria-label="Add deadhead" title="Add deadhead"><PlusIcon /></button> : '—'}</td>
    <td className="blocking-layover-column">{connection?.usableLayoverSeconds === undefined ? MISSING : formatDuration(connection.usableLayoverSeconds)}{status && status !== 'valid' && <span className="visually-hidden"> {status === 'conflict' ? 'Connection conflict' : 'Connection requires review'}</span>}</td>
    <td className="row-actions blocking-actions-column">
      {activity.type === 'revenueTrip' ? <>
        <button className="icon-button compact-icon-button" aria-label={'Move trip ' + tripNumber + ' up'} onClick={() => onMove(-1)} disabled={!hasPreviousRevenue}>↑</button>
        <button className="icon-button compact-icon-button" aria-label={'Move trip ' + tripNumber + ' down'} onClick={() => onMove(1)} disabled={!connection}>↓</button>
      </> : <button onClick={onEdit}>Edit</button>}
      <button className="icon-button icon-button--danger" aria-label={`Remove ${activityName}`} title={`Remove ${activityName}`} onClick={() => onRemove(activityName)}><CircleXIcon /></button>
    </td>
  </tr>;
}
function Findings({ summary }: { summary?: BlockSummary }) {
  const issues = summary?.findings.filter((finding) => !isMileageFinding(finding)) ?? [];
  const mileageNotes = summary?.findings.filter(isMileageFinding) ?? [];
  return <>
    {issues.length ? <div className="blocking-findings" role="status"><strong>Issues</strong><ul>{issues.map((finding, index) => <li key={finding.ruleId + index}>{message(finding)}</li>)}</ul></div> : <InlineNote kind="ok" live>No current issues.</InlineNote>}
    {mileageNotes.length > 0 && <InlineNote kind="warn">{mileageNotes.map(message).join(' ')}</InlineNote>}
  </>;
}
/** The day summary: a seven-cell strip above the Blocks table. Values keep their unit (F3, F4); an Incomplete value takes the warning style. */
function SummaryPanel({ summary, serviceDayName, blockCount }: { summary: Awaited<ReturnType<BlockingQueries['getScenarioSummary']>>; serviceDayName: string; blockCount: number }) {
  return <SupportPanel title={`${serviceDayName} summary · ${plural(blockCount, 'block')}`} ariaLabel="Blocking summary">{summary ? <dl className="stat-strip"><div><dt>Revenue</dt><dd>{tileHours(summary.revenueHours)}</dd></div><div><dt>Running</dt><dd>{tileHours(summary.runningHours)}</dd></div><div><dt>Platform</dt><dd>{tileHours(summary.platformHours)}</dd></div><div><dt>Layover</dt><dd>{tileHours(summary.layoverHours)}</dd></div><div><dt>Deadhead</dt><dd>{tileHours(summary.deadheadHours)}</dd></div><div><dt>Revenue miles</dt><dd>{tileMiles(summary.revenueMiles)}</dd></div><div><dt>Platform miles</dt><dd>{tileMiles(summary.platformMiles)}</dd></div></dl> : <p className="profile-usage">Select a blocking scenario to view its summary.</p>}</SupportPanel>;
}
function NameDialog({ title, initialValue, submitLabel, busy, onSubmit, onClose }: { title: string; initialValue: string; submitLabel: string; busy: boolean; onSubmit: (value: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initialValue);
  return <ModalDialog as="form" label={title} className="confirm-dialog" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSubmit(value.trim()); }} onClose={onClose} busy={busy}><h2>{title}</h2><label className="dialog-field">Name<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} /></label><div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !value.trim()} type="submit">{busy ? 'Saving…' : submitLabel}</button></div></ModalDialog>;
}
function NotesDialog({ block, busy, onSubmit, onClose }: { block: BlockingBlock; busy: boolean; onSubmit: (value: string) => void; onClose: () => void }) { const [value, setValue] = useState(block.notes ?? ''); return <ModalDialog as="form" label="Edit block notes" className="confirm-dialog"onSubmit={(event) => { event.preventDefault(); onSubmit(value); }} onClose={onClose}><h2>Edit block notes</h2><label className="dialog-field">Notes<textarea autoFocus rows={4} value={value} onChange={(event) => setValue(event.target.value)} /></label><div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save notes'}</button></div></ModalDialog>; }
function MinimumLayoverDialog({ value, parse, onSubmit, onClose }: { value?: MinimumLayoverRule; parse: (mode: 'none' | MinimumLayoverRule['mode'], amount: string) => { rule?: MinimumLayoverRule; findings: ValidationFinding[] }; onSubmit: (value?: MinimumLayoverRule) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'none' | MinimumLayoverRule['mode']>(value?.mode ?? 'minutes');
  const [amount, setAmount] = useState(value ? String(value.value) : '10');
  const parsed = parse(mode, amount);
  const valid = parsed.findings.length === 0;
  return <ModalDialog as="form" label="Minimum layover" className="confirm-dialog activity-dialog" onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit(parsed.rule); }} onClose={onClose}><h2>Minimum layover</h2><p className="profile-usage">Evaluate the connection before each candidate trip using a fixed duration or a percentage of the preceding trip’s revenue runtime.</p><div className="activity-form"><label>Rule<select autoFocus value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="none">No minimum</option><option value="minutes">Minutes per trip</option><option value="percent">Percent of preceding trip</option></select></label><label>{mode === 'percent' ? 'Percentage' : 'Minutes'}<input type="number" min="0" max={mode === 'percent' ? '100' : undefined} step={mode === 'percent' ? '0.1' : '1'} value={amount} disabled={mode === 'none'} onChange={(event) => setAmount(event.target.value)} /></label></div>{!valid && <p className="field-error" role="alert">Enter a non-negative value{mode === 'percent' ? ' from 0 through 100' : ''}.</p>}<div className="dialog-actions activity-dialog-actions activity-dialog-actions--two"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={!valid}>Apply</button></div></ModalDialog>;
}
function Confirm({ title, text, label, busy, onConfirm, onClose }: { title: string; text: string; label: string; busy: boolean; onConfirm: () => void; onClose: () => void }) { return <ModalDialog role="alertdialog" label={title} className="confirm-dialog" onClose={onClose}><h2>{title}</h2><p>{text}</p><div className="dialog-actions"><button autoFocus disabled={busy} onClick={onClose}>Cancel</button><button className="danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : label}</button></div></ModalDialog>; }
function CircleXIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6m0-6-6 6" /></svg>; }
function PlusIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>; }
function ReassignDialog({ tripCount, sourceBlock, destinationBlocks, busy, onSubmit, onClose }: { tripCount: number; sourceBlock?: BlockingBlock; destinationBlocks: BlockingBlock[]; busy: boolean; onSubmit: (blockId: string) => void; onClose: () => void }) { const [blockId, setBlockId] = useState(destinationBlocks[0]?.id ?? ''); return <ModalDialog as="form" label="Move trips to block" className="confirm-dialog" onSubmit={(event) => { event.preventDefault(); if (blockId) onSubmit(blockId); }} onClose={onClose}><h2>Move trips to block</h2><p>Move {tripCount} selected trip{tripCount === 1 ? '' : 's'} from “{sourceBlock?.label ?? 'the current block'}” to the end of the destination block in one save.</p><label className="dialog-field">Destination block<select autoFocus value={blockId} onChange={(event) => setBlockId(event.target.value)}><option value="">Select block</option>{destinationBlocks.map((block) => <option key={block.id} value={block.id}>{block.label}</option>)}</select></label><div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={busy || !blockId}>{busy ? 'Moving…' : 'Move trips'}</button></div></ModalDialog>; }
function ActivityDialog({ draft, nodes, busy, boundaryPreview, onSubmit, onReviewBulk, onApplyBulk, onResetBulk, onRequestDelete, onClose }: { draft: ActivityDraft; nodes: Node[]; busy: boolean; boundaryPreview?: BulkBoundaryPreview; onSubmit: (value: ActivityValues) => void; onReviewBulk: (value: ActivityValues, replaceExisting: boolean) => void; onApplyBulk: () => void; onResetBulk: () => void; onRequestDelete: (value: ActivityValues) => void; onClose: () => void }) {
  const activity = draft.activity;
  const [minutes, setMinutes] = useState(draft.type === 'pullOut' && activity?.type === 'pullOut' ? String(activity.minutesBeforeFirstTrip ?? '') : draft.type === 'pullIn' && activity?.type === 'pullIn' ? String(activity.minutesAfterLastTrip ?? '') : draft.type === 'deadhead' && activity?.type === 'deadhead' ? String(activity.minutesAfterPreviousTrip ?? '') : '');
  const [fromNodeId, setFrom] = useState(activity?.fromNodeId ?? draft.defaultFromNodeId ?? '');
  const [toNodeId, setTo] = useState(activity?.toNodeId ?? draft.defaultToNodeId ?? '');
  const [miles, setMiles] = useState(activity?.miles === undefined ? '' : String(activity.miles));
  const [applyToSimilar, setApplyToSimilar] = useState(false);
  const [applyToMatching, setApplyToMatching] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const label = draft.type === 'pullOut' ? 'Pull-out' : draft.type === 'pullIn' ? 'Pull-in' : 'Deadhead';
  const offsetLabel = draft.type === 'pullOut' ? 'Minutes before first trip' : draft.type === 'pullIn' ? 'Minutes after last trip' : 'Deadhead duration (minutes)';
  const values = (): ActivityValues => ({ minutes, fromNodeId, toNodeId, miles, applyToSimilar });
  const canDelete = draft.type === 'deadhead' && activity?.type === 'deadhead';
  return <ModalDialog as="form" label={(activity ? 'Edit ' : 'Add ') + label} className="confirm-dialog activity-dialog" onSubmit={(event) => { event.preventDefault(); if (applyToMatching) { if (boundaryPreview) onApplyBulk(); else onReviewBulk(values(), replaceExisting); } else onSubmit(values()); }} onChangeCapture={onResetBulk} onClose={onClose}>
    <h2>{activity ? 'Edit ' : 'Add '}{label}</h2>
    {draft.type === 'deadhead' && <p className="profile-usage">{draft.connectionDescription ?? 'The deadhead begins when its preceding revenue trip ends. Remaining connection time is derived layover.'}</p>}
    <div className="activity-form">
      <label>{offsetLabel}<input autoFocus disabled={busy} inputMode="numeric" value={minutes} placeholder="0" onChange={(event) => setMinutes(event.target.value)} /></label>
      <label>Miles (optional)<input disabled={busy} inputMode="decimal" value={miles} onChange={(event) => setMiles(event.target.value)} /></label>
      <label>From<select disabled={busy} value={fromNodeId} onChange={(event) => setFrom(event.target.value)}><option value="">{draft.type === 'pullOut' ? 'Optional' : 'Select node'}</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
      <label>To<select disabled={busy} value={toNodeId} onChange={(event) => setTo(event.target.value)}><option value="">{draft.type === 'pullIn' ? 'Optional' : 'Select node'}</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
      {draft.type === 'deadhead' && <label className="activity-bulk-option"><input type="checkbox" checked={applyToSimilar} onChange={(event) => setApplyToSimilar(event.target.checked)} /> <span>Apply to all similar trips in this block</span></label>}
      {draft.type !== 'deadhead' && <label className="activity-bulk-option"><input type="checkbox" disabled={busy} checked={applyToMatching} onChange={(event) => setApplyToMatching(event.target.checked)} /> <span>Apply to matching blocks</span></label>}
      {applyToMatching && <label className="activity-bulk-option"><input type="checkbox" disabled={busy} checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} /> <span>Replace existing activities in other blocks</span></label>}
    </div>
    {applyToMatching && boundaryPreview && <p className="boundary-preview" role="status">{boundaryPreview.sourceBlockIncluded ? 'Selected block included · ' : ''}{boundaryPreview.matchingBlockCount} node matches · {boundaryPreview.addCount} add · {boundaryPreview.replaceCount} replace · {boundaryPreview.skippedExistingCount} keep existing{boundaryPreview.skippedWithoutTripCount ? ` · ${boundaryPreview.skippedWithoutTripCount} without trips skipped` : ''}</p>}
    <div className={'dialog-actions activity-dialog-actions' + (canDelete ? '' : ' activity-dialog-actions--two')}><button type="button" disabled={busy} onClick={onClose}>Cancel</button>{canDelete && <button type="button" className="subtle-danger" disabled={busy} onClick={() => onRequestDelete(values())}>Delete deadhead</button>}<button className="primary" disabled={busy} type="submit">{busy ? 'Working…' : applyToMatching ? boundaryPreview ? 'Apply to blocks' : 'Review blocks' : activity ? 'Save activity' : 'Add activity'}</button></div>
  </ModalDialog>;
}
