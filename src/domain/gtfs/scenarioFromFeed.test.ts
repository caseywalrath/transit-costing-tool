import { describe, expect, it } from 'vitest';
import { exportProjectJson, parseProjectBackup } from '../../persistence/backup';
import { loadFeedTables } from './testFeeds';
import { type ScenarioFromFeedOptions, planFeedDays, projectFromFeed, scenarioFromFeed } from './scenarioFromFeed';

const NOW = '2026-11-22T09:00:00.000Z';

function options(folder: string, extra: Partial<ScenarioFromFeedOptions> = {}): ScenarioFromFeedOptions {
  const tables = loadFeedTables(folder);
  return { tables, routeIds: tables.routes.map((row) => row.route_id), fileName: `${folder}.zip`, now: NOW, ...extra };
}

describe('projectFromFeed (level A)', () => {
  it.each(['mini', 'edge-no-direction', 'edge-loop-variants', 'edge-multi-route-blocks', 'cal-holiday-unique', 'cal-part-year'])(
    '%s: the backup it writes passes backup validation and its annual counts total 365',
    (folder) => {
      const snapshot = projectFromFeed(options(folder));
      const parsed = parseProjectBackup(exportProjectJson(snapshot));
      const total = parsed.serviceDays.reduce((sum, day) => sum + day.annualServiceDays, 0);
      expect(total).toBe(365);
    },
  );

  it('names a feed with no agency.txt after its file name without ".zip", in the Project and the publisher', () => {
    const snapshot = projectFromFeed(options('cal-holiday-unique', { fileName: 'Riverside-Feed.ZIP' }));
    expect(snapshot.project.name).toBe('Riverside-Feed (2026-01-05)');
    const note = snapshot.scenarios[0].importNotes?.[0];
    expect(note?.publisher).toBe('Riverside-Feed');
    expect(note?.fileName).toBe('Riverside-Feed.ZIP');
  });

  it('names a feed whose agency name is blank after its file name, too', () => {
    const tables = loadFeedTables('mini');
    const blank = { ...tables, agency: [{ agency_id: 'MINI', agency_name: '   ' }] };
    const { records } = scenarioFromFeed('project-1', 'Existing service', { ...options('mini'), tables: blank, fileName: 'mini-deflate.zip' });
    expect(records.scenario.importNotes?.[0].publisher).toBe('mini-deflate');
  });

  it('names the Project after the agency and the first date when the feed has no feed_info', () => {
    const snapshot = projectFromFeed(options('mini'));
    expect(snapshot.project.name).toBe('Mini Test Transit (2026-01-05)');
    expect(snapshot.scenarios.map((scenario) => scenario.name)).toEqual(['Existing service']);
  });
});

describe('scenarioFromFeed', () => {
  it('gives the mini Weekday 25 trips', () => {
    const { records } = scenarioFromFeed('project-1', 'Existing service', options('mini'));
    const weekdayId = records.serviceDays.find((day) => day.kind === 'weekday')?.id;
    expect(records.trips.filter((trip) => trip.serviceDayId === weekdayId)).toHaveLength(25);
  });

  it('imports blocks into a "From feed" Blocking Scenario with the three blocks of the multi-route feed', () => {
    const { records } = scenarioFromFeed(
      'project-1',
      'Existing service',
      options('edge-multi-route-blocks', { blocks: { import: true, pullOutMinutes: 10, pullInMinutes: 10 } }),
    );
    const fromFeed = records.blockingScenarios?.find((scenario) => scenario.name === 'From feed');
    expect(fromFeed).toBeDefined();
    expect(records.blocks).toHaveLength(3);
    expect(records.blocks.every((block) => block.blockingScenarioId === fromFeed?.id)).toBe(true);
  });

  it('keeps unique holiday dates with different trips as "Holiday 2" when keepExtraHolidayDays is on, and drops them when it is off', () => {
    const kept = scenarioFromFeed('project-1', 'Existing service', options('cal-holiday-unique')).records;
    expect(kept.serviceDays.map((day) => day.name)).toContain('Holiday 2');
    const holiday2 = kept.serviceDays.find((day) => day.name === 'Holiday 2');
    expect(holiday2?.annualServiceDays).toBe(13);

    const merged = scenarioFromFeed('project-1', 'Existing service', options('cal-holiday-unique', { keepExtraHolidayDays: false })).records;
    expect(merged.serviceDays.map((day) => day.name)).not.toContain('Holiday 2');
  });

  it('uses the planner annual count for a service day, and keeps the proposal beside it', () => {
    const result = scenarioFromFeed('project-1', 'Existing service', options('mini', { annualCountOverrides: { weekday: 200 } }));
    expect(result.records.serviceDays.find((day) => day.name === 'Weekday')?.annualServiceDays).toBe(200);
    expect(result.records.serviceDays.find((day) => day.name === 'Saturday')?.annualServiceDays).toBe(
      result.counts.countsByKey.saturday,
    );
    expect(result.counts.countsByKey.weekday).toBe(235);
  });

  it('gives a part-year Route the planner own date for a service day, in place of the suggested date', () => {
    const plan = planFeedDays(options('cal-part-year', { routeDates: { R2: { weekday: '20260707' } } }));
    expect(plan.days.find((day) => day.key === 'weekday')?.dateByRouteId).toEqual({ R2: '20260707' });
    const suggested = planFeedDays(options('cal-part-year'));
    expect(suggested.days.find((day) => day.key === 'weekday')?.dateByRouteId).toEqual({ R2: '20260716' });
  });

  it('gives a part-year Route its proposed own counts, switched off unless the planner lists it', () => {
    const off = scenarioFromFeed('project-1', 'Existing service', options('cal-part-year')).records;
    const route = off.routes.find((candidate) => candidate.gtfsRouteId === 'R2');
    expect(route?.ownAnnualServiceDays?.enabled).toBe(false);
    const nameOf = (id: string) => off.serviceDays.find((day) => day.id === id)?.name;
    const counts = Object.fromEntries(
      Object.entries(route?.ownAnnualServiceDays?.countsByServiceDayId ?? {}).map(([id, count]) => [nameOf(id), count]),
    );
    expect(counts).toEqual({ Weekday: 91, Saturday: 16, Sunday: 16, Holiday: 0 });

    const on = scenarioFromFeed('project-1', 'Existing service', options('cal-part-year', { routeOwnCountsOn: ['R2'] })).records;
    expect(on.routes.find((candidate) => candidate.gtfsRouteId === 'R2')?.ownAnnualServiceDays?.enabled).toBe(true);
  });

  it('counts a date the planner marks weekdayAsNormal under its own day of the week, never as a holiday', () => {
    // 2026-01-19 is a Monday holiday in cal-holiday-unique. Without it, the holiday is 2026-01-28 (2 trips) and "Holiday 2" stays on
    // 2026-01-26. Raw counts 18 weekday, 4 Saturday, 4 Sunday, 1 Holiday, 1 Holiday 2 of 28 scale by 365/28 to 235, 52, 52, 13, 13.
    const { records } = scenarioFromFeed(
      'project-1',
      'Existing service',
      options('cal-holiday-unique', { holidayClasses: { '20260119': 'weekdayAsNormal' } }),
    );
    const annual = Object.fromEntries(records.serviceDays.map((day) => [day.name, day.annualServiceDays]));
    expect(annual).toEqual({ Weekday: 235, Saturday: 52, Sunday: 52, Holiday: 13, 'Holiday 2': 13 });
  });

  it('refuses to switch on own counts for a Route that has none proposed', () => {
    expect(() =>
      scenarioFromFeed('project-1', 'Existing service', options('cal-holiday-unique', { routeOwnCountsOn: ['R1'] })),
    ).toThrow(/cannot be switched on/);
  });

  it('refuses a holiday class for a date that is not a candidate', () => {
    expect(() =>
      scenarioFromFeed('project-1', 'Existing service', options('cal-holiday-unique', { holidayClasses: { '20260105': 'saturday' } })),
    ).toThrow(/not a holiday candidate/);
  });
});
