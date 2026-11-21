import { describe, expect, it } from 'vitest';
import { USED_FEED_FILES } from './feedTables';
import { loadFeedTables, parseCsvText } from './testFeeds';

describe('fixture loader for the feed tables', () => {
  it('maps each file to its table, removes the byte-order mark and keeps quoted commas', () => {
    const tables = loadFeedTables('mini');
    expect(tables.stops[0]).toMatchObject({ stop_id: 'S1', stop_name: 'Main St & 1st Ave, Shared', location_type: '0' });
    expect(tables.routes[0].route_long_name).toBe('Main St, Crosstown');
    expect(tables.calendar.map((row) => row.service_id)).toEqual(['WKDY', 'SAT', 'SUN']);
    expect(tables.feedInfo).toEqual([]);
  });

  it('lists every text file of the feed, sorted', () => {
    const tables = loadFeedTables('mini');
    expect(tables.fileNames).toEqual([...tables.fileNames].sort());
    expect(tables.fileNames).toContain('stop_times.txt');
    expect(tables.fileNames.every((name) => USED_FEED_FILES.includes(name))).toBe(true);
  });

  it('reads CRLF, quoted line breaks and doubled quotes as one record each', () => {
    const rows = parseCsvText('a,b\r\n"x,""y""\r\nz",2\r\n,\r\n3,4');
    expect(rows).toEqual([
      { a: 'x,"y"\r\nz', b: '2' },
      { a: '3', b: '4' },
    ]);
  });
});
