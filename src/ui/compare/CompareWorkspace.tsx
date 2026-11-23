import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CompareCommands } from '../../application/compare/compareService';
import type { CompareOutcome, CompareProgress, CompareRequest, CompareSideRequest, CompareSuccess } from '../../application/compare/compareTypes';
import { comparisonCsvText, comparisonFileName, type ComparisonCsvHeading } from '../../domain/compare/comparisonCsv';
import { matchServiceDays } from '../../domain/compare/serviceDayMatch';
import type { CompareSide, ComparisonRow, Measure, SideChoice } from '../../domain/compare/types';
import { formatClock, MISSING } from '../format';
import { costingFindingMessage } from '../costing/CostingWorkspace';
import { createLatestRequest } from '../latestRequest';
import { readComparePreference, writeComparePreference, type ComparePreference, type CompareShowPreference, type CompareSidePreference, type CompareSortPreference } from '../preferences';
import { InlineNote } from '../shared/surfaces';
import { SegmentedControl } from '../shared/SegmentedControl';
import { download } from '../shared/download';
import { rememberedTripBlockingScenarios } from '../trips/TripsWorkspace';
import {
  CHOICE_LABELS, STATUS_TEXT, arrangeRows, barFraction, chooseDay, dayLabel, differenceLines, differs, errorLines, foldedSummary, formatChange, formatMeasure, formatPercentChange, formatSpan,
  fromTo, headwayCell, headwayColumns, largestHoursChange, peakMissing, progressFraction, requestKey, resolveSide, resolveSides, sideLabel, sidePreference, spanChange, totalsTiles, warningLines,
  type CompareScenarioChoice, type MeasureKind, type SideDefaults, type Tone,
} from './compareModel';

/** What the tab needs from the application: the comparison, and the Scenarios of the open Project that the side pickers list. */
export type CompareApplication = CompareCommands & { listChoices(projectId: string): Promise<CompareScenarioChoice[]> };

const NONE = '__none__';
const SHOW_OPTIONS: ReadonlyArray<[CompareShowPreference, string]> = [['all', 'All routes'], ['changed', 'Changed'], ['new', 'New'], ['discontinued', 'Discontinued'], ['unchanged', 'Unchanged']];
const SORT_OPTIONS: ReadonlyArray<[CompareSortPreference, string]> = [['hours', 'Largest hours change'], ['route', 'Route order']];

/** The Compare tab (Decision 0091). Read only: it saves nothing to the Project and takes no part in undo or in the navigation guard. */
export function CompareWorkspace({ compareService, projectId, appScenarioId, appTripProfileId, onError }: {
  compareService: CompareApplication;
  projectId: string;
  /** The Scenario selected in the app and its working Trip profile: the first-open Baseline. */
  appScenarioId: string;
  appTripProfileId: string;
  onError: (error: unknown, fallback?: string) => void;
}) {
  const [choices, setChoices] = useState<CompareScenarioChoice[]>();
  const [preference, setPreference] = useState<ComparePreference>(() => readComparePreference(projectId));
  const [shown, setShown] = useState<{ request: CompareRequest; outcome: CompareOutcome }>();
  const [progress, setProgress] = useState<CompareProgress>();
  const [busy, setBusy] = useState(false);
  const [find, setFind] = useState('');
  const [openKey, setOpenKey] = useState<string>();
  const [foldOpen, setFoldOpen] = useState(false);
  const latest = useMemo(() => createLatestRequest(), []);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // The save stamp does not see writes from another browser tab, so each opening of the tab starts from fresh reads. This effect is
  // declared before the comparing one, so it runs first.
  useEffect(() => { compareService.clearCache(); }, [compareService]);

  useEffect(() => {
    let live = true;
    compareService.listChoices(projectId).then((next) => { if (live) setChoices(next); }).catch((error) => onErrorRef.current(error, 'Unable to list the scenarios to compare.'));
    return () => { live = false; };
  }, [compareService, projectId]);

  const defaults: SideDefaults = { appScenarioId, appTripProfileId, rememberedBlocking: rememberedTripBlockingScenarios };
  const sides = useMemo(() => (choices ? resolveSides(choices, preference, { appScenarioId, appTripProfileId, rememberedBlocking: rememberedTripBlockingScenarios }) : undefined), [choices, preference, appScenarioId, appTripProfileId]);
  const scenarioOf = (id: string) => choices?.find((item) => item.id === id);
  // The matched days come from the sides' own service days (the same rule the service applies), so the Day menu is complete while a
  // comparison is still running or has failed.
  const dayPairs = useMemo(() => {
    const baseline = sides && scenarioOf(sides.baseline.scenarioId);
    const proposed = sides && scenarioOf(sides.proposed.scenarioId);
    return baseline && proposed ? matchServiceDays(baseline.serviceDays, proposed.serviceDays) : [];
  }, [choices, sides]);
  const day = chooseDay(dayPairs, preference.day);
  const rates: SideChoice = preference.rates ?? 'baseline';
  const counts: SideChoice = preference.counts ?? 'baseline';
  const show = preference.show ?? 'all';
  const sort = preference.sort ?? 'hours';
  const request: CompareRequest | undefined = sides ? { baseline: sides.baseline, proposed: sides.proposed, day, rates, counts } : undefined;
  const key = request ? requestKey(request) : undefined;

  useEffect(() => {
    if (!key) return;
    const wanted = JSON.parse(key) as CompareRequest;
    const current = latest.begin();
    setBusy(true);
    setProgress(undefined);
    compareService.compare(wanted, (next) => { if (current()) setProgress(next); })
      .then((outcome) => { if (!current()) return; setShown({ request: wanted, outcome }); setOpenKey(undefined); setBusy(false); })
      // A failed comparison clears the result on screen: the old one would otherwise sit under the new choices, and could be downloaded.
      .catch((error) => { if (!current()) return; setShown(undefined); setOpenKey(undefined); setBusy(false); onErrorRef.current(error, 'Unable to compare these scenarios.'); });
    return () => { /* A newer request makes this one stale through `latest`; nothing to cancel. */ };
  }, [key, compareService, latest]);

  function update(patch: Partial<ComparePreference>) {
    const next = { ...preference, ...patch };
    setPreference(next);
    writeComparePreference(projectId, next);
  }

  function changeSide(which: CompareSide, patch: Partial<CompareSideRequest>) {
    if (!sides || !choices) return;
    const current = sides[which];
    let preferred: CompareSidePreference = { ...sidePreference(current), ...patch };
    if (patch.scenarioId && patch.scenarioId !== current.scenarioId) preferred = { scenarioId: patch.scenarioId };
    else if (patch.tripProfileId && patch.tripProfileId !== current.tripProfileId) preferred = { scenarioId: current.scenarioId, tripProfileId: patch.tripProfileId };
    const resolved = resolveSide(choices, preferred, current.scenarioId, defaults);
    if (resolved) update({ baseline: sidePreference(which === 'baseline' ? resolved : sides.baseline), proposed: sidePreference(which === 'proposed' ? resolved : sides.proposed) });
  }

  if (!choices) return <div className="cmp"><h1 className="visually-hidden">Compare scenarios</h1><p className="cmp-empty" role="status">Loading the scenarios of this project…</p></div>;
  if (!sides || !request) return <div className="cmp"><h1 className="visually-hidden">Compare scenarios</h1><section className="empty-state"><h2>Nothing to compare yet</h2><p>Each side needs a Scenario with a trip profile. Create a trip profile on the Trips tab, then come back.</p></section></div>;

  // The names under the result are those of the request that made it, not of the choices made since.
  const shownSides = shown?.request ?? request;
  const names = { baseline: scenarioOf(shownSides.baseline.scenarioId)?.name ?? '', proposed: scenarioOf(shownSides.proposed.scenarioId)?.name ?? '' };
  const routeName = (id: string) => choices.map((scenario) => scenario.routes.find((route) => route.id === id)?.name).find(Boolean);
  const outcome = shown?.outcome;
  // The CSV is of the comparison on screen, so it names the sides, day and menus of the request that made it.
  function downloadCsv() {
    if (!shown || shown.outcome.status !== 'ok' || !choices) return;
    const { request: made, outcome: result } = shown;
    const baselineName = scenarioNameOf(choices, made.baseline);
    const proposedName = scenarioNameOf(choices, made.proposed);
    const sameNames = baselineName === proposedName;
    const heading: ComparisonCsvHeading = { baselineName: sideLabel(choices, made.baseline), proposedName: sideLabel(choices, made.proposed), day: dayLabel(made.day, result.dayPairs), rates: CHOICE_LABELS[made.rates], counts: CHOICE_LABELS[made.counts], preparedOn: localDate(new Date()) };
    const fileName = comparisonFileName(sameNames ? heading.baselineName : baselineName, sameNames ? heading.proposedName : proposedName, heading.day);
    download(fileName, comparisonCsvText(result.comparison, heading), 'text/csv;charset=utf-8');
  }

  return <div className="cmp">
    <h1 className="visually-hidden">Compare scenarios</h1>
    <div className="cmp-sides">
      <SidePicker which="baseline" title="Baseline" choices={choices} side={sides.baseline} onChange={(patch) => changeSide('baseline', patch)} />
      <button type="button" className="cmp-swap" aria-label="Swap sides" title="Swap sides" onClick={() => update({ baseline: sidePreference(sides.proposed), proposed: sidePreference(sides.baseline) })}><span aria-hidden="true">⇄</span></button>
      <SidePicker which="proposed" title="Proposed" choices={choices} side={sides.proposed} onChange={(patch) => changeSide('proposed', patch)} />
    </div>
    <div className="cmp-controls">
      {dayPairs.length > 0 && <div className="cmp-day"><span id="cmp-day-label">Day</span><SegmentedControl label="Day" value={day} onChange={(next) => update({ day: next })} options={[...dayPairs.map((pair) => ({ value: pair.key, text: pair.name, title: pair.name })), { value: 'annual', text: 'Annual', title: 'Annual' }]} /></div>}
      <div className="cmp-controls__group">
        <ChoiceSelect label="Rates" value={rates} onChange={(next) => update({ rates: next })} />
        <ChoiceSelect label="Day counts" value={counts} onChange={(next) => update({ counts: next })} />
      </div>
    </div>
    {busy && <div className="cmp-progress" role="status"><span>{progress?.message ?? 'Calculating…'}</span><span className="cmp-progress__track" aria-hidden="true"><i style={{ width: `${Math.round(progressFraction(progress) * 100)}%` }} /></span></div>}
    {outcome?.status === 'error' && <div className="costing-alert error" role="alert"><p>These two sides cannot be compared yet.</p><ul>{outcome.errors.flatMap((error, index) => errorLines(error, names, (finding) => costingFindingMessage(finding)).map((line, lineIndex) => <li key={`${index}-${lineIndex}`}>{line}</li>))}</ul></div>}
    {outcome?.status === 'ok' && shown && <ComparisonView
      outcome={outcome} request={shown.request} busy={busy} names={names} routeName={routeName}
      show={show} sort={sort} find={find} onFind={setFind} onShow={(next) => update({ show: next })} onSort={(next) => update({ sort: next })}
      openKey={openKey} onOpen={setOpenKey} foldOpen={foldOpen} onFold={setFoldOpen}
      onResetChoice={(menu) => update({ [menu]: 'baseline' })} onDownload={downloadCsv} />}
  </div>;
}

/** The date on this device as YYYY-MM-DD (not UTC, which can be tomorrow or yesterday in the evening or morning). */
function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const scenarioNameOf = (choices: readonly CompareScenarioChoice[], side: CompareSideRequest) => choices.find((item) => item.id === side.scenarioId)?.name ?? '';

/** A labelled control. The label is a sibling of the control (not its parent), so the control's name is only the label's text. */
function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="cmp-field"><label htmlFor={id}>{label}</label>{children(id)}</div>;
}

function ChoiceSelect({ label, value, onChange }: { label: string; value: SideChoice; onChange: (value: SideChoice) => void }) {
  return <Field label={label}>{(id) => <select id={id} value={value} onChange={(event) => onChange(event.target.value as SideChoice)}>{(['baseline', 'proposed', 'own'] as const).map((choice) => <option key={choice} value={choice}>{CHOICE_LABELS[choice]}</option>)}</select>}</Field>;
}

/** One side: Scenario, Trip profile and Blocking scenario. The Blocking menu ends with "None (estimate)" (Decision 0091 item 1). */
function SidePicker({ which, title, choices, side, onChange }: { which: CompareSide; title: string; choices: CompareScenarioChoice[]; side: CompareSideRequest; onChange: (patch: Partial<CompareSideRequest>) => void }) {
  const scenario = choices.find((item) => item.id === side.scenarioId);
  const blocking = (scenario?.blockingScenarios ?? []).filter((item) => item.tripProfileId === side.tripProfileId);
  return <fieldset className={`cmp-side cmp-side--${which}`}>
    <legend>{title}</legend>
    <div className="cmp-side__fields">
      <Field label="Scenario">{(id) => <select id={id} value={side.scenarioId} onChange={(event) => onChange({ scenarioId: event.target.value })}>{choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</Field>
      <Field label="Trip profile">{(id) => <select id={id} value={side.tripProfileId} onChange={(event) => onChange({ tripProfileId: event.target.value })}>{(scenario?.tripProfiles ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</Field>
      <Field label="Blocking scenario">{(id) => <select id={id} value={side.blockingScenarioId ?? NONE} onChange={(event) => onChange({ blockingScenarioId: event.target.value === NONE ? null : event.target.value })}>
        {blocking.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        <option value={NONE}>None (estimate)</option>
      </select>}</Field>
    </div>
  </fieldset>;
}

const toneClass = (tone: Tone) => `cmp-${tone}`;

function Delta({ kind, change, tile }: { kind: MeasureKind; change: number | undefined; tile?: boolean }) {
  const { text, tone } = formatChange(kind, change, { tile });
  return <span className={toneClass(tone)}>{text}</span>;
}

/** "from → to"; a side that is absent or not measured is drawn lighter. */
function FromToText({ kind, measure, tile, missing }: { kind: MeasureKind; measure: Measure; tile?: boolean; missing?: { baseline?: string; proposed?: string } }) {
  const { from, to } = fromTo(kind, measure, { tile, missing });
  const light = (side: 'baseline' | 'proposed', text: string) => (measure[side] === undefined ? <span className="cmp-from">{text}</span> : text);
  return <>{light('baseline', from)} → {light('proposed', to)}</>;
}

function ComparisonView({ outcome, request, busy, names, routeName, show, sort, find, onFind, onShow, onSort, openKey, onOpen, foldOpen, onFold, onResetChoice, onDownload }: {
  outcome: CompareSuccess;
  request: CompareRequest;
  busy: boolean;
  names: { baseline: string; proposed: string };
  routeName: (id: string) => string | undefined;
  show: CompareShowPreference; sort: CompareSortPreference; find: string;
  onFind: (text: string) => void; onShow: (show: CompareShowPreference) => void; onSort: (sort: CompareSortPreference) => void;
  openKey: string | undefined; onOpen: (key: string | undefined) => void; foldOpen: boolean; onFold: (open: boolean) => void;
  onResetChoice: (menu: 'rates' | 'counts') => void; onDownload: () => void;
}) {
  const { comparison, sides } = outcome;
  const annual = request.day === 'annual';
  const blocked = { baseline: sides.baseline.basis === 'blocked', proposed: sides.proposed.basis === 'blocked' };
  const missing = peakMissing(blocked);
  const dayName = annual ? 'Annual' : outcome.dayPairs.find((pair) => pair.key === request.day)?.name ?? '';
  const lines = differenceLines(outcome.differences, names);
  const warnings = warningLines(comparison.warnings, routeName);
  const sideNotes = (['baseline', 'proposed'] as const).flatMap((side) => sides[side].findings
    .filter((finding) => finding.messageKey === 'costing.routeCountsInUse' || finding.messageKey === 'costing.unattributedUsesLargestCount')
    .map((finding) => `${side === 'baseline' ? 'Baseline' : 'Proposed'}: ${costingFindingMessage(finding)}`));
  const arranged = arrangeRows(comparison, { show, sort, find });
  const summary = foldedSummary(arranged.folded);
  const largest = largestHoursChange(comparison.rows);
  const peakSum = comparison.rows.reduce((sum, row) => sum + (row.peakVehicles.proposed ?? 0), 0);
  const showPeakNote = !annual && blocked.proposed && comparison.totals.peakVehicles.proposed !== undefined && peakSum > comparison.totals.peakVehicles.proposed;
  const tableId = useId();

  function tileLabel(id: string): string {
    const labels: Record<string, string> = annual
      ? { trips: 'Trips per year', revenueMiles: 'Revenue miles per year', revenueHours: 'Revenue hours per year', peakVehicles: 'Peak vehicles (highest day)', cost: 'First-year cost' }
      : { trips: 'Trips', revenueMiles: 'Revenue miles', revenueHours: 'Revenue hours', peakVehicles: 'Peak vehicles', cost: `${dayName} cost, per year` };
    return labels[id];
  }

  const rowProps = { annual, missing, largest, openKey, onOpen, tableId };
  return <div className="cmp-result" aria-busy={busy}>
    {(lines.length > 0 || warnings.length > 0 || sideNotes.length > 0) && <div className="cmp-warnings">
      {lines.map((line) => <div className="cmp-warnline" key={line.code}><InlineNote kind="warn">{line.text}</InlineNote>{line.resets && <button type="button" className="ghost" onClick={() => onResetChoice(line.resets!)}>Use the baseline's for both</button>}</div>)}
      {warnings.map((text) => <div className="cmp-warnline" key={text}><InlineNote kind="warn">{text}</InlineNote></div>)}
      {sideNotes.map((text) => <div className="cmp-warnline" key={text}><InlineNote kind="warn">{text}</InlineNote></div>)}
    </div>}
    <div className="cmp-tiles">
      {totalsTiles(comparison.totals).map((tile) => {
        const suffix = tile.id === 'peakVehicles' && annual ? (tile.measure.dayName?.proposed ?? tile.measure.dayName?.baseline) : undefined;
        return <div className="cmp-tile" role="group" aria-label={tileLabel(tile.id)} data-tile={tile.id} key={tile.id}>
          <span className="cmp-tile__label" aria-hidden="true">{tileLabel(tile.id)}</span>
          <span className="cmp-tile__value"><FromToText kind={tile.kind} measure={tile.measure} tile missing={tile.id === 'peakVehicles' ? missing : undefined} /></span>
          <span className="cmp-tile__delta"><Delta kind={tile.kind} change={tile.measure.change} tile />{suffix ? ` · ${suffix}` : tile.measure.percent !== undefined ? ` · ${formatPercentChange(tile.measure.percent)}` : ''}</span>
        </div>;
      })}
    </div>
    <div className="cmp-tablebox">
      <div className="cmp-tools">
        <Field label="Show">{(id) => <select id={id} value={show} onChange={(event) => onShow(event.target.value as CompareShowPreference)}>{SHOW_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>}</Field>
        <Field label="Sort">{(id) => <select id={id} value={sort} onChange={(event) => onSort(event.target.value as CompareSortPreference)}>{SORT_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>}</Field>
        <Field label="Find">{(id) => <input id={id} type="search" value={find} placeholder="Route name or number" onChange={(event) => onFind(event.target.value)} />}</Field>
        <span className="cmp-grow" />
        <button type="button" onClick={onDownload} disabled={busy}>Download CSV</button>
      </div>
      <div className="cmp-scroll">
        <table className="cmp-table" aria-label={`Route comparison, ${dayName}`}>
          <thead><tr>
            <th scope="col">Route</th><th scope="col">Status</th>
            <th scope="col" className="cmp-n cmp-wide">{annual ? 'Trips per year' : 'Trips'}</th><th scope="col" className="cmp-n cmp-wide">Δ trips</th>
            <th scope="col" className="cmp-n cmp-wide">{annual ? 'Revenue hours per year' : 'Revenue hours'}</th><th scope="col" className="cmp-n">Δ hours</th>
            <th scope="col" className="cmp-n cmp-wide">Peak vehicles</th><th scope="col" className="cmp-n">Δ cost / yr</th>
          </tr></thead>
          <tbody>
            {arranged.rows.map((row) => <RouteRow key={row.key} row={row} {...rowProps} />)}
            {arranged.folded.length > 0 && <tr className="cmp-fold"><td colSpan={8}>
              <button type="button" className="cmp-row-button" aria-expanded={foldOpen} onClick={() => onFold(!foldOpen)}><span aria-hidden="true">{foldOpen ? '▾' : '▸'}</span><span>{summary.routes} unchanged {summary.routes === 1 ? 'route' : 'routes'}</span></button>
              {' '}<span className="cmp-note">· {formatMeasure('whole', summary.trips)} {summary.trips === 1 ? 'trip' : 'trips'} ·{formatMeasure('hours', summary.revenueHours)} revenue hours</span>
            </td></tr>}
            {foldOpen && arranged.folded.map((row) => <RouteRow key={row.key} row={row} {...rowProps} />)}
            {arranged.rows.length === 0 && arranged.folded.length === 0 && <tr><td colSpan={8} className="cmp-empty">No routes match.</td></tr>}
          </tbody>
        </table>
      </div>
      {showPeakNote && <p className="cmp-foot">Peak vehicles: the system peak ({formatMeasure('whole', comparison.totals.peakVehicles.proposed)}) is lower than the sum of the routes ({formatMeasure('whole', peakSum)}), because routes peak at different times.</p>}
    </div>
  </div>;
}

interface RowProps {
  row: ComparisonRow;
  annual: boolean;
  missing: { baseline?: string; proposed?: string };
  largest: number;
  openKey: string | undefined;
  onOpen: (key: string | undefined) => void;
  tableId: string;
}

/** A Route's row and, below it when open, its detail (frame 2). One row is open at a time. */
function RouteRow({ row, annual, missing, largest, openKey, onOpen, tableId }: RowProps) {
  const open = openKey === row.key;
  const detailId = `${tableId}-${row.key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const toggle = () => onOpen(open ? undefined : row.key);
  const hours = formatChange('hours', row.revenueHours.change);
  const fraction = barFraction(row.revenueHours.change, largest);
  return <Fragment>
    <tr className={open ? 'cmp-row cmp-row--open' : 'cmp-row'} data-row={row.key} onClick={toggle}>
      <td><button type="button" className="cmp-row-button" aria-expanded={open} aria-controls={open ? detailId : undefined}><span aria-hidden="true">{open ? '▾' : '▸'}</span><span className="cmp-row-button__name">{row.name}</span></button></td>
      <td><span className={`cmp-chip cmp-chip--${row.status}`}>{STATUS_TEXT[row.status]}</span></td>
      <td className="cmp-n cmp-wide"><FromToText kind="whole" measure={row.trips} /></td>
      <td className="cmp-n cmp-wide"><Delta kind="whole" change={row.trips.change} /></td>
      <td className="cmp-n cmp-wide"><FromToText kind="hours" measure={row.revenueHours} /></td>
      <td className="cmp-n"><span className="cmp-bar-cell">
        {fraction > 0 && <span className={`cmp-bar-track${hours.tone === 'down' ? ' cmp-bar-track--down' : ''} cmp-wide`} aria-hidden="true"><i className={`cmp-bar cmp-bar--${hours.tone}`} style={{ width: `${Math.max(2, Math.round(fraction * 80))}px` }} /></span>}
        <span className={toneClass(hours.tone)}>{hours.text}</span></span></td>
      <td className="cmp-n cmp-wide"><FromToText kind="whole" measure={row.peakVehicles} missing={missing} /></td>
      <td className="cmp-n"><Delta kind="money" change={row.cost.change} /></td>
    </tr>
    {open && <tr className="cmp-detail" id={detailId}><td colSpan={8}><RouteDetail row={row} annual={annual} missing={missing} /></td></tr>}
  </Fragment>;
}

/** Figures that differ are bold in the accent colour; the others are plain. */
function DetailCell({ kind, measure, side, missing }: { kind: MeasureKind; measure: Measure; side: 'baseline' | 'proposed'; missing?: { baseline?: string; proposed?: string } }) {
  const text = fromTo(kind, measure, { missing })[side === 'baseline' ? 'from' : 'to'];
  return <td>{differs(kind, measure) ? <b className="cmp-differs">{text}</b> : text}</td>;
}

function RouteDetail({ row, annual, missing }: { row: ComparisonRow; annual: boolean; missing: { baseline?: string; proposed?: string } }) {
  const figures: Array<{ label: string; kind: MeasureKind; measure: Measure; missing?: { baseline?: string; proposed?: string } }> = [
    { label: annual ? 'Trips per year' : 'Trips', kind: 'whole', measure: row.trips },
    { label: annual ? 'Revenue miles per year' : 'Revenue miles', kind: 'miles', measure: row.revenueMiles },
    { label: annual ? 'Revenue hours per year' : 'Revenue hours', kind: 'hours', measure: row.revenueHours },
    { label: annual ? 'Platform hours per year' : 'Platform hours', kind: 'hours', measure: row.platformHours },
    { label: annual ? 'Peak vehicles (highest day)' : 'Peak vehicles', kind: 'whole', measure: row.peakVehicles, missing },
    { label: 'Cost per year', kind: 'money', measure: row.cost },
  ];
  return <div className="cmp-detail__grid">
    <table aria-label={`${row.name}, figures`}>
      <thead><tr><th scope="col" /><th scope="col">Baseline</th><th scope="col">Proposed</th><th scope="col">Change</th></tr></thead>
      <tbody>
        {figures.map((figure) => <tr key={figure.label}>
          <th scope="row">{figure.label}</th>
          <DetailCell kind={figure.kind} measure={figure.measure} side="baseline" missing={figure.missing} />
          <DetailCell kind={figure.kind} measure={figure.measure} side="proposed" missing={figure.missing} />
          <td><Delta kind={figure.kind} change={figure.measure.change} /></td>
        </tr>)}
        {(row.directions ?? []).map((direction) => {
          const change = spanChange(direction);
          const baseline = formatSpan(direction.span.baseline, (seconds) => formatClock(seconds));
          const proposed = formatSpan(direction.span.proposed, (seconds) => formatClock(seconds));
          const differ = baseline !== proposed;
          return <tr key={`span-${direction.key}`}>
            <th scope="row">Span, {direction.name}</th>
            <td>{differ ? <b className="cmp-differs">{baseline}</b> : baseline}</td>
            <td>{differ ? <b className="cmp-differs">{proposed}</b> : proposed}</td>
            <td><span className={toneClass(change.tone)}>{change.text}</span></td>
          </tr>;
        })}
      </tbody>
    </table>
    <div>
      {annual || !row.directions ? <p className="cmp-detail__note">Span and headways are shown for one day. Choose a day above to see them.</p> : row.directions.length === 0 ? <p className="cmp-detail__note">This route has no trips on this day.</p> : <>
        <div className="cmp-scroll"><table className="cmp-headways" aria-label={`${row.name}, headway by time of day`}>
          <thead><tr><th scope="col">Headway (min)</th>{headwayColumns.map((column) => <th scope="col" key={column.key}>{column.label}<small>{column.range}</small></th>)}</tr></thead>
          <tbody>{row.directions.map((direction) => <tr key={direction.key}>
            <th scope="row">{direction.name}</th>
            {direction.headways.map((cell) => {
              const result = headwayCell(cell.baseline, cell.proposed);
              return <td key={cell.period}>{result.changed ? <b className="cmp-differs">{result.text}</b> : result.text}</td>;
            })}
          </tr>)}</tbody>
        </table></div>
        <p className="cmp-detail__note">Average gap between departures at the first timepoint, rounded to the half minute. {MISSING} means fewer than two trips in the period.</p>
      </>}
    </div>
  </div>;
}
