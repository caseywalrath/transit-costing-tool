// Phase 3 tasks 3.9 and 3.10 (CSV interchange and formula injection).
// Backs findings 3-010 (csvEscape does not quote a bare CR; Phase 1 hand-off) and
// 3-011 (user-entered text beginning with =, +, -, @ is exported unescaped) and
// 3-012 (toCsv does not escape header cells; Trips CSV headers carry Pattern/Node names).
// Tests named "DEFECT:" use it.fails: they assert the expected behaviour, fail on the
// reviewed code, and are reported as passing ("expected fail") so the golden suite stays green.
// Tests named "CURRENT:" assert current behaviour.
// Run: pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p3-csv.golden.test.ts
import { describe, it, expect } from 'vitest';
import { csvEscape, toCsv, blockingBlocksCsv, nodesCsv } from '../../../src/persistence/csv';
import { tripTableCsv, parseTripTableCsv } from '../../../src/ui/tripTableCsv';
import { runtimeProfileCsv, parseRuntimePaste } from '../../../src/ui/runtimePaste';
import { importProjectJson } from '../../../src/persistence/backup';
import { goldenText } from './p3-fixture';

/** RFC 4180 reader used only to check what a spreadsheet would see. Treats CR, LF, CRLF as row ends. */
function rfc4180(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' || c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; if (c === '\r' && text[i + 1] === '\n') i++; }
    else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

describe('3.9 shared CSV writer (csv.ts)', () => {
  it('CURRENT: quotes comma, quote, LF and CRLF', () => {
    expect(csvEscape('a,b')).toBe('"a,b"'); expect(csvEscape('a"b')).toBe('"a""b"'); expect(csvEscape('a\nb')).toBe('"a\nb"'); expect(csvEscape('a\r\nb')).toBe('"a\r\nb"');
  });
  it.fails('DEFECT 3-010: a value containing a bare CR is quoted', () => { expect(csvEscape('a\rb')).toBe('"a\rb"'); });
  it.fails('DEFECT 3-010: a Block note with a bare CR stays one row for an RFC 4180 reader', () => {
    const csv = blockingBlocksCsv([{ id: 'b', scenarioId: 's', blockingScenarioId: 'bs', serviceDayId: 'd', label: '1', notes: 'line1\rline2', activities: [], createdAt: '', updatedAt: '' }]);
    expect(rfc4180(csv).length).toBe(2);
  });
  it('CURRENT: rows end with CRLF and there is no BOM', () => { const csv = toCsv(['a'], [{ a: 1 }]); expect(csv).toBe('a\r\n1\r\n'); });
});

describe('3.10 formula injection', () => {
  for (const name of ['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(1,1)']) {
    it.fails(`DEFECT 3-011: Node name ${JSON.stringify(name)} is neutralised in nodes CSV`, () => {
      const csv = nodesCsv([{ id: 'n', scenarioId: 's', routeId: 'r', name, kind: 'terminal', createdAt: '', updatedAt: '' }]);
      const cell = rfc4180(csv)[1][3];
      expect(/^[=+\-@]/.test(cell)).toBe(false);
    });
  }
  it.fails('DEFECT 3-011: Trip publicLabel "=1+1" is neutralised in the Trips CSV', () => {
    const snap = importProjectJson(goldenText());
    const trip = { ...snap.trips[0], publicLabel: '=1+1' };
    const csv = tripTableCsv([trip], snap.patterns.filter((p) => p.id === trip.patternId), () => 'N');
    expect(rfc4180(csv)[1][2].startsWith('=')).toBe(false);
  });
});

describe('3.9 Trips CSV (tripTableCsv.ts)', () => {
  const snap = importProjectJson(goldenText());
  const pattern = snap.patterns[0];
  const trips = snap.trips.filter((t) => t.patternId === pattern.id).slice(0, 5);
  const nodeName = (id: string) => snap.nodes.find((n) => n.id === id)!.name;
  it('CURRENT: export -> parse round-trips IDs, pattern and whole-second times, including 24+ times', () => {
    const late = { ...trips[0], publicLabel: 'Late, "owl"\nrun', stopTimes: trips[0].stopTimes.map((p, i) => ({ ...p, time: 90000 + i * 61 })) };
    const csv = tripTableCsv([late, ...trips.slice(1)], [pattern], nodeName);
    const parsed = parseTripTableCsv(csv);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows[0]).toEqual({ tripId: late.id, patternId: pattern.id, publicLabel: 'Late, "owl"\nrun', stopTimes: late.stopTimes.map((p) => ({ patternPointId: p.patternPointId, time: p.time })) });
    expect(parsed.rows.length).toBe(5);
  });
  it('CURRENT: BOM, CRLF and LF-only input parse the same', () => {
    const csv = tripTableCsv(trips, [pattern], nodeName);
    const a = parseTripTableCsv('﻿' + csv); const b = parseTripTableCsv(csv.replaceAll('\r\n', '\n'));
    expect(a).toEqual(b); expect(a.issues).toEqual([]);
  });
  it('CURRENT: pattern and node names with colons survive in headers', () => {
    const parsed = parseTripTableCsv(tripTableCsv(trips, [{ ...pattern, name: 'SB: Express' }], () => 'Node: 1'));
    expect(parsed.issues).toEqual([]); expect(parsed.rows.length).toBe(5);
  });
  it.fails('DEFECT 3-012: a Pattern name containing a comma survives a Trips CSV round trip (toCsv does not escape header cells)', () => {
    const parsed = parseTripTableCsv(tripTableCsv(trips, [{ ...pattern, name: 'SB, Express' }], nodeName));
    expect(parsed.issues).toEqual([]);
  });
  it.fails('DEFECT 3-012: a Pattern name containing a double quote survives a Trips CSV round trip', () => {
    const parsed = parseTripTableCsv(tripTableCsv(trips, [{ ...pattern, name: 'SB "Express"' }], nodeName));
    expect(parsed.issues).toEqual([]);
  });
  it.fails('DEFECT 3-012: a Node name containing a comma survives a Trips CSV round trip', () => {
    const parsed = parseTripTableCsv(tripTableCsv(trips, [pattern], () => 'Federal, Colfax'));
    expect(parsed.issues).toEqual([]);
  });
  it('CURRENT: blank tripId produces an add row; malformed quoting and wrong column counts are reported', () => {
    const csv = tripTableCsv(trips.slice(0, 1), [pattern], nodeName).replace(trips[0].id, '');
    expect(parseTripTableCsv(csv).rows[0].tripId).toBeUndefined();
    expect(parseTripTableCsv('tripId,patternId,point:x:y\r\n"a,b\r\n').issues[0]).toMatch(/not closed/);
    expect(parseTripTableCsv('tripId,patternId,point:x:y\r\na,b\r\n').issues[0]).toMatch(/expected 3 columns/);
  });
  it('CURRENT: leading/trailing spaces in publicLabel are trimmed on import (not byte-stable)', () => {
    const parsed = parseTripTableCsv(tripTableCsv([{ ...trips[0], publicLabel: '  A  ' }], [pattern], nodeName));
    expect(parsed.rows[0].publicLabel).toBe('A');
  });
});

describe('3.9 Runtime CSV/paste (runtimePaste.ts)', () => {
  const snap = importProjectJson(goldenText());
  const profile = snap.runtimeProfiles[0];
  const segments = profile.bands[0].segmentRuntimeSeconds.length;
  it('CURRENT: runtimeProfileCsv -> parseRuntimePaste round-trips labels, 24+ ranges, second-level runtimes and method', () => {
    const p = { ...profile, calculationMethod: 'segmentStart' as const, bands: profile.bands.map((b, i) => ({ ...b, label: i === 0 ? 'AM, "peak"' : b.label, startTime: b.startTime + 30, endTime: b.endTime + 86400, segmentRuntimeSeconds: b.segmentRuntimeSeconds.map((s, j) => s + j) })) };
    const rows = parseRuntimePaste(runtimeProfileCsv(p), segments);
    expect(rows.map((r) => [r.bandLabel, r.startTime, r.endTime, r.segmentRuntimeSeconds, r.calculationMethod])).toEqual(p.bands.map((b) => [b.label, b.startTime, b.endTime, b.segmentRuntimeSeconds, 'segmentStart']));
  });
  it('CURRENT: tab-separated paste with BOM and CRLF, header with Total, is accepted', () => {
    const header = ['Band', 'From', 'To', ...Array.from({ length: segments }, (_, i) => `S${i + 1}`), 'Total'].join('\t');
    const row = ['AM', '6:00', '25:00', ...Array.from({ length: segments }, () => '7:30'), '999'].join('\t');
    const rows = parseRuntimePaste('﻿' + header + '\r\n' + row + '\r\n', segments);
    expect(rows[0]).toMatchObject({ bandLabel: 'AM', startTime: 21600, endTime: 90000 });
    expect(rows[0].segmentRuntimeSeconds.every((s) => s === 450)).toBe(true);
  });
  it('CURRENT: blank cell, malformed quote and wrong column count are rejected before Apply', () => {
    expect(() => parseRuntimePaste('6:00,7:00,' + ','.repeat(segments - 1), segments)).toThrow();
    expect(() => parseRuntimePaste('"6:00,7:00', segments)).toThrow(/not closed/);
    expect(() => parseRuntimePaste('6:00,7:00', segments)).toThrow(/expected/);
  });
});
