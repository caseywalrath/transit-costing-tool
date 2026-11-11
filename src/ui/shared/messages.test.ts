import { describe, expect, it } from 'vitest';
import type { AnchorDiagnosis } from '../../domain/anchorDiagnosis';
import type { ValidationFinding } from '../../domain/types';
import { describeAnchorDiagnosis, describeAnchorSegmentChanges, USER_FACING_VALIDATION_MESSAGES, userMessage } from './messages';

// Decision 0072. The fixtures are the rising-runtime gap of `src/domain/anchorDiagnosis.test.ts`: the boundary is 8:00 (28800).
const boundary = { time: 28800, fromBand: { id: 'am', label: 'AM Peak' }, toBand: { id: 'pm', label: 'PM' }, segmentChanges: [{ segmentIndex: 0, fromSeconds: 600, toSeconds: 720 }, { segmentIndex: 1, fromSeconds: 900, toSeconds: 1080 }] };
const earlier = { anchorTime: 29699, firstDeparture: 28199, differenceSeconds: -61 };
const later = { anchorTime: 29880, firstDeparture: 28200, differenceSeconds: 120 };
const base = { anchorPointId: 'p2', anchorTime: 29760, firstDepartureWorks: true };
const segmentLabel = (index: number) => `Segment ${index + 1}`;
const finding = (messageKey: string): ValidationFinding => ({ ruleId: messageKey, severity: 'error', entityType: 'trip', entityId: 't', messageKey });

describe('anchor diagnosis sentences (Decision 0072 item 3)', () => {
  it('states a gap at a band boundary with the nearest solutions and their signed differences', () => {
    const diagnosis: AnchorDiagnosis = { ...base, kind: 'gap', earlier, later, boundary };
    expect(describeAnchorDiagnosis(diagnosis, 'Stop B', segmentLabel)).toBe('Keeping Stop B at 8:16 is not possible: runtimes change at 8:00 (AM Peak to PM). Nearest: 8:14:59 (−1:01) or 8:18 (+2:00).');
  });

  it('drops the Nearest part when a solution is absent', () => {
    expect(describeAnchorDiagnosis({ ...base, kind: 'gap', earlier, boundary }, 'Stop B', segmentLabel)).toBe('Keeping Stop B at 8:16 is not possible: runtimes change at 8:00 (AM Peak to PM). Nearest: 8:14:59 (−1:01).');
    expect(describeAnchorDiagnosis({ ...base, kind: 'gap', boundary }, 'Stop B', segmentLabel)).toBe('Keeping Stop B at 8:16 is not possible: runtimes change at 8:00 (AM Peak to PM).');
  });

  it('states an overlap with the boundary and the nearest single solutions as times only', () => {
    const diagnosis: AnchorDiagnosis = { ...base, kind: 'overlap', earlier, later, boundary };
    expect(describeAnchorDiagnosis(diagnosis, 'Stop B', segmentLabel)).toBe('Keeping Stop B at 8:16 is reached from more than one first departure because runtimes change at 8:00. Nearest single solutions: 8:14:59 or 8:18.');
  });

  it('states an overlap without a boundary and drops the parts that are absent', () => {
    expect(describeAnchorDiagnosis({ ...base, kind: 'overlap', later }, 'Stop B', segmentLabel)).toBe('Keeping Stop B at 8:16 is reached from more than one first departure. Nearest single solutions: 8:18.');
  });

  it('uses the outside sentence when no departure can reach the time, and for a gap without a boundary', () => {
    expect(describeAnchorDiagnosis({ ...base, kind: 'outside', firstDepartureWorks: false }, 'Stop B', segmentLabel)).toBe('Keeping Stop B at 8:16 needs a first departure outside every runtime band.');
    expect(describeAnchorDiagnosis({ ...base, kind: 'gap', earlier, later }, 'Stop B', segmentLabel)).toBe('Keeping Stop B at 8:16 needs a first departure outside every runtime band.');
  });

  it('shows seconds only when a time has them', () => {
    expect(describeAnchorDiagnosis({ ...base, anchorTime: 29700, kind: 'outside', firstDepartureWorks: false }, 'Stop B', segmentLabel)).toBe('Keeping Stop B at 8:15 needs a first departure outside every runtime band.');
  });
});

describe('describeAnchorSegmentChanges (Decision 0072 item 3)', () => {
  it('lists each segment whose runtime changes across the boundary, in runtime format', () => {
    expect(describeAnchorSegmentChanges({ ...base, kind: 'gap', boundary }, segmentLabel)).toEqual(['Segment 1: :10 → :12', 'Segment 2: :15 → :18']);
  });

  it('returns no lines without a boundary', () => {
    expect(describeAnchorSegmentChanges({ ...base, kind: 'outside', firstDepartureWorks: false }, segmentLabel)).toEqual([]);
  });
});

describe('trip messages without text before Decision 0072', () => {
  it.each([
    ['trip.targetRuntimeUnavailable', 'The target pattern has no runtime profile for this service day. Assign one in Runtimes.'],
    ['trip.anchorNearestTie', 'Two runtime bands are equally close to the calculated departure. Choose a band or another anchor.'],
    ['trip.anchorBandChoiceInvalid', 'The chosen runtime band no longer applies. Review the trip again.'],
    ['trip.patternRouteMismatch', 'Choose a pattern on the same route.'],
    ['trip.anchorMissing', 'The anchor timepoint is not on this pattern. Choose another anchor.'],
    ['trip.anchorTimeMissing', 'This trip has no saved time at the anchor timepoint. Choose another anchor.'],
  ])('%s shows its own text, not the fallback', (messageKey, text) => {
    expect(USER_FACING_VALIDATION_MESSAGES[messageKey]).toBe(text);
    expect(userMessage(finding(messageKey))).toBe(text);
  });
});
