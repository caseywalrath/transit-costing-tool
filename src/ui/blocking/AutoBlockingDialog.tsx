import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AutoBlockingPreview, AutoBlockingSetup, BlockingCommands, BlockingQueries } from '../../application/ports';
import { nodeShortName } from '../../application/shortNames';
import { describeBreakRule, type AutoBlockingMeasurement, type AutoBlockingRules } from '../../domain/autoBlocking';
import type { MinimumLayoverRules } from '../../domain/blocking';
import type { BlockingScenario, Node, RoutePattern, ValidationFinding } from '../../domain/types';
import { ModalDialog } from '../ModalDialog';
import { userFacingError } from '../errorMessages';
import { InlineNote } from '../shared/surfaces';

type Props = {
  blockingService: BlockingCommands & BlockingQueries;
  scenarioId: string;
  tripProfileId: string;
  tripProfileName: string;
  minimumLayover?: MinimumLayoverRules;
  /** The selected Blocking Scenario when it was built automatically: the dialog can rebuild it in place instead of creating a new one. */
  existing?: { scenario: BlockingScenario; rules: AutoBlockingRules; editedBlockCount: number; blockCountChanged: boolean };
  /** The workspace's pattern pill, so the dialog shows Patterns as the Blocking tables do. */
  renderPatternPill: (pattern: RoutePattern) => ReactNode;
  onCreated: (scenario: BlockingScenario) => Promise<void>;
  onClose: () => void;
};

type LayoverMode = 'none' | 'minutes' | 'percent';
type PatternRow = { patternId: string; mode: LayoverMode; amount: string; breakAllowed: boolean; canStart: boolean; canEnd: boolean };
type TerminalRow = { pullOut: string; pullIn: string; miles: string };
type DeadheadRow = { key: number; from: string; to: string; minutes: string; miles: string; bothWays: boolean };
/** The dialog's editable draft. Numbers stay as typed text until they are turned into rules. */
type Form = {
  serviceDayIds: string[];
  patterns: PatternRow[];
  /** Breaks are off unless this is ticked; the values stay in the draft while it is off. */
  breakEnabled: boolean;
  breakLength: string; breakMinBlock: string; breakFirst: string; breakAnother: string;
  maxRunning: string; maxMiles: string; maxVehicles: string;
  garages: Record<string, string>;
  terminals: Record<string, TerminalRow>;
  deadheads: DeadheadRow[];
};

const text = (value: number | undefined) => value === undefined ? '' : String(value);
const number = (value: string) => value.trim() === '' ? undefined : Number(value);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const hours = (seconds: number) => (seconds / 3600).toFixed(2);
let deadheadKey = 0;

/** Turns stored rules into a draft, keeping only rows whose Patterns and Nodes exist in this Scenario. */
function formFromRules(rules: AutoBlockingRules, setup: AutoBlockingSetup): Form {
  const nodeIds = new Set(setup.nodes.map((node) => node.id));
  const rows = new Map(rules.patterns.map((row) => [row.patternId, row]));
  const defaults = new Map(setup.defaultRules.patterns.map((row) => [row.patternId, row]));
  const dayIds = new Set(setup.serviceDays.filter((entry) => entry.tripCount > 0).map((entry) => entry.day.id));
  return {
    serviceDayIds: rules.serviceDayIds.filter((id) => dayIds.has(id)),
    patterns: setup.patterns.map((pattern) => {
      const row = rows.get(pattern.id) ?? defaults.get(pattern.id) ?? { patternId: pattern.id, breakAllowed: false, canStart: false, canEnd: false };
      return { patternId: pattern.id, mode: row.minimumLayover?.mode ?? 'none', amount: text(row.minimumLayover?.value), breakAllowed: row.breakAllowed, canStart: row.canStart, canEnd: row.canEnd };
    }),
    breakEnabled: rules.break !== undefined,
    breakLength: text(rules.break?.lengthMinutes), breakMinBlock: text(rules.break?.minimumBlockHours), breakFirst: text(rules.break?.firstBreakAfterHours), breakAnother: text(rules.break?.anotherBreakAfterHours),
    maxRunning: text(rules.maxRunningHours), maxMiles: text(rules.maxRevenueMiles), maxVehicles: text(rules.maxVehicles),
    garages: Object.fromEntries(rules.garages.filter((garage) => nodeIds.has(garage.nodeId)).map((garage) => [garage.routeId, garage.nodeId])),
    terminals: Object.fromEntries(rules.terminals.filter((row) => nodeIds.has(row.nodeId)).map((row) => [row.nodeId, { pullOut: String(row.pullOutMinutes), pullIn: String(row.pullInMinutes), miles: text(row.miles) }])),
    deadheads: rules.deadheads.filter((row) => nodeIds.has(row.fromNodeId) && nodeIds.has(row.toNodeId)).map((row) => ({ key: deadheadKey++, from: row.fromNodeId, to: row.toNodeId, minutes: String(row.minutes), miles: text(row.miles), bothWays: row.bothWays })),
  };
}

/** The nodes where some Pattern can currently start or end a Block, sorted by name. */
function terminalNodes(form: Form, setup: AutoBlockingSetup): Node[] {
  const patterns = new Map(setup.patterns.map((pattern) => [pattern.id, pattern]));
  const ids = new Set<string>();
  form.patterns.forEach((row) => {
    const pattern = patterns.get(row.patternId); if (!pattern) return;
    if (row.canStart && pattern.points[0]) ids.add(pattern.points[0].nodeId);
    if (row.canEnd && pattern.points.at(-1)) ids.add(pattern.points.at(-1)!.nodeId);
  });
  return setup.nodes.filter((node) => ids.has(node.id)).sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
}

function rulesFromForm(form: Form, setup: AutoBlockingSetup): AutoBlockingRules {
  const length = form.breakEnabled ? number(form.breakLength) : undefined;
  const garages = Object.entries(form.garages).filter(([, nodeId]) => nodeId).map(([routeId, nodeId]) => ({ routeId, nodeId }));
  const another = number(form.breakAnother);
  return {
    serviceDayIds: form.serviceDayIds,
    patterns: form.patterns.map((row) => ({ patternId: row.patternId, ...(row.mode === 'none' ? {} : { minimumLayover: { mode: row.mode, value: number(row.amount) ?? 0 } }), breakAllowed: row.breakAllowed, canStart: row.canStart, canEnd: row.canEnd })),
    ...(length === undefined ? {} : { break: { lengthMinutes: length, minimumBlockHours: number(form.breakMinBlock) ?? 0, firstBreakAfterHours: number(form.breakFirst) ?? 0, ...(another === undefined ? {} : { anotherBreakAfterHours: another }) } }),
    ...(number(form.maxRunning) === undefined ? {} : { maxRunningHours: number(form.maxRunning) }),
    ...(number(form.maxMiles) === undefined || setup.milesIncompletePatternIds.length ? {} : { maxRevenueMiles: number(form.maxMiles) }),
    ...(number(form.maxVehicles) === undefined ? {} : { maxVehicles: number(form.maxVehicles) }),
    garages,
    terminals: terminalNodes(form, setup).map((node) => {
      const row = form.terminals[node.id];
      const miles = row ? number(row.miles) : undefined;
      return { nodeId: node.id, pullOutMinutes: row ? number(row.pullOut) ?? 0 : 0, pullInMinutes: row ? number(row.pullIn) ?? 0 : 0, ...(miles === undefined || !garages.some((garage) => garage.routeId === node.routeId) ? {} : { miles }) };
    }),
    deadheads: form.deadheads.filter((row) => row.from && row.to).map((row) => ({ fromNodeId: row.from, toNodeId: row.to, minutes: number(row.minutes) ?? 0, ...(number(row.miles) === undefined ? {} : { miles: number(row.miles) }), bothWays: row.bothWays })),
  };
}

const errorsOf = (findings: ValidationFinding[]) => findings.filter((finding) => finding.severity === 'error');
const FINDING_FIELD_TEXT: Record<string, string> = {
  'autoBlocking.serviceDaysRequired': 'Select at least one service day.',
  'autoBlocking.limitVehicles': 'Enter a whole number of 1 or more, or leave it blank.',
  'blockingScenario.nameRequired': 'Enter a blocking scenario name.',
  'blockingScenario.nameUnique': 'A blocking scenario with this name already exists.',
};

/** Decision 0055: build a new Blocking Scenario from rules, or rebuild the selected automatically built one in place. */
export function AutoBlockingDialog({ blockingService, scenarioId, tripProfileId, tripProfileName, minimumLayover, existing, renderPatternPill, onCreated, onClose }: Props) {
  const [setup, setSetup] = useState<AutoBlockingSetup>();
  const [form, setForm] = useState<Form>();
  const [name, setName] = useState('');
  // New scenario is the default; ticked, the rules of `existing` are loaded and its Blocks are rebuilt.
  const [replace, setReplace] = useState(false);
  const replaceId = replace && existing ? existing.scenario.id : undefined;
  const [sourceId, setSourceId] = useState('');
  const [measurement, setMeasurement] = useState<AutoBlockingMeasurement>();
  const [preview, setPreview] = useState<AutoBlockingPreview>();
  const [previewPending, setPreviewPending] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const requests = useRef(0);

  useEffect(() => {
    let live = true;
    void blockingService.getAutoBlockingSetup(scenarioId, tripProfileId, minimumLayover).then((value) => {
      if (!live) return;
      setSetup(value); setName(value.defaultName); setForm(formFromRules(value.defaultRules, value));
    }).catch((caught) => { if (live) setError(userFacingError(caught, 'Unable to open automatic blocking. Close this dialog and try again.')); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rules = useMemo(() => setup && form ? rulesFromForm(form, setup) : undefined, [setup, form]);
  const rulesKey = JSON.stringify(rules ?? null);
  useEffect(() => {
    if (!rules) return;
    const request = ++requests.current; setPreviewPending(true);
    const timer = setTimeout(() => {
      void blockingService.previewAutoBlocking({ scenarioId, tripProfileId, name, rules, ...(sourceId ? { sourceBlockingScenarioId: sourceId } : {}), ...(replaceId ? { replaceBlockingScenarioId: replaceId } : {}) })
        .then((value) => { if (request === requests.current) { setPreview(value); setPreviewPending(false); } })
        .catch((caught) => { if (request === requests.current) { setPreviewPending(false); setError(userFacingError(caught, 'Unable to preview these rules.')); } });
    }, 300);
    return () => clearTimeout(timer);
  }, [rulesKey, name, sourceId, replaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMeasurement(undefined);
    if (!sourceId || !rules) return;
    let live = true;
    void blockingService.measureAutoBlockingSource(scenarioId, tripProfileId, sourceId, rules).then((value) => { if (live) setMeasurement(value); })
      .catch((caught) => { if (live) setError(userFacingError(caught, 'Unable to read rules from these blocks.')); });
    return () => { live = false; };
  }, [sourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!setup || !form || !rules) {
    return <DialogShell onClose={onClose}>
      <h2>Auto-blocking</h2>
      {error ? <p className="field-error">{error}</p> : <p role="status">Loading…</p>}
      <div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button></div>
    </DialogShell>;
  }

  const patterns = new Map(setup.patterns.map((pattern) => [pattern.id, pattern]));
  const nodes = new Map(setup.nodes.map((node) => [node.id, node]));
  const routes = new Map(setup.routes.map((route) => [route.id, route]));
  const short = (nodeId: string | undefined) => nodeShortName(nodeId ? nodes.get(nodeId) : undefined) || '?';
  const tripCount = Object.values(setup.patternTripCounts).reduce((sum, count) => sum + count, 0);
  const update = (patch: Partial<Form>) => setForm((current) => current && { ...current, ...patch });
  const updatePattern = (patternId: string, patch: Partial<PatternRow>) => setForm((current) => current && { ...current, patterns: current.patterns.map((row) => row.patternId === patternId ? { ...row, ...patch } : row) });
  const updateTerminal = (nodeId: string, patch: Partial<TerminalRow>) => setForm((current) => current && { ...current, terminals: { ...current.terminals, [nodeId]: { ...(current.terminals[nodeId] ?? { pullOut: '0', pullIn: '0', miles: '' }), ...patch } } });
  const updateDeadhead = (key: number, patch: Partial<DeadheadRow>) => setForm((current) => current && { ...current, deadheads: current.deadheads.map((row) => row.key === key ? { ...row, ...patch } : row) });

  const ruleErrors = errorsOf(preview?.ruleFindings ?? []); const nameErrors = errorsOf(preview?.nameFindings ?? []);
  const canCreate = !previewPending && !creating && !ruleErrors.length && !nameErrors.length && form.serviceDayIds.length > 0 && Boolean(name.trim());
  const breakRule = rules.break;
  const breakCounts = describeBreakRule(breakRule);
  const breakWord = (count: number) => count === 0 ? 'no break' : String(count);
  const routeIds = [...new Set(setup.patterns.map((pattern) => pattern.routeId))].sort((left, right) => (routes.get(left)?.name ?? '').localeCompare(routes.get(right)?.name ?? ''));
  const terminals = terminalNodes(form, setup);
  const garageCount = Object.values(form.garages).filter(Boolean).length;
  const breakSummary = breakRule
    ? `${breakRule.lengthMinutes} min after ${form.patterns.filter((row) => row.breakAllowed).map((row) => patterns.get(row.patternId)?.name).join(', ') || 'no pattern'}, from ${breakRule.firstBreakAfterHours} h${breakRule.minimumBlockHours > 0 ? `, blocks over ${breakRule.minimumBlockHours} h` : ''}${breakRule.anotherBreakAfterHours !== undefined ? `, again after ${breakRule.anotherBreakAfterHours} h` : ''}`
    : 'No breaks';
  const limitsSummary = [rules.maxRunningHours !== undefined ? `Max ${rules.maxRunningHours} running h` : '', rules.maxRevenueMiles !== undefined ? `max ${rules.maxRevenueMiles} revenue mi` : '', rules.maxVehicles !== undefined ? `max ${rules.maxVehicles} vehicles` : ''].filter(Boolean).join(' · ') || 'No limits';
  const pullSummary = `${garageCount ? `${plural(garageCount, 'garage')}` : 'No garage · blocks start and end at a terminal'} · ${terminals.length ? `${Math.max(...rules.terminals.map((row) => row.pullOutMinutes), 0)} min` : '0 min'}`;
  const sourceLabel = setup.sources.find((source) => source.blockingScenarioId === sourceId);

  async function create() {
    if (!canCreate || !rules) return;
    setCreating(true); setError('');
    try { const created = await blockingService.createAutoBlockingScenario({ scenarioId, tripProfileId, name, rules, ...(sourceId ? { sourceBlockingScenarioId: sourceId } : {}), ...(replaceId ? { replaceBlockingScenarioId: replaceId } : {}) }); await onCreated(created); }
    catch (caught) { setError(userFacingError(caught, 'Unable to create the blocking scenario. Review the rules and try again.')); }
    finally { setCreating(false); }
  }

  const groupTitles: Array<[string | undefined, string]> = [['outbound', 'Outbound'], ['inbound', 'Inbound'], [undefined, 'No direction']];
  return <DialogShell onClose={onClose} busy={creating} onSubmit={() => void create()}>
    <h2>Auto-blocking</h2>
    <p className="auto-blocking-intro">{replaceId ? `Rebuilds the blocks of ${existing?.scenario.name} on the selected days` : 'Creates a new blocking scenario'} from the {tripCount} trips in trip profile {tripProfileName}. Each departure takes the vehicle that became ready most recently after its minimum layover, so spare vehicles finish early; if none is ready, a new block starts. The result is ordinary blocks that you can edit, rename or delete.</p>
    <section className="auto-blocking-body">
      <div className="auto-blocking-col">
        <div className="auto-blocking-name-row">
          <div className="auto-blocking-name-field">
            <label className="dialog-field">Blocking scenario name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} aria-invalid={nameErrors.length > 0} /></label>
            <label className="auto-blocking-check-line" title={existing ? undefined : 'The selected blocking scenario was not built automatically.'}><input type="checkbox" checked={replace} disabled={!existing || creating} onChange={(event) => {
              const next = event.target.checked; setReplace(next);
              if (next && existing) { setName(existing.scenario.name); setForm(formFromRules(existing.rules, setup)); } else setName(setup.defaultName);
            }} />Edit rules of {existing ? existing.scenario.name : 'the selected scenario'}</label>
          </div>
          <fieldset className="auto-blocking-days"><legend>Service days</legend>
            {setup.serviceDays.map(({ day, tripCount: count }) => <label key={day.id} className="auto-blocking-check-line"><input type="checkbox" disabled={count === 0} checked={form.serviceDayIds.includes(day.id)} onChange={(event) => update({ serviceDayIds: event.target.checked ? setup.serviceDays.filter((entry) => entry.day.id === day.id || form.serviceDayIds.includes(entry.day.id)).map((entry) => entry.day.id) : form.serviceDayIds.filter((id) => id !== day.id) })} />{day.name} <small>{count ? plural(count, 'trip') : 'no trips'}</small></label>)}
          </fieldset>
          {nameErrors.concat(ruleErrors.filter((finding) => finding.ruleId === 'autoBlocking.serviceDaysRequired')).map((finding) => <p key={finding.ruleId} className="field-error">{FINDING_FIELD_TEXT[finding.ruleId] ?? finding.ruleId}</p>)}
        </div>

        <details open className="auto-blocking-section"><summary><span className="auto-blocking-section-title">Patterns</span><span className="auto-blocking-section-sum">Minimum layover, breaks, and where blocks start and end</span></summary>
          <div className="auto-blocking-section-body">
            {routeIds.map((routeId) => <div key={routeId} className="auto-blocking-route">
              {routeIds.length > 1 && <h3 className="auto-blocking-route-title">{routes.get(routeId)?.name}</h3>}
              {groupTitles.map(([group, title]) => {
                const rows = form.patterns.filter((row) => patterns.get(row.patternId)?.routeId === routeId && setup.patternGroups[row.patternId] === group);
                if (!rows.length) return null;
                return <div key={title} className="auto-blocking-group">
                  <p className="auto-blocking-group-title">{title}</p>
                  <div className="table-scroll data-grid auto-blocking-table"><table aria-label={`${title} patterns`}>
                    <colgroup><col className="auto-blocking-w-pat" /><col className="auto-blocking-w-rule" /><col className="auto-blocking-w-c" /><col className="auto-blocking-w-se" /><col className="auto-blocking-w-se" /></colgroup>
                    <thead><tr><th scope="col">Pattern</th><th scope="col">Minimum layover after</th><th scope="col" className="auto-blocking-c">Break here</th><th scope="col">Block can start</th><th scope="col">Block can end</th></tr></thead>
                    <tbody>{rows.map((row) => {
                      const pattern = patterns.get(row.patternId)!; const first = pattern.points[0]?.nodeId; const last = pattern.points.at(-1)?.nodeId;
                      return <tr key={row.patternId}>
                        <th scope="row">{renderPatternPill(pattern)}<span className="auto-blocking-pat-name">{pattern.name}</span><span className="auto-blocking-pat-ends">{short(first)} → {short(last)} · {plural(setup.patternTripCounts[pattern.id] ?? 0, 'trip')}</span></th>
                        <td><div className="auto-blocking-rule">
                          <select aria-label={`Minimum layover after ${pattern.name}`} value={row.mode} onChange={(event) => updatePattern(row.patternId, { mode: event.target.value as LayoverMode })}><option value="none">No minimum</option><option value="minutes">Minutes</option><option value="percent">% of trip</option></select>
                          <input type="number" min={0} step={row.mode === 'minutes' ? 1 : 'any'} aria-label={`Minimum layover amount after ${pattern.name}`} disabled={row.mode === 'none'} value={row.mode === 'none' ? '' : row.amount} onChange={(event) => updatePattern(row.patternId, { amount: event.target.value })} />
                        </div></td>
                        <td className="auto-blocking-c"><input type="checkbox" aria-label={`Break here after ${pattern.name}`} checked={row.breakAllowed} onChange={(event) => updatePattern(row.patternId, { breakAllowed: event.target.checked })} /></td>
                        <td><label className="auto-blocking-check-line"><input type="checkbox" aria-label={`${pattern.name}: block can start at ${short(first)}`} checked={row.canStart} onChange={(event) => updatePattern(row.patternId, { canStart: event.target.checked })} />at {short(first)}</label></td>
                        <td><label className="auto-blocking-check-line"><input type="checkbox" aria-label={`${pattern.name}: block can end at ${short(last)}`} checked={row.canEnd} onChange={(event) => updatePattern(row.patternId, { canEnd: event.target.checked })} />at {short(last)}</label></td>
                      </tr>;
                    })}</tbody>
                  </table></div>
                </div>;
              })}
            </div>)}
          </div>
        </details>

        <details open className="auto-blocking-section"><summary><span className="auto-blocking-section-title">Breaks</span><span className="auto-blocking-section-sum">{breakSummary}</span></summary>
          <div className="auto-blocking-section-body">
            <label className="auto-blocking-check-line auto-blocking-break-toggle"><input type="checkbox" checked={form.breakEnabled} onChange={(event) => update({ breakEnabled: event.target.checked })} />Add breaks</label>
            <div className="auto-blocking-quad">
              <label>Break length (min)<input type="number" min={1} step={1} disabled={!form.breakEnabled} value={form.breakLength} onChange={(event) => update({ breakLength: event.target.value })} /></label>
              <label>Only for blocks longer than (h)<input type="number" min={0} step="any" disabled={!breakRule} value={form.breakMinBlock} onChange={(event) => update({ breakMinBlock: event.target.value })} /></label>
              <label>First break no earlier than (h after start)<input type="number" min={0} step="any" disabled={!breakRule} value={form.breakFirst} onChange={(event) => update({ breakFirst: event.target.value })} /></label>
              <label>Another break after (h without one)<input type="number" min={0} step="any" disabled={!breakRule} value={form.breakAnother} onChange={(event) => update({ breakAnother: event.target.value })} /></label>
            </div>
            {breakRule && <p className="auto-blocking-worked">With these rules: a 4 h block gets {breakWord(breakCounts[0].breaks)} · an 8 h block gets {breakWord(breakCounts[1].breaks)} · a 16 h block gets {breakWord(breakCounts[2].breaks)}. Breaks are taken only after patterns marked Break here.</p>}
          </div>
        </details>

        <details className="auto-blocking-section"><summary><span className="auto-blocking-section-title">Block limits</span><span className="auto-blocking-section-sum">{limitsSummary}</span></summary>
          <div className="auto-blocking-section-body">
            <div className="auto-blocking-duo">
              <label>Maximum running per block (h)<input type="number" min={0} step="any" value={form.maxRunning} onChange={(event) => update({ maxRunning: event.target.value })} /></label>
              <label>Maximum revenue miles per block<input type="number" min={0} step="any" disabled={setup.milesIncompletePatternIds.length > 0} value={form.maxMiles} onChange={(event) => update({ maxMiles: event.target.value })} /></label>
            </div>
            <div className="auto-blocking-duo">
              <label>Maximum vehicles per day<input type="number" min={1} step={1} value={form.maxVehicles} aria-invalid={ruleErrors.some((finding) => finding.ruleId === 'autoBlocking.limitVehicles')} aria-describedby="auto-blocking-max-vehicles-hint" onChange={(event) => update({ maxVehicles: event.target.value })} /></label>
              <p id="auto-blocking-max-vehicles-hint" className="auto-blocking-worked">Leave blank for no limit.</p>
            </div>
            {ruleErrors.filter((finding) => finding.ruleId === 'autoBlocking.limitVehicles').map((finding) => <p key={finding.ruleId} className="field-error">{FINDING_FIELD_TEXT[finding.ruleId]}</p>)}
            {setup.milesIncompletePatternIds.length > 0 && <InlineNote kind="warn">Revenue miles are incomplete for {setup.milesIncompletePatternIds.map((id) => patterns.get(id)?.name ?? id).join(', ')}. Enter cumulative miles on the Route tab.</InlineNote>}
          </div>
        </details>

        <details className="auto-blocking-section"><summary><span className="auto-blocking-section-title">Pull-out and pull-in</span><span className="auto-blocking-section-sum">{pullSummary}</span></summary>
          <div className="auto-blocking-section-body">
            {routeIds.map((routeId) => {
              const garages = setup.nodes.filter((node) => node.routeId === routeId && node.kind === 'garage');
              return <label key={routeId} className="auto-blocking-garage-field">Garage{routeIds.length > 1 ? ` · ${routes.get(routeId)?.name}` : ''}
                <select value={form.garages[routeId] ?? ''} onChange={(event) => update({ garages: { ...form.garages, [routeId]: event.target.value } })}><option value="">None · start and end at a terminal</option>{garages.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select>
                {!garages.length && <small>This scenario has no garage nodes. Add one on the Route tab to pull out from it.</small>}
              </label>;
            })}
            {terminals.length > 0 && <div className="table-scroll data-grid auto-blocking-table"><table aria-label="Pull-out and pull-in by terminal">
              <thead><tr><th scope="col">Terminal</th><th scope="col">Pull-out (min before first trip)</th><th scope="col">Pull-in (min after last trip)</th><th scope="col">Miles each way</th></tr></thead>
              <tbody>{terminals.map((node) => { const row = form.terminals[node.id] ?? { pullOut: '0', pullIn: '0', miles: '' }; const label = nodeShortName(node) || node.name; return <tr key={node.id}>
                <th scope="row">{node.name}</th>
                <td><input type="number" min={0} step={1} aria-label={`Pull-out minutes at ${label}`} value={row.pullOut} onChange={(event) => updateTerminal(node.id, { pullOut: event.target.value })} /></td>
                <td><input type="number" min={0} step={1} aria-label={`Pull-in minutes at ${label}`} value={row.pullIn} onChange={(event) => updateTerminal(node.id, { pullIn: event.target.value })} /></td>
                <td><input type="number" min={0} step="any" aria-label={`Miles each way at ${label}`} disabled={!form.garages[node.routeId]} value={row.miles} onChange={(event) => updateTerminal(node.id, { miles: event.target.value })} /></td>
              </tr>; })}</tbody>
            </table></div>}
          </div>
        </details>

        <details className="auto-blocking-section"><summary><span className="auto-blocking-section-title">Deadhead connections</span><span className="auto-blocking-section-sum">{rules.deadheads.length ? plural(rules.deadheads.length, 'connection') : 'None · trips connect only where one ends and the next starts'}</span></summary>
          <div className="auto-blocking-section-body">
            {form.deadheads.length > 0 && <div className="table-scroll data-grid auto-blocking-table"><table aria-label="Deadhead connections">
              <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Minutes</th><th scope="col">Miles</th><th scope="col" className="auto-blocking-c">Both ways</th><th scope="col"><span className="visually-hidden">Remove</span></th></tr></thead>
              <tbody>{form.deadheads.map((row, index) => { const from = nodes.get(row.from); return <tr key={row.key}>
                <td><select aria-label={`Connection ${index + 1} from`} value={row.from} onChange={(event) => updateDeadhead(row.key, { from: event.target.value, to: '' })}><option value="">Choose a node</option>{setup.nodes.map((node) => <option key={node.id} value={node.id}>{routes.get(node.routeId)?.name} · {nodeShortName(node) || node.name}</option>)}</select></td>
                <td><select aria-label={`Connection ${index + 1} to`} value={row.to} disabled={!from} onChange={(event) => updateDeadhead(row.key, { to: event.target.value })}><option value="">Choose a node</option>{setup.nodes.filter((node) => from && node.routeId === from.routeId && node.id !== from.id).map((node) => <option key={node.id} value={node.id}>{nodeShortName(node) || node.name}</option>)}</select></td>
                <td><input type="number" min={0} step={1} aria-label={`Connection ${index + 1} minutes`} value={row.minutes} onChange={(event) => updateDeadhead(row.key, { minutes: event.target.value })} /></td>
                <td><input type="number" min={0} step="any" aria-label={`Connection ${index + 1} miles`} value={row.miles} onChange={(event) => updateDeadhead(row.key, { miles: event.target.value })} /></td>
                <td className="auto-blocking-c"><input type="checkbox" aria-label={`Connection ${index + 1} both ways`} checked={row.bothWays} onChange={(event) => updateDeadhead(row.key, { bothWays: event.target.checked })} /></td>
                <td><button type="button" className="auto-blocking-icon-x" aria-label="Remove connection" title="Remove connection" onClick={() => update({ deadheads: form.deadheads.filter((candidate) => candidate.key !== row.key) })}>×</button></td>
              </tr>; })}</tbody>
            </table></div>}
            <div className="auto-blocking-row-start"><button type="button" className="link-button" onClick={() => update({ deadheads: [...form.deadheads, { key: deadheadKey++, from: '', to: '', minutes: '', miles: '', bothWays: false }] })}>+ Add connection</button></div>
            <p className="auto-blocking-worked">A vehicle that ends a trip at the From node can take a trip from the To node once the deadhead and the minimum layover have passed. A connection is used only when it lets a block continue.</p>
          </div>
        </details>
      </div>

      <div className="auto-blocking-col auto-blocking-side-col">
        <div className="auto-blocking-aside">
          <label className="auto-blocking-side-field">Read rules from built blocks
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">None</option>{setup.sources.map((source) => <option key={source.blockingScenarioId} value={source.blockingScenarioId}>{source.scenarioName ? `${source.scenarioName} · ` : ''}{source.name}</option>)}</select>
          </label>
          {sourceId && (measurement ? <>
            <ul className="auto-blocking-readout">{measurement.lines.map((line, index) => <li key={index}>{line.text}</li>)}</ul>
            <button type="button" onClick={() => setForm(formFromRules({ ...measurement.rules, serviceDayIds: form.serviceDayIds }, setup))}>Use these rules</button>
          </> : <p role="status" className="auto-blocking-worked">Reading the built blocks…</p>)}
        </div>
        <div className="auto-blocking-aside">
          <p className="auto-blocking-side-title">Preview{previewPending ? ' · updating…' : ''}</p>
          <div className="auto-blocking-preview-table"><table aria-label="Automatic blocking preview">
            <thead><tr><th scope="col">Day</th><th scope="col">Blocks</th><th scope="col">Peak vehicles</th><th scope="col">Revenue (h)</th><th scope="col">Layover %</th><th scope="col">Longest (h)</th><th scope="col">1 break</th><th scope="col">2+ breaks</th></tr></thead>
            <tbody>{(preview?.result.days ?? []).map((day) => <tr key={day.serviceDayId}>
              <th scope="row">{setup.serviceDays.find((entry) => entry.day.id === day.serviceDayId)?.day.name}</th>
              <td>{day.blockCount}</td><td>{day.peakVehicles}</td><td>{hours(day.revenueSeconds)}</td><td>{day.layoverPercent === undefined ? '–' : day.layoverPercent.toFixed(1)}</td><td>{hours(day.longestBlockSeconds)}</td><td>{day.blocksWithOneBreak}</td><td>{day.blocksWithTwoOrMoreBreaks}</td>
            </tr>)}</tbody>
          </table></div>
          {findingSentences(preview?.result.findings ?? [], patterns, nodes, new Map(setup.serviceDays.map((entry) => [entry.day.id, entry.day.name]))).map((sentence) => <InlineNote key={sentence} kind="warn">{sentence}</InlineNote>)}
          {preview?.check?.days.filter((day) => day.builtRevenueSeconds > 0 || day.autoRevenueSeconds > 0).map((day) => {
            const difference = day.builtRevenueSeconds > 0 ? (day.autoRevenueSeconds - day.builtRevenueSeconds) / day.builtRevenueSeconds * 100 : 0;
            return <InlineNote key={day.serviceDayId} kind="ok">Same rules on {sourceLabel?.scenarioName || sourceLabel?.name} {day.name} trips: {plural(day.autoBlocks, 'block')}, {day.autoPeakVehicles} at peak, {hours(day.autoRevenueSeconds)} h. Its built blocks: {plural(day.builtBlocks, 'block')}, {day.builtPeakVehicles} at peak, {hours(day.builtRevenueSeconds)} h (automatic is {Math.abs(difference).toFixed(1)}% {difference >= 0 ? 'higher' : 'lower'}).</InlineNote>;
          })}
        </div>
      </div>
    </section>
    {replaceId && existing && (existing.editedBlockCount > 0 || existing.blockCountChanged) && <InlineNote kind="warn">Blocks of {existing.scenario.name} were edited, added or deleted since the last build. Rebuilding replaces the blocks on the selected days, including those edits.</InlineNote>}
    {error && <p className="field-error">{error}</p>}
    <div className="dialog-actions"><button type="button" onClick={onClose} disabled={creating}>Cancel</button><button type="submit" className="primary" disabled={!canCreate}>{creating ? (replaceId ? 'Rebuilding…' : 'Creating…') : replaceId ? 'Rebuild blocks' : 'Create blocking scenario'}</button></div>
  </DialogShell>;
}

/** The one dialog frame, used while loading and once loaded. */
function DialogShell({ children, onClose, busy = false, onSubmit }: { children: ReactNode; onClose: () => void; busy?: boolean; onSubmit?: () => void }) {
  return <ModalDialog as="form" label="Auto-blocking" className="confirm-dialog auto-blocking-dialog" onClose={onClose} busy={busy} onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>{children}</ModalDialog>;
}

/** One plain sentence per warning rule, with repeats counted. */
function findingSentences(findings: ValidationFinding[], patterns: Map<string, RoutePattern>, nodes: Map<string, Node>, dayNames: Map<string, string>): string[] {
  const groups = new Map<string, ValidationFinding[]>();
  findings.filter((finding) => finding.severity === 'warning').forEach((finding) => {
    const key = `${finding.ruleId}|${finding.parameters?.patternId ?? finding.parameters?.nodeId ?? finding.parameters?.serviceDayId ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  });
  return [...groups.values()].map((items) => {
    const finding = items[0]; const count = items.length;
    const pattern = patterns.get(String(finding.parameters?.patternId ?? ''))?.name ?? 'a pattern';
    const node = nodes.get(String(finding.parameters?.nodeId ?? ''))?.name ?? 'a node';
    switch (finding.ruleId) {
      case 'autoBlocking.startNotAllowed': return `${plural(count, 'trip')} had to start a block on ${pattern}, which cannot start one.`;
      case 'autoBlocking.endNotAllowed': return `${plural(count, 'block')} ${count === 1 ? 'ends' : 'end'} after ${pattern}, which cannot end one.`;
      case 'autoBlocking.deadEndNode': return `Trips end at ${node}, where no trip of the route departs and no deadhead connection leaves${count > 1 ? ` (on ${count} days)` : ''}.`;
      case 'autoBlocking.tripExceedsLimit': return `${plural(count, 'trip')} ${count === 1 ? 'is' : 'are'} longer than a block limit by itself.`;
      case 'autoBlocking.revenueMilesUnavailable': return 'Revenue miles are incomplete, so the revenue-mile limit is ignored.';
      case 'autoBlocking.patternRuleMissing': return `${pattern} had no rule row; its defaults were used.`;
      case 'autoBlocking.tripWithoutTimes': return `${plural(count, 'trip')} without run times ${count === 1 ? 'was' : 'were'} skipped.`;
      case 'autoBlocking.vehicleLimitAlternateRule': {
        const difference = Number(finding.parameters?.revenueDifferenceSeconds ?? 0);
        return `${dayNames.get(String(finding.parameters?.serviceDayId ?? '')) ?? 'A day'}: built by giving each trip to the vehicle that has waited longest, to meet the vehicle limit. Revenue time is ${hours(Math.abs(difference))} h ${difference < 0 ? 'less' : 'more'} than without the limit.`;
      }
      case 'autoBlocking.vehicleLimitExceeded': return `${dayNames.get(String(finding.parameters?.serviceDayId ?? '')) ?? 'A day'} needs ${finding.parameters?.peakVehicles} vehicles at peak; the limit is ${finding.parameters?.maxVehicles}.`;
      case 'autoBlocking.breakPassesExhausted': return 'The minimum block length for breaks did not settle in 5 passes.';
      default: return `${finding.ruleId} (${count}).`;
    }
  });
}
