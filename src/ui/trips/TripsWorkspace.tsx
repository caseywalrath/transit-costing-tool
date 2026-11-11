import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { type BlockingCommands, type BlockingQueries } from '../../application/ports';
import { MenuButton, type MenuGroup } from '../MenuButton';
import { type MenuItem } from '../menuItems';
import { type ContextMenuContent } from '../useContextMenu';
import { CommandButton } from '../shared/CommandButton';
import { patternShortName } from '../../application/shortNames';
import { userFacingError } from '../errorMessages';
import { staleTripNotice, staleTripNoticeText, type StaleTripNotice } from '../staleTripReasons';
import { readStoredRecord, storedText, storedTextMap } from '../preferences';
import { singleFlight } from '../singleFlight';
import { type RouteDefinitionApplication, type ScenarioRecords } from '../../application/routeDefinitionService';
import { TripShiftStalePreviewError, type TripGenerationApplication } from '../../application/tripGenerationService';
import { TripShiftValidationError, type TripShiftPreview } from '../../domain/tripShift';
import { TripGenerationError, type RecalculationPreview } from '../../domain/trips';
import { createBlockingScenarioSourceSignature, formatNetShift, formatShiftStep, isUsablePattern, orderDirections, parseShiftSeconds, regenerationUndoApplies, reverseRuntimeCandidates, routeRuntimeCalculationMethod, sortServiceDays, summarizeTripTable, usableDirectionPatterns, type RuntimeCalculationMethod } from '../../application/tripsWorkspaceView';
import { formatServiceTime, parseServiceTime } from '../../domain/time';
import { type BlockingBlock, type Route, type RouteDefinitionAggregate, type RuntimeAssignment, type RuntimeProfile, type ServiceDayDefinition, type Trip } from '../../domain/types';
import { type BlockConnection } from '../../domain/blocking';
import { runtimeProfileCsv } from '../runtimeProfileCsv';
import { tripTableCsv } from '../../application/tripTableCsv';
import { type RouteNavigationGuard } from '../shared/types';
import { type RuntimeEditorHandle, type RuntimeEditorState, RuntimeEditor2, RouteRuntimeMethodDialog } from './RuntimeEditor';
import { type PlannedFrequencyService, type PlanComparisonResult } from '../../application/plannedFrequencyService';
import { PlanStatusChip } from './PlanStatusChip';
import { type BuildTripsValues, EMPTY_BUILD_VALUES, type NewRuntimeDialog, TripBlockAssignmentDialog, TripBlockUnassignmentDialog, BuildTripsDrawer, RuntimeProfileDialog2, DeleteRuntimeProfileDialog, DeleteTripsDialog, RuntimeDayCopyDialog, SegmentRuntimeDialog, TripDayCopyDialog, StartTimeChangeDialog } from './dialogs';
import { BatchPatternChangeDialog, RecalculationDialog as TripRecalculationDialog, type ReviewContext, TripPatternChangeDialog } from './reviewDialogs';
import { markStrength, markTrips, NO_MARKS } from './changedTrips';
import { ChangedTripsBar, revealFirstMarkedRow } from './ChangedTripsBar';
import { CompareRuntimesDialog } from './CompareRuntimesDialog';
import { type TripBlockAssignmentDraft, type TripBlockOption, type TripSelectionRequest, formatTripTableClock, ScheduleTable } from './ScheduleTable';
import { alternatingFrom, combineSelection, invertSelection, tripIdsMatching } from '../../application/tripSelection';
import { download } from '../shared/download';
import { messages, userMessage } from '../shared/messages';
import { RouteNavigationDraftDialog, ShiftDiscardDialog } from '../shared/dialogs';
import { InlineNote, WorkSurface } from '../shared/surfaces';
import { formatHours, withUnit } from '../format';
import { SaveBar, SelectionBar } from '../shared/bars';
import { ContextField } from '../shared/ContextField';

/** The Trips View options (show runtime bands, headways, rounded times). Not stored: they reset when the Trips tab is drawn again. */
export type TripViewOptions = { showRuntimeBands: boolean; showHeadways: boolean; roundDisplayedTimes: boolean };
export const DEFAULT_VIEW_OPTIONS: TripViewOptions = { showRuntimeBands: false, showHeadways: false, roundDisplayedTimes: false };
/** The View menu's side-by-side item (Decision 0060 item 1). A disabled reason greys it out and is its tooltip. */
export type SideBySideMenuItem = { checked: boolean; disabledReason?: string; onToggle: () => void };

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
const SHIFT_STEP_MESSAGE = 'Enter minutes above 0 in steps of 30 seconds, such as 0:30, 1 or 1.5.';
/** Preset Shift steps in seconds, with the text each puts in the step box and its label. */
export const SHIFT_STEP_PRESETS = [{ seconds: 30, text: '0:30', label: '0:30' }, { seconds: 60, text: '1', label: '1' }, { seconds: 300, text: '5', label: '5' }, { seconds: 600, text: '10', label: '10' }, { seconds: 900, text: '15', label: '15' }] as const;

/** The text for a refused Shift. The domain's generic wording for an invalid request is replaced with a next step. */
export function shiftErrorText(error: unknown, fallback: string) {
  if (error instanceof TripShiftValidationError && !error.findings.some((item) => item.ruleId === 'tripShift.timeBeforeServiceDay')) return 'The selected trips cannot be shifted. Check the selection and try again.';
  return userFacingError(error, fallback);
}

export function TripsWorkspace({ service, tripService, plannedFrequencyService, blockingService, aggregate, records, serviceDayId, directionId, tripProfileId, tripProfileBusy, tripPatternSelections, onTripPatternChange, onTripProfileChange, onTripProfileRename, onTripProfileCopy, onTripProfileDelete, onRegisterNavigationGuard, runtimeVersion, onRuntimeChanged, onError, pane, sharedControls = true, blockingScenarioId: sharedBlockingScenarioId, onBlockingScenarioChange, onBeforeOpenEdit, onOpenEditChange, yieldToken, sharedSlots, viewOptions, onViewOptionsChange, sideBySideMenu, paneContext }: { sharedSlots?: { context: HTMLElement | null; actions: HTMLElement | null }; viewOptions?: TripViewOptions; onViewOptionsChange?: (next: TripViewOptions) => void; sideBySideMenu?: SideBySideMenuItem; paneContext?: ReactNode; service: RouteDefinitionApplication; tripService: TripGenerationApplication; plannedFrequencyService: Pick<PlannedFrequencyService, 'getPlan' | 'previewBuildFromPlan' | 'comparePlan'>; blockingService: BlockingCommands & BlockingQueries; aggregate: RouteDefinitionAggregate; records: ScenarioRecords; serviceDayId: string; directionId: string; tripProfileId: string; tripProfileBusy: boolean; tripPatternSelections: Record<string, string>; onTripPatternChange: (key: string, id: string) => void; onTripProfileChange: (id: string) => void; onTripProfileRename: () => void; onTripProfileCopy: () => void; onTripProfileDelete: () => void; onRegisterNavigationGuard: (guard: RouteNavigationGuard | undefined) => void; runtimeVersion: number; onRuntimeChanged: () => void; onError: (error: unknown, fallback?: string) => void; pane?: { side: 'left' | 'right' }; sharedControls?: boolean; blockingScenarioId?: string; onBlockingScenarioChange?: (id: string) => void; onBeforeOpenEdit?: (start: () => void) => void; onOpenEditChange?: (open: boolean) => void; yieldToken?: number }) {
  const days = sortServiceDays(records.serviceDays);
  const directions = orderDirections(aggregate.directions ?? []);
  // The Trips the last change wrote, marked in the table (Decision 0073). Cleared when the schedule, Route or Scenario changes.
  const [changedMarks, setChangedMarks] = useState(NO_MARKS);
  // R7 (Decision 0073 item 2): after a change, bring the first marked row into view when none is visible. It runs after the reload and after
  // the staged-shift scroll restore (two animation frames), so that restore wins whenever it already shows a marked row.
  const revealedTick = useRef(0);
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
  const visibleTripIds = useMemo(() => new Set(trips.map((trip) => trip.id)), [trips]);
  // Once per change, after the reload has drawn the marked rows.
  useEffect(() => {
    if (!changedMarks.ids.size || revealedTick.current === changedMarks.tick || ![...changedMarks.ids].some((id) => visibleTripIds.has(id))) return;
    const timer = window.setTimeout(() => { revealedTick.current = changedMarks.tick; revealFirstMarkedRow(); }, 150);
    return () => window.clearTimeout(timer);
  }, [changedMarks, visibleTripIds]);
  /** The saved Trips of the Route on the service day, both directions, for the day line under the Trips table (Decision 0051). */
  const [routeDayTrips, setRouteDayTrips] = useState<Trip[]>([]);
  // The comparison with the plan is read again whenever the trips are loaded, so it follows every trip write (Decision 0058 item 6).
  const [planResult, setPlanResult] = useState<PlanComparisonResult>();
  useEffect(() => {
    let current = true;
    if (!serviceDayId || !tripProfileId) { setPlanResult(undefined); return; }
    plannedFrequencyService.comparePlan({ routeId: aggregate.route.id, serviceDayId, tripProfileId }).then((next) => { if (current) setPlanResult(next); }).catch(() => { if (current) setPlanResult(undefined); });
    return () => { current = false; };
  }, [plannedFrequencyService, aggregate.route.id, serviceDayId, tripProfileId, routeDayTrips, runtimeVersion]);
  // A gap outside the plan's tolerance, by the Trip it ends at, for the visible direction's measure-node column.
  const planGaps = (() => {
    const compared = planResult?.directions.find((item) => item.directionId === directionId);
    if (!planResult?.plan || !compared || compared.comparison.measureNodeId === undefined) return undefined;
    const byTripId = new Map<string, { plannedSeconds: number; gapSeconds: number }>();
    for (const period of compared.comparison.periods) {
      const planned = planResult.plan.periods.find((candidate) => candidate.id === period.periodId);
      if (planned) for (const gap of period.gaps) if (!gap.withinTolerance) byTripId.set(gap.toTripId, { plannedSeconds: planned.headwaySeconds, gapSeconds: gap.seconds });
    }
    return { nodeId: compared.comparison.measureNodeId, byTripId };
  })();
  const [lastRegenerationUndo, setLastRegenerationUndo] = useState<import('../../domain/types').TripRegenerationUndo>();
  const [tripsWithChangedRuntimes, setTripsWithChangedRuntimes] = useState<Trip[]>([]);
  const [staleReasons, setStaleReasons] = useState<StaleTripNotice>();
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [tripDeletion, setTripDeletion] = useState<{ tripIds: string[]; affectedBlockIds: string[]; reviewToken: string }>();
  const [recalculationTripIds, setRecalculationTripIds] = useState<string[]>([]);
  const [buildOpen, setBuildOpen] = useState(false);
  const [draftTrip, setDraftTrip] = useState<{ patternId: string; firstTrip: string }>();
  const [shiftMinutes, setShiftMinutes] = useState('1');
  const [startTimeReview, setStartTimeReview] = useState<{ preview: RecalculationPreview; patternName: string; fromSeconds: number; toSeconds: number }>();
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
  // The View options. Side by side shares them between the panes (Decision 0060 item 7), so the container may own them.
  const [ownViewOptions, setOwnViewOptions] = useState<TripViewOptions>(DEFAULT_VIEW_OPTIONS);
  const shownViewOptions = viewOptions ?? ownViewOptions;
  const toggleViewOption = (key: keyof TripViewOptions) => {
    const next = { ...shownViewOptions, [key]: !shownViewOptions[key] };
    if (onViewOptionsChange) onViewOptionsChange(next); else setOwnViewOptions(next);
  };
  const { showRuntimeBands, showHeadways, roundDisplayedTimes } = shownViewOptions;
  const [busy, setBusy] = useState(false);
  const [runtimeCopyOpen, setRuntimeCopyOpen] = useState(false);
  const [segmentRuntimeDialog, setSegmentRuntimeDialog] = useState<'copy' | 'fill'>();
  const [compareOpen, setCompareOpen] = useState(false);
  const [routeMethodChange, setRouteMethodChange] = useState<{ method: RuntimeCalculationMethod; impact?: { profileCount: number; tripCount: number }; busy: boolean }>();
  const [tripCopyOpen, setTripCopyOpen] = useState(false);
  const [batchPatternChangeOpen, setBatchPatternChangeOpen] = useState(false);
  const [tripPatternChangeOpen, setTripPatternChangeOpen] = useState(false);
  const [runtimesOpenStored, setRuntimesOpen] = useState(storedRuntimesOpen);
  // A side-by-side pane never draws Runtimes (Decision 0060 item 6).
  const runtimesOpen = !pane && runtimesOpenStored;
  const [blockingScenarios, setBlockingScenarios] = useState<import('../../domain/types').BlockingScenario[]>([]);
  // Side by side shares one blocking scenario between the panes (Decision 0060 item 7): the container owns the choice and passes it down.
  const [ownBlockingScenarioId, setOwnBlockingScenarioId] = useState('');
  const tripBlockingScenarioId = sharedBlockingScenarioId ?? ownBlockingScenarioId;
  const setTripBlockingScenarioId = (next: string | ((current: string) => string)) => {
    const value = typeof next === 'function' ? next(tripBlockingScenarioId) : next;
    if (onBlockingScenarioChange) onBlockingScenarioChange(value); else setOwnBlockingScenarioId(value);
  };
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
  const workspaceRootRef = useRef<HTMLDivElement>(null);
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
    if (!serviceDayId || !directionId) { setTrips([]); setRouteDayTrips([]); setTripsWithChangedRuntimes([]); setStaleReasons(undefined); setLastRegenerationUndo(await tripService.getLastTripRegenerationUndo()); return; }
    try {
      const [nextTrips, nextStale, undo, nextRouteDayTrips] = await Promise.all([tripService.listScheduleTrips(serviceDayId, directionId, tripProfileId), tripService.inspectStaleTrips(serviceDayId, tripProfileId), tripService.getLastTripRegenerationUndo(), tripService.listRouteDayTrips(aggregate.route.id, serviceDayId, tripProfileId)]);
      const shownTripIds = new Set(nextTrips.map((item) => item.id));
      setTrips(nextTrips); setRouteDayTrips(nextRouteDayTrips); setTripsWithChangedRuntimes(nextStale.trips.filter((trip) => shownTripIds.has(trip.id))); setStaleReasons(staleTripNotice(nextStale.findings, shownTripIds, userMessage)); setLastRegenerationUndo(undo);
    } catch (error) { onError(error); }
  }
  useEffect(() => { void loadRuntime(); }, [aggregate.route.id, selectedPattern?.id, serviceDayId, records.scenario.id, runtimeVersion]);
  function clearTripShiftHistory() { setShiftDrawerOpen(false); setShiftOperations([]); setRedoShiftOperations([]); setShiftPreview(undefined); setShiftError(''); }
  useEffect(() => { setDraftTrip(undefined); }, [serviceDayId, directionId, tripProfileId]);
  useEffect(() => { setSelectedTripIds([]); selectionAnchorId.current = undefined; setBuildOpen(false); setChangedMarks(NO_MARKS); clearTripShiftHistory(); void loadTrips(); }, [serviceDayId, directionId, tripProfileId, runtimeVersion]);
  useEffect(() => { setChangedMarks(NO_MARKS); }, [aggregate.route.id, records.scenario.id]);
  useEffect(() => { tripsTableScrollRef.current = workspaceRootRef.current?.querySelector<HTMLDivElement>('.schedule-table') ?? null; }, [trips.length, directionId]);
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
  // Totals of the saved Trips: the shown schedule, and the Route's whole day. Layover and deadhead follow the table cells (Decision 0051).
  const assignedTripIds = new Set(tripBlockByTripId.keys());
  const connectionsForTotals = tripBlockingScenarioId ? tripConnections : undefined;
  const tableTotals = summarizeTripTable(trips, connectionsForTotals, assignedTripIds);
  const dayTotals = summarizeTripTable(routeDayTrips, connectionsForTotals, assignedTripIds);
  const hoursText = (seconds: number) => withUnit(formatHours(seconds / 3600, 'daily'), 'h');
  const dayLine = dayTotals.tripCount === 0 || !selectedDay ? undefined
    : `${selectedDay.name}, both directions: ${dayTotals.tripCount} ${dayTotals.tripCount === 1 ? 'trip' : 'trips'} · running ${hoursText(dayTotals.runningSeconds)}${dayTotals.layoverSeconds === undefined ? '' : ` · layover ${hoursText(dayTotals.layoverSeconds)} · deadhead between trips ${hoursText(dayTotals.deadheadSeconds ?? 0)}`}`;

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
  /** Starts an open edit (Add-trip row, staged Shift, Build trips). Side by side first settles an open edit in the other pane (Decision 0060 item 14). */
  const startOpenEdit = (start: () => void) => { if (onBeforeOpenEdit) onBeforeOpenEdit(start); else start(); };
  const holdsOpenEdit = draftTripEntered || shiftDrawerOpen || buildOpen;
  useEffect(() => { onOpenEditChange?.(holdsOpenEdit); }, [holdsOpenEdit]);
  // The other pane started an open edit: a Build trips drawer here closes without a question, as it does on any scope change.
  const yieldSeen = useRef(yieldToken);
  useEffect(() => {
    if (yieldSeen.current === yieldToken) return;
    yieldSeen.current = yieldToken;
    setBuildOpen(false);
    if (!shiftOperations.length) clearTripShiftHistory();
  }, [yieldToken]);
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
  /** `tripIds` is given when a row's context menu has just made that Trip the only selection, before the state reaches this closure. */
  async function openShiftDrawer(tripIds: string[] = selectedTripIds) {
    if (!tripIds.length) return;
    setShiftDrawerOpen(true); setShiftOperations([]); setRedoShiftOperations([]); setShiftError('');
    try {
      setBusy(true);
      setShiftPreview(await tripService.previewStagedTripShift(shiftRequest(0, [...tripIds])));
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
  /** Applies the staged shift. Resolves true when it was applied or there was nothing to apply, false when the save failed. */
  async function completeStagedShift(): Promise<boolean> {
    if (!shiftPreview) return true;
    if (!shiftOperations.length || shiftPreview.netOffsetSeconds === 0) { setSelectedTripIds([]); discardStagedShift(); return true; }
    setBusy(true);
    const pagePosition = { left: window.scrollX, top: window.scrollY, tableLeft: tripsTableScrollRef.current?.scrollLeft ?? 0, tableTop: tripsTableScrollRef.current?.scrollTop ?? 0 };
    try {
      const shifted = await tripService.applyStagedTripShift(shiftPreview);
      setChangedMarks((previous) => markTrips(previous, shifted.shiftedTrips.map((trip) => trip.id)));
      setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips();
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.scrollTo({ left: pagePosition.left, top: pagePosition.top, behavior: 'auto' });
        if (tripsTableScrollRef.current) { tripsTableScrollRef.current.scrollLeft = pagePosition.tableLeft; tripsTableScrollRef.current.scrollTop = pagePosition.tableTop; }
        tripsActionsRef.current?.focus({ preventScroll: true });
      }));
      return true;
    } catch (error) {
      setShiftError(error instanceof TripShiftStalePreviewError || (error instanceof Error && error.name === 'TripShiftStalePreviewError') ? 'Selected trips changed. Discard this review and reopen shift.' : shiftErrorText(error, 'Unable to save the staged shift. Your trips were not changed. Try again.'));
      return false;
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
  // Decision 0049. The service keeps the one level of undo in memory; every runtime write calls `onRuntimeChanged`, which renders this again.
  const segmentUndo = service.getSegmentRuntimeUndo();
  const segmentUndoApplies = segmentUndo?.routeId === aggregate.route.id;
  const segmentActionsUnavailable = !selectedProfile || tripProfileBusy || aggregate.patterns.length < 2;
  async function undoSegmentRuntimes() { try { await service.undoSegmentRuntimePlan(); } catch (error) { onError(error); } onRuntimeChanged(); }
  async function requestProfileDeletion() { if (!selectedProfile) return; try { const impact = await service.getRuntimeProfileDeletionImpact(selectedProfile.id); setProfileDeletionImpact(impact); setDeleteProfileOpen(true); } catch (error) { onError(error); } }
  async function deleteProfile(replacementProfileId?: string) { if (!selectedProfile || !profileDeletionImpact) return; try { await service.deleteRuntimeProfile(selectedProfile.id, replacementProfileId, profileDeletionImpact.reviewToken); setDeleteProfileOpen(false); setProfileDeletionImpact(undefined); onRuntimeChanged(); } catch (error) { setDeleteProfileOpen(false); setProfileDeletionImpact(undefined); onError(error, 'Unable to delete the runtime profile. Your data was not changed.'); } }
  /** Adds the new Trip row. Resolves true when it was added, false when the row is incomplete or the save failed. */
  async function saveDraftTrip(): Promise<boolean> {
    if (!draftTrip?.patternId || !draftTrip.firstTrip.trim()) return false;
    try { const firstTrip = parseServiceTime(draftTrip.firstTrip); setBusy(true); const result = await tripService.addTrip({ scenarioId: records.scenario.id, routeId: aggregate.route.id, serviceDayId, directionId, patternId: draftTrip.patternId, tripProfileId, firstTrip }); setChangedMarks((previous) => markTrips(previous, [result.trip.id])); setDraftTrip(undefined); clearTripShiftHistory(); await loadTrips(); if (result.warnings.length) onError(new TripGenerationError(result.warnings)); return true; } catch (error) { onError(error); return false; } finally { setBusy(false); }
  }
  const changedRuntimeTripIds = new Set(tripsWithChangedRuntimes.map((trip) => trip.id));
  const selectedChangedRuntimeTripIds = selectedTripIds.filter((id) => changedRuntimeTripIds.has(id));
  // The selection bar goes away with the selection, so the focus moves to the Trip actions menu, which is always there.
  async function finishRecalculation(changedTripIds: string[] = []) { setRecalculationTripIds([]); setChangedMarks((previous) => markTrips(previous, changedTripIds)); setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips(); window.setTimeout(() => tripsActionsRef.current?.focus()); }
  /**
   * A planner edits a Trip's first time. The Trip is recalculated around the new time, as when adding a Trip, with Regenerate's review and undo.
   * Resolves to a message when the time is refused, or nothing when the change was made or is waiting for the planner's review.
   */
  async function changeTripStartTime(trip: Trip, pointId: string, text: string): Promise<string | undefined> {
    let toSeconds: number;
    try { toSeconds = parseServiceTime(text); } catch { return 'Enter a time such as 8:35 or 8:35:30.'; }
    const fromSeconds = trip.stopTimes.find((point) => point.patternPointId === pointId)?.time;
    if (fromSeconds === undefined || fromSeconds === toSeconds) return undefined;
    try {
      const preview = await tripService.previewRecalculateTrips([trip.id], { [trip.id]: pointId }, {}, { [trip.id]: toSeconds });
      if (preview.impact.blockIds.length > 0 || preview.findings.length > 0) {
        setStartTimeReview({ preview, patternName: aggregate.patterns.find((item) => item.id === trip.patternId)?.name ?? 'Trip', fromSeconds, toSeconds });
        return undefined;
      }
      await applyStartTimeChange(preview);
      return undefined;
    } catch (error) {
      if (error instanceof TripGenerationError) return [...new Set(error.findings.map((finding) => userMessage(finding)))].join(' ') || 'That start time cannot be used.';
      return error instanceof Error ? error.message : 'That start time cannot be used.';
    }
  }
  async function applyStartTimeChange(preview: RecalculationPreview) {
    setBusy(true);
    try { const applied = await tripService.applyRecalculationPreview(preview, true); setChangedMarks((previous) => markTrips(previous, applied.trips.map((trip) => trip.id))); setStartTimeReview(undefined); clearTripShiftHistory(); await loadTrips(); }
    catch (error) { setStartTimeReview(undefined); onError(error, 'Unable to change the start time.'); await loadTrips(); }
    finally { setBusy(false); }
  }
  async function undoRegeneration() {
    setBusy(true);
    try { const restored = await tripService.undoLastTripRegeneration(); setChangedMarks((previous) => markTrips(previous, restored.map((trip) => trip.id))); setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips(); }
    catch (error) { onError(error, 'Unable to undo the last change.'); await loadTrips(); }
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
  async function completeTripCopy(changedTripIds: string[] = []) { setChangedMarks((previous) => markTrips(previous, changedTripIds)); setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips(); }
  // Trip day copy writes Trips too; its rows are not marked (Decision 0073).
  async function completeTripDayCopy() { setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips(); }
  function closeRuntimeCopy() { setRuntimeCopyOpen(false); window.setTimeout(() => runtimeCopyButtonRef.current?.focus()); }
  function closeTripCopy() { setTripCopyOpen(false); window.setTimeout(() => tripsActionsRef.current?.focus()); }
  function closeBatchPatternChange() { setBatchPatternChangeOpen(false); window.setTimeout(() => tripsActionsRef.current?.focus()); }
  function closeBuildDrawer() { setBuildOpen(false); window.setTimeout(() => buildTripsButtonRef.current?.focus()); }
  function closeTripPatternChange() { setTripPatternChangeOpen(false); window.setTimeout(() => tripsActionsRef.current?.focus()); }
  /** Shared by the Regenerate and Change pattern reviews (R5). "Open runtimes" closes the review and opens the Runtimes section. */
  const reviewContext: ReviewContext = {
    patterns, nodes: aggregate.nodes, directionName: directions.find((direction) => direction.id === directionId)?.name, serviceDayName: selectedDay?.name,
    blockLabels: new Map([...tripBlockByTripId].map(([tripId, block]) => [tripId, `Block ${block.label}`])),
    onOpenRuntimes: () => { setRecalculationTripIds([]); setTripPatternChangeOpen(false); setBatchPatternChangeOpen(false); setRuntimesSectionOpen(true); },
  };
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
        if (request.kind === 'alternate') {
          // Decision 0069: the one selected Trip and every second shown Trip below it. The starting Trip becomes the Shift-click anchor.
          setSelectedTripIds((current) => {
            const alternating = current.length === 1 ? alternatingFrom(allIds, current[0]) : [];
            selectionAnchorId.current = alternating[0];
            return alternating;
          });
          return;
        }
        setSelectedTripIds((current) => request.kind === 'all' ? allIds : request.kind === 'none' ? [] : invertSelection(allIds, current));
        return;
      }
      const matching = tripIdsMatching(trips, request.kind === 'pattern' ? { kind: 'pattern', patternId: request.patternId } : request.kind === 'unassigned' ? { kind: 'unassigned', assignedTripIds: new Set(tripBlockByTripId.keys()) } : { kind: 'runtimeChanged', changedTripIds: changedRuntimeTripIds });
      setSelectedTripIds((current) => combineSelection(current, matching, request.mode));
    });
  }
  /** A row checkbox's toggle: Shift extends from the anchor; otherwise the Trip is added or removed and becomes the anchor. */
  function toggleTrip(id: string, index: number, shiftKey: boolean) {
    requestShiftScopeChange(() => {
      setSelectedTripIds((current) => {
        const anchorIndex = selectionAnchorId.current ? trips.findIndex((trip) => trip.id === selectionAnchorId.current) : -1;
        if (shiftKey && anchorIndex >= 0) {
          const start = Math.min(anchorIndex, index); const end = Math.max(anchorIndex, index);
          return [...new Set([...current, ...trips.slice(start, end + 1).map((trip) => trip.id)])];
        }
        selectionAnchorId.current = id;
        return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      });
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
    { id: 'show-runtime-bands', label: 'Show runtime bands', checked: showRuntimeBands, kind: 'checkbox', onSelect: () => toggleViewOption('showRuntimeBands') },
    { id: 'show-headways', label: 'Show headways', checked: showHeadways, kind: 'checkbox', onSelect: () => toggleViewOption('showHeadways') },
    { id: 'round-table-times', label: 'Round displayed times', checked: roundDisplayedTimes, kind: 'checkbox', onSelect: () => toggleViewOption('roundDisplayedTimes') },
  ] },
  // Decision 0060 item 1. Turning side by side on or off draws the Trips again, so the single table first asks about its open edits and Runtimes;
  // a pane's item is answered by the side-by-side container, which asks both panes.
  ...(sideBySideMenu ? [{ items: [{ id: 'side-by-side', label: 'Show both directions side by side', checked: sideBySideMenu.checked, kind: 'checkbox' as const, disabled: Boolean(sideBySideMenu.disabledReason), title: sideBySideMenu.disabledReason, onSelect: () => { if (pane) sideBySideMenu.onToggle(); else requestContextChange(sideBySideMenu.onToggle); } }] }] : [])];
  // What the Trips header shares across directions: in side by side the left pane draws it into the container's header (Decision 0060 item 7).
  // The plan status chip covers every direction of the Route, so it is shared too.
  const sharedContext = <>
    <MenuButton fieldLabel="Trip profile" label={selectedTripProfile?.name ?? 'Select profile'} menuLabel="Trip profile" groups={tripProfileMenu} disabled={tripProfileBusy || Boolean(tripBlockAssignment)} menuAlign="start" />
    <PlanStatusChip result={planResult} nodes={aggregate.nodes} />
    <MenuButton fieldLabel="Blocking scenario" label={selectedBlockingScenario?.name ?? 'No blocking scenario'} menuLabel="Blocking scenario" groups={tripBlockingScenarioMenu} disabled={tripProfileBusy || Boolean(tripBlockAssignment)} menuAlign="start" />
  </>;
  const viewButton = <MenuButton label="View" menuLabel="View" groups={viewMenu} />;
  const paneDirection = directions.find((direction) => direction.id === directionId);
  // A pane's subtitle names its first and last timepoints, so two panes read as the two ends of the same Route.
  const paneEnds = (() => {
    const columns = [...(paneDirection?.columns ?? [])].sort((left, right) => left.sequence - right.sequence);
    const name = (column?: typeof columns[number]) => column ? column.labelOverride || aggregate.nodes.find((node) => node.id === column.nodeId)?.shortName || aggregate.nodes.find((node) => node.id === column.nodeId)?.name || '' : '';
    return columns.length > 1 ? `${name(columns[0])} → ${name(columns.at(-1))}` : undefined;
  })();
  // The ⋯ menu holds only what is not a selection command: Undo (Decision 0046: listed only while the saved undo applies, never shown disabled for that reason), service-day copy, and CSV export.
  const tripActionsMenu: MenuGroup[] = [
    ...(applicableRegenerationUndo ? [{ items: [{ id: 'undo-regeneration', label: `${applicableRegenerationUndo.kind === 'patternChange' ? 'Undo last pattern change' : 'Undo last regeneration'} (${applicableRegenerationUndo.afterTrips.length} trips)`, disabled: busy || tripProfileBusy || shiftOperations.length > 0, title: shiftOperations.length ? 'Discard the staged shift first.' : undefined, onSelect: () => void undoRegeneration() }] }] : []),
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
    <button type="button" disabled={!canShiftSelectedTrips || busy || tripProfileBusy} title={parsedShiftSeconds === undefined ? SHIFT_STEP_MESSAGE : undefined} onClick={() => void appendStagedShift(-(parsedShiftSeconds ?? 0))}><span aria-hidden="true">← </span>{shiftStepLabel} earlier</button>
    <button type="button" disabled={!canShiftSelectedTrips || busy || tripProfileBusy} title={parsedShiftSeconds === undefined ? SHIFT_STEP_MESSAGE : undefined} onClick={() => void appendStagedShift(parsedShiftSeconds ?? 0)}>{shiftStepLabel} later<span aria-hidden="true"> →</span></button>
    <fieldset className="shift-step-size" disabled={tripProfileBusy || busy}><legend>Step</legend>{SHIFT_STEP_PRESETS.map((preset) => <label key={preset.seconds} className="shift-step-preset"><input type="radio" name={compact ? 'shift-step-pinned' : 'shift-step'} value={preset.seconds} checked={parsedShiftSeconds === preset.seconds} onChange={() => setShiftMinutes(preset.text)} />{preset.label}</label>)}<label className="shift-step-other"><input aria-label={compact ? 'Step minutes (pinned bar)' : 'Step minutes'} type="text" inputMode="decimal" value={shiftMinutes} aria-invalid={parsedShiftSeconds === undefined} aria-describedby={parsedShiftSeconds === undefined ? (compact ? 'shift-step-error-pinned' : 'shift-step-error') : undefined} onChange={(event) => setShiftMinutes(event.target.value)} /> min</label></fieldset>
    <span className="shift-net" role="status"><strong>{netShiftLabel}</strong></span>
    <button type="button" disabled={!shiftOperations.length || busy} onClick={() => void undoStagedShift()}>Undo</button><button type="button" disabled={!redoShiftOperations.length || busy} onClick={() => void redoStagedShift()}>Redo</button>
    <span className="grow" />
    <button type="button" onClick={() => discardStagedShift()} disabled={busy}>Discard</button>
    <button className="primary" type="button" onClick={() => void completeStagedShift()} disabled={busy || Boolean(shiftError)}>{busy ? 'Saving…' : 'Done'}</button>
    {parsedShiftSeconds === undefined && <p id={compact ? 'shift-step-error-pinned' : 'shift-step-error'} className="field-error shift-bar__message">{SHIFT_STEP_MESSAGE}</p>}
    {shiftError && <p className="field-error shift-bar__message" role="alert">{shiftError}</p>}
  </div>;
  // The selection commands (Decision 0066 rule 5): the selection bar's buttons and a selected row's context menu use this one list.
  const assignBlockDisabled = !selectedBlockingScenario || tripBlockingBlocksBusy || !tripBlockOptions.length || !hasAssignableTripBlock || busy || tripProfileBusy || shiftOperations.length > 0 || shiftDrawerOpen;
  const assignBlockTitle = !selectedBlockingScenario ? 'Select a blocking scenario first.' : tripBlockingBlocksBusy ? 'Loading blocks.' : !tripBlockOptions.length ? 'Create a block in the selected blocking scenario first.' : !hasAssignableTripBlock ? 'No blocks can accept trips from the selected route.' : shiftOperations.length || shiftDrawerOpen ? 'Finish or discard the staged shift first.' : undefined;
  const unassignDisabled = (canUnassign: boolean) => !canUnassign || !selectedBlockingScenario || tripBlockingBlocksBusy || busy || tripProfileBusy || shiftOperations.length > 0 || shiftDrawerOpen;
  const unassignTitle = (canUnassign: boolean, none: string) => !canUnassign ? none : !selectedBlockingScenario ? 'Select a blocking scenario first.' : shiftOperations.length || shiftDrawerOpen ? 'Finish or discard the staged shift first.' : undefined;
  const shiftDisabled = busy || tripProfileBusy || shiftDrawerOpen;
  const shiftTitle = shiftDrawerOpen ? 'The shift drawer is already open.' : undefined;
  const stagedLockDisabled = busy || tripProfileBusy || shiftOperations.length > 0;
  const stagedLockTitle = shiftOperations.length ? 'Discard the staged shift first.' : undefined;
  const selectionCommands: MenuItem[] = [
    { id: 'shift', label: 'Shift…', disabled: shiftDisabled, title: shiftTitle, onSelect: () => startOpenEdit(() => void openShiftDrawer()) },
    { id: 'change-pattern', label: 'Change pattern…', disabled: stagedLockDisabled, title: stagedLockTitle, onSelect: () => (selectedTrips.length === 1 ? setTripPatternChangeOpen(true) : setBatchPatternChangeOpen(true)) },
    { id: 'regenerate', label: 'Regenerate…', disabled: stagedLockDisabled || !selectedChangedRuntimeTripIds.length, title: shiftOperations.length ? 'Discard the staged shift first.' : !selectedChangedRuntimeTripIds.length ? 'Select trips with changed runtimes.' : undefined, onSelect: () => setRecalculationTripIds([...selectedChangedRuntimeTripIds]) },
    { id: 'assign-block', label: 'Assign block…', disabled: assignBlockDisabled, title: assignBlockTitle, onSelect: () => openTripBlockAssignment(selectedTripIds, '', 'actions', tripsActionsRef.current) },
    { id: 'unassign-block', label: 'Unassign…', disabled: unassignDisabled(canUnassignSelected), title: unassignTitle(canUnassignSelected, 'Select at least one assigned trip.'), onSelect: () => openTripBlockAssignment(selectedTripIds, '', 'actions', tripsActionsRef.current, 'unassign') },
    { id: 'delete', label: 'Delete…', destructive: true, disabled: stagedLockDisabled, title: stagedLockTitle, onSelect: () => void requestTripDeletion(selectedTripIds) },
  ];
  const renderSelectionBar = (compact: boolean) => shiftDrawerOpen ? renderShiftBar(compact) : selectedTripIds.length === 0 && markStrength(changedMarks) === 'steady' ? <ChangedTripsBar marks={changedMarks} visibleTripIds={visibleTripIds} onSelect={(ids) => requestShiftScopeChange(() => { selectionAnchorId.current = undefined; setSelectedTripIds(ids); })} onClear={() => setChangedMarks(NO_MARKS)} /> : selectedTripIds.length > 0 ?<SelectionBar compact={compact} count={selectedTripIds.length} noun="trip" ariaLabel="Selected trips" onClear={clearTripSelection}>
    {selectionCommands.map((item) => <CommandButton key={item.id} item={item} />)}
  </SelectionBar> : null;
  // A Trip row's context menu (Decision 0066 item 8). A selected row acts on the selection; an unselected row acts on that Trip only and
  // leaves the selection as it is, except Change pattern… and Shift…, which first make that Trip the only selection.
  const selectOnly = (tripId: string) => { selectionAnchorId.current = tripId; setSelectedTripIds([tripId]); };
  const rowContextMenu = (trip: Trip, selected: boolean, editStartTime: (() => void) | undefined): ContextMenuContent | undefined => {
    if (shiftDrawerOpen) return undefined;
    if (selected) return { heading: `${selectedTripIds.length} selected ${selectedTripIds.length === 1 ? 'trip' : 'trips'}`, groups: [{ items: selectionCommands }, { items: [{ id: 'clear', label: 'Clear selection', onSelect: clearTripSelection }] }] };
    const pattern = patterns.find((item) => item.id === trip.patternId);
    const direction = directions.find((item) => item.id === directionId);
    const chip = patternShortName(pattern, direction?.name ?? '', new Map(aggregate.nodes.map((node) => [node.id, node])));
    const start = trip.stopTimes[0]?.time;
    const heading = start === undefined ? chip : `${chip} ${formatTripTableClock(start, roundDisplayedTimes)}`;
    const index = trips.findIndex((item) => item.id === trip.id);
    const assigned = tripBlockByTripId.has(trip.id);
    return { heading, groups: [
      { label: 'Select', items: [
        { id: 'add-to-selection', label: 'Add to selection', disabled: busy || tripProfileBusy, onSelect: () => toggleTrip(trip.id, index, false) },
        { id: 'select-only', label: 'Select only this trip', disabled: busy || tripProfileBusy, onSelect: () => requestShiftScopeChange(() => selectOnly(trip.id)) },
        ...(pattern ? [{ id: 'select-pattern', label: `Select all on ${chip}`, disabled: busy || tripProfileBusy, onSelect: () => selectTripsBy({ kind: 'pattern', patternId: pattern.id, mode: 'replace' }) }] : []),
      ] },
      { label: 'Edit', items: [
        { id: 'edit-start', label: 'Edit start time', disabled: !editStartTime, title: editStartTime ? undefined : stagedLockTitle, onSelect: () => editStartTime?.() },
        { id: 'change-pattern', label: 'Change pattern…', disabled: stagedLockDisabled, title: stagedLockTitle, onSelect: () => requestShiftScopeChange(() => { selectOnly(trip.id); setTripPatternChangeOpen(true); }) },
        { id: 'shift', label: 'Shift…', disabled: shiftDisabled, title: shiftTitle, onSelect: () => requestShiftScopeChange(() => { selectOnly(trip.id); startOpenEdit(() => void openShiftDrawer([trip.id])); }) },
        ...(changedRuntimeTripIds.has(trip.id) ? [{ id: 'regenerate', label: 'Regenerate…', disabled: stagedLockDisabled, title: stagedLockTitle, onSelect: () => setRecalculationTripIds([trip.id]) }] : []),
      ] },
      { label: 'Block', items: [
        { id: 'assign-block', label: 'Assign block…', disabled: assignBlockDisabled, title: assignBlockTitle, onSelect: () => openTripBlockAssignment([trip.id], '', 'actions', null) },
        ...(assigned ? [{ id: 'unassign-block', label: 'Unassign from block', disabled: unassignDisabled(true), title: unassignTitle(true, ''), onSelect: () => openTripBlockAssignment([trip.id], '', 'actions', null, 'unassign') }] : []),
      ] },
      { items: [{ id: 'delete', label: 'Delete trip…', destructive: true, disabled: busy || tripProfileBusy, onSelect: () => requestShiftScopeChange(() => void requestTripDeletion([trip.id])) }] },
    ] };
  };
  const netShiftSeconds = shiftPreview?.netOffsetSeconds ?? 0;
  const netShiftLabel = formatNetShift(netShiftSeconds);
  const shiftStepLabel = parsedShiftSeconds === undefined ? '—' : formatShiftStep(parsedShiftSeconds);
  if (!directions.length) return <section className="empty-state"><p>Add a direction on the Route tab before defining runtimes or trips.</p></section>;
  if (!patterns.length) return <section className="trips-workspace"><section className="prerequisite"><h1 className="box-heading">Add a pattern on Route</h1><p>Choose a direction, then add a pattern with at least two points before entering runtimes or trips.</p></section></section>;
  return <div className={pane ? 'trips-pane-host' : 'trips-workspace'} ref={workspaceRootRef}>
    {!pane && <h1 className="visually-hidden">Trips and runtimes</h1>}
    {!pane && <section className="work-surface runtimes-surface" aria-label="Runtimes section">
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
          { label: 'Other patterns', items: [
            { id: 'copy-segments', label: 'Copy segments to other patterns…', disabled: segmentActionsUnavailable, onSelect: () => requestScopeChange(() => setSegmentRuntimeDialog('copy')) },
            { id: 'fill-segments', label: 'Fill from other patterns…', disabled: segmentActionsUnavailable, onSelect: () => requestScopeChange(() => setSegmentRuntimeDialog('fill')) },
            { id: 'compare-patterns', label: 'Compare patterns…', disabled: segmentActionsUnavailable, onSelect: () => requestScopeChange(() => setCompareOpen(true)) },
            ...(segmentUndoApplies ? [{ id: 'undo-segments', label: 'Undo last segment copy', disabled: tripProfileBusy, onSelect: () => requestScopeChange(() => void undoSegmentRuntimes()) }] : []),
          ] },
        ]} disabled={loading || tripProfileBusy} triggerRef={runtimeCopyButtonRef} />
      </div>
      {selectedProfile && <p className="profile-usage">Used by {dayNameList(profileDays.length ? profileDays.map((day) => day.name) : [selectedDay?.name ?? 'this service day'])} for {selectedPattern?.name}.</p>}
      {selectedProfile && selectedPattern ? <RuntimeEditor2 ref={runtimeEditorRef} service={service} profile={selectedProfile} pattern={selectedPattern} nodes={aggregate.nodes} onStateChange={setRuntimeEditorState} onSaved={async () => onRuntimeChanged()} onError={onError} /> : <p className="runtime-status">Loading runtimes…</p>}
      </div>}
      {routeMethodChange && <RouteRuntimeMethodDialog routeName={aggregate.route.name || 'this Route'} method={routeMethodChange.method} impact={routeMethodChange.impact} busy={routeMethodChange.busy} onConfirm={() => void confirmRouteMethodChange()} onClose={() => setRouteMethodChange(undefined)} />}
      {runtimesOpen && runtimeEditorState.dirty && <SaveBar message={runtimeEditorState.changeCount ? `${runtimeEditorState.changeCount} unsaved change${runtimeEditorState.changeCount === 1 ? '' : 's'} in Runtimes` : 'Unsaved changes in Runtimes'} saveLabel={runtimeEditorState.saving ? 'Saving…' : 'Save'} busy={runtimeEditorState.saving || tripProfileBusy} onSave={() => saveRuntimeThen(() => { window.setTimeout(() => runtimeCopyButtonRef.current?.focus()); })} onDiscard={() => { runtimeEditorRef.current?.discard(); window.setTimeout(() => runtimeCopyButtonRef.current?.focus()); }} />}
    </section>}
    {pane && sharedControls && sharedSlots?.context && createPortal(sharedContext, sharedSlots.context)}
    {pane && sharedControls && sharedSlots?.actions && createPortal(viewButton, sharedSlots.actions)}
    <WorkSurface title={pane ? paneDirection?.name ?? 'Direction' : 'Trips'} count={trips.length} subtitle={pane ? paneEnds : undefined} ariaLabel={pane ? `${paneDirection?.name ?? 'Direction'} trips` : 'Trips section'} className={pane ? 'trips-surface trips-pane' : 'trips-surface'}
      context={pane ? paneContext : sharedContext}
      actions={<>
        {!pane && viewButton}
        <button type="button" disabled={Boolean(draftTrip) || tripProfileBusy || shiftOperations.length > 0} title={shiftOperations.length ? 'Discard the staged shift first.' : undefined} onClick={() => startOpenEdit(() => setDraftTrip({ patternId: '', firstTrip: '' }))}>Add trip</button>
        <button type="button" ref={buildTripsButtonRef} className="primary" disabled={tripProfileBusy || shiftOperations.length > 0 || buildOpen} title={buildOpen ? 'The Build trips drawer is already open.' : shiftOperations.length ? 'Discard the staged shift first.' : undefined} onClick={() => startOpenEdit(() => setBuildOpen(true))}>Build trips…</button>
        <MenuButton label="Actions" menuLabel="Trip actions" groups={tripActionsMenu} disabled={tripProfileBusy || Boolean(tripBlockAssignment)} triggerRef={tripsActionsRef} />
      </>}>
      {tripsWithChangedRuntimes.length > 0 && <InlineNote kind="warn"><b>Run times have changed</b> for {tripsWithChangedRuntimes.length} {tripsWithChangedRuntimes.length === 1 ? 'trip' : 'trips'}. <button type="button" className="small" disabled={busy || tripProfileBusy} onClick={selectTripsWithChangedRuntimes}>Select these trips</button></InlineNote>}
      {staleReasons && <InlineNote kind="warn" live>{staleTripNoticeText(staleReasons)}</InlineNote>}
      {tripBlockAssignmentStatus && <InlineNote kind="ok" live>{tripBlockAssignmentStatus}</InlineNote>}
      <ScheduleTable compact={Boolean(pane)} selectionBar={renderSelectionBar} planGaps={planGaps} onStartTimeChange={tripProfileBusy || shiftDrawerOpen || shiftOperations.length > 0 ? undefined : changeTripStartTime} trips={trips} previewTrips={shiftPreview?.shiftedTrips} stagedShiftSeconds={shiftPreview?.netOffsetSeconds} draft={draftTrip} patterns={patterns} direction={directions.find((direction) => directionId === direction.id)!} nodes={aggregate.nodes} runtimeProfiles={activeRuntimeProfiles} showRuntimeBands={showRuntimeBands} showHeadways={showHeadways} roundDisplayedTimes={roundDisplayedTimes} blockAssignments={tripBlockByTripId} tripConnections={tripConnections} totals={tableTotals} blockWarnings={tripBlockWarnings} blockOptions={tripBlockOptions} blockAssignmentDisabled={busy || tripProfileBusy || tripBlockingBlocksBusy || shiftOperations.length > 0 || shiftDrawerOpen || Boolean(tripBlockAssignment)} onAssignBlock={(trip, blockId, trigger) => openTripBlockAssignment([trip.id], blockId, 'pill', trigger)} onUnassignBlock={(trip, trigger) => openTripBlockAssignment([trip.id], '', 'pill', trigger, 'unassign')} selectedIds={selectedTripIds} changedRuntimeTripIds={changedRuntimeTripIds} changedMarks={changedMarks} onToggle={toggleTrip} rowContextMenu={rowContextMenu} headerContextGroups={viewMenu} onSelectAll={(selected) => requestShiftScopeChange(() => { selectionAnchorId.current = undefined; setSelectedTripIds(selected ? trips.map((trip) => trip.id) : []); })} onSelectBy={selectTripsBy} onDelete={(trip) => requestShiftScopeChange(() => void requestTripDeletion([trip.id]))} onDraftChange={setDraftTrip} onDraftSave={() => void saveDraftTrip()} onDraftCancel={() => setDraftTrip(undefined)} busy={busy || tripProfileBusy} />
      {dayLine && <InlineNote>{dayLine}</InlineNote>}
    </WorkSurface>
    {tripBlockAssignment?.operation === 'assign' && <TripBlockAssignmentDialog draft={tripBlockAssignment} blockingScenarioName={selectedBlockingScenario?.name ?? 'blocking scenario'} serviceDayName={selectedDay?.name ?? 'selected service day'} blocks={dayBlockingBlocks} blockOptions={tripBlockOptions} currentAssignments={tripBlockByTripId} onConfirm={(destinationId) => void confirmTripBlockAssignment(destinationId)} onClose={closeTripBlockAssignment} busy={busy} error={tripBlockAssignmentError} />}
    {tripBlockAssignment?.operation === 'unassign' && <TripBlockUnassignmentDialog draft={tripBlockAssignment} blockingScenarioName={selectedBlockingScenario?.name ?? 'blocking scenario'} serviceDayName={selectedDay?.name ?? 'selected service day'} blocks={dayBlockingBlocks} currentAssignments={tripBlockByTripId} onConfirm={() => void confirmTripBlockAssignment('')} onClose={closeTripBlockAssignment} busy={busy} error={tripBlockAssignmentError} />}
    {runtimeLeave && <RouteNavigationDraftDialog title="Save runtime changes before leaving?" text="The runtime profile has unsaved edits." onCancel={() => setRuntimeLeave(undefined)} onDiscard={() => { const { action, leavesContext } = runtimeLeave; setRuntimeLeave(undefined); runtimeEditorRef.current?.discard(); (leavesContext ? requestShiftAndDraftScopeChange : requestShiftScopeChange)(action); }} onSave={() => { const { action, leavesContext } = runtimeLeave; setRuntimeLeave(undefined); saveRuntimeThen(action, leavesContext); }} />}
    {shiftDiscardAction && <ShiftDiscardDialog onDiscard={() => discardStagedShift(shiftDiscardAction)} onCancel={() => setShiftDiscardAction(undefined)} onSave={shiftError ? undefined : () => { const action = shiftDiscardAction; setShiftDiscardAction(undefined); void completeStagedShift().then((saved) => { if (saved) action(); }); }} />}
    {draftTripDiscardAction && <ShiftDiscardDialog title="Discard new trip?" text="The new trip row has not been added. Discard it before leaving this schedule context?" onDiscard={() => { const action = draftTripDiscardAction; setDraftTripDiscardAction(undefined); setDraftTrip(undefined); action(); }} onCancel={() => setDraftTripDiscardAction(undefined)} onSave={draftTrip?.patternId && draftTrip.firstTrip.trim() ? () => { const action = draftTripDiscardAction; setDraftTripDiscardAction(undefined); void saveDraftTrip().then((saved) => { if (saved) action(); }); } : undefined} />}
    {compareOpen && directions.find((direction) => direction.id === directionId) && <CompareRuntimesDialog service={service} direction={directions.find((direction) => direction.id === directionId)!} serviceDayId={serviceDayId} dayName={selectedDay?.name ?? ''} patterns={aggregate.patterns} profiles={runtimeSource.profiles} assignments={runtimeSource.assignments} nodes={aggregate.nodes} onChanged={onRuntimeChanged} onClose={() => setCompareOpen(false)} />}
    {segmentRuntimeDialog && selectedProfile && <SegmentRuntimeDialog service={service} mode={segmentRuntimeDialog} profileId={selectedProfile.id} onDone={() => { setSegmentRuntimeDialog(undefined); onRuntimeChanged(); }} onClose={() => setSegmentRuntimeDialog(undefined)} />}
    {runtimeDialog && <RuntimeProfileDialog2 dialog={runtimeDialog} candidates={reverseCandidates} onSubmit={submitRuntimeDialog} onClose={() => setRuntimeDialog(undefined)} />}
    {deleteProfileOpen && selectedProfile && profileDeletionImpact && <DeleteRuntimeProfileDialog profile={selectedProfile} profiles={profiles} assignmentCount={profileDeletionImpact.assignmentCount} tripCount={profileDeletionImpact.tripCount} onDelete={deleteProfile} onClose={() => { setDeleteProfileOpen(false); setProfileDeletionImpact(undefined); }} />}
    {buildOpen && <BuildTripsDrawer tripService={tripService} plannedFrequencyService={plannedFrequencyService} scenarioId={records.scenario.id} routeId={aggregate.route.id} serviceDayId={serviceDayId} tripProfileId={tripProfileId} patterns={patterns} nodes={aggregate.nodes} profileName={selectedProfile?.name} initialValues={buildValues.current} onValuesChange={(values) => { buildValues.current = values; }} onDone={async (changedTripIds) => { buildValues.current = EMPTY_BUILD_VALUES; closeBuildDrawer(); setChangedMarks((previous) => markTrips(previous, changedTripIds)); clearTripShiftHistory(); await loadTrips(); }} onClose={closeBuildDrawer} />}
    {tripDeletion && <DeleteTripsDialog tripCount={tripDeletion.tripIds.length} affectedBlockCount={tripDeletion.affectedBlockIds.length} onDelete={() => void deleteTrips()} onClose={() => setTripDeletion(undefined)} busy={busy} />}
    {startTimeReview && <StartTimeChangeDialog patternName={startTimeReview.patternName} fromSeconds={startTimeReview.fromSeconds} toSeconds={startTimeReview.toSeconds} preview={startTimeReview.preview} busy={busy} onApply={() => void applyStartTimeChange(startTimeReview.preview)} onClose={() => setStartTimeReview(undefined)} />}
    {recalculationTripIds.length > 0 && <TripRecalculationDialog tripService={tripService} tripIds={recalculationTripIds} trips={trips} context={reviewContext} onDone={finishRecalculation} onClose={() => setRecalculationTripIds([])} />}
    {runtimeCopyOpen && selectedDay && <RuntimeDayCopyDialog tripService={tripService} scenarioId={records.scenario.id} routeId={aggregate.route.id} routeName={aggregate.route.name || 'Untitled route'} targetDay={selectedDay} days={days} patterns={aggregate.patterns.filter(isUsablePattern)} onDone={completeRuntimeCopy} onClose={closeRuntimeCopy} onError={onError} />}
    {tripCopyOpen && selectedDay && <TripDayCopyDialog tripService={tripService} scenarioId={records.scenario.id} routeId={aggregate.route.id} tripProfileId={tripProfileId} routeName={aggregate.route.name || 'Untitled route'} tripProfileName={(records.tripProfiles ?? []).find((profile) => profile.id === tripProfileId)?.name || 'trip profile'} targetDay={selectedDay} days={days} patterns={aggregate.patterns} onDone={completeTripDayCopy} onClose={closeTripCopy} onError={onError} />}
    {tripPatternChangeOpen && selectedTrips.length === 1 && <TripPatternChangeDialog tripService={tripService} trip={selectedTrips[0]!} directionId={directionId} context={reviewContext} onDone={completeTripCopy} onClose={closeTripPatternChange} />}
    {batchPatternChangeOpen && <BatchPatternChangeDialog tripService={tripService} tripIds={selectedTripIds} trips={trips} context={reviewContext} onDone={completeTripCopy} onClose={closeBatchPatternChange} />}
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
