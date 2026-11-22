import { describe, expect, it } from 'vitest';
import { reportCsvText } from './report';
import type { ExportReportRow, GtfsExportIssue } from './types';

describe('reportCsvText (Decision 0090 item 21)', () => {
  const rows: ExportReportRow[] = [
    { kind: 'serviceDay', routeId: 'T1', routeName: 'Test Line', serviceId: 'WKD', serviceDayName: 'Weekday', trips: 3, runningHours: 1.25, datesInRange: 19, scenarioAnnualServiceDays: 260 },
    { kind: 'pattern', routeId: 'T1', routeName: 'Test Line', patternName: 'Alpha to Charlie', directionId: 0, shapeId: 'T1-A-C' },
    { kind: 'note', text: 'Map lines: straight lines.' },
  ];

  it('writes a header, then the rows of each kind, LF-ended, with running hours to two decimals', () => {
    const text = reportCsvText(rows, []);
    const lines = text.split('\n');

    expect(lines[0]).toBe('kind,route_id,route_name,service_id,service_day,trips,running_hours,dates_in_range,scenario_annual_days,direction_id,shape_id,code,detail');
    expect(lines[1]).toBe('service_day,T1,Test Line,WKD,Weekday,3,1.25,19,260,,,,');
    expect(lines[2]).toBe('pattern,T1,Test Line,,,,,,,0,T1-A-C,,Alpha to Charlie');
    expect(lines[3]).toBe('note,,,,,,,,,,,,Map lines: straight lines.');
    expect(text.includes('\r')).toBe(false);
  });

  it('lists every warning after the rows, with its code and the Route, pattern or stop it names', () => {
    const warnings: GtfsExportIssue[] = [
      { code: 'gtfsExport.stopIdGenerated', routeId: 'route-t1', routeName: 'Test Line', stopName: 'Main & 1st', stopId: 'T1-1' },
      { code: 'gtfsExport.routeSkipped', routeId: 'route-idle', routeName: 'Idle Line' },
    ];

    const lines = reportCsvText([], warnings, new Map([['route-t1', 'T1']])).split('\n');

    // route_id is the export route_id, never the internal ID; a Route that is not exported has none.
    expect(lines[1]).toBe('warning,T1,Test Line,,,,,,,,,gtfsExport.stopIdGenerated,Route Test Line; stop Main & 1st; stop ID T1-1');
    expect(lines[2]).toBe('warning,,Idle Line,,,,,,,,,gtfsExport.routeSkipped,Route Idle Line');
  });

  it('leaves route_id blank for a warning that names no Route', () => {
    const lines = reportCsvText([], [{ code: 'gtfsExport.daySkipped', serviceDayName: 'Sunday' }]).split('\n');

    expect(lines[1]).toBe('warning,,,,,,,,,,,gtfsExport.daySkipped,service day Sunday');
  });

  it('protects free text against spreadsheet formulas with an apostrophe, and quotes a name that holds a comma', () => {
    const text = reportCsvText([
      { kind: 'serviceDay', routeId: 'T1', routeName: '=HYPERLINK("x")', serviceId: 'WKD', serviceDayName: 'Weekday, holiday', trips: 1, runningHours: 0, datesInRange: 1, scenarioAnnualServiceDays: 1 },
    ], []);

    expect(text.split('\n')[1]).toBe('service_day,T1,"\'=HYPERLINK(""x"")",WKD,"Weekday, holiday",1,0.00,1,1,,,,');
  });
});
