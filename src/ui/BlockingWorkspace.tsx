import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BlockingCommands, BlockingQueries } from '../application/ports';
import type { TripGenerationApplication } from '../application/tripGenerationService';
import { createBlockingScenarioSourceSignature, type BlockSummary, type BulkBoundaryPreview, type BulkBoundaryRequest, type CompatibilityStatus, type MinimumLayoverRule } from '../domain/blocking';
import { newId } from '../domain/ids';
import { formatServiceTime, parseServiceTime } from '../domain/time';
import { sortServiceDays } from '../domain/serviceDays';
import type { BlockActivity, BlockingBlock, BlockingScenario, Node, RouteDefinitionAggregate, RoutePattern, Trip, ValidationFinding } from '../domain/types';
import type { ScenarioRecords } from '../domain/project';
import { MenuButton, type MenuGroup } from './MenuButton';
import { createCsvArchive } from './csvDownload';

type BlockingApplication = BlockingCommands & BlockingQueries;
type Props = { blockingService: BlockingApplication; tripService: TripGenerationApplication; aggregate: RouteDefinitionAggregate; records: ScenarioRecords; onReload: () => Promise<void>; onError: (error: unknown, fallback?: string) => void };
type ActivityDraft = { block: BlockingBlock; activity?: Exclude<BlockActivity, { type: 'revenueTrip' }>; type: 'pullOut' | 'deadhead' | 'pullIn'; afterTripId?: string; connectionDescription?: string; defaultFromNodeId?: string; defaultToNodeId?: string };
type ActivityValues = { minutes: string; fromNodeId: string; toNodeId: string; miles: string; applyToSimilar: boolean };
type BoundaryReview = { request: BulkBoundaryRequest; preview: BulkBoundaryPreview };
type DeadheadDeleteRequest = { draft: ActivityDraft; fromNodeId: string; toNodeId: string; applyToSimilar: boolean };
type UnassignedSortColumn = 'pattern' | 'start' | 'fromTime' | 'toTime' | 'end';
type UnassignedSort = { column: UnassignedSortColumn; direction: 'ascending' | 'descending' };
type BlockSortColumn = 'block' | 'trips' | 'status' | 'running' | 'revenue' | 'platform' | 'layover' | 'layoverPercent' | 'deadhead';
type BlockSort = { column: BlockSortColumn; direction: 'ascending' | 'descending' };
type BlockTableRow = { block: BlockingBlock; value?: BlockSummary; trips: number; status: string; layoverPercent?: number };
type TimeRangeFilter = { from: string; to: string };
type UnassignedFilters = { patternIds: string[]; startNodeIds: string[]; endNodeIds: string[]; fromTime: TimeRangeFilter; toTime: TimeRangeFilter };

const emptyUnassignedFilters = (): UnassignedFilters => ({ patternIds: [], startNodeIds: [], endNodeIds: [], fromTime: { from: '', to: '' }, toTime: { from: '', to: '' } });

const preferenceKey = 'transit-costing-tool.blocking-selection.v1';
type BlockingSelectionPreference = { tripProfileId?: string; blockingScenarioId?: string; serviceDayId?: string; minimumLayover?: MinimumLayoverRule; blockSelections?: Record<string, string> };
function preference() { try { return JSON.parse(localStorage.getItem(preferenceKey) ?? '{}') as BlockingSelectionPreference; } catch { return {}; } }
function savePreference(value: object) { try { localStorage.setItem(preferenceKey, JSON.stringify(value)); } catch { /* UI preference only. */ } }
function blockSelectionKey(blockingScenarioId: string, serviceDayId: string) { return `${blockingScenarioId}:${serviceDayId}`; }
const blockingMessages: Record<string, string> = {
  'block.connectionOverlap': 'Trips overlap in time.',
  'block.connectionTimesMissing': 'Trip times are incomplete, so this connection cannot be evaluated.',
  'block.deadheadDoesNotFit': 'The deadhead is longer than the available connection time.',
  'block.deadheadMissing': 'Add a deadhead between Trips that end and begin at different nodes.',
  'block.deadheadNodeDiscontinuity': 'The deadhead nodes do not connect the surrounding Trips.',
  'block.deadheadPlacement': 'A deadhead must be placed between two revenue Trips.',
  'block.deadheadRequired': 'A deadhead is required between these Trips.',
  'block.pullInNodeRequired': 'Select a From node for the pull-in.',
  'block.pullOutNodeRequired': 'Select a To node for the pull-out.',
  'block.deadheadNodesRequired': 'Select both From and To nodes for the deadhead.',
  'block.invalidActivityTime': 'Enter a valid non-negative activity duration.',
  'block.invalidBoundaryTiming': 'Enter a valid non-negative pull-in or pull-out duration.',
  'block.invalidMiles': 'Miles must be a non-negative number.',
  'block.missingPattern': 'The Trip references a Pattern that no longer exists.',
  'block.missingTrip': 'The Block references a Trip that no longer exists.',
  'block.minimumLayoverShort': 'The connection is shorter than the configured minimum layover.',
  'block.multipleDeadheads': 'Only one deadhead is allowed between consecutive revenue Trips.',
  'block.multiplePullIn': 'A Block can have only one pull-in.',
  'block.multiplePullOut': 'A Block can have only one pull-out.',
  'block.platformBoundaryMissing': 'Add both a pull-out and pull-in to complete platform totals.',
  'block.platformBoundaryTimeInvalid': 'The pull-out or pull-in time cannot be calculated from its adjacent Trip.',
  'block.platformBoundaryTripMissing': 'A pull-out or pull-in requires an adjacent revenue Trip.',
  'block.platformMilesIncomplete': 'Enter all non-revenue miles to complete platform-mile totals.',
  'block.pullInMustBeLast': 'The pull-in must be the final Block activity.',
  'block.pullOutMustBeFirst': 'The pull-out must be the first Block activity.',
  'block.revenueMilesIncomplete': 'One or more Trip Patterns are missing complete revenue miles.',
  'block.duplicateTripAssignment': 'A Trip can be assigned only once in this Blocking Scenario and service day.',
  'block.tripContextMismatch': 'The Trip belongs to a different Scenario or service day.',
  'block.tripProfileMismatch': 'The Trip belongs to a different Trip Profile.',
};
function message(finding: ValidationFinding) { return blockingMessages[finding.messageKey] ?? finding.messageKey.replace(/^block\./, '').replaceAll(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase()); }
function blockStatusDetails(summary?: BlockSummary) {
  if (!summary) return 'Block status is still being calculated.';
  const details = [...new Set(summary.findings.map(message))];
  return details.length ? details.join(' ') : summary.status === 'complete' ? 'All required Block values are complete.' : 'Review this Block.';
}
function blockingError(error: unknown, fallback: string) { if (!(error instanceof Error)) return fallback; return error.message.split(', ').map((part) => blockingMessages[part] ?? part.replace(/^block\./, '').replaceAll(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())).join(' '); }
export function formatBlockingDuration(seconds?: number) { return seconds === undefined || !Number.isInteger(seconds) ? '—' : (seconds < 0 ? '−' : '') + formatServiceTime(Math.abs(seconds)); }
function time(value?: number) { return value === undefined ? '—' : formatBlockingDuration(value); }
function hours(value?: number) { return value === undefined ? 'Incomplete' : value.toFixed(2) + ' h'; }
function miles(value?: number) { return value === undefined ? 'Incomplete' : value.toFixed(2) + ' mi'; }
function percentage(value: number, total: number) { return total > 0 ? (value / total * 100).toFixed(1) + '%' : '—'; }
function downloadBlob(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
function fitLabel(status?: CompatibilityStatus) { return status === 'deadheadRequired' ? 'Deadhead' : status === 'insufficientLayover' ? 'Layover' : status === 'conflict' ? 'Conflict' : status === 'incomplete' ? 'Review' : status === 'compatible' ? 'Assign' : 'Select'; }
function fitAccessibleLabel(status?: CompatibilityStatus) { return status === 'deadheadRequired' ? 'Needs deadhead' : status === 'insufficientLayover' ? 'Short layover' : status === 'conflict' ? 'Conflict' : status === 'incomplete' ? 'Review' : status === 'compatible' ? 'Assign' : 'Select Block'; }
function fitHelp(status?: CompatibilityStatus) { return status === 'deadheadRequired' ? 'Assignment is allowed, but a deadhead is needed.' : status === 'insufficientLayover' ? 'The connection has less than the configured minimum layover.' : status === 'conflict' ? 'The proposed placement creates an overlapping or invalid connection.' : status === 'incomplete' ? 'Compatibility needs complete Trip timing.' : status === 'compatible' ? 'Compatible with the proposed time-based position.' : 'Select a Block to evaluate compatibility.'; }
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
  if (column === 'status') return row.status;
  if (column === 'running') return row.value?.runningHours;
  if (column === 'revenue') return row.value?.revenueHours;
  if (column === 'platform') return row.value?.platformHours;
  if (column === 'layover') return row.value?.layoverHours;
  if (column === 'layoverPercent') return row.layoverPercent;
  return row.value?.deadheadHours;
}

export function BlockingWorkspace({ blockingService, tripService, aggregate, records, onReload, onError }: Props) {
  const days = sortServiceDays(records.serviceDays); const profiles = records.tripProfiles ?? [];
  const [tripProfileId, setTripProfileId] = useState(''); const [blockingScenarioId, setBlockingScenarioId] = useState(''); const [serviceDayId, setServiceDayId] = useState('');
  const [scenarios, setScenarios] = useState<BlockingScenario[]>([]); const [allBlocks, setAllBlocks] = useState<BlockingBlock[]>([]); const [selectedBlockId, setSelectedBlockId] = useState(''); const [scenarioSelectionCleared, setScenarioSelectionCleared] = useState(false);
  const [summary, setSummary] = useState<Awaited<ReturnType<BlockingQueries['getScenarioSummary']>>>(); const [compatibility, setCompatibility] = useState(new Map<string, CompatibilityStatus>()); const [compatibilityPending, setCompatibilityPending] = useState(false); const [compatibleOnly, setCompatibleOnly] = useState(false); const [unassignedSort, setUnassignedSort] = useState<UnassignedSort>({ column: 'fromTime', direction: 'ascending' }); const [blockSort, setBlockSort] = useState<BlockSort>({ column: 'block', direction: 'ascending' }); const [unassignedFilters, setUnassignedFilters] = useState<UnassignedFilters>(emptyUnassignedFilters); const [minimumLayover, setMinimumLayover] = useState<MinimumLayoverRule | undefined>(() => preference().minimumLayover); const [layoverDialogOpen, setLayoverDialogOpen] = useState(false); const [trips, setTrips] = useState<Trip[]>([]);
  const [scenarioDialog, setScenarioDialog] = useState<{ mode: 'create' | 'duplicate' | 'rename'; value: string }>(); const [deleteScenario, setDeleteScenario] = useState<BlockingScenario>(); const [blockDialog, setBlockDialog] = useState<{ mode: 'create' | 'rename'; block?: BlockingBlock; value: string }>(); const [notesDialog, setNotesDialog] = useState<BlockingBlock>(); const [deleteBlock, setDeleteBlock] = useState<BlockingBlock>(); const [activityDraft, setActivityDraft] = useState<ActivityDraft>(); const [boundaryReview, setBoundaryReview] = useState<BoundaryReview>(); const [deleteDeadhead, setDeleteDeadhead] = useState<DeadheadDeleteRequest>(); const [reassignTrips, setReassignTrips] = useState<{ trips: Trip[]; sourceBlockId: string }>(); const [removeTripsPending, setRemoveTripsPending] = useState(false); const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]); const [selectedUnassignedTripIds, setSelectedUnassignedTripIds] = useState<string[]>([]); const blockSelectionAnchorId = useRef<string | undefined>(undefined); const unassignedSelectionAnchorId = useRef<string | undefined>(undefined); const compatibilityRequestRef = useRef(0); const [busy, setBusy] = useState(false);
  const profile = profiles.find((item) => item.id === tripProfileId); const blockingScenario = scenarios.find((item) => item.id === blockingScenarioId); const day = days.find((item) => item.id === serviceDayId); const dayBlocks = allBlocks.filter((item) => item.serviceDayId === serviceDayId); const selectedBlock = dayBlocks.find((item) => item.id === selectedBlockId);
  const patterns = new Map(aggregate.patterns.map((item) => [item.id, item])); const allPatterns = new Map(records.patterns.map((item) => [item.id, item])); const nodes = new Map(aggregate.nodes.map((item) => [item.id, item]));
  const assignedIds = useMemo(() => new Set(dayBlocks.flatMap((block) => block.activities.filter((activity) => activity.type === 'revenueTrip').map((activity) => activity.tripId))), [dayBlocks]);
  const unassigned = trips.filter((trip) => !assignedIds.has(trip.id) && trip.routeId === aggregate.route.id);
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
  async function loadScenarios() { try { setScenarios(await blockingService.listBlockingScenarios(records.scenario.id)); } catch (error) { onError(error, 'Unable to load Blocking Scenarios.'); } }
  useEffect(() => { void loadScenarios(); }, [records.scenario.id]);
  useEffect(() => { const prior = preference(); const candidates = scenarios.filter((item) => item.tripProfileId === tripProfileId); if (scenarioSelectionCleared) { setBlockingScenarioId(''); return; } setBlockingScenarioId((current) => current && candidates.some((item) => item.id === current) ? current : candidates.find((item) => item.id === prior.blockingScenarioId)?.id ?? candidates[0]?.id ?? ''); }, [scenarios, tripProfileId, scenarioSelectionCleared]);
  async function loadBlocks() { if (!blockingScenarioId) { setAllBlocks([]); setSummary(undefined); return; } try { const values = await Promise.all([blockingService.listBlockingBlocks(blockingScenarioId), blockingService.getScenarioSummary(blockingScenarioId, serviceDayId)]); setAllBlocks(values[0]); setSummary(values[1]); const savedBlockId = preference().blockSelections?.[blockSelectionKey(blockingScenarioId, serviceDayId)]; setSelectedBlockId((current) => current && values[0].some((block) => block.id === current && block.serviceDayId === serviceDayId) ? current : values[0].find((block) => block.id === savedBlockId && block.serviceDayId === serviceDayId)?.id ?? values[0].find((block) => block.serviceDayId === serviceDayId)?.id ?? ''); } catch (error) { onError(error, 'Unable to load Blocks.'); } }
  useEffect(() => { void loadBlocks(); }, [blockingScenarioId, serviceDayId]);
  useEffect(() => { let live = true; if (!serviceDayId || !tripProfileId) { setTrips([]); return; } void tripService.listScheduleTrips(serviceDayId, undefined, tripProfileId).then((value) => { if (live) setTrips(value); }).catch((error) => onError(error, 'Unable to load the selected service-day Trips.')); return () => { live = false; }; }, [tripService, serviceDayId, tripProfileId]);
  useEffect(() => { const prior = preference(); const blockSelections = { ...(prior.blockSelections ?? {}) }; if (blockingScenarioId && serviceDayId && selectedBlockId) blockSelections[blockSelectionKey(blockingScenarioId, serviceDayId)] = selectedBlockId; savePreference({ ...prior, tripProfileId, blockingScenarioId, serviceDayId, ...(minimumLayover ? { minimumLayover } : {}), blockSelections }); }, [tripProfileId, blockingScenarioId, serviceDayId, selectedBlockId, minimumLayover?.mode, minimumLayover?.value]);
  useEffect(() => { setUnassignedFilters(emptyUnassignedFilters()); }, [aggregate.route.id, serviceDayId, tripProfileId]);
  useEffect(() => { setSelectedTripIds([]); setSelectedUnassignedTripIds([]); blockSelectionAnchorId.current = undefined; unassignedSelectionAnchorId.current = undefined; }, [blockingScenarioId, serviceDayId, selectedBlockId]);
  useEffect(() => {
    const requestId = ++compatibilityRequestRef.current;
    if (!selectedBlock) { setCompatibility(new Map()); setCompatibilityPending(false); return; }
    let live = true;
    setCompatibility(new Map());
    setCompatibilityPending(true);
    void Promise.all(unassigned.map(async (trip) => [trip.id, (await blockingService.classifyInsertion(blockingScenarioId, selectedBlock.id, trip.id, undefined, minimumLayover)).status] as const))
      .then((items) => { if (live && requestId === compatibilityRequestRef.current) { setCompatibility(new Map(items)); setCompatibilityPending(false); } })
      .catch((error) => { if (live && requestId === compatibilityRequestRef.current) { setCompatibilityPending(false); onError(error, 'Unable to review insertion compatibility.'); } });
    return () => { live = false; };
  }, [blockingScenarioId, selectedBlock?.id, selectedBlockActivitySignature, unassigned.map((item) => item.id).join(','), minimumLayover?.mode, minimumLayover?.value]);

  async function refresh() { await Promise.all([loadScenarios(), loadBlocks(), onReload()]); }
  async function saveScenario(name: string) { if (!profile) return; setBusy(true); try { if (scenarioDialog?.mode === 'rename' && blockingScenario) await blockingService.renameBlockingScenario(blockingScenario.id, name, sourceSignature()); else if (scenarioDialog?.mode === 'duplicate' && blockingScenario) await blockingService.duplicateBlockingScenario(blockingScenario.id, name, sourceSignature()); else await blockingService.createBlockingScenario({ scenarioId: records.scenario.id, tripProfileId: profile.id, name }); setScenarioDialog(undefined); await refresh(); } catch (error) { onError(error, 'Unable to save the Blocking Scenario.'); } finally { setBusy(false); } }
  async function saveBlock(name: string) { if (!blockingScenario || !serviceDayId) return; setBusy(true); try { const saved = blockDialog?.mode === 'rename' && blockDialog.block ? await blockingService.updateBlock({ ...blockDialog.block, label: name }, sourceSignature()) : await blockingService.createBlock(blockingScenario.id, serviceDayId, name, sourceSignature()); setSelectedBlockId(saved.id); setBlockDialog(undefined); await loadBlocks(); } catch (error) { onError(error, 'Unable to save the Block.'); } finally { setBusy(false); } }
  async function assign(trip: Trip) { if (!selectedBlock || !blockingScenario || busy || compatibilityPending) return; compatibilityRequestRef.current += 1; setBusy(true); setCompatibilityPending(true); try { await blockingService.assignTrip({ blockingScenarioId: blockingScenario.id, serviceDayId, tripId: trip.id, destinationBlockId: selectedBlock.id, sourceSignature: sourceSignature() }); setSelectedUnassignedTripIds((ids) => ids.filter((id) => id !== trip.id)); await loadBlocks(); } catch (error) { setCompatibilityPending(false); onError(error, 'Unable to assign the Trip.'); } finally { setBusy(false); } }
  async function removeActivity(activity: BlockActivity) { if (!selectedBlock || !blockingScenario) return; setBusy(true); try { if (activity.type === 'revenueTrip') await blockingService.removeTrip(blockingScenario.id, serviceDayId, activity.tripId, sourceSignature()); else await blockingService.updateBlock({ ...selectedBlock, activities: selectedBlock.activities.filter((item) => item.id !== activity.id) }, sourceSignature()); await loadBlocks(); } catch (error) { onError(error, 'Unable to remove the activity.'); } finally { setBusy(false); } }
  async function removeSelectedTrips() { if (!selectedBlock || !blockingScenario || !selectedTripIds.length) return; setBusy(true); try { await blockingService.removeTrips(blockingScenario.id, serviceDayId, selectedTripIds, sourceSignature()); setSelectedTripIds([]); setRemoveTripsPending(false); await loadBlocks(); } catch (error) { onError(error, 'Unable to remove the selected Trips.'); } finally { setBusy(false); } }
  async function saveNotes(notes: string) { if (!notesDialog) return; setBusy(true); try { await blockingService.updateBlock({ ...notesDialog, notes: notes.trim() || undefined }, sourceSignature()); setNotesDialog(undefined); await loadBlocks(); } catch (error) { onError(error, 'Unable to save Block notes.'); } finally { setBusy(false); } }
  async function removeDeadhead(request: DeadheadDeleteRequest) { if (!blockingScenario || request.draft.type !== 'deadhead' || !request.draft.activity || request.draft.activity.type !== 'deadhead') return; setBusy(true); try { const removeIds = request.applyToSimilar ? new Set(request.draft.block.activities.filter((activity): activity is Extract<BlockActivity, { type: 'deadhead' }> => activity.type === 'deadhead' && activity.fromNodeId === request.fromNodeId && activity.toNodeId === request.toNodeId).map((activity) => activity.id)) : new Set([request.draft.activity.id]); await blockingService.updateBlock({ ...request.draft.block, activities: request.draft.block.activities.filter((activity) => !removeIds.has(activity.id)) }, sourceSignature()); setDeleteDeadhead(undefined); await loadBlocks(); } catch (error) { onError(error, 'Unable to delete the deadhead.'); } finally { setBusy(false); } }
  async function reorderTripGroup(activityId: string, movement: -1 | 1) { if (!selectedBlock || !blockingScenario) return; const activities = selectedBlock.activities; const revenueStarts = activities.map((activity, index) => activity.type === 'revenueTrip' ? index : -1).filter((index) => index >= 0); const groupIndex = revenueStarts.findIndex((index) => activities[index]?.id === activityId); const targetGroupIndex = groupIndex + movement; if (groupIndex < 0 || targetGroupIndex < 0 || targetGroupIndex >= revenueStarts.length) return; const prefix = activities.slice(0, revenueStarts[0]); const pullInIndex = activities.findIndex((activity) => activity.type === 'pullIn'); const centralEnd = pullInIndex >= 0 ? pullInIndex : activities.length; const suffix = activities.slice(centralEnd); const groups = revenueStarts.map((start, index) => activities.slice(start, index + 1 < revenueStarts.length ? revenueStarts[index + 1] : centralEnd)); [groups[groupIndex], groups[targetGroupIndex]] = [groups[targetGroupIndex], groups[groupIndex]]; const ids = [...prefix, ...groups.flat(), ...suffix].map((activity) => activity.id); setBusy(true); try { await blockingService.reorderActivities(blockingScenario.id, selectedBlock.id, ids, sourceSignature()); await loadBlocks(); } catch (error) { onError(error, 'That Trip order is not allowed.'); } finally { setBusy(false); } }
  async function saveActivity(values: ActivityValues) { if (!activityDraft || !blockingScenario) return; try { const offset = Number(values.minutes); const milesValue = values.miles.trim() ? Number(values.miles) : undefined; if (!Number.isInteger(offset) || offset < 0) throw new Error('Invalid offset'); const base = { id: activityDraft.activity?.id ?? newId(), sequence: activityDraft.activity?.sequence ?? activityDraft.block.activities.length }; const activity: BlockActivity = activityDraft.type === 'pullOut' ? { ...base, type: 'pullOut', minutesBeforeFirstTrip: offset, ...(values.fromNodeId ? { fromNodeId: values.fromNodeId } : {}), toNodeId: values.toNodeId, ...(milesValue === undefined ? {} : { miles: milesValue }) } : activityDraft.type === 'pullIn' ? { ...base, type: 'pullIn', minutesAfterLastTrip: offset, fromNodeId: values.fromNodeId, ...(values.toNodeId ? { toNodeId: values.toNodeId } : {}), ...(milesValue === undefined ? {} : { miles: milesValue }) } : { ...base, type: 'deadhead', minutesAfterPreviousTrip: offset, fromNodeId: values.fromNodeId, toNodeId: values.toNodeId, ...(milesValue === undefined ? {} : { miles: milesValue }) }; setBusy(true); if (activity.type === 'deadhead' && values.applyToSimilar) { const activities = [...activityDraft.block.activities]; const revenueIndices = activities.map((item, index) => item.type === 'revenueTrip' ? index : -1).filter((index) => index >= 0); let applied = 0; for (let revenueIndex = 0; revenueIndex < revenueIndices.length - 1; revenueIndex += 1) { const previousIndex = revenueIndices[revenueIndex]; const nextIndex = revenueIndices[revenueIndex + 1]; const previous = activities[previousIndex] as Extract<BlockActivity, { type: 'revenueTrip' }>; const next = activities[nextIndex] as Extract<BlockActivity, { type: 'revenueTrip' }>; const previousPattern = patterns.get(trips.find((trip) => trip.id === previous.tripId)?.patternId ?? ''); const nextPattern = patterns.get(trips.find((trip) => trip.id === next.tripId)?.patternId ?? ''); if (previousPattern?.points.at(-1)?.nodeId !== values.fromNodeId || nextPattern?.points[0]?.nodeId !== values.toNodeId) continue; const existingIndex = activities.slice(previousIndex + 1, nextIndex).findIndex((item) => item.type === 'deadhead'); if (existingIndex >= 0) { const index = previousIndex + 1 + existingIndex; activities[index] = { ...activity, id: activities[index].id, sequence: activities[index].sequence }; } else { activities.splice(previousIndex + 1, 0, { ...activity, id: newId(), sequence: previousIndex + 1 }); }
        applied += 1;
      }
      if (!applied) throw new Error('No consecutive Trips use the selected From and To Nodes.');
      await blockingService.updateBlock({ ...activityDraft.block, activities }, sourceSignature());
    } else if (activityDraft.activity) await blockingService.editActivity({ blockingScenarioId: blockingScenario.id, blockId: activityDraft.block.id, activity, sourceSignature: sourceSignature() }); else { const index = activity.type === 'pullOut' ? 0 : activity.type === 'pullIn' ? activityDraft.block.activities.length : activityDraft.block.activities.findIndex((item) => item.type === 'revenueTrip' && item.tripId === activityDraft.afterTripId) + 1; if (index <= 0 && activity.type === 'deadhead') throw new Error('Select a preceding Trip for the deadhead.'); const activities = [...activityDraft.block.activities]; activities.splice(index, 0, { ...activity, sequence: index }); await blockingService.updateBlock({ ...activityDraft.block, activities }, sourceSignature()); } setActivityDraft(undefined); await loadBlocks(); } catch (error) { onError(new Error(blockingError(error, 'Enter a whole-minute duration, locations, and optional non-negative miles.'))); } finally { setBusy(false); } }
  async function reviewBulkBoundary(values: ActivityValues, replaceExisting: boolean) {
    if (!activityDraft || !blockingScenario || activityDraft.type === 'deadhead') return;
    const minutes = Number(values.minutes); const miles = values.miles.trim() ? Number(values.miles) : undefined;
    if (!values.minutes.trim() || !Number.isInteger(minutes) || minutes < 0) { onError(new Error('Enter a non-negative whole-minute duration.')); return; }
    if (miles !== undefined && (!Number.isFinite(miles) || miles < 0)) { onError(new Error('Enter non-negative miles.')); return; }
    if (activityDraft.type === 'pullOut' && !values.toNodeId || activityDraft.type === 'pullIn' && !values.fromNodeId) { onError(new Error('Select the matching Node.')); return; }
    const base = { id: activityDraft.activity?.id ?? newId(), sequence: activityDraft.activity?.sequence ?? 0 };
    const activity = activityDraft.type === 'pullOut'
      ? { ...base, type: 'pullOut' as const, minutesBeforeFirstTrip: minutes, ...(values.fromNodeId ? { fromNodeId: values.fromNodeId } : {}), toNodeId: values.toNodeId, ...(miles === undefined ? {} : { miles }) }
      : { ...base, type: 'pullIn' as const, minutesAfterLastTrip: minutes, fromNodeId: values.fromNodeId, ...(values.toNodeId ? { toNodeId: values.toNodeId } : {}), ...(miles === undefined ? {} : { miles }) };
    const request: BulkBoundaryRequest = { blockingScenarioId: blockingScenario.id, serviceDayId, sourceBlockId: activityDraft.block.id, activity, replaceExisting, sourceSignature: sourceSignature() };
    setBusy(true);
    try { setBoundaryReview({ request, preview: await blockingService.previewBulkBoundaryActivities(request) }); }
    catch (error) { onError(new Error(blockingError(error, 'Unable to review matching Blocks.'))); }
    finally { setBusy(false); }
  }
  async function applyBulkBoundary() {
    if (!boundaryReview) return;
    setBusy(true);
    try { await blockingService.applyBulkBoundaryActivities({ ...boundaryReview.request, expectedEndpointSignature: boundaryReview.preview.endpointSignature }); setBoundaryReview(undefined); setActivityDraft(undefined); await loadBlocks(); }
    catch (error) { setBoundaryReview(undefined); onError(new Error(blockingError(error, 'Unable to update matching Blocks.'))); }
    finally { setBusy(false); }
  }
  async function exportCsv() { if (!blockingScenario) return; setBusy(true); try { const base = blockingScenario.name.replaceAll(/[^a-z0-9]+/gi, '-').replaceAll(/^-|-$/g, '') || 'blocking-scenario'; const files = await blockingService.exportBlockingScenarioCsv(blockingScenario.id); downloadBlob(base + '-csv.zip', createCsvArchive(files.map((file) => ({ filename: base + '-' + file.suffix + '.csv', contents: file.contents })))); } catch (error) { onError(error, 'Unable to export Blocking Scenario CSV files.'); } finally { setBusy(false); } }

  if (!profile) return <section className="empty-state"><h2>No Trip Profile available</h2><p>Create a Trip Profile on Trips before creating a Blocking Scenario.</p></section>;
  const scenarioOptions = scenarios.filter((item) => item.tripProfileId === tripProfileId);
  const blockingScenarioMenu: MenuGroup[] = [
    { label: 'Blocking Scenarios', items: [
      ...(!scenarioOptions.length || !blockingScenarioId ? [{ id: 'none', label: 'No Blocking Scenario', checked: true, disabled: busy, onSelect: () => { setScenarioSelectionCleared(true); setBlockingScenarioId(''); } }] : []),
      ...scenarioOptions.map((scenario) => ({ id: scenario.id, label: scenario.name, checked: scenario.id === blockingScenarioId, disabled: busy, onSelect: () => { setScenarioSelectionCleared(false); setBlockingScenarioId(scenario.id); } })),
    ] },
    { items: [
      { id: 'new', label: 'New Blocking Scenario…', restoreFocus: false, disabled: busy, onSelect: () => { setScenarioSelectionCleared(false); setScenarioDialog({ mode: 'create', value: '' }); } },
      { id: 'duplicate', label: 'Duplicate Blocking Scenario…', restoreFocus: false, disabled: !blockingScenario || busy, onSelect: () => blockingScenario && setScenarioDialog({ mode: 'duplicate', value: blockingScenario.name + ' Copy' }) },
      { id: 'rename', label: 'Rename Blocking Scenario…', restoreFocus: false, disabled: !blockingScenario || busy, onSelect: () => blockingScenario && setScenarioDialog({ mode: 'rename', value: blockingScenario.name }) },
      { id: 'delete', label: 'Delete Blocking Scenario…', destructive: true, restoreFocus: false, disabled: !blockingScenario || busy, onSelect: () => blockingScenario && setDeleteScenario(blockingScenario) },
    ] },
  ];
  const currentBlockMenu: MenuGroup[] = [
    { label: 'Blocks', items: [...dayBlocks].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' })).map((block) => ({ id: block.id, label: block.label, checked: block.id === selectedBlockId, disabled: busy, onSelect: () => setSelectedBlockId(block.id) })) },
  ];
  const layoverLabel = minimumLayover ? `Minimum layover: ${minimumLayover.value}${minimumLayover.mode === 'minutes' ? ' min' : '%'}` : 'Minimum layover…';
  const unassignedActionsMenu: MenuGroup[] = [
    { label: 'Compatibility', items: [{ id: 'minimum-layover', label: layoverLabel, restoreFocus: false, onSelect: () => setLayoverDialogOpen(true) }, { id: 'compatible-only', label: 'Compatible only', checked: compatibleOnly, disabled: !selectedBlock, onSelect: () => setCompatibleOnly((current) => !current) }] },
    { label: 'Table', items: [{ id: 'clear-filters', label: 'Clear filters', disabled: !unassignedFiltersActive, onSelect: () => setUnassignedFilters(emptyUnassignedFilters()) }] },
  ];
  const currentBlockActionsMenu: MenuGroup[] = [
    { label: 'Block', items: [
      { id: 'new', label: 'New Block…', restoreFocus: false, disabled: busy, onSelect: () => setBlockDialog({ mode: 'create', value: 'Block ' + (dayBlocks.length + 1) }) },
      { id: 'rename', label: 'Rename Block…', restoreFocus: false, disabled: !selectedBlock || busy, onSelect: () => selectedBlock && setBlockDialog({ mode: 'rename', block: selectedBlock, value: selectedBlock.label }) },
      { id: 'notes', label: 'Edit notes…', restoreFocus: false, disabled: !selectedBlock || busy, onSelect: () => selectedBlock && setNotesDialog(selectedBlock) },
      { id: 'delete', label: 'Delete Block…', destructive: true, restoreFocus: false, disabled: !selectedBlock || busy, onSelect: () => selectedBlock && setDeleteBlock(selectedBlock) },
    ] },
    { label: 'Activities', items: [
      { id: 'add-pull-out', label: 'Add pull-out…', restoreFocus: false, disabled: !selectedBlock || busy || selectedBlock.activities.some((activity) => activity.type === 'pullOut'), onSelect: () => selectedBlock && setActivityDraft({ block: selectedBlock, type: 'pullOut', defaultToNodeId: boundaryNode(selectedBlock, 'pullOut', trips, allPatterns) }) },
      { id: 'add-pull-in', label: 'Add pull-in…', restoreFocus: false, disabled: !selectedBlock || busy || selectedBlock.activities.some((activity) => activity.type === 'pullIn'), onSelect: () => selectedBlock && setActivityDraft({ block: selectedBlock, type: 'pullIn', defaultFromNodeId: boundaryNode(selectedBlock, 'pullIn', trips, allPatterns) }) },
    ] },
    { label: 'Selected Trips', items: [
      { id: 'reassign-trips', label: 'Reassign Trips…', restoreFocus: false, disabled: !selectedBlock || !selectedTripIds.length || dayBlocks.length < 2 || busy, onSelect: () => { if (!selectedBlock) return; const selected = selectedBlock.activities.flatMap((activity) => activity.type === 'revenueTrip' && selectedTripIds.includes(activity.tripId) ? [trips.find((trip) => trip.id === activity.tripId)] : []).filter((trip): trip is Trip => Boolean(trip)); setReassignTrips({ trips: selected, sourceBlockId: selectedBlock.id }); } },
      { id: 'remove-trips', label: 'Remove Trips…', destructive: true, restoreFocus: false, disabled: !selectedBlock || !selectedTripIds.length || busy, onSelect: () => setRemoveTripsPending(true) },
    ] },
  ];
  const selectedSummary = summary?.blockSummaries.find((item) => item.blockId === selectedBlock?.id);
  const blockRows: BlockTableRow[] = dayBlocks.map((block) => {
    const value = summary?.blockSummaries.find((item) => item.blockId === block.id);
    return { block, value, trips: block.activities.filter((activity) => activity.type === 'revenueTrip').length, status: value?.status ?? 'incomplete', layoverPercent: value && value.revenueHours > 0 ? value.layoverHours / value.revenueHours * 100 : undefined };
  }).sort((left, right) => {
    const leftValue = blockSortValue(left, blockSort.column); const rightValue = blockSortValue(right, blockSort.column);
    if (leftValue === undefined || rightValue === undefined) return leftValue === rightValue ? left.block.label.localeCompare(right.block.label, undefined, { numeric: true, sensitivity: 'base' }) : leftValue === undefined ? 1 : -1;
    let comparison = typeof leftValue === 'string' && typeof rightValue === 'string' ? leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' }) : Number(leftValue) - Number(rightValue);
    if (!comparison) comparison = left.block.label.localeCompare(right.block.label, undefined, { numeric: true, sensitivity: 'base' });
    return blockSort.direction === 'ascending' ? comparison : -comparison;
  });
  return <div className="blocking-workspace" aria-label="Blocking workspace">
    <section className="workflow-section blocking-context"><div className="section-title"><div><h1>Blocking</h1></div><div className="section-actions section-header-actions"><label className="header-field">Trip Profile<select value={tripProfileId} onChange={(event) => { setScenarioSelectionCleared(false); setTripProfileId(event.target.value); }}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><MenuButton fieldLabel="Scenario" label={blockingScenario?.name ?? 'No Blocking Scenario'} menuLabel="Blocking Scenario" groups={blockingScenarioMenu} disabled={busy} /><label className="header-field">Day<select value={serviceDayId} onChange={(event) => setServiceDayId(event.target.value)}>{days.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span className="action-separator" aria-hidden="true" /><button title="Downloads one ZIP containing the Blocking CSV files." disabled={!blockingScenario || busy} onClick={() => void exportCsv()}>Export CSV (ZIP)</button></div></div></section>
    {!blockingScenario ? <section className="prerequisite"><h2>Create or select a Blocking Scenario</h2><p>A Blocking Scenario is a named vehicle-blocking alternative for the selected Trip Profile. It spans all service days.</p></section> : <><div className="blocking-editor-grid">
      <section className="workflow-section" aria-label="Unassigned Trips"><div className="section-title"><div><h2>Unassigned Trips</h2><span>{aggregate.route.name || 'Selected route'} · {day?.name}</span></div><div className="section-actions section-header-actions"><MenuButton label="Actions" menuLabel="Unassigned Trip actions" groups={unassignedActionsMenu} disabled={busy || compatibilityPending} /></div></div>{compatibilityPending && <p className="blocking-compatibility-status" role="status" aria-live="polite">Reviewing Trip compatibility…</p>}<div className="table-scroll data-grid blocking-trips-table"><table><colgroup><col className="blocking-selection-column" /><col className="blocking-pattern-column" /><col className="blocking-node-column" /><col className="blocking-time-column" /><col className="blocking-time-column" /><col className="blocking-node-column" /><col className="blocking-assign-column" /></colgroup><thead><tr><th className="blocking-selection-column"><input type="checkbox" aria-label="Select all unassigned Trips" checked={visibleUnassigned.length > 0 && visibleUnassigned.every((trip) => selectedUnassignedTripIds.includes(trip.id))} disabled={!visibleUnassigned.length || busy} onChange={(event) => { unassignedSelectionAnchorId.current = undefined; setSelectedUnassignedTripIds(event.target.checked ? visibleUnassigned.map((trip) => trip.id) : []); }} /></th><SortableFilterHeader label="Pattern" active={unassignedSort.column === 'pattern'} direction={unassignedSort.direction} filterActive={unassignedFilters.patternIds.length > 0} onSort={() => sortUnassigned('pattern')}><FilterOptionList options={unassignedPatternOptions} selected={unassignedFilters.patternIds} onToggle={(id) => toggleUnassignedFilterValue('patternIds', id)} /></SortableFilterHeader><SortableFilterHeader label="Start" active={unassignedSort.column === 'start'} direction={unassignedSort.direction} filterActive={unassignedFilters.startNodeIds.length > 0} onSort={() => sortUnassigned('start')}><FilterOptionList options={unassignedStartNodeOptions} selected={unassignedFilters.startNodeIds} onToggle={(id) => toggleUnassignedFilterValue('startNodeIds', id)} /></SortableFilterHeader><SortableFilterHeader label="From Time" active={unassignedSort.column === 'fromTime'} direction={unassignedSort.direction} filterActive={Boolean(unassignedFilters.fromTime.from.trim() || unassignedFilters.fromTime.to.trim())} onSort={() => sortUnassigned('fromTime')}><TimeRangeFilter value={unassignedFilters.fromTime} onChange={(boundary, value) => updateUnassignedTimeFilter('fromTime', boundary, value)} /></SortableFilterHeader><SortableFilterHeader label="To Time" active={unassignedSort.column === 'toTime'} direction={unassignedSort.direction} filterActive={Boolean(unassignedFilters.toTime.from.trim() || unassignedFilters.toTime.to.trim())} onSort={() => sortUnassigned('toTime')}><TimeRangeFilter value={unassignedFilters.toTime} onChange={(boundary, value) => updateUnassignedTimeFilter('toTime', boundary, value)} /></SortableFilterHeader><SortableFilterHeader label="End" active={unassignedSort.column === 'end'} direction={unassignedSort.direction} filterActive={unassignedFilters.endNodeIds.length > 0} onSort={() => sortUnassigned('end')}><FilterOptionList options={unassignedEndNodeOptions} selected={unassignedFilters.endNodeIds} onToggle={(id) => toggleUnassignedFilterValue('endNodeIds', id)} /></SortableFilterHeader><th className="blocking-assign-column">Assign</th></tr></thead><tbody>{visibleUnassigned.map((trip, index) => <UnassignedRow key={trip.id} trip={trip} pattern={patterns.get(trip.patternId)} nodes={nodes} status={compatibility.get(trip.id)} selected={selectedUnassignedTripIds.includes(trip.id)} disabled={!selectedBlock || compatibilityPending} busy={busy} onToggle={(shiftKey) => toggleUnassignedTrip(trip.id, index, shiftKey)} onAssign={() => void assign(trip)} />)}{!visibleUnassigned.length && <tr><td colSpan={7} className="table-empty">{compatibleOnly ? 'No compatible unassigned Trips at the proposed time-based position.' : unassignedFiltersActive ? 'No unassigned Trips match the current filters.' : 'No unassigned Trips on the selected Route and service day.'}</td></tr>}</tbody></table></div></section>
      <section className="workflow-section" aria-label="Current Block"><div className="section-title current-block-heading"><div><h2>Current Block</h2></div><div className="section-actions section-header-actions"><MenuButton fieldLabel="Block" label={selectedBlock?.label ?? 'Select Block'} menuLabel="Current Block" groups={currentBlockMenu} disabled={busy} selectionStyle="highlight" /><MenuButton label="Actions" menuLabel="Current Block actions" groups={currentBlockActionsMenu} disabled={busy} /></div></div>{selectedBlock ? <><div className="table-scroll data-grid block-activities-table"><table><thead><tr><th className="blocking-selection-column"><input type="checkbox" aria-label="Select all Trips in current Block" checked={selectedRevenueTripIds.length > 0 && selectedTripIds.length === selectedRevenueTripIds.length} disabled={!selectedRevenueTripIds.length || busy} onChange={(event) => { blockSelectionAnchorId.current = undefined; setSelectedTripIds(event.target.checked ? selectedRevenueTripIds : []); }} /></th><th className="blocking-index-column">#</th><th className="blocking-pattern-column">Pattern</th><th className="blocking-node-column">Start</th><th className="blocking-time-column">From Time</th><th className="blocking-time-column">To Time</th><th className="blocking-node-column">End</th><th className="blocking-deadhead-column">Deadhead</th><th className="blocking-layover-column">Layover</th><th className="blocking-actions-column">Actions</th></tr></thead><tbody>{visibleBlockActivities.map((activity, index) => <ActivityRow key={activity.id} activity={activity} index={index} tripNumber={activity.type === 'revenueTrip' ? selectedBlock.activities.filter((candidate) => candidate.type === 'revenueTrip' && candidate.sequence <= activity.sequence).length : undefined} trips={trips} patterns={patterns} nodes={nodes} summary={selectedSummary} selected={activity.type === 'revenueTrip' && selectedTripIds.includes(activity.tripId)} onToggle={(shiftKey) => activity.type === 'revenueTrip' && toggleBlockTrip(activity.tripId, selectedRevenueTripIds.indexOf(activity.tripId), shiftKey)} onRemove={() => void removeActivity(activity)} onEdit={() => activity.type !== 'revenueTrip' && setActivityDraft({ block: selectedBlock, activity, type: activity.type })} onMove={(movement) => void reorderTripGroup(activity.id, movement)} onDeadhead={(connection, existing) => { const predecessor = trips.find((trip) => trip.id === connection.previousTripId); const successor = trips.find((trip) => trip.id === connection.nextTripId); const predecessorPattern = predecessor ? patterns.get(predecessor.patternId) : undefined; const successorPattern = successor ? patterns.get(successor.patternId) : undefined; setActivityDraft({ block: selectedBlock, activity: existing, type: 'deadhead', afterTripId: connection.previousTripId, connectionDescription: `Between ${predecessorPattern?.name ?? 'the preceding Trip'} ending ${time(predecessor?.stopTimes.at(-1)?.time)} and ${successorPattern?.name ?? 'the next Trip'} beginning ${time(successor?.stopTimes[0]?.time)}.`, defaultFromNodeId: predecessorPattern?.points.at(-1)?.nodeId, defaultToNodeId: successorPattern?.points[0]?.nodeId }); }} />)}{!visibleBlockActivities.length && <tr><td colSpan={10} className="table-empty">This empty Block is valid. Assign a Trip or add a boundary activity.</td></tr>}</tbody></table></div><Findings summary={selectedSummary} /></> : <p className="profile-usage">Choose an existing Block or create one from the Current Block actions.</p>}</section>
    </div><div className="blocking-lower-grid"><section className="workflow-section" aria-label="Blocks"><div className="section-title"><div><h2>Blocks</h2><span>{day?.name}</span></div></div><div className="table-scroll data-grid blocking-blocks-table"><table><thead><tr><BlockSortHeader label="Block" column="block" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Trips" column="trips" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Status" column="status" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Running" column="running" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Revenue" column="revenue" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Platform" column="platform" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Layover" column="layover" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Layover %" column="layoverPercent" sort={blockSort} onSort={sortBlocks} /><BlockSortHeader label="Deadhead" column="deadhead" sort={blockSort} onSort={sortBlocks} /></tr></thead><tbody>{blockRows.map(({ block, value, trips: tripCount }) => <tr key={block.id} className={block.id === selectedBlockId ? 'selected-block-row' : undefined}><td><button className="link-button" onClick={() => setSelectedBlockId(block.id)}>{block.label}</button></td><td>{tripCount}</td><td><span className={'blocking-status ' + (value?.status ?? 'incomplete')} title={blockStatusDetails(value)} aria-label={`${value?.status ?? 'Incomplete'}: ${blockStatusDetails(value)}`} tabIndex={0}>{value?.status ?? 'Incomplete'}</span></td><td>{hours(value?.runningHours)}</td><td>{hours(value?.revenueHours)}</td><td>{hours(value?.platformHours)}</td><td>{hours(value?.layoverHours)}</td><td>{value ? percentage(value.layoverHours, value.revenueHours) : '—'}</td><td>{hours(value?.deadheadHours)}</td></tr>)}{!blockRows.length && <tr><td colSpan={9} className="table-empty">No Blocks for this service day. Create an empty Block to start.</td></tr>}</tbody><tfoot><tr><th scope="row" colSpan={3}>Total</th><td>{hours(summary?.runningHours)}</td><td>{hours(summary?.revenueHours)}</td><td>{hours(summary?.platformHours)}</td><td>{hours(summary?.layoverHours)}</td><td>{summary ? percentage(summary.layoverHours, summary.revenueHours) : '—'}</td><td>{hours(summary?.deadheadHours)}</td></tr></tfoot></table></div></section><SummaryPanel summary={summary} /></div></>}
    {scenarioDialog && <NameDialog title={scenarioDialog.mode === 'create' ? 'New Blocking Scenario' : scenarioDialog.mode === 'duplicate' ? 'Duplicate Blocking Scenario' : 'Rename Blocking Scenario'} initialValue={scenarioDialog.value} submitLabel={scenarioDialog.mode === 'duplicate' ? 'Duplicate' : scenarioDialog.mode === 'rename' ? 'Rename' : 'Create'} busy={busy} onSubmit={saveScenario} onClose={() => setScenarioDialog(undefined)} />}
    {blockDialog && <NameDialog title={blockDialog.mode === 'create' ? 'New Block' : 'Rename Block'} initialValue={blockDialog.value} submitLabel={blockDialog.mode === 'create' ? 'Create Block' : 'Rename'} busy={busy} onSubmit={saveBlock} onClose={() => setBlockDialog(undefined)} />}
    {notesDialog && <NotesDialog block={notesDialog} busy={busy} onSubmit={saveNotes} onClose={() => setNotesDialog(undefined)} />}
    {layoverDialogOpen && <MinimumLayoverDialog value={minimumLayover} onSubmit={(value) => { setMinimumLayover(value); setLayoverDialogOpen(false); }} onClose={() => setLayoverDialogOpen(false)} />}
    {deleteScenario && <Confirm title="Delete Blocking Scenario?" text={'Delete “' + deleteScenario.name + '” and all of its Blocks across every service day? This cannot be undone.'} label="Delete Blocking Scenario" busy={busy} onConfirm={() => { setBusy(true); void blockingService.deleteBlockingScenario(deleteScenario.id, createBlockingScenarioSourceSignature(deleteScenario, allBlocks)).then(async () => { setScenarioSelectionCleared(true); setBlockingScenarioId(''); setDeleteScenario(undefined); await refresh(); }).catch((error) => onError(error, 'Unable to delete the Blocking Scenario.')).finally(() => setBusy(false)); }} onClose={() => setDeleteScenario(undefined)} />}
    {deleteBlock && <Confirm title="Delete Block?" text={'Delete Block “' + deleteBlock.label + '” and its activities? Its Trips will become unassigned in this Blocking Scenario.'} label="Delete Block" busy={busy} onConfirm={() => { if (!blockingScenario) return; setBusy(true); void blockingService.deleteBlock(blockingScenario.id, deleteBlock.id, sourceSignature()).then(async () => { setDeleteBlock(undefined); await loadBlocks(); }).catch((error) => onError(error, 'Unable to delete the Block.')).finally(() => setBusy(false)); }} onClose={() => setDeleteBlock(undefined)} />}
    {activityDraft && <ActivityDialog draft={activityDraft} nodes={activityDraft.type === 'deadhead' ? [...nodes.values()] : records.nodes} busy={busy} boundaryPreview={boundaryReview?.preview} onSubmit={saveActivity} onReviewBulk={reviewBulkBoundary} onApplyBulk={() => void applyBulkBoundary()} onResetBulk={() => setBoundaryReview(undefined)} onRequestDelete={(values) => { if (!activityDraft.activity || activityDraft.type !== 'deadhead') return; setDeleteDeadhead({ draft: activityDraft, fromNodeId: values.fromNodeId, toNodeId: values.toNodeId, applyToSimilar: values.applyToSimilar }); setActivityDraft(undefined); }} onClose={() => { setBoundaryReview(undefined); setActivityDraft(undefined); }} />}
    {deleteDeadhead && <Confirm title={deleteDeadhead.applyToSimilar ? 'Delete similar deadheads?' : 'Delete deadhead?'} text={deleteDeadhead.applyToSimilar ? 'Delete every deadhead in this Block with the selected From and To Nodes? This cannot be undone.' : 'Delete this deadhead? This cannot be undone.'} label={deleteDeadhead.applyToSimilar ? 'Delete similar deadheads' : 'Delete deadhead'} busy={busy} onConfirm={() => void removeDeadhead(deleteDeadhead)} onClose={() => setDeleteDeadhead(undefined)} />}
    {removeTripsPending && <Confirm title="Remove selected Trips?" text={`Remove ${selectedTripIds.length} selected Trip${selectedTripIds.length === 1 ? '' : 's'} from “${selectedBlock?.label ?? 'this Block'}”? The Trips will become unassigned and connected deadheads will be removed.`} label="Remove Trips" busy={busy} onConfirm={() => void removeSelectedTrips()} onClose={() => setRemoveTripsPending(false)} />}
    {reassignTrips && <ReassignDialog tripCount={reassignTrips.trips.length} sourceBlock={dayBlocks.find((block) => block.id === reassignTrips.sourceBlockId)} destinationBlocks={dayBlocks.filter((block) => block.id !== reassignTrips.sourceBlockId)} busy={busy} onSubmit={(destinationBlockId) => { if (!blockingScenario) return; setBusy(true); void blockingService.reassignTrips({ blockingScenarioId: blockingScenario.id, serviceDayId, tripIds: reassignTrips.trips.map((trip) => trip.id), sourceBlockId: reassignTrips.sourceBlockId, destinationBlockId, sourceSignature: sourceSignature() }).then(async () => { setReassignTrips(undefined); setSelectedTripIds([]); setSelectedBlockId(destinationBlockId); await loadBlocks(); }).catch((error) => onError(error, 'Unable to reassign the selected Trips.')).finally(() => setBusy(false)); }} onClose={() => setReassignTrips(undefined)} />}
  </div>;
}

function BlockSortHeader({ label, column, sort, onSort }: { label: string; column: BlockSortColumn; sort: BlockSort; onSort: (column: BlockSortColumn) => void }) {
  const active = sort.column === column;
  return <th aria-sort={active ? sort.direction : 'none'}><button type="button" className="column-sort-button" aria-label={`Sort by ${label}${active ? `, ${sort.direction}` : ''}`} onClick={() => onSort(column)}>{label}<span className="column-sort-indicator" aria-hidden="true">{active ? sort.direction === 'ascending' ? '▲' : '▼' : '↕'}</span></button></th>;
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
  return <th className="sortable-filter-header" aria-sort={active ? direction : 'none'}><div className="table-header-controls" ref={rootRef} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
    <button type="button" className="column-sort-button" aria-label={`Sort by ${label}. Current order: ${directionLabel}.`} onClick={onSort}>{label}<span className="column-sort-indicator" aria-hidden="true">{active ? direction === 'ascending' ? '▲' : '▼' : '↕'}</span></button>
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

function UnassignedRow({ trip, pattern, nodes, status, selected, disabled, busy, onToggle, onAssign }: { trip: Trip; pattern?: RouteDefinitionAggregate['patterns'][number]; nodes: Map<string, Node>; status?: CompatibilityStatus; selected: boolean; disabled: boolean; busy: boolean; onToggle: (shiftKey: boolean) => void; onAssign: () => void }) { const first = pattern?.points[0]; const last = pattern?.points.at(-1); return <tr className={status && status !== 'compatible' ? 'blocking-row-' + status : undefined}><td className="blocking-selection-column"><input type="checkbox" aria-label={`Select unassigned Trip ${time(trip.stopTimes[0]?.time)}`} checked={selected} disabled={busy} onClick={(event) => onToggle(event.shiftKey)} /></td><td className="blocking-pattern-column">{pattern ? <span className={patternPillClass(pattern.id)}>{pattern.name}</span> : 'Missing pattern'}</td><td className="blocking-node-column">{nodes.get(first?.nodeId ?? '')?.name ?? '—'}</td><td className="blocking-time-column">{time(trip.stopTimes[0]?.time)}</td><td className="blocking-time-column">{time(trip.stopTimes.at(-1)?.time)}</td><td className="blocking-node-column">{nodes.get(last?.nodeId ?? '')?.name ?? '—'}</td><td className="blocking-assign-column"><button className={'assign-button ' + (status ?? 'unselected')} disabled={disabled || busy} title={fitHelp(status)} aria-label={fitAccessibleLabel(status) + ': ' + fitHelp(status)} onClick={onAssign}>{fitLabel(status)}</button></td></tr>; }
function ActivityRow({ activity, index, tripNumber, trips, patterns, nodes, summary, selected, onToggle, onRemove, onEdit, onMove, onDeadhead }: {
  activity: BlockActivity; index: number; tripNumber?: number; trips: Trip[]; patterns: Map<string, RouteDefinitionAggregate['patterns'][number]>; nodes: Map<string, Node>; summary?: BlockSummary;
  selected: boolean; onToggle: (shiftKey: boolean) => void; onRemove: () => void; onEdit: () => void; onMove: (movement: -1 | 1) => void; onDeadhead: (connection: BlockSummary['connections'][number], activity?: Extract<BlockActivity, { type: 'deadhead' }>) => void;
}) {
  const trip = activity.type === 'revenueTrip' ? trips.find((item) => item.id === activity.tripId) : undefined;
  const pattern = trip ? patterns.get(trip.patternId) : undefined;
  const timing = summary?.activityTimings.find((item) => item.activityId === activity.id);
  const connection = activity.type === 'revenueTrip' ? summary?.connections.find((item) => item.previousTripId === activity.tripId) : undefined;
  const hasPreviousRevenue = activity.type === 'revenueTrip' && Boolean(summary?.connections.some((item) => item.nextTripId === activity.tripId));
  const label = activity.type === 'revenueTrip' ? pattern?.name ?? 'Missing pattern' : activity.type === 'pullOut' ? 'Pull-out' : activity.type === 'pullIn' ? 'Pull-in' : 'Deadhead';
  const startId = activity.type === 'revenueTrip' ? pattern?.points[0]?.nodeId : activity.fromNodeId;
  const endId = activity.type === 'revenueTrip' ? pattern?.points.at(-1)?.nodeId : activity.toNodeId;
  const status = connection?.status;
  const deadheadTiming = connection?.deadhead ? summary?.activityTimings.find((item) => item.activityId === connection.deadhead?.id) : undefined;
  const deadheadDuration = deadheadTiming?.endTime === undefined || deadheadTiming.startTime === undefined ? undefined : deadheadTiming.endTime - deadheadTiming.startTime;
  return <tr className={status && status !== 'valid' ? 'blocking-row-' + status : undefined}>
    <td className="blocking-selection-column">{activity.type === 'revenueTrip' && <input type="checkbox" aria-label={`Select Trip ${tripNumber}`} checked={selected} onClick={(event) => onToggle(event.shiftKey)} />}</td><td className="blocking-index-column">{tripNumber ?? ''}</td><td className="blocking-pattern-column">{activity.type === 'revenueTrip' && pattern ? <span className={patternPillClass(pattern.id)}>{label}</span> : label}</td><td className="blocking-node-column">{nodes.get(startId ?? '')?.name ?? '—'}</td><td className="blocking-time-column">{time(timing?.startTime)}</td><td className="blocking-time-column">{time(timing?.endTime)}</td><td className="blocking-node-column">{nodes.get(endId ?? '')?.name ?? '—'}</td>
    <td className="blocking-deadhead-column">{activity.type === 'revenueTrip' && connection ? connection.deadhead ? <button className="deadhead-value" onClick={() => onDeadhead(connection, connection.deadhead)} aria-label={`Edit deadhead ${formatBlockingDuration(deadheadDuration)}`}>{formatBlockingDuration(deadheadDuration)}</button> : <button className="icon-button compact-icon-button" onClick={() => onDeadhead(connection)} aria-label="Add deadhead" title="Add deadhead"><PlusIcon /></button> : '—'}</td>
    <td className="blocking-layover-column">{connection?.usableLayoverSeconds === undefined ? '—' : formatBlockingDuration(connection.usableLayoverSeconds)}{status && status !== 'valid' && <span className="visually-hidden"> {status === 'conflict' ? 'Connection conflict' : 'Connection requires review'}</span>}</td>
    <td className="row-actions blocking-actions-column">
      {activity.type === 'revenueTrip' ? <>
        <button className="icon-button compact-icon-button" aria-label={'Move Trip ' + (index + 1) + ' up'} onClick={() => onMove(-1)} disabled={!hasPreviousRevenue}>↑</button>
        <button className="icon-button compact-icon-button" aria-label={'Move Trip ' + (index + 1) + ' down'} onClick={() => onMove(1)} disabled={!connection}>↓</button>
      </> : <button onClick={onEdit}>Edit</button>}
      <button className="icon-button icon-button--danger" aria-label={`Remove ${label}`} title={`Remove ${label}`} onClick={onRemove}><CircleXIcon /></button>
    </td>
  </tr>;
}
function Findings({ summary }: { summary?: BlockSummary }) { return !summary?.findings.length ? <p className="blocking-findings" role="status">No current issues.</p> : <div className="blocking-findings" role="status"><strong>Issues</strong><ul>{summary.findings.map((finding, index) => <li key={finding.ruleId + index}>{message(finding)}</li>)}</ul></div>; }
function SummaryPanel({ summary }: { summary: Awaited<ReturnType<BlockingQueries['getScenarioSummary']>> }) { return <section className="workflow-section" aria-label="Blocking summary"><div className="section-title"><div><h2>Selected-day Summary</h2><span>Known hours subtotal; invalid Blocks are excluded.</span></div></div>{summary ? <dl className="blocking-summary"><div><dt>Revenue hours</dt><dd>{hours(summary.revenueHours)}</dd></div><div><dt>Running time</dt><dd>{hours(summary.runningHours)}</dd></div><div><dt>Platform hours</dt><dd>{hours(summary.platformHours)}</dd></div><div><dt>Deadhead hours</dt><dd>{hours(summary.deadheadHours)}</dd></div><div><dt>Layover hours</dt><dd>{hours(summary.layoverHours)}</dd></div><div><dt>Revenue miles</dt><dd>{miles(summary.revenueMiles)}</dd></div><div><dt>Platform miles</dt><dd>{miles(summary.platformMiles)}</dd></div></dl> : <p className="profile-usage">Select a Blocking Scenario to view its summary.</p>}</section>; }
function NameDialog({ title, initialValue, submitLabel, busy, onSubmit, onClose }: { title: string; initialValue: string; submitLabel: string; busy: boolean; onSubmit: (value: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initialValue);
  return <div className="modal-backdrop"><form className="confirm-dialog" role="dialog" aria-modal="true" aria-label={title} onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSubmit(value.trim()); }} onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose(); }}><h2>{title}</h2><label className="dialog-field">Name<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} /></label><div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !value.trim()} type="submit">{busy ? 'Saving…' : submitLabel}</button></div></form></div>;
}
function NotesDialog({ block, busy, onSubmit, onClose }: { block: BlockingBlock; busy: boolean; onSubmit: (value: string) => void; onClose: () => void }) { const [value, setValue] = useState(block.notes ?? ''); return <div className="modal-backdrop"><form className="confirm-dialog" role="dialog" aria-modal="true" aria-label="Edit Block notes" onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}><h2>Edit Block notes</h2><label className="dialog-field">Notes<textarea autoFocus rows={4} value={value} onChange={(event) => setValue(event.target.value)} /></label><div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save notes'}</button></div></form></div>; }
function MinimumLayoverDialog({ value, onSubmit, onClose }: { value?: MinimumLayoverRule; onSubmit: (value?: MinimumLayoverRule) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'none' | MinimumLayoverRule['mode']>(value?.mode ?? 'minutes');
  const [amount, setAmount] = useState(value ? String(value.value) : '10');
  const parsed = Number(amount);
  const valid = mode === 'none' || (Number.isFinite(parsed) && parsed >= 0 && (mode !== 'percent' || parsed <= 100));
  return <div className="modal-backdrop"><form className="confirm-dialog activity-dialog" role="dialog" aria-modal="true" aria-label="Minimum layover" onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit(mode === 'none' ? undefined : { mode, value: parsed }); }}><h2>Minimum layover</h2><p className="profile-usage">Evaluate the connection before each candidate Trip using a fixed duration or a percentage of the preceding Trip’s revenue runtime.</p><div className="activity-form"><label>Rule<select autoFocus value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="none">No minimum</option><option value="minutes">Minutes per Trip</option><option value="percent">Percent of preceding Trip</option></select></label><label>{mode === 'percent' ? 'Percentage' : 'Minutes'}<input type="number" min="0" max={mode === 'percent' ? '100' : undefined} step={mode === 'percent' ? '0.1' : '1'} value={amount} disabled={mode === 'none'} onChange={(event) => setAmount(event.target.value)} /></label></div>{!valid && <p className="field-error" role="alert">Enter a non-negative value{mode === 'percent' ? ' from 0 through 100' : ''}.</p>}<div className="dialog-actions activity-dialog-actions activity-dialog-actions--two"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={!valid}>Apply</button></div></form></div>;
}
function Confirm({ title, text, label, busy, onConfirm, onClose }: { title: string; text: string; label: string; busy: boolean; onConfirm: () => void; onClose: () => void }) { return <div className="modal-backdrop"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-label={title}><h2>{title}</h2><p>{text}</p><div className="dialog-actions"><button autoFocus disabled={busy} onClick={onClose}>Cancel</button><button className="danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : label}</button></div></section></div>; }
function CircleXIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6m0-6-6 6" /></svg>; }
function PlusIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>; }
function ReassignDialog({ tripCount, sourceBlock, destinationBlocks, busy, onSubmit, onClose }: { tripCount: number; sourceBlock?: BlockingBlock; destinationBlocks: BlockingBlock[]; busy: boolean; onSubmit: (blockId: string) => void; onClose: () => void }) { const [blockId, setBlockId] = useState(destinationBlocks[0]?.id ?? ''); return <div className="modal-backdrop"><form className="confirm-dialog" role="dialog" aria-modal="true" aria-label="Reassign Trips to Block" onSubmit={(event) => { event.preventDefault(); if (blockId) onSubmit(blockId); }}><h2>Reassign Trips to Block</h2><p>Move {tripCount} selected Trip{tripCount === 1 ? '' : 's'} from “{sourceBlock?.label ?? 'the current Block'}” to the end of the destination Block in one save.</p><label className="dialog-field">Destination Block<select autoFocus value={blockId} onChange={(event) => setBlockId(event.target.value)}><option value="">Select Block</option>{destinationBlocks.map((block) => <option key={block.id} value={block.id}>{block.label}</option>)}</select></label><div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={busy || !blockId}>{busy ? 'Reassigning…' : 'Reassign Trips'}</button></div></form></div>; }
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
  const offsetLabel = draft.type === 'pullOut' ? 'Minutes before first Trip' : draft.type === 'pullIn' ? 'Minutes after last Trip' : 'Deadhead duration (minutes)';
  const values = (): ActivityValues => ({ minutes, fromNodeId, toNodeId, miles, applyToSimilar });
  const canDelete = draft.type === 'deadhead' && activity?.type === 'deadhead';
  return <div className="modal-backdrop"><form className="confirm-dialog activity-dialog" role="dialog" aria-modal="true" aria-label={(activity ? 'Edit ' : 'Add ') + label} onChangeCapture={onResetBulk} onSubmit={(event) => { event.preventDefault(); if (applyToMatching) { if (boundaryPreview) onApplyBulk(); else onReviewBulk(values(), replaceExisting); } else onSubmit(values()); }}>
    <h2>{activity ? 'Edit ' : 'Add '}{label}</h2>
    {draft.type === 'deadhead' && <p className="profile-usage">{draft.connectionDescription ?? 'The deadhead begins when its preceding revenue Trip ends. Remaining connection time is derived layover.'}</p>}
    <div className="activity-form">
      <label>{offsetLabel}<input autoFocus disabled={busy} inputMode="numeric" value={minutes} placeholder="0" onChange={(event) => setMinutes(event.target.value)} /></label>
      <label>Miles (optional)<input disabled={busy} inputMode="decimal" value={miles} onChange={(event) => setMiles(event.target.value)} /></label>
      <label>From<select disabled={busy} value={fromNodeId} onChange={(event) => setFrom(event.target.value)}><option value="">{draft.type === 'pullOut' ? 'Optional' : 'Select Node'}</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
      <label>To<select disabled={busy} value={toNodeId} onChange={(event) => setTo(event.target.value)}><option value="">{draft.type === 'pullIn' ? 'Optional' : 'Select Node'}</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
      {draft.type === 'deadhead' && <label className="activity-bulk-option"><input type="checkbox" checked={applyToSimilar} onChange={(event) => setApplyToSimilar(event.target.checked)} /> <span>Apply to all similar Trips in this Block</span></label>}
      {draft.type !== 'deadhead' && <label className="activity-bulk-option"><input type="checkbox" disabled={busy} checked={applyToMatching} onChange={(event) => setApplyToMatching(event.target.checked)} /> <span>Apply to matching Blocks</span></label>}
      {applyToMatching && <label className="activity-bulk-option"><input type="checkbox" disabled={busy} checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} /> <span>Replace existing activities in other Blocks</span></label>}
    </div>
    {applyToMatching && boundaryPreview && <p className="boundary-preview" role="status">{boundaryPreview.sourceBlockIncluded ? 'Selected Block included · ' : ''}{boundaryPreview.matchingBlockCount} node matches · {boundaryPreview.addCount} add · {boundaryPreview.replaceCount} replace · {boundaryPreview.skippedExistingCount} keep existing{boundaryPreview.skippedWithoutTripCount ? ` · ${boundaryPreview.skippedWithoutTripCount} without Trips skipped` : ''}</p>}
    <div className={'dialog-actions activity-dialog-actions' + (canDelete ? '' : ' activity-dialog-actions--two')}><button type="button" disabled={busy} onClick={onClose}>Cancel</button>{canDelete && <button type="button" className="subtle-danger" disabled={busy} onClick={() => onRequestDelete(values())}>Delete deadhead</button>}<button className="primary" disabled={busy} type="submit">{busy ? 'Working…' : applyToMatching ? boundaryPreview ? 'Apply to Blocks' : 'Review Blocks' : activity ? 'Save activity' : 'Add activity'}</button></div>
  </form></div>;
}
