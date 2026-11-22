// The export dialog's decisions (card E4): the starting draft, which holiday dates are allowed, the request, and the plain-words text.
import { describe, expect, it } from 'vitest';
import type { GtfsExportContext } from '../../application/gtfsExport/gtfsExportBuild';
import type { GtfsExportIssue } from '../../domain/gtfsExport/types';
import {
  draftProblem,
  exportedNoticeText,
  holidayProblem,
  initialDraft,
  problemRows,
  problemsCsv,
  requestOf,
  routesWithTrips,
  selectedRouteIds,
  warningGroups,
  weekdayLabel,
  willWriteText,
} from './gtfsExportModel';

const context: GtfsExportContext = {
  scenarioId: 's1',
  scenarioName: 'RTD Sep 2026',
  routes: [
    { id: 'r1', name: 'Route 31', shortName: '31', tripsByProfileId: { base: 12, alt: 0 } },
    { id: 'r2', name: 'Route 0', shortName: '0', tripsByProfileId: { base: 8, alt: 3 } },
    { id: 'r3', name: 'Empty', tripsByProfileId: { base: 0, alt: 0 } },
  ],
  tripProfiles: [{ id: 'base', name: 'Base' }, { id: 'alt', name: 'Alt' }],
  blockingScenarios: [{ id: 'bs-base', name: 'From feed', tripProfileId: 'base' }, { id: 'bs-alt', name: 'Alt blocks', tripProfileId: 'alt' }],
  serviceDays: [{ id: 'wkd', name: 'Weekday', kind: 'weekday' }, { id: 'hol', name: 'Holiday', kind: 'holiday' }],
};

describe('initialDraft', () => {
  it('starts blank with the working Trip profile and its Blocking scenario', () => {
    const draft = initialDraft(context, { tripProfileId: 'alt', blockingScenarioId: 'bs-alt' });
    expect(draft).toMatchObject({ routeMode: 'all', tripProfileId: 'alt', blockingScenarioId: 'bs-alt', startDate: '', endDate: '', agencyName: '', agencyUrl: '', agencyTimezone: '', mapLines: 'straight', holidays: [] });
  });

  it('falls back to the first Blocking scenario of the profile, and to none', () => {
    expect(initialDraft(context, { tripProfileId: 'base', blockingScenarioId: 'bs-alt' }).blockingScenarioId).toBe('bs-base');
    expect(initialDraft({ ...context, blockingScenarios: [] }, {}).blockingScenarioId).toBe('');
  });

  it('prefers the remembered settings over the import note', () => {
    const noted = { ...context, fromImportNote: { startDate: '2026-09-29', endDate: '2026-11-26', agencyName: 'RTD' } };
    expect(initialDraft(noted, {})).toMatchObject({ startDate: '2026-09-29', endDate: '2026-11-26', agencyName: 'RTD' });
    const saved = { ...noted, saved: { startDate: '2026-09-21', endDate: '2027-01-10', holidays: [{ date: '2026-12-25', serviceDayId: 'hol' }, { date: '2026-11-26', serviceDayId: 'hol' }], agencyName: 'Own', agencyUrl: 'https://x.org', agencyTimezone: 'America/Denver', mapLines: 'none' as const } };
    const draft = initialDraft(saved, {});
    expect(draft).toMatchObject({ startDate: '2026-09-21', endDate: '2027-01-10', agencyName: 'Own', agencyUrl: 'https://x.org', agencyTimezone: 'America/Denver', mapLines: 'none' });
    expect(draft.holidays.map((holiday) => holiday.date)).toEqual(['2026-11-26', '2026-12-25']);
  });
});

describe('Routes', () => {
  it('"All" means the Routes with trips on the Trip profile', () => {
    expect(routesWithTrips(context, 'base')).toEqual(['r1', 'r2']);
    expect(routesWithTrips(context, 'alt')).toEqual(['r2']);
  });

  it('a chosen list keeps Scenario order and may include a Route without trips (the builder lists it as skipped)', () => {
    const draft = { ...initialDraft(context, {}), routeMode: 'some' as const, chosenRouteIds: ['r3', 'r1'] };
    expect(selectedRouteIds(context, draft)).toEqual(['r1', 'r3']);
  });
});

describe('holidays', () => {
  const draft = { ...initialDraft(context, {}), startDate: '2026-09-21', endDate: '2027-01-10', holidays: [{ date: '2026-11-26', serviceDayId: 'hol' }] };

  it('allows a real date inside the range that is not listed', () => {
    expect(holidayProblem(draft, '2026-12-25')).toBeUndefined();
  });

  it('refuses a date outside the range, a repeat, a date that is not real, and any date before the range is set', () => {
    expect(holidayProblem(draft, '2027-02-01')).toMatch(/outside the range/);
    expect(holidayProblem(draft, '2026-11-26')).toMatch(/already listed/);
    expect(holidayProblem(draft, '2026-02-30')).toMatch(/real date/);
    expect(holidayProblem({ ...draft, startDate: '' }, '2026-12-25')).toMatch(/Set the start and end/);
  });

  it('leaves a holiday that fell outside a changed range out of the request and blocks the export', () => {
    const moved = { ...draft, endDate: '2026-10-31' };
    expect(requestOf(context, moved).settings.holidays).toEqual([]);
    expect(draftProblem(context, moved)).toMatch(/holiday date/);
    expect(draftProblem(context, draft)).toBeUndefined();
  });
});

describe('requestOf', () => {
  it('trims the agency fields, drops an empty Blocking scenario and lists the selected Routes', () => {
    const draft = { ...initialDraft(context, { tripProfileId: 'base' }), blockingScenarioId: '', startDate: '2026-09-21', endDate: '2027-01-10', agencyName: ' RTD ', agencyUrl: ' https://rtd.example ', agencyTimezone: 'America/Denver' };
    const request = requestOf(context, draft);
    expect(request.routeIds).toEqual(['r1', 'r2']);
    expect(request.blockingScenarioId).toBeUndefined();
    expect(request.settings).toMatchObject({ agencyName: 'RTD', agencyUrl: 'https://rtd.example', agencyTimezone: 'America/Denver' });
  });

  it('asks for at least one Route', () => {
    expect(draftProblem(context, initialDraft(context, { tripProfileId: 'alt' }))).toBeUndefined();
    expect(draftProblem({ ...context, routes: [] }, initialDraft(context, {}))).toMatch(/at least one Route/);
  });
});

describe('problems', () => {
  const refusals: GtfsExportIssue[] = [
    { code: 'gtfsExport.stopUnlocated', routeId: 'r1', routeName: 'Federal BRT', patternId: 'p1', patternName: 'Northbound', stopName: 'Evans' },
    { code: 'gtfsExport.stopIdConflict', routeId: 'r1', routeName: 'Federal BRT', patternId: 'p1', patternName: 'Northbound', stopName: 'Alameda', stopId: '1002', distanceMeters: 41.6 },
    { code: 'gtfsExport.agencyNameBlank' },
  ];

  it('gives one plain message per code, and the stop ID and distance for a conflict', () => {
    const rows = problemRows(refusals);
    expect(rows.map((row) => row.problem)).toEqual(['No location', 'Same stop ID at two places', 'Agency name is blank']);
    expect(rows[1].stop).toBe('Alameda (stop ID 1002, 42 m from the first)');
    expect(rows[0]).toMatchObject({ routeId: 'r1', patternId: 'p1' });
    expect(rows[2].routeId).toBeUndefined();
  });

  it('writes the list as CSV with every problem and a guard against formula text', () => {
    const csv = problemsCsv([...refusals, { code: 'gtfsExport.stopUnlocated', routeName: '=SUM(A1)', stopName: 'X' }]);
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('problem,route,pattern,stop_or_timepoint,detail');
    expect(lines).toHaveLength(5);
    expect(lines[4]).toContain("'=SUM(A1)");
  });
});

describe('text', () => {
  it('groups warnings by code with a count', () => {
    const groups = warningGroups([
      { code: 'gtfsExport.stopIdGenerated', routeName: 'R', stopName: 'A', stopId: 'R-1' },
      { code: 'gtfsExport.stopIdGenerated', routeName: 'R', stopName: 'B', stopId: 'R-2' },
      { code: 'gtfsExport.daySkipped', serviceDayName: 'Sunday' },
    ]);
    expect(groups.map((group) => group.text)).toEqual(['2 stops without an ID get generated IDs.', '1 service day has no trips and is left out of the calendar.']);
    expect(groups[0].details).toHaveLength(2);
  });

  it('words the notice and the ready line', () => {
    expect(exportedNoticeText(1330, 3)).toBe('Exported 1,330 trips on 3 Routes. Report downloaded.');
    expect(exportedNoticeText(1, 1)).toBe('Exported 1 trip on 1 Route. Report downloaded.');
    expect(willWriteText({ routes: 3, stops: 1104, trips: 1330, serviceDays: 3, blocks: 60 })).toBe('3 Routes · 1,104 stops · 1,330 trips · 3 service days · 60 blocks');
  });

  it('names the weekday of a date', () => {
    expect(weekdayLabel('2026-11-26')).toBe('Thu');
    expect(weekdayLabel('nope')).toBe('');
  });
});
