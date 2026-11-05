import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { MenuButton, type MenuGroup } from '../MenuButton';
import { SupportPanel } from '../shared/surfaces';
import { SaveBar } from '../shared/bars';
import { TrashIcon } from '../shared/icons';
import { DiscardRouteDraftDialog } from '../shared/dialogs';
import { newId } from '../../domain/ids';
import { defaultMeasureNodeId, tripsPerHour } from '../../domain/plannedFrequencies';
import { formatServiceTime, parseRuntimeDuration, parseServiceTime } from '../../domain/time';
import { sortServiceDays } from '../../domain/serviceDays';
import type { PeriodComparison } from '../../domain/plannedFrequencyComparison';
import type { Node, PlannedFrequency, RouteDirection, RoutePattern, ServiceDayDefinition } from '../../domain/types';
import { PlannedFrequencyValidationError, type PlanComparisonResult, type PlannedFrequencyService } from '../../application/plannedFrequencyService';
import { ClearPlanDialog, CopyFromDayDialog, CopyFromScenarioDialog, formatHeadway } from './PlannedFrequencyDialogs';

/** One period as the planner types it. Text is parsed when the plan is saved, so a half-typed time never blocks typing. */
interface DraftRow { id: string; start: string; end: string; headway: string; }
interface Draft { rows: DraftRow[]; measure: Record<string, string>; }

export interface PlannedFrequenciesHandle {
  /** Resolves to true when the draft was saved (or there was nothing to save). */
  save: () => Promise<boolean>;
  discard: () => void;
}

const formatTime = (seconds: number): string => formatServiceTime(seconds, seconds % 60 !== 0);

const draftOf = (plan: PlannedFrequency | undefined): Draft => ({
  rows: (plan?.periods ?? []).map((period) => ({ id: period.id, start: formatTime(period.startTime), end: formatTime(period.endTime), headway: formatHeadway(period.headwaySeconds) })),
  measure: { ...(plan?.measureNodeIdByDirectionId ?? {}) },
});

const FINDING_TEXT: Record<string, string> = {
  'plannedFrequency.periodEndNotAfterStart': 'The end must be after the start.',
  'plannedFrequency.headwayTooShort': 'The headway must be at least 1 minute.',
  'plannedFrequency.headwayLongerThanPeriod': 'The headway is longer than the period.',
  'plannedFrequency.periodsOverlap': 'This period overlaps another one.',
  'plannedFrequency.measureNodeNotServed': 'This direction does not serve the chosen stop.',
};

function parseRow(row: DraftRow): { period?: { id: string; startTime: number; endTime: number; headwaySeconds: number }; errors: string[] } {
  const errors: string[] = [];
  let startTime: number | undefined; let endTime: number | undefined; let headwaySeconds: number | undefined;
  try { startTime = parseServiceTime(row.start); } catch { errors.push('Use a start time such as 6:00 or 25:30.'); }
  try { endTime = parseServiceTime(row.end); } catch { errors.push('Use an end time such as 19:00 or 25:30.'); }
  try { headwaySeconds = parseRuntimeDuration(row.headway); } catch { headwaySeconds = undefined; }
  if (headwaySeconds === undefined) errors.push('Use a headway in minutes such as 15 or 7:30.');
  if (errors.length || startTime === undefined || endTime === undefined || headwaySeconds === undefined) return { errors };
  return { period: { id: row.id, startTime, endTime, headwaySeconds }, errors };
}

/** What the Built column says for one period, across the directions. */
function builtSummary(comparisons: Array<{ directionName: string; period?: PeriodComparison }>): { text: string; title: string } {
  const lines = comparisons.filter((item) => item.period).map(({ directionName, period }) => {
    const p = period!;
    if (p.status === 'noTrips') return { directionName, status: p.status, note: 'No trips' };
    if (p.status === 'matches') return { directionName, status: p.status, note: `${p.builtTrips} trips, matches` };
    const reasons = p.reasons.map((reason) => reason === 'extraTrips' || reason === 'missingTrips' ? `${p.builtTrips} of ${p.plannedTrips} trips` : reason === 'gapsOff' ? 'Gaps off' : reason === 'startEdge' ? 'Start off' : 'End off');
    return { directionName, status: p.status, note: [...new Set(reasons)].join(', ') };
  });
  const title = lines.map((line) => `${line.directionName}: ${line.note}`).join('\n');
  const differing = lines.filter((line) => line.status === 'differs');
  // The cell shows the first differing direction; the tooltip lists every direction.
  if (differing.length) return { text: differing[0]!.note, title };
  if (lines.length && lines.every((line) => line.status === 'noTrips')) return { text: '—', title };
  if (lines.some((line) => line.status === 'noTrips')) return { text: 'Partly built', title };
  return lines.length ? { text: '✓', title } : { text: '—', title };
}

/**
 * Planned frequencies of one Route (Decision 0058): the periods of each Service day, the stop where each direction is measured, and how
 * the built trips compare. The draft and save behaviour follows the Runtimes editor: edits stay local until Save.
 */
export const PlannedFrequenciesPanel = forwardRef<PlannedFrequenciesHandle, {
  service: PlannedFrequencyService;
  scenarioId: string;
  routeId: string;
  serviceDays: ServiceDayDefinition[];
  directions: RouteDirection[];
  patterns: RoutePattern[];
  nodes: Node[];
  tripProfileId: string;
  /** True while the Route tab is showing, so the comparison is read again after the planner has edited trips. */
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onError: (error: unknown) => void;
}>(function PlannedFrequenciesPanel({ service, scenarioId, routeId, serviceDays, directions, patterns, nodes, tripProfileId, active, onDirtyChange, onError }, ref) {
  const sortedDays = useMemo(() => sortServiceDays(serviceDays), [serviceDays]);
  const [dayId, setDayId] = useState(sortedDays[0]?.id ?? '');
  const day = sortedDays.find((item) => item.id === dayId) ?? sortedDays[0];
  const [plans, setPlans] = useState<Record<string, PlannedFrequency | undefined>>({});
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft>({ rows: [], measure: {} });
  const [rowErrors, setRowErrors] = useState<Record<string, string[]>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [comparison, setComparison] = useState<PlanComparisonResult>();
  const [dialog, setDialog] = useState<'copyDay' | 'copyScenario' | 'clear' | undefined>();
  const [pendingDay, setPendingDay] = useState<string>();
  const focusRow = useRef<string | undefined>(undefined);
  const errorRef = useRef(onError); errorRef.current = onError;
  const stableError = useCallback((error: unknown) => errorRef.current(error), []);

  const plan = day ? plans[day.id] : undefined;
  const saved = useMemo(() => draftOf(plan), [plan]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  // Read every day's plan of this Route; a write elsewhere (copy, clear) calls `reload`.
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  useEffect(() => {
    let current = true;
    Promise.all(sortedDays.map(async (item) => [item.id, await service.getPlan(routeId, item.id)] as const)).then((entries) => {
      if (!current) return;
      setPlans(Object.fromEntries(entries)); setLoaded(true);
    }, (error: unknown) => { if (current) stableError(error); });
    return () => { current = false; };
  }, [service, routeId, sortedDays, version, stableError]);

  // The draft is replaced when the saved plan (or the day) changes, never while the planner is typing in the same plan.
  const syncedKey = useRef('');
  useEffect(() => {
    if (!loaded) return;
    const key = `${day?.id}|${JSON.stringify(saved)}`;
    if (key === syncedKey.current) return;
    syncedKey.current = key; setDraft(saved); setRowErrors({}); setFormErrors([]);
  }, [loaded, day?.id, saved]);

  // The comparison is derived on request: read again when the tab is shown, the plan, day or profile changes.
  useEffect(() => {
    if (!active || !loaded || !day || !plan || !tripProfileId) { setComparison(undefined); return; }
    let current = true;
    service.comparePlan({ routeId, serviceDayId: day.id, tripProfileId }).then((result) => { if (current) setComparison(result); }, (error: unknown) => { if (current) stableError(error); });
    return () => { current = false; };
  }, [service, active, loaded, routeId, day?.id, plan, tripProfileId, stableError]);

  const nodeName = useCallback((nodeId: string) => { const node = nodes.find((item) => item.id === nodeId); return node?.shortName || node?.name || 'Unnamed stop'; }, [nodes]);
  const servedNodes = (direction: RouteDirection): Node[] => {
    const ids = new Set(patterns.filter((pattern) => pattern.directionId === direction.id).flatMap((pattern) => pattern.points.map((point) => point.nodeId)));
    return nodes.filter((node) => ids.has(node.id));
  };
  const measuredDirections = directions.filter((direction) => servedNodes(direction).length > 0).sort((a, b) => a.sequence - b.sequence);

  async function save(): Promise<boolean> {
    if (!day) return true;
    if (!dirty) return true;
    const errors: Record<string, string[]> = {};
    const periods = [];
    for (const row of draft.rows) {
      const parsed = parseRow(row);
      if (parsed.errors.length) errors[row.id] = parsed.errors; else periods.push(parsed.period!);
    }
    setFormErrors([]);
    if (Object.keys(errors).length) { setRowErrors(errors); return false; }
    setSaving(true);
    try {
      const measure = Object.fromEntries(Object.entries(draft.measure).filter(([, nodeId]) => nodeId));
      const result = await service.savePlan({ routeId, serviceDayId: day.id, periods, measureNodeIdByDirectionId: measure });
      setRowErrors({});
      setPlans((current) => ({ ...current, [day.id]: result }));
      syncedKey.current = `${day.id}|${JSON.stringify(draftOf(result))}`;
      setDraft(draftOf(result));
      return true;
    } catch (error) {
      if (error instanceof PlannedFrequencyValidationError) {
        const byRow: Record<string, string[]> = {}; const general: string[] = [];
        for (const finding of error.findings) {
          const text = FINDING_TEXT[finding.ruleId] ?? 'This plan cannot be saved.';
          const id = finding.parameters?.periodId;
          if (id !== undefined) (byRow[String(id)] ??= []).push(text); else general.push(text);
        }
        setRowErrors(byRow); setFormErrors([...new Set(general)]);
      } else onError(error);
      return false;
    } finally { setSaving(false); }
  }
  function discard() { setDraft(saved); setRowErrors({}); setFormErrors([]); }
  useImperativeHandle(ref, () => ({ save, discard }));

  const updateRow = (id: string, patch: Partial<DraftRow>) => { setDraft((current) => ({ ...current, rows: current.rows.map((row) => row.id === id ? { ...row, ...patch } : row) })); setRowErrors((current) => ({ ...current, [id]: [] })); };
  function addRow() {
    const last = draft.rows.at(-1);
    let start = '6:00';
    try { if (last) { parseServiceTime(last.end); start = last.end; } } catch { /* the new row starts at 6:00 */ }
    let end: string;
    try { end = formatTime(parseServiceTime(start) + 3600); } catch { end = '7:00'; }
    const row = { id: newId(), start, end, headway: last?.headway || '15' };
    focusRow.current = row.id;
    setDraft((current) => ({ ...current, rows: [...current.rows, row] }));
  }
  const removeRow = (id: string) => setDraft((current) => ({ ...current, rows: current.rows.filter((row) => row.id !== id) }));
  useEffect(() => {
    if (!focusRow.current) return;
    document.querySelector<HTMLInputElement>(`[data-period-row="${focusRow.current}"] input`)?.focus();
    focusRow.current = undefined;
  });

  function requestDay(id: string) {
    if (id === day?.id) return;
    if (dirty) setPendingDay(id); else setDayId(id);
  }

  const dayMenu: MenuGroup[] = [{ items: sortedDays.map((item) => ({ id: item.id, label: item.name, checked: item.id === day?.id, onSelect: () => requestDay(item.id) })) }];
  const hasPlan = Boolean(plan);
  const actionMenu: MenuGroup[] = [{ items: [
    { id: 'copy-day', label: 'Copy from another day…', onSelect: () => setDialog('copyDay'), disabled: !sortedDays.some((item) => item.id !== day?.id && plans[item.id]), title: 'Another service day of this route needs a plan to copy from.' },
    { id: 'copy-scenario', label: 'Copy from another scenario…', onSelect: () => setDialog('copyScenario') },
    { id: 'clear', label: 'Clear plan…', destructive: true, disabled: !hasPlan, onSelect: () => setDialog('clear') },
  ] }];

  if (!day) return <SupportPanel title="Planned frequencies"><p className="table-empty">This scenario has no service days.</p></SupportPanel>;

  const periodsById = new Map<string, Array<{ directionName: string; period?: PeriodComparison }>>();
  for (const entry of comparison?.directions ?? []) {
    for (const period of entry.comparison.periods) {
      const list = periodsById.get(period.periodId) ?? [];
      list.push({ directionName: entry.directionName, period }); periodsById.set(period.periodId, list);
    }
  }
  const savedIds = new Set(plan?.periods.map((period) => period.id));
  const aside = <div className="planned-toolbar">
    <MenuButton label={day.name} menuLabel="Service day" fieldLabel="Service day" groups={dayMenu} menuAlign="start" />
    <MenuButton label="Actions" menuLabel="Planned frequency actions" groups={actionMenu} />
  </div>;

  return <SupportPanel title="Planned frequencies" aside={aside} ariaLabel="Planned frequencies">
    <div className="table-scroll planned-table"><table className="grid-table" aria-label={`Planned frequencies for ${day.name}`}>
      <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Headway</th><th scope="col">Trips/hr</th><th scope="col">Built</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
      <tbody>
        {draft.rows.map((row, index) => {
          const parsed = parseRow(row);
          const errors = rowErrors[row.id] ?? [];
          const errorId = `pf-error-${row.id}`;
          const built = !dirty && savedIds.has(row.id) ? builtSummary(periodsById.get(row.id) ?? []) : { text: '—', title: dirty ? 'Save the plan to compare it with the trips.' : '' };
          return <tr key={row.id} data-period-row={row.id} className={errors.length ? 'runtime-row-error' : undefined}>
            <td><input className="time-input" aria-label={`Period ${index + 1} from`} aria-invalid={errors.length ? true : undefined} aria-describedby={errors.length ? errorId : undefined} value={row.start} onChange={(event) => updateRow(row.id, { start: event.target.value })} /></td>
            <td><input className="time-input" aria-label={`Period ${index + 1} to`} aria-invalid={errors.length ? true : undefined} aria-describedby={errors.length ? errorId : undefined} value={row.end} onChange={(event) => updateRow(row.id, { end: event.target.value })} /></td>
            <td><input className="time-input" aria-label={`Period ${index + 1} headway in minutes`} aria-invalid={errors.length ? true : undefined} aria-describedby={errors.length ? errorId : undefined} value={row.headway} onChange={(event) => updateRow(row.id, { headway: event.target.value })} /></td>
            <td className="planned-rate">{parsed.period && parsed.period.headwaySeconds > 0 ? tripsPerHour(parsed.period).toFixed(1) : '—'}</td>
            <td className="planned-built" title={built.title || undefined}>{built.text}{errors.length > 0 && <small id={errorId} className="field-error" role="alert">{errors.join(' ')}</small>}</td>
            <td><button type="button" className="icon-button icon-button--danger" aria-label={`Remove period ${index + 1}`} title="Remove period" onClick={() => removeRow(row.id)}><TrashIcon /></button></td>
          </tr>;
        })}
        {draft.rows.length === 0 && <tr><td colSpan={6} className="table-empty">No plan for {day.name}. Add a period or copy one.</td></tr>}
        <tr className="table-add-row"><td colSpan={6}><button type="button" className="ghost" disabled={saving} onClick={addRow}><span aria-hidden="true">+ </span>Add period</button></td></tr>
      </tbody>
    </table></div>
    {formErrors.length > 0 && <p className="field-error" role="alert">{formErrors.join(' ')}</p>}
    {draft.rows.length > 0 && measuredDirections.length > 0 && <div className="planned-measure">
      {measuredDirections.map((direction) => {
        const served = servedNodes(direction);
        const stored = draft.measure[direction.id] ?? '';
        const fallback = defaultMeasureNodeId(direction, patterns);
        const storedUnserved = stored && !served.some((node) => node.id === stored);
        return <label key={direction.id} className="planned-measure__line"><span>{direction.name} measured at</span>
          <select aria-label={`${direction.name} measured at`} value={stored} onChange={(event) => setDraft((current) => { const measure = { ...current.measure }; if (event.target.value) measure[direction.id] = event.target.value; else delete measure[direction.id]; return { ...current, measure }; })}>
            <option value="">(default{fallback ? `: ${nodeName(fallback)}` : ''})</option>
            {storedUnserved && <option value={stored}>{nodeName(stored)} (no longer served)</option>}
            {served.map((node) => <option key={node.id} value={node.id}>{nodeName(node.id)}</option>)}
          </select>
        </label>;
      })}
      {comparison && comparison.directions.some((entry) => entry.comparison.measureNodeFellBack) && <small className="planned-measure__note">A saved stop is no longer served, so the default stop is used for the comparison.</small>}
    </div>}
    {dirty && <SaveBar message="Unsaved changes in Planned frequencies" saveLabel="Save plan" busy={saving} onSave={() => void save()} onDiscard={discard} />}

    {dialog === 'copyDay' && <CopyFromDayDialog service={service} routeId={routeId} targetDay={day} sourceDays={sortedDays.filter((item) => item.id !== day.id && plans[item.id])} onClose={() => setDialog(undefined)} onCopied={reload} onError={stableError} />}
    {dialog === 'copyScenario' && <CopyFromScenarioDialog service={service} scenarioId={scenarioId} routeId={routeId} nodeName={nodeName} onClose={() => setDialog(undefined)} onCopied={reload} onError={stableError} />}
    {dialog === 'clear' && <ClearPlanDialog dayName={day.name} busy={saving} onClose={() => setDialog(undefined)} onConfirm={() => { setSaving(true); service.clearPlan(routeId, day.id).then(() => { reload(); setDialog(undefined); }, stableError).finally(() => setSaving(false)); }} />}
    {pendingDay && <DiscardRouteDraftDialog title="Discard unsaved planned frequencies?" onClose={() => setPendingDay(undefined)} onDiscard={() => { const next = pendingDay; setPendingDay(undefined); setDayId(next); }} onSave={() => { const next = pendingDay; setPendingDay(undefined); void save().then((ok) => { if (ok) setDayId(next); }); }} />}
  </SupportPanel>;
});
