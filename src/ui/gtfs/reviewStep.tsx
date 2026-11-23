// Step 5 of the GTFS import dialog: what will be imported, the fidelity check, the patterns of one Route and the timepoint review (Decision
// 0089 items 26, 36 and 37; sub-plan I9 item 2). The step holds no rules: the view is built from the translation by buildReviewView, and the
// step draws it and reports the planner's clicks.

import type { GtfsTables } from '../../domain/gtfs/feedTables';
import type { ImportReport } from '../../domain/gtfs/reportFromFeed';
import type { FeedDayPlan } from '../../domain/gtfs/scenarioFromFeed';
import { MAX_REVIEW_TIMEPOINTS, minutesBetween, type ReviewStop, timepointReview } from '../../domain/gtfs/timepointReview';
import type { FeedTranslation, TranslatedRoute } from '../../domain/gtfs/translateFeed';
import { InlineNote } from '../shared/surfaces';
import {
  dayAbbreviation,
  differingTripCount,
  feedTripsOfPattern,
  hasOverride,
  originalKeysOf,
  patternRows,
  type PatternRowView,
  reportSummaryLine,
  reviewDayNames,
  routeNotes,
  skippedReason,
  stopIdsOfPatternKey,
  type TimepointOverrides,
  weekdayRunningHours,
} from './gtfsImportReviewModel';

export interface ReviewRouteRow {
  feedRouteId: string;
  label: string;
  patterns: number;
  timepoints: number;
  stops: number;
  /** Trips per service day, in the order of `dayNames`. */
  trips: number[];
  runningHours: number | undefined;
  blocks: number;
  notes: string;
  differing: number;
}

export interface ReviewStopView {
  position: number;
  name: string;
  stopId: string;
  /** "12 min" after the first stop, or "—". */
  time: string;
  /** Minutes since the previous timepoint, shown on a timepoint after the first. */
  sinceTimepoint: string;
  locked: boolean;
  timepoint: boolean;
}

export interface ReviewStepView {
  status: 'running' | 'error' | 'ready';
  error?: string;
  report?: ImportReport;
  dayNames: string[];
  routes: ReviewRouteRow[];
  skipped: Array<{ feedRouteId: string; label: string; reason: string }>;
  selectedRouteId?: string;
  patterns: PatternRowView[];
  selectedPatternId?: string;
  review?: { title: string; stops: ReviewStopView[]; timepointCount: number; otherStops: number; edited: boolean; atLimit: boolean };
  summaryLine: string;
}

export interface ReviewStepHandlers {
  onSelectRoute: (feedRouteId: string) => void;
  onSelectPattern: (patternId: string) => void;
  onToggleTimepoint: (position: number, on: boolean) => void;
  onRestoreTimepoints: () => void;
  onDownloadReport: () => void;
}

const routeLabel = (route: TranslatedRoute): string => {
  const short = route.route.shortName?.trim() ?? '';
  return short && short !== route.route.name ? `${short} ${route.route.name}` : route.route.name;
};

function minutesText(offsetSeconds: number | undefined): string {
  return offsetSeconds === undefined ? '—' : `${Math.round(offsetSeconds / 60)} min`;
}

export interface ReviewInputs {
  translation: FeedTranslation;
  baseline: FeedTranslation | undefined;
  tables: GtfsTables;
  plan: Pick<FeedDayPlan, 'days'>;
  /** Feed route_id → label, for a skipped Route. */
  feedRouteLabels: ReadonlyMap<string, string>;
  overrides: TimepointOverrides;
  selectedRouteId: string | undefined;
  selectedPatternLabel: string | undefined;
}

/** The selected Route and pattern, with the review rows of the pattern and the keys its timepoint edits are stored under. */
export interface PatternReview {
  feedRouteId: string;
  route: TranslatedRoute;
  pattern: PatternRowView;
  patterns: PatternRowView[];
  stops: ReviewStop[];
  /** The pattern keys from before any edit (sub-plan section 12a, item 3). */
  originalKeys: string[];
}

/** Resolves the planner's selection to a Route and pattern; an unknown or missing selection falls back to the first. The pattern is found by its label, because every run gives the patterns new IDs. */
export function patternReviewOf(input: Pick<ReviewInputs, 'translation' | 'baseline' | 'tables' | 'plan' | 'selectedRouteId' | 'selectedPatternLabel'>): PatternReview | undefined {
  const { translation, baseline, tables, plan } = input;
  const route = translation.routes.find((item) => (item.route.gtfsRouteId ?? item.route.id) === input.selectedRouteId) ?? translation.routes[0];
  if (!route) return undefined;
  const feedRouteId = route.route.gtfsRouteId ?? route.route.id;
  const patterns = patternRows(route);
  const pattern = patterns.find((row) => row.label === input.selectedPatternLabel) ?? patterns[0];
  if (!pattern) return undefined;
  const baselineRoute = baseline?.routes.find((item) => (item.route.gtfsRouteId ?? item.route.id) === feedRouteId);
  const stops = timepointReview(feedTripsOfPattern(tables, plan, feedRouteId, route, pattern.patternId), new Set(stopIdsOfPatternKey(pattern.key)));
  return { feedRouteId, route, pattern, patterns, stops, originalKeys: originalKeysOf(route, baselineRoute, pattern.patternId) };
}

/** Everything the Review step shows, from the translation, the feed and the planner's selection. */
export function buildReviewView(input: ReviewInputs): ReviewStepView {
  const { translation, tables, overrides } = input;
  const { report } = translation;
  const dayNames = reviewDayNames(report);
  const routes: ReviewRouteRow[] = translation.routes.map((route) => {
    const feedRouteId = route.route.gtfsRouteId ?? route.route.id;
    const summary = report.routes.find((item) => item.routeId === feedRouteId);
    return {
      feedRouteId,
      label: routeLabel(route),
      patterns: summary?.patterns ?? route.patterns.length,
      timepoints: summary?.timepoints ?? route.nodes.length,
      stops: summary?.stops ?? 0,
      trips: dayNames.map((name) => summary?.tripsByServiceDay[name] ?? 0),
      runningHours: weekdayRunningHours(report, feedRouteId),
      blocks: summary?.blocks ?? 0,
      notes: routeNotes(report, feedRouteId),
      differing: differingTripCount(report, feedRouteId),
    };
  });
  const skipped = translation.skippedRoutes.map((item) => ({ feedRouteId: item.routeId, label: input.feedRouteLabels.get(item.routeId) ?? item.routeId, reason: skippedReason(item.reason) }));

  const selection = patternReviewOf(input);
  const selectedFeedId = selection?.feedRouteId;
  const patterns = selection?.patterns ?? [];
  const pattern = selection?.pattern;

  let review: ReviewStepView['review'];
  if (selection && pattern) {
    const { stops } = selection;
    const nameOf = (stopId: string) => (tables.stops.find((row) => row.stop_id === stopId)?.stop_name ?? '').trim() || stopId;
    let previous: ReviewStop | undefined;
    const rows: ReviewStopView[] = stops.map((stop) => {
      const since = stop.timepoint && previous ? minutesBetween(previous.offsetSeconds, stop.offsetSeconds) : undefined;
      if (stop.timepoint) previous = stop;
      return { position: stop.position, name: nameOf(stop.stopId), stopId: stop.stopId, time: minutesText(stop.offsetSeconds), sinceTimepoint: since === undefined ? '' : `${since} min`, locked: stop.locked, timepoint: stop.timepoint };
    });
    const timepointCount = new Set(stops.filter((stop) => stop.timepoint).map((stop) => stop.stopId)).size;
    review = {
      title: pattern.label.replace(/^(Outbound|Inbound) · /, ''),
      stops: rows,
      timepointCount,
      otherStops: stops.length - stops.filter((stop) => stop.timepoint).length,
      edited: hasOverride(overrides, selection.feedRouteId, selection.originalKeys),
      atLimit: timepointCount >= MAX_REVIEW_TIMEPOINTS,
    };
  }

  return {
    status: 'ready',
    report,
    dayNames,
    routes,
    skipped,
    ...(selectedFeedId ? { selectedRouteId: selectedFeedId } : {}),
    patterns,
    ...(pattern ? { selectedPatternId: pattern.patternId } : {}),
    ...(review ? { review } : {}),
    summaryLine: reportSummaryLine(report),
  };
}

export function ReviewStep({ view, handlers }: { view: ReviewStepView; handlers: ReviewStepHandlers }) {
  if (view.status !== 'ready' || !view.report) {
    return <section aria-labelledby="gtfs-step-review" className="gtfs-step">
      <h3 id="gtfs-step-review" className="visually-hidden">Review</h3>
      {view.status === 'error'
        ? <p className="gtfs-refusal" role="alert">{view.error ?? 'The import could not be prepared.'}</p>
        : <p className="gtfs-note" role="status">Preparing the import…</p>}
    </section>;
  }
  const { report } = view;
  const differing = report.rows.filter((row) => row.section === 'fidelity').length;
  const selectedPattern = view.patterns.find((row) => row.patternId === view.selectedPatternId);
  return <section aria-labelledby="gtfs-step-review" className="gtfs-step">
    <h3 id="gtfs-step-review" className="visually-hidden">Review</h3>
    <div className="gtfs-review-head">
      <strong>{view.routes.length} {view.routes.length === 1 ? 'route' : 'routes'}</strong>
      {report.fidelityOk
        ? <span className="gtfs-chip gtfs-chip--ok">Matches the feed</span>
        : <span className="gtfs-chip gtfs-chip--warn">Differs</span>}
      <span className="gtfs-note">{report.fidelityOk ? 'trips and running hours on every day used' : `${differing} ${differing === 1 ? 'trip differs' : 'trips differ'} from the feed; they are listed in the report`}</span>
    </div>
    {report.sizeWarning && <InlineNote kind="warn">This import is large and may be slow.</InlineNote>}
    <div className="gtfs-table-scroll">
      <table className="gtfs-table">
        <caption className="visually-hidden">Routes to import. Choose a route to see its patterns.</caption>
        <thead><tr>
          <th scope="col">Route</th><th scope="col" className="gtfs-num">Patterns</th><th scope="col" className="gtfs-num">Timepoints</th><th scope="col" className="gtfs-num">Stops</th>
          <th scope="col" className="gtfs-num">Trips {view.dayNames.map(dayAbbreviation).join(' / ')}</th><th scope="col" className="gtfs-num">Running h Wkdy</th><th scope="col" className="gtfs-num">Blocks</th><th scope="col">Notes</th>
        </tr></thead>
        <tbody>
          {view.routes.map((route) => <tr key={route.feedRouteId} className={route.feedRouteId === view.selectedRouteId ? 'gtfs-selected' : undefined}>
            <th scope="row"><button type="button" className="gtfs-link" aria-pressed={route.feedRouteId === view.selectedRouteId} onClick={() => handlers.onSelectRoute(route.feedRouteId)}>{route.label}</button></th>
            <td className="gtfs-num">{route.patterns}</td><td className="gtfs-num">{route.timepoints}</td><td className="gtfs-num">{route.stops}</td>
            <td className="gtfs-num">{route.trips.map((count) => count === 0 ? '–' : count.toLocaleString('en-US')).join(' / ')}</td>
            <td className="gtfs-num">{route.runningHours === undefined ? '–' : route.runningHours.toFixed(1)}</td>
            <td className="gtfs-num">{route.blocks === 0 ? '–' : route.blocks}</td>
            <td className="gtfs-note">{[route.differing > 0 ? `${route.differing} ${route.differing === 1 ? 'trip differs' : 'trips differ'}` : '', route.notes].filter(Boolean).join('; ')}</td>
          </tr>)}
          {view.skipped.map((item) => <tr key={`skipped-${item.feedRouteId}`} className="gtfs-skipped">
            <th scope="row">{item.label}</th>
            <td colSpan={7}>Not imported: {item.reason}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {view.patterns.length > 0 && <section className="gtfs-panel" aria-label="Patterns of the selected route">
      <div className="gtfs-panel-head"><span>Patterns of {view.routes.find((route) => route.feedRouteId === view.selectedRouteId)?.label ?? 'the route'}</span><span className="gtfs-note">Trips on all days</span></div>
      <ul className="gtfs-pattern-list">
        {view.patterns.map((pattern) => <li key={pattern.patternId}>
          <button type="button" className="gtfs-link" aria-current={pattern.patternId === view.selectedPatternId ? 'true' : undefined} onClick={() => handlers.onSelectPattern(pattern.patternId)}>{pattern.label}</button>
          <span className="gtfs-num">{pattern.trips.toLocaleString('en-US')}</span>
        </li>)}
      </ul>
    </section>}

    {view.review && <details className="gtfs-section" open>
      <summary><span>Timepoints of "{view.review.title}"</span> <span className="gtfs-note">{view.review.timepointCount} timepoints, {view.review.otherStops} other stops</span></summary>
      <div className="gtfs-section-body">
        <div className="gtfs-toolbar">
          <span className="gtfs-note">Tick a stop to make it a timepoint. Terminals stay ticked. At most {MAX_REVIEW_TIMEPOINTS} per pattern.</span>
          {view.review.edited && <button type="button" onClick={handlers.onRestoreTimepoints}>Restore the feed's choice</button>}
        </div>
        <div className="gtfs-table-scroll gtfs-review-scroll">
          <table className="gtfs-table">
            <caption className="visually-hidden">Stops of {selectedPattern?.label ?? 'the pattern'} in order</caption>
            <thead><tr><th scope="col"><span className="visually-hidden">Timepoint</span></th><th scope="col">Stop</th><th scope="col" className="gtfs-num">Median time after start</th><th scope="col" className="gtfs-num">Since last timepoint</th></tr></thead>
            <tbody>
              {view.review.stops.map((stop) => <tr key={stop.position} className={stop.timepoint ? 'gtfs-timepoint-row' : undefined}>
                <td><input type="checkbox" checked={stop.timepoint} disabled={stop.locked || (!stop.timepoint && view.review?.atLimit)} aria-label={`${stop.name} is a timepoint`} onChange={(event) => handlers.onToggleTimepoint(stop.position, event.currentTarget.checked)} /></td>
                <th scope="row">{stop.name}{stop.locked ? ' (terminal)' : ''}</th>
                <td className="gtfs-num">{stop.time}</td>
                <td className="gtfs-num">{stop.sinceTimepoint}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </details>}

    <div className="gtfs-toolbar">
      <button type="button" onClick={handlers.onDownloadReport}>Download import report (CSV)</button>
      <span className="gtfs-note">{view.summaryLine}</span>
    </div>
  </section>;
}
