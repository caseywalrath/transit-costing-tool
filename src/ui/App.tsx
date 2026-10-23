import { Component, cloneElement, forwardRef, isValidElement, type ChangeEvent, type ErrorInfo, type FormEvent, type ReactElement, type ReactNode, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LocalDataProtection, SaveStatus, SessionStatus, SessionStatusQueries, TripTableImportPreview } from '../application/ports';
import type { BlockingCommands, BlockingQueries } from '../application/ports';
import { BlockingWorkspace } from './BlockingWorkspace';
import { CostingWorkspace } from './CostingWorkspace';
import { MenuButton, type MenuGroup } from './MenuButton';
import { userFacingError } from './errorMessages';
import { staleTripNotice, staleTripNoticeText, type StaleTripNotice } from './staleTripReasons';
import { ModalDialog } from './ModalDialog';
import { readStoredRecord, storedText, storedTextMap } from './preferences';
import { singleFlight } from './singleFlight';
import { createCsvArchive } from '../application/csvDownload';
import { ServiceDayValidationError, serviceDayFindingMessage, type NodeChangePreview, type PatternChangePreview as SafePatternChangePreview, type RouteDefinitionApplication, type RouteEditCommitResult, type RouteEditMode, type ScenarioRecords } from '../application/routeDefinitionService';
import { TripShiftStalePreviewError, type TripGenerationApplication } from '../application/tripGenerationService';
import type { BatchPatternChangePreview, RuntimeCopyPreview, TripCopyPreview } from '../domain/serviceDayCopy';
import { TripShiftValidationError, type TripShiftPreview } from '../domain/tripShift';
import { AnchorBandChoiceError, TripGenerationError, type AnchorBandChoice, type RecalculationPreview } from '../domain/trips';
import { metadata, newId } from '../domain/ids';
import { formatRuntimeDuration, parseRuntimeDuration } from '../domain/durations';
import { addRuntimeBand, applyPastedRuntimeRows, buildTripTableView, buildTripsFieldProblems, createBlockingScenarioSourceSignature, duplicateRuntimeBand, formatNetShift, formatStagedShift, isUsablePattern, MAX_TRIPS_PER_GENERATION, orderDirections, parseBuildTripsForm, parseShiftSeconds, patternTotalMiles, removeRuntimeBand, reverseRuntimeCandidates, roundServiceTimeToMinute, runtimeBandTotalSeconds, sortServiceDays, tripBlockAssignmentImpact, tripBlockUnassignmentImpact, tripRunTimeSeconds, updateRuntimeBand, usableDirectionPatterns } from '../application/tripsWorkspaceView';
import { formatServiceTime, parseServiceTime } from '../domain/time';
import type { BlockingBlock, Node, NodeKind, Project, Route, RouteDefinitionAggregate, RouteDirection, RoutePattern, RuntimeAssignment, RuntimeProfile, ServiceDayDefinition, Trip, ValidationFinding } from '../domain/types';
import type { BlockConnection } from '../domain/blocking';
import { parseRuntimePaste, RuntimePasteParseError, runtimeProfileCsv, type RuntimePasteRow } from './runtimePaste';
import { parseTripTableCsv, tripTableCsv } from '../application/tripTableCsv';

import type { CostingCommands, CostingQueries } from '../application/ports';

type Props = { service: RouteDefinitionApplication; tripService: TripGenerationApplication; blockingService: BlockingCommands & BlockingQueries; costingService: CostingCommands & CostingQueries; session?: SessionStatusQueries };
type Notice = { kind: 'error' | 'success'; text: string } | undefined;
type NameDialog = { title: string; label?: string; initialValue?: string; submitLabel: string; action: (name: string) => Promise<void> | void };
type Confirmation = { title: string; text: string; action: () => void; confirmLabel?: string };
type ActiveTab = 'route' | 'trips' | 'blocking' | 'costing';
type SelectionPreference = { projectId?: string; scenarioId?: string; routeId?: string };
type RouteNavigationGuard = (action: () => void) => void;
type RuntimeEditorHandle = { addBand: () => void; discard: () => void; pasteRows: () => void; importRows: (contents: string) => void; /** Resolves to true when the profile was validated and saved. */ save: () => Promise<boolean> };
type BuildTripsValues = { patternId: string; firstTrip: string; headway: string; tripCount: string; lastTrip: string };
const EMPTY_BUILD_VALUES: BuildTripsValues = { patternId: '', firstTrip: '', headway: '', tripCount: '', lastTrip: '' };
type RuntimeEditorState = { dirty: boolean; saving: boolean };
type TripBlockAssignmentDraft = { operation: 'assign' | 'unassign'; tripIds: string[]; destinationBlockId: string; source: 'pill' | 'actions'; blockingScenarioId: string; tripProfileId: string; serviceDayId: string; sourceSignature: string };
type TripBlockOption = { id: string; label: string; disabled?: boolean; reason?: string };
const SELECTION_PREFERENCE_KEY = 'transit-costing-tool.route-selection.v1';
const TRIP_BLOCKING_SCENARIO_PREFERENCE_KEY = 'transit-costing-tool.trip-blocking-scenario.v1';

function loadSelectionPreference(): SelectionPreference {
  const stored = readStoredRecord(SELECTION_PREFERENCE_KEY);
  return { projectId: storedText(stored.projectId), scenarioId: storedText(stored.scenarioId), routeId: storedText(stored.routeId) };
}

/** The Blocking Scenario last chosen in Trips for each Trip Profile of a Scenario. An older record holds a single choice. */
function rememberedTripBlockingScenarios(scenarioId: string): Record<string, string> {
  const stored = readStoredRecord(TRIP_BLOCKING_SCENARIO_PREFERENCE_KEY);
  if (storedText(stored.scenarioId) !== scenarioId) return {};
  const byProfile = storedTextMap(stored.byTripProfile) ?? {};
  const legacyProfile = storedText(stored.tripProfileId); const legacyChoice = storedText(stored.blockingScenarioId);
  return legacyProfile && legacyChoice && !(legacyProfile in byProfile) ? { ...byProfile, [legacyProfile]: legacyChoice } : byProfile;
}

function rememberTripBlockingScenario(scenarioId: string, tripProfileId: string, blockingScenarioId: string) {
  try { localStorage.setItem(TRIP_BLOCKING_SCENARIO_PREFERENCE_KEY, JSON.stringify({ scenarioId, byTripProfile: { ...rememberedTripBlockingScenarios(scenarioId), [tripProfileId]: blockingScenarioId } })); } catch { /* UI preference only. */ }
}

function saveSelectionPreference(preference: SelectionPreference) {
  try { localStorage.setItem(SELECTION_PREFERENCE_KEY, JSON.stringify(preference)); } catch { /* Storage is a convenience only. */ }
}

/** The time a backup was exported, in the planner's own date and time format. */
/** "Weekday", "Weekday and Saturday", "Weekday, Saturday, and Sunday". */
function dayNameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

function formatBackupTime(iso: string) { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }

function download(filename: string, contents: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function messages(findings: ValidationFinding[], entityId: string, field?: string) {
  return findings
    .filter((item) => item.entityId === entityId && (!field || item.field === field))
    .map((item) => userMessage(item));
}

const USER_FACING_VALIDATION_MESSAGES: Record<string, string> = {
  'route.nameRequired': 'Enter a Route name.',
  'route.scenarioRequired': 'Select a Scenario for this Route.',
  'node.nameRequired': 'Enter a Node name.',
  'node.scenarioRequired': 'This Node is not assigned to the current Scenario.',
  'node.routeRequired': 'This Node is not assigned to the current Route.',
  'node.duplicateId': 'This Node has a duplicate identifier.',
  'node.referencedBeforeDelete': 'This Node is used by one or more Patterns. Remove it from those Patterns first.',
  'node.deleteLeavesPatternTooShort': 'Keep at least two points in every affected Pattern before deleting this Node.',
  'pattern.nameRequired': 'Enter a Pattern name.',
  'pattern.directionRequired': 'Choose a Direction.',
  'pattern.requiresTwoPoints': 'Add at least two points.',
  'pattern.duplicatePointId': 'Pattern points must be unique.',
  'pattern.sequenceNormalized': 'The point order was corrected. Check the order, then save again.',
  'pattern.missingNode': 'Select a valid Node for this point.',
  'pattern.invalidDistance': 'Enter a non-negative distance.',
  'pattern.firstDistanceNotZero': 'The first point distance must be 0.',
  'pattern.distanceDecreases': 'Distances must not decrease.',
  'block.missingTrip': 'This Block refers to a Trip that no longer exists. Remove that Trip from the Block.',
  'block.activityEndsBeforeStart': 'An activity ends before it starts. Check its times.',
  'block.overlap': 'Activities overlap in this Block. Move or remove one of them.',
  'runtime.profileNameRequired': 'Enter a Runtime profile name.',
  'runtime.noBands': 'Add at least one Runtime band.',
  'runtime.bandLabelRequired': 'Enter a band name.',
  'runtime.bandSequenceInvalid': 'Review the order of these time bands.',
  'runtime.bandBoundsInvalid': 'Enter an end time after the start time.',
  'runtime.segmentCountMismatch': 'Enter a runtime for every segment.',
  'runtime.segmentDurationInvalid': 'Enter a non-negative runtime for each segment.',
  'runtime.bandOverlap': 'Runtime bands cannot overlap.',
  'runtime.noApplicableBand': 'No runtime is defined for this time period. Add or extend a Runtime band.',
  'runtime.assignmentNotUnique': 'Only one Runtime profile can be assigned to this Pattern and service day.',
  'runtimeCopy.sameDay': 'Choose a different source day.',
  'runtimeCopy.sourceAssignmentUnresolved': 'The source day is missing a Runtime assignment for this Pattern.',
  'runtimeCopy.sourceDayRequired': 'Choose a source day.',
  'tripCopy.sameDay': 'Choose a different source day.',
  'tripCopy.emptySourceRequiresExplicitClear': 'Confirm that the target schedule should be cleared.',
  'tripCopy.sourceDayRequired': 'Choose a source day.',
  'batchPatternChange.tripsRequired': 'Select one or more Trips.',
  'batchPatternChange.patternRequired': 'Choose a target Pattern.',
  'tripGeneration.firstTripInvalid': 'Enter a valid first Trip time.',
  'tripGeneration.headwayInvalid': 'Enter a positive whole-minute headway.',
  'tripGeneration.tripCountInvalid': 'Enter at least one Trip.',
  'tripGeneration.tripCountTooLarge': 'Enter 500 Trips or fewer.',
  'tripGeneration.limitRequired': 'Enter either Last Trip or Number of Trips.',
  'tripGeneration.lastTripInvalid': 'Enter a valid last Trip time.',
  'tripGeneration.lastBeforeFirst': 'The last Trip must not be before the first Trip.',
  'trip.patternDirectionMismatch': 'Choose a Pattern in the selected Direction.',
  'trip.patternChangeUnavailable': 'This Trip cannot be recalculated with the selected Pattern.',
  'trip.departureMissing': 'This Trip does not have a valid first departure.',
  'trip.patternMismatch': 'This Trip no longer matches its selected Pattern.',
  'trip.pointCountMismatch': 'This Trip does not contain every required timepoint.',
  'trip.patternPointMismatch': 'This Trip has incompatible timepoints.',
  'trip.timesNotMonotonic': 'Trip times must not decrease.',
  'trip.csvDuplicateId': 'A Trip ID appears more than once in the CSV.',
  'trip.csvPatternInvalid': 'Choose a Pattern in the selected Route and Direction.',
  'trip.csvTripInvalid': 'A Trip ID does not belong to the selected schedule.',
  'trip.timeBeforeServiceDay': 'A Trip has a time before 0:00. Correct the Trip time.',
  'tripShift.timeBeforeServiceDay': 'A Shift would move a Trip before 0:00. Use a smaller Shift.',
  'trip.anchorNoRuntime': 'The fixed timepoint cannot be reached with the current runtimes. Choose another anchor or adjust the runtime bands.',
  'trip.anchorAmbiguous': 'The fixed timepoint can be reached from more than one first departure. Choose another anchor or adjust the runtime bands.',
  'trip.csvPointSetInvalid': 'Each row must contain exactly the timepoints for its Pattern.',
};

/** Step sizes offered as one-press choices in the Shift drawer; any other whole number of minutes can be typed (U10). */
const SHIFT_STEP_PRESETS = [1, 5, 10, 15] as const;

/** The text for a refused Shift. The domain's generic wording for an invalid request is replaced with a next step. */
function shiftErrorText(error: unknown, fallback: string) {
  if (error instanceof TripShiftValidationError && !error.findings.some((item) => item.ruleId === 'tripShift.timeBeforeServiceDay')) return 'The selected Trips cannot be shifted. Check the selection and try again.';
  return userFacingError(error, fallback);
}

function userMessage(finding: ValidationFinding) {
  if (finding.messageKey === 'trip.regenerationBlockOverlap') return `Block ${finding.parameters?.blockLabel ?? ''}: ${finding.parameters?.precedingTripSelected ? `trip ends after the next departure at ${formatServiceTime(Number(finding.parameters.nextDeparture))}` : `trip departs before the preceding trip ends at ${formatServiceTime(Number(finding.parameters?.precedingEnd))}`}.`;
  return USER_FACING_VALIDATION_MESSAGES[finding.messageKey] ?? 'Review this item and correct it before trying again.';
}

export function App({ service, tripService, blockingService, costingService, session }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [scenarioOptions, setScenarioOptions] = useState<import('../domain/types').Scenario[]>([]);
  const [records, setRecords] = useState<ScenarioRecords>();
  const [routeId, setRouteId] = useState('');
  const [workspaceServiceDayId, setWorkspaceServiceDayId] = useState('');
  const [workspaceDirectionId, setWorkspaceDirectionId] = useState('');
  const [workspaceTripProfileId, setWorkspaceTripProfileId] = useState('');
  const [aggregate, setAggregate] = useState<RouteDefinitionAggregate>();
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [tripPatternSelections, setTripPatternSelections] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>('route');
  const [notice, setNotice] = useState<Notice>();
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(() => service.getSaveStatus());
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(() => session?.getSessionStatus() ?? { mode: 'active' });
  const [protection, setProtection] = useState<LocalDataProtection>(() => service.getLocalDataProtection());
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirm, setConfirm] = useState<Confirmation>();
  const [nameDialog, setNameDialog] = useState<NameDialog>();
  const [tripProfileBusy, setTripProfileBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const routeNavigationGuard = useRef<RouteNavigationGuard | undefined>(undefined);
  const tripNavigationGuard = useRef<RouteNavigationGuard | undefined>(undefined);
  const costingNavigationGuard = useRef<RouteNavigationGuard | undefined>(undefined);

  const scenarios = scenarioOptions;
  const selectedProject = projects.find((project) => project.id === projectId);
  const findings = useMemo(() => aggregate ? service.validate(aggregate) : [], [aggregate, service]);
  const selectedPattern = aggregate?.patterns.find((pattern) => pattern.id === selectedPatternId);

  async function reload(projectToLoad = projectId, scenarioToLoad = scenarioId, routeToLoad = routeId) {
    const workspace = await service.loadWorkspace(projectToLoad, scenarioToLoad, routeToLoad);
    setLoadFailed(false);
    const nextProjects = workspace.projects; setProjects(nextProjects);
    const project = workspace.project;
    if (!project) { setProjectId(''); setScenarioId(''); setScenarioOptions([]); setRecords(undefined); setAggregate(undefined); setWorkspaceTripProfileId(''); saveSelectionPreference({}); return; }
    setProjectId(project.id);
    const nextScenarios = workspace.scenarios; setScenarioOptions(nextScenarios);
    const scenario = workspace.records?.scenario;
    if (!scenario) { setScenarioId(''); setRecords(undefined); setAggregate(undefined); setWorkspaceTripProfileId(''); saveSelectionPreference({ projectId: project.id }); return; }
    const nextRecords = workspace.records; setScenarioId(scenario.id); setRecords(nextRecords);
    const tripProfiles = nextRecords?.tripProfiles ?? [];
    setWorkspaceTripProfileId((current) => current && tripProfiles.some((profile) => profile.id === current) ? current : tripProfiles[0]?.id ?? '');
    const route = workspace.aggregate?.route;
    setRouteId(route?.id ?? '');
    const nextAggregate = workspace.aggregate; setAggregate(nextAggregate);
    setSelectedPatternId((current) => nextAggregate?.patterns.some((pattern) => pattern.id === current) ? current : nextAggregate?.patterns[0]?.id ?? '');
    saveSelectionPreference({ projectId: project.id, scenarioId: scenario.id, routeId: route?.id });
  }
  useEffect(() => service.subscribeToSaveStatus(setSaveStatus), [service]);
  useEffect(() => session?.subscribeToSessionStatus(setSessionStatus), [session]);
  useEffect(() => service.subscribeToLocalDataProtection(setProtection), [service]);
  useEffect(() => { const preference = loadSelectionPreference(); void reload(preference.projectId, preference.scenarioId, preference.routeId).catch((error) => { setLoadFailed(true); showError(error, 'Unable to open your saved projects. Reload this page and try again.'); }); }, []);
  useEffect(() => {
    const days = sortServiceDays(records?.serviceDays ?? []);
    if (!days.some((day) => day.id === workspaceServiceDayId)) setWorkspaceServiceDayId(days[0]?.id ?? '');
  }, [records?.serviceDays, workspaceServiceDayId]);
  useEffect(() => {
    const directions = orderDirections(aggregate?.directions ?? []);
    if (!directions.some((direction) => direction.id === workspaceDirectionId)) setWorkspaceDirectionId(directions[0]?.id ?? '');
  }, [aggregate?.directions, workspaceDirectionId]);
  useEffect(() => {
    const profiles = records?.tripProfiles ?? [];
    if (!profiles.some((profile) => profile.id === workspaceTripProfileId)) setWorkspaceTripProfileId(profiles[0]?.id ?? '');
  }, [records?.tripProfiles, workspaceTripProfileId]);

  function showError(error: unknown, fallback: string) {
    if (error instanceof TripGenerationError) { setNotice({ kind: 'error', text: [...new Set(error.findings.map(userMessage))].join(' ') || fallback }); return; }
    setNotice({ kind: 'error', text: userFacingError(error, fallback) });
  }
  function selectionFailed(error: unknown) { showError(error, 'Unable to load that selection. Reload this page and try again.'); }
  function acceptAggregate(next: RouteDefinitionAggregate) { setAggregate(next); setRecords((current) => current ? { ...current, routes: [...current.routes.filter((route) => route.id !== next.route.id), next.route], nodes: [...current.nodes.filter((node) => node.routeId !== next.route.id), ...next.nodes], patterns: [...current.patterns.filter((pattern) => pattern.routeId !== next.route.id), ...next.patterns], directions: [...(current.directions ?? []).filter((direction) => direction.routeId !== next.route.id), ...(next.directions ?? [])] } : current); }
  function acceptRouteEdit(result: RouteEditCommitResult) {
    setRecords(result.records);
    setAggregate(result.aggregate);
    setSelectedPatternId((current) => result.aggregate.patterns.some((pattern) => pattern.id === current) ? current : result.aggregate.patterns[0]?.id ?? '');
    setRuntimeVersion((current) => current + 1);
  }
  async function createNewProject(name: string) { try { const created = await service.createProject(name); await reload(created.project.id, created.records.scenario.id); } catch (error) { showError(error, 'Unable to create project.'); } }
  async function renameCurrentProject(name: string) { if (!selectedProject) return; try { const next = await service.renameProject(selectedProject.id, name); setProjects((current) => current.map((project) => project.id === next.id ? next : project)); } catch (error) { showError(error, 'Unable to rename project.'); } }
  function deleteCurrentProject() {
    if (!selectedProject) return;
    void service.getProjectDeletionImpact(selectedProject.id).then((impact) => {
      const summary = `${impact.scenarioCount} scenario${impact.scenarioCount === 1 ? '' : 's'}, ${impact.routeCount} route${impact.routeCount === 1 ? '' : 's'}, ${impact.patternCount} pattern${impact.patternCount === 1 ? '' : 's'}, ${impact.tripCount} trip${impact.tripCount === 1 ? '' : 's'}, and ${impact.blockCount} Block${impact.blockCount === 1 ? '' : 's'}`;
      setConfirm({ title: 'Delete project?', text: `Delete “${selectedProject.name}” and its ${summary}? All related service days, runtime and Trip Profiles, Blocking Scenarios, and costing data will also be deleted. This cannot be undone.`, confirmLabel: 'Delete project', action: () => { void service.deleteProject(selectedProject.id, impact.reviewToken).then(async () => { setActiveTab('route'); await reload(selectedProject.id); }).catch((error) => showError(error, 'Unable to delete project.')); } });
    }).catch((error) => showError(error, 'Unable to review project deletion.'));
  }
  async function addScenario(name: string) { if (!selectedProject) return; try { const next = await service.createScenario(selectedProject.id, name); await reload(selectedProject.id, next.scenario.id); } catch (error) { showError(error, 'Unable to create scenario.'); } }
  async function renameCurrentScenario(name: string) { if (!records) return; try { const next = await service.renameScenario(records, name); setRecords(next); setScenarioOptions((current) => current.map((scenario) => scenario.id === next.scenario.id ? next.scenario : scenario)); } catch (error) { showError(error, 'Unable to save scenario.'); } }
  async function duplicateCurrentScenario(name: string) { if (!records || !selectedProject) return; try { const next = await service.duplicateScenario(records, name); await reload(selectedProject.id, next.scenario.id); } catch (error) { showError(error, 'Unable to duplicate scenario.'); } }
  function deleteCurrentScenario() {
    if (!records) return;
    void service.getScenarioDeletionImpact(records.scenario.id).then((impact) => {
      if (impact.remainingScenarioCount === 0) {
        setNotice({ kind: 'error', text: 'Create another scenario before deleting the only scenario in this project.' });
        return;
      }
      const affected = [
        impact.routeCount ? `${impact.routeCount} route${impact.routeCount === 1 ? '' : 's'}` : '',
        impact.patternCount ? `${impact.patternCount} pattern${impact.patternCount === 1 ? '' : 's'}` : '',
        impact.runtimeProfileCount ? `${impact.runtimeProfileCount} runtime profile${impact.runtimeProfileCount === 1 ? '' : 's'}` : '',
        impact.tripProfileCount ? `${impact.tripProfileCount} trip profile${impact.tripProfileCount === 1 ? '' : 's'}` : '',
        impact.tripCount ? `${impact.tripCount} trip${impact.tripCount === 1 ? '' : 's'}` : '',
        impact.blockCount ? `${impact.blockCount} block${impact.blockCount === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      setConfirm({ title: 'Delete scenario?', text: `Delete “${records.scenario.name}”${affected.length ? ` and its ${affected.join(', ')}?` : '?'} All service days and remaining scenario data will also be deleted. This cannot be undone.`, confirmLabel: 'Delete scenario', action: () => { void service.deleteScenario(records.scenario.id, impact.reviewToken).then(async () => { setActiveTab('route'); await reload(projectId); }).catch((error) => showError(error, 'Unable to delete scenario.')); } });
    }).catch((error) => showError(error, 'Unable to review scenario deletion.'));
  }
  async function addRoute() { if (!records) return; try { const next = await service.addRoute(records); setRecords(next.records); await reload(projectId, scenarioId, next.route.id); } catch (error) { showError(error, 'Unable to add route.'); } }
  async function renameCurrentRoute(name: string) { if (!aggregate) return; try { acceptAggregate(await service.updateRoute(aggregate, { name })); } catch (error) { showError(error, 'Unable to rename route.'); } }
  async function duplicateCurrentRoute(name: string) { if (!records || !aggregate) return; try { const next = await service.duplicateRoute(records, aggregate.route.id, name); setRecords(next.records); await reload(projectId, scenarioId, next.route.id); } catch (error) { showError(error, 'Unable to duplicate route.'); } }
  function deleteCurrentRoute() {
    if (!aggregate) return;
    void service.getRouteDeletionImpact(aggregate.route.id).then((impact) => {
      const affected = [
        impact.nodeCount ? `${impact.nodeCount} node${impact.nodeCount === 1 ? '' : 's'}` : '',
        impact.patternCount ? `${impact.patternCount} pattern${impact.patternCount === 1 ? '' : 's'}` : '',
        impact.runtimeProfileCount ? `${impact.runtimeProfileCount} runtime profile${impact.runtimeProfileCount === 1 ? '' : 's'}` : '',
        impact.tripCount ? `${impact.tripCount} trip${impact.tripCount === 1 ? '' : 's'}` : '',
        impact.removedBlockActivityCount ? `${impact.removedBlockActivityCount} block activit${impact.removedBlockActivityCount === 1 ? 'y' : 'ies'}` : '',
        impact.removedNonRevenueActivityCount ? `${impact.removedNonRevenueActivityCount} pull-out, pull-in, or deadhead activit${impact.removedNonRevenueActivityCount === 1 ? 'y' : 'ies'}` : '',
      ].filter(Boolean);
      const blockNote = impact.affectedBlockCount ? ` ${impact.affectedBlockCount} block${impact.affectedBlockCount === 1 ? '' : 's'} will remain without those trips.` : '';
      setConfirm({ title: 'Delete route?', text: `Delete “${aggregate.route.name || 'Untitled route'}”${affected.length ? ` and its ${affected.join(', ')}?` : '?'}${blockNote} This cannot be undone.`, confirmLabel: 'Delete route', action: () => { void service.deleteRoute(aggregate.route.id, impact.reviewToken).then(async () => { await reload(projectId, scenarioId); }).catch((error) => showError(error, 'Unable to delete route.')); } });
    }).catch((error) => showError(error, 'Unable to review route deletion.'));
  }
  /** Saves a Service day edit. A refused edit (`ServiceDayValidationError`) returns its findings so the table shows each beside its field; any other failure goes to the error banner. */
  async function updateServiceDay(id: string, patch: Partial<ServiceDayDefinition>): Promise<ValidationFinding[]> { if (!records) return []; try { setRecords(await service.updateServiceDay(records, id, patch)); return []; } catch (error) { if (error instanceof ServiceDayValidationError) return error.findings; showError(error, 'Unable to save service day.'); return []; } }
  async function saveRouteField(patch: Partial<Route>) { if (!aggregate) return; try { acceptAggregate(await service.updateRoute(aggregate, patch)); } catch (error) { showError(error, 'Unable to save route.'); } }
  function deleteSelectedPattern() {
    if (!selectedPattern) return;
    void service.getPatternDeletionImpact(selectedPattern.id).then((impact) => {
      const affected = [
        impact.runtimeProfileCount ? `${impact.runtimeProfileCount} runtime profile${impact.runtimeProfileCount === 1 ? '' : 's'}` : '',
        impact.runtimeAssignmentCount ? `${impact.runtimeAssignmentCount} runtime assignment${impact.runtimeAssignmentCount === 1 ? '' : 's'}` : '',
        impact.tripCount ? `${impact.tripCount} trip${impact.tripCount === 1 ? '' : 's'}` : '',
        impact.affectedBlockCount ? `revenue activities in ${impact.affectedBlockCount} block${impact.affectedBlockCount === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      setConfirm({ title: 'Delete Pattern?', text: `Delete “${selectedPattern.name || 'Untitled pattern'}”${affected.length ? ` and remove ${affected.join(', ')}?` : '?'} This cannot be undone.`, confirmLabel: 'Delete Pattern', action: () => { void service.deletePattern(selectedPattern.id, impact.reviewToken).then(async () => { setSelectedPatternId(''); await reload(projectId, scenarioId, routeId); }).catch((error) => showError(error, 'Unable to delete pattern.')); } });
    }).catch((error) => showError(error, 'Unable to review pattern deletion.'));
  }
  async function exportJson() { if (!projectId || !selectedProject) return; try { download(`${selectedProject.name}.json`, await service.exportProject(projectId), 'application/json'); } catch (error) { showError(error, 'Unable to export the project backup. Your data was not changed. Try again.'); } }
  async function importJson(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; try { const project = await service.importProject(await file.text()); setNotice({ kind: 'success', text: `Imported ${project.name} as an independent project.` }); await reload(project.id); } catch (error) { showError(error, 'Import failed.'); } finally { event.target.value = ''; } }
  function exportCsv() { if (!aggregate || !records || !selectedProject) return; try { const safe = selectedProject.name.replaceAll(/[^a-z0-9]+/gi, '-') || 'transit-costing-tool'; const files = service.exportAuthoritativeCsv(aggregate, records); downloadBlob(`${safe}-csv.zip`, createCsvArchive(files.map((file) => ({ filename: `${safe}-${file.suffix}.csv`, contents: file.contents })))); } catch (error) { showError(error, 'Unable to export the Route CSV files. Try again.'); } }
  function requestRouteNavigation(action: () => void) {
    const guard = activeTab === 'costing' ? costingNavigationGuard.current : activeTab === 'trips' ? tripNavigationGuard.current : activeTab === 'route' ? routeNavigationGuard.current : undefined;
    if (guard) { guard(action); return; }
    action();
  }
  async function renameTripProfile(name: string) {
    const profile = records?.tripProfiles?.find((item) => item.id === workspaceTripProfileId);
    if (!profile || !records) return;
    setTripProfileBusy(true);
    try { const updated = await tripService.renameTripProfile(profile.id, name); setRecords({ ...records, tripProfiles: (records.tripProfiles ?? []).map((item) => item.id === updated.id ? updated : item) }); }
    catch (error) { showError(error, 'Unable to rename Trip Profile.'); }
    finally { setTripProfileBusy(false); }
  }
  async function copyTripProfile(name: string) {
    const profile = records?.tripProfiles?.find((item) => item.id === workspaceTripProfileId);
    if (!profile || !records) return;
    setTripProfileBusy(true);
    try { const created = await tripService.copyTripProfile(profile.id, name); await reload(projectId, scenarioId, routeId); setWorkspaceTripProfileId(created.id); }
    catch (error) { showError(error, 'Unable to copy Trip Profile.'); }
    finally { setTripProfileBusy(false); }
  }
  function deleteTripProfile() {
    const profile = records?.tripProfiles?.find((item) => item.id === workspaceTripProfileId);
    if (!profile) return;
    void tripService.previewTripProfileDeletion(profile.id).then((impact) => {
      if (impact.isLastProfile) { setNotice({ kind: 'error', text: 'Create another Trip Profile before deleting the only profile.' }); return; }
      const tripDetail = impact.tripCount
        ? `${impact.tripCount} trips${impact.manuallyAdjustedTripCount ? ` (${impact.manuallyAdjustedTripCount} manually adjusted` : ''}${impact.staleTripCount ? `${impact.manuallyAdjustedTripCount ? ', ' : ' ('}${impact.staleTripCount} stale` : ''}${impact.manuallyAdjustedTripCount || impact.staleTripCount ? ')' : ''}`
        : 'no trips';
      const blockDetail = impact.blockCount ? ` and ${impact.blockCount} blocks${impact.blockActivityCount ? ` (${impact.blockActivityCount} activities)` : ''}` : '';
      const blockingScenarioDetail = impact.blockingScenarioCount ? `Also deletes ${impact.blockingScenarioCount} Blocking Scenario${impact.blockingScenarioCount === 1 ? ' and its Blocks' : 's and their Blocks'}. ` : '';
      setConfirm({ title: 'Delete Trip Profile?', text: `Delete “${profile.name}” and its ${tripDetail}${blockDetail}? ${blockingScenarioDetail}This cannot be undone.`, confirmLabel: 'Delete Trip Profile', action: () => { setTripProfileBusy(true); void tripService.deleteTripProfile(profile.id, impact.previewToken).then(() => reload(projectId, scenarioId, routeId)).catch((error) => showError(error, 'Unable to delete Trip Profile.')).finally(() => setTripProfileBusy(false)); } });
    }).catch((error) => showError(error, 'Unable to review Trip Profile deletion.'));
  }
  const projectActions: MenuGroup[] = [
    { label: 'Project', items: [
      { id: 'new-project', label: 'New project', onSelect: () => setNameDialog({ title: 'New Project', submitLabel: 'New Project', action: createNewProject }) },
      { id: 'rename-project', label: 'Rename project', disabled: !selectedProject, onSelect: () => setNameDialog({ title: 'Rename project', label: 'Project name', initialValue: selectedProject?.name, submitLabel: 'Rename', action: renameCurrentProject }) },
      { id: 'delete-project', label: 'Delete project', disabled: !selectedProject, destructive: true, onSelect: () => requestRouteNavigation(deleteCurrentProject) },
    ] },
    { label: 'Project data', items: [
      { id: 'backup-project', label: 'Backup project JSON', disabled: !projectId, note: [protection.lastBackupExportedAt ? `Last backup: ${formatBackupTime(protection.lastBackupExportedAt)}` : 'No backup exported yet', ...(protection.persistentStorage === 'denied' || protection.persistentStorage === 'unavailable' ? ['This browser may clear local data. Export backups regularly.'] : [])], onSelect: () => { void exportJson(); } },
      { id: 'restore-project', label: 'Restore project JSON', onSelect: () => importRef.current?.click() },
    ] },
  ];
  const scenarioActions: MenuGroup[] = [{ items: [
    { id: 'new-scenario', label: 'New scenario', disabled: !records, onSelect: () => setNameDialog({ title: 'New Scenario', label: 'Scenario name', submitLabel: 'Create scenario', action: addScenario }) },
    { id: 'rename-scenario', label: 'Rename scenario', disabled: !records, onSelect: () => setNameDialog({ title: 'Rename scenario', label: 'Scenario name', initialValue: records?.scenario.name, submitLabel: 'Rename', action: renameCurrentScenario }) },
    { id: 'duplicate-scenario', label: 'Duplicate scenario', disabled: !records, onSelect: () => setNameDialog({ title: 'Duplicate scenario', initialValue: `${records?.scenario.name ?? ''} Copy`, submitLabel: 'Duplicate', action: duplicateCurrentScenario }) },
    { id: 'delete-scenario', label: 'Delete scenario', disabled: !records, destructive: true, onSelect: () => requestRouteNavigation(deleteCurrentScenario) },
  ] }];
  const routeActions: MenuGroup[] = [
    { items: [
      { id: 'new-route', label: 'New route', onSelect: () => requestRouteNavigation(() => { void addRoute(); }) },
      { id: 'rename-route', label: 'Rename route', disabled: !aggregate, onSelect: () => setNameDialog({ title: 'Rename route', label: 'Route name', initialValue: aggregate?.route.name, submitLabel: 'Rename', action: renameCurrentRoute }) },
      { id: 'duplicate-route', label: 'Duplicate route', disabled: !aggregate, onSelect: () => setNameDialog({ title: 'Duplicate route', label: 'Route name', initialValue: `${aggregate?.route.name || 'Untitled route'} Copy`, submitLabel: 'Duplicate', action: duplicateCurrentRoute }) },
    ] },
    { label: 'Data', items: [{ id: 'export-route', label: 'Export Route CSV (ZIP)', disabled: !aggregate, onSelect: exportCsv }] },
    { items: [{ id: 'delete-route', label: 'Delete route', disabled: !aggregate, destructive: true, onSelect: () => requestRouteNavigation(deleteCurrentRoute) }] },
  ];
  return <main className="app-shell">
    <header className="topbar"><div><strong>Transit Costing Tool</strong>{sessionStatus.mode === 'readOnly' ? <span className="save-status" aria-live="polite">Read-only</span> : (saveStatus.state === 'saving' || saveStatus.state === 'error') && <span className="save-status" aria-live="polite">{saveStatus.state === 'saving' ? 'Saving locally…' : 'Local save failed'}</span>}</div><nav aria-label="Primary"><button className={`tab ${activeTab === 'route' ? 'active' : ''}`} onClick={() => requestRouteNavigation(() => setActiveTab('route'))}>Route</button><button className={`tab ${activeTab === 'trips' ? 'active' : ''}`} disabled={!aggregate?.patterns.some(isUsablePattern)} title={!aggregate?.patterns.some(isUsablePattern) ? 'Add a pattern with at least two points to define runtimes.' : undefined} onClick={() => requestRouteNavigation(() => setActiveTab('trips'))}>Trips</button><button className={`tab ${activeTab === 'blocking' ? 'active' : ''}`} disabled={!aggregate || !(records?.tripProfiles ?? []).length} title={!aggregate ? 'Select a Route before blocking service.' : !(records?.tripProfiles ?? []).length ? 'Create a Trip Profile before blocking service.' : undefined} onClick={() => requestRouteNavigation(() => setActiveTab('blocking'))}>Blocking</button><button className={`tab ${activeTab === 'costing' ? 'active' : ''}`} disabled={!records} title={!records ? 'Select a Scenario before costing service.' : undefined} onClick={() => requestRouteNavigation(() => setActiveTab('costing'))}>Costing</button></nav></header>
    <section className="context-bar" aria-label="Project and Scenario controls"><label>Project<select value={projectId} onChange={(event) => { const next = event.target.value; requestRouteNavigation(() => { void reload(next).catch(selectionFailed); }); }}><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><MenuButton label="Actions" triggerAriaLabel="Project actions" menuLabel="Project actions" groups={projectActions} /><span className="context-divider" aria-hidden="true" /><label>Scenario<select value={scenarioId} onChange={(event) => { const next = event.target.value; requestRouteNavigation(() => { void reload(projectId, next).catch(selectionFailed); }); }} disabled={!projectId}><option value="">Select scenario</option>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label><MenuButton label="Actions" triggerAriaLabel="Scenario actions" menuLabel="Scenario actions" groups={scenarioActions} disabled={!projectId} /><input ref={importRef} className="visually-hidden" tabIndex={-1} type="file" accept="application/json,.json" aria-label="Restore project JSON file" onChange={importJson} /></section>
    {sessionStatus.mode === 'readOnly' && <div className="notice info" role="status">{sessionStatus.reason === 'databaseUpgraded' ? 'The saved data was upgraded in another tab. This tab is read-only. Reload this page to edit.' : 'This project is open in another tab. This tab is read-only.'}</div>}
    {notice && <div className={`notice ${notice.kind}`} role="status">{notice.text}<button onClick={() => setNotice(undefined)} aria-label="Dismiss message">×</button></div>}
    {!records ? loadFailed ? null : <section className="empty-state empty-project"><h1>Start a local planning project</h1><p>Use the Project menu above to create a project, then define a scenario, route, service days, nodes, and patterns. Everything saves in this browser.</p></section> : <WorkspaceErrorBoundary resetKey={`${activeTab}:${scenarioId}:${routeId}`} screen={activeTab === 'route' ? 'Route' : activeTab === 'trips' ? 'Trips' : activeTab === 'blocking' ? 'Blocking' : 'Costing'}>
      {(activeTab === 'route' || activeTab === 'trips') && <section className="route-picker module-toolbar" aria-label={`${activeTab === 'route' ? 'Route' : 'Trips'} controls`}><label>Route<select value={routeId} onChange={(event) => { const next = event.target.value; requestRouteNavigation(() => { void reload(projectId, scenarioId, next).catch(selectionFailed); }); }}><option value="">No route selected</option>{records.routes.map((route) => <option key={route.id} value={route.id}>{route.shortName ? `${route.shortName} — ${route.name}` : route.name || 'Untitled route'}</option>)}</select></label>{activeTab === 'route' && <MenuButton label="Actions" triggerAriaLabel="Route actions" menuLabel="Route actions" groups={routeActions} />}{activeTab === 'trips' && aggregate && <><label>Day<select value={workspaceServiceDayId} onChange={(event) => { const next = event.target.value; requestRouteNavigation(() => setWorkspaceServiceDayId(next)); }}>{sortServiceDays(records.serviceDays).map((day) => <option key={day.id} value={day.id}>{day.name}</option>)}</select></label><label>Direction<select value={workspaceDirectionId} onChange={(event) => { const next = event.target.value; requestRouteNavigation(() => setWorkspaceDirectionId(next)); }}>{[...(aggregate.directions ?? [])].sort((left, right) => left.sequence - right.sequence).map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select></label></>}</section>}
      {activeTab === 'costing' && records ? <CostingWorkspace costingService={costingService} scenario={records.scenario} serviceDays={records.serviceDays} tripProfiles={records.tripProfiles ?? []} onRegisterNavigationGuard={(guard) => { costingNavigationGuard.current = guard; }} onError={(error, fallback) => showError(error, fallback ?? 'Unable to update Costing.')} /> : aggregate ? <><div hidden={activeTab !== 'route'}><RouteWorkspace key={aggregate.route.id} service={service} aggregate={aggregate} findings={findings} selectedPatternId={selectedPatternId} segmentMiles={(pattern, index) => service.getSegmentMiles(pattern, index)} onRoute={saveRouteField} onServiceDay={updateServiceDay} serviceDays={records.serviceDays} onCommitted={acceptRouteEdit} onDeletePattern={deleteSelectedPattern} onSelectPattern={setSelectedPatternId} onRegisterNavigationGuard={(guard) => { routeNavigationGuard.current = guard; }} onError={(error) => showError(error, 'Unable to save route changes.')} /></div>{activeTab === 'trips' && <TripsWorkspace tripPatternSelections={tripPatternSelections} onTripPatternChange={(key, id) => setTripPatternSelections((current) => ({ ...current, [key]: id }))} service={service} tripService={tripService} blockingService={blockingService} aggregate={aggregate} records={records} serviceDayId={workspaceServiceDayId} directionId={workspaceDirectionId} tripProfileId={workspaceTripProfileId} tripProfileBusy={tripProfileBusy} onTripProfileChange={setWorkspaceTripProfileId} onTripProfileRename={() => setNameDialog({ title: 'Rename Trip Profile', label: 'Name', initialValue: records.tripProfiles?.find((profile) => profile.id === workspaceTripProfileId)?.name, submitLabel: 'Rename', action: renameTripProfile })} onTripProfileCopy={() => setNameDialog({ title: 'Copy Trip Profile', label: 'Name', initialValue: `${records.tripProfiles?.find((profile) => profile.id === workspaceTripProfileId)?.name ?? ''} Copy`, submitLabel: 'Copy', action: copyTripProfile })} onTripProfileDelete={deleteTripProfile} onRegisterNavigationGuard={(guard) => { tripNavigationGuard.current = guard; }} runtimeVersion={runtimeVersion} onRuntimeChanged={() => setRuntimeVersion((current) => current + 1)} onError={(error, fallback) => showError(error, fallback ?? 'Unable to update trips.')} />}{activeTab === 'blocking' && <BlockingWorkspace blockingService={blockingService} tripService={tripService} aggregate={aggregate} records={records} routes={records.routes} routeId={routeId} onRouteChange={(nextRouteId) => requestRouteNavigation(() => { void reload(projectId, scenarioId, nextRouteId).catch(selectionFailed); })} onReload={() => reload(projectId, scenarioId, routeId)} onError={(error, fallback) => showError(error, fallback ?? 'Unable to update Blocking.')} />}</> : <section className="empty-state"><h2>No route selected</h2><p>Add a route, then define its timepoints and patterns.</p></section>}
    </WorkspaceErrorBoundary>}
    {nameDialog && <NameDialogForm dialog={nameDialog} onClose={() => setNameDialog(undefined)} />}
    {confirm && <ConfirmDialog dialog={confirm} onClose={() => setConfirm(undefined)} />}
  </main>;
}

/**
 * Shows a recoverable message when drawing a screen throws, instead of an empty page (review package U07, finding 5-011). The header and
 * the tabs stay outside it, so the planner can open another screen; the boundary resets when the screen, Scenario, or Route changes, or
 * when the planner chooses Try again.
 */
class WorkspaceErrorBoundary extends Component<{ resetKey: string; screen: string; children: ReactNode }, { error?: Error; resetKey: string }> {
  state: { error?: Error; resetKey: string } = { resetKey: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { resetKey: string }) { return props.resetKey === state.resetKey ? null : { error: undefined, resetKey: props.resetKey }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('A screen could not be drawn.', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="empty-state workspace-error" role="alert"><h1>This screen could not be shown</h1><p>Something unexpected went wrong while drawing {this.props.screen}. Your saved data is still in this browser; edits you had not saved on this screen are lost. Choose another tab, or try again. If it happens again, export a backup from the Project menu and reload the page.</p><div className="dialog-actions"><button type="button" onClick={() => this.setState({ error: undefined })}>Try again</button><button type="button" onClick={() => window.location.reload()}>Reload page</button></div></section>;
  }
}

/** What a saved Pattern says, without the save time that every commit refreshes. */
function patternSignature(pattern: RoutePattern | undefined) { return JSON.stringify(pattern, (key, value) => key === 'updatedAt' ? undefined : value); }

function RouteWorkspace({ service, aggregate, serviceDays, findings, selectedPatternId, segmentMiles, onRoute, onServiceDay, onCommitted, onDeletePattern, onSelectPattern, onRegisterNavigationGuard, onError }: { service: RouteDefinitionApplication; aggregate: RouteDefinitionAggregate; serviceDays: ServiceDayDefinition[]; findings: ValidationFinding[]; selectedPatternId: string; segmentMiles: (pattern: RoutePattern, index: number) => number; onRoute: (patch: Partial<Route>) => Promise<void>; onServiceDay: (id: string, patch: Partial<ServiceDayDefinition>) => Promise<ValidationFinding[]>; onCommitted: (result: RouteEditCommitResult) => void; onDeletePattern: () => void; onSelectPattern: (id: string) => void; onRegisterNavigationGuard: (guard: RouteNavigationGuard | undefined) => void; onError: (error: unknown) => void }) {
  const fieldError = (id: string, field?: string) => messages(findings, id, field);
  const [nodeDraft, setNodeDraft] = useState<Node[]>(aggregate.nodes);
  const [nodeSaving, setNodeSaving] = useState(false);
  const [patternSaving, setPatternSaving] = useState(false);
  const [pendingNodeDeletes, setPendingNodeDeletes] = useState<Set<string>>(new Set());
  const [nodeFindings, setNodeFindings] = useState<ValidationFinding[]>([]);
  const [patternDraft, setPatternDraft] = useState<RoutePattern | undefined>(() => aggregate.patterns.find((pattern) => pattern.id === selectedPatternId) ?? aggregate.patterns[0]);
  const [patternFindings, setPatternFindings] = useState<ValidationFinding[]>([]);
  const [conflict, setConflict] = useState<string>();
  const [impactDialog, setImpactDialog] = useState<{ preview: NodeChangePreview | SafePatternChangePreview; mode: RouteEditMode; afterCommit?: () => void }>();
  const [discardDialog, setDiscardDialog] = useState<{ title: string; action: () => void }>();
  const [navigationDialog, setNavigationDialog] = useState<{ action: () => void }>();
  const newNodeButton = useRef<HTMLButtonElement>(null);

  // A save returns new arrays for both Nodes and Patterns. A draft is replaced only when its own saved records changed, so saving Nodes
  // keeps an unsaved Pattern draft and saving a Pattern keeps unsaved Node edits (finding 5-006).
  const syncedNodes = useRef(JSON.stringify(aggregate.nodes));
  const syncedPattern = useRef(patternSignature(aggregate.patterns.find((pattern) => pattern.id === selectedPatternId) ?? aggregate.patterns[0]));
  useEffect(() => {
    const signature = JSON.stringify(aggregate.nodes);
    if (signature === syncedNodes.current) return;
    syncedNodes.current = signature;
    setNodeDraft(aggregate.nodes); setPendingNodeDeletes(new Set()); setNodeFindings([]);
  }, [aggregate.nodes]);
  useEffect(() => {
    const saved = aggregate.patterns.find((pattern) => pattern.id === selectedPatternId) ?? aggregate.patterns[0];
    // A new or duplicated Pattern is local draft state until Save Pattern
    // succeeds. Preserve it while the parent selection updates and while the
    // draft is being edited; it is not part of aggregate.patterns yet.
    if (patternDraft && !aggregate.patterns.some((pattern) => pattern.id === patternDraft.id)) return;
    const signature = patternSignature(saved);
    if (patternDraft && saved && saved.id === patternDraft.id && signature === syncedPattern.current) return;
    syncedPattern.current = signature;
    setPatternDraft(saved ? { ...saved, points: saved.points.map((point) => ({ ...point })) } : undefined);
    setPatternFindings([]); setConflict(undefined);
  }, [aggregate.patterns, selectedPatternId, patternDraft?.id]);

  const savedPattern = patternDraft ? aggregate.patterns.find((pattern) => pattern.id === patternDraft.id) : undefined;
  const isNewPattern = Boolean(patternDraft && !savedPattern);
  const nodeDirty = JSON.stringify(nodeDraft) !== JSON.stringify(aggregate.nodes) || pendingNodeDeletes.size > 0;
  const patternDirty = Boolean(patternDraft && JSON.stringify(patternDraft) !== JSON.stringify(savedPattern));
  const patternErrors = patternDraft ? messages(patternFindings, patternDraft.id) : [];
  const displayPatterns = patternDraft
    ? (isNewPattern ? [...aggregate.patterns, patternDraft] : aggregate.patterns.map((pattern) => pattern.id === patternDraft.id ? patternDraft : pattern))
    : aggregate.patterns;
  const patternDirectionName = (pattern: RoutePattern) => aggregate.directions?.find((direction) => direction.id === pattern.directionId)?.name?.trim() || 'Outbound';
  const sortedDisplayPatterns = [...displayPatterns].sort((left, right) => {
    const leftDirection = patternDirectionName(left).toLocaleLowerCase();
    const rightDirection = patternDirectionName(right).toLocaleLowerCase();
    const leftDirectionRank = leftDirection === 'inbound' ? 0 : leftDirection === 'outbound' ? 1 : 2;
    const rightDirectionRank = rightDirection === 'inbound' ? 0 : rightDirection === 'outbound' ? 1 : 2;
    return leftDirectionRank - rightDirectionRank
      || (left.name || 'Untitled pattern').localeCompare(right.name || 'Untitled pattern', undefined, { numeric: true, sensitivity: 'base' })
      || left.id.localeCompare(right.id);
  });

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!nodeDirty && !patternDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [nodeDirty, patternDirty]);

  useEffect(() => {
    onRegisterNavigationGuard((action) => {
      if (!nodeDirty && !patternDirty) { action(); return; }
      setNavigationDialog({ action });
    });
    return () => onRegisterNavigationGuard(undefined);
  }, [nodeDirty, onRegisterNavigationGuard, patternDirty]);

  function cloneSavedPattern(id: string) {
    const saved = aggregate.patterns.find((pattern) => pattern.id === id);
    setPatternDraft(saved ? { ...saved, points: saved.points.map((point) => ({ ...point })) } : undefined);
    setPatternFindings([]); setConflict(undefined); onSelectPattern(id);
  }
  function requestPattern(id: string) {
    if (id === patternDraft?.id) return;
    if (!patternDirty) { cloneSavedPattern(id); return; }
    setDiscardDialog({ title: 'Discard unsaved Pattern changes?', action: () => cloneSavedPattern(id) });
  }
  function newPattern() {
    const action = () => { const draft = service.createPatternDraft(aggregate); setPatternDraft(draft); setPatternFindings([]); setConflict(undefined); onSelectPattern(draft.id); };
    if (patternDirty) setDiscardDialog({ title: 'Discard unsaved Pattern changes?', action }); else action();
  }
  function duplicatePattern(reverse = false) {
    if (!patternDraft) return;
    const action = () => {
      try { const draft = reverse ? service.reversePatternDraft(aggregate, patternDraft.id) : service.duplicatePatternDraft(aggregate, patternDraft.id); setPatternDraft(draft); setPatternFindings([]); setConflict(undefined); onSelectPattern(draft.id); }
      catch (error) { onError(error); }
    };
    if (patternDirty) setDiscardDialog({ title: 'Discard unsaved Pattern changes?', action }); else action();
  }
  function updateDraft(patch: Partial<RoutePattern>) { setPatternDraft((current) => current ? { ...current, ...patch, points: patch.points ? patch.points.map((point, sequence) => ({ ...point, sequence })) : current.points } : current); setPatternFindings([]); setConflict(undefined); }
  function addPoint() {
    if (!patternDraft) return;
    const first = aggregate.nodes[0];
    if (!first) { setPatternFindings([{ ruleId: 'pattern.nodeRequired', severity: 'error', entityType: 'pattern', entityId: patternDraft.id, messageKey: 'pattern.missingNode' }]); return; }
    updateDraft({ points: [...patternDraft.points, { id: newId(), nodeId: first.id, sequence: patternDraft.points.length, cumulativeMiles: patternDraft.points.at(-1)?.cumulativeMiles ?? 0 }] });
  }
  function updatePoint(index: number, patch: Partial<RoutePattern['points'][number]>) { if (!patternDraft) return; updateDraft({ points: patternDraft.points.map((point, pointIndex) => pointIndex === index ? { ...point, ...patch } : point) }); }
  function movePoint(index: number, direction: -1 | 1) { if (!patternDraft) return; const target = index + direction; if (target < 0 || target >= patternDraft.points.length) return; const points = [...patternDraft.points]; [points[index], points[target]] = [points[target], points[index]]; updateDraft({ points }); }
  function removePoint(index: number) { if (patternDraft) updateDraft({ points: patternDraft.points.filter((_, pointIndex) => pointIndex !== index) }); }
  async function reviewPatternSave(afterCommit?: () => void) {
    if (!patternDraft) return;
    setPatternSaving(true);
    try {
      const preview = await service.previewPatternChange(aggregate.route.id, savedPattern?.id, patternDraft);
      setPatternFindings(preview.findings);
      setConflict(preview.conflict?.message);
      if (preview.classification === 'invalid' || preview.conflict || preview.findings.some((finding) => finding.severity === 'error')) return;
      if (preview.requiresReset) { setImpactDialog({ preview, mode: 'reset', afterCommit }); return; }
      if (preview.classification === 'deterministic') { setImpactDialog({ preview, mode: 'rebalance', afterCommit }); return; }
      await commitPattern(preview, 'rebalance', afterCommit);
    } catch (error) { onError(error); }
    finally { setPatternSaving(false); }
  }
  async function commitPattern(preview: SafePatternChangePreview, mode: RouteEditMode, afterCommit?: () => void) {
    setPatternSaving(true);
    try { const result = await service.commitPatternChange(preview.previewToken, mode); onCommitted(result); setPatternFindings([]); setConflict(undefined); setImpactDialog(undefined); afterCommit?.(); }
    catch (error) { onError(error); }
    finally { setPatternSaving(false); }
  }
  async function reviewNodeSave(afterCommit?: () => void) {
    setNodeSaving(true);
    try {
      const preview = await service.previewNodeChanges(aggregate.route.id, nodeDraft.filter((node) => !pendingNodeDeletes.has(node.id)));
      setNodeFindings(preview.findings); setConflict(preview.conflict?.message);
      if (preview.classification === 'invalid' || preview.conflict || preview.findings.some((finding) => finding.severity === 'error')) return;
      if (preview.deletedNodeIds.length) { setImpactDialog({ preview, mode: 'rebalance', afterCommit }); return; }
      await commitNodes(preview, afterCommit);
    } catch (error) { onError(error); }
    finally { setNodeSaving(false); }
  }
  async function commitNodes(preview: NodeChangePreview, afterCommit?: () => void) {
    setNodeSaving(true);
    try { const result = await service.commitNodeChanges(preview.previewToken, 'rebalance'); onCommitted(result); setNodeFindings([]); setConflict(undefined); setImpactDialog(undefined); afterCommit?.(); }
    catch (error) { onError(error); }
    finally { setNodeSaving(false); }
  }
  function discardPattern() {
    if (isNewPattern) { setPatternDraft(aggregate.patterns.find((pattern) => pattern.id === selectedPatternId) ?? aggregate.patterns[0]); onSelectPattern(aggregate.patterns[0]?.id ?? ''); }
    else if (savedPattern) cloneSavedPattern(savedPattern.id);
  }
  function discardAllDrafts() {
    setNodeDraft(aggregate.nodes); setPendingNodeDeletes(new Set()); setNodeFindings([]);
    discardPattern();
  }
  function saveDraftsThenNavigate(action: () => void) {
    if (patternDirty) {
      void reviewPatternSave(() => {
        if (nodeDirty) void reviewNodeSave(action);
        else action();
      });
      return;
    }
    if (nodeDirty) { void reviewNodeSave(action); return; }
    action();
  }
  /** Saves a Service day edit and returns the text of the finding that names `field`, if the edit was refused. */
  async function serviceDayRefusal(id: string, patch: Partial<ServiceDayDefinition>, field: 'name' | 'annualServiceDays'): Promise<string | undefined> {
    const refused = (await onServiceDay(id, patch)).filter((finding) => finding.field === field).map(serviceDayFindingMessage);
    return refused.length ? refused.join(' ') : undefined;
  }
  function addNode() { setNodeDraft((current) => [...current, { id: newId(), scenarioId: aggregate.route.scenarioId, routeId: aggregate.route.id, name: '', kind: 'timepoint', ...metadata() }]); }

  return <div className="route-workspace"><div className="route-overview-grid"><section className="route-details"><h1 className="box-heading">Route definition</h1><div className="field-grid"><Field label="Route name" required errors={fieldError(aggregate.route.id, 'name')}><input defaultValue={aggregate.route.name} onBlur={(event) => void onRoute({ name: event.target.value })} /></Field><Field label="Short name"><input defaultValue={aggregate.route.shortName ?? ''} onBlur={(event) => void onRoute({ shortName: event.target.value || undefined })} /></Field><Field label="Description" wide><input defaultValue={aggregate.route.description ?? ''} onBlur={(event) => void onRoute({ description: event.target.value || undefined })} /></Field></div></section>
    <section><div className="section-title"><h2>Service days</h2><span>Annual count is saved on field commit. Zero is valid.</span></div><div className="table-scroll service-days-table"><table><thead><tr><th scope="col">Service day</th><th scope="col">Annual service days</th></tr></thead><tbody>{sortServiceDays(serviceDays).map((day) => <tr key={day.id}><td><ServiceDayNameInput name={day.name} onCommit={(value) => serviceDayRefusal(day.id, { name: value }, 'name')} /></td><td><NumericCommit label={`${day.name} annual service days`} value={day.annualServiceDays} integer onCommit={(value) => serviceDayRefusal(day.id, { annualServiceDays: value }, 'annualServiceDays')} /></td></tr>)}</tbody></table></div></section></div>
    <div className="definition-grid"><section><div className="section-title"><h2>Nodes</h2></div><div className="table-scroll"><table><thead><tr><th scope="col">Name</th><th scope="col">Short</th><th scope="col">Type</th><th scope="col">Notes</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{nodeDraft.map((node) => { const pending = pendingNodeDeletes.has(node.id); const errors = messages(nodeFindings, node.id); return <tr key={node.id} className={`${pending ? 'pending-delete' : ''} ${!aggregate.nodes.some((saved) => saved.id === node.id) ? 'draft-row' : ''}`}><td><input aria-label="Node name" placeholder="Enter node name" value={node.name} disabled={pending || nodeSaving} onChange={(event) => { setNodeDraft((current) => current.map((candidate) => candidate.id === node.id ? { ...candidate, name: event.target.value } : candidate)); setNodeFindings([]); }} />{errors.map((error) => <small className="field-error" key={error}>{error}</small>)}</td><td><input aria-label="Node short name" value={node.shortName ?? ''} disabled={pending || nodeSaving} onChange={(event) => setNodeDraft((current) => current.map((candidate) => candidate.id === node.id ? { ...candidate, shortName: event.target.value || undefined } : candidate))} /></td><td><select aria-label="Node type" value={node.kind} disabled={pending || nodeSaving} onChange={(event) => setNodeDraft((current) => current.map((candidate) => candidate.id === node.id ? { ...candidate, kind: event.target.value as NodeKind } : candidate))}>{['timepoint', 'terminal', 'garage', 'other'].map((kind) => <option key={kind}>{kind}</option>)}</select></td><td><input aria-label="Node notes" value={node.notes ?? ''} disabled={pending || nodeSaving} onChange={(event) => setNodeDraft((current) => current.map((candidate) => candidate.id === node.id ? { ...candidate, notes: event.target.value || undefined } : candidate))} /></td><td>{pending ? <button disabled={nodeSaving} onClick={() => setPendingNodeDeletes((current) => { const next = new Set(current); next.delete(node.id); return next; })}>Undo</button> : <button className="icon-button icon-button--danger" disabled={nodeSaving} onClick={() => setPendingNodeDeletes((current) => new Set(current).add(node.id))} aria-label={`Remove ${node.name || 'node'}`} title={`Remove ${node.name || 'node'}`}><TrashIcon /></button>} {pending && <span className="row-status">Will be deleted</span>}</td></tr>; })}{nodeDraft.length === 0 && <tr><td colSpan={5} className="table-empty">Add scheduling timepoints and terminals. Nodes can be reused in any pattern.</td></tr>}</tbody></table></div><div className="table-actions"><button ref={newNodeButton} onClick={addNode} disabled={nodeSaving}>New node</button><span className="grow" /><button onClick={() => { setNodeDraft(aggregate.nodes); setPendingNodeDeletes(new Set()); setNodeFindings([]); window.setTimeout(() => newNodeButton.current?.focus()); }} disabled={!nodeDirty || nodeSaving}>Discard changes</button><button className="primary" onClick={() => void reviewNodeSave()} disabled={!nodeDirty || nodeSaving}>Save nodes</button></div></section>
      <section><div className="section-title"><h2>Patterns</h2></div><div className="pattern-layout"><aside className="pattern-list" aria-label="Patterns">{sortedDisplayPatterns.length ? sortedDisplayPatterns.map((pattern) => <button key={pattern.id} className={patternDraft?.id === pattern.id ? 'selected' : ''} onClick={() => requestPattern(pattern.id)}><strong>{pattern.name || 'Untitled pattern'} {isNewPattern && pattern.id === patternDraft?.id ? <em>Unsaved</em> : null}</strong><span>{patternDirectionName(pattern)}{pattern.directionLabel ? ` · ${pattern.directionLabel}` : ''} · {pattern.points.length} points</span></button>) : <p>Patterns define full, short, and loop trips.</p>}<button className="pattern-list-add" onClick={newPattern} disabled={nodeSaving || patternSaving}>Add pattern</button></aside>{patternDraft && <PatternEditor pattern={patternDraft} directions={aggregate.directions ?? []} nodes={aggregate.nodes} segmentMiles={segmentMiles} errors={patternErrors} conflict={conflict} isNew={isNewPattern} dirty={patternDirty} canDuplicate={!isNewPattern} onPattern={updateDraft} onAddPoint={addPoint} onUpdatePoint={updatePoint} onMovePoint={movePoint} onRemovePoint={removePoint} onReverse={() => duplicatePattern(true)} onDuplicate={() => duplicatePattern(false)} onDelete={() => isNewPattern ? discardPattern() : onDeletePattern()} onSave={() => void reviewPatternSave()} onDiscard={discardPattern} />}</div></section></div>
    {impactDialog && <RouteEditImpactDialog preview={impactDialog.preview} mode={impactDialog.mode} onClose={() => setImpactDialog(undefined)} onCommit={() => impactDialog.preview.kind === 'nodes' ? void commitNodes(impactDialog.preview, impactDialog.afterCommit) : void commitPattern(impactDialog.preview, impactDialog.mode, impactDialog.afterCommit)} />}
    {discardDialog && <DiscardRouteDraftDialog title={discardDialog.title} onDiscard={() => { discardDialog.action(); setDiscardDialog(undefined); }} onClose={() => setDiscardDialog(undefined)} />}
    {navigationDialog && <RouteNavigationDraftDialog onCancel={() => setNavigationDialog(undefined)} onDiscard={() => { const action = navigationDialog.action; discardAllDrafts(); setNavigationDialog(undefined); action(); }} onSave={() => { const action = navigationDialog.action; setNavigationDialog(undefined); saveDraftsThenNavigate(action); }} />}
  </div>;
}

function blockPillClass(label: string) { let hash = 0; for (const character of label) hash = (hash * 31 + character.charCodeAt(0)) >>> 0; return `block-pill block-pill-${hash % 6}`; }

type NewRuntimeDialog = { mode: 'new' | 'copy' | 'reverse' | 'rename'; initialName: string } | undefined;

function TripsWorkspace({ service, tripService, blockingService, aggregate, records, serviceDayId, directionId, tripProfileId, tripProfileBusy, tripPatternSelections, onTripPatternChange, onTripProfileChange, onTripProfileRename, onTripProfileCopy, onTripProfileDelete, onRegisterNavigationGuard, runtimeVersion, onRuntimeChanged, onError }: { service: RouteDefinitionApplication; tripService: TripGenerationApplication; blockingService: BlockingCommands & BlockingQueries; aggregate: RouteDefinitionAggregate; records: ScenarioRecords; serviceDayId: string; directionId: string; tripProfileId: string; tripProfileBusy: boolean; tripPatternSelections: Record<string, string>; onTripPatternChange: (key: string, id: string) => void; onTripProfileChange: (id: string) => void; onTripProfileRename: () => void; onTripProfileCopy: () => void; onTripProfileDelete: () => void; onRegisterNavigationGuard: (guard: RouteNavigationGuard | undefined) => void; runtimeVersion: number; onRuntimeChanged: () => void; onError: (error: unknown, fallback?: string) => void }) {
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
  const [lastRegenerationUndo, setLastRegenerationUndo] = useState<import('../domain/types').TripRegenerationUndo>();
  const [tripImportPreview, setTripImportPreview] = useState<{ preview?: TripTableImportPreview; issues: string[] }>();
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
  const shiftDrawerRef = useRef<HTMLElement>(null);
  const lastShiftControl = useRef<HTMLButtonElement | null>(null);
  const buildValues = useRef<BuildTripsValues>(EMPTY_BUILD_VALUES);
  const [runtimeEditorState, setRuntimeEditorState] = useState<RuntimeEditorState>({ dirty: false, saving: false });
  const [showRuntimeBands, setShowRuntimeBands] = useState(false);
  const [showHeadways, setShowHeadways] = useState(false);
  const [roundDisplayedTimes, setRoundDisplayedTimes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runtimeCopyOpen, setRuntimeCopyOpen] = useState(false);
  const [tripCopyOpen, setTripCopyOpen] = useState(false);
  const [batchPatternChangeOpen, setBatchPatternChangeOpen] = useState(false);
  const [blockingScenarios, setBlockingScenarios] = useState<import('../domain/types').BlockingScenario[]>([]);
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
  const runtimeCsvInputRef = useRef<HTMLInputElement>(null);
  const tripsCsvInputRef = useRef<HTMLInputElement>(null);
  const tripsTableScrollRef = useRef<HTMLDivElement>(null);
  const tripBlockAssignmentFocusRef = useRef<HTMLElement | null>(null);
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
    }).catch((error) => onError(error, 'Unable to load Blocking Scenario context.'));
    return () => { live = false; };
  }, [blockingService, records.scenario.id, tripProfileId]);
  useEffect(() => {
    let live = true;
    setTripBlockingBlocks([]);
    if (!tripBlockingScenarioId) { setTripBlockingBlocksBusy(false); return; }
    setTripBlockingBlocksBusy(true);
    void blockingService.listBlockingBlocks(tripBlockingScenarioId).then((blocks) => {
      if (live) setTripBlockingBlocks(blocks);
    }).catch((error) => onError(error, 'Unable to load Blocking Scenario Blocks.')).finally(() => { if (live) setTripBlockingBlocksBusy(false); });
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
    }).catch((error) => onError(error, 'Unable to load Trip connection details.'));
    return () => { live = false; };
  }, [blockingService, tripBlockingScenarioId, serviceDayId, tripBlockingBlocksBusy, tripBlockingBlocks, trips]);
  // Remember the choice for each Trip Profile. A change of Trip Profile, or a moment with no choice, must not erase another profile's choice.
  useEffect(() => { if (!tripProfileId || !tripBlockingScenarioId || !blockingScenarios.some((item) => item.id === tripBlockingScenarioId && item.tripProfileId === tripProfileId)) return; rememberTripBlockingScenario(records.scenario.id, tripProfileId, tripBlockingScenarioId); }, [records.scenario.id, tripProfileId, tripBlockingScenarioId, blockingScenarios]);
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
    if (blockTrips.some((trip) => !trip)) return { id: block.id, label: block.label, disabled: true, reason: 'This Block references a Trip that is no longer available.' };
    if (blockTrips.some((trip) => trip!.tripProfileId !== tripProfileId || trip!.serviceDayId !== serviceDayId)) return { id: block.id, label: block.label, disabled: true, reason: 'This Block contains a Trip outside the selected Trip Profile or service day.' };
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
        setTripBlockAssignmentStatus('The selected Trips are already unassigned.');
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
        setTripBlockAssignmentStatus(`Unassigned ${assignedTripIds.length} Trip${assignedTripIds.length === 1 ? '' : 's'}${alreadyUnassignedCount ? `; ${alreadyUnassignedCount} already unassigned` : ''}.`);
        setTripBlockAssignment(undefined);
        window.setTimeout(() => tripBlockAssignmentFocusRef.current?.focus());
      } catch (error) {
        setTripBlockAssignmentError(userFacingError(error, 'Unable to unassign the selected Trips. Reopen Blocking to check the Blocks, then try again.'));
        if (error instanceof Error && error.message.includes('changed since the operation was reviewed')) {
          void blockingService.listBlockingBlocks(tripBlockAssignment.blockingScenarioId).then(setTripBlockingBlocks).catch(() => undefined);
        }
      } finally { setBusy(false); }
      return;
    }
    const option = tripBlockOptions.find((item) => item.id === destinationBlockId);
    if (!option || option.disabled) { setTripBlockAssignmentError(option?.reason ?? 'Choose an available Block.'); return; }
    setBusy(true);
    setTripBlockAssignmentError('');
    try {
      const result = await blockingService.assignTripsToBlock({ blockingScenarioId: tripBlockAssignment.blockingScenarioId, serviceDayId: tripBlockAssignment.serviceDayId, tripIds: tripBlockAssignment.tripIds, destinationBlockId, sourceSignature: tripBlockAssignment.sourceSignature });
      setTripBlockingBlocks(result.blocks);
      setSelectedTripIds((ids) => ids.filter((id) => !tripBlockAssignment.tripIds.includes(id)));
      setTripBlockAssignmentStatus(`Assigned ${tripBlockAssignment.tripIds.length} Trip${tripBlockAssignment.tripIds.length === 1 ? '' : 's'} to ${option.label}.`);
      setTripBlockAssignment(undefined);
      window.setTimeout(() => tripBlockAssignmentFocusRef.current?.focus());
    } catch (error) {
      setTripBlockAssignmentError(userFacingError(error, 'Unable to assign the selected Trips. Reopen Blocking to check the Blocks, then try again.'));
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
    const target = pressed?.isConnected && !pressed.disabled ? pressed : shiftDrawerRef.current?.querySelector<HTMLElement>('button:not(:disabled)');
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
  // A new Trip row with a Pattern or a first time entered is lost when the service day, Direction, Trip Profile, or tab changes, so that
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
    } catch (error) { setShiftError(shiftErrorText(error, 'Unable to preview the selected Trips. Close the Shift drawer and try again.')); return false; }
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
    } catch (error) { setShiftError(shiftErrorText(error, 'Unable to preview the selected Trips. Close the Shift drawer and try again.')); }
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
      setShiftError(error instanceof TripShiftStalePreviewError || (error instanceof Error && error.name === 'TripShiftStalePreviewError') ? 'Selected Trips changed. Discard this review and reopen Shift.' : shiftErrorText(error, 'Unable to save the staged Shift. Your Trips were not changed. Try again.'));
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
  async function changeTripPattern(trip: Trip, targetPatternId: string) { try { const preview = await tripService.previewTripPatternChange(trip.id, targetPatternId, directionId); if (preview.finding) { onError(new TripGenerationError([preview.finding])); return; } await tripService.changeTripPattern(preview); clearTripShiftHistory(); await loadTrips(); } catch (error) { onError(error); } }
  async function saveDraftTrip() {
    if (!draftTrip?.patternId || !draftTrip.firstTrip.trim()) return;
    try { const firstTrip = parseServiceTime(draftTrip.firstTrip); setBusy(true); const result = await tripService.addTrip({ scenarioId: records.scenario.id, routeId: aggregate.route.id, serviceDayId, directionId, patternId: draftTrip.patternId, tripProfileId, firstTrip }); setDraftTrip(undefined); clearTripShiftHistory(); await loadTrips(); if (result.warnings.length) onError(new TripGenerationError(result.warnings)); } catch (error) { onError(error); } finally { setBusy(false); }
  }
  const changedRuntimeTripIds = new Set(tripsWithChangedRuntimes.map((trip) => trip.id));
  const selectedChangedRuntimeTripIds = selectedTripIds.filter((id) => changedRuntimeTripIds.has(id));
  async function finishRecalculation() { setRecalculationTripIds([]); setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips(); }
  async function undoRegeneration() {
    setBusy(true);
    try { await tripService.undoLastTripRegeneration(); setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips(); }
    catch (error) { onError(error, 'Unable to undo the last regeneration.'); await loadTrips(); }
    finally { setBusy(false); }
  }
  async function importTripsCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const parsed = parseTripTableCsv(await file.text());
      let preview: TripTableImportPreview | undefined;
      if (parsed.rows.length) preview = await tripService.previewTripTableImport({ scenarioId: records.scenario.id, routeId: aggregate.route.id, serviceDayId, directionId, tripProfileId }, parsed.rows);
      setTripImportPreview({ preview, issues: parsed.issues });
    } catch (error) { setTripImportPreview({ issues: [userFacingError(error, 'Unable to review the Trips CSV. Check that it is a file exported from Trips, then try again.')] }); }
  }
  async function applyTripsCsvImport() {
    if (!tripImportPreview?.preview || tripImportPreview.issues.length || tripImportPreview.preview.findings.some((finding) => finding.severity === 'error')) return;
    setBusy(true);
    try { await tripService.applyTripTableImport(tripImportPreview.preview); setTripImportPreview(undefined); setSelectedTripIds([]); clearTripShiftHistory(); await loadTrips(); }
    catch (error) { onError(error, 'Unable to import the Trips CSV. Review the file and try again.'); await loadTrips(); }
    finally { setBusy(false); }
  }
  function exportTripsCsv() {
    const safeName = `${aggregate.route.name || 'route'}-${selectedDay?.name || 'service-day'}-${selectedTripProfile?.name || 'trip-profile'}`.replaceAll(/[^a-z0-9]+/gi, '-').replaceAll(/^-|-$/g, '') || 'trips';
    download(`${safeName}-trips.csv`, tripTableCsv(trips, patterns, (nodeId) => aggregate.nodes.find((node) => node.id === nodeId)?.shortName || aggregate.nodes.find((node) => node.id === nodeId)?.name || 'Unnamed point',), 'text/csv;charset=utf-8');
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
    try { await tripService.deleteTrips(tripDeletion.tripIds, tripDeletion.reviewToken); setSelectedTripIds((ids) => ids.filter((id) => !tripDeletion.tripIds.includes(id))); setTripDeletion(undefined); clearTripShiftHistory(); await loadTrips(); }
    catch (error) { setTripDeletion(undefined); onError(error); } finally { setBusy(false); }
  }
  async function completeRuntimeCopy() { onRuntimeChanged(); }
  async function setRuntimeCalculationMethod(method: 'singleBand' | 'segmentStart') {
    if (!selectedProfile || runtimeEditorState.dirty) return;
    try { await service.saveRuntimeProfile({ ...selectedProfile, calculationMethod: method }); onRuntimeChanged(); }
    catch (error) { onError(error); }
  }
  async function importRuntimeCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try { runtimeEditorRef.current?.importRows(await file.text()); }
    catch (error) { onError(error, 'Unable to read the Runtime profile CSV. Check that it has the Runtime profile columns, then try again.'); }
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
  function closeBuildDrawer() { setBuildOpen(false); window.setTimeout(() => tripsActionsRef.current?.focus()); }
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
  const tripBlockingScenarioMenu: MenuGroup[] = [{ label: 'Blocking Scenarios', items: [
    ...(!blockingScenarios.length || !tripBlockingScenarioId ? [{ id: 'none', label: 'No Blocking Scenario', checked: true, disabled: tripProfileBusy, onSelect: () => requestShiftScopeChange(() => setTripBlockingScenarioId('')) }] : []),
    ...blockingScenarios.map((scenario) => ({ id: scenario.id, label: scenario.name, checked: scenario.id === tripBlockingScenarioId, disabled: tripProfileBusy, onSelect: () => requestShiftScopeChange(() => setTripBlockingScenarioId(scenario.id)) })),
  ] }];
  const canUndoRegeneration = lastRegenerationUndo?.scenarioId === records.scenario.id
    && lastRegenerationUndo.tripProfileId === tripProfileId
    && lastRegenerationUndo.afterTrips.length > 0
    && lastRegenerationUndo.afterTrips.every((trip) => trips.some((visibleTrip) => visibleTrip.id === trip.id));
  const tripActionsMenu: MenuGroup[] = [
    { label: 'Display', items: [{ id: 'show-runtime-bands', label: 'Show runtime bands', checked: showRuntimeBands, kind: 'checkbox', onSelect: () => setShowRuntimeBands((current) => !current) }, { id: 'show-headways', label: 'Show headways', checked: showHeadways, kind: 'checkbox', onSelect: () => setShowHeadways((current) => !current) }, { id: 'round-table-times', label: 'Round displayed times', checked: roundDisplayedTimes, kind: 'checkbox', onSelect: () => setRoundDisplayedTimes((current) => !current) }] },
    { label: 'Schedule', items: [
      { id: 'build', label: 'Build trips…', disabled: tripProfileBusy || shiftOperations.length > 0 || buildOpen, title: buildOpen ? 'The Build Trips drawer is already open.' : shiftOperations.length ? 'Discard the staged shift first.' : undefined, onSelect: () => setBuildOpen(true) },
      { id: 'add', label: 'Add trip…', disabled: Boolean(draftTrip) || tripProfileBusy || shiftOperations.length > 0, title: shiftOperations.length ? 'Discard the staged shift first.' : undefined, onSelect: () => setDraftTrip({ patternId: '', firstTrip: '' }) },
      { id: 'regenerate', label: canUndoRegeneration ? `Undo last regeneration (${lastRegenerationUndo?.afterTrips.length ?? 0} Trips)` : 'Regenerate selected…', disabled: busy || tripProfileBusy || shiftOperations.length > 0 || (!canUndoRegeneration && !selectedChangedRuntimeTripIds.length), title: shiftOperations.length ? 'Discard the staged shift first.' : canUndoRegeneration ? undefined : !selectedChangedRuntimeTripIds.length ? 'Select Trips with changed runtimes.' : undefined, onSelect: canUndoRegeneration ? () => void undoRegeneration() : () => setRecalculationTripIds([...selectedChangedRuntimeTripIds]) },
      { id: 'shift', label: 'Shift selected…', disabled: !selectedTripIds.length || busy || tripProfileBusy || shiftDrawerOpen, title: shiftDrawerOpen ? 'The Shift drawer is already open.' : !selectedTripIds.length ? 'Select one or more Trips.' : undefined, onSelect: () => void openShiftDrawer() },
      { id: 'change-pattern', label: 'Change pattern…', disabled: !selectedTripIds.length || busy || tripProfileBusy || shiftOperations.length > 0, title: shiftOperations.length ? 'Discard the staged shift first.' : !selectedTripIds.length ? 'Select one or more Trips.' : undefined, onSelect: () => setBatchPatternChangeOpen(true) },
      { id: 'assign-block', label: 'Assign Block…', disabled: !selectedTripIds.length || !selectedBlockingScenario || tripBlockingBlocksBusy || !tripBlockOptions.length || !hasAssignableTripBlock || busy || tripProfileBusy || shiftOperations.length > 0 || shiftDrawerOpen, title: !selectedTripIds.length ? 'Select one or more Trips.' : !selectedBlockingScenario ? 'Select a Blocking Scenario first.' : tripBlockingBlocksBusy ? 'Loading Blocks.' : !tripBlockOptions.length ? 'Create a Block in the selected Blocking Scenario first.' : !hasAssignableTripBlock ? 'No Blocks can accept Trips from the selected Route.' : shiftOperations.length || shiftDrawerOpen ? 'Finish or discard the staged shift first.' : undefined, restoreFocus: false, onSelect: () => openTripBlockAssignment(selectedTripIds, '', 'actions', tripsActionsRef.current) },
      { id: 'unassign-block', label: 'Unassign from Block…', destructive: true, disabled: !selectedTripIds.some((id) => tripBlockByTripId.has(id)) || !selectedBlockingScenario || tripBlockingBlocksBusy || busy || tripProfileBusy || shiftOperations.length > 0 || shiftDrawerOpen, title: !selectedTripIds.length ? 'Select one or more Trips.' : !selectedTripIds.some((id) => tripBlockByTripId.has(id)) ? 'Select at least one assigned Trip.' : !selectedBlockingScenario ? 'Select a Blocking Scenario first.' : shiftOperations.length || shiftDrawerOpen ? 'Finish or discard the staged shift first.' : undefined, restoreFocus: false, onSelect: () => openTripBlockAssignment(selectedTripIds, '', 'actions', tripsActionsRef.current, 'unassign') },
    ] },
    { label: 'Service day', items: [
      { id: 'copy-day', label: 'Copy Trips from day…', disabled: tripProfileBusy || shiftOperations.length > 0, title: shiftOperations.length ? 'Discard the staged shift first.' : undefined, onSelect: () => setTripCopyOpen(true) },
    ] },
    { label: 'Data', items: [
      { id: 'import-trips-csv', label: 'Import Trips CSV…', disabled: tripProfileBusy || busy || shiftOperations.length > 0, title: shiftOperations.length ? 'Discard the staged shift first.' : undefined, onSelect: () => tripsCsvInputRef.current?.click() },
      { id: 'export-trips-csv', label: 'Export Trips CSV', disabled: !trips.length, onSelect: exportTripsCsv },
    ] },
    { label: 'Delete', items: [{ id: 'delete', label: 'Delete selected…', destructive: true, disabled: !selectedTripIds.length || busy || tripProfileBusy || shiftOperations.length > 0, title: shiftOperations.length ? 'Discard the staged shift first.' : !selectedTripIds.length ? 'Select one or more Trips.' : undefined, onSelect: () => void requestTripDeletion(selectedTripIds) }] },
  ];
  const netShiftSeconds = shiftPreview?.netOffsetSeconds ?? 0;
  const netShiftLabel = formatNetShift(netShiftSeconds);
  const shiftStepLabel = parsedShiftSeconds === undefined ? '—' : `${parsedShiftSeconds / 60} min`;
  if (!directions.length) return <section className="empty-state"><p>Add a direction on the Route tab before defining runtimes or trips.</p></section>;
  if (!patterns.length) return <section className="trips-workspace"><section className="prerequisite"><h1 className="box-heading">Add a pattern on Route</h1><p>Choose a direction, then add a pattern with at least two points before entering runtimes or trips.</p></section></section>;
  return <div className="trips-workspace">
    <h1 className="visually-hidden">Trips and runtimes</h1>
    <section className="workflow-section" aria-label="Runtimes section">
      <div className="section-title"><div><h2>Runtimes</h2></div><div className="section-actions section-header-actions">
        <label className="header-field">Pattern<select value={patternId} disabled={tripProfileBusy} onChange={(event) => { const next = event.target.value; requestScopeChange(() => setPatternId(next)); }}>{patterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select></label>
        <MenuButton fieldLabel="Profile" label={selectedProfile?.name ?? 'Select profile'} menuLabel="Runtime profile" groups={runtimeProfileMenu} disabled={loading || tripProfileBusy} />
        {runtimeEditorState.dirty && <><span className="action-separator" aria-hidden="true" /><button onClick={() => { runtimeEditorRef.current?.discard(); window.setTimeout(() => runtimeCopyButtonRef.current?.focus()); }} disabled={runtimeEditorState.saving || tripProfileBusy}>Discard</button><button className="primary" onClick={() => saveRuntimeThen(() => { window.setTimeout(() => runtimeCopyButtonRef.current?.focus()); })} disabled={runtimeEditorState.saving || tripProfileBusy}>{runtimeEditorState.saving ? 'Saving…' : 'Save'}</button></>}
        <span className="action-separator" aria-hidden="true" />
        <MenuButton label="Actions" menuLabel="Runtime actions" groups={[
          { label: 'Calculation', items: [
            { id: 'single-band', label: 'Single band for trip', checked: selectedProfile?.calculationMethod === 'singleBand' || selectedProfile?.calculationMethod === undefined, disabled: !selectedProfile || runtimeEditorState.dirty || runtimeEditorState.saving || tripProfileBusy, onSelect: () => void setRuntimeCalculationMethod('singleBand') },
            { id: 'segment-start', label: 'Band at segment start', checked: selectedProfile?.calculationMethod === 'segmentStart', disabled: !selectedProfile || runtimeEditorState.dirty || runtimeEditorState.saving || tripProfileBusy, onSelect: () => void setRuntimeCalculationMethod('segmentStart') },
            ...(selectedProfile?.calculationMethod === 'blendSegments' ? [{ id: 'legacy-blend', label: 'Legacy continuous blend', checked: true, disabled: true, onSelect: () => {} }] : []),
          ] },
          { label: 'Edit runtimes', items: [
            { id: 'add-time-band', label: 'Add Time Band', disabled: !selectedProfile || runtimeEditorState.saving || tripProfileBusy, onSelect: () => runtimeEditorRef.current?.addBand() },
            { id: 'paste-runtime-rows', label: 'Paste rows…', disabled: !selectedProfile || runtimeEditorState.saving || tripProfileBusy, onSelect: () => runtimeEditorRef.current?.pasteRows() },
          ] },
          { label: 'Data', items: [
            { id: 'import-runtime-csv', label: 'Import profile CSV…', disabled: !selectedProfile || runtimeEditorState.dirty || runtimeEditorState.saving || tripProfileBusy, onSelect: () => runtimeCsvInputRef.current?.click() },
            { id: 'export-runtime-csv', label: 'Export profile CSV', disabled: !selectedProfile || runtimeEditorState.dirty || runtimeEditorState.saving, title: runtimeEditorState.dirty ? 'Save or discard runtime edits before exporting.' : runtimeEditorState.saving ? 'Wait for runtime changes to finish saving.' : undefined, onSelect: exportRuntimeCsv },
          ] },
          { label: 'Service day', items: [
            { id: 'copy-day', label: 'Copy runtimes from day…', disabled: loading || tripProfileBusy, onSelect: () => setRuntimeCopyOpen(true) },
          ] },
        ]} disabled={loading || tripProfileBusy} triggerRef={runtimeCopyButtonRef} />
      </div></div>
      {selectedProfile && <p className="profile-usage">Used by {dayNameList(profileDays.length ? profileDays.map((day) => day.name) : [selectedDay?.name ?? 'this service day'])} for {selectedPattern?.name}.</p>}
      <input ref={runtimeCsvInputRef} className="visually-hidden" tabIndex={-1} type="file" accept=".csv,text/csv" aria-label="Import Runtime profile CSV" onChange={(event) => void importRuntimeCsv(event)} />
      {selectedProfile && selectedPattern ? <RuntimeEditor2 ref={runtimeEditorRef} service={service} profile={selectedProfile} pattern={selectedPattern} nodes={aggregate.nodes} onStateChange={setRuntimeEditorState} onSaved={async () => onRuntimeChanged()} onError={onError} /> : <p className="runtime-status">Loading runtimes…</p>}
    </section>
    <section className="workflow-section" aria-label="Trips section">
      <div className="section-title"><div><h2>Trips</h2></div><div className="section-actions section-header-actions"><MenuButton fieldLabel="Profile" label={selectedTripProfile?.name ?? 'Select profile'} menuLabel="Trip Profile" groups={tripProfileMenu} disabled={tripProfileBusy || Boolean(tripBlockAssignment)} /><MenuButton fieldLabel="Blocking Scenario" label={selectedBlockingScenario?.name ?? 'No Blocking Scenario'} menuLabel="Blocking Scenario" groups={tripBlockingScenarioMenu} disabled={tripProfileBusy || Boolean(tripBlockAssignment)} /><span className="action-separator" aria-hidden="true" /><MenuButton label="Actions" menuLabel="Trip actions" groups={tripActionsMenu} disabled={tripProfileBusy || Boolean(tripBlockAssignment)} triggerRef={tripsActionsRef} /></div></div>
      <input ref={tripsCsvInputRef} className="visually-hidden" tabIndex={-1} type="file" accept=".csv,text/csv" aria-label="Import Trips CSV" onChange={(event) => void importTripsCsv(event)} />
      {tripsWithChangedRuntimes.length > 0 && <p className="section-status"><span className="runtime-change-indicator">Run Times Have Changed</span></p>}
      {staleReasons && <p className="section-status" role="status">{staleTripNoticeText(staleReasons)}</p>}
      {tripBlockAssignmentStatus && <p className="section-status" role="status">{tripBlockAssignmentStatus}</p>}
      <ScheduleTable trips={trips} previewTrips={shiftPreview?.shiftedTrips} stagedShiftSeconds={shiftPreview?.netOffsetSeconds} draft={draftTrip} patterns={patterns} direction={directions.find((direction) => directionId === direction.id)!} nodes={aggregate.nodes} runtimeProfiles={activeRuntimeProfiles} showRuntimeBands={showRuntimeBands} showHeadways={showHeadways} roundDisplayedTimes={roundDisplayedTimes} blockAssignments={tripBlockByTripId} tripConnections={tripConnections} blockWarnings={tripBlockWarnings} blockOptions={tripBlockOptions} blockAssignmentDisabled={busy || tripProfileBusy || tripBlockingBlocksBusy || shiftOperations.length > 0 || shiftDrawerOpen || Boolean(tripBlockAssignment)} onAssignBlock={(trip, blockId, trigger) => openTripBlockAssignment([trip.id], blockId, 'pill', trigger)} onUnassignBlock={(trip, trigger) => openTripBlockAssignment([trip.id], '', 'pill', trigger, 'unassign')} selectedIds={selectedTripIds} changedRuntimeTripIds={changedRuntimeTripIds} onToggle={(id, index, shiftKey) => requestShiftScopeChange(() => {
        setSelectedTripIds((current) => {
          const anchorIndex = selectionAnchorId.current ? trips.findIndex((trip) => trip.id === selectionAnchorId.current) : -1;
          if (shiftKey && anchorIndex >= 0) {
            const start = Math.min(anchorIndex, index); const end = Math.max(anchorIndex, index);
            return [...new Set([...current, ...trips.slice(start, end + 1).map((trip) => trip.id)])];
          }
          selectionAnchorId.current = id;
          return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
        });
      })} onSelectAll={(selected) => requestShiftScopeChange(() => { selectionAnchorId.current = undefined; setSelectedTripIds(selected ? trips.map((trip) => trip.id) : []); })} onDelete={(trip) => requestShiftScopeChange(() => void requestTripDeletion([trip.id]))} onPatternChange={(trip, targetPatternId) => requestShiftScopeChange(() => void changeTripPattern(trip, targetPatternId))} onDraftChange={setDraftTrip} onDraftSave={() => void saveDraftTrip()} onDraftCancel={() => setDraftTrip(undefined)} busy={busy || tripProfileBusy} />
    </section>
    {shiftDrawerOpen && <aside ref={shiftDrawerRef} className="shift-drawer shift-drawer--compact" role="complementary" aria-labelledby="shift-drawer-title" onClickCapture={(event) => { const control = (event.target as HTMLElement).closest('button'); if (control) lastShiftControl.current = control; }}>
      <header><h2 id="shift-drawer-title">Shift selected Trips</h2><button className="icon-button" type="button" aria-label="Close Shift drawer" title="Close Shift drawer" onClick={requestCloseShiftDrawer} disabled={busy}>×</button></header>
      <p className="shift-net" role="status"><strong>{netShiftLabel}</strong><span>{shiftPreview?.selectedTripIds.length ?? selectedTripIds.length} selected</span></p>
      <div className="shift-steps"><button type="button" disabled={!canShiftSelectedTrips || busy || tripProfileBusy} onClick={() => void appendStagedShift(-(parsedShiftSeconds ?? 0))}><span aria-hidden="true">← </span>{shiftStepLabel} earlier</button><button type="button" disabled={!canShiftSelectedTrips || busy || tripProfileBusy} onClick={() => void appendStagedShift(parsedShiftSeconds ?? 0)}>{shiftStepLabel} later<span aria-hidden="true"> →</span></button></div>
      <fieldset className="shift-step-size" disabled={tripProfileBusy || busy}><legend>Step</legend>{SHIFT_STEP_PRESETS.map((minutes) => <label key={minutes} className="shift-step-preset"><input type="radio" name="shift-step" value={minutes} checked={shiftMinutes.trim() === String(minutes)} onChange={() => setShiftMinutes(String(minutes))} />{minutes}</label>)}<label className="shift-step-other"><input aria-label="Step minutes" type="number" min="1" step="1" inputMode="numeric" value={shiftMinutes} aria-invalid={parsedShiftSeconds === undefined} aria-describedby={parsedShiftSeconds === undefined ? 'shift-step-error' : undefined} onChange={(event) => setShiftMinutes(event.target.value)} /> min</label></fieldset>
      {parsedShiftSeconds === undefined && <p id="shift-step-error" className="field-error">Enter a whole number of minutes above 0.</p>}
      {shiftError && <p className="field-error" role="alert">{shiftError}</p>}
      <footer><button type="button" disabled={!shiftOperations.length || busy} onClick={() => void undoStagedShift()}>Undo</button><button type="button" disabled={!redoShiftOperations.length || busy} onClick={() => void redoStagedShift()}>Redo</button><span className="grow" /><button type="button" onClick={() => discardStagedShift()} disabled={busy}>Discard</button><button className="primary" type="button" onClick={() => void completeStagedShift()} disabled={busy || Boolean(shiftError)}>{busy ? 'Saving…' : 'Done'}</button></footer>
    </aside>}
    {tripBlockAssignment?.operation === 'assign' && <TripBlockAssignmentDialog draft={tripBlockAssignment} blockingScenarioName={selectedBlockingScenario?.name ?? 'Blocking Scenario'} serviceDayName={selectedDay?.name ?? 'selected service day'} blocks={dayBlockingBlocks} blockOptions={tripBlockOptions} currentAssignments={tripBlockByTripId} onConfirm={(destinationId) => void confirmTripBlockAssignment(destinationId)} onClose={closeTripBlockAssignment} busy={busy} error={tripBlockAssignmentError} />}
    {tripBlockAssignment?.operation === 'unassign' && <TripBlockUnassignmentDialog draft={tripBlockAssignment} blockingScenarioName={selectedBlockingScenario?.name ?? 'Blocking Scenario'} serviceDayName={selectedDay?.name ?? 'selected service day'} blocks={dayBlockingBlocks} currentAssignments={tripBlockByTripId} onConfirm={() => void confirmTripBlockAssignment('')} onClose={closeTripBlockAssignment} busy={busy} error={tripBlockAssignmentError} />}
    {runtimeLeave && <RouteNavigationDraftDialog title="Save Runtime changes before leaving?" text="The Runtime profile has unsaved edits." onCancel={() => setRuntimeLeave(undefined)} onDiscard={() => { const { action, leavesContext } = runtimeLeave; setRuntimeLeave(undefined); runtimeEditorRef.current?.discard(); (leavesContext ? requestShiftAndDraftScopeChange : requestShiftScopeChange)(action); }} onSave={() => { const { action, leavesContext } = runtimeLeave; setRuntimeLeave(undefined); saveRuntimeThen(action, leavesContext); }} />}
    {shiftDiscardAction && <ShiftDiscardDialog onDiscard={() => discardStagedShift(shiftDiscardAction)} onCancel={() => setShiftDiscardAction(undefined)} />}
    {draftTripDiscardAction && <ShiftDiscardDialog title="Discard new Trip?" text="The new Trip row has not been added. Discard it before leaving this schedule context?" onDiscard={() => { const action = draftTripDiscardAction; setDraftTripDiscardAction(undefined); setDraftTrip(undefined); action(); }} onCancel={() => setDraftTripDiscardAction(undefined)} />}
    {runtimeDialog && <RuntimeProfileDialog2 dialog={runtimeDialog} candidates={reverseCandidates} onSubmit={submitRuntimeDialog} onClose={() => setRuntimeDialog(undefined)} />}
    {deleteProfileOpen && selectedProfile && profileDeletionImpact && <DeleteRuntimeProfileDialog profile={selectedProfile} profiles={profiles} assignmentCount={profileDeletionImpact.assignmentCount} tripCount={profileDeletionImpact.tripCount} onDelete={deleteProfile} onClose={() => { setDeleteProfileOpen(false); setProfileDeletionImpact(undefined); }} />}
    {buildOpen && <BuildTripsDrawer tripService={tripService} scenarioId={records.scenario.id} routeId={aggregate.route.id} serviceDayId={serviceDayId} tripProfileId={tripProfileId} patterns={patterns} profileName={selectedProfile?.name} initialValues={buildValues.current} onValuesChange={(values) => { buildValues.current = values; }} onDone={async () => { buildValues.current = EMPTY_BUILD_VALUES; closeBuildDrawer(); clearTripShiftHistory(); await loadTrips(); }} onClose={closeBuildDrawer} />}
    {tripDeletion && <DeleteTripsDialog tripCount={tripDeletion.tripIds.length} affectedBlockCount={tripDeletion.affectedBlockIds.length} onDelete={() => void deleteTrips()} onClose={() => setTripDeletion(undefined)} busy={busy} />}
    {recalculationTripIds.length > 0 && <RecalculationDialog tripService={tripService} tripIds={recalculationTripIds} trips={trips} patterns={aggregate.patterns} nodes={aggregate.nodes} runtimeProfiles={activeRuntimeProfiles} onDone={finishRecalculation} onClose={() => setRecalculationTripIds([])} />}
    {tripImportPreview && <TripTableImportDialog preview={tripImportPreview.preview} issues={tripImportPreview.issues} patterns={aggregate.patterns} busy={busy} onConfirm={() => void applyTripsCsvImport()} onClose={() => setTripImportPreview(undefined)} />}
    {runtimeCopyOpen && selectedDay && <RuntimeDayCopyDialog tripService={tripService} scenarioId={records.scenario.id} routeId={aggregate.route.id} routeName={aggregate.route.name || 'Untitled route'} targetDay={selectedDay} days={days} patterns={aggregate.patterns.filter(isUsablePattern)} onDone={completeRuntimeCopy} onClose={closeRuntimeCopy} onError={onError} />}
    {tripCopyOpen && selectedDay && <TripDayCopyDialog tripService={tripService} scenarioId={records.scenario.id} routeId={aggregate.route.id} tripProfileId={tripProfileId} routeName={aggregate.route.name || 'Untitled route'} tripProfileName={(records.tripProfiles ?? []).find((profile) => profile.id === tripProfileId)?.name || 'Trip Profile'} targetDay={selectedDay} days={days} patterns={aggregate.patterns} onDone={completeTripCopy} onClose={closeTripCopy} onError={onError} />}
    {batchPatternChangeOpen && <BatchPatternChangeDialog tripService={tripService} tripIds={selectedTripIds} patterns={patterns} trips={trips} onDone={completeTripCopy} onClose={closeBatchPatternChange} onError={onError} />}
  </div>;
}

const RuntimeEditor2 = forwardRef<RuntimeEditorHandle, { service: RouteDefinitionApplication; profile: RuntimeProfile; pattern: RoutePattern; nodes: Node[]; onStateChange: (state: RuntimeEditorState) => void; onSaved: () => Promise<void>; onError: (error: unknown) => void }>(function RuntimeEditor2({ service, profile, pattern, nodes, onStateChange, onSaved, onError }, ref) {
  const [draft, setDraft] = useState(profile);
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [saving, setSaving] = useState(false);
  const [pasteRowsOpen, setPasteRowsOpen] = useState(false);
  const [pasteInitialText, setPasteInitialText] = useState('');
  const profileSignature = JSON.stringify(profile);
  const lastProfileSignature = useRef(profileSignature);
  useEffect(() => {
    if (lastProfileSignature.current === profileSignature) return;
    lastProfileSignature.current = profileSignature;
    setDraft(profile);
    setFindings([]);
  }, [profile, profileSignature]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const nodeName = (id: string) => nodes.find((node) => node.id === id)?.shortName || nodes.find((node) => node.id === id)?.name || 'Unnamed point';
  const updateBand = (index: number, patch: Partial<RuntimeProfile['bands'][number]>) => setDraft((current) => updateRuntimeBand(current, index, patch));
  const addBand = () => setDraft((current) => addRuntimeBand(current, pattern.points.length - 1));
  const duplicateBand = (index: number) => setDraft((current) => duplicateRuntimeBand(current, index));
  const discard = () => { setDraft(profile); setFindings([]); };
  const openPasteRows = (initialText = '') => { setPasteInitialText(initialText); setPasteRowsOpen(true); };
  function applyPastedProfile(nextProfile: RuntimeProfile) {
    setDraft(nextProfile);
    setFindings([]);
    setPasteRowsOpen(false);
  }
  async function save(): Promise<boolean> {
    const nextFindings = await service.validateRuntimeProfile(draft, pattern);
    setFindings(nextFindings);
    if (nextFindings.some((finding) => finding.severity === 'error')) return false;
    setSaving(true);
    try { await service.saveRuntimeProfile(draft); await onSaved(); return true; } catch (error) { onError(error); return false; } finally { setSaving(false); }
  }
  useImperativeHandle(ref, () => ({ addBand, discard, pasteRows: () => openPasteRows(), importRows: (contents) => openPasteRows(contents), save }), [draft, profile, pattern]);
  useEffect(() => onStateChange({ dirty, saving }), [dirty, saving, onStateChange]);
  return <div className="runtime-editor">
    <div className="table-scroll data-grid runtime-table"><table>
      <thead><tr><th scope="col">From</th><th scope="col">To</th>{pattern.points.slice(1).map((point, index) => <th scope="col" key={point.id}><span className="segment-header">{nodeName(pattern.points[index].nodeId)} → {nodeName(point.nodeId)}</span></th>)}<th scope="col" className="runtime-total-heading">Total</th><th scope="col"><span className="visually-hidden">Time band actions</span></th></tr></thead>
      <tbody>{draft.bands.map((band, bandIndex) => <tr key={band.id} className={findings.some((finding) => finding.parameters?.bandId === band.id || finding.parameters?.previousBandId === band.id) ? 'runtime-row-error' : undefined}>
        <td><RuntimeTimeInput label={`Time band ${bandIndex + 1} start`} value={band.startTime} onCommit={(value) => updateBand(bandIndex, { startTime: value })} /></td>
        <td><RuntimeTimeInput label={`Time band ${bandIndex + 1} end`} value={band.endTime} onCommit={(value) => updateBand(bandIndex, { endTime: value })} /></td>
        {band.segmentRuntimeSeconds.map((value, segmentIndex) => <td key={`${band.id}-${segmentIndex}`}><RuntimeTimeInput label={`Time band ${bandIndex + 1} segment ${segmentIndex + 1}`} value={value} duration onCommit={(next) => updateBand(bandIndex, { segmentRuntimeSeconds: band.segmentRuntimeSeconds.map((item, index) => index === segmentIndex ? next : item) })} /></td>)}
        <td className="runtime-total">{formatRuntimeDuration(runtimeBandTotalSeconds(band))}</td>
        <td><div className="row-actions"><button className="icon-button" onClick={() => duplicateBand(bandIndex)} aria-label={`Duplicate time band ${bandIndex + 1}`} title="Duplicate time band"><CopyIcon /></button><button className="icon-button icon-button--danger" onClick={() => setDraft((current) => removeRuntimeBand(current, bandIndex))} aria-label={`Remove time band ${bandIndex + 1}`} title="Remove time band"><TrashIcon /></button></div></td>
      </tr>)}{draft.bands.length === 0 && <tr><td colSpan={pattern.points.length + 3} className="table-empty">Add a time band to enter runtimes.</td></tr>}</tbody>
    </table></div>
    {findings.length > 0 && <p className="field-error" role="alert">{[...new Set(findings.map(userMessage))].join(' ')}</p>}
    {pasteRowsOpen && <RuntimePasteDialog service={service} baseProfile={draft} pattern={pattern} nodes={nodes} initialText={pasteInitialText} onApply={applyPastedProfile} onClose={() => setPasteRowsOpen(false)} />}
  </div>;
});

const CALCULATION_METHOD_LABELS: Record<NonNullable<RuntimeProfile['calculationMethod']>, string> = { singleBand: 'Single band for trip', segmentStart: 'Band at segment start', blendSegments: 'Legacy continuous blend' };
const methodLabel = (method: RuntimeProfile['calculationMethod']) => CALCULATION_METHOD_LABELS[method ?? 'singleBand'];
/** The line of the Runtime paste preview that names the calculation method the profile will have after the rows are applied. */
function pasteMethodText(mode: 'replace' | 'append', current: RuntimeProfile['calculationMethod'], pasted: RuntimeProfile['calculationMethod']): string {
  const kept = methodLabel(current);
  if (mode === 'append') return `Calculation method: ${kept} (kept; Append does not change the method${pasted && pasted !== (current ?? 'singleBand') ? `, and the pasted rows name ${methodLabel(pasted)}` : ''}).`;
  if (pasted && pasted !== (current ?? 'singleBand')) return `Calculation method: ${methodLabel(pasted)} (from the pasted rows, replacing ${kept}).`;
  return `Calculation method: ${kept} (${pasted ? 'as pasted' : 'unchanged'}).`;
}

function RuntimePasteDialog({ service, baseProfile, pattern, nodes, initialText, onApply, onClose }: { service: RouteDefinitionApplication; baseProfile: RuntimeProfile; pattern: RoutePattern; nodes: Node[]; initialText: string; onApply: (profile: RuntimeProfile) => void; onClose: () => void }) {
  const [text, setText] = useState(initialText);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [parseIssues, setParseIssues] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<RuntimePasteRow[]>([]);
  const [candidate, setCandidate] = useState<RuntimeProfile>();
  const [pastedMethod, setPastedMethod] = useState<RuntimeProfile['calculationMethod']>();
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const segmentCount = Math.max(0, pattern.points.length - 1);
  const hasValidationErrors = findings.some((finding) => finding.severity === 'error');
  const previewBands = candidate ? (mode === 'append' ? candidate.bands.slice(baseProfile.bands.length) : candidate.bands) : [];
  const segmentName = (index: number) => {
    const from = nodes.find((node) => node.id === pattern.points[index]?.nodeId);
    const to = nodes.find((node) => node.id === pattern.points[index + 1]?.nodeId);
    const fromName = from?.shortName || from?.name || 'Unnamed point';
    const toName = to?.shortName || to?.name || 'Unnamed point';
    return `${fromName} → ${toName}`;
  };

  function clearReview() {
    setParseIssues([]);
    setParsedRows([]);
    setCandidate(undefined);
    setFindings([]);
  }

  async function reviewRows() {
    setReviewing(true);
    clearReview();
    try {
      const rows = parseRuntimePaste(text, segmentCount);
      // Replace applies the method that the pasted rows name, else keeps the profile's own. Append never changes the method (finding 4-025).
      const { profile: nextProfile, pastedMethod } = applyPastedRuntimeRows(baseProfile, rows, mode);
      setPastedMethod(pastedMethod);
      const nextFindings = await service.validateRuntimeProfile(nextProfile, pattern);
      setParsedRows(rows);
      setCandidate(nextProfile);
      setFindings(nextFindings);
    } catch (error) {
      setParseIssues(error instanceof RuntimePasteParseError ? error.issues : ['Unable to read the pasted runtime rows. Copy the rows from the spreadsheet again and paste them again.']);
    } finally {
      setReviewing(false);
    }
  }

  function changeText(value: string) {
    setText(value);
    clearReview();
  }

  function changeMode(value: 'replace' | 'append') {
    setMode(value);
    clearReview();
  }

  const canApply = Boolean(candidate && parsedRows.length && !hasValidationErrors && !parseIssues.length && !reviewing);
  return <ModalDialog labelledBy="runtime-paste-title" className="confirm-dialog runtime-paste-dialog" onClose={onClose} busy={reviewing}>
    <h2 id="runtime-paste-title">Paste runtime rows</h2>
    <p>Paste rows with From, To, and one runtime for each segment in the selected Pattern. Use tabs copied from a spreadsheet or comma-separated CSV. A header row is optional; Band and calculated Total columns are accepted when named in the header.</p>
    <fieldset className="copy-mode">
      <legend>Apply pasted rows</legend>
      <label><input type="radio" name="runtime-paste-mode" checked={mode === 'replace'} onChange={() => changeMode('replace')} /> Replace all {baseProfile.bands.length} current time band{baseProfile.bands.length === 1 ? '' : 's'}</label>
      <small>The pasted rows become the complete runtime profile.</small>
      <label><input type="radio" name="runtime-paste-mode" checked={mode === 'append'} onChange={() => changeMode('append')} /> Append after the {baseProfile.bands.length} current time band{baseProfile.bands.length === 1 ? '' : 's'}</label>
      <small>Existing time bands stay in the draft. The combined profile must still pass validation.</small>
    </fieldset>
    <label className="dialog-field" htmlFor="runtime-paste-text">Spreadsheet or CSV rows<textarea id="runtime-paste-text" className="runtime-paste-input" autoFocus value={text} onChange={(event) => changeText(event.target.value)} placeholder={'From\tTo\tSegment 1\tSegment 2\n05:00\t06:00\t12\t15'} /></label>
    <p className="copy-scope">Times may exceed 24:00. Segment runtimes accept minutes or MM:SS. Total is calculated and is not imported.</p>
    {parseIssues.length > 0 && <section className="runtime-findings" role="alert"><strong>Fix the pasted rows</strong><ul>{parseIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></section>}
    {findings.length > 0 && <section className={hasValidationErrors ? 'runtime-findings' : 'runtime-paste-notes'} role={hasValidationErrors ? 'alert' : 'status'}><strong>{hasValidationErrors ? 'The pasted profile has validation errors' : 'Review profile findings'}</strong><ul>{[...new Set(findings.map(userMessage))].map((message) => <li key={message}>{message}</li>)}</ul></section>}
    {candidate && <section className="runtime-paste-preview" aria-label="Runtime row preview">
      <h3>{previewBands.length} pasted time band{previewBands.length === 1 ? '' : 's'}</h3>
      <p className="runtime-paste-method">{pasteMethodText(mode, baseProfile.calculationMethod, pastedMethod)}</p>
      <div className="table-scroll"><table><thead><tr><th scope="col">Source row</th><th scope="col">From</th><th scope="col">To</th>{Array.from({ length: segmentCount }, (_, index) => <th scope="col" key={index}><span className="segment-header">{segmentName(index)}</span></th>)}<th scope="col" className="runtime-total-heading">Total</th></tr></thead>
        <tbody>{previewBands.map((band, index) => <tr key={band.id}><td>{parsedRows[index]?.sourceRowNumber ?? '—'}</td><td>{formatServiceTime(band.startTime)}</td><td>{formatServiceTime(band.endTime)}</td>{band.segmentRuntimeSeconds.map((duration, segmentIndex) => <td key={`${band.id}-${segmentIndex}`}>{formatRuntimeDuration(duration)}</td>)}<td className="runtime-total">{formatRuntimeDuration(runtimeBandTotalSeconds(band))}</td></tr>)}</tbody>
      </table></div>
      <p>Applying changes the editor draft only. Use Save in the Runtimes header to save the profile.</p>
    </section>}
    <div className="dialog-actions"><button type="button" onClick={onClose} disabled={reviewing}>Cancel</button><button type="button" onClick={() => void reviewRows()} disabled={reviewing || !text.trim()}>{reviewing ? 'Reviewing…' : 'Review rows'}</button>{candidate && <button className="primary" type="button" onClick={() => onApply(candidate)} disabled={!canApply}>{mode === 'replace' ? `Replace with ${previewBands.length} rows` : `Append ${previewBands.length} rows`}</button>}</div>
  </ModalDialog>;
}

function TripTableImportDialog({ preview, issues, patterns, busy, onConfirm, onClose }: { preview?: TripTableImportPreview; issues: string[]; patterns: RoutePattern[]; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const findings = preview?.findings ?? [];
  const errors = findings.filter((finding) => finding.severity === 'error');
  const canImport = Boolean(preview?.trips.length) && issues.length === 0 && errors.length === 0 && !busy;
  return <ModalDialog labelledBy="trip-import-title" className="confirm-dialog trip-import-dialog" onClose={onClose} busy={busy}>
    <h2 id="trip-import-title">Review Trips CSV</h2>
    {preview && <p>{preview.createdCount} new · {preview.updatedCount} updated in the selected Route, Direction, service day, and Trip Profile.</p>}
    {!preview && !issues.length && <p>No importable rows were found.</p>}
    {(issues.length > 0 || errors.length > 0) && <section className="runtime-findings" role="alert"><strong>Fix the CSV before importing</strong><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}{errors.map((finding, index) => <li key={`${finding.entityId}-${finding.messageKey}-${index}`}>{userMessage(finding)}</li>)}</ul></section>}
    {preview && preview.trips.length > 0 && <div className="trip-import-preview"><table><thead><tr><th scope="col">Trip</th><th scope="col">Pattern</th><th scope="col">First</th><th scope="col">Last</th></tr></thead><tbody>{preview.trips.slice(0, 8).map((trip) => <tr key={trip.id}><td>{trip.publicLabel || `Trip departing ${trip.stopTimes[0] ? formatServiceTime(trip.stopTimes[0].time, trip.stopTimes[0].time % 60 !== 0) : '—'}`}</td><td>{patterns.find((pattern) => pattern.id === trip.patternId)?.name || 'Unnamed Pattern'}</td><td>{trip.stopTimes[0] ? formatServiceTime(trip.stopTimes[0].time, trip.stopTimes[0].time % 60 !== 0) : '—'}</td><td>{trip.stopTimes.at(-1) ? formatServiceTime(trip.stopTimes.at(-1)!.time, trip.stopTimes.at(-1)!.time % 60 !== 0) : '—'}</td></tr>)}</tbody></table>{preview.trips.length > 8 && <small>Showing 8 of {preview.trips.length} rows.</small>}</div>}
    {findings.some((finding) => finding.severity === 'warning') && <p role="status">{findings.filter((finding) => finding.severity === 'warning').map(userMessage).join(' ')}</p>}
    <div className="dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" type="button" onClick={onConfirm} disabled={!canImport}>{busy ? 'Importing…' : `Import ${preview?.trips.length ?? 0} Trips`}</button></div>
  </ModalDialog>;
}

function formatTripTableClock(value: number, roundToMinute: boolean): string {
  const display = roundToMinute ? roundServiceTimeToMinute(value) : value;
  return formatServiceTime(display, display % 60 !== 0);
}

type StickyScheduleHeaderMetrics = { left: number; width: number; height: number; tableWidth: number; columnWidths: number[] };

function ScheduleTable({ trips, previewTrips, stagedShiftSeconds, draft, patterns, direction, nodes, runtimeProfiles, showRuntimeBands, showHeadways, roundDisplayedTimes, blockAssignments, tripConnections, blockWarnings, blockOptions, blockAssignmentDisabled, onAssignBlock, onUnassignBlock, selectedIds, changedRuntimeTripIds, onToggle, onSelectAll, onDelete, onPatternChange, onDraftChange, onDraftSave, onDraftCancel, busy }: { trips: Trip[]; previewTrips?: Trip[]; stagedShiftSeconds?: number; draft?: { patternId: string; firstTrip: string }; patterns: RoutePattern[]; direction: NonNullable<RouteDefinitionAggregate['directions']>[number]; nodes: Node[]; runtimeProfiles: Map<string, RuntimeProfile | undefined>; showRuntimeBands: boolean; showHeadways: boolean; roundDisplayedTimes: boolean; blockAssignments: Map<string, BlockingBlock>; tripConnections: Map<string, { connection: BlockConnection; deadheadSeconds?: number; nextTripStart?: number }>; blockWarnings: Map<string, string[]>; blockOptions: TripBlockOption[]; blockAssignmentDisabled: boolean; onAssignBlock: (trip: Trip, blockId: string, trigger: HTMLButtonElement | null) => void; onUnassignBlock: (trip: Trip, trigger: HTMLButtonElement | null) => void; selectedIds: string[]; changedRuntimeTripIds: Set<string>; onToggle: (id: string, index: number, shiftKey: boolean) => void; onSelectAll: (selected: boolean) => void; onDelete: (trip: Trip) => void; onPatternChange: (trip: Trip, patternId: string) => void; onDraftChange: (draft: { patternId: string; firstTrip: string }) => void; onDraftSave: () => void; onDraftCancel: () => void; busy: boolean }) {
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
  const tableHeader = <thead><tr><th scope="col" className="trip-selection-column"><input type="checkbox" aria-label="Select all trips" checked={allTripsSelected} disabled={busy} onChange={(event) => onSelectAll(event.target.checked)} /></th><th scope="col" className="trip-pattern-column">Pattern</th>{columns.map((column) => <th scope="col" className="trip-timepoint-column" key={column.id}>{columnName(column)}</th>)}<th scope="col" className="trip-run-time-column">Run Time</th><th scope="col" className="trip-connection-column">Layover</th><th scope="col" className="trip-connection-column">Deadhead</th><th scope="col" className="trip-next-trip-column">Next Trip</th><th scope="col" className="trip-block-column">Block</th><th scope="col" className="trip-actions-column"><span className="visually-hidden">Actions</span></th></tr></thead>;
  return <>{<div className={showRuntimeBands ? 'schedule-band-view' : undefined}>{showRuntimeBands && <div className="runtime-band-legend" aria-label="Runtime band legend">{visibleBands.map((band) => <span key={band.id}><i style={{ backgroundColor: bandColor(band.id) }} />{band.label} {formatServiceTime(band.startTime)}–{formatServiceTime(band.endTime)}</span>)}</div>}<div ref={scheduleViewportRef} className="table-scroll data-grid schedule-table"><table>{tableHeader}<tbody>{draft && <DraftTripRow draft={draft} patterns={patterns} columns={columns} onChange={onDraftChange} onSave={onDraftSave} onCancel={onDraftCancel} busy={busy} />}{trips.map((savedTrip, tripIndex) => { const trip = previewById.get(savedTrip.id) ?? savedTrip; const pattern = patterns.find((item) => item.id === trip.patternId); const rowView = view.rows.get(savedTrip.id); const runtime = rowView?.runTimeSeconds; const singleBand = rowView?.singleBand; const segments = rowView?.segments; const duplicate = rowView?.duplicate ?? false; const runtimesChanged = changedRuntimeTripIds.has(trip.id); const staged = previewById.has(savedTrip.id) && stagedLabel; const assignedBlock = blockAssignments.get(savedTrip.id); const tripConnection = assignedBlock ? tripConnections.get(savedTrip.id) : undefined; const blockWarning = assignedBlock ? blockWarnings.get(savedTrip.id)?.join('\n') : undefined; const rowClass = [selectedIds.includes(trip.id) && 'trip-row-selected', runtimesChanged && 'trip-row-runtime-changed', staged && 'trip-row-staged-shift'].filter(Boolean).join(' ') || undefined; return <tr key={trip.id} className={rowClass}><td className="trip-selection-column"><input type="checkbox" aria-label={`Select ${pattern?.name || 'trip'}`} checked={selectedIds.includes(trip.id)} disabled={busy} onClick={(event) => onToggle(trip.id, tripIndex, event.shiftKey)} /></td><td className="trip-pattern-column"><select className="trip-pattern-select" aria-label="Trip pattern" title={pattern?.name} value={trip.patternId} disabled={busy} onChange={(event) => void onPatternChange(savedTrip, event.target.value)}>{patterns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{runtimesChanged && <span className="runtime-changed-note">Run times changed</span>}{staged && <span className="staged-shift-note">{staged}</span>}{duplicate && <span className="duplicate-note">Duplicate departure</span>}</td>{columns.map((column) => { const point = pattern ? pointFor(pattern, column.id) : undefined; const time = point && trip.stopTimes.find((item) => item.patternPointId === point.id)?.time; const segmentIndex = pattern?.points.findIndex((item) => item.id === point?.id) ?? -1; const contribution = segmentIndex > 0 && time !== undefined ? segments?.[segmentIndex - 1]?.contributions ?? (singleBand ? [{ bandId: singleBand.id, bandLabel: singleBand.label, seconds: 1 }] : undefined) : undefined; const total = contribution?.reduce((sum, part) => sum + part.seconds, 0) ?? 0; let percent = 0; const stops = contribution?.map((part) => { const start = percent; percent += total ? part.seconds / total * 100 : 100; return `${bandColor(part.bandId)} ${start}% ${percent}%`; }); const detail = singleBand?.label ?? contribution?.map((part) => `${part.bandLabel}: ${formatRuntimeDuration(Math.round(part.seconds))}`).join(' + '); const exactTime = time === undefined ? undefined : formatTripTableClock(time, false); const roundedTime = time === undefined ? undefined : formatTripTableClock(time, roundDisplayedTimes); const headway = showHeadways && time !== undefined ? headwaysByColumn.get(column.id)?.get(trip.id) : undefined; const firstAtPoint = Boolean(headway && headway.previousTime === undefined); const displayedValue = time === undefined ? '—' : headway?.previousTime === undefined ? roundedTime : formatTripConnectionDuration(time - headway.previousTime); const headwayTitle = headway ? headway.previousTime === undefined ? `First scheduled time: ${exactTime}` : `Headway from ${formatTripTableClock(headway.previousTime, false)} to ${exactTime}` : undefined; const cellTitle = [detail, headwayTitle, roundDisplayedTimes && exactTime !== roundedTime ? `Exact: ${exactTime}` : undefined].filter(Boolean).join(' · '); return <td className={`trip-timepoint-column${firstAtPoint ? ' trip-headway-first' : ''}`} key={column.id} style={stops?.length ? { backgroundImage: `linear-gradient(90deg, ${stops.join(', ')})` } : undefined} title={cellTitle || undefined}>{displayedValue}</td>; })}<td className="trip-run-time-column">{runtime === undefined ? '—' : formatRuntimeDuration(runtime)}</td><td className="trip-connection-column">{tripConnection?.connection.usableLayoverSeconds === undefined ? '' : formatTripConnectionDuration(tripConnection.connection.usableLayoverSeconds)}</td><td className="trip-connection-column">{tripConnection?.connection.deadhead ? formatTripConnectionDuration(tripConnection.deadheadSeconds) : ''}</td><td className="trip-next-trip-column">{tripConnection?.nextTripStart === undefined ? '' : formatTripTableClock(tripConnection.nextTripStart, roundDisplayedTimes)}</td><td className="trip-block-column"><div className="trip-block-content"><TripBlockAssignmentControl trip={savedTrip} patternName={pattern?.name || 'Trip'} assignedBlock={assignedBlock} options={blockOptions} disabled={blockAssignmentDisabled} onChoose={(blockId, trigger) => onAssignBlock(savedTrip, blockId, trigger)} onUnassign={(trigger) => onUnassignBlock(savedTrip, trigger)} />{blockWarning && <span className="trip-block-warning" role="img" aria-label={blockWarning} title={blockWarning} tabIndex={0}>!</span>}</div></td><td className="trip-actions-column"><button className="icon-button icon-button--danger" disabled={busy} onClick={() => onDelete(savedTrip)} aria-label="Delete trip" title="Delete trip"><TrashIcon /></button></td></tr>; })}{!trips.length && !draft && <tr><td colSpan={columns.length + 8} className="table-empty">Use Build Trips or Add Trip to begin this schedule.</td></tr>}</tbody></table></div></div>}{stickyHeaderMetrics && createPortal(<div ref={stickyHeaderViewportRef} className="table-scroll data-grid schedule-table sticky-schedule-header" role="region" aria-label="Trips table headings while scrolling" style={{ left: `${stickyHeaderMetrics.left}px`, width: `${stickyHeaderMetrics.width}px`, height: `${stickyHeaderMetrics.height}px` }}><table style={{ width: `${stickyHeaderMetrics.tableWidth}px`, minWidth: `${stickyHeaderMetrics.tableWidth}px`, tableLayout: 'fixed' }}><colgroup>{stickyHeaderMetrics.columnWidths.map((width, index) => <col key={index} style={{ width: `${width}px` }} />)}</colgroup>{tableHeader}</table></div>, document.body)}</>;
}

function formatTripConnectionDuration(seconds?: number) { return seconds === undefined || !Number.isInteger(seconds) ? '' : `${seconds < 0 ? '−' : ''}${formatServiceTime(Math.abs(seconds), seconds % 60 !== 0)}`; }

function blockConnectionWarningMessage(ruleId: string): string {
  const messages: Record<string, string> = {
    'block.connectionOverlap': 'Trips overlap in time.',
    'block.connectionTimesMissing': 'Trip times are incomplete.',
    'block.deadheadDoesNotFit': 'The assigned deadhead does not fit before the next trip.',
    'block.deadheadMissing': 'A deadhead is needed between these trips.',
    'block.deadheadNodeDiscontinuity': 'The deadhead nodes do not connect these trips.',
  };
  return messages[ruleId] ?? 'Review this Block connection.';
}

function TripBlockAssignmentControl({ trip, patternName, assignedBlock, options, disabled, onChoose, onUnassign }: { trip: Trip; patternName: string; assignedBlock?: BlockingBlock; options: TripBlockOption[]; disabled: boolean; onChoose: (blockId: string, trigger: HTMLButtonElement | null) => void; onUnassign: (trigger: HTMLButtonElement | null) => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!options.length) return assignedBlock ? <span className={blockPillClass(assignedBlock.label)}>{assignedBlock.label}</span> : <span className="trip-block-unassigned">Unassigned</span>;
  const departure = trip.stopTimes[0]?.time;
  const label = assignedBlock?.label ?? 'Unassigned';
  const groups: MenuGroup[] = [{ label: 'Available Blocks', items: options.map((option) => ({
    id: option.id,
    label: option.label,
    checked: option.id === assignedBlock?.id,
    disabled: disabled || option.disabled || option.id === assignedBlock?.id,
    title: option.disabled ? option.reason : option.id === assignedBlock?.id ? 'This Trip is already in this Block.' : undefined,
    restoreFocus: false,
    onSelect: () => onChoose(option.id, triggerRef.current),
  })) }, ...(assignedBlock ? [{ items: [{ id: 'unassign', label: 'Unassign from Block', destructive: true, disabled, restoreFocus: false, onSelect: () => onUnassign(triggerRef.current) }] }] : [])];
  return <MenuButton label={label} menuLabel={`Block assignment for ${patternName} Trip`} groups={groups} disabled={disabled} selectionStyle="highlight" triggerRef={triggerRef} triggerClassName={`trip-block-assignment-trigger ${assignedBlock ? blockPillClass(assignedBlock.label) : 'trip-block-unassigned-trigger'}`} triggerAriaLabel={`Block assignment for ${patternName} Trip departing ${departure === undefined ? 'unknown time' : formatServiceTime(departure)}: ${label}`} />;
}

function TripBlockAssignmentDialog({ draft, blockingScenarioName, serviceDayName, blocks, blockOptions, currentAssignments, onConfirm, onClose, busy, error }: { draft: TripBlockAssignmentDraft; blockingScenarioName: string; serviceDayName: string; blocks: BlockingBlock[]; blockOptions: TripBlockOption[]; currentAssignments: Map<string, BlockingBlock>; onConfirm: (destinationBlockId: string) => void; onClose: () => void; busy: boolean; error: string }) {
  const [destinationBlockId, setDestinationBlockId] = useState(draft.destinationBlockId);
  const destination = blocks.find((block) => block.id === destinationBlockId);
  const { assignedElsewhereCount, unassignedCount, alreadyThereCount, movedIds, deadheadCount } = tripBlockAssignmentImpact(draft.tripIds, destinationBlockId, blocks, currentAssignments);
  const unavailable = blockOptions.find((option) => option.id === destinationBlockId && option.disabled);
  const canSubmit = Boolean(destination && !unavailable && movedIds.size > 0 && !busy);
  const title = draft.source === 'pill' ? (assignedElsewhereCount ? 'Move Trip to another Block?' : 'Assign Trip to Block?') : `Assign ${draft.tripIds.length} selected Trip${draft.tripIds.length === 1 ? '' : 's'}?`;
  const confirmLabel = draft.source === 'pill' ? (assignedElsewhereCount ? 'Move Trip' : 'Assign Trip') : `Assign ${draft.tripIds.length} Trip${draft.tripIds.length === 1 ? '' : 's'}`;
  return <ModalDialog role="alertdialog" labelledBy="trip-block-assignment-title" className="confirm-dialog trip-block-assignment-dialog" onClose={onClose} busy={busy}>
    <h2 id="trip-block-assignment-title">{title}</h2>
    <p className="trip-block-assignment-context">{blockingScenarioName} · {serviceDayName}</p>
    {draft.source === 'actions' ? <label className="dialog-field">Destination Block<select autoFocus value={destinationBlockId} onChange={(event) => setDestinationBlockId(event.target.value)} disabled={busy}><option value="">Choose a Block</option>{blockOptions.map((option) => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}{option.disabled ? ' — unavailable' : ''}</option>)}</select></label> : <p>Destination Block: <strong>{destination?.label ?? 'Unavailable'}</strong></p>}
    {(assignedElsewhereCount > 0 || unassignedCount > 0 || alreadyThereCount > 0) && <p>{assignedElsewhereCount > 0 ? `${assignedElsewhereCount} selected Trip${assignedElsewhereCount === 1 ? ' is' : 's are'} currently in another Block and will be moved.` : ''}{unassignedCount > 0 ? ` ${unassignedCount} unassigned Trip${unassignedCount === 1 ? '' : 's'} will be assigned.` : ''}{alreadyThereCount > 0 ? ` ${alreadyThereCount} Trip${alreadyThereCount === 1 ? ' is' : 's are'} already in this Block and will stay there.` : ''}</p>}
    {deadheadCount > 0 && <p>{deadheadCount} adjacent deadhead activit{deadheadCount === 1 ? 'y will' : 'ies will'} be removed from source Blocks. Pull-outs and pull-ins remain in their original Blocks.</p>}
    {unavailable && <p className="field-error" role="alert">{unavailable.reason}</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button autoFocus={draft.source === 'pill'} type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" type="button" onClick={() => destinationBlockId && onConfirm(destinationBlockId)} disabled={!canSubmit}>{busy ? 'Saving…' : confirmLabel}</button></div>
  </ModalDialog>;
}

function TripBlockUnassignmentDialog({ draft, blockingScenarioName, serviceDayName, blocks, currentAssignments, onConfirm, onClose, busy, error }: { draft: TripBlockAssignmentDraft; blockingScenarioName: string; serviceDayName: string; blocks: BlockingBlock[]; currentAssignments: Map<string, BlockingBlock>; onConfirm: () => void; onClose: () => void; busy: boolean; error: string }) {
  const { assignedTripIds, alreadyUnassignedCount, sourceBlockLabels, deadheadCount } = tripBlockUnassignmentImpact(draft.tripIds, blocks, currentAssignments);
  const title = draft.source === 'pill' ? 'Unassign Trip from Block?' : 'Unassign selected Trips?';
  const confirmLabel = draft.source === 'pill' ? 'Unassign Trip' : `Unassign ${assignedTripIds.length} Trip${assignedTripIds.length === 1 ? '' : 's'}`;
  return <ModalDialog role="alertdialog" labelledBy="trip-block-unassignment-title" className="confirm-dialog trip-block-assignment-dialog" onClose={onClose} busy={busy}>
    <h2 id="trip-block-unassignment-title">{title}</h2>
    <p className="trip-block-assignment-context">{blockingScenarioName} · {serviceDayName}</p>
    <p>{assignedTripIds.length} selected Trip{assignedTripIds.length === 1 ? '' : 's'} in {sourceBlockLabels.length ? sourceBlockLabels.map((label) => `“${label}”`).join(', ') : 'the selected Blocks'} will become unassigned.</p>
    {alreadyUnassignedCount > 0 && <p>{alreadyUnassignedCount} selected Trip{alreadyUnassignedCount === 1 ? ' is' : 's are'} already unassigned and will remain so.</p>}
    {deadheadCount > 0 && <p>{deadheadCount} adjacent deadhead activit{deadheadCount === 1 ? 'y will' : 'ies will'} be removed. Pull-outs and pull-ins remain in their Blocks.</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button autoFocus type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" type="button" onClick={onConfirm} disabled={!assignedTripIds.length || busy}>{busy ? 'Saving…' : confirmLabel}</button></div>
  </ModalDialog>;
}

function DraftTripRow({ draft, patterns, columns, onChange, onSave, onCancel, busy }: { draft: { patternId: string; firstTrip: string }; patterns: RoutePattern[]; columns: NonNullable<RouteDefinitionAggregate['directions']>[number]['columns']; onChange: (draft: { patternId: string; firstTrip: string }) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const pattern = patterns.find((item) => item.id === draft.patternId); const firstPoint = pattern?.points.find((point) => point.directionColumnId && columns.some((column) => column.id === point.directionColumnId));
  return <tr className="draft-trip-row"><td className="trip-selection-column" aria-hidden="true" /><td className="trip-pattern-column"><select className="trip-pattern-select" autoFocus aria-label="New trip pattern" title={pattern?.name || 'Select a pattern'} value={draft.patternId} disabled={busy} onChange={(event) => onChange({ ...draft, patternId: event.target.value })}><option value="">Select pattern</option>{patterns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></td>{columns.map((column) => <td className="trip-timepoint-column" key={column.id}>{firstPoint?.directionColumnId === column.id ? <input className="time-input" aria-label="First trip time" value={draft.firstTrip} placeholder="06:00" disabled={busy} onChange={(event) => onChange({ ...draft, firstTrip: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') onSave(); if (event.key === 'Escape') onCancel(); }} /> : '—'}</td>)}<td className="trip-run-time-column" /><td className="trip-connection-column" /><td className="trip-connection-column" /><td className="trip-next-trip-column" /><td className="trip-block-column">Unassigned</td><td className="trip-actions-column"><div className="row-actions"><button className="primary" disabled={!draft.patternId || !draft.firstTrip.trim() || busy} onClick={onSave}>Save</button><button disabled={busy} onClick={onCancel}>Cancel</button></div></td></tr>;
}

/** The text for each reason the Build Trips form can refuse its entries, before anything is sent to the service. */
const BUILD_TRIPS_FORM_MESSAGES = {
  missingFields: () => 'Select a Pattern, then enter First Trip, Headway, and either Last Trip or Number of Trips.',
  headwayNotPositive: () => 'Enter a positive headway.',
  headwayFormat: () => 'Enter a Headway in minutes, such as 10, or as minutes and seconds, such as 7:30.',
  timeFormat: () => 'Enter First Trip and Last Trip as times such as 6:30 or 25:00.',
  lastBeforeFirst: () => 'The last Trip must not be before the first Trip.',
  tripCountRange: (maximum: number) => `Enter a whole number from 1 to ${maximum}.`,
};

function BuildTripsDrawer({ tripService, scenarioId, routeId, serviceDayId, tripProfileId, patterns, profileName, initialValues, onValuesChange, onDone, onClose }: { tripService: TripGenerationApplication; scenarioId: string; routeId: string; serviceDayId: string; tripProfileId: string; patterns: RoutePattern[]; profileName?: string; initialValues: BuildTripsValues; onValuesChange: (values: BuildTripsValues) => void; onDone: () => Promise<void>; onClose: () => void }) {
  // The entered values outlive the drawer: closing it asks nothing and reopening it shows them again (Decision 14 of the review). A successful build clears them.
  const [patternId, setPatternId] = useState(patterns.some((pattern) => pattern.id === initialValues.patternId) ? initialValues.patternId : ''); const [firstTrip, setFirstTrip] = useState(initialValues.firstTrip); const [headway, setHeadway] = useState(initialValues.headway); const [tripCount, setTripCount] = useState(initialValues.tripCount); const [lastTrip, setLastTrip] = useState(initialValues.lastTrip);
  useEffect(() => { onValuesChange({ patternId, firstTrip, headway, tripCount, lastTrip }); }, [patternId, firstTrip, headway, tripCount, lastTrip]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const buildingByCount = tripCount.trim() !== '';
  const buildingByLastTrip = lastTrip.trim() !== '';
  // Once an error is showing, each field that cannot be used says so (aria-invalid) and points at the message.
  const problems = buildTripsFieldProblems({ patternId, firstTrip, headway, tripCount, lastTrip });
  const unusable = { pattern: Boolean(error) && problems.pattern, firstTrip: Boolean(error) && problems.firstTrip, headway: Boolean(error) && problems.headway, tripCount: Boolean(error) && problems.tripCount, lastTrip: Boolean(error) && problems.lastTrip };
  useEffect(() => { const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); } }; document.addEventListener('keydown', handleEscape); return () => document.removeEventListener('keydown', handleEscape); }, [busy, onClose]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseBuildTripsForm({ patternId, firstTrip, headway, tripCount, lastTrip }, { scenarioId, routeId, serviceDayId, tripProfileId });
    if (!parsed.ok) { setError(BUILD_TRIPS_FORM_MESSAGES[parsed.reason](parsed.reason === 'tripCountRange' ? parsed.maximum : 0)); return; }
    const request = parsed.request;
    try {
      setBusy(true); await tripService.previewGenerateTrips(request); await tripService.generateTrips(request); await onDone();
    } catch (caught) {
      if (caught instanceof TripGenerationError) setError([...new Set(caught.findings.map(userMessage))].join(' '));
      else setError(userFacingError(caught, 'Unable to build Trips. Check the values and try again.'));
    } finally { setBusy(false); }
  }
  return <aside className="shift-drawer build-trips-drawer" role="complementary" aria-labelledby="build-trips-drawer-title"><header><h2 id="build-trips-drawer-title">Build Trips</h2><button className="icon-button" type="button" aria-label="Close Build Trips drawer" title="Close Build Trips drawer" onClick={onClose} disabled={busy}>×</button></header><form className="build-trips-form" onSubmit={(event) => void submit(event)}><div className="shift-drawer-body"><label className="dialog-field">Pattern<select autoFocus value={patternId} disabled={busy} aria-invalid={unusable.pattern} aria-describedby={unusable.pattern ? 'build-trips-error' : undefined} onChange={(event) => { setPatternId(event.target.value); setError(''); }}><option value="">Select pattern</option>{patterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select></label><ClockField label="First Trip" value={firstTrip} disabled={busy} invalid={unusable.firstTrip} describedBy="build-trips-error" onChange={(value) => { setFirstTrip(value); setError(''); }} /><DurationField label="Headway" value={headway} disabled={busy} invalid={unusable.headway} describedBy="build-trips-error" onChange={(value) => { setHeadway(value); setError(''); }} /><label className="dialog-field">Number of Trips<input type="number" min="1" max={MAX_TRIPS_PER_GENERATION} step="1" inputMode="numeric" value={tripCount} disabled={busy || buildingByLastTrip} aria-invalid={unusable.tripCount} aria-describedby={unusable.tripCount ? 'build-trips-error' : undefined} onChange={(event) => { setTripCount(event.target.value); setError(''); }} /></label><ClockField label="Last Trip" value={lastTrip} disabled={busy || buildingByCount} invalid={unusable.lastTrip} describedBy="build-trips-error" onChange={(value) => { setLastTrip(value); setError(''); }} /><p className="build-trips-profile">Runtime profile: {profileName ?? 'No runtime profile selected'}</p>{error && <p className="field-error" id="build-trips-error" role="alert">{error}</p>}</div><footer><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" type="submit" disabled={busy}>{busy ? 'Building…' : 'Build'}</button></footer></form></aside>;
}

function DurationField({ label, value, onChange, disabled = false, invalid = false, describedBy }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; invalid?: boolean; describedBy?: string }) { return <label className="dialog-field">{label}<input value={value} inputMode="decimal" disabled={disabled} aria-invalid={invalid} aria-describedby={invalid ? describedBy : undefined} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.blur(); }} /></label>; }
function ClockField({ label, value, onChange, disabled = false, invalid = false, describedBy }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; invalid?: boolean; describedBy?: string }) { return <label className="dialog-field">{label}<input className="time-input" value={value} disabled={disabled} aria-invalid={invalid} aria-describedby={invalid ? describedBy : undefined} onChange={(event) => onChange(event.target.value)} /></label>; }

function RuntimeProfileDialog2({ dialog, candidates, onSubmit, onClose }: { dialog: Exclude<NewRuntimeDialog, undefined>; candidates: RoutePattern[]; onSubmit: (name: string, targetPatternId?: string) => Promise<void>; onClose: () => void }) { const [name, setName] = useState(dialog.initialName); const [targetPatternId, setTargetPatternId] = useState(candidates[0]?.id ?? ''); const [error, setError] = useState(''); const reverse = dialog.mode === 'reverse'; async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!name.trim()) { setError('Enter a name.'); return; } if (reverse && !targetPatternId) { setError('Select a Pattern.'); return; } await onSubmit(name.trim(), reverse ? targetPatternId : undefined); } return <ModalDialog as="form" labelledBy="runtime-profile-dialog-title" className="confirm-dialog" onSubmit={(event) => void submit(event)} onClose={onClose}><h2 id="runtime-profile-dialog-title">{dialog.mode === 'rename' ? 'Rename runtime profile' : dialog.mode === 'new' ? 'New runtime profile' : dialog.mode === 'reverse' ? 'Reverse-copy runtime profile' : 'Copy runtime profile'}</h2><label className="dialog-field">Name<input autoFocus value={name} aria-invalid={error === 'Enter a name.'} aria-describedby={error === 'Enter a name.' ? 'runtime-profile-dialog-error' : undefined} onChange={(event) => { setName(event.target.value); setError(''); }} /></label>{reverse && <label className="dialog-field">Reverse pattern<select value={targetPatternId} aria-invalid={error === 'Select a Pattern.'} aria-describedby={error === 'Select a Pattern.' ? 'runtime-profile-dialog-error' : undefined} onChange={(event) => setTargetPatternId(event.target.value)}>{candidates.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select></label>}{error && <p className="field-error" id="runtime-profile-dialog-error">{error}</p>}<div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{dialog.mode === 'rename' ? 'Rename' : dialog.mode === 'new' ? 'Create' : 'Copy'}</button></div></ModalDialog>; }
function DeleteRuntimeProfileDialog({ profile, profiles, assignmentCount, tripCount, onDelete, onClose }: { profile: RuntimeProfile; profiles: RuntimeProfile[]; assignmentCount: number; tripCount: number; onDelete: (replacementProfileId?: string) => Promise<void>; onClose: () => void }) { const alternatives = profiles.filter((item) => item.id !== profile.id); const [replacement, setReplacement] = useState(alternatives[0]?.id ?? ''); const requiresReplacement = assignmentCount > 0; const blocked = tripCount > 0 || (requiresReplacement && !alternatives.length); return <ModalDialog labelledBy="delete-runtime-profile-title" className="confirm-dialog" onClose={onClose}><h2 id="delete-runtime-profile-title">Delete runtime profile?</h2>{tripCount > 0 ? <p className="field-error">{tripCount} saved trip{tripCount === 1 ? '' : 's'} retain this profile as their run-time source. Delete or recalculate those trips before deleting this profile.</p> : requiresReplacement ? <><p>This profile is assigned to {assignmentCount} service-day pattern combination{assignmentCount === 1 ? '' : 's'}. Select a replacement profile.</p>{alternatives.length > 0 ? <label className="dialog-field">Replacement<select value={replacement} onChange={(event) => setReplacement(event.target.value)}>{alternatives.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <p className="field-error">Create another profile before deleting this one.</p>}</> : <p>This profile is not assigned to service and is not used by a saved trip.</p>}<div className="dialog-actions"><button onClick={onClose}>Cancel</button><button className="subtle-danger" disabled={blocked} onClick={() => void onDelete(requiresReplacement ? replacement : undefined)}>Delete</button></div></ModalDialog>; }
function DeleteTripsDialog({ tripCount, affectedBlockCount, onDelete, onClose, busy }: { tripCount: number; affectedBlockCount: number; onDelete: () => void; onClose: () => void; busy: boolean }) { return <ModalDialog role="alertdialog" labelledBy="delete-trips-title" className="confirm-dialog" onClose={onClose} busy={busy}><h2 id="delete-trips-title">Delete {tripCount === 1 ? 'trip' : `${tripCount} trips`}?</h2><p>{affectedBlockCount ? `This will also remove their revenue activities from ${affectedBlockCount} block${affectedBlockCount === 1 ? '' : 's'}.` : 'These trips are not assigned to a block.'} This cannot be undone.</p><div className="dialog-actions"><button onClick={onClose} disabled={busy}>Cancel</button><button className="danger" onClick={onDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button></div></ModalDialog>; }

function formatPreviewTime(value: number | undefined): string {
  return value === undefined ? '—' : formatServiceTime(value, value % 60 !== 0);
}

function formatPreviewTimeChange(current: number | undefined, revised: number | undefined): string {
  if (current === undefined || revised === undefined) return '—';
  const difference = revised - current;
  const sign = difference > 0 ? '+' : difference < 0 ? '−' : '';
  return `${sign}${formatServiceTime(Math.abs(difference), difference % 60 !== 0)}`;
}

function formatPreviewGap(value: number | undefined): string {
  if (value === undefined) return '—';
  return `${value < 0 ? '−' : ''}${formatServiceTime(Math.abs(value), value % 60 !== 0)}`;
}

/**
 * The anchor control of one Trip in the Regenerate dialog (U08, I-096). It is a native select that holds only its chosen option until the
 * planner focuses it or presses on it, and then every point of the Trip's Pattern. At 500 selected Trips the dialog used to build about
 * 14,000 options, which made the review and the apply each take over a second. The label, the choices, and the keyboard behavior are those
 * of a plain select: React adds the options before the browser opens the list.
 */
function AnchorSelect({ label, value, choices, disabled, onChange }: { label: string; value: string; choices: () => { id: string; label: string }[]; disabled: boolean; onChange: (value: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? choices() : choices().filter((choice) => choice.id === value);
  return <select aria-label={label} value={value} disabled={disabled} onFocus={() => setExpanded(true)} onPointerDown={() => setExpanded(true)} onChange={(event) => onChange(event.target.value)}>{shown.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select>;
}

function RecalculationDialog({ tripService, tripIds, trips, patterns, nodes, runtimeProfiles, onDone, onClose }: { tripService: TripGenerationApplication; tripIds: string[]; trips: Trip[]; patterns: RoutePattern[]; nodes: Node[]; runtimeProfiles: Map<string, RuntimeProfile | undefined>; onDone: () => Promise<void>; onClose: () => void }) {
  const [anchors, setAnchors] = useState<Record<string, string>>({});
  const [bulkAnchorChoice, setBulkAnchorChoice] = useState<'first' | 'last' | 'shared' | undefined>('first');
  const [commonNode, setCommonNodeValue] = useState('');
  const [bandOverrides, setBandOverrides] = useState<Record<string, string>>({});
  const [bandChoices, setBandChoices] = useState<AnchorBandChoice[]>([]);
  const [selectedBandId, setSelectedBandId] = useState('');
  const [preview, setPreview] = useState<RecalculationPreview>();
  const [error, setError] = useState('');
  const [anchorFinding, setAnchorFinding] = useState<ValidationFinding>();
  const [tripFindings, setTripFindings] = useState<ValidationFinding[]>([]);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(true);
  const [reviewRevision, setReviewRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setPreview(undefined); setError(''); setAnchorFinding(undefined); setTripFindings([]); setBandChoices([]); setReviewing(true);
    void tripService.previewRecalculateTrips(tripIds, anchors, bandOverrides).then((result) => { if (live) { setPreview(result); setTripFindings(result.findings); } }).catch((issue: unknown) => { if (live) { if (issue instanceof TripGenerationError) { setTripFindings(issue.findings.filter((item) => tripIds.includes(item.entityId))); const finding = issue.findings.find((item) => item.ruleId === 'trip.anchorNoRuntime' || item.ruleId === 'trip.anchorAmbiguous' || item.ruleId === 'trip.anchorNearestTie'); setAnchorFinding(finding); if (issue instanceof AnchorBandChoiceError) { setBandChoices(issue.choices); setSelectedBandId(issue.choices[0]?.bandId ?? ''); } if (!finding) setError([...new Set(issue.findings.map(userMessage))].join(' ')); } else setError(userFacingError(issue, 'Unable to review the Trips. Close this dialog and try again.')); } }).finally(() => { if (live) setReviewing(false); });
    return () => { live = false; };
  }, [tripService, tripIds, anchors, bandOverrides, reviewRevision]);
  // Lookups by id, so each of up to 500 rows reads its Trip, Pattern, revised times, connection, and findings without a scan (U08).
  const selected = useMemo(() => { const byId = new Map(trips.map((trip) => [trip.id, trip])); return tripIds.map((id) => byId.get(id)).filter((trip): trip is Trip => Boolean(trip)); }, [trips, tripIds]);
  const patternById = useMemo(() => new Map(patterns.map((pattern) => [pattern.id, pattern])), [patterns]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const revisedById = useMemo(() => new Map((preview?.trips ?? []).map((trip) => [trip.id, trip])), [preview]);
  const bandSelectionById = useMemo(() => new Map((preview?.bandSelections ?? []).map((item) => [item.tripId, item])), [preview]);
  const connectionById = useMemo(() => { const byTrip = new Map<string, RecalculationPreview['connections'][number]>(); const gap = (item: RecalculationPreview['connections'][number]) => item.revisedLayoverSeconds ?? item.revisedGapSeconds; for (const item of preview?.connections ?? []) { const current = byTrip.get(item.tripId); if (!current || gap(item) < gap(current)) byTrip.set(item.tripId, item); } return byTrip; }, [preview]);
  const findingsById = useMemo(() => { const byTrip = new Map<string, ValidationFinding[]>(); for (const item of tripFindings) byTrip.set(item.entityId, [...(byTrip.get(item.entityId) ?? []), item]); return byTrip; }, [tripFindings]);
  const pointsFor = (trip: Trip) => patternById.get(trip.patternId)?.points ?? [];
  const pointName = (trip: Trip, pointId: string) => { const point = pointsFor(trip).find((item) => item.id === pointId); const node = point ? nodeById.get(point.nodeId) : undefined; return node?.shortName || node?.name || `Point ${pointsFor(trip).findIndex((item) => item.id === pointId) + 1}`; };
  const failedTrip = selected.find((trip) => trip.id === anchorFinding?.entityId);
  const failedPoints = failedTrip ? pointsFor(failedTrip) : [];
  // Under a segment-start or blended profile a band cannot be chosen (Decision 0031 addendum, user decision of 2026-10-23, Option B): the candidates are only listed.
  const failedMethod = failedTrip ? runtimeProfiles.get(failedTrip.patternId)?.calculationMethod : undefined;
  const bandPickable = failedMethod !== 'segmentStart' && failedMethod !== 'blendSegments';
  const failedAnchorId = failedTrip ? anchors[failedTrip.id] ?? failedPoints[0]?.id : undefined;
  const failedAnchorTime = failedTrip?.stopTimes.find((point) => point.patternPointId === failedAnchorId)?.time;
  const failedTripLabel = failedTrip ? `${patterns.find((pattern) => pattern.id === failedTrip.patternId)?.name ?? 'Trip'} departing ${formatServiceTime(failedTrip.stopTimes[0]?.time ?? 0)}` : 'Selected trip';
  const failedAnchorLabel = failedTrip && failedAnchorId ? failedAnchorId === failedPoints[0]?.id ? 'first departure' : `${pointName(failedTrip, failedAnchorId)} timepoint` : 'timepoint';
  const bandChoiceLabel = (choice: AnchorBandChoice) => `${choice.bandLabel}: ${formatServiceTime(choice.departure)} departure (${choice.side ? `${Number((choice.distanceSeconds / 60).toFixed(1))} min ${choice.side === 'before' ? 'before start' : 'after end'} at ${formatServiceTime(choice.side === 'before' ? choice.startTime : choice.endTime)}` : 'within band'})`;
  const commonNodes = selected.length ? pointsFor(selected[0]).filter((point) => selected.every((trip) => pointsFor(trip).some((candidate) => candidate.nodeId === point.nodeId))).map((point) => point.nodeId) : [];
  const setCommonNode = (nodeId: string) => { if (nodeId) { setBandOverrides({}); setBulkAnchorChoice('shared'); setCommonNodeValue(nodeId); setAnchors(Object.fromEntries(selected.map((trip) => [trip.id, pointsFor(trip).find((point) => point.nodeId === nodeId)?.id ?? '']))); } };
  const setAll = (kind: 'first' | 'last') => { setBandOverrides({}); setBulkAnchorChoice(kind); setCommonNodeValue(''); setAnchors(Object.fromEntries(selected.map((trip) => { const points = pointsFor(trip); return [trip.id, (kind === 'first' ? points[0] : points[points.length - 1])?.id ?? '']; }))); };
  async function apply() { if (!preview) return; setBusy(true); setError(''); try { await tripService.applyRecalculationPreview(preview, true); await onDone(); } catch (issue) { setPreview(undefined); setError(userFacingError(issue, 'Unable to regenerate the Trips. Review them again, then apply.')); } finally { setBusy(false); } }
  return <ModalDialog labelledBy="recalculation-title" className="confirm-dialog preview-dialog" onClose={onClose} busy={busy}><h2 id="recalculation-title">Regenerate selected trips</h2><p>Keep one saved timepoint fixed per trip. Changes are new minus current.</p><div className="recalculation-bulk"><span>Set all anchors</span><button type="button" className={bulkAnchorChoice === 'first' ? 'is-selected' : undefined} aria-pressed={bulkAnchorChoice === 'first'} onClick={() => setAll('first')} disabled={busy}>First departure</button><button type="button" className={bulkAnchorChoice === 'last' ? 'is-selected' : undefined} aria-pressed={bulkAnchorChoice === 'last'} onClick={() => setAll('last')} disabled={busy}>Last timepoint</button>{commonNodes.length > 0 && <select aria-label="Set all to a shared timepoint" className={bulkAnchorChoice === 'shared' ? 'is-selected' : undefined} value={commonNode} disabled={busy} onChange={(event) => setCommonNode(event.target.value)}><option value="" disabled>Shared timepoint…</option>{commonNodes.map((nodeId) => { const node = nodes.find((item) => item.id === nodeId); return <option key={nodeId} value={nodeId}>{node?.shortName || node?.name || 'Unnamed point'}</option>; })}</select>}</div><div className="preview-times"><table><thead><tr><th scope="col">Trip</th><th scope="col">Anchor</th><th scope="col">Fixed time</th><th scope="col" className="recalculation-change">First change</th><th scope="col">First: current → new</th><th scope="col" className="recalculation-change">Last change</th><th scope="col">Last: current → new</th><th scope="col" className="recalculation-change">Run Time change</th><th scope="col" className="recalculation-change">Layover change</th><th scope="col">Layover: current → new</th></tr></thead><tbody>{selected.map((trip) => { const points = pointsFor(trip); const anchorId = anchors[trip.id] ?? points[0]?.id ?? ''; const oldAnchor = trip.stopTimes.find((point) => point.patternPointId === anchorId); const revised = revisedById.get(trip.id); const fallback = bandSelectionById.get(trip.id); const connection = connectionById.get(trip.id); const rowFindings = findingsById.get(trip.id) ?? []; return <tr key={trip.id} className={rowFindings.some((item) => item.severity === 'error') ? 'runtime-row-error' : rowFindings.length ? 'recalculation-row-warning' : undefined}><td>{patternById.get(trip.patternId)?.name ?? 'Trip'} · {formatServiceTime(trip.stopTimes[0]?.time ?? 0)}{rowFindings.length > 0 && <small className={rowFindings.some((item) => item.severity === 'error') ? 'recalculation-row-error' : 'recalculation-row-warning-note'}>{[...new Set(rowFindings.map(userMessage))].join(' ')}</small>}</td><td><AnchorSelect label={`Anchor for trip at ${formatServiceTime(trip.stopTimes[0]?.time ?? 0)}`} value={anchorId} disabled={busy} choices={() => points.map((point, index) => ({ id: point.id, label: index === 0 ? 'First departure' : index === points.length - 1 ? 'Last timepoint' : pointName(trip, point.id) }))} onChange={(value) => { setBulkAnchorChoice(undefined); setCommonNodeValue(''); setBandOverrides((current) => { const next = { ...current }; delete next[trip.id]; return next; }); setAnchors((current) => ({ ...current, [trip.id]: value })); }} />{fallback && <small className="recalculation-fallback">{fallback.selection === 'manual' ? 'Chosen' : 'Nearest'}: {fallback.bandLabel} · {fallback.side ? `${Number((fallback.distanceSeconds / 60).toFixed(1))} min ${fallback.side === 'before' ? 'before start' : 'after end'}` : 'within band'}</small>}</td><td>{oldAnchor ? formatServiceTime(oldAnchor.time) : '—'}</td><td className="recalculation-change">{formatPreviewTimeChange(trip.stopTimes[0]?.time, revised?.stopTimes[0]?.time)}</td><td>{formatPreviewTime(trip.stopTimes[0]?.time)} → {formatPreviewTime(revised?.stopTimes[0]?.time)}</td><td className="recalculation-change">{formatPreviewTimeChange(trip.stopTimes.at(-1)?.time, revised?.stopTimes.at(-1)?.time)}</td><td>{formatPreviewTime(trip.stopTimes.at(-1)?.time)} → {formatPreviewTime(revised?.stopTimes.at(-1)?.time)}</td><td className="recalculation-change">{formatPreviewTimeChange(tripRunTimeSeconds(trip), revised ? tripRunTimeSeconds(revised) : undefined)}</td><td className="recalculation-change">{formatPreviewTimeChange(connection?.currentLayoverSeconds, connection?.revisedLayoverSeconds)}</td><td>{formatPreviewGap(connection?.currentLayoverSeconds)} → {formatPreviewGap(connection?.revisedLayoverSeconds)}</td></tr>; })}</tbody></table></div>{Boolean(preview?.bandSelections?.length) && <p className="recalculation-fallback-summary">Runtime band selection reviewed for {preview!.bandSelections!.length} trip{preview!.bandSelections!.length === 1 ? '' : 's'}. Review the labeled rows.</p>}{preview?.impact.requiresConfirmation && <p>Recalculation will replace manual times or affect blocks. Review the times above before applying.</p>}{anchorFinding && <div className="field-error" role="alert"><p>{failedTripLabel}: keeping the {failedAnchorLabel}{failedAnchorTime === undefined ? '' : ` at ${formatServiceTime(failedAnchorTime)}`} is {anchorFinding.ruleId === 'trip.anchorAmbiguous' ? 'ambiguous. More than one runtime band yields a valid first departure.' : anchorFinding.ruleId === 'trip.anchorNearestTie' ? 'ambiguous. Two runtime bands are equally close to the calculated departure.' : bandChoices.length ? 'too far from every band for automatic selection. Choose a band below to keep this timepoint fixed.' : 'impossible with the current runtimes. No band can produce a valid departure for this fixed timepoint.'}</p>{bandChoices.length > 0 && !bandPickable ? <><p>The fixed time can be reached from {bandChoices.length === 2 ? 'two first departures' : `${bandChoices.length} first departures`}, and a band cannot be chosen for a {methodLabel(failedMethod)} profile:</p><ul className="recalculation-candidates">{bandChoices.map((choice) => <li key={choice.bandId}>{bandChoiceLabel(choice)}</li>)}</ul><p>Use the first departure for this trip, choose another anchor, or adjust the runtime bands.</p></> : <p>{bandChoices.length ? 'Choose a runtime band below, another anchor, or adjust the runtimes.' : 'Choose another anchor for this trip or adjust the runtime bands.'}</p>}{failedTrip && bandChoices.length > 0 && bandPickable && <div className="recalculation-band-choice"><label>Runtime band<select value={selectedBandId} disabled={busy || reviewing} onChange={(event) => setSelectedBandId(event.target.value)}>{bandChoices.map((choice) => <option key={choice.bandId} value={choice.bandId}>{bandChoiceLabel(choice)}</option>)}</select></label><button type="button" disabled={!selectedBandId || busy || reviewing} onClick={() => setBandOverrides((current) => ({ ...current, [failedTrip.id]: selectedBandId }))}>Use selected band</button></div>}{failedTrip && failedPoints[0]?.id !== failedAnchorId && <button type="button" disabled={busy || reviewing} onClick={() => { setBulkAnchorChoice(undefined); setCommonNodeValue(''); setBandOverrides((current) => { const next = { ...current }; delete next[failedTrip.id]; return next; }); setAnchors((current) => ({ ...current, [failedTrip.id]: failedPoints[0].id })); }}>Use first departure for this trip</button>}</div>}{error && <p className="field-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button>{!preview && (error || anchorFinding) && <button type="button" onClick={() => setReviewRevision((value) => value + 1)} disabled={reviewing || busy}>Review again</button>}<button className="primary" type="button" onClick={() => void apply()} disabled={!preview || preview.findings.some((finding) => finding.severity === 'error') || reviewing || busy}>{busy ? 'Regenerating…' : reviewing ? 'Reviewing…' : 'Regenerate trips'}</button></div></ModalDialog>;
}

function CopyImpact({ items }: { items: Array<[string, number]> }) { return <dl className="preview-summary copy-impact">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }

function RuntimeDayCopyDialog({ tripService, scenarioId, routeId, routeName, targetDay, days, patterns, onDone, onClose, onError }: { tripService: TripGenerationApplication; scenarioId: string; routeId: string; routeName: string; targetDay: ServiceDayDefinition; days: ServiceDayDefinition[]; patterns: RoutePattern[]; onDone: () => Promise<void>; onClose: () => void; onError: (error: unknown, fallback?: string) => void }) {
  const sources = days.filter((day) => day.id !== targetDay.id); const [sourceServiceDayId, setSourceServiceDayId] = useState(sources[0]?.id ?? ''); const [mode, setMode] = useState<'independent' | 'shared'>('independent'); const [preview, setPreview] = useState<RuntimeCopyPreview>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const errors = preview?.findings.some((finding) => finding.severity === 'error') ?? false; const patternName = (id: string) => patterns.find((pattern) => pattern.id === id)?.name || 'Unnamed Pattern';
  async function review() { if (!sourceServiceDayId) return; setBusy(true); setError(''); try { setPreview(await tripService.previewRuntimeCopy({ scenarioId, routeId, sourceServiceDayId, targetServiceDayId: targetDay.id, mode })); } catch (caught) { setError(userFacingError(caught, 'Unable to review this copy. Close this dialog and try again.')); } finally { setBusy(false); } }
  async function apply() { if (!preview || errors) return; setBusy(true); setError(''); try { await tripService.applyRuntimeCopy(preview); await onDone(); onClose(); } catch (caught) { setError(caught instanceof Error && caught.name === 'ServiceDayCopyStalePreviewError' ? 'Source data changed. Review again.' : userFacingError(caught, 'Unable to copy runtimes. Review the copy again, then apply.')); } finally { setBusy(false); } }
  return <ModalDialog labelledBy="runtime-copy-title" className="confirm-dialog preview-dialog" onClose={onClose} busy={busy}><h2 id="runtime-copy-title">Copy day</h2><p className="copy-scope">To {targetDay.name} · {routeName}</p><label className="dialog-field">Source day<select autoFocus value={sourceServiceDayId} disabled={busy} onChange={(event) => { setSourceServiceDayId(event.target.value); setPreview(undefined); setError(''); }}>{sources.map((day) => <option key={day.id} value={day.id}>{day.name}</option>)}</select></label><fieldset className="copy-mode" disabled={busy}><legend>Profiles</legend><label><input type="radio" name="runtime-copy-mode" checked={mode === 'independent'} onChange={() => { setMode('independent'); setPreview(undefined); }} /> Independent copies</label><label><input type="radio" name="runtime-copy-mode" checked={mode === 'shared'} onChange={() => { setMode('shared'); setPreview(undefined); }} /> Share profiles</label>{mode === 'shared' && <small>Later profile edits affect each assigned day.</small>}</fieldset>{preview && <><CopyImpact items={[[preview.request.mode === 'independent' ? 'Profiles created' : 'Profiles shared', preview.request.mode === 'independent' ? preview.impact.profilesCreated : preview.impact.profilesShared], ['Assignments replaced', preview.impact.targetAssignmentsReplaced], ['Trip sources changed', preview.impact.targetTripIdsWithChangedCalculationSource.length]]} />{preview.impact.unresolvedPatternIds.length > 0 && <ul className="impact-list"><li>Missing source runtimes: {preview.impact.unresolvedPatternIds.map(patternName).join(', ')}.</li></ul>}{preview.findings.length > 0 && <p className="field-error" role="alert">{[...new Set(preview.findings.map(userMessage))].join(' ')}</p>}</>}{error && <p className="field-error" role="alert">{error}</p>}<div className="dialog-actions"><button onClick={onClose} disabled={busy}>Cancel</button><button onClick={() => void review()} disabled={!sourceServiceDayId || busy}>{busy ? 'Reviewing…' : 'Review copy'}</button>{preview && <button className="primary" onClick={() => void apply()} disabled={errors || busy}>{busy ? 'Copying…' : 'Copy runtimes'}</button>}</div></ModalDialog>;
}

function TripDayCopyDialog({ tripService, scenarioId, routeId, tripProfileId, routeName, tripProfileName, targetDay, days, patterns, onDone, onClose, onError }: { tripService: TripGenerationApplication; scenarioId: string; routeId: string; tripProfileId: string; routeName: string; tripProfileName: string; targetDay: ServiceDayDefinition; days: ServiceDayDefinition[]; patterns: RoutePattern[]; onDone: () => Promise<void>; onClose: () => void; onError: (error: unknown, fallback?: string) => void }) {
  const sources = days.filter((day) => day.id !== targetDay.id); const [sourceServiceDayId, setSourceServiceDayId] = useState(sources[0]?.id ?? ''); const [allowEmptySource, setAllowEmptySource] = useState(false); const [preview, setPreview] = useState<TripCopyPreview>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const errors = preview?.findings.some((finding) => finding.severity === 'error') ?? false; const patternName = (id: string) => patterns.find((pattern) => pattern.id === id)?.name || 'Unnamed Pattern';
  async function review() { if (!sourceServiceDayId) return; setBusy(true); setError(''); try { setPreview(await tripService.previewTripCopy({ scenarioId, routeId, tripProfileId, sourceServiceDayId, targetServiceDayId: targetDay.id, allowEmptySource })); } catch (caught) { setError(userFacingError(caught, 'Unable to review this copy. Close this dialog and try again.')); } finally { setBusy(false); } }
  async function apply() { if (!preview || errors) return; setBusy(true); setError(''); try { await tripService.applyTripCopy(preview); await onDone(); onClose(); } catch (caught) { setError(caught instanceof Error && caught.name === 'ServiceDayCopyStalePreviewError' ? 'Source data changed. Review again.' : userFacingError(caught, 'Unable to copy Trips. Review the copy again, then apply.')); } finally { setBusy(false); } }
  return <ModalDialog labelledBy="trip-copy-title" className="confirm-dialog preview-dialog" onClose={onClose} busy={busy}><h2 id="trip-copy-title">Copy trips</h2><p className="copy-scope">To {targetDay.name} · {routeName} · {tripProfileName} · Both directions</p><label className="dialog-field">Source day<select autoFocus value={sourceServiceDayId} disabled={busy} onChange={(event) => { setSourceServiceDayId(event.target.value); setPreview(undefined); setAllowEmptySource(false); setError(''); }}>{sources.map((day) => <option key={day.id} value={day.id}>{day.name}</option>)}</select></label>{preview && <><CopyImpact items={[["Source trips", preview.impact.sourceTripCount], ['Target trips replaced', preview.impact.targetTripsReplaced], ['Trips copied', preview.impact.copiedTripCount], ['Block activities removed', preview.impact.removedBlockActivityCount]]} />{preview.impact.requiresExplicitEmptySourceReview && <label className="clear-target"><input type="checkbox" checked={allowEmptySource} onChange={(event) => setAllowEmptySource(event.target.checked)} /> Clear {targetDay.name} trips</label>}{(preview.impact.manuallyAdjustedTargetTripIds.length > 0 || preview.impact.staleTargetTripIds.length > 0 || preview.impact.affectedBlockIds.length > 0 || preview.impact.missingTargetRuntimeAssignmentPatternIds.length > 0) && <ul className="impact-list">{preview.impact.manuallyAdjustedTargetTripIds.length > 0 && <li>{preview.impact.manuallyAdjustedTargetTripIds.length} manual target trip{preview.impact.manuallyAdjustedTargetTripIds.length === 1 ? '' : 's'} replaced.</li>}{preview.impact.staleTargetTripIds.length > 0 && <li>{preview.impact.staleTargetTripIds.length} stale target source{preview.impact.staleTargetTripIds.length === 1 ? '' : 's'}.</li>}{preview.impact.affectedBlockIds.length > 0 && <li>{preview.impact.affectedBlockIds.length} affected block{preview.impact.affectedBlockIds.length === 1 ? '' : 's'}.</li>}{preview.impact.missingTargetRuntimeAssignmentPatternIds.length > 0 && <li>Missing target runtimes: {preview.impact.missingTargetRuntimeAssignmentPatternIds.map(patternName).join(', ')}.</li>}</ul>}{preview.findings.length > 0 && <p className="field-error" role="alert">{[...new Set(preview.findings.map(userMessage))].join(' ')}</p>}</>}{error && <p className="field-error" role="alert">{error}</p>}<div className="dialog-actions"><button onClick={onClose} disabled={busy}>Cancel</button><button onClick={() => void review()} disabled={!sourceServiceDayId || busy}>{busy ? 'Reviewing…' : allowEmptySource ? 'Review clear' : 'Review copy'}</button>{preview && <button className={preview.impact.requiresExplicitEmptySourceReview ? 'danger' : 'primary'} onClick={() => void apply()} disabled={errors || busy}>{busy ? 'Copying…' : preview.impact.requiresExplicitEmptySourceReview ? 'Clear target trips' : 'Copy trips'}</button>}</div></ModalDialog>;
}

function BatchPatternChangeDialog({ tripService, tripIds, patterns, trips, onDone, onClose, onError }: { tripService: TripGenerationApplication; tripIds: string[]; patterns: RoutePattern[]; trips: Trip[]; onDone: () => Promise<void>; onClose: () => void; onError: (error: unknown, fallback?: string) => void }) {
  const [targetPatternId, setTargetPatternId] = useState(patterns[0]?.id ?? ''); const [preview, setPreview] = useState<BatchPatternChangePreview>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const tripName = (id: string) => patterns.find((pattern) => pattern.id === trips.find((trip) => trip.id === id)?.patternId)?.name || 'Selected trip';
  async function review() { setBusy(true); setError(''); try { setPreview(await tripService.previewBatchPatternChange({ tripIds, targetPatternId })); } catch (caught) { setError(userFacingError(caught, 'Unable to review this Pattern change. Close this dialog and try again.')); } finally { setBusy(false); } }
  async function apply() { if (!preview || preview.ineligibleTripIds.length) return; setBusy(true); setError(''); try { await tripService.applyBatchPatternChange(preview); await onDone(); onClose(); } catch (caught) { setError(caught instanceof Error && caught.name === 'ServiceDayCopyStalePreviewError' ? 'Selected Trips changed. Review again.' : userFacingError(caught, 'Unable to change Patterns. Review the change again, then apply.')); } finally { setBusy(false); } }
  return <ModalDialog labelledBy="batch-pattern-title" className="confirm-dialog preview-dialog" onClose={onClose} busy={busy}><h2 id="batch-pattern-title">Change selected Patterns</h2><label className="dialog-field">Target Pattern<select autoFocus value={targetPatternId} disabled={busy} onChange={(event) => { setTargetPatternId(event.target.value); setPreview(undefined); setError(''); }}>{patterns.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}</select></label>{preview && <><CopyImpact items={[["Eligible", preview.eligibleTripIds.length], ['Cannot change', preview.ineligibleTripIds.length], ['Affected blocks', preview.affectedBlockIds.length]]} /><ul className="impact-list batch-pattern-results">{preview.changes.map((change) => <li key={change.tripId}>{tripName(change.tripId)}: {change.finding ? userMessage(change.finding) : 'Ready'}</li>)}</ul></>}{error && <p className="field-error" role="alert">{error}</p>}<div className="dialog-actions"><button onClick={onClose} disabled={busy}>Cancel</button><button onClick={() => void review()} disabled={!targetPatternId || busy}>{busy ? 'Reviewing…' : 'Review change'}</button>{preview && <button className="primary" onClick={() => void apply()} disabled={Boolean(preview.ineligibleTripIds.length) || busy}>{busy ? 'Saving…' : 'Change Patterns'}</button>}</div></ModalDialog>;
}

function RuntimeTimeInput({ label, value, duration = false, onCommit }: { label: string; value: number; duration?: boolean; onCommit: (value: number) => void }) {
  const display = (next: number) => duration ? formatRuntimeDuration(next) : formatServiceTime(next, next % 60 !== 0);
  const [draft, setDraft] = useState(() => display(value));
  const [error, setError] = useState('');
  // Escape cancels the edit. Its blur must not commit the typed text, which the blur handler still holds (finding 5-024).
  const cancelled = useRef(false);
  useEffect(() => { setDraft(display(value)); }, [value, duration]);
  function commit() {
    if (cancelled.current) { cancelled.current = false; return; } if (!draft.trim()) { setError(duration ? 'Enter a runtime. Zero is valid.' : 'Enter a time.'); return; } try { const next = duration ? parseRuntimeDuration(draft) : parseServiceTime(draft); if (next === undefined) throw new Error(); setError(''); onCommit(next); setDraft(display(next)); } catch { setError(duration ? 'Use minutes such as 7, :07, or 7:30.' : 'Use a time such as 6:30 or 25:00.'); } }
  return <><input className="time-input" aria-label={label} aria-invalid={Boolean(error)} value={draft} onChange={(event) => { setDraft(event.target.value); setError(''); }} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; setDraft(display(value)); setError(''); event.currentTarget.blur(); } }} />{error && <small className="field-error" role="alert">{error}</small>}</>;
}

function PatternEditor({ pattern, directions, nodes, segmentMiles, errors, conflict, isNew, dirty, canDuplicate, onPattern, onAddPoint, onUpdatePoint, onMovePoint, onRemovePoint, onReverse, onDuplicate, onDelete, onSave, onDiscard }: { pattern: RoutePattern; directions: RouteDirection[]; nodes: Node[]; segmentMiles: (pattern: RoutePattern, index: number) => number; errors: string[]; conflict?: string; isNew: boolean; dirty: boolean; canDuplicate: boolean; onPattern: (patch: Partial<RoutePattern>) => void; onAddPoint: () => void; onUpdatePoint: (index: number, patch: Partial<RoutePattern['points'][number]>) => void; onMovePoint: (index: number, direction: -1 | 1) => void; onRemovePoint: (index: number) => void; onReverse: () => void; onDuplicate: () => void; onDelete: () => void; onSave: () => void; onDiscard: () => void }) {
  const addPointButton = useRef<HTMLButtonElement>(null);
  return <div className="pattern-editor"><div className="field-grid"><Field label="Direction"><select value={pattern.directionId ?? directions[0]?.id ?? ''} onChange={(event) => onPattern({ directionId: event.target.value })}>{directions.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select></Field><Field label="Pattern name" required><input value={pattern.name} onChange={(event) => onPattern({ name: event.target.value })} /></Field><Field label="Label"><input value={pattern.directionLabel ?? ''} onChange={(event) => onPattern({ directionLabel: event.target.value || undefined })} /></Field></div>{isNew && <p className="draft-indicator" role="status">New Pattern — not saved</p>}<div className="table-scroll"><table><thead><tr><th scope="col">#</th><th scope="col">Node</th><th scope="col">Cumulative mi</th><th scope="col">Segment mi</th><th scope="col">Order</th><th scope="col"><span className="visually-hidden">Remove</span></th></tr></thead><tbody>{pattern.points.map((point, index) => { const segment = segmentMiles(pattern, index); return <tr key={point.id}><td>{index + 1}</td><td><select aria-label={`Point ${index + 1} node`} value={point.nodeId} onChange={(event) => onUpdatePoint(index, { nodeId: event.target.value })}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.shortName ? `${node.shortName} — ${node.name}` : node.name || 'Untitled node'}</option>)}</select></td><td><NumericCommit label={`Point ${index + 1} cumulative miles`} value={point.cumulativeMiles} step="0.01" onCommit={(value) => onUpdatePoint(index, { cumulativeMiles: value })} /></td><td><output>{!Number.isFinite(segment) ? '—' : patternTotalMiles(pattern) === undefined ? 'incomplete' : segment.toFixed(2)}</output></td><td><button className="icon-button" disabled={index === 0} onClick={() => onMovePoint(index, -1)} aria-label="Move point up" title="Move point up">↑</button><button className="icon-button" disabled={index === pattern.points.length - 1} onClick={() => onMovePoint(index, 1)} aria-label="Move point down" title="Move point down">↓</button></td><td><button className="icon-button icon-button--danger" onClick={() => onRemovePoint(index)} aria-label={`Remove point ${index + 1}`} title={`Remove point ${index + 1}`}><TrashIcon /></button></td></tr>; })}{pattern.points.length === 0 && <tr><td colSpan={6} className="table-empty">Add two or more points. A node may appear more than once for loop patterns.</td></tr>}</tbody></table></div>{conflict && <p className="field-error local-conflict" role="alert">{conflict}</p>}{errors.length > 0 && <div className="runtime-findings" role="alert"><strong>Review this Pattern</strong><ul>{[...new Set(errors)].map((error) => <li key={error}>{error}</li>)}</ul></div>}<div className="table-actions pattern-table-actions"><div><button disabled={!canDuplicate} onClick={onDuplicate}>Duplicate</button><button disabled={!canDuplicate} onClick={onReverse}>Reverse</button><button className="subtle-danger" onClick={onDelete} aria-label={`Delete Pattern ${pattern.name || 'Untitled pattern'}`} title={isNew ? 'Discard the new Pattern' : `Delete ${pattern.name || 'pattern'}`}>Delete Pattern</button></div><div><button ref={addPointButton} onClick={onAddPoint}>Add node</button><button onClick={() => { onDiscard(); window.setTimeout(() => addPointButton.current?.focus()); }} disabled={!dirty}>Discard changes</button><button className="primary" onClick={onSave} disabled={!dirty}>Save Pattern</button></div></div></div>;
}

function RouteEditImpactDialog({ preview, mode, onClose, onCommit }: { preview: NodeChangePreview | SafePatternChangePreview; mode: RouteEditMode; onClose: () => void; onCommit: () => void }) {
  const impact = preview.impact;
  const title = preview.kind === 'nodes' ? 'Update service for deleted Nodes?' : mode === 'reset' ? 'Reset service for this Pattern?' : 'Save Pattern and rebalance?';
  const affected = [impact.profileIds.length ? `${impact.profileIds.length} runtime profile${impact.profileIds.length === 1 ? '' : 's'}` : '', impact.tripIds.length ? `${impact.tripIds.length} trip${impact.tripIds.length === 1 ? '' : 's'}` : '', impact.blockIds.length ? `${impact.blockIds.length} block${impact.blockIds.length === 1 ? '' : 's'}` : ''].filter(Boolean);
  const destructive = mode === 'reset';
  const detail = destructive
    ? `This will remove ${affected.join(', ') || 'the dependent service'} for this Pattern. Other Patterns and blocks will remain.`
    : preview.kind === 'nodes'
      ? `This will remove the selected Node occurrences and update ${affected.join(', ') || 'the affected schedule'} while preserving retained times.`
      : `This will update ${affected.join(', ') || 'this Pattern'} using the revised timepoint structure. Added timepoints begin with zero run time.`;
  const nonRevenue = preview.kind === 'nodes' ? preview.nonRevenueImpact : undefined;
  const nonRevenueDetail = nonRevenue?.removedActivityCount ? `Removes ${nonRevenue.removedActivityCount} pull-out, pull-in, or deadhead ${nonRevenue.removedActivityCount === 1 ? 'activity' : 'activities'} in ${nonRevenue.blockIds.length} Block${nonRevenue.blockIds.length === 1 ? '' : 's'}.` : '';
  return <ModalDialog role="alertdialog" labelledBy="route-edit-impact-title" className="confirm-dialog" onClose={onClose}><h2 id="route-edit-impact-title">{title}</h2><p>{detail}</p>{nonRevenueDetail && <p>{nonRevenueDetail}</p>}<div className="dialog-actions"><button onClick={onClose}>Cancel</button><button className={destructive ? 'danger' : 'primary'} onClick={onCommit}>{destructive ? 'Save and reset service' : preview.kind === 'nodes' ? 'Delete Nodes and update service' : 'Save and rebalance'}</button></div></ModalDialog>;
}

function DiscardRouteDraftDialog({ title, onDiscard, onClose }: { title: string; onDiscard: () => void; onClose: () => void }) {
  return <ModalDialog role="alertdialog" labelledBy="discard-route-draft-title" className="confirm-dialog" onClose={onClose}><h2 id="discard-route-draft-title">{title}</h2><p>These edits have not been saved.</p><div className="dialog-actions"><button autoFocus onClick={onClose}>Cancel</button><button className="danger" onClick={onDiscard}>Discard</button></div></ModalDialog>;
}

function RouteNavigationDraftDialog({ title = 'Save route changes before leaving?', text = 'Nodes or a Pattern have unsaved edits.', onCancel, onDiscard, onSave }: { title?: string; text?: string; onCancel: () => void; onDiscard: () => void; onSave: () => void }) {
  return <ModalDialog role="alertdialog" labelledBy="route-navigation-draft-title" className="confirm-dialog" onClose={onCancel}><h2 id="route-navigation-draft-title">{title}</h2><p>{text}</p><div className="dialog-actions"><button autoFocus onClick={onCancel}>Cancel</button><button className="danger" onClick={onDiscard}>Discard</button><button className="primary" onClick={onSave}>Save</button></div></ModalDialog>;
}

function TrashIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" focusable="false"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" /></svg>;
}

function CopyIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" focusable="false"><path fill="currentColor" d="M8 7V3h12v14h-4v4H4V7h4Zm2 0h6v8h2V5h-8v2Zm4 12v-2H8V9H6v10h8Z" /></svg>;
}

function Field({ label, required, errors = [], wide, children }: { label: string; required?: boolean; errors?: string[]; wide?: boolean; children: ReactNode }) {
  const id = useId();
  // A field with an error says so to assistive technology: the control is invalid and described by its messages (finding 5-023).
  const control = errors.length && isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'aria-invalid': true, 'aria-describedby': errors.map((_, index) => `${id}-error-${index}`).join(' ') }) : children;
  return <label className={wide ? 'wide' : ''}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{control}{errors.map((error, index) => <small className="field-error" id={`${id}-error-${index}`} key={error}>{error}</small>)}</label>;
}

/** `onCommit` may return the reason the value was refused; it is shown beside the field and the saved value stays. */
function NumericCommit({ label, value, integer = false, step = '1', onCommit }: { label: string; value: number; integer?: boolean; step?: string; onCommit: (value: number) => Promise<string | void> | void }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');
  const cancelled = useRef(false);
  useEffect(() => { setDraft(String(value)); }, [value]);
  function commit() {
    if (cancelled.current) { cancelled.current = false; return; }
    const parsed = Number(draft);
    if (!draft.trim()) { setError('A value is required. Zero is valid.'); return; }
    if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) { setError(integer ? 'Enter a non-negative whole number.' : 'Enter a non-negative number.'); return; }
    setError('');
    const outcome = onCommit(parsed);
    if (outcome instanceof Promise) void outcome.then((refusal) => { if (refusal) setError(refusal); });
  }
  return <><input aria-label={label} aria-invalid={Boolean(error)} aria-describedby={error ? `${label.replaceAll(/[^a-z0-9]/gi, '-')}-error` : undefined} type="number" min="0" step={step} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; setDraft(String(value)); setError(''); event.currentTarget.blur(); } }} />{error && <small id={`${label.replaceAll(/[^a-z0-9]/gi, '-')}-error`} className="field-error" role="alert">{error} Saved value remains {value}.</small>}</>;
}

/** The name field of a Service day. A refused name shows its reason beside the field and the saved name stays. */
function ServiceDayNameInput({ name, onCommit }: { name: string; onCommit: (name: string) => Promise<string | undefined> }) {
  const [error, setError] = useState('');
  const errorId = useId();
  return <><input aria-label={`${name} name`} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} defaultValue={name} onBlur={(event) => void onCommit(event.target.value).then((refusal) => setError(refusal ?? ''))} />{error && <small id={errorId} className="field-error" role="alert">{error} Saved name remains {name}.</small>}</>;
}

function NameDialogForm({ dialog, onClose }: { dialog: NameDialog; onClose: () => void }) {
  const [name, setName] = useState(dialog.initialValue ?? '');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!name.trim()) { setError('A name is required.'); return; } await dialog.action(name.trim()); onClose(); }
  return <ModalDialog as="form" labelledBy="name-dialog-title" className="confirm-dialog" onSubmit={(event) => void submit(event)} onClose={onClose}><h2 id="name-dialog-title">{dialog.title}</h2><label className="dialog-field" htmlFor="dialog-name"><span className={dialog.label ? undefined : 'visually-hidden'}>{dialog.label ?? 'Name'}</span><input id="dialog-name" autoFocus value={name} onChange={(event) => { setName(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'dialog-name-error' : undefined} /></label>{error && <p id="dialog-name-error" className="field-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{dialog.submitLabel}</button></div></ModalDialog>;
}

function ConfirmDialog({ dialog, onClose }: { dialog: Confirmation; onClose: () => void }) {
  return <ModalDialog role="alertdialog" labelledBy="confirm-title" className="confirm-dialog" onClose={onClose}><h2 id="confirm-title">{dialog.title}</h2><p>{dialog.text}</p><div><button autoFocus onClick={onClose}>Cancel</button><button className="danger" onClick={() => { dialog.action(); onClose(); }}>{dialog.confirmLabel ?? 'Confirm'}</button></div></ModalDialog>;
}

function ShiftDiscardDialog({ title = 'Discard staged shift?', text = 'The selected Trips have not been changed. Discard the staged shift before leaving this schedule context?', onDiscard, onCancel }: { title?: string; text?: string; onDiscard: () => void; onCancel: () => void }) {
  return <ModalDialog labelledBy="shift-discard-title" className="confirm-dialog" onClose={onCancel}><h2 id="shift-discard-title">{title}</h2><p>{text}</p><div><button onClick={onCancel}>Cancel</button><button className="subtle-danger" onClick={onDiscard}>Discard</button></div></ModalDialog>;
}
