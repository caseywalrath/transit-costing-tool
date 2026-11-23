import { describe, expect, it } from 'vitest';
import { exceedsSizeWarning, type ImportReport, importReportCsv } from './reportFromFeed';

function reportWith(rows: ImportReport['rows']): ImportReport {
  return { routes: [], fidelity: [], rows, fidelityOk: true, sizeWarning: false };
}

describe('importReportCsv (Decision 0089 item 37)', () => {
  it('writes the header and then one row per finding, with CRLF line ends', () => {
    const csv = importReportCsv(
      reportWith([
        { section: 'trip', routeId: 'B1', serviceDay: 'Weekday', tripId: 'B1_W_BAD', stopId: '', code: 'blankFirstOrLastTime', detail: 'Left out' },
      ]),
    );
    expect(csv).toBe(
      'section,routeId,serviceDay,tripId,stopId,code,detail\r\ntrip,B1,Weekday,B1_W_BAD,,blankFirstOrLastTime,Left out\r\n',
    );
  });

  it('quotes a value that holds a comma, a quote or a line break, and doubles its quotes', () => {
    const csv = importReportCsv(
      reportWith([{ section: 'route', routeId: 'B1', serviceDay: '', tripId: '', stopId: '', code: 'nameClash', detail: 'Named "Main St, Crosstown (feed)"\nnow' }]),
    );
    // A line break inside a quoted value stays inside the quotes, so the record spans two physical lines.
    expect(csv).toBe('section,routeId,serviceDay,tripId,stopId,code,detail\r\nroute,B1,,,,nameClash,"Named ""Main St, Crosstown (feed)""\nnow"\r\n');
  });

  it('writes only the header when there are no findings', () => {
    expect(importReportCsv(reportWith([]))).toBe('section,routeId,serviceDay,tripId,stopId,code,detail\r\n');
  });
});

describe('exceedsSizeWarning (Decision 0089 item 44)', () => {
  it('warns above 40 Routes, and not at 40', () => {
    expect(exceedsSizeWarning(40, 0)).toBe(false);
    expect(exceedsSizeWarning(41, 0)).toBe(true);
  });

  it('warns above 5,000 trips on one service day, and not at 5,000', () => {
    expect(exceedsSizeWarning(1, 5000)).toBe(false);
    expect(exceedsSizeWarning(1, 5001)).toBe(true);
  });
});
