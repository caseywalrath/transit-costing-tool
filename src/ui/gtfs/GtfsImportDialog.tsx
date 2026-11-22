// The GTFS import dialog, steps 1 to 3 (Decision 0089; sub-plan I8). It holds the planner's choices, runs the feed reading through the
// worker client, and builds what each step shows. Steps 4 and 5 and the import itself are sub-plan I9.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ModalDialog } from '../ModalDialog';
import { createGtfsFeedJobClient, type GtfsFeedJobClient, type OverviewResult, type StopTimesResult } from '../../application/gtfs/gtfsWorkerClient';
import { type FeedSummary } from '../../domain/gtfs/summary';
import { type GtfsTables, type Row } from '../../domain/gtfs/feedTables';
import { defaultDates, type FeedRange, serviceDayGroups, type OrdinaryServiceDay } from '../../domain/gtfs/dayGroups';
import { feedServiceRange } from '../../domain/gtfs/calendar';
import { holidayCandidates, type HolidayCandidate } from '../../domain/gtfs/holidays';
import { proposeRouteOwnCounts } from '../../domain/gtfs/annualCounts';
import { tripsOnDate } from '../../domain/gtfs/tripsOnDate';
import type { GtfsDate } from '../../domain/gtfs/time';
import {
  annualDaysProblem,
  canContinueFromRoutes,
  type DayChoices,
  type FeedRouteRow,
  filterRouteRows,
  groupUseDate,
  holidayClassLabel,
  holidayClassOf,
  holidayRows,
  isLargeSelection,
  NO_DAY_CHOICES,
  type OrdinaryDay,
  patternCountOf,
  planForChoices,
  routeClassLabel,
  routeRowsInOrder,
  routeTypeChoices,
  type RouteFilter,
  selectAllShown,
  selectionTotals,
  tripCountsByRoute,
} from './gtfsImportModel';
import { DaysStep, type DaysStepView, FeedStep, type FeedStepView, type ImportLevel, RoutesStep, type RoutesStepView } from './importSteps';

export interface GtfsImportDialogProps {
  level: ImportLevel;
  /** Level B: the Project the new Scenario goes into. */
  projectName?: string;
  /** Level C: the Scenario the Routes go into. */
  scenarioName?: string;
  /** Level C: the names of the Routes already in the Scenario, for the clash line. */
  existingRouteNames?: readonly string[];
  onClose: () => void;
}

const STEP_NAMES = ['Feed', 'Routes', 'Days', 'Options', 'Review'] as const;
/** The wait after the last change to the selection before the stop times are read (sub-plan I8, item 1). */
const SELECTION_SETTLE_MS = 600;
const EMPTY_FILTER: RouteFilter = { query: '' };

function titleOf(props: GtfsImportDialogProps): { title: string; target: string } {
  if (props.level === 'A') return { title: 'New project from GTFS feed', target: 'Target: new Project' };
  if (props.level === 'B') return { title: 'New scenario from GTFS feed', target: `Target: new Scenario in ${props.projectName ?? 'this Project'}` };
  return { title: 'Add routes from GTFS feed', target: `Target: Scenario "${props.scenarioName ?? ''}"` };
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The file could not be read.';
}

const DAY_OF_KEY: Record<string, string> = { weekday: 'Weekday', saturday: 'Saturday', sunday: 'Sunday', holiday: 'Holiday' };
const ORDINARY: OrdinaryServiceDay[] = ['weekday', 'saturday', 'sunday'];

export function GtfsImportDialog(props: GtfsImportDialogProps) {
  const { title, target } = titleOf(props);
  const titleId = useId();
  const client = useMemo<GtfsFeedJobClient>(() => createGtfsFeedJobClient(), []);
  useEffect(() => () => client.dispose(), [client]);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState<string>();
  const [overview, setOverview] = useState<OverviewResult>();
  const [reading, setReading] = useState(false);
  const [filesRead, setFilesRead] = useState<string[]>([]);
  const [readError, setReadError] = useState<string>();
  const [readSeconds, setReadSeconds] = useState<number>();
  const bytesRef = useRef<Uint8Array | undefined>(undefined);
  const cancelledRef = useRef(false);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<RouteFilter>(EMPTY_FILTER);
  const [stopTimes, setStopTimes] = useState<{ key: string; rows: Row[] }>();
  const [stopsError, setStopsError] = useState<string>();
  const inFlightKey = useRef<string | undefined>(undefined);
  const [choices, setChoices] = useState<DayChoices>(NO_DAY_CHOICES);

  const tables = overview?.tables;
  const summary: FeedSummary | undefined = overview?.summary;
  const allRouteIds = useMemo(() => new Set(tables?.routes.map((row) => row.route_id) ?? []), [tables]);
  const routes = useMemo<FeedRouteRow[]>(() => (summary ? routeRowsInOrder(summary.routes) : []), [summary]);
  const feedWeekday = useMemo(() => (tables ? defaultDates(tables, allRouteIds).weekday : undefined), [tables, allRouteIds]);
  const weekdayCounts = useMemo(() => (tables && feedWeekday ? tripCountsByRoute(tables, feedWeekday) : new Map<string, number>()), [tables, feedWeekday]);

  const selectedIds = useMemo(() => routes.filter((route) => selected.has(route.routeId)).map((route) => route.routeId), [routes, selected]);
  const selectionKey = selectedIds.join('|');
  const totals = selectionTotals(selected, weekdayCounts);
  const large = isLargeSelection(totals);
  const shown = useMemo(() => filterRouteRows(routes, filter), [routes, filter]);

  // Stop times for the selected Routes: read once the selection settles on step 2 (it fills the Patterns column), and at once on step 3.
  // The effect reads `selectedIds` through `selectionKey`, which is the same list joined, so the key alone decides when a read is due.
  useEffect(() => {
    const ids = selectedIds;
    const bytes = bytesRef.current;
    if (!overview || !bytes || ids.length === 0 || stopTimes?.key === selectionKey) return undefined;
    const key = selectionKey;
    const readStops = () => {
      if (inFlightKey.current === key) return;
      inFlightKey.current = key;
      setStopsError(undefined);
      const finish = () => { if (inFlightKey.current === key) inFlightKey.current = undefined; };
      client.readStopTimes({ bytes, routeIds: ids }).then(
        (result: StopTimesResult) => { if (inFlightKey.current === key) setStopTimes({ key, rows: result.stopTimes }); finish(); },
        (error: unknown) => { if (inFlightKey.current === key) setStopsError(errorMessageOf(error)); finish(); },
      );
    };
    const timer = window.setTimeout(readStops, step === 2 ? SELECTION_SETTLE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [client, overview, selectedIds, selectionKey, step, stopTimes?.key]);

  // The tables the plan reads: the overview's tables with the stop times of the selected Routes.
  const stopsReady = stopTimes !== undefined && stopTimes.key === selectionKey;
  const planTables = useMemo<GtfsTables | undefined>(() => (tables && stopsReady ? { ...tables, stopTimes: stopTimes.rows as GtfsTables['stopTimes'] } : undefined), [tables, stopsReady, stopTimes]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const patterns = useMemo(() => {
    const result = new Map<string, number | undefined>();
    if (!planTables) return result;
    const weekday = defaultDates(planTables, selectedSet).weekday;
    if (!weekday) return result;
    for (const routeId of selectedIds) result.set(routeId, patternCountOf(planTables, routeId, weekday));
    return result;
  }, [planTables, selectedIds, selectedSet]);

  // The Days step's plan. It is built only on step 3, once the stop times of the selection are in.
  const planned = useMemo(() => {
    if (step !== 3 || !planTables || selectedIds.length === 0) return undefined;
    const range = feedServiceRange(planTables, selectedSet);
    const candidates = holidayRows(planTables, selectedSet, choices);
    try {
      return { plan: planForChoices(planTables, selectedIds, choices), range, candidates, error: undefined };
    } catch (error) {
      return { plan: undefined, range, candidates, error: errorMessageOf(error) };
    }
  }, [step, planTables, selectedIds, selectedSet, choices]);
  const planError = planned?.error;
  const plan = planned?.plan;
  const range: FeedRange | undefined = planned?.range;
  const candidates: HolidayCandidate[] = planned?.candidates ?? [];
  const candidateDates = useMemo(() => new Set(candidates.map((candidate) => candidate.date)), [candidates]);

  async function chooseFile(file: File) {
    cancelledRef.current = false;
    setReadError(undefined);
    setReading(true);
    setFilesRead([]);
    setOverview(undefined);
    setStopTimes(undefined);
    setSelected(new Set());
    setChoices(NO_DAY_CHOICES);
    setFileName(file.name);
    const started = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      bytesRef.current = bytes;
      const result = await client.readOverview({ bytes, now: new Date().toISOString() }, (name) => setFilesRead((names) => [...names, name]));
      if (cancelledRef.current) return;
      setOverview(result);
      setReadSeconds((performance.now() - started) / 1000);
    } catch (error) {
      if (!cancelledRef.current) setReadError(errorMessageOf(error));
    } finally {
      setReading(false);
    }
  }

  function cancelReading() {
    cancelledRef.current = true;
    client.dispose();
    setReading(false);
    setFileName(undefined);
    setFilesRead([]);
  }

  // Step 1 view.
  const feedView: FeedStepView = {
    reading,
    filesRead,
    readSeconds,
    error: readError,
    feed: summary
      ? {
        agency: summary.agencies[0]?.name || fileName || 'Unnamed agency',
        feedVersion: summary.feedVersion,
        range: summary.range,
        rangeDays: summary.range ? daysInclusive(summary.range.start, summary.range.end) : undefined,
        routeCount: summary.routeCount,
        stopCount: summary.stopCount,
        expiry: summary.expiry,
        fileName: fileName ?? '',
      }
      : undefined,
  };

  const clashes = props.level === 'C'
    ? routes.filter((route) => selected.has(route.routeId)).flatMap((route) => {
      const name = route.longName.trim() || route.shortName;
      const clash = (props.existingRouteNames ?? []).some((existing) => existing.trim().toLowerCase() === name.toLowerCase());
      return clash ? [{ shortName: route.shortName, name, asName: `${name} (feed)` }] : [];
    })
    : [];

  const routesView: RoutesStepView = {
    shown,
    typeChoices: routeTypeChoices(routes),
    filter,
    selected,
    totals,
    large,
    ...(feedWeekday ? { weekdayDate: feedWeekday } : {}),
    weekdayCounts,
    patterns,
    clashes,
    level: props.level,
  };

  // Step 3 view.
  const daysView = plan && planTables && range && !planError ? buildDaysView({ plan, planTables, choices, selectedIds, selectedSet, range, candidates, candidateDates, routes }) : undefined;
  const problem = daysView?.problem;

  const canGoToRoutes = step === 1 && overview !== undefined && !reading;
  const canGoToDays = step === 2 && canContinueFromRoutes(selected);

  return <ModalDialog labelledBy={titleId} className="confirm-dialog gtfs-import-dialog" onClose={props.onClose}>
    <div className="gtfs-import-head">
      <h2 id={titleId}>{title}</h2>
      <span className="gtfs-target">{target}</span>
    </div>
    <ol className="gtfs-steps" aria-label="Import steps">
      {STEP_NAMES.map((name, index) => {
        const number = index + 1;
        const current = number === step && number <= 3;
        return <li key={name} aria-current={current ? 'step' : undefined} className={current ? 'gtfs-step-on' : number < step ? 'gtfs-step-done' : undefined}>
          {number} {name}{number < step ? ' ✓' : ''}
        </li>;
      })}
    </ol>
    <div className="gtfs-import-body">
      {step === 1 && <FeedStep view={feedView} onChoose={(file) => void chooseFile(file)} onCancelReading={cancelReading} />}
      {step === 2 && <RoutesStep view={routesView} onFilter={setFilter} onToggle={(routeId, on) => setSelected((current) => {
        const next = new Set(current);
        if (on) next.add(routeId); else next.delete(routeId);
        return next;
      })} onSelectAllShown={() => setSelected((current) => selectAllShown(current, shown))} onClear={() => setSelected(new Set())} />}
      {step === 3 && (daysView && planTables
        ? <DaysStep view={daysView} handlers={{
          onDate: (key, date) => setChoices((current) => ({ ...current, dates: { ...current.dates, ...(isOrdinary(key) ? { [key]: date } : {}) } })),
          onAnnual: (key, value) => setChoices((current) => ({ ...current, annualCountOverrides: { ...current.annualCountOverrides, [key]: value } })),
          onHolidayClass: (date, value) => setChoices((current) => ({ ...current, holidayClasses: { ...current.holidayClasses, [date]: value } })),
          onKeepExtra: (keep) => setChoices((current) => ({ ...current, keepExtraHolidayDays: keep })),
          onUseGroup: (day, date) => setChoices((current) => ({ ...current, dates: { ...current.dates, [day]: date } })),
          onOwnDate: (routeId, day, date) => setChoices((current) => ({ ...current, routeDates: { ...current.routeDates, [routeId]: { ...current.routeDates[routeId], [day]: date } } })),
          onOwnOn: (routeId, on) => setChoices((current) => ({ ...current, routeOwnCountsOn: on ? [...current.routeOwnCountsOn, routeId] : current.routeOwnCountsOn.filter((id) => id !== routeId) })),
        }} />
        : <p className="gtfs-note" role="status">{planError ?? (stopsError ? `The stop times could not be read: ${stopsError}` : 'Reading the stop times of the selected Routes…')}</p>)}
    </div>
    <div className="gtfs-import-foot">
      <span className="gtfs-status" role="status">
        {step === 1 && (reading ? 'Reading the feed…' : overview ? 'Feed read.' : '')}
        {step === 2 && `${totals.routes} routes selected`}
        {step === 3 && (problem ?? (daysView ? `Counts total ${daysView.total}` : ''))}
      </span>
      <div className="gtfs-buttons">
        {step > 1 && <button type="button" onClick={() => setStep((current) => (current === 3 ? 2 : 1))}>Back</button>}
        <button type="button" onClick={props.onClose}>Cancel</button>
        {step === 1 && <button type="button" className="primary" disabled={!canGoToRoutes} onClick={() => setStep(2)}>Next</button>}
        {step === 2 && <button type="button" className="primary" disabled={!canGoToDays} onClick={() => setStep(3)}>Next</button>}
        {step === 3 && <button type="button" className="primary" disabled aria-describedby={`${titleId}-next`}>Next</button>}
      </div>
    </div>
    {step === 3 && <p id={`${titleId}-next`} className="gtfs-note gtfs-next-note">Options and Review come next.</p>}
  </ModalDialog>;
}

function isOrdinary(key: string): key is OrdinaryDay {
  return key === 'weekday' || key === 'saturday' || key === 'sunday';
}

/** Days from the start to the end of a feed range, both included. */
function daysInclusive(start: GtfsDate, end: GtfsDate): number {
  const ms = Date.UTC(Number(end.slice(0, 4)), Number(end.slice(4, 6)) - 1, Number(end.slice(6, 8))) - Date.UTC(Number(start.slice(0, 4)), Number(start.slice(4, 6)) - 1, Number(start.slice(6, 8)));
  return Math.round(ms / 86_400_000) + 1;
}

interface DaysInputs {
  plan: ReturnType<typeof planForChoices>;
  planTables: GtfsTables;
  choices: DayChoices;
  selectedIds: string[];
  selectedSet: ReadonlySet<string>;
  range: FeedRange;
  candidates: HolidayCandidate[];
  candidateDates: ReadonlySet<GtfsDate>;
  routes: FeedRouteRow[];
}

/** Everything the Days step shows, from the plan and the choices. */
function buildDaysView(input: DaysInputs): DaysStepView {
  const { plan, planTables, choices, selectedIds, selectedSet, range, candidates, candidateDates, routes } = input;
  const dateOfKey = (key: string): GtfsDate | undefined => plan.days.find((day) => day.key === key)?.date;
  const tripsOn = (date: GtfsDate | undefined): number => {
    if (!date) return 0;
    let total = 0;
    for (const trips of tripsOnDate(planTables, date, selectedSet).byRoute.values()) total += trips.length;
    return total;
  };
  const keyOrder = (key: string): number => (key === 'weekday' ? 0 : key === 'saturday' ? 1 : key === 'sunday' ? 2 : key === 'holiday' ? 3 : 4);
  const keys = Object.keys(plan.counts.countsByKey).sort((a, b) => keyOrder(a) - keyOrder(b) || a.localeCompare(b));
  const defaults = defaultDates(planTables, selectedSet);
  const rangeDates = plan.counts.rangeDates;
  const rows = keys.map((key) => {
    const proposed = plan.counts.countsByKey[key] ?? 0;
    const override = choices.annualCountOverrides[key];
    const annualDays = override ?? proposed;
    const date = dateOfKey(key);
    const datesInFeed = plan.counts.datesByKey[key] ?? 0;
    const name = DAY_OF_KEY[key] ?? plan.holidayDays.find((day) => day.key === key)?.name ?? key;
    return {
      key,
      name,
      ...(date ? { date } : {}),
      ...(isOrdinary(key) && defaults[key] ? { defaultDate: defaults[key] } : {}),
      ordinary: isOrdinary(key),
      trips: tripsOn(date),
      datesInFeed,
      annualDays,
      basis: datesInFeed === 0 ? 'No dates in feed' : `${datesInFeed} of ${rangeDates} days${plan.counts.scaled ? ', scaled to 365' : ''}`,
    };
  });
  const problemText = annualDaysProblem(rows.map((row) => row.annualDays));
  const total = rows.reduce((sum, row) => sum + (Number.isFinite(row.annualDays) ? row.annualDays : 0), 0);

  const holidayCandidates = candidates.map((candidate) => {
    const removed = candidate.removedServiceIds;
    const added = candidate.addedServiceIds;
    const parts = [removed.length ? `Removes ${removed.join(', ')}` : '', added.length ? `adds ${added.join(', ')}` : ''].filter(Boolean);
    const feedDoes = parts.length ? parts.join('; ') : 'Trips differ';
    return {
      date: candidate.date,
      feedDoes: feedDoes.charAt(0).toUpperCase() + feedDoes.slice(1),
      routeCells: selectedIds.map((routeId) => routeClassLabel(candidate.byRoute[routeId] ?? 'none')),
      classValue: holidayClassOf(candidate, choices),
      scenarioClass: candidate.scenarioClass,
    };
  });
  const classes = new Set(holidayCandidates.map((row) => row.classValue));
  const holidaySummary = holidayCandidates.length === 0
    ? 'no holiday exceptions'
    : `${holidayCandidates.length} ${holidayCandidates.length === 1 ? 'date' : 'dates'} · ${classes.size === 1 ? `all ${holidayClassLabel([...classes][0])} service` : 'mixed'}`;

  const groups = ORDINARY.map((day) => {
    const found = serviceDayGroups(planTables, selectedSet, day, candidateDates);
    const used = dateOfKey(day);
    return {
      day,
      label: DAY_OF_KEY[day],
      rows: found.map((group) => {
        const parts = [
          group.addedServiceIds.length ? `adds ${group.addedServiceIds.join(', ')}` : '',
          group.removedServiceIds.length ? `removes ${group.removedServiceIds.join(', ')}` : '',
          `${group.tripDelta >= 0 ? '+' : ''}${group.tripDelta} trips`,
        ].filter(Boolean);
        return {
          dates: group.dates.length,
          trips: group.tripCount,
          differs: parts.join('; '),
          typical: group.addedServiceIds.length === 0 && group.removedServiceIds.length === 0 && group.tripDelta === 0,
          inUse: used !== undefined && group.dates.includes(used),
          useDate: groupUseDate(planTables, range, group.dates),
          dateList: group.dates,
        };
      }),
    };
  }).filter((group) => group.rows.length > 0);

  const partYear = plan.partYear.flatMap((flag) => {
    const ownDate = choices.routeDates[flag.routeId]?.[flag.serviceDay] ?? flag.suggestedDate;
    if (!ownDate) return [];
    const route = routes.find((candidate) => candidate.routeId === flag.routeId);
    const ownCounts = proposeRouteOwnCounts(planTables, flag.routeId, plan.classOfDate, rangeDates);
    return [{
      routeId: flag.routeId,
      shortName: route?.shortName ?? flag.routeId,
      serviceDay: flag.serviceDay,
      ownDate,
      ...(flag.suggestedDate ? { suggestedDate: flag.suggestedDate } : {}),
      ownCount: ownCounts[flag.serviceDay] ?? 0,
      on: choices.routeOwnCountsOn.includes(flag.routeId),
    }];
  });

  return {
    rows,
    total,
    ...(problemText ? { problem: problemText } : {}),
    holidayCandidates,
    holidayRouteHeaders: selectedIds.map((routeId) => `Route ${routes.find((route) => route.routeId === routeId)?.shortName ?? routeId}`),
    holidaySummary,
    holidayDays: plan.holidayDays.map((day) => ({ name: day.name, date: day.date, dates: day.dates.length })),
    keepExtraHolidayDays: choices.keepExtraHolidayDays,
    groups,
    partYear,
    rangeStart: range.start,
    rangeEnd: range.end,
    groupsOpen: groups.some((group) => group.rows.length > 1),
    holidaysOpen: candidates.length > 0,
    partYearOpen: partYear.length > 0,
  };
}

/**
 * Mounts the dialog into a container. The import dialog is opened from the menus in sub-plan I9; until then the browser tests mount it
 * this way. Returns a function that unmounts it.
 */
export function mountGtfsImportDialog(container: HTMLElement, props: GtfsImportDialogProps): () => void {
  const root = createRoot(container);
  root.render(<GtfsImportDialog {...props} />);
  return () => root.unmount();
}
