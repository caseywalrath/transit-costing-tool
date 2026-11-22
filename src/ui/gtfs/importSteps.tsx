// The three steps of the GTFS import dialog that I8 builds (Decision 0089, sub-plan I8 items 2 to 4). Each step is drawn from the data the
// dialog computes; the steps hold no rules of their own, and every rule they show comes from gtfsImportModel.ts or the feed domain.

import type { ReactNode } from 'react';
import { InlineNote } from '../shared/surfaces';
import { displayDate, type FeedRouteRow, gtfsDateOfInput, type HolidayClassChoice, holidayClassLabel, inputDateOf, type OrdinaryDay, type RouteFilter, routeTypeName } from './gtfsImportModel';
import type { GtfsDate } from '../../domain/gtfs/time';

export type ImportLevel = 'A' | 'B' | 'C';

/** Step 1: the file, the feed's facts, the reading progress and any refusal. */
export interface FeedStepView {
  feed?: {
    agency: string;
    feedVersion: string | undefined;
    range: { start: GtfsDate; end: GtfsDate } | undefined;
    rangeDays: number | undefined;
    routeCount: number;
    stopCount: number;
    expiry: 'ok' | 'endsWithin30Days' | 'expired';
    fileName: string;
  } | undefined;
  reading: boolean;
  filesRead: string[];
  error: string | undefined;
  readSeconds: number | undefined;
}

export function FeedStep({ view, onChoose, onCancelReading }: { view: FeedStepView; onChoose: (file: File) => void; onCancelReading: () => void }) {
  const { feed } = view;
  return <section aria-labelledby="gtfs-step-feed" className="gtfs-step">
    <h3 id="gtfs-step-feed" className="visually-hidden">Feed</h3>
    <div className="gtfs-file-row">
      <label className="gtfs-file-button">
        <span>Choose ZIP file…</span>
        <input type="file" accept=".zip,application/zip" aria-label="Choose ZIP file" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onChoose(file); event.currentTarget.value = ''; }} />
      </label>
      <span>{feed?.fileName ?? 'No file chosen'}</span>
      <span className="gtfs-note">Download the feed from the agency's website or the Mobility Database. Web addresses cannot be opened directly.</span>
    </div>
    <div className="gtfs-two-panels">
      <section className="gtfs-panel" aria-label="Feed facts">
        <div className="gtfs-panel-head">Feed</div>
        {feed ? <dl className="gtfs-facts">
          <dt>Agency</dt><dd>{feed.agency}</dd>
          <dt>Feed version</dt><dd>{feed.feedVersion ?? 'Not given'}</dd>
          <dt>Service dates</dt><dd>{feed.range ? `${displayDate(feed.range.start)} to ${displayDate(feed.range.end)}${feed.rangeDays ? ` (${feed.rangeDays} days)` : ''}` : 'No service dates'}</dd>
          <dt>Routes</dt><dd>{feed.routeCount}</dd>
          <dt>Stops</dt><dd>{feed.stopCount.toLocaleString('en-US')}</dd>
        </dl> : <p className="gtfs-note">Choose a ZIP file to read its routes, service dates and stops.</p>}
      </section>
      <section className="gtfs-panel" aria-label="Reading progress">
        <div className="gtfs-panel-head">Reading <button type="button" onClick={onCancelReading} disabled={!view.reading}>Cancel</button></div>
        {view.filesRead.length > 0 && <ul className="gtfs-file-list">
          {view.filesRead.map((file) => <li key={file}><span>{file}</span><span>{view.reading && file === view.filesRead.at(-1) ? 'reading' : 'done'}</span></li>)}
        </ul>}
        <p className="gtfs-note">{view.reading ? 'Cancel stops reading; nothing is kept.' : view.readSeconds !== undefined ? `Feed read in ${view.readSeconds.toFixed(1)} s` : ''}</p>
      </section>
    </div>
    {feed?.expiry === 'expired' && feed.range && <InlineNote kind="warn">This feed ended on {displayDate(feed.range.end)}. Its service is no longer current; the import still works.</InlineNote>}
    {feed?.expiry === 'endsWithin30Days' && feed.range && <InlineNote kind="warn">This feed ends on {displayDate(feed.range.end)}, in 30 days or less. Dates after that cannot be chosen.</InlineNote>}
    {view.error && <p className="gtfs-refusal" role="alert">{view.error}</p>}
  </section>;
}

/** Step 2: the Routes table. The rows arrive in route order. */
export interface RoutesStepView {
  shown: FeedRouteRow[];
  typeChoices: string[];
  filter: RouteFilter;
  selected: ReadonlySet<string>;
  totals: { routes: number; weekdayTrips: number };
  large: boolean;
  weekdayDate?: GtfsDate;
  weekdayCounts: ReadonlyMap<string, number>;
  patterns: ReadonlyMap<string, number | undefined>;
  clashes: Array<{ shortName: string; name: string; asName: string }>;
  level: ImportLevel;
}

export function RoutesStep({ view, onFilter, onToggle, onSelectAllShown, onClear }: {
  view: RoutesStepView;
  onFilter: (filter: RouteFilter) => void;
  onToggle: (routeId: string, on: boolean) => void;
  onSelectAllShown: () => void;
  onClear: () => void;
}) {
  return <section aria-labelledby="gtfs-step-routes" className="gtfs-step">
    <h3 id="gtfs-step-routes" className="visually-hidden">Routes</h3>
    <div className="gtfs-toolbar">
      <label className="gtfs-field">Search<input value={view.filter.query} placeholder="Name or number" onChange={(event) => onFilter({ ...view.filter, query: event.currentTarget.value })} /></label>
      <label className="gtfs-field">Type<select value={view.filter.type ?? ''} onChange={(event) => onFilter({ ...view.filter, type: event.currentTarget.value === '' ? undefined : event.currentTarget.value })}>
        <option value="">All types</option>
        {view.typeChoices.map((type) => <option key={type} value={type}>{type}</option>)}
      </select></label>
      <button type="button" onClick={onSelectAllShown} disabled={view.shown.length === 0}>Select all shown</button>
      <button type="button" onClick={onClear} disabled={view.selected.size === 0}>Clear</button>
      <span className="gtfs-total" role="status">{view.totals.routes} routes selected · {view.totals.weekdayTrips.toLocaleString('en-US')} weekday trips{view.large ? ' · May be slow' : ''}</span>
    </div>
    <div className="gtfs-table-scroll">
      <table className="gtfs-table">
        <thead><tr><th scope="col"><span className="visually-hidden">Include</span></th><th scope="col">Short name</th><th scope="col">Long name</th><th scope="col">Type</th><th scope="col" className="gtfs-num">Weekday trips</th><th scope="col" className="gtfs-num">Patterns</th></tr></thead>
        <tbody>
          {view.shown.map((route) => {
            const on = view.selected.has(route.routeId);
            const count = view.weekdayCounts.get(route.routeId);
            const patterns = view.patterns.get(route.routeId);
            return <tr key={route.routeId} className={on ? 'gtfs-selected' : undefined}>
              <td><input type="checkbox" checked={on} aria-label={`Include route ${route.shortName}`} onChange={(event) => onToggle(route.routeId, event.currentTarget.checked)} /></td>
              <td><span className="gtfs-dot" aria-hidden="true" style={{ backgroundColor: route.color ? `#${route.color}` : undefined }} />{route.shortName}</td>
              <td>{route.longName}</td>
              <td>{routeTypeName(route.type)}</td>
              <td className="gtfs-num">{count === undefined ? '—' : count.toLocaleString('en-US')}</td>
              <td className="gtfs-num">{on && patterns !== undefined ? patterns : '—'}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <p className="gtfs-note">Weekday trips counted on {view.weekdayDate ? displayDate(view.weekdayDate) : 'no weekday date'}. Patterns show when the selected Routes have been read.</p>
    {view.clashes.length > 0 && <div className="gtfs-clash" role="note">
      {view.clashes.map((clash) => <p key={clash.shortName}>Route {clash.shortName} ({clash.name}) is already in this Scenario. It will be added as "{clash.asName}".</p>)}
    </div>}
  </section>;
}

/** One service day's row on the Days step. */
export interface DayRowView {
  key: string;
  name: string;
  date?: GtfsDate;
  /** Set for an ordinary day: the default date, to tell "typical" from "chosen". */
  defaultDate?: GtfsDate;
  ordinary: boolean;
  trips: number;
  datesInFeed: number;
  annualDays: number;
  basis: string;
}

export interface HolidayRowView {
  date: GtfsDate;
  feedDoes: string;
  routeCells: string[];
  classValue: HolidayClassChoice;
  scenarioClass: HolidayClassChoice;
}

export interface GroupRowView {
  dates: number;
  trips: number;
  differs: string;
  typical: boolean;
  inUse: boolean;
  useDate: GtfsDate;
  dateList: GtfsDate[];
}

export interface PartYearRowView {
  routeId: string;
  shortName: string;
  serviceDay: OrdinaryDay;
  ownDate: GtfsDate;
  suggestedDate?: GtfsDate;
  ownCount: number;
  on: boolean;
}

/** Step 3: everything the Days step shows. */
export interface DaysStepView {
  rows: DayRowView[];
  total: number;
  problem?: string;
  holidayCandidates: HolidayRowView[];
  holidayRouteHeaders: string[];
  holidaySummary: string;
  holidayDays: Array<{ name: string; date: GtfsDate; dates: number }>;
  keepExtraHolidayDays: boolean;
  groups: Array<{ day: OrdinaryDay; label: string; rows: GroupRowView[] }>;
  partYear: PartYearRowView[];
  rangeStart?: GtfsDate;
  rangeEnd?: GtfsDate;
  groupsOpen: boolean;
  holidaysOpen: boolean;
  partYearOpen: boolean;
}

export interface DaysStepHandlers {
  onDate: (key: string, date: GtfsDate | undefined) => void;
  onAnnual: (key: string, value: number) => void;
  onHolidayClass: (date: GtfsDate, value: HolidayClassChoice) => void;
  onKeepExtra: (keep: boolean) => void;
  onUseGroup: (day: OrdinaryDay, date: GtfsDate) => void;
  onOwnDate: (routeId: string, day: OrdinaryDay, date: GtfsDate) => void;
  onOwnOn: (routeId: string, on: boolean) => void;
}

const CLASS_CHOICES: HolidayClassChoice[] = ['saturday', 'sunday', 'reducedWeekday', 'unique', 'weekdayAsNormal'];

export function DaysStep({ view, handlers }: { view: DaysStepView; handlers: DaysStepHandlers }) {
  return <section aria-labelledby="gtfs-step-days" className="gtfs-step">
    <h3 id="gtfs-step-days" className="visually-hidden">Days</h3>
    <div className="gtfs-panel">
      <table className="gtfs-table">
        <thead><tr><th scope="col">Service day</th><th scope="col">Date used</th><th scope="col" className="gtfs-num">Trips</th><th scope="col" className="gtfs-num">Dates in feed</th><th scope="col" className="gtfs-num">Annual days</th><th scope="col">Basis</th></tr></thead>
        <tbody>
          {view.rows.map((row) => <tr key={row.key}>
            <th scope="row">{row.name}</th>
            <td>{row.ordinary ? <span className="gtfs-date-cell">
              <input type="date" aria-label={`${row.name} date used`} value={row.date ? inputDateOf(row.date) : ''} min={view.rangeStart && inputDateOf(view.rangeStart)} max={view.rangeEnd && inputDateOf(view.rangeEnd)} onChange={(event) => handlers.onDate(row.key, event.currentTarget.value ? gtfsDateOfInput(event.currentTarget.value) : undefined)} />
              {row.date && row.defaultDate && <span className="gtfs-chip">{row.date === row.defaultDate ? 'typical' : 'chosen'}</span>}
              {row.date && <span className="gtfs-note">{displayDate(row.date)}</span>}
            </span> : row.date ? displayDate(row.date) : <span className="gtfs-note">No unique holiday service</span>}</td>
            <td className="gtfs-num">{row.trips.toLocaleString('en-US')}</td>
            <td className="gtfs-num">{row.datesInFeed}</td>
            <td className="gtfs-num"><input type="number" min="0" step="1" aria-label={`${row.name} annual service days`} className="gtfs-number" value={Number.isNaN(row.annualDays) ? '' : row.annualDays} onChange={(event) => handlers.onAnnual(row.key, event.currentTarget.value === '' ? Number.NaN : Number(event.currentTarget.value))} /></td>
            <td className="gtfs-note">{row.basis}</td>
          </tr>)}
          <tr><td colSpan={4} className="gtfs-note">Total</td><td className="gtfs-num"><b className={view.problem ? 'gtfs-invalid' : undefined}>{Number.isFinite(view.total) ? view.total : '—'}</b> of 365</td><td /></tr>
        </tbody>
      </table>
    </div>
    {view.problem && <p className="gtfs-refusal" role="alert">{view.problem}</p>}

    <Section title="Holidays" summary={view.holidaySummary} open={view.holidaysOpen}>
      {view.holidayCandidates.length === 0 ? <p className="gtfs-note">This feed has no holiday exceptions.</p> : <>
        <table className="gtfs-table">
          <thead><tr><th scope="col">Date</th><th scope="col">What the feed does</th>{view.holidayRouteHeaders.map((name) => <th scope="col" key={name}>{name}</th>)}<th scope="col">Counts as</th></tr></thead>
          <tbody>
            {view.holidayCandidates.map((candidate) => <tr key={candidate.date}>
              <th scope="row">{displayDate(candidate.date)}</th>
              <td>{candidate.feedDoes}</td>
              {candidate.routeCells.map((cell, index) => <td key={index}>{cell}</td>)}
              <td><select aria-label={`Counts as for ${displayDate(candidate.date)}`} value={candidate.classValue} onChange={(event) => handlers.onHolidayClass(candidate.date, event.currentTarget.value as HolidayClassChoice)}>
                {CLASS_CHOICES.map((choice) => <option key={choice} value={choice}>{holidayClassLabel(choice)}</option>)}
              </select></td>
            </tr>)}
          </tbody>
        </table>
        <p className="gtfs-note">Holiday names are only labels. The feed's own trips decide the proposal. Dates for Holiday and Holiday 2:</p>
        <ul className="gtfs-list">
          {view.holidayDays.map((day) => <li key={day.name}>{day.name}: {displayDate(day.date)}{day.dates > 1 ? ` and ${day.dates - 1} more` : ''}</li>)}
          {view.holidayDays.length === 0 && <li>No unique holiday service.</li>}
        </ul>
        <label className="gtfs-switch"><input type="checkbox" checked={view.keepExtraHolidayDays} onChange={(event) => handlers.onKeepExtra(event.currentTarget.checked)} /> Keep different holidays as separate days</label>
      </>}
    </Section>

    <Section title="Day groups" summary={view.groups.some((group) => group.rows.length > 1) ? 'Some service days have more than one group' : 'no school, event or Friday-only service found'} open={view.groupsOpen}>
      {view.groups.map((group) => <div key={group.day} className="gtfs-group-block">
        <h4>{group.label}</h4>
        <table className="gtfs-table">
          <thead><tr><th scope="col" className="gtfs-num">Dates</th><th scope="col" className="gtfs-num">Trips</th><th scope="col">Differs from typical</th><th scope="col"><span className="visually-hidden">Action</span></th></tr></thead>
          <tbody>
            {group.rows.map((row, index) => <tr key={index}>
              <td className="gtfs-num">{row.dates}</td>
              <td className="gtfs-num">{row.trips.toLocaleString('en-US')}</td>
              <td className="gtfs-note">{row.typical ? 'typical' : row.differs}</td>
              <td>{row.inUse ? <span className="gtfs-chip">in use</span> : <button type="button" onClick={() => handlers.onUseGroup(group.day, row.useDate)}>Use this</button>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>)}
    </Section>

    <Section title="Part-year routes" summary={view.partYear.length === 0 ? 'none: every selected route runs on the dates used' : `${view.partYear.length} ${view.partYear.length === 1 ? 'route' : 'routes'}`} open={view.partYearOpen}>
      {view.partYear.length > 0 && <table className="gtfs-table">
        <thead><tr><th scope="col">Route</th><th scope="col">Service day</th><th scope="col">Own date</th><th scope="col">Own counts</th></tr></thead>
        <tbody>
          {view.partYear.map((row) => <tr key={`${row.routeId}-${row.serviceDay}`}>
            <th scope="row">{row.shortName}</th>
            <td>{dayLabel(row.serviceDay)}</td>
            <td><input type="date" aria-label={`Own date for route ${row.shortName}`} value={inputDateOf(row.ownDate)} min={view.rangeStart && inputDateOf(view.rangeStart)} max={view.rangeEnd && inputDateOf(view.rangeEnd)} onChange={(event) => event.currentTarget.value && handlers.onOwnDate(row.routeId, row.serviceDay, gtfsDateOfInput(event.currentTarget.value))} /></td>
            <td><label className="gtfs-switch"><input type="checkbox" checked={row.on} onChange={(event) => handlers.onOwnOn(row.routeId, event.currentTarget.checked)} /> Use own counts: {dayLabel(row.serviceDay)} {row.ownCount}</label></td>
          </tr>)}
        </tbody>
      </table>}
      <p className="gtfs-note">Off by default: the route uses the Scenario's counts until switched on.</p>
    </Section>
  </section>;
}

function dayLabel(day: OrdinaryDay): string {
  return day === 'weekday' ? 'Weekday' : day === 'saturday' ? 'Saturday' : 'Sunday';
}

/** A collapsible section. It is open when it has something to say, and the planner can open or close it. */
function Section({ title, summary, open, children }: { title: string; summary: string; open: boolean; children: ReactNode }) {
  return <details className="gtfs-section" open={open}>
    <summary><span>{title}</span> <span className="gtfs-note">{summary}</span></summary>
    <div className="gtfs-section-body">{children}</div>
  </details>;
}
