import { describe, expect, it } from 'vitest';
import type { ImportReport } from '../../domain/gtfs/reportFromFeed';
import { planFeedDays } from '../../domain/gtfs/scenarioFromFeed';
import { loadFeedTables } from '../../domain/gtfs/testFeeds';
import { type TranslateServiceDay, translateFeed } from '../../domain/gtfs/translateFeed';
import { NO_DAY_CHOICES } from './gtfsImportModel';
import {
  addedRoutesDetail,
  blocksActive,
  createsLine,
  defaultOptionChoices,
  feedFactsOf,
  feedPlanOptions,
  feedTripsOfPattern,
  hasOverride,
  importedNoticeText,
  importedTripCount,
  MINUTES_MESSAGE,
  optionsProblem,
  originalKeysOf,
  patternRows,
  reportSummaryLine,
  reviewDayNames,
  routeNotes,
  selectedBlockCount,
  stopIdsOfPatternKey,
  summarizeNotes,
  weekdayRunningHours,
  wholeMinutes,
  withOverride,
  withoutOverride,
} from './gtfsImportReviewModel';

const mini = loadFeedTables('mini');
const WEEKDAY: TranslateServiceDay = { key: 'weekday', serviceDayId: 'sd-weekday', name: 'Weekday', date: '20260120' };

describe('options (sub-plan I9, item 1)', () => {
  it('reads what the selected Routes say about the feed: flags, blocks and frequencies', () => {
    const facts = feedFactsOf(mini, ['B1', 'F1', 'R1']);
    expect(facts.marksTimepoints).toBe(true);
    expect(facts.blockCount).toBeGreaterThan(0);
    expect(facts.hasFrequencies).toBe(true);
    expect(selectedBlockCount(mini, ['B1'])).toBeLessThanOrEqual(facts.blockCount);
    const noFlags = feedFactsOf({ ...mini, stopTimes: mini.stopTimes.map((row) => ({ ...row, timepoint: '' })) }, ['B1']);
    expect(noFlags.marksTimepoints).toBe(false);
  });

  it('starts with the feed timepoints when the feed marks them, and the suggestion when it does not', () => {
    expect(defaultOptionChoices({ marksTimepoints: true, blockCount: 0, hasFrequencies: false }).timepointMode).toBe('feed');
    expect(defaultOptionChoices({ marksTimepoints: false, blockCount: 0, hasFrequencies: false }).timepointMode).toBe('suggested');
  });

  it('turns blocks on, with 10 minutes, only when the feed has blocks', () => {
    const withBlocks = defaultOptionChoices({ marksTimepoints: true, blockCount: 4, hasFrequencies: false });
    expect(withBlocks).toMatchObject({ importBlocks: true, pullOutMinutes: '10', pullInMinutes: '10' });
    expect(defaultOptionChoices({ marksTimepoints: true, blockCount: 0, hasFrequencies: false }).importBlocks).toBe(false);
  });

  it('accepts whole minutes of 0 or more and nothing else', () => {
    expect(wholeMinutes('0')).toBe(0);
    expect(wholeMinutes(' 12 ')).toBe(12);
    for (const text of ['', '-1', '1.5', 'ten', '1e2']) expect(wholeMinutes(text)).toBeUndefined();
  });

  it('requires the minutes when blocks are imported, and a Trip profile at level C', () => {
    const facts = { marksTimepoints: true, blockCount: 3, hasFrequencies: false };
    const choices = defaultOptionChoices(facts, { tripProfileId: 'tp', blockingScenarioId: 'bs' });
    expect(optionsProblem(choices, facts, 'A')).toBeUndefined();
    expect(optionsProblem({ ...choices, pullOutMinutes: '' }, facts, 'A')).toBe(MINUTES_MESSAGE);
    expect(optionsProblem({ ...choices, pullInMinutes: '2.5' }, facts, 'C')).toBe(MINUTES_MESSAGE);
    // With blocks off the minutes are not needed.
    expect(optionsProblem({ ...choices, importBlocks: false, pullOutMinutes: '' }, facts, 'A')).toBeUndefined();
    expect(optionsProblem({ ...choices, tripProfileId: '' }, facts, 'C')).toMatch('Trip profile');
  });

  it('imports blocks at level C only with a Blocking scenario chosen', () => {
    const facts = { marksTimepoints: true, blockCount: 3, hasFrequencies: false };
    const choices = defaultOptionChoices(facts, { tripProfileId: 'tp', blockingScenarioId: 'bs' });
    expect(blocksActive(choices, facts, 'C')).toBe(true);
    expect(blocksActive({ ...choices, blockingScenarioId: '' }, facts, 'C')).toBe(false);
    expect(blocksActive({ ...choices, blockingScenarioId: '' }, facts, 'A')).toBe(true);
    expect(blocksActive(choices, { ...facts, blockCount: 0 }, 'A')).toBe(false);
  });

  it('builds the service options from the Days choices, the Options choices and the timepoint edits', () => {
    const facts = { marksTimepoints: true, blockCount: 3, hasFrequencies: false };
    const choices = { ...defaultOptionChoices(facts), pullOutMinutes: '7', pullInMinutes: '5' };
    const options = feedPlanOptions({ ...NO_DAY_CHOICES, routeOwnCountsOn: ['R1'] }, choices, facts, 'A', { B1: { 'outbound:S1>S3': ['S1', 'S3'] } });
    expect(options).toMatchObject({
      routeOwnCountsOn: ['R1'],
      blocks: { import: true, pullOutMinutes: 7, pullInMinutes: 5 },
      timepointMode: 'feed',
      timepointOverrides: { B1: { 'outbound:S1>S3': ['S1', 'S3'] } },
    });
    const bare = feedPlanOptions(NO_DAY_CHOICES, { ...choices, importBlocks: false }, facts, 'A', {});
    expect(bare.blocks).toEqual({ import: false, pullOutMinutes: 0, pullInMinutes: 0 });
    expect(bare.timepointOverrides).toBeUndefined();
  });
});

describe('review rows from a translation', () => {
  const translation = translateFeed({ tables: mini, routeIds: ['B1', 'F1', 'R1'], scenarioId: 's', tripProfileId: 'tp', serviceDays: [WEEKDAY], blocks: { import: false }, now: '2026-11-22T00:00:00.000Z' });

  it('counts the imported trips and the weekday running hours, and lists the service days with trips', () => {
    expect(importedTripCount(translation.report)).toBe(translation.routes.reduce((sum, route) => sum + route.trips.length, 0));
    expect(reviewDayNames(translation.report)).toEqual(['Weekday']);
    const b1 = translation.report.routes.find((route) => route.routeId === 'B1')!;
    const hours = weekdayRunningHours(translation.report, 'B1');
    expect(hours).toBeGreaterThan(0);
    expect(b1.tripsByServiceDay.Weekday).toBeGreaterThan(0);
    expect(weekdayRunningHours(translation.report, 'NOPE')).toBeUndefined();
  });

  it('lists the patterns of a Route with their direction, name and trips', () => {
    const b1 = translation.routes.find((route) => route.route.gtfsRouteId === 'B1')!;
    const rows = patternRows(b1);
    expect(rows.map((row) => row.label.split(' · ')[0]).sort()).toEqual(['Inbound', 'Outbound']);
    expect(rows.reduce((sum, row) => sum + row.trips, 0)).toBe(b1.trips.length);
    expect(rows.every((row) => row.key.includes(':'))).toBe(true);
  });

  it('gives a pattern with no edit its own key as the original key, and finds the original keys through a baseline', () => {
    const b1 = translation.routes.find((route) => route.route.gtfsRouteId === 'B1')!;
    const outbound = patternRows(b1).find((row) => row.label.startsWith('Outbound'))!;
    expect(originalKeysOf(b1, undefined, outbound.patternId)).toEqual([outbound.key]);

    const edited = translateFeed({
      tables: mini, routeIds: ['B1'], scenarioId: 's', tripProfileId: 'tp', serviceDays: [WEEKDAY], blocks: { import: false }, now: '2026-11-22T00:00:00.000Z',
      timepointMode: 'suggested', timepointOverrides: { B1: { [outbound.key]: ['S1', 'S3'] } },
    }).routes[0];
    const editedOutbound = patternRows(edited).find((row) => row.label.startsWith('Outbound'))!;
    expect(editedOutbound.key).toBe('outbound:S1>S3');
    expect(originalKeysOf(edited, b1, editedOutbound.patternId)).toEqual([outbound.key]);
  });

  it('finds the feed trips of a pattern on the dates the days use', () => {
    const b1 = translation.routes.find((route) => route.route.gtfsRouteId === 'B1')!;
    const plan = planFeedDays({ tables: mini, routeIds: ['B1'] });
    const outbound = patternRows(b1).find((row) => row.label.startsWith('Outbound'))!;
    const trips = feedTripsOfPattern(mini, plan, 'B1', b1, outbound.patternId);
    expect(trips.length).toBeGreaterThan(0);
    expect(trips.every((trip) => trip.routeId === 'B1')).toBe(true);
  });

  it('describes the notes of a Route and of the whole report', () => {
    const report: ImportReport = {
      routes: [], fidelity: [], fidelityOk: true, sizeWarning: false,
      rows: [
        { section: 'route', routeId: '31', serviceDay: '', tripId: 't1', stopId: 's', code: 'dwellAtTimepoint', detail: '' },
        { section: 'route', routeId: '31', serviceDay: '', tripId: 't2', stopId: 's', code: 'dwellAtTimepoint', detail: '' },
        { section: 'block', routeId: '31', serviceDay: 'Weekday', tripId: '', stopId: '', code: 'leftOut', detail: '13: also serves route 4' },
        { section: 'file', routeId: '', serviceDay: '', tripId: '', stopId: '', code: 'notImported', detail: 'fare_rules.txt' },
      ],
    };
    expect(routeNotes(report, '31')).toBe('2 timepoints with dwell (departure kept); 1 block left out');
    expect(summarizeNotes(report.rows)[0]).toBe('2 timepoints with dwell (departure kept)');
    expect(reportSummaryLine(report)).toBe('4 notes: 2 timepoints with dwell (departure kept), 1 block left out, 1 file not imported.');
    expect(reportSummaryLine({ ...report, rows: [] })).toBe('The import report has no notes.');
  });

  it('says what Import creates at each level', () => {
    expect(createsLine('A', 3, 931, 60)).toBe('Creates 1 Project, 1 Scenario, 3 Routes, 931 trips, 60 blocks');
    expect(createsLine('B', 1, 1, 1)).toBe('Creates 1 Scenario, 1 Route, 1 trip, 1 block');
    expect(createsLine('C', 2, 10, 0)).toBe('Creates 2 Routes, 10 trips, 0 blocks');
  });
});

describe('timepoint edits', () => {
  it('reads the stop IDs from a pattern key', () => {
    expect(stopIdsOfPatternKey('outbound:A>B>C')).toEqual(['A', 'B', 'C']);
  });

  it('sets, tests and clears edits for every original key of a Route, without changing the input', () => {
    const none = {};
    const one = withOverride(none, 'B1', ['k1', 'k2'], ['S1', 'S3']);
    expect(none).toEqual({});
    expect(one).toEqual({ B1: { k1: ['S1', 'S3'], k2: ['S1', 'S3'] } });
    expect(hasOverride(one, 'B1', ['k2'])).toBe(true);
    expect(hasOverride(one, 'B1', ['k3'])).toBe(false);
    expect(withoutOverride(one, 'B1', ['k1'])).toEqual({ B1: { k2: ['S1', 'S3'] } });
    expect(withoutOverride(withoutOverride(one, 'B1', ['k1']), 'B1', ['k2'])).toEqual({});
  });
});

describe('after the import', () => {
  it('names the routes and the file', () => {
    expect(importedNoticeText(3, 'google_transit.zip')).toBe('3 routes imported from google_transit.zip');
    expect(importedNoticeText(1, 'a.zip')).toBe('1 route imported from a.zip');
  });

  it('puts the count differences first, then the days not imported, and says nothing when there is nothing', () => {
    expect(addedRoutesDetail({ countDifferences: [], notImported: [] })).toBeUndefined();
    const text = addedRoutesDetail({
      countDifferences: [{ serviceDay: 'Weekday', proposed: 250, scenario: 235 }],
      notImported: [{ serviceDay: 'Holiday 2', reason: 'customDay' }],
    })!;
    expect(text.indexOf('Weekday 250 against 235')).toBeGreaterThan(-1);
    expect(text.indexOf('Weekday 250')).toBeLessThan(text.indexOf('Holiday 2'));
  });
});
