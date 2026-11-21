import { describe, expect, it } from 'vitest';
import { feedSummary } from './summary';
import { loadFeedTables, tablesWith } from './testFeeds';

const mini = loadFeedTables('mini');

describe('feedSummary worked example (mini feed)', () => {
  // Hand-worked example: feedSummary(mini, '20260120', '20260112').
  const summary = feedSummary(mini, '20260120', '20260112');

  it('counts the routes, the non-station stops and the feed range', () => {
    expect(summary.routeCount).toBe(3);
    expect(summary.stopCount).toBe(6);
    expect(summary.range).toEqual({ start: '20260105', end: '20260201' });
  });

  it('lists every file of the mini feed as imported', () => {
    expect(summary.notImported).toEqual([]);
  });

  it('describes route B1 with its type, colour and trips on the count date', () => {
    expect(summary.routes.find((route) => route.routeId === 'B1')).toEqual({
      routeId: 'B1',
      shortName: 'B1',
      longName: 'Main St, Crosstown',
      type: 3,
      agencyId: 'MINI',
      color: '0055AA',
      tripCount: 5,
    });
    expect(summary.routes.map((route) => route.tripCount)).toEqual([5, 2, 18]);
  });

  it('flags a feed that ends within 30 days of today', () => {
    expect(summary.expiry).toBe('endsWithin30Days');
  });

  it('reads the agency and leaves the version and publisher out when feed_info.txt is absent', () => {
    expect(summary.agencies).toEqual([{ id: 'MINI', name: 'Mini Test Transit' }]);
    expect(summary.feedVersion).toBeUndefined();
    expect(summary.publisher).toBeUndefined();
  });
});

describe('feedSummary (other cases)', () => {
  it('counts zero trips for every route when no count date is given', () => {
    expect(feedSummary(mini, '20260120').routes.map((route) => route.tripCount)).toEqual([0, 0, 0]);
  });

  it('gives no notImported entry for the edge feed, whose files are all used', () => {
    const summary = feedSummary(loadFeedTables('edge-no-direction'), '20260105');
    expect(summary.notImported).toEqual([]);
    expect(summary.routes).toEqual([
      { routeId: 'N1', shortName: 'N1', longName: '', type: 3, agencyId: 'ND', tripCount: 0 },
    ]);
  });

  it('lists the files the import does not read, sorted', () => {
    const tables = tablesWith({ fileNames: ['stops.txt', 'transfers.txt', 'fare_attributes.txt', 'feed_info.txt'] });
    expect(feedSummary(tables, '20260105').notImported).toEqual(['fare_attributes.txt', 'transfers.txt']);
  });

  it('flags a feed by its end date: ok more than 30 days ahead, expired after the end', () => {
    expect(feedSummary(mini, '20260101').expiry).toBe('ok');
    expect(feedSummary(mini, '20260201').expiry).toBe('endsWithin30Days');
    expect(feedSummary(mini, '20260202').expiry).toBe('expired');
  });

  it('reads the feed version and publisher from feed_info.txt', () => {
    const tables = tablesWith({ feedInfo: [{ feed_publisher_name: 'Example Transit', feed_version: '2026.01' }] });
    const summary = feedSummary(tables, '20260105');
    expect(summary.feedVersion).toBe('2026.01');
    expect(summary.publisher).toBe('Example Transit');
  });

  it('counts stops whose location_type is blank or 0 and leaves out stations and entrances', () => {
    const stop = (location_type: string) => ({ stop_id: 'x', location_type });
    const tables = tablesWith({ stops: [stop(''), stop('0'), stop('1'), stop('2')] });
    expect(feedSummary(tables, '20260105').stopCount).toBe(2);
  });

  it('gives route type -1 when route_type is blank', () => {
    const tables = tablesWith({ routes: [{ route_id: 'X', route_type: '' }] });
    expect(feedSummary(tables, '20260105').routes[0].type).toBe(-1);
  });

  it('has no range and no expiry warning for a feed with no trips', () => {
    const summary = feedSummary(tablesWith({}), '20260105');
    expect(summary.range).toBeUndefined();
    expect(summary.expiry).toBe('ok');
    expect(summary.routeCount).toBe(0);
  });
});
