import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { compareRouteRuntimes, type RuntimeComparisonInput } from './runtimeComparison';
import type { DirectionTimepointColumn, RoutePattern, RuntimeAssignment, RuntimeBand, RuntimeProfile } from './types';

const T = metadata('2026-01-01T00:00:00.000Z');
const hours = (h: number) => h * 3600;

// The UI takes directionColumnOrder from the Direction. RouteDirection.columns is a DirectionTimepointColumn[]. The node order is the
// nodeId field of each column, after sorting the columns by their sequence field. TripsWorkspace.tsx and ScheduleTable both sort
// direction.columns by sequence in this way. The test "takes the direction column order from RouteDirection.columns" shows this.
const NODE_ORDER = ['N1', 'N2', 'N3'];

function pattern(id: string, nodes: string[], overrides: Partial<RoutePattern> = {}): RoutePattern {
  return {
    ...T, id, scenarioId: 's', routeId: 'r', name: id, sequence: 0, directionId: 'out',
    points: nodes.map((nodeId, index) => ({ id: `${id}-p${index}`, nodeId, sequence: index, cumulativeMiles: index })),
    ...overrides,
  };
}

function band(id: string, startHour: number, endHour: number, seconds: number[]): RuntimeBand {
  return { id, label: id, sequence: 0, startTime: hours(startHour), endTime: hours(endHour), segmentRuntimeSeconds: seconds };
}

function profile(id: string, patternId: string, bands: RuntimeBand[]): RuntimeProfile {
  return { ...T, id, scenarioId: 's', routeId: 'r', patternId, name: id, bands };
}

function assign(patternId: string, runtimeProfileId: string, serviceDayId = 'weekday'): RuntimeAssignment {
  return { ...T, id: `a-${patternId}-${serviceDayId}`, scenarioId: 's', patternId, serviceDayId, runtimeProfileId };
}

function input(overrides: Partial<RuntimeComparisonInput> = {}): RuntimeComparisonInput {
  return { directionId: 'out', serviceDayId: 'weekday', patterns: [], profiles: [], assignments: [], directionColumnOrder: NODE_ORDER, ...overrides };
}

describe('compareRouteRuntimes', () => {
  // Two patterns on N1 to N2 to N3. Their bands are offset (P1 4-10 and 10-18; P2 6-12 and 12-22).
  // Every value is 60 except P2 band W, segment N2>N3, which is 75. The only overlapping pair with different values is
  // P1 band Y with P2 band W on N2>N3, so exactly two cells are discrepant.
  const twoOffset = input({
    patterns: [pattern('P1', ['N1', 'N2', 'N3']), pattern('P2', ['N1', 'N2', 'N3'])],
    profiles: [
      profile('PR1', 'P1', [band('X', 4, 10, [60, 60]), band('Y', 10, 18, [60, 60])]),
      profile('PR2', 'P2', [band('Z', 6, 12, [60, 60]), band('W', 12, 22, [60, 75])]),
    ],
    assignments: [assign('P1', 'PR1'), assign('P2', 'PR2')],
  });

  it('flags exactly the cells whose overlapping band holds a different value', () => {
    const result = compareRouteRuntimes(twoOffset);
    const discrepant = result.stacked.flatMap((row) => row.bands.flatMap((band) => band.cells.flatMap((cell) => (cell?.discrepancy ? [`${row.patternId}:${band.bandId}:${cell.segmentKey}`] : []))));
    expect(discrepant).toEqual(['P1:Y:N2>N3', 'P2:W:N2>N3']);
    const w = result.stacked[1].bands[1].cells[1];
    expect(w?.otherValues).toEqual([{ patternId: 'P1', profileId: 'PR1', bandId: 'Y', seconds: 60 }]);
  });

  it('orders segments by the from-node position in the direction column order', () => {
    const result = compareRouteRuntimes(input({ ...twoOffset, directionColumnOrder: ['N2', 'N3', 'N1'] }));
    expect(result.segments.map((segment) => segment.key)).toEqual(['N2>N3', 'N1>N2']);
  });

  it('takes the direction column order from RouteDirection.columns sorted by sequence', () => {
    const columns: DirectionTimepointColumn[] = [
      { id: 'c2', nodeId: 'N2', sequence: 2 },
      { id: 'c3', nodeId: 'N3', sequence: 1 },
      { id: 'c1', nodeId: 'N1', sequence: 3 },
    ];
    const order = [...columns].sort((left, right) => left.sequence - right.sequence).map((column) => column.nodeId);
    expect(order).toEqual(['N3', 'N2', 'N1']);
    const result = compareRouteRuntimes(input({ ...twoOffset, directionColumnOrder: order }));
    expect(result.segments.map((segment) => segment.key)).toEqual(['N2>N3', 'N1>N2']);
  });

  it('leaves out segment keys that a pattern runs twice (loops)', () => {
    // P3 runs N1>N2, N2>N1, N1>N2 again, then N2>N3. The repeated N1>N2 is a loop, so N1>N2 is left out for every pattern.
    const loop = input({
      patterns: [pattern('P3', ['N1', 'N2', 'N1', 'N2', 'N3']), pattern('P4', ['N1', 'N2', 'N3'])],
      profiles: [
        profile('PR3', 'P3', [band('L', 4, 10, [1, 2, 1, 3])]),
        profile('PR4', 'P4', [band('M', 4, 10, [5, 6])]),
      ],
      assignments: [assign('P3', 'PR3'), assign('P4', 'PR4')],
    });
    const result = compareRouteRuntimes(loop);
    expect(result.segments.map((segment) => segment.key)).toEqual(['N2>N1', 'N2>N3']);
    const keys = result.stacked.flatMap((row) => row.bands.flatMap((band) => band.cells.map((cell) => cell?.segmentKey)));
    expect(keys).not.toContain('N1>N2');
  });

  it('ignores :00 values on both sides of a comparison', () => {
    // P1 holds 0 on band X and 60 on band Y. P2 holds 60 on band Z and 0 on band W. Band X overlaps Z, and band W overlaps Y.
    const zero = input({
      patterns: [pattern('P1', ['N1', 'N2']), pattern('P2', ['N1', 'N2'])],
      profiles: [
        profile('PR1', 'P1', [band('X', 4, 10, [0]), band('Y', 10, 18, [60])]),
        profile('PR2', 'P2', [band('Z', 6, 12, [60]), band('W', 12, 22, [0])]),
      ],
      assignments: [assign('P1', 'PR1'), assign('P2', 'PR2')],
    });
    const result = compareRouteRuntimes(zero);
    const flags = result.stacked.flatMap((row) => row.bands.flatMap((band) => band.cells.map((cell) => cell?.discrepancy)));
    expect(flags).toEqual([false, false, false, false]);
    // The 0 cell of P2 band W still lists the overlapping non-zero value of P1 band Y.
    expect(result.stacked[1].bands[1].cells[0]).toMatchObject({ seconds: 0, discrepancy: false, otherValues: [{ patternId: 'P1', bandId: 'Y', seconds: 60 }] });
  });

  it('leaves out patterns of another Direction and patterns with no profile for the Service day', () => {
    const result = compareRouteRuntimes(input({
      patterns: [pattern('P1', ['N1', 'N2', 'N3']), pattern('IN', ['N1', 'N2'], { directionId: 'in' }), pattern('NOA', ['N1', 'N2'])],
      profiles: [profile('PR1', 'P1', [band('X', 4, 10, [60, 60])]), profile('PRIN', 'IN', [band('I', 4, 10, [60])]), profile('PRN', 'NOA', [band('N', 4, 10, [60])])],
      assignments: [assign('P1', 'PR1'), assign('IN', 'PRIN'), assign('NOA', 'PRN', 'saturday')],
    }));
    expect(result.stacked.map((row) => row.patternId)).toEqual(['P1']);
  });

  it('cuts intervals at every band boundary and lists each pattern value in each interval', () => {
    const result = compareRouteRuntimes(twoOffset);
    expect(result.intervals.map((item) => [item.startTime, item.endTime])).toEqual([
      [hours(4), hours(6)], [hours(6), hours(10)], [hours(10), hours(12)], [hours(12), hours(18)], [hours(18), hours(22)],
    ]);
    expect(result.intervals[1].cells['N2>N3']).toEqual([{ patternId: 'P1', seconds: 60 }, { patternId: 'P2', seconds: 60 }]);
    expect(result.intervals[3].cells['N2>N3']).toEqual([{ patternId: 'P1', seconds: 60 }, { patternId: 'P2', seconds: 75 }]);
    expect(result.intervals[4].cells['N2>N3']).toEqual([{ patternId: 'P2', seconds: 75 }]);
  });
});
