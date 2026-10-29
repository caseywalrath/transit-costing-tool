import { useEffect, useRef, useState } from 'react';
import { type BlockingCommands, type BlockingQueries } from '../../application/ports';
import { MenuButton, type MenuGroup } from '../MenuButton';
import { userFacingError } from '../errorMessages';
import { staleTripNotice, staleTripNoticeText, type StaleTripNotice } from '../staleTripReasons';
import { readStoredRecord, storedText, storedTextMap } from '../preferences';
import { singleFlight } from '../singleFlight';
import { type RouteDefinitionApplication, type ScenarioRecords } from '../../application/routeDefinitionService';
import { TripShiftStalePreviewError, type TripGenerationApplication } from '../../application/tripGenerationService';
import { TripShiftValidationError, type TripShiftPreview } from '../../domain/tripShift';
import { TripGenerationError } from '../../domain/trips';
import { createBlockingScenarioSourceSignature, formatNetShift, isUsablePattern, orderDirections, parseShiftSeconds, regenerationUndoApplies, reverseRuntimeCandidates, routeRuntimeCalculationMethod, sortServiceDays, usableDirectionPatterns, type RuntimeCalculationMethod } from '../../application/tripsWorkspaceView';
import { formatServiceTime, parseServiceTime } from '../../domain/time';
import { type BlockingBlock, type Route, type RouteDefinitionAggregate, type RuntimeAssignment, type RuntimeProfile, type ServiceDayDefinition, type Trip } from '../../domain/types';
import { type BlockConnection } from '../../domain/blocking';
import { runtimeProfileCsv } from '../runtimeProfileCsv';
import { tripTableCsv } from '../../application/tripTableCsv';
import { type RouteNavigationGuard } from '../shared/types';
import { type RuntimeEditorHandle, type RuntimeEditorState, RuntimeEditor2, RouteRuntimeMethodDialog } from './RuntimeEditor';
import { type BuildTripsValues, EMPTY_BUILD_VALUES, type NewRuntimeDialog, TripBlockAssignmentDialog, TripBlockUnassignmentDialog, BuildTripsDrawer, RuntimeProfileDialog2, DeleteRuntimeProfileDialog, DeleteTripsDialog, RecalculationDialog, RuntimeDayCopyDialog, TripDayCopyDialog, BatchPatternChangeDialog, TripPatternChangeDialog } from './dialogs';
import { type TripBlockAssignmentDraft, type TripBlockOption, type TripSelectionRequest, ScheduleTable } from './ScheduleTable';
import { combineSelection, invertSelection, tripIdsMatching } from '../../application/tripSelection';
import { download } from '../shared/download';
import { messages, userMessage } from '../shared/messages';
import { RouteNavigationDraftDialog, ShiftDiscardDialog } from '../shared/dialogs';
import { InlineNote, WorkSurface } from '../shared/surfaces';
import { SaveBar, SelectionBar } from '../shared/bars';
import { ContextField } from '../shared/ContextField';

export const TRIP_BLOCKING_SCENARIO_PREFERENCE_KEY = 'transit-costing-tool.trip-blocking-scenario.v1';
export const RUNTIMES_OPEN_PREFERENCE_KEY = 'transit-costing-tool.runtimes-open.v1';

/** Whether the Runtimes section was left open on this device. Collapsed unless the stored value is exactly `{ "open": true }`. */
export function storedRuntimesOpen(): boolean { return readStoredRecord(RUNTIMES_OPEN_PREFERENCE_KEY).open === true; }
function rememberRuntimesOpen(open: boolean) { try { localStorage.setItem(RUNTIMES_OPEN_PREFERENCE_KEY, JSON.stringify({ open })); } catch { /* UI preference only. */ } }

/** The blocking scenario last chosen in Trips for each trip profile of a Scenario. An older record holds a single choice. */
export function rememberedTripBlockingScenarios(scenarioId: string): Record<string, string> {
  const stored = readStoredRecord(TRIP_BLOCKING_SCENARIO_PREFERENCE_KEY);
  if (storedText(stored.scenarioId) !== scenarioId) return {};
  const byProfile = storedTextMap(stored.byTripProfile) ?? {};
  const legacyProfile = storedText(stored.tripProfileId); const legacyChoice = storedText(stored.blockingScenarioId);
  return legacyProfile && legacyChoice && !(legacyProfile in byProfile) ? { ...byProfile, [legacyProfile]: legacyChoice } : byProfile;
}

export function rememberTripBlockingScenario(scenarioId: string, tripProfileId: string, blockingScenarioId: string) {
  try { localStorage.setItem(TRIP_BLOCKING_SCENARIO_PREFERENCE_KEY, JSON.stringify({ scenarioId, byTripProfile: { ...rememberedTripBlockingScenarios(scenarioId), [tripProfileId]: blockingScenarioId } })); } catch { /* UI preference only. */ }
}

/** The time a backup was exported, in the planner's own date and time format. */
/** "Weekday", "Weekday and Saturday", "Weekday, Saturday, and Sunday". */
export function dayNameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

/** Step sizes offered as one-press choices in the Shift drawer; any other whole number of minutes can be typed (U10). */
export const SHIFT_STEP_PRESETS = [1, 5, 10, 15] as const;

/** The text for a refused Shift. The domain's generic wording for an invalid request is replaced with a next step. */
export function shiftErrorText(error: unknown, fallback: string) {
  if (error instanceof TripShiftValidationError && !error.findings.some((item) => item.ruleId === 'tripShift.timeBeforeServiceDay')) return 'The selected trips cannot be shifted. Check the selection and try again.';
  return userFacingError(error, fallback);
}

export function TripsWorkspace({ service, tripService, blockingService, aggregate, records, serviceDayId, directionId, tripProfileId, tripProfileBusy, tripPatternSelections, onTripPatternChange, onTripProfileChange, onTripProfileRename, onTripProfileCopy, onTripProfileDelete, onRegisterNavigationGuard, runtimeVersion, onRuntimeChanged, onError }: { service: RouteDefinitionApplication; tripService: TripGenerationApplication; blockingService: BlockingCommands & BlockingQueries; aggregate: RouteDefinitionAggregate; records: ScenarioRecords; serviceDayId: string; directionId: string; tripProfileId: string; tripProfileBusy: boolean; tripPatternSelections: Record<string, string>; onTripPatternChange: (key: string, id: string) => void; onTripProfileChange: (id: string) => void; onTripProfileRename: () => void; onTripProfileCopy: () => void; onTripProfileDelete: () => void; onRegisterNavigationGuard: (guard: RouteNavigationGuard | undefined) => void; runtimeVersion: number; onRuntimeChanged: () => void; onError: (error: unknown, fallback?: string) => void }) {
  const days = sortServiceDays(records.serviceDays);
  const directions = orderDirections(aggregate.directions ?? []);
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  // What the Runtime section last read: the Route's profiles and the day's assignments (the Trips table shades with them), and the days that share the selected profile.
  const [routeRuntime, setRouteRuntime] = useState<{ profiles: RuntimeProfile[]; assignments: RuntimeAssignment[] }>();
  const [profileDays, setProfileDays] = useState<ServiceDayDefinition[]>([]);
  const [profileId, setProfileId] = useState('');
  const [loading, setLoading] = useState(false);
  const [runtimeDialog, setRuntimeDialog] = useState<NewRuntimeDialog>();
  const [deleteProfileOpen, setDeleteProfileOpen] = useState(false);
  const [profileDeletionImpact, setProfileDeletionImpact] = useState<{ assignmentCount: number; tripCount: number; reviewToken: string }>();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [lastRegenerationUndo, setLastRegenerationUndo] = useState<import('../../domain/types').TripRegenerationUndo>();
  const [tripsWithChangedRuntimes, setTripsWithChangedRuntimes] = useState<Trip[]>([]);
  const [staleReasons, setStaleReasons] = useState<StaleTripNotice>();
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [tripDeletion, setTripDeletion] = useState<{ tripIds: string[]; affectedBlockIds: string[]; reviewToken: string }>();
  const [recalculationTripIds, setRecalculationTripIds] = useState<string[]>([]);
  const [buildOpen, setBuildOpen] = useState(false);
  const [draftTrip, setDraftTrip] = useState<{ patternId: string; firstTrip: string }>();
  const [shiftMinutes, setShiftMinutes] = useState('1');
  const [shiftDrawerOpen, setShiftDrawerOpen] = useState(false);
  const [shiftOperations, setShiftOperations] = useState<number[]>([]);
  const [redoShiftOperations, setRedoShiftOperations] = useState<number[]>([]);
  const [shiftPreview, setShiftPreview] = useState<TripShiftPreview>();
  const [shiftError, setShiftError] = useState('');
  const [shiftDiscardAction, setShiftDiscardAction] = useState<(() => void)>();
  const [runtimeLeave, setRuntimeLeave] = useState<{ action: () => void; leavesContext?: boolean }>();
  const [draftTripDiscardAction, setDraftTripDiscardAction] = useState<(() => void)>();
  const lastShiftControl = useRef<HTMLButtonElement | null>(null);
  const buildValues = useRef<BuildTripsValues>(EMPTY_BUILD_VALUES);
  const [runtimeEditorState, setRuntimeEditorState] = useState<RuntimeEditorState>({ dirty: false, saving: false, changeCount: 0 });
  const [showRuntimeBands, setShowRuntimeBands] = useState(false);
  const [showHeadways, setShowHeadways] = useState(false);
  const [roundDisplayedTimes, setRoundDisplayedTimes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runtimeCopyOpen, setRuntimeCopyOpen] = useState(false);
  const [routeMethodChange, setRouteMethodChange] = useState<{ method: RuntimeCalculationMethod; impact?: { profileCount: number; tripCount: number }; busy: boolean }>();
  const [tripCopyOpen, setTripCopyOpen] = useState(false);
  const [batchPatternChangeOpen, setBatchPatternChangeOpen] = useState(false);
  const [tripPatternChangeOpen, setTripPatternChangeOpen] = useState(false);
  const [runtimesOpen, setRuntimesOpen] = useState(storedRuntimesOpen);
  const [blockingScenarios, setBlockingScenarios] = useState<import('../../domain/types').BlockingScenario[]>([]);
  const [tripBlockingScenarioId, setTripBlockingScenarioId] = useState('');
  const [tripBlockingBlocks, setTripBlockingBlocks] = useState<BlockingBlock[]>([]);
  const [tripConnections, setTripConnections] = useState<Map<string, { connection: BlockConnection; deadheadSeconds?: number; nextTripStart?: number }>>(new Map());
  const [tripBlockWarnings, setTripBlockWarnings] = useState<Map<string, string[]>>(new Map());
  const [tripBlockingBlocksBusy, setTripBlockingBlocksBusy] = useState(false);
  const [tripBlockAssignment, setTripBlockAssignment] = useState<TripBlockAssignmentDraft>();
  const [tripBlockAssignmentError, setTripBlockAssignmentError] = useState('');
  const [tripBlockAssignmentStatus, setTripBlockAssignmentStatus] = useState('');
  const runtimeCopyButtonRef = useRef<HTMLButtonElement>(null);
  const tripsActionsRef = useRef<HTMLButtonElement>(null);
  const buildTripsButtonRef = useRef<HTMLButtonElement>(null);
  const runtimesToggleRef = useRef<HTMLButtonElement>(null);
  const tripsTableScrollRef = useRef<HTMLDivElement>(null);
  const tripBlockAssignmentFocusRef = useRef<HTMLElement | null>(null);
  // Set when an assignment or unassignment succeeds. The Trip actions menu is disabled while the dialog's draft exists, and the selection
  // bar button that opened it goes away with the selection, so the focus is put back after the render that ends the draft.
  const refocusAfterAssignment = useRef(false);
  const runtimeEditorRef = useRef<RuntimeEditorHandle>(null);
  const selectionAnchorId = useRef<string | undefined>(undefined);
  const patterns = usableDirectionPatterns(aggregate.patterns, directionId);
  const patternSelectionKey = `${records.scenario.id}:${aggregate.route.id}:${directionId}`;
  const savedPatternId = tripPatternSelections[patternSelectionKey];
  const patternId = patterns.some((pattern) => pattern.id === savedPatternId) ? savedPatternId : patterns[0]?.id ?? '';
  const setPatternId = (id: string) => onTripPatternChange(patternSelectionKey, id);
  const selectedPattern = patterns.find((pattern) => pattern.id === patternId);
  const selectedProfile = profiles.find((profile) => profile.id === profileId);
  const selectedDay = days.find((day) => day.id === serviceDayId);
  // The Runtime section's own reads win over the records the page loaded at the start, which a Runtime save does not refresh.
  const runtimeSource = routeRuntime ?? { profiles: records.runtimeProfiles, assignments: records.runtimeAssignments };
  // Every Runtime profile of the Route uses one calculation method (Decision 0045).
  const routeMethod = routeRuntimeCalculationMethod(runtimeSource.profiles.filter((profile) => profile.routeId === aggregate.route.id));
  const activeRuntimeProfiles = new Map(runtimeSource.assignments.filter((assignment) => assignment.serviceDayId === serviceDayId).map((assignment) => [assignment.patternId, runtimeSource.profiles.find((profile) => profile.id === assignment.runtimeProfileId)] as const));
  const patternName = (id: string) => aggregate.patterns.find((pattern) => pattern.id === id)?.name || 'Unnamed pattern';


  type RuntimeRead = { profiles: RuntimeProfile[]; profileId: string; profileDays: ServiceDayDefinition[]; routeProfiles: RuntimeProfile[]; dayAssignments: RuntimeAssignment[] } | undefined;
  /** One read of the Runtime section: makes sure the Default profile exists, then reads the profiles, the assignments, and the days that share the selected profile. */
  async function readRuntime(): Promise<RuntimeRead> {
    if (!selectedPattern || !serviceDayId) return undefined;
    await service.ensureDefaultRuntimeProfile(selectedPattern);
    const [nextProfiles, assignments, routeProfiles, dayAssignments] = await Promise.all([
      service.listRuntimeProfiles(aggregate.route.id, selectedPattern.id),
      service.listRuntimeAssignments(records.scenario.id, serviceDayId, selectedPattern.id),
      service.listRuntimeProfiles(aggregate.route.id),
      service.listRuntimeAssignments(records.scenario.id, serviceDayId),
    ]);
    const nextProfileId = assignments[0]?.runtimeProfileId ?? '';
    return { profiles: nextProfiles, profileId: nextProfileId, profileDays: nextProfileId ? await service.listRuntimeProfileServiceDays(nextProfileId) : [], routeProfiles, dayAssignments };
  }
  // Every change (a save, an assignment, a copy, a Route edit) calls `onRuntimeChanged`, which bumps `runtimeVersion` and reloads here once.
  // Loads that overlap (StrictMode's second effect run, or a change that lands while a load runs) run one after another and share their
  // last result, so the section is not reset twice and two first-visit loads never race (U07).
  const readRuntimeRef = useRef(readRuntime);
  readRuntimeRef.current = readRuntime;
  const runtimeFlight = useRef(singleFlight(() => readRuntimeRef.current()));
  async function loadRuntime() {
    setLoading(true);
    try {
      const read = await runtimeFlight.current();
      setProfiles(read?.profiles ?? []); setProfileId(read?.profileId ?? ''); setProfileDays(read?.profileDays ?? []);
      setRouteRuntime(read ? { profiles: read.routeProfiles, assignments: read.dayAssignments } : undefined);
    } catch (error) { onError(error); } finally { setLoading(false); }
  }
  async function loadTrips() {
    if (!serviceDayId || !directionId) { setTrips([]); setTripsWithChangedRuntimes([]); setStaleReasons(undefined); setLastRegenerationUndo(await tripService.getLastTripRegenerationUndo()); return; }
    try {
      const [nextTrips, nextStale, undo] = await Promise.all([tripService.listScheduleTrips(serviceDayId, directionId, tripProfileId), tripService.inspectStaleTrips(serviceDayId, tripProfileId), tripService.getLastTripRegenerationUndo()]);
      const shownTripIds = new Set(nextTrips.map((item) => item.id));
      setTrips(nextTrips); setTripsWithChangedRuntimes(nextStale.trips.filter((trip) => shownTripIds.has(trip.id))); setStaleReasons(staleTripNotice(nextStale.findings, shownTripIds, userMessage)); setLastRegenerationUndo(undo);
    } catch (error) { onError(error); }
  }
  useEffect(() => { void loadRuntime(); }, [aggregate.route.id, selectedPattern?.id, serviceDayId, records.scenario.id, runtimeVersion]);
  function clearTripShiftHistory() { setShiftDrawerOpen(false); setShiftOperations([]); setRedoShiftOperations([]); setShiftPreview(undefined); setShiftError(''); }
  useEffect(() => { setDraftTrip(undefined); }, [serviceDayId, directionId, tripProfileId]);
  useEffect(() => { setSelectedTripIds([]); selectionAnchorId.current = undefined; setBuildOpen(false); clearTripShiftHistory(); void loadTrips(); }, [serviceDayId, directionId, tripProfileId, runtimeVersion]);
  useEffect(() => { tripsTableScrollRef.current = document.querySelector<HTMLDivElement>('.trips-workspace .schedule-table'); }, [trips.length, directionId]);
  useEffect(() => {
    let live = true;
    void blockingService.listBlockingScenarios(records.scenario.id).then((next) => {
      if (!live) return;
      const available = next.filter((item) => item.tripProfileId === tripProfileId);
      setBlockingScenarios(available);
      const saved = rememberedTripBlockingScenarios(records.scenario.id)[tripProfileId] ?? '';
      setTripBlockingScenarioId((current) => {
        if (current && available.some((item) => item.id === current)) return current;
        if (saved && available.some((item) => item.id === saved)) return saved;
        return available[0]?.id ?? '';
      });
    }).catch((error) => onError(error, 'Unable to load blocking scenario context.'));
    return () => { live = false; };
  }, [blockingService, records.scenario.id, tripProfileId]);
  useEffect(() => {
    let live = true;
    setTripBlockingBlocks([]);
    if (!tripBlockingScenarioId) { setTripBlockingBlocksBusy(false); return; }
    setTripBlockingBlocksBusy(true);
    void blockingService.listBlockingBlocks(tripBlockingScenarioId).then((blocks) => {
      if (live) setTripBlockingBlocks(blocks);
    }).catch((error) => onError(error, 'Unable to load blocking scenario blocks.')).finally(() => { if (live) setTripBlockingBlocksBusy(false); });
    return () => { live = false; };
  }, [blockingService, tripBlockingScenarioId, serviceDayId, runtimeVersion]);
  useEffect(() => {
    let live = true;
    setTripConnections(new Map());
    setTripBlockWarnings(new Map());
    if (!tripBlockingScenarioId || tripBlockingBlocksBusy) return () => { live = false; };
    void blockingService.getScenarioSummary(tripBlockingScenarioId, serviceDayId).then((summary) => {
      if (!live || !summary) return;
      const nextConnections = new Map<string, { connection: BlockConnection; deadheadSeconds?: number; nextTripStart?: number }>();
      const nextWarnings = new Map<string, string[]>();
      const addWarning = (tripId: string, message: string) => nextWarnings.set(tripId, [...new Set([...(nextWarnings.get(tripId) ?? []), message])]);
      for (const blockSummary of summary.blockSummaries) {
        const block = dayBlockingBlocks.find((item) => item.id === blockSummary.blockId);
        for (const connection of blockSummary.connections) {
          const previousActivity = block?.activities.find((activity) => activity.type === 'revenueTrip' && activity.tripId === connection.previousTripId);
          const nextActivity = block?.activities.find((activity) => activity.type === 'revenueTrip' && activity.tripId === connection.nextTripId);
          const deadheadTiming = connection.deadhead && blockSummary.activityTimings.find((timing) => timing.activityId === connection.deadhead?.id);
          const previousTiming = previousActivity && blockSummary.activityTimings.find((timing) => timing.activityId === previousActivity.id);
          const nextTiming = nextActivity && blockSummary.activityTimings.find((timing) => timing.activityId === nextActivity.id);
          for (const finding of connection.findings) {
            const blockLabel = block?.label ?? 'Block';
            if (finding.ruleId === 'block.connectionOverlap' && previousTiming?.endTime !== undefined && nextTiming?.startTime !== undefined) {
              addWarning(connection.previousTripId, `${blockLabel}: arrives at ${formatServiceTime(previousTiming.endTime)} after next trip departs at ${formatServiceTime(nextTiming.startTime)}.`);
              addWarning(connection.nextTripId, `${blockLabel}: departs at ${formatServiceTime(nextTiming.startTime)} before previous trip arrives at ${formatServiceTime(previousTiming.endTime)}.`);
            } else {
              const reason = blockConnectionWarningMessage(finding.ruleId);
              addWarning(connection.previousTripId, `${blockLabel}: ${reason}`);
              addWarning(connection.nextTripId, `${blockLabel}: ${reason}`);
            }
          }
          nextConnections.set(connection.previousTripId, {
            connection,
            ...(deadheadTiming?.startTime !== undefined && deadheadTiming.endTime !== undefined ? { deadheadSeconds: deadheadTiming.endTime - deadheadTiming.startTime } : {}),
            ...(connection.rawGapSeconds !== undefined && previousTiming?.endTime !== undefined ? { nextTripStart: previousTiming.endTime + connection.rawGapSeconds } : {}),
          });
        }
      }
      setTripConnections(nextConnections);
      setTripBlockWarnings(nextWarnings);
    }).catch((error) => onError(error, 'Unable to load trip connection details.'));
    return () => { live = false; };
  }, [blockingService, tripBlockingScenarioId, serviceDayId, tripBlockingBlocksBusy, tripBlockingBlocks, trips]);
  // Remember the choice for each trip profile. A change of trip profile, or a moment with no choice, must not erase another profile's choice.
  useEffect(() => { if (!tripProfileId || !tripBlockingScenarioId || !blockingScenarios.some((item) => item.id === tripBlockingScenarioId && item.tripProfileId === tripProfileId)) return; rememberTripBlockingScenario(records.scenario.id, tripProfileId, tripBlockingScenarioId); }, [records.scenario.id, tripProfileId, tripBlockingScenarioId, blockingScenarios]);
  useEffect(() => {
    if (tripBlockAssignment || !refocusAfterAssignment.current) return;
    refocusAfterAssignment.current = false;
    tripBlockAssignmentFocusRef.current?.focus();
  }, [tripBlockAssignment]);
  useEffect(() => { setTripBlockAssignment(undefined); setTripBlockAssignmentError(''); setTripBlockAssignmentStatus(''); }, [serviceDayId, directionId, tripProfileId, tripBlockingScenarioId]);

  const selectedBlockingScenario = blockingScenarios.find((item) => item.id === tripBlockingScenarioId);
  const dayBlockingBlocks = tripBlockingBlocks
    .filter((block) => block.blockingScenarioId === tripBlockingScenarioId && block.serviceDayId === serviceDayId)
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }) || left.id.localeCompare(right.id));
  const tripBlockByTripId = new Map(dayBlockingBlocks.flatMap((block) => block.activities
    .filter((activity) => activity.type === 'revenueTrip')
    .map((activity) => [activity.tripId, block] as const)));

  function tripBlockOption(block: BlockingBlock): TripBlockOption {
    const revenueTripIds = block.activities.filter((activity) => activity.type === 'revenueTrip').map((activity) => activity.tripId);
    const blockTrips = revenueTripIds.map((id) => records.trips.find((trip) => trip.id === id));
    if (blockTrips.some((trip) => !trip)) return { id: block.id, label: block.label, disabled: true, reason: 'This block references a trip that is no longer available.' };
    if (blockTrips.some((trip) => trip!.tripProfileId !== tripProfileId || trip!.serviceDayId !== serviceDayId)) return { id: block.id, label: block.label, disabled: true, reason: 'This block contains a trip outside the selected trip profile or service day.' };
    if (blockTrips.some((trip) => trip!.routeId !== aggregate.route.id)) return { id: block.id, label: block.label, disabled: true, reason: 'Cross-Route assignment is not available in this workspace.' };
    return { id: block.id, label: block.label };
  }
  const tripBlockOptions = dayBlockingBlocks.map(tripBlockOption);
  const hasAssignableTripBlock = tripBlockOptions.some((option) => !option.disabled);

  function openTripBlockAssignment(tripIds: string[], destinationBlockId: string, source: 'pill' | 'actions', focusTarget?: HTMLElement | null, operation: 'assign' | 'unassign' = 'assign') {
    if (!selectedBlockingScenario || !tripBlockingScenarioId || !tripIds.length || !tripBlockingBlocks.length) return;
    const selectedIds = new Set(tripIds);
    const displayedTripIds = trips.filter((trip) => selectedIds.has(trip.id)).map((trip) => trip.id);
    if (!displayedTripIds.length) return;
    tripBlockAssignmentFocusRef.current = focusTarget ?? tripsActionsRef.current;
    setTripBlockAssignmentError('');
    setTripBlockAssignmentStatus('');
    setTripBlockAssignment({ operation, tripIds: displayedTripIds, destinationBlockId, source, blockingScenarioId: selectedBlockingScenario.id, tripProfileId, serviceDayId, sourceSignature: createBlockingScenarioSourceSignature(selectedBlockingScenario, tripBlockingBlocks) });
  }

  function closeTripBlockAssignment() {
    setTripBlockAssignment(undefined);
    setTripBlockAssignmentError('');
    window.setTimeout(() => tripBlockAssignmentFocusRef.current?.focus());
  }

  async function confirmTripBlockAssignment(destinationBlockId: string) {
    if (!tripBlockAssignment) return;
    if (tripBlockAssignment.blockingScenarioId !== tripBlockingScenarioId || tripBlockAssignment.tripProfileId !== tripProfileId || tripBlockAssignment.serviceDayId !== serviceDayId) {
      setTripBlockAssignmentError('The selected service context changed. Close this dialog and review the assignment again.');
      return;
    }
    if (tripBlockAssignment.operation === 'unassign') {
      const assignedTripIds = tripBlockAssignment.tripIds.filter((id) => tripBlockByTripId.has(id));
      if (!assignedTripIds.length) {
        setTripBlockAssignmentStatus('The selected trips are already unassigned.');
        closeTripBlockAssignment();
        return;
      }
      setBusy(true);
      setTripBlockAssignmentError('');
      try {
        await blockingService.removeTrips(tripBlockAssignment.blockingScenarioId, tripBlockAssignment.serviceDayId, assignedTripIds, tripBlockAssignment.sourceSignature);
        const updatedBlocks = await blockingService.listBlockingBlocks(tripBlockAssignment.blockingScenarioId);
        setTripBlockingBlocks(updatedBlocks);
        setSelectedTripIds((ids) => ids.filter((id) => !tripBlockAssignment.tripIds.includes(id)));
        const alreadyUnassignedCount = tripBlockAssignment.tripIds.length - assignedTripIds.length;
        setTripBlockAssignmentStatus(`Unassigned ${assignedTripIds.length} trip${assignedTripIds.length === 1 ? '' : 's'}${alreadyUnassignedCount ? `; ${alreadyUnassignedCount} already unassigned` : ''}.`);
        setTripBlockAssignment(undefined);
        refocusAfterAssignment.current = true;
      } catch (error) {
        setTripBlockAssignmentError(userFacingError(error, 'Unable to unassign the selected trips. Reopen Blocking to check the blocks, then try again.'));
        if (error instanceof Error && error.message.includes('changed since the operation was reviewed')) {
          void blockingService.listBlockingBlocks(tripBlockAssignment.blockingScenarioId).then(setTripBlockingBlocks).catch(() => undefined);
        }
      } finally { setBusy(false); }
      return;
    }
    const option = tripBlockOptions.find((item) => item.id === destinationBlockId);
    if (!option || option.disabled) { setTripBlockAssignmentError(option?.reason ?? 'Choose an available block.'); return; }
    setBusy(true);
    setTripBlockAssignmentError('');
    try {
      const result = await blockingService.assignTripsToBlock({ blockingScenarioId: tripBlockAssignment.blockingScenarioId, serviceDayId: tripBlockAssignment.serviceDayId, tripIds: tripBlockAssignment.tripIds, destinationBlockId, sourceSignature: tripBlockAssignment.sourceSignature });
      setTripBlockingBlocks(result.blocks);
      setSelectedTripIds((ids) => ids.filter((id) => !tripBlockAssignment.tripIds.includes(id)));
      setTripBlockAssignmentStatus(`Assigned ${tripBlockAssignment.tripIds.length} trip${tripBlockAssignment.tripIds.length === 1 ? '' : 's'} to ${option.label}.`);
      setTripBlockAssignment(undefined);
      refocusAfterAssignment.current = true;
    } catch (error) {
      setTripBlockAssignmentError(userFacingError(error, 'Unable to assign the selected trips. Reopen Blocking to check the blocks, then try again.'));
      if (error instanceof Error && error.message.includes('changed since the operation was reviewed')) {
        void blockingService.listBlockingBlocks(tripBlockAssignment.blockingScenarioId).then(setTripBlockingBlocks).catch(() => undefined);
      }
    } finally { setBusy(false); }
  }

  // A Shift drawer step disables its buttons while the preview resolves, which drops the keyboard focus to the page. Put it back on the
  // button that was pressed, or on the next enabled control when that button stays disabled (Undo with nothing left, finding 5-012).
  useEffect(() => {
    if (busy || !shiftDrawerOpen) return;
    const active = document.activeElement;
    if (active && active !== document.body && !active.matches(':disabled')) return;
    const pressed = lastShiftControl.current;
    // The live shift bar is the one outside the hidden slot that holds the table's own copy while the pinned copy shows.
    const liveBar = [...document.querySelectorAll<HTMLElement>('[data-shift-bar]')].find((bar) => !bar.closest('.selection-bar-slot--pinned'));
    const target = pressed?.isConnected && !pressed.disabled && !pressed.closest('.selection-bar-slot--pinned') ? pressed : liveBar?.querySelector<HTMLElement>('button:not(:disabled)');
    target?.focus({ preventScroll: true });
  }, [busy, shiftDrawerOpen]);

  function requestShiftScopeChange(action: () => void) {
    if (shiftOperations.length) { setShiftDiscardAction(() => action); return; }
    action();
  }
  // A change of Profile, Pattern, service day, Direction, or tab replaces the Runtime editor, and a Runtime save reloads the Trips. Either
  // would drop unsaved Runtime edits or a staged Shift without a word (finding 5-004), so each asks first: Save, Discard, or Cancel for the
  // Runtime draft, then the staged-Shift dialog.
  function requestScopeChange(action: () => void) {
    if (runtimeEditorState.dirty) { setRuntimeLeave({ action }); return; }
    requestShiftScopeChange(action);
  }
  // A new Trip row with a Pattern or a first time entered is lost when the service day, Direction, trip profile, or tab changes, so that
  // change asks too (hand-off F1-1). An empty row is dropped without a question. The order is Runtime, staged Shift, then the row.
  const draftTripEntered = Boolean(draftTrip && (draftTrip.patternId || draftTrip.firstTrip.trim()));
  function requestDraftTripScopeChange(action: () => void) {
    if (draftTripEntered) { setDraftTripDiscardAction(() => action); return; }
    action();
  }
  function requestShiftAndDraftScopeChange(action: () => void) {
    requestShiftScopeChange(() => requestDraftTripScopeChange(action));
  }
  function requestContextChange(action: () => void) {
    if (runtimeEditorState.dirty) { setRuntimeLeave({ action, leavesContext: true }); return; }
    requestShiftAndDraftScopeChange(action);
  }
  /** Saves the Runtime draft, asking first when a staged Shift would be dropped by the reload, then runs `action` if the save worked. */
  function saveRuntimeThen(action: () => void, leavesContext = false) {
    (leavesContext ? requestShiftAndDraftScopeChange : requestShiftScopeChange)(() => { void (async () => { if (await runtimeEditorRef.current?.save()) action(); })(); });
  }
  useEffect(() => {
    if (!runtimeEditorState.dirty && !draftTripEntered && (!shiftDrawerOpen || !shiftOperations.length)) { onRegisterNavigationGuard(undefined); return; }
    onRegisterNavigationGuard(requestContextChange);
    return () => onRegisterNavigationGuard(undefined);
  }, [shiftDrawerOpen, shiftOperations.length, runtimeEditorState.dirty, draftTripEntered]);
  useEffect(() => {
    if (!runtimeEditorState.dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [runtimeEditorState.dirty]);

  function shiftRequest(offsetSeconds: number, tripIds = shiftPreview?.request.tripIds ?? selectedTripIds) {
    return { scenarioId: records.scenario.id, routeId: aggregate.route.id, serviceDayId, directionId, tripProfileId, tripIds, offsetSeconds };
  }
  /** Previews `operations` and, when the preview resolves, stages them. Returns false when the preview was refused, so the history stays as it was. */
  async function reviewStagedShift(operations: number[]): Promise<boolean> {
    const offsetSeconds = operations.reduce((total, value) => total + value, 0);
    try {
      setBusy(true);
      const preview = await tripService.previewStagedTripShift(shiftRequest(offsetSeconds));
      setShiftPreview(preview); setShiftOperations(operations); setShiftError('');
      return true;
    } catch (error) { setShiftError(shiftErrorText(error, 'Unable to preview the selected trips. Discard the shift and try again.')); return false; }
    finally { setBusy(false); }
  }
  // Undo and Redo history changes only after the preview resolves (finding 5-026): a refused preview leaves it as it was.
  async function appendStagedShift(offsetSeconds: number) { if (await reviewStagedShift([...shiftOperations, offsetSeconds])) setRedoShiftOperations([]); }
  async function undoStagedShift() { const undone = shiftOperations.at(-1); if (undone !== undefined && await reviewStagedShift(shiftOperations.slice(0, -1))) setRedoShiftOperations((current) => [...current, undone]); }
  async function redoStagedShift() { const restored = redoShiftOperations.at(-1); if (restored !== undefined && await reviewStagedShift([...shiftOperations, restored])) setRedoShiftOperations((current) => current.slice(0, -1)); }
  async function openShiftDrawer() {
    if (!selectedTripIds.length) return;
    setShiftDrawerOpen(true); setShiftOperations([]); setRedoShiftOperations([]); setShiftError('');
    try {
      setBusy(true);
      setShiftPreview(await tripService.previewStagedTripShift(shiftRequest(0, [...selectedTripIds])));
    } catch (error) { setShiftError(shiftErrorText(error, 'Unable to preview the selected trips. Discard the shift and try again.')); }
    finally { setBusy(false); }
  }
  function discardStagedShift(after?: () => void) {
    clearTripShiftHistory(); setShiftDiscardAction(undefined); after?.(); window.setTimeout(() => tripsActionsRef.current?.focus());
  }
  function requestCloseShiftDrawer() {
    if (shiftOperations.length) { setShiftDiscardAction(() => () => undefined); return; }
    discardStagedShift();
  }
  async function completeStagedShift() {
    if (!shiftPreview) return;
    if (!shiftOperations.length || shiftPreview.netOffsetSeconds === 0) { setSelectedTripIds([]); discardStagedShift(); return; }
    setBusy(true);
    const pagePosition = { left: window.scrollX, top: window.scrollY, tableLeft: tripsTableScrollRef.current?.scrollLeft ?? 0, tableTop: tripsTableScrollRef.current?.scrollTop ?? 0 };
    try {
      await tripService.applyStagedTripShift(shiftPreview);
      setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips();
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.scrollTo({ left: pagePosition.left, top: pagePosition.top, behavior: 'auto' });
        if (tripsTableScrollRef.current) { tripsTableScrollRef.current.scrollLeft = pagePosition.tableLeft; tripsTableScrollRef.current.scrollTop = pagePosition.tableTop; }
        tripsActionsRef.current?.focus({ preventScroll: true });
      }));
    } catch (error) {
      setShiftError(error instanceof TripShiftStalePreviewError || (error instanceof Error && error.name === 'TripShiftStalePreviewError') ? 'Selected trips changed. Discard this review and reopen shift.' : shiftErrorText(error, 'Unable to save the staged shift. Your trips were not changed. Try again.'));
    } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!shiftDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); requestCloseShiftDrawer(); } };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [shiftDrawerOpen, shiftOperations.length]);

  async function assignProfile(nextProfileId: string) {
    if (!selectedPattern || !serviceDayId) return;
    try { await service.assignRuntimeProfile(records.scenario.id, selectedPattern.id, serviceDayId, nextProfileId); onRuntimeChanged(); } catch (error) { onError(error); }
  }
  async function submitRuntimeDialog(name: string, targetPatternId?: string) {
    if (!selectedPattern || !serviceDayId) return;
    try {
      if (runtimeDialog?.mode === 'rename' && selectedProfile) await service.renameRuntimeProfile(selectedProfile.id, name);
      else if (runtimeDialog?.mode === 'new') { const profile = await service.createDefaultRuntimeProfile(selectedPattern, name); await service.assignRuntimeProfile(records.scenario.id, selectedPattern.id, serviceDayId, profile.id); }
      else if (runtimeDialog?.mode === 'copy' && selectedProfile) { const profile = await service.copyRuntimeProfile(selectedProfile.id, name); await service.assignRuntimeProfile(records.scenario.id, selectedPattern.id, serviceDayId, profile.id); }
      else if (runtimeDialog?.mode === 'reverse' && selectedProfile && targetPatternId) { const profile = await service.reverseCopyRuntimeProfile(selectedProfile.id, selectedPattern.id, targetPatternId, name); await service.assignRuntimeProfile(records.scenario.id, targetPatternId, serviceDayId, profile.id); setPatternId(targetPatternId); }
      setRuntimeDialog(undefined); onRuntimeChanged();
    } catch (error) { onError(error); }
  }
  const reverseCandidates = reverseRuntimeCandidates(selectedPattern, patterns);
  async function requestProfileDeletion() { if (!selectedProfile) return; try { const impact = await service.getRuntimeProfileDeletionImpact(selectedProfile.id); setProfileDeletionImpact(impact); setDeleteProfileOpen(true); } catch (error) { onError(error); } }
  async function deleteProfile(replacementProfileId?: string) { if (!selectedProfile || !profileDeletionImpact) return; try { await service.deleteRuntimeProfile(selectedProfile.id, replacementProfileId, profileDeletionImpact.reviewToken); setDeleteProfileOpen(false); setProfileDeletionImpact(undefined); onRuntimeChanged(); } catch (error) { setDeleteProfileOpen(false); setProfileDeletionImpact(undefined); onError(error, 'Unable to delete the runtime profile. Your data was not changed.'); } }
  async function saveDraftTrip() {
    if (!draftTrip?.patternId || !draftTrip.firstTrip.trim()) return;
    try { const firstTrip = parseServiceTime(draftTrip.firstTrip); setBusy(true); const result = await tripService.addTrip({ scenarioId: records.scenario.id, routeId: aggregate.route.id, serviceDayId, directionId, patternId: draftTrip.patternId, tripProfileId, firstTrip }); setDraftTrip(undefined); clearTripShiftHistory(); await loadTrips(); if (result.warnings.length) onError(new TripGenerationError(result.warnings)); } catch (error) { onError(error); } finally { setBusy(false); }
  }
  const changedRuntimeTripIds = new Set(tripsWithChangedRuntimes.map((trip) => trip.id));
  const selectedChangedRuntimeTripIds = selectedTripIds.filter((id) => changedRuntimeTripIds.has(id));
  // The selection bar goes away with the selection, so the focus moves to the Trip actions menu, which is always there.
  async function finishRecalculation() { setRecalculationTripIds([]); setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips(); window.setTimeout(() => tripsActionsRef.current?.focus()); }
  async function undoRegeneration() {
    setBusy(true);
    try { await tripService.undoLastTripRegeneration(); setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips(); }
    catch (error) { onError(error, 'Unable to undo the last regeneration.'); await loadTrips(); }
    finally { setBusy(false); }
  }
  function exportTripsCsv() {
    const safeName = `${aggregate.route.name || 'route'}-${selectedDay?.name || 'service-day'}-${selectedTripProfile?.name || 'trip-profile'}`.replaceAll(/[^a-z0-9]+/gi, '-').replaceAll(/^-|-$/g, '') || 'trips';
    const direction = directions.find((item) => item.id === directionId);
    const nodeName = (nodeId: string) => aggregate.nodes.find((node) => node.id === nodeId)?.shortName || aggregate.nodes.find((node) => node.id === nodeId)?.name || 'Unnamed point';
    const columns = [...(direction?.columns ?? [])].sort((left, right) => left.sequence - right.sequence).map((column) => ({ id: column.id, name: column.labelOverride || nodeName(column.nodeId) }));
    const blockLabels = new Map([...tripBlockByTripId].map(([tripId, block]) => [tripId, block.label]));
    download(`${safeName}-trips.csv`, tripTableCsv({ trips, patterns, directionName: direction?.name ?? '', columns, blockLabels, connections: tripConnections }), 'text/csv;charset=utf-8');
  }
  const parsedShiftSeconds = parseShiftSeconds(shiftMinutes);
  const canShiftSelectedTrips = selectedTripIds.length > 0 && parsedShiftSeconds !== undefined;
  async function requestTripDeletion(tripIds: string[]) {
    try {
      const preview = await tripService.previewTripDeletion(tripIds);
      setTripDeletion({ tripIds: preview.deletedTripIds, affectedBlockIds: preview.affectedBlockIds, reviewToken: preview.reviewToken });
    } catch (error) { onError(error); }
  }
  async function deleteTrips() {
    if (!tripDeletion) return;
    setBusy(true);
    try { await tripService.deleteTrips(tripDeletion.tripIds, tripDeletion.reviewToken); setSelectedTripIds((ids) => ids.filter((id) => !tripDeletion.tripIds.includes(id))); setTripDeletion(undefined); clearTripShiftHistory(); await loadTrips(); window.setTimeout(() => tripsActionsRef.current?.focus()); }
    catch (error) { setTripDeletion(undefined); onError(error); } finally { setBusy(false); }
  }
  async function completeRuntimeCopy() { onRuntimeChanged(); }
  async function requestRouteMethodChange(method: RuntimeCalculationMethod) {
    if (method === routeMethod || runtimeEditorState.dirty) return;
    setRouteMethodChange({ method, busy: false });
    try { const impact = await service.getRouteRuntimeCalculationMethodImpact(aggregate.route.id, method); setRouteMethodChange((current) => current?.method === method ? { ...current, impact } : current); }
    catch (error) { setRouteMethodChange(undefined); onError(error); }
  }
  async function confirmRouteMethodChange() {
    if (!routeMethodChange) return;
    setRouteMethodChange({ ...routeMethodChange, busy: true });
    try { await service.setRouteRuntimeCalculationMethod(aggregate.route.id, routeMethodChange.method); setRouteMethodChange(undefined); onRuntimeChanged(); }
    catch (error) { setRouteMethodChange(undefined); onError(error); }
  }
  function exportRuntimeCsv() {
    if (!selectedProfile) return;
    const safeName = selectedProfile.name.replaceAll(/[^a-z0-9]+/gi, '-').replaceAll(/^-|-$/g, '') || 'runtime-profile';
    download(`${safeName}-runtimes.csv`, runtimeProfileCsv(selectedProfile), 'text/csv;charset=utf-8');
  }
  async function completeTripCopy() { setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips(); }
  function closeRuntimeCopy() { setRuntimeCopyOpen(false); window.setTimeout(() => runtimeCopyButtonRef.current?.focus()); }
  function closeTripCopy() { setTripCopyOpen(false); window.setTimeout(() => tripsActionsRef.current?.focus()); }
  function closeBatchPatternChange() { setBatchPatternChangeOpen(false); window.setTimeout(() => tripsActionsRef.current?.focus()); }
  function closeBuildDrawer() { setBuildOpen(false); window.setTimeout(() => buildTripsButtonRef.current?.focus()); }
  function closeTripPatternChange() { setTripPatternChangeOpen(false); window.setTimeout(() => tripsActionsRef.current?.focus()); }
  /** Opens or closes the Runtimes section and remembers the choice. Closing is refused while the editor has unsaved edits. */
  function setRuntimesSectionOpen(open: boolean) {
    if (!open && (runtimeEditorState.dirty || runtimeEditorState.saving)) return;
    if (!open) setRuntimeEditorState({ dirty: false, saving: false, changeCount: 0 });
    setRuntimesOpen(open); rememberRuntimesOpen(open);
    window.setTimeout(() => (open ? runtimeCopyButtonRef : runtimesToggleRef).current?.focus());
  }
  const selectedTrips = trips.filter((trip) => selectedTripIds.includes(trip.id));
  function selectTripsWithChangedRuntimes() {
    requestShiftScopeChange(() => { selectionAnchorId.current = undefined; setSelectedTripIds(tripsWithChangedRuntimes.map((trip) => trip.id)); });
  }
  function selectTripsBy(request: TripSelectionRequest) {
    requestShiftScopeChange(() => {
      selectionAnchorId.current = undefined;
      const allIds = trips.map((trip) => trip.id);
      if (!('mode' in request)) {
        setSelectedTripIds((current) => request.kind === 'all' ? allIds : request.kind === 'none' ? [] : invertSelection(allIds, current));
        return;
      }
      const matching = tripIdsMatching(trips, request.kind === 'pattern' ? { kind: 'pattern', patternId: request.patternId } : request.kind === 'unassigned' ? { kind: 'unassigned', assignedTripIds: new Set(tripBlockByTripId.keys()) } : { kind: 'runtimeChanged', changedTripIds: changedRuntimeTripIds });
      setSelectedTripIds((current) => combineSelection(current, matching, request.mode));
    });
  }
  function clearTripSelection() { requestShiftScopeChange(() => { selectionAnchorId.current = undefined; setSelectedTripIds([]); }); }
  const runtimeProfileMenu: MenuGroup[] = [
    { label: 'Profiles', items: profiles.map((profile) => ({ id: profile.id, label: profile.name, wrapLabel: true, checked: profile.id === profileId, disabled: loading || tripProfileBusy, onSelect: () => requestScopeChange(() => void assignProfile(profile.id)) })) },
    { items: [
      { id: 'new', label: 'New profile…', disabled: tripProfileBusy, onSelect: () => requestScopeChange(() => setRuntimeDialog({ mode: 'new', initialName: `${selectedPattern?.name ?? 'Pattern'} runtimes` })) },
      { id: 'rename', label: 'Rename profile…', disabled: !selectedProfile || tripProfileBusy, onSelect: () => requestScopeChange(() => { if (selectedProfile) setRuntimeDialog({ mode: 'rename', initialName: selectedProfile.name }); }) },
      { id: 'copy', label: 'Copy profile…', disabled: !selectedProfile || tripProfileBusy, onSelect: () => requestScopeChange(() => { if (selectedProfile) setRuntimeDialog({ mode: 'copy', initialName: `${selectedProfile.name} Copy` }); }) },
      ...(reverseCandidates.length ? [{ id: 'reverse-copy', label: 'Reverse-copy profile…', disabled: !selectedProfile || tripProfileBusy, onSelect: () => requestScopeChange(() => { if (selectedProfile) setRuntimeDialog({ mode: 'reverse', initialName: `${selectedProfile.name} Reverse` }); }) }] : []),
      { id: 'delete', label: 'Delete profile…', destructive: true, disabled: !selectedProfile || tripProfileBusy, onSelect: () => requestScopeChange(() => void requestProfileDeletion()) },
    ] },
  ];
  const tripProfiles = records.tripProfiles ?? [];
  const selectedTripProfile = tripProfiles.find((profile) => profile.id === tripProfileId);
  const tripProfileMenu: MenuGroup[] = [
    { label: 'Profiles', items: tripProfiles.map((profile) => ({ id: profile.id, label: profile.name, checked: profile.id === tripProfileId, disabled: tripProfileBusy, onSelect: () => requestShiftAndDraftScopeChange(() => onTripProfileChange(profile.id)) })) },
    { items: [
      { id: 'rename', label: 'Rename profile…', disabled: !tripProfileId || tripProfileBusy, onSelect: onTripProfileRename },
      { id: 'copy', label: 'Copy profile…', disabled: !tripProfileId || tripProfileBusy, onSelect: onTripProfileCopy },
      { id: 'delete', label: 'Delete profile…', destructive: true, disabled: !tripProfileId || tripProfileBusy, onSelect: onTripProfileDelete },
    ] },
  ];
  const tripBlockingScenarioMenu: MenuGroup[] = [{ label: 'Blocking scenarios', items: [
    ...(!blockingScenarios.length || !tripBlockingScenarioId ? [{ id: 'none', label: 'No blocking scenario', checked: true, disabled: tripProfileBusy, onSelect: () => requestShiftScopeChange(() => setTripBlockingScenarioId('')) }] : []),
    ...blockingScenarios.map((scenario) => ({ id: scenario.id, label: scenario.name, checked: scenario.id === tripBlockingScenarioId, disabled: tripProfileBusy, onSelect: () => requestShiftScopeChange(() => setTripBlockingScenarioId(scenario.id)) })),
  ] }];
  const applicableRegenerationUndo = regenerationUndoApplies(lastRegenerationUndo, records.scenario.id, tripProfileId, trips) ? lastRegenerationUndo : undefined;
  const viewMenu: MenuGroup[] = [{ items: [
    { id: 'show-runtime-bands', label: 'Show runtime bands', checked: showRuntimeBands, kind: 'checkbox', onSelect: () => setShowRuntimeBands((current) => !current) },
    { id: 'show-headways', label: 'Show headways', checked: showHeadways, kind: 'checkbox', onSelect: () => setShowHeadways((current) => !current) },
    { id: 'round-table-times', label: 'Round displayed times', checked: roundDisplayedTimes, kind: 'checkbox', onSelect: () => setRoundDisplayedTimes((current) => !current) },
  ] }];
  // The ⋯ menu holds only what is not a selection command: Undo (Decision 0046: listed only while the saved undo applies, never shown disabled for that reason), service-day copy, and CSV export.
  const tripActionsMenu: MenuGroup[] = [
    ...(applicableRegenerationUndo ? [{ items: [{ id: 'undo-regeneration', label: `Undo last regeneration (${applicableRegenerationUndo.afterTrips.length} trips)`, disabled: busy || tripProfileBusy || shiftOperations.length > 0, title: shiftOperations.length ? 'Discard the staged shift first.' : undefined, onSelect: () => void undoRegeneration() }] }] : []),
    { items: [{ id: 'copy-day', label: 'Copy trips from another day…', disabled: tripProfileBusy || shiftOperations.length > 0, title: shiftOperations.length ? 'Discard the staged shift first.' : undefined, onSelect: () => setTripCopyOpen(true) }] },
    { items: [{ id: 'export-trips-csv', label: 'Export trips CSV', disabled: !trips.length, onSelect: exportTripsCsv }] },
  ];
  const canUnassignSelected = selectedTripIds.some((id) => tripBlockByTripId.has(id));
  // The selection bar. The table draws it above its rows and, compact, above its pinned headings (only one copy is live at a time).
  // Shift (UR-15) is a mode of the selection bar: while it is open the bar holds the shift controls instead of the selection commands.
  // The compact copy, pinned above the fixed headings, keeps the step buttons, the net shift, Discard, and Done.
  const shiftTripCount = shiftPreview?.selectedTripIds.length ?? selectedTripIds.length;
  const renderShiftBar = (compact: boolean) => <div className={compact ? 'selection-bar selection-bar--compact shift-bar' : 'selection-bar shift-bar'} role="toolbar" aria-label="Shift selected trips" data-shift-bar onClickCapture={(event) => { const control = (event.target as HTMLElement).closest('button'); if (control) lastShiftControl.current = control; }}>
    <b className="selection-bar__count">Shift {shiftTripCount} {shiftTripCount === 1 ? 'trip' : 'trips'}</b>
    <button type="button" disabled={!canShiftSelectedTrips || busy || tripProfileBusy} title={parsedShiftSeconds === undefined ? 'Enter a whole number of minutes above 0.' : undefined} onClick={() => void appendStagedShift(-(parsedShiftSeconds ?? 0))}><span aria-hidden="true">← </span>{shiftStepLabel} earlier</button>
    <button type="button" disabled={!canShiftSelectedTrips || busy || tripProfileBusy} title={parsedShiftSeconds === undefined ? 'Enter a whole number of minutes above 0.' : undefined} onClick={() => void appendStagedShift(parsedShiftSeconds ?? 0)}>{shiftStepLabel} later<span aria-hidden="true"> →</span></button>
    {!compact && <fieldset className="shift-step-size" disabled={tripProfileBusy || busy}><legend>Step</legend>{SHIFT_STEP_PRESETS.map((minutes) => <label key={minutes} className="shift-step-preset"><input type="radio" name="shift-step" value={minutes} checked={shiftMinutes.trim() === String(minutes)} onChange={() => setShiftMinutes(String(minutes))} />{minutes}</label>)}<label className="shift-step-other"><input aria-label="Step minutes" type="number" min="1" step="1" inputMode="numeric" value={shiftMinutes} aria-invalid={parsedShiftSeconds === undefined} aria-describedby={parsedShiftSeconds === undefined ? 'shift-step-error' : undefined} onChange={(event) => setShiftMinutes(event.target.value)} /> min</label></fieldset>}
    <span className="shift-net" role="status"><strong>{netShiftLabel}</strong></span>
    {!compact && <><button type="button" disabled={!shiftOperations.length || busy} onClick={() => void undoStagedShift()}>Undo</button><button type="button" disabled={!redoShiftOperations.length || busy} onClick={() => void redoStagedShift()}>Redo</button></>}
    <span className="grow" />
    <button type="button" onClick={() => discardStagedShift()} disabled={busy}>Discard</button>
    <button className="primary" type="button" onClick={() => void completeStagedShift()} disabled={busy || Boolean(shiftError)}>{busy ? 'Saving…' : 'Done'}</button>
    {!compact && parsedShiftSeconds === undefined && <p id="shift-step-error" className="field-error shift-bar__message">Enter a whole number of minutes above 0.</p>}
    {shiftError && <p className="field-error shift-bar__message" role="alert">{shiftError}</p>}
  </div>;
  const renderSelectionBar = (compact: boolean) => shiftDrawerOpen ? renderShiftBar(compact) : selectedTripIds.length > 0 ? <SelectionBar compact={compact} count={selectedTripIds.length} noun="trip" ariaLabel="Selected trips" onClear={clearTripSelection}>
    <button type="button" disabled={busy || tripProfileBusy || shiftDrawerOpen} title={shiftDrawerOpen ? 'The shift drawer is already open.' : undefined} onClick={() => void openShiftDrawer()}>Shift…</button>
    <button type="button" disabled={busy || tripProfileBusy || shiftOperations.length > 0} title={shiftOperations.length ? 'Discard the staged shift first.' : undefined} onClick={() => (selectedTrips.length === 1 ? setTripPatternChangeOpen(true) : setBatchPatternChangeOpen(true))}>Change pattern…</button>
    <button type="button" disabled={busy || tripProfileBusy || shiftOperations.length > 0 || !selectedChangedRuntimeTripIds.length} title={shiftOperations.length ? 'Discard the staged shift first.' : !selectedChangedRuntimeTripIds.length ? 'Select trips with changed runtimes.' : undefined} onClick={() => setRecalculationTripIds([...selectedChangedRuntimeTripIds])}>Regenerate…</button>
    <button type="button" disabled={!selectedBlockingScenario || tripBlockingBlocksBusy || !tripBlockOptions.length || !hasAssignableTripBlock || busy || tripProfileBusy || shiftOperations.length > 0 || shiftDrawerOpen} title={!selectedBlockingScenario ? 'Select a blocking scenario first.' : tripBlockingBlocksBusy ? 'Loading blocks.' : !tripBlockOptions.length ? 'Create a block in the selected blocking scenario first.' : !hasAssignableTripBlock ? 'No blocks can accept trips from the selected route.' : shiftOperations.length || shiftDrawerOpen ? 'Finish or discard the staged shift first.' : undefined} onClick={() => openTripBlockAssignment(selectedTripIds, '', 'actions', tripsActionsRef.current)}>Assign block…</button>
    <button type="button" disabled={!canUnassignSelected || !selectedBlockingScenario || tripBlockingBlocksBusy || busy || tripProfileBusy || shiftOperations.length > 0 || shiftDrawerOpen} title={!canUnassignSelected ? 'Select at least one assigned trip.' : !selectedBlockingScenario ? 'Select a blocking scenario first.' : shiftOperations.length || shiftDrawerOpen ? 'Finish or discard the staged shift first.' : undefined} onClick={() => openTripBlockAssignment(selectedTripIds, '', 'actions', tripsActionsRef.current, 'unassign')}>Unassign…</button>
    <button type="button" className="subtle-danger" disabled={busy || tripProfileBusy || shiftOperations.length > 0} title={shiftOperations.length ? 'Discard the staged shift first.' : undefined} onClick={() => void requestTripDeletion(selectedTripIds)}>Delete…</button>
  </SelectionBar> : null;
  const netShiftSeconds = shiftPreview?.netOffsetSeconds ?? 0;
  const netShiftLabel = formatNetShift(netShiftSeconds);
  const shiftStepLabel = parsedShiftSeconds === undefined ? '—' : `${parsedShiftSeconds / 60} min`;
  if (!directions.length) return <section className="empty-state"><p>Add a direction on the Route tab before defining runtimes or trips.</p></section>;
  if (!patterns.length) return <section className="trips-workspace"><section className="prerequisite"><h1 className="box-heading">Add a pattern on Route</h1><p>Choose a direction, then add a pattern with at least two points before entering runtimes or trips.</p></section></section>;
  return <div className="trips-workspace">
    <h1 className="visually-hidden">Trips and runtimes</h1>
    <section className="work-surface runtimes-surface" aria-label="Runtimes section">
      <header className="work-surface__header">
        <h2 className="work-surface__title"><button type="button" ref={runtimesToggleRef} className="disclosure" aria-expanded={runtimesOpen} aria-controls="runtimes-body" disabled={runtimesOpen && runtimeEditorState.dirty} title={runtimesOpen && runtimeEditorState.dirty ? 'Save or discard runtime edits first' : undefined} onClick={() => setRuntimesSectionOpen(!runtimesOpen)}><span aria-hidden="true" className="disclosure__arrow">{runtimesOpen ? '▾' : '▸'}</span>Runtimes</button></h2>
        <div className="work-surface__actions">
          {runtimesOpen
            ? <ContextField label="Pattern"><select value={patternId} disabled={tripProfileBusy} onChange={(event) => { const next = event.target.value; requestScopeChange(() => setPatternId(next)); }}>{patterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select></ContextField>
            : <button type="button" onClick={() => setRuntimesSectionOpen(true)}>Edit runtimes</button>}
        </div>
      </header>
      {runtimesOpen && <div className="work-surface__body runtimes-body" id="runtimes-body">
      <div className="runtimes-toolbar">
        <MenuButton fieldLabel="Runtime profile" label={selectedProfile?.name ?? 'Select profile'} menuLabel="Runtime profile" groups={runtimeProfileMenu} disabled={loading || tripProfileBusy} menuAlign="start" />
        <MenuButton label="Actions" menuLabel="Runtime actions" groups={[
          { label: 'Calculation method (whole route)', items: [
            { id: 'single-band', label: 'Single band for trip', checked: routeMethod === 'singleBand', disabled: !selectedProfile || runtimeEditorState.dirty || runtimeEditorState.saving || tripProfileBusy, title: runtimeEditorState.dirty ? 'Save or discard runtime edits before changing the method.' : undefined, onSelect: () => void requestRouteMethodChange('singleBand') },
            { id: 'segment-start', label: 'Band at segment start', checked: routeMethod === 'segmentStart', disabled: !selectedProfile || runtimeEditorState.dirty || runtimeEditorState.saving || tripProfileBusy, title: runtimeEditorState.dirty ? 'Save or discard runtime edits before changing the method.' : undefined, onSelect: () => void requestRouteMethodChange('segmentStart') },
            ...(routeMethod === 'blendSegments' ? [{ id: 'legacy-blend', label: 'Legacy continuous blend', checked: true, disabled: true, onSelect: () => {} }] : []),
          ] },
          { label: 'Data', items: [
            { id: 'export-runtime-csv', label: 'Export profile CSV', disabled: !selectedProfile || runtimeEditorState.dirty || runtimeEditorState.saving, title: runtimeEditorState.dirty ? 'Save or discard runtime edits before exporting.' : runtimeEditorState.saving ? 'Wait for runtime changes to finish saving.' : undefined, onSelect: exportRuntimeCsv },
          ] },
          { label: 'Service day', items: [
            { id: 'copy-day', label: 'Copy runtimes from another day…', disabled: loading || tripProfileBusy, onSelect: () => setRuntimeCopyOpen(true) },
          ] },
        ]} disabled={loading || tripProfileBusy} triggerRef={runtimeCopyButtonRef} />
      </div>
      {selectedProfile && <p className="profile-usage">Used by {dayNameList(profileDays.length ? profileDays.map((day) => day.name) : [selectedDay?.name ?? 'this service day'])} for {selectedPattern?.name}.</p>}
      {selectedProfile && selectedPattern ? <RuntimeEditor2 ref={runtimeEditorRef} service={service} profile={selectedProfile} pattern={selectedPattern} nodes={aggregate.nodes} onStateChange={setRuntimeEditorState} onSaved={async () => onRuntimeChanged()} onError={onError} /> : <p className="runtime-status">Loading runtimes…</p>}
      </div>}
      {routeMethodChange && <RouteRuntimeMethodDialog routeName={aggregate.route.name || 'this Route'} method={routeMethodChange.method} impact={routeMethodChange.impact} busy={routeMethodChange.busy} onConfirm={() => void confirmRouteMethodChange()} onClose={() => setRouteMethodChange(undefined)} />}
      {runtimesOpen && runtimeEditorState.dirty && <SaveBar message={runtimeEditorState.changeCount ? `${runtimeEditorState.changeCount} unsaved change${runtimeEditorState.changeCount === 1 ? '' : 's'} in Runtimes` : 'Unsaved changes in Runtimes'} saveLabel={runtimeEditorState.saving ? 'Saving…' : 'Save'} busy={runtimeEditorState.saving || tripProfileBusy} onSave={() => saveRuntimeThen(() => { window.setTimeout(() => runtimeCopyButtonRef.current?.focus()); })} onDiscard={() => { runtimeEditorRef.current?.discard(); window.setTimeout(() => runtimeCopyButtonRef.current?.focus()); }} />}
    </section>
    <WorkSurface title="Trips" count={trips.length} ariaLabel="Trips section" className="trips-surface"
      context={<>
        <MenuButton fieldLabel="Trip profile" label={selectedTripProfile?.name ?? 'Select profile'} menuLabel="Trip profile" groups={tripProfileMenu} disabled={tripProfileBusy || Boolean(tripBlockAssignment)} menuAlign="start" />
        <MenuButton fieldLabel="Blocking scenario" label={selectedBlockingScenario?.name ?? 'No blocking scenario'} menuLabel="Blocking scenario" groups={tripBlockingScenarioMenu} disabled={tripProfileBusy || Boolean(tripBlockAssignment)} menuAlign="start" />
      </>}
      actions={<>
        <MenuButton label="View" menuLabel="View" groups={viewMenu} />
        <button type="button" disabled={Boolean(draftTrip) || tripProfileBusy || shiftOperations.length > 0} title={shiftOperations.length ? 'Discard the staged shift first.' : undefined} onClick={() => setDraftTrip({ patternId: '', firstTrip: '' })}>Add trip</button>
        <button type="button" ref={buildTripsButtonRef} className="primary" disabled={tripProfileBusy || shiftOperations.length > 0 || buildOpen} title={buildOpen ? 'The Build trips drawer is already open.' : shiftOperations.length ? 'Discard the staged shift first.' : undefined} onClick={() => setBuildOpen(true)}>Build trips…</button>
        <MenuButton label="Actions" menuLabel="Trip actions" groups={tripActionsMenu} disabled={tripProfileBusy || Boolean(tripBlockAssignment)} triggerRef={tripsActionsRef} />
      </>}>
      {tripsWithChangedRuntimes.length > 0 && <InlineNote kind="warn"><b>Run times have changed</b> for {tripsWithChangedRuntimes.length} {tripsWithChangedRuntimes.length === 1 ? 'trip' : 'trips'}. <button type="button" className="small" disabled={busy || tripProfileBusy} onClick={selectTripsWithChangedRuntimes}>Select these trips</button></InlineNote>}
      {staleReasons && <InlineNote kind="warn" live>{staleTripNoticeText(staleReasons)}</InlineNote>}
      {tripBlockAssignmentStatus && <InlineNote kind="ok" live>{tripBlockAssignmentStatus}</InlineNote>}
      <ScheduleTable selectionBar={renderSelectionBar} trips={trips} previewTrips={shiftPreview?.shiftedTrips} stagedShiftSeconds={shiftPreview?.netOffsetSeconds} draft={draftTrip} patterns={patterns} direction={directions.find((direction) => directionId === direction.id)!} nodes={aggregate.nodes} runtimeProfiles={activeRuntimeProfiles} showRuntimeBands={showRuntimeBands} showHeadways={showHeadways} roundDisplayedTimes={roundDisplayedTimes} blockAssignments={tripBlockByTripId} tripConnections={tripConnections} blockWarnings={tripBlockWarnings} blockOptions={tripBlockOptions} blockAssignmentDisabled={busy || tripProfileBusy || tripBlockingBlocksBusy || shiftOperations.length > 0 || shiftDrawerOpen || Boolean(tripBlockAssignment)} onAssignBlock={(trip, blockId, trigger) => openTripBlockAssignment([trip.id], blockId, 'pill', trigger)} onUnassignBlock={(trip, trigger) => openTripBlockAssignment([trip.id], '', 'pill', trigger, 'unassign')} selectedIds={selectedTripIds} changedRuntimeTripIds={changedRuntimeTripIds} onToggle={(id, index, shiftKey) => requestShiftScopeChange(() => {
        setSelectedTripIds((current) => {
          const anchorIndex = selectionAnchorId.current ? trips.findIndex((trip) => trip.id === selectionAnchorId.current) : -1;
          if (shiftKey && anchorIndex >= 0) {
            const start = Math.min(anchorIndex, index); const end = Math.max(anchorIndex, index);
            return [...new Set([...current, ...trips.slice(start, end + 1).map((trip) => trip.id)])];
          }
          selectionAnchorId.current = id;
          return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
        });
      })} onSelectAll={(selected) => requestShiftScopeChange(() => { selectionAnchorId.current = undefined; setSelectedTripIds(selected ? trips.map((trip) => trip.id) : []); })} onSelectBy={selectTripsBy} onDelete={(trip) => requestShiftScopeChange(() => void requestTripDeletion([trip.id]))} onDraftChange={setDraftTrip} onDraftSave={() => void saveDraftTrip()} onDraftCancel={() => setDraftTrip(undefined)} busy={busy || tripProfileBusy} />
    </WorkSurface>
    {tripBlockAssignment?.operation === 'assign' && <TripBlockAssignmentDialog draft={tripBlockAssignment} blockingScenarioName={selectedBlockingScenario?.name ?? 'blocking scenario'} serviceDayName={selectedDay?.name ?? 'selected service day'} blocks={dayBlockingBlocks} blockOptions={tripBlockOptions} currentAssignments={tripBlockByTripId} onConfirm={(destinationId) => void confirmTripBlockAssignment(destinationId)} onClose={closeTripBlockAssignment} busy={busy} error={tripBlockAssignmentError} />}
    {tripBlockAssignment?.operation === 'unassign' && <TripBlockUnassignmentDialog draft={tripBlockAssignment} blockingScenarioName={selectedBlockingScenario?.name ?? 'blocking scenario'} serviceDayName={selectedDay?.name ?? 'selected service day'} blocks={dayBlockingBlocks} currentAssignments={tripBlockByTripId} onConfirm={() => void confirmTripBlockAssignment('')} onClose={closeTripBlockAssignment} busy={busy} error={tripBlockAssignmentError} />}
    {runtimeLeave && <RouteNavigationDraftDialog title="Save runtime changes before leaving?" text="The runtime profile has unsaved edits." onCancel={() => setRuntimeLeave(undefined)} onDiscard={() => { const { action, leavesContext } = runtimeLeave; setRuntimeLeave(undefined); runtimeEditorRef.current?.discard(); (leavesContext ? requestShiftAndDraftScopeChange : requestShiftScopeChange)(action); }} onSave={() => { const { action, leavesContext } = runtimeLeave; setRuntimeLeave(undefined); saveRuntimeThen(action, leavesContext); }} />}
    {shiftDiscardAction && <ShiftDiscardDialog onDiscard={() => discardStagedShift(shiftDiscardAction)} onCancel={() => setShiftDiscardAction(undefined)} />}
    {draftTripDiscardAction && <ShiftDiscardDialog title="Discard new trip?" text="The new trip row has not been added. Discard it before leaving this schedule context?" onDiscard={() => { const action = draftTripDiscardAction; setDraftTripDiscardAction(undefined); setDraftTrip(undefined); action(); }} onCancel={() => setDraftTripDiscardAction(undefined)} />}
    {runtimeDialog && <RuntimeProfileDialog2 dialog={runtimeDialog} candidates={reverseCandidates} onSubmit={submitRuntimeDialog} onClose={() => setRuntimeDialog(undefined)} />}
    {deleteProfileOpen && selectedProfile && profileDeletionImpact && <DeleteRuntimeProfileDialog profile={selectedProfile} profiles={profiles} assignmentCount={profileDeletionImpact.assignmentCount} tripCount={profileDeletionImpact.tripCount} onDelete={deleteProfile} onClose={() => { setDeleteProfileOpen(false); setProfileDeletionImpact(undefined); }} />}
    {buildOpen && <BuildTripsDrawer tripService={tripService} scenarioId={records.scenario.id} routeId={aggregate.route.id} serviceDayId={serviceDayId} tripProfileId={tripProfileId} patterns={patterns} profileName={selectedProfile?.name} initialValues={buildValues.current} onValuesChange={(values) => { buildValues.current = values; }} onDone={async () => { buildValues.current = EMPTY_BUILD_VALUES; closeBuildDrawer(); clearTripShiftHistory(); await loadTrips(); }} onClose={closeBuildDrawer} />}
    {tripDeletion && <DeleteTripsDialog tripCount={tripDeletion.tripIds.length} affectedBlockCount={tripDeletion.affectedBlockIds.length} onDelete={() => void deleteTrips()} onClose={() => setTripDeletion(undefined)} busy={busy} />}
    {recalculationTripIds.length > 0 && <RecalculationDialog tripService={tripService} tripIds={recalculationTripIds} trips={trips} patterns={aggregate.patterns} nodes={aggregate.nodes} runtimeProfiles={activeRuntimeProfiles} onDone={finishRecalculation} onClose={() => setRecalculationTripIds([])} />}
    {runtimeCopyOpen && selectedDay && <RuntimeDayCopyDialog tripService={tripService} scenarioId={records.scenario.id} routeId={aggregate.route.id} routeName={aggregate.route.name || 'Untitled route'} targetDay={selectedDay} days={days} patterns={aggregate.patterns.filter(isUsablePattern)} onDone={completeRuntimeCopy} onClose={closeRuntimeCopy} onError={onError} />}
    {tripCopyOpen && selectedDay && <TripDayCopyDialog tripService={tripService} scenarioId={records.scenario.id} routeId={aggregate.route.id} tripProfileId={tripProfileId} routeName={aggregate.route.name || 'Untitled route'} tripProfileName={(records.tripProfiles ?? []).find((profile) => profile.id === tripProfileId)?.name || 'trip profile'} targetDay={selectedDay} days={days} patterns={aggregate.patterns} onDone={completeTripCopy} onClose={closeTripCopy} onError={onError} />}
    {tripPatternChangeOpen && selectedTrips.length === 1 && <TripPatternChangeDialog tripService={tripService} trip={selectedTrips[0]!} directionId={directionId} patterns={patterns} onDone={completeTripCopy} onClose={closeTripPatternChange} />}
    {batchPatternChangeOpen && <BatchPatternChangeDialog tripService={tripService} tripIds={selectedTripIds} patterns={patterns} trips={trips} onDone={completeTripCopy} onClose={closeBatchPatternChange} onError={onError} />}
  </div>;
}

export function blockConnectionWarningMessage(ruleId: string): string {
  const messages: Record<string, string> = {
    'block.connectionOverlap': 'Trips overlap in time.',
    'block.connectionTimesMissing': 'Trip times are incomplete.',
    'block.deadheadDoesNotFit': 'The assigned deadhead does not fit before the next trip.',
    'block.deadheadMissing': 'A deadhead is needed between these trips.',
    'block.deadheadNodeDiscontinuity': 'The deadhead nodes do not connect these trips.',
  };
  return messages[ruleId] ?? 'Review this block connection.';
}
