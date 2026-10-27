import { Component, type ChangeEvent, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type LocalDataProtection, type SaveStatus, type SessionStatus, type SessionStatusQueries } from '../application/ports';
import { type BlockingCommands, type BlockingQueries } from '../application/ports';
import { BlockingWorkspace } from './blocking/BlockingWorkspace';
import { CostingWorkspace } from './costing/CostingWorkspace';
import { MenuButton, type MenuGroup } from './MenuButton';
import { userFacingError } from './errorMessages';
import { readStoredRecord, storedText } from './preferences';
import { createCsvArchive } from '../application/csvDownload';
import { ServiceDayValidationError, type RouteDefinitionApplication, type RouteEditCommitResult, type ScenarioRecords } from '../application/routeDefinitionService';
import { type TripGenerationApplication } from '../application/tripGenerationService';
import { TripGenerationError } from '../domain/trips';
import { isUsablePattern, orderDirections, sortServiceDays } from '../application/tripsWorkspaceView';
import { type Project, type Route, type RouteDefinitionAggregate, type ServiceDayDefinition, type Trip, type ValidationFinding } from '../domain/types';
import { type CostingCommands, type CostingQueries } from '../application/ports';
import { type NameDialog, type Confirmation, NameDialogForm, ConfirmDialog } from './shared/dialogs';
import { type RouteNavigationGuard } from './shared/types';
import { download, downloadBlob } from './shared/download';
import { userMessage } from './shared/messages';
import { RouteWorkspace } from './route/RouteWorkspace';
import { TripsWorkspace } from './trips/TripsWorkspace';

export type Props = { service: RouteDefinitionApplication; tripService: TripGenerationApplication; blockingService: BlockingCommands & BlockingQueries; costingService: CostingCommands & CostingQueries; session?: SessionStatusQueries };
export type Notice = { kind: 'error' | 'success'; text: string } | undefined;
export type ActiveTab = 'route' | 'trips' | 'blocking' | 'costing';
export type SelectionPreference = { projectId?: string; scenarioId?: string; routeId?: string };
export const SELECTION_PREFERENCE_KEY = 'transit-costing-tool.route-selection.v1';
export function loadSelectionPreference(): SelectionPreference {
  const stored = readStoredRecord(SELECTION_PREFERENCE_KEY);
  return { projectId: storedText(stored.projectId), scenarioId: storedText(stored.scenarioId), routeId: storedText(stored.routeId) };
}

export function saveSelectionPreference(preference: SelectionPreference) {
  try { localStorage.setItem(SELECTION_PREFERENCE_KEY, JSON.stringify(preference)); } catch { /* Storage is a convenience only. */ }
}

export function formatBackupTime(iso: string) { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }

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
export class WorkspaceErrorBoundary extends Component<{ resetKey: string; screen: string; children: ReactNode }, { error?: Error; resetKey: string }> {
  state: { error?: Error; resetKey: string } = { resetKey: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { resetKey: string }) { return props.resetKey === state.resetKey ? null : { error: undefined, resetKey: props.resetKey }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('A screen could not be drawn.', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="empty-state workspace-error" role="alert"><h1>This screen could not be shown</h1><p>Something unexpected went wrong while drawing {this.props.screen}. Your saved data is still in this browser; edits you had not saved on this screen are lost. Choose another tab, or try again. If it happens again, export a backup from the Project menu and reload the page.</p><div className="dialog-actions"><button type="button" onClick={() => this.setState({ error: undefined })}>Try again</button><button type="button" onClick={() => window.location.reload()}>Reload page</button></div></section>;
  }
}
