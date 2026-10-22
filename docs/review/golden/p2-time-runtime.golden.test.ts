// Phase 2 review reproduction tests: tasks 2.1 (time and duration parsing) and 2.2 (runtime band resolution).
// Backs findings 2-007 (segment-start gap-midpoint tie), 2-008 (decimal-minute half-second rounding),
// 2-011 (band label rename increments calculation revision), and closes A-007 (segmentStart had no calculation test).
// Unless a test name starts with "DEFECT", it asserts documented (expected) behaviour and passes.
// Tests named "DEFECT ..." assert the CURRENT defective behaviour so that the suite documents the defect; the
// header of each such test states the expected behaviour.
import { describe, expect, it } from 'vitest';
import { formatServiceTime, parseServiceTime } from '../../../src/domain/time';
import { formatRuntimeDuration, parseRuntimeDuration } from '../../../src/domain/durations';
import { blendSegmentTimes, propagatePatternTimes, resolveSegmentStartBand, segmentStartTimes, selectRuntimeBand, validateRuntimeProfile, withRuntimeCalculationRevision } from '../../../src/domain/runtime';
import type { RoutePattern, RuntimeBand, RuntimeProfile } from '../../../src/domain/types';

const meta = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const pattern: RoutePattern = { ...meta, id: 'p', scenarioId: 's', routeId: 'r', name: 'P', points: [
  { id: 'a', nodeId: 'A', sequence: 0, cumulativeMiles: 0 },
  { id: 'b', nodeId: 'B', sequence: 1, cumulativeMiles: 1 },
  { id: 'c', nodeId: 'C', sequence: 2, cumulativeMiles: 2 },
] };
const band = (id: string, startTime: number, endTime: number, segs: number[], sequence = 0): RuntimeBand => ({ id, label: id.toUpperCase(), sequence, startTime, endTime, segmentRuntimeSeconds: segs });
const profile = (bands: RuntimeBand[], calculationMethod?: RuntimeProfile['calculationMethod']): RuntimeProfile => ({ ...meta, id: 'rp', scenarioId: 's', routeId: 'r', patternId: 'p', name: 'Weekday', bands, ...(calculationMethod ? { calculationMethod } : {}) });
// AM 6:00-9:00, MID 9:00-15:00, gap 15:00-16:00, PM 16:00-20:00. Bands deliberately listed out of order.
const bands = [band('pm', 57600, 72000, [1200, 1200], 2), band('am', 21600, 32400, [600, 900], 0), band('mid', 32400, 54000, [2100, 300], 1)];
const times = (result: ReturnType<typeof propagatePatternTimes>) => ('finding' in result ? result.finding.ruleId : result.stopTimes.map((point) => point.time));

describe('2.1 service time parsing and formatting', () => {
  it.each([
    ['24:00', 86400], ['25:00', 90000], ['27:30', 99000], [' 6:30 ', 23400], ['6:30:15', 23415], ['0:00', 0], ['9999:59:59', 9999 * 3600 + 3599],
  ])('parses %s', (value, expected) => expect(parseServiceTime(value)).toBe(expected));
  it.each(['xx:60', '6:60', '6:30:60', ':30', '6', '-1:00', '', '   ', '6:3', '6.5:00'])('rejects %j', (value) => expect(() => parseServiceTime(value)).toThrow());
  it('formats extended and second-precision times; rejects negative and fractional values', () => {
    expect(formatServiceTime(99000)).toBe('27:30');
    expect(formatServiceTime(99005, true)).toBe('27:30:05');
    expect(() => formatServiceTime(-1)).toThrow();
    expect(() => formatServiceTime(1.5)).toThrow();
  });
  it('very large hours parse to an integer beyond Number.MAX_SAFE_INTEGER (no maximum: Decision 0002 defers it)', () => {
    const value = parseServiceTime('9999999999999:00');
    expect(value > Number.MAX_SAFE_INTEGER).toBe(true);
  });
});

describe('2.1 runtime duration parsing and formatting', () => {
  it.each([
    [':07', 420], [':7', 420], [':07:30', 450], ['7:30', 450], ['60', 3600], ['7.5', 450], ['0.025', 2], [' 5 ', 300], ['0', 0], ['120:00', 7200],
  ])('parses %j to %d seconds', (value, expected) => expect(parseRuntimeDuration(value)).toBe(expected));
  it.each(['xx:60', '7:60', ':07:60', ':07:5', '-1', '-0.5', '1e3', '7:5', ':', '::'])('rejects %j', (value) => expect(() => parseRuntimeDuration(value)).toThrow());
  it('keeps empty distinct from zero', () => { expect(parseRuntimeDuration('')).toBeUndefined(); expect(parseRuntimeDuration('  ')).toBeUndefined(); });
  it('formats minutes without a 59-minute cap', () => { expect(formatRuntimeDuration(3600)).toBe(':60'); expect(formatRuntimeDuration(3661)).toBe(':61:01'); });
  // 2-008. Expected: a decimal-minute entry that is exactly half a second resolves consistently (0.025 min = 1.5 s, 1.025 min = 61.5 s).
  it('DEFECT 2-008: half-second decimal-minute entries round inconsistently because of binary multiplication', () => {
    expect(parseRuntimeDuration('0.025')).toBe(2); // 1.5 s -> 2 (rounds up)
    expect(parseRuntimeDuration('1.025')).toBe(61); // 61.5 s -> 61 (rounds down: 1.025 * 60 = 61.49999999999999)
    expect(parseRuntimeDuration('4.225')).toBe(253); // 253.5 s -> 253
  });
});

describe('2.1 Trips-table round-display rule (Decision 0033), formula copied from src/ui/App.tsx:1402-1405', () => {
  const display = (value: number, round: boolean) => { const v = round ? Math.floor((value + 30) / 60) * 60 : value; return formatServiceTime(v, v % 60 !== 0); };
  it.each([[23429, '6:30'], [23430, '6:31'], [23431, '6:31'], [23459, '6:31'], [86370, '24:00']])('rounds %d to %s', (value, expected) => expect(display(value, true)).toBe(expected));
  it('shows seconds when not rounding', () => expect(display(23430, false)).toBe('6:30:30'));
});

describe('2.2 segmentStart (default method, A-007): boundary matrix', () => {
  const p = profile(bands, 'segmentStart');
  it.each<[string, number, number[] | string]>([
    ['departure at first band start', 21600, [21600, 22200, 23100]],
    ['segment crossing a band end keeps its start band; next segment uses the new band', 32399, [32399, 32999, 33299]],
    ['departure exactly at band end belongs to the next band (half-open)', 32400, [32400, 34500, 34800]],
    ['segment starting inside a gap uses the nearest band (MID, 100 s away)', 52000, [52000, 54100, 54400]],
    ['segment starting after the last band uses the last band', 71900, [71900, 73100, 74300]],
    ['departure inside a gap is rejected', 55000, 'runtime.noApplicableBand'],
    ['departure before the first band is rejected', 21599, 'runtime.noApplicableBand'],
    ['departure at the last band end is rejected', 72000, 'runtime.noApplicableBand'],
  ])('%s', (_label, departure, expected) => expect(times(propagatePatternTimes(pattern, departure, p))).toEqual(expected));
  it('segment contributions name the band used at each segment start', () => {
    const result = segmentStartTimes(pattern, 32399, p);
    if ('finding' in result) throw new Error('unexpected finding');
    expect(result.segments.map((segment) => segment.contributions.map((part) => part.bandId))).toEqual([['am'], ['mid']]);
  });
  it('single-band profile extends beyond its own end for later segments', () => {
    expect(times(propagatePatternTimes(pattern, 32000, profile([band('am', 21600, 32400, [600, 900])], 'segmentStart')))).toEqual([32000, 32600, 33500]);
  });
  it('unsorted band input is ordered by start time before resolution', () => {
    expect(resolveSegmentStartBand(profile(bands, 'segmentStart'), 40000)?.id).toBe('mid');
  });
  it('overlapping bands: the earlier-starting band wins and validation reports runtime.bandOverlap', () => {
    const overlapping = profile([band('x', 0, 3600, [60, 60]), band('y', 1800, 5400, [120, 120])], 'segmentStart');
    expect(selectRuntimeBand(overlapping, 2000)?.id).toBe('x');
    expect(validateRuntimeProfile(overlapping, pattern).map((finding) => finding.ruleId)).toContain('runtime.bandOverlap');
  });
  it('zero-length band is invalid and never contains a departure', () => {
    const zero = profile([band('z', 3600, 3600, [60, 60])], 'segmentStart');
    expect(selectRuntimeBand(zero, 3600)).toBeUndefined();
    expect(validateRuntimeProfile(zero, pattern).map((finding) => finding.ruleId)).toContain('runtime.bandBoundsInvalid');
  });
  // 2-007. Decision 0033: "At a gap or beyond the outer bands, use the nearest band, matching the prior blend's fallback."
  // Expected: a segment that starts exactly at the gap midpoint resolves to the same band as the blend fallback.
  it('DEFECT 2-007: at the exact gap midpoint segmentStart picks the earlier band while the blend picks the later band', () => {
    // MID ends 54000, PM starts 57600, midpoint 55800. Departure 53700 + MID 2100 s = 55800.
    expect(resolveSegmentStartBand(p, 55800)?.id).toBe('mid');
    expect(times(propagatePatternTimes(pattern, 53700, p))).toEqual([53700, 55800, 56100]); // MID 300 s used
    const blend = blendSegmentTimes(pattern, 53700, profile(bands, 'blendSegments'));
    if ('finding' in blend) throw new Error('unexpected finding');
    expect(blend.segments[1].contributions[0].bandId).toBe('pm'); // blend starts the second segment in PM
  });
});

describe('2.2 singleBand (legacy default) and blendSegments boundary matrix', () => {
  it.each<[string, number, number[] | string]>([
    ['departure one second before band end uses that band for the whole trip', 32399, [32399, 32999, 33899]],
    ['departure at band end uses the next band', 32400, [32400, 34500, 34800]],
    ['departure in a gap is rejected', 55000, 'runtime.noApplicableBand'],
    ['departure after the last band is rejected', 72000, 'runtime.noApplicableBand'],
  ])('singleBand: %s', (_label, departure, expected) => expect(times(propagatePatternTimes(pattern, departure, profile(bands)))).toEqual(expected));
  it.each<[string, number, number[] | string]>([
    ['segment inside one band', 21600, [21600, 22200, 23100]],
    ['segment crossing AM->MID is blended by progress (half at AM rate, half at MID rate)', 32100, [32100, 33450, 33750]],
    ['departure in a gap is rejected', 55000, 'runtime.noApplicableBand'],
  ])('blendSegments: %s', (_label, departure, expected) => expect(times(propagatePatternTimes(pattern, departure, profile(bands, 'blendSegments')))).toEqual(expected));
  it('blend output is whole seconds and contributions sum to the segment duration', () => {
    const result = blendSegmentTimes(pattern, 32111, profile(bands, 'blendSegments'));
    if ('finding' in result) throw new Error('unexpected finding');
    for (const point of result.stopTimes) expect(Number.isInteger(point.time)).toBe(true);
    for (const segment of result.segments) expect(segment.contributions.reduce((sum, part) => sum + part.seconds, 0)).toBe(segment.durationSeconds);
  });
});

describe('2.2 calculation revision', () => {
  const base = profile(bands, 'segmentStart');
  const saved = { ...base, calculationRevision: 4 };
  it('rename does not increment; duration, bound, and method changes increment; legacy undefined->singleBand does not', () => {
    expect(withRuntimeCalculationRevision(saved, { ...saved, name: 'Renamed' }).calculationRevision).toBe(4);
    expect(withRuntimeCalculationRevision(saved, { ...saved, bands: [{ ...bands[0], segmentRuntimeSeconds: [1260, 1200] }, ...bands.slice(1)] }).calculationRevision).toBe(5);
    expect(withRuntimeCalculationRevision(saved, { ...saved, bands: [{ ...bands[0], endTime: 72060 }, ...bands.slice(1)] }).calculationRevision).toBe(5);
    expect(withRuntimeCalculationRevision(saved, { ...saved, calculationMethod: 'blendSegments' }).calculationRevision).toBe(5);
    const legacy = { ...profile(bands), calculationRevision: 2 };
    expect(withRuntimeCalculationRevision(legacy, { ...legacy, calculationMethod: 'singleBand' }).calculationRevision).toBe(2);
    expect(withRuntimeCalculationRevision(saved, { ...saved, bands: [...bands].reverse().map((item, sequence) => ({ ...item, sequence })) }).calculationRevision).toBe(4);
  });
  // 2-011. Overview Runtime Model: "Band-bound or segment-duration changes increment that revision; a profile rename does not."
  // Expected (by analogy, the overview is silent on band labels): a band label change does not change calculated times and should not increment.
  it('DEFECT 2-011: renaming a band label increments the calculation revision', () => {
    expect(withRuntimeCalculationRevision(saved, { ...saved, bands: [{ ...bands[0], label: 'Evening' }, ...bands.slice(1)] }).calculationRevision).toBe(5);
  });
});
