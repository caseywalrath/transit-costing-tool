// The GTFS export dialog (Decision 0090; card E4; approved mock-up docs/implementation/gtfs-export/mockup.html). One page with five sections:
// Routes and profile, When, Agency, Map lines and the live Checks. A refusal replaces the ready summary with the Problems table and turns
// Export off. The dialog holds the planner's choices; the rules and the building are in the application service.

import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import './gtfsExport.css';
import { ModalDialog } from '../ModalDialog';
import { download } from '../shared/download';
import { safeFileStem } from '../../application/gtfsExport/gtfsExportBuild';
import type { GtfsExportCheck, GtfsExportCommands, GtfsExportContext, GtfsExportDone, GtfsExportSession } from '../../application/gtfsExport/gtfsExportService';
import {
  defaultHolidayServiceDayId,
  draftProblem,
  type GtfsExportDraft,
  holidayProblem,
  holidayRowProblems,
  initialDraft,
  problemRows,
  problemsCsv,
  rangeIsValid,
  requestOf,
  routesWithTrips,
  selectedRouteIds,
  sortedHolidays,
  timeZoneChoices,
  warningGroups,
  weekdayLabel,
  willWriteText,
} from './gtfsExportModel';

export type { GtfsExportDraft };

/** The wait after the last change before the checks run: a whole feed takes seconds to build, so typing must settle first. */
const CHECK_SETTLE_MS = 400;
/** The Problems table shows this many rows; "Download list" has all of them. */
const PROBLEM_ROWS_SHOWN = 20;
const ROUTE_LIST_CAP = 400;

export interface GtfsExportDialogProps {
  scenarioId: string;
  service: GtfsExportCommands;
  /** The Trip profile and Blocking scenario the planner is working in; the dialog starts from them. */
  workingTripProfileId?: string;
  workingBlockingScenarioId?: string;
  /** Unsaved choices kept from an earlier "Open on Route tab" in this session. */
  draft?: GtfsExportDraft;
  onClose: () => void;
  /** Called after the export is written and the settings are saved. The application downloads the files and closes the dialog. */
  onExported: (done: GtfsExportDone) => void;
  /** "Open on Route tab": the application closes the dialog, keeps the draft in memory and opens the Route and pattern. */
  onOpenRoute: (routeId: string, patternId: string | undefined, draft: GtfsExportDraft) => void;
}

function errorMessageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function GtfsExportDialog(props: GtfsExportDialogProps) {
  const titleId = useId();
  const [session, setSession] = useState<GtfsExportSession>();
  const [openError, setOpenError] = useState<string>();
  const [draft, setDraft] = useState<GtfsExportDraft>();
  const [check, setCheck] = useState<GtfsExportCheck>();
  const [checking, setChecking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const [routeQuery, setRouteQuery] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [warningsOpen, setWarningsOpen] = useState<ReadonlySet<string>>(new Set());
  const checkSequence = useRef(0);

  // Read the Scenario once and hold the session; the checks use it without reading storage again.
  useEffect(() => {
    let live = true;
    let opened: GtfsExportSession | undefined;
    props.service.open(props.scenarioId).then(
      (next) => {
        if (!live) { next.close(); return; }
        opened = next;
        setSession(next);
        setDraft((current) => current ?? props.draft ?? initialDraft(next.context, { tripProfileId: props.workingTripProfileId, blockingScenarioId: props.workingBlockingScenarioId }));
      },
      (error: unknown) => { if (live) setOpenError(errorMessageOf(error, 'The Scenario could not be read.')); },
    );
    return () => { live = false; opened?.close(); };
    // The dialog opens once for its Scenario; later prop changes must not re-read it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.service, props.scenarioId]);

  const context: GtfsExportContext | undefined = session?.context;
  const request = useMemo(() => (context && draft ? requestOf(context, draft) : undefined), [context, draft]);
  const problem = context && draft ? draftProblem(context, draft) : undefined;
  const requestKey = useMemo(() => JSON.stringify(request ?? null), [request]);

  // Live checks, debounced. A newer edit makes an older answer stale; the engine also drops a check that a newer one replaced.
  const hasRoutes = (request?.routeIds.length ?? 0) > 0;
  useEffect(() => {
    if (!session || !request || !hasRoutes) { setChecking(false); setCheck(undefined); return undefined; }
    const sequence = checkSequence.current + 1;
    checkSequence.current = sequence;
    setChecking(true);
    let live = true;
    const timer = window.setTimeout(() => {
      session.check(request).then(
        (result) => {
          if (!live || checkSequence.current !== sequence || !result) return;
          setCheck(result);
          setChecking(false);
        },
        (error: unknown) => {
          if (!live || checkSequence.current !== sequence) return;
          setCheck({ ready: false, refusals: [], warnings: [], settingsProblem: errorMessageOf(error, 'The checks could not run.') });
          setChecking(false);
        },
      );
    }, CHECK_SETTLE_MS);
    return () => { live = false; window.clearTimeout(timer); };
    // `requestKey` stands for the request's content: a new object with the same content must not re-run the checks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, requestKey, hasRoutes]);

  // One frame for every state, so the dialog is one ModalDialog and keeps its focus while the Scenario is read.
  const frame = (children: ReactNode, busy = false) => <ModalDialog labelledBy={titleId} className="confirm-dialog gtfs-import-dialog gtfs-export-dialog" onClose={props.onClose} busy={busy}>{children}</ModalDialog>;
  if (openError) {
    return frame(<>
      <div className="gtfs-import-head"><h2 id={titleId}>Export as GTFS feed</h2></div>
      <div className="gtfs-import-body"><p className="gtfs-refusal" role="alert">{openError}</p></div>
      <div className="gtfs-import-foot"><span /><div className="gtfs-buttons"><button type="button" onClick={props.onClose}>Close</button></div></div>
    </>);
  }
  if (!context || !draft) {
    return frame(<>
      <div className="gtfs-import-head"><h2 id={titleId}>Export as GTFS feed</h2></div>
      <div className="gtfs-import-body"><p className="gtfs-note" role="status">Reading the Scenario…</p></div>
      <div className="gtfs-import-foot"><span /><div className="gtfs-buttons"><button type="button" onClick={props.onClose}>Cancel</button></div></div>
    </>);
  }

  const change = (next: Partial<GtfsExportDraft>) => setDraft((current) => (current ? { ...current, ...next } : current));
  const exportable = routesWithTrips(context, draft.tripProfileId);
  const blockingChoices = context.blockingScenarios.filter((item) => item.tripProfileId === draft.tripProfileId);
  const rowProblems = holidayRowProblems(draft);
  const refusals = check?.refusals ?? [];
  const rows = problemRows(refusals);
  const hasProblems = refusals.length > 0 || Boolean(check?.settingsProblem);
  const ready = Boolean(check?.ready) && !checking && !problem && !exporting;
  const zoneChoices = timeZoneChoices(draft.agencyTimezone || undefined);
  const stem = safeFileStem(context.scenarioName);
  const shownRoutes = context.routes.filter((route) => {
    const query = routeQuery.trim().toLowerCase();
    return !query || route.name.toLowerCase().includes(query) || (route.shortName ?? '').toLowerCase().includes(query);
  });
  const chosen = new Set(draft.chosenRouteIds);
  const addHolidayProblem = newHolidayDate ? holidayProblem(draft, newHolidayDate) : 'Pick a date.';
  const holidayServiceChoices = context.serviceDays;

  async function runExport() {
    if (!request || !ready) return;
    setExporting(true);
    setExportError(undefined);
    try {
      const outcome = await props.service.exportFeed(props.scenarioId, request);
      if (outcome.status === 'refused') { setCheck(outcome.check); return; }
      props.onExported(outcome.done);
    } catch (error) {
      setExportError(errorMessageOf(error, 'The export could not be written. Your data was not changed.'));
    } finally {
      setExporting(false);
    }
  }

  function toggleRoute(routeId: string, on: boolean) {
    change({ chosenRouteIds: on ? [...draft!.chosenRouteIds, routeId] : draft!.chosenRouteIds.filter((id) => id !== routeId) });
  }

  function addHoliday() {
    if (addHolidayProblem) return;
    change({ holidays: sortedHolidays([...draft!.holidays, { date: newHolidayDate, serviceDayId: defaultHolidayServiceDayId(context!) }]) });
    setNewHolidayDate('');
  }

  const statusText = exportError
    ?? (problem || hasProblems ? 'Export is unavailable until the problems are fixed.' : checking ? 'Checking…' : '');

  return frame(<>
    <div className="gtfs-import-head">
      <h2 id={titleId}>Export as GTFS feed</h2>
      <span className="gtfs-target">Scenario: {context.scenarioName} · {context.routes.length} {context.routes.length === 1 ? 'Route' : 'Routes'}</span>
    </div>
    <div className="gtfs-import-body">
      <div className="gtfs-toolbar">
        <label className="gtfs-field">Routes
          <select aria-label="Routes" value={draft.routeMode} onChange={(event) => change({ routeMode: event.currentTarget.value === 'some' ? 'some' : 'all' })}>
            <option value="all">All {exportable.length} {exportable.length === 1 ? 'Route' : 'Routes'}</option>
            <option value="some">Choose Routes…</option>
          </select>
        </label>
        <label className="gtfs-field">Trip profile
          <select value={draft.tripProfileId} onChange={(event) => {
            const tripProfileId = event.currentTarget.value;
            change({ tripProfileId, blockingScenarioId: context.blockingScenarios.find((item) => item.tripProfileId === tripProfileId)?.id ?? '' });
          }}>
            {context.tripProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
        <label className="gtfs-field">Blocking scenario
          <select value={draft.blockingScenarioId} onChange={(event) => change({ blockingScenarioId: event.currentTarget.value })}>
            {blockingChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            <option value="">None — no block ids</option>
          </select>
        </label>
      </div>

      {draft.routeMode === 'some' && <section className="gtfs-panel" aria-label="Choose Routes">
        <div className="gtfs-panel-head">
          <span>Choose Routes</span>
          <span className="gtfs-note">{selectedRouteIds(context, draft).length} selected</span>
        </div>
        <div className="ge-routes-tools">
          <label className="gtfs-field">Search Routes<input type="search" value={routeQuery} onChange={(event) => setRouteQuery(event.currentTarget.value)} /></label>
          <button type="button" className="gtfs-link" onClick={() => change({ chosenRouteIds: [...new Set([...draft.chosenRouteIds, ...shownRoutes.filter((route) => (route.tripsByProfileId[draft.tripProfileId] ?? 0) > 0).map((route) => route.id)])] })}>Select all shown</button>
          <button type="button" className="gtfs-link" onClick={() => change({ chosenRouteIds: [] })}>Clear</button>
        </div>
        <ul className="ge-route-list">
          {shownRoutes.slice(0, ROUTE_LIST_CAP).map((route) => {
            const trips = route.tripsByProfileId[draft.tripProfileId] ?? 0;
            return <li key={route.id}>
              <label><input type="checkbox" checked={chosen.has(route.id)} onChange={(event) => toggleRoute(route.id, event.currentTarget.checked)} /> <span>{route.shortName ? `${route.shortName} · ` : ''}{route.name}</span></label>
              <span className={trips === 0 ? 'gtfs-chip gtfs-chip--warn' : 'gtfs-note'}>{trips === 0 ? 'No trips in this profile' : `${trips.toLocaleString('en-US')} trips`}</span>
            </li>;
          })}
        </ul>
        {shownRoutes.length > ROUTE_LIST_CAP && <p className="gtfs-note">{shownRoutes.length - ROUTE_LIST_CAP} more: narrow the search.</p>}
      </section>}

      <section className="gtfs-panel" aria-label="When">
        <div className="gtfs-panel-head"><span>When</span><span className="gtfs-note">GTFS lists real dates.</span></div>
        <dl className="gtfs-facts ge-facts">
          <dt>Start date</dt>
          <dd><input type="date" aria-label="Start date" value={draft.startDate} onChange={(event) => change({ startDate: event.currentTarget.value })} />{draft.startDate === '' && <span className="gtfs-note"> Required</span>}</dd>
          <dt>End date</dt>
          <dd>
            <input type="date" aria-label="End date" value={draft.endDate} onChange={(event) => change({ endDate: event.currentTarget.value })} />
            {draft.startDate !== '' && draft.endDate !== '' && !rangeIsValid(draft) && <span className="gtfs-invalid"> The end date is before the start date.</span>}
          </dd>
          <dt>Holidays</dt>
          <dd>
            {draft.holidays.length > 0 && <table className="gtfs-table ge-holidays">
              <thead><tr><th>Date</th><th>Runs</th><th /></tr></thead>
              <tbody>
                {draft.holidays.map((holiday, index) => <tr key={holiday.date} className={rowProblems[index] ? 'gtfs-skipped' : undefined}>
                  <td>{holiday.date} {weekdayLabel(holiday.date)}{rowProblems[index] && <span className="gtfs-chip gtfs-chip--warn">{rowProblems[index]}</span>}</td>
                  <td><select aria-label={`Runs on ${holiday.date}`} value={holiday.serviceDayId} onChange={(event) => change({ holidays: draft.holidays.map((item, itemIndex) => (itemIndex === index ? { ...item, serviceDayId: event.currentTarget.value } : item)) })}>
                    {holidayServiceChoices.map((day) => <option key={day.id} value={day.id}>{day.name}</option>)}
                  </select></td>
                  <td><button type="button" className="gtfs-link" aria-label={`Remove holiday ${holiday.date}`} onClick={() => change({ holidays: draft.holidays.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></td>
                </tr>)}
              </tbody>
            </table>}
            <div className="ge-add-holiday">
              <input type="date" aria-label="Holiday date to add" value={newHolidayDate} onChange={(event) => setNewHolidayDate(event.currentTarget.value)} />
              <button type="button" disabled={addHolidayProblem !== undefined} onClick={addHoliday}>Add holiday</button>
              {newHolidayDate !== '' && addHolidayProblem && <span className="gtfs-note" role="status">{addHolidayProblem}</span>}
            </div>
          </dd>
        </dl>
      </section>

      <section className="gtfs-panel" aria-label="Agency">
        <div className="gtfs-panel-head"><span>Agency</span></div>
        <dl className="gtfs-facts ge-facts">
          <dt>Name</dt><dd><input aria-label="Agency name" className="ge-wide" value={draft.agencyName} onChange={(event) => change({ agencyName: event.currentTarget.value })} /></dd>
          <dt>Website</dt><dd><input aria-label="Agency website" className="ge-wide" inputMode="url" value={draft.agencyUrl} onChange={(event) => change({ agencyUrl: event.currentTarget.value })} /></dd>
          <dt>Time zone</dt><dd><select aria-label="Agency time zone" value={draft.agencyTimezone} onChange={(event) => change({ agencyTimezone: event.currentTarget.value })}>
            <option value="">Choose a time zone…</option>
            {zoneChoices.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select></dd>
        </dl>
      </section>

      <section className="gtfs-panel" aria-label="Map lines">
        <div className="gtfs-panel-head"><span>Map lines</span></div>
        <fieldset className="gtfs-radio-group ge-map-lines">
          <legend className="visually-hidden">Map lines</legend>
          <label className="gtfs-radio"><input type="radio" name="gtfs-export-map-lines" checked={draft.mapLines === 'straight'} onChange={() => change({ mapLines: 'straight' })} /><span>Straight lines between stops</span></label>
          <label className="gtfs-radio"><input type="radio" name="gtfs-export-map-lines" checked={draft.mapLines === 'none'} onChange={() => change({ mapLines: 'none' })} /><span>No map lines</span></label>
        </fieldset>
      </section>

      <section className="gtfs-panel" aria-label="Checks">
        <div className="gtfs-panel-head">
          <span>Checks</span>
          {problem ? <span className="gtfs-chip gtfs-chip--warn">Not ready</span>
            : checking || !check ? <span className="gtfs-chip">Checking…</span>
              : hasProblems ? <span className="gtfs-chip gtfs-chip--warn">{refusals.length > 0 ? `${refusals.length.toLocaleString('en-US')} ${refusals.length === 1 ? 'problem' : 'problems'}` : 'Problem'}</span>
                : <span className="gtfs-chip gtfs-chip--ok">Ready</span>}
        </div>
        {problem && <p className="gtfs-note ge-pad" role="status">{problem}</p>}
        {!problem && check?.settingsProblem && <p className="gtfs-refusal ge-pad" role="alert">{check.settingsProblem}</p>}
        {!problem && refusals.length > 0 && <>
          <p className="gtfs-note ge-pad">GTFS needs these to be right. Fix them, then the export can run.</p>
          <div className="gtfs-table-scroll ge-problem-scroll">
            <table className="gtfs-table" aria-label="Problems to fix first">
              <thead><tr><th>Problem</th><th>Route</th><th>Pattern</th><th>Stop or timepoint</th><th /></tr></thead>
              <tbody>
                {rows.slice(0, PROBLEM_ROWS_SHOWN).map((row) => <tr key={row.key}>
                  <td>{row.problem}</td><td>{row.routeName}</td><td>{row.patternName}</td><td>{row.stop}</td>
                  <td>{row.routeId && <button type="button" className="gtfs-link" onClick={() => props.onOpenRoute(row.routeId!, row.patternId, draft)}>Open on Route tab</button>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <p className="gtfs-note ge-pad">{rows.length > PROBLEM_ROWS_SHOWN ? `… ${(rows.length - PROBLEM_ROWS_SHOWN).toLocaleString('en-US')} more · ` : ''}<button type="button" className="gtfs-link" onClick={() => download(`${stem}-gtfs-problems.csv`, problemsCsv(refusals), 'text/csv;charset=utf-8')}>Download list</button></p>
        </>}
        {!problem && check?.ready && !checking && check.counts && <dl className="gtfs-facts ge-facts">
          <dt>Will write</dt><dd>{willWriteText(check.counts)}</dd>
        </dl>}
        {!problem && check && !checking && warningGroups(check.warnings).map((group) => <div key={group.code} className="ge-warning">
          <p><span className="gtfs-chip gtfs-chip--warn">{group.count}</span> {group.text} <button type="button" className="gtfs-link" aria-expanded={warningsOpen.has(group.code)} onClick={() => setWarningsOpen((current) => { const next = new Set(current); if (next.has(group.code)) next.delete(group.code); else next.add(group.code); return next; })}>{warningsOpen.has(group.code) ? 'Hide' : 'Show'}</button></p>
          {warningsOpen.has(group.code) && <ul className="gtfs-list">{group.details.slice(0, 200).map((detail, index) => <li key={index}>{detail}</li>)}{group.details.length > 200 && <li>… {group.details.length - 200} more in the report.</li>}</ul>}
        </div>)}
      </section>
    </div>
    <div className="gtfs-import-foot">
      <span className="gtfs-status" role="status">{statusText || <>Downloads <b>{stem}-gtfs.zip</b> and a report CSV.</>}</span>
      <div className="gtfs-buttons">
        <button type="button" disabled={exporting} onClick={props.onClose}>{hasProblems ? 'Close' : 'Cancel'}</button>
        <button type="button" className="primary" disabled={!ready} onClick={() => void runExport()}>{exporting ? 'Exporting…' : 'Export'}</button>
      </div>
    </div>
  </>, exporting);
}
