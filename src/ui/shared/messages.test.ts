import { describe, expect, it } from 'vitest';
import type { AnchorDiagnosis } from '../../domain/anchorDiagnosis';
import type { ValidationFinding } from '../../domain/types';
import { explainTripProblem, shiftText, type TripProblemInput, USER_FACING_VALIDATION_MESSAGES, userMessage } from './messages';

// Decision 0072 items 7 to 12, with the times of the R5 mock-up: AM Peak starts at 8:00 (28800), and the kept time is Federal-32nd at 8:16.
const boundary = { time: 28800, fromBand: { id: 'early', label: 'Early' }, toBand: { id: 'am', label: 'AM Peak' }, segmentChanges: [{ segmentIndex: 0, fromSeconds: 600, toSeconds: 660 }, { segmentIndex: 1, fromSeconds: 900, toSeconds: 1020 }] };
const earlier = { anchorTime: 29640, firstDeparture: 28740, differenceSeconds: -120 };
const later = { anchorTime: 29880, firstDeparture: 28800, differenceSeconds: 120 };
const base = { anchorPointId: 'p2', anchorTime: 29760, firstDepartureWorks: true };
const finding = (messageKey: string, severity: ValidationFinding['severity'] = 'error'): ValidationFinding => ({ ruleId: messageKey, severity, entityType: 'trip', entityId: 't', messageKey });
const input = (overrides: Partial<TripProblemInput>): TripProblemInput => ({ mode: 'regenerate', findings: [finding('trip.anchorNoRuntime')], keptStopName: 'Federal-32nd', keptAtStart: false, startTime: 28080, segmentName: (index) => ['Westminster Station to Clear Creek', 'Clear Creek to Federal-32nd'][index], allowSkip: true, ...overrides });

describe('explainTripProblem: a gap', () => {
  const explained = explainTripProblem(input({ diagnosis: { ...base, kind: 'gap', earlier, later, boundary } as AnchorDiagnosis }))!;

  it('has a short chip, a headline, and one cause line naming the runtime jump', () => {
    expect(explained.chip).toBe("Can't keep 8:16");
    expect(explained.headline).toBe('No trip reaches Federal-32nd at 8:16.');
    expect(explained.cause).toBe('AM Peak (from 8:00) adds 1:00 from Westminster Station to Clear Creek and adds 2:00 from Clear Creek to Federal-32nd, so no start time reaches Federal-32nd between 8:14 and 8:18.');
    expect(explained.openRuntimes).toBe(true);
  });

  it('lists actions with their cost, smallest change first and Skip last', () => {
    expect(explained.actions).toEqual([
      { id: 'keep:29640', label: 'Keep Federal-32nd at 8:14 instead', cost: '2 min earlier' },
      { id: 'keep:29880', label: 'Keep Federal-32nd at 8:18 instead', cost: '2 min later' },
      { id: 'keepStart', label: 'Keep the start time (7:48)', cost: 'Federal-32nd will change' },
      { id: 'skip', label: 'Skip this trip' },
    ]);
  });
});

describe('explainTripProblem: other kinds', () => {
  it('an overlap under segment-start offers the exact start times first', () => {
    const explained = explainTripProblem(input({ findings: [finding('trip.anchorAmbiguous')], diagnosis: { ...base, kind: 'overlap', earlier, later, boundary, exactDepartures: [28320, 28500] } as AnchorDiagnosis }))!;
    expect(explained.chip).toBe('Two start times fit');
    expect(explained.actions.slice(0, 2)).toEqual([{ id: 'start:28320', label: 'Start at 7:52', cost: 'Federal-32nd stays 8:16' }, { id: 'start:28500', label: 'Start at 7:55', cost: 'Federal-32nd stays 8:16' }]);
  });

  it('an overlap in a pattern change offers no start times, because the first-stop path cannot take one', () => {
    const explained = explainTripProblem(input({ mode: 'patternChange', findings: [finding('trip.anchorAmbiguous')], diagnosis: { ...base, kind: 'overlap', earlier, later, exactDepartures: [28320, 28500] } as AnchorDiagnosis }))!;
    expect(explained.actions.map((action) => action.id)).toEqual(['keep:29640', 'keep:29880', 'keepStart', 'skip']);
    expect(explained.actions[2].label).toBe("Keep the first stop's time");
    expect(explained.cause).toBeUndefined();
  });

  it('band choices become Start at actions for a one-period-per-trip profile', () => {
    const explained = explainTripProblem(input({ bandPickable: true, bandChoices: [{ bandId: 'am', bandLabel: 'AM Peak', departure: 28200, distanceSeconds: 600 }] }))!;
    expect(explained.actions[0]).toEqual({ id: 'band:am', label: 'Start at 7:50 (AM Peak)', cost: '10 min outside AM Peak' });
  });

  it('outside names the earliest arrival', () => {
    const explained = explainTripProblem(input({ diagnosis: { ...base, kind: 'outside', later } as AnchorDiagnosis }))!;
    expect(explained).toMatchObject({ chip: 'Outside time periods', cause: 'Earliest arrival at Federal-32nd: 8:18.' });
  });

  it('a missing runtime profile names the day and offers only what applies', () => {
    const explained = explainTripProblem(input({ findings: [finding('trip.targetRuntimeUnavailable')], keptAtStart: true, serviceDayName: 'Weekday' }))!;
    expect(explained).toMatchObject({ chip: 'No runtimes for this day', headline: 'No runtimes for Weekday.', openRuntimes: true });
    expect(explained.actions.map((action) => action.id)).toEqual(['skip']);
  });

  it('the single-trip dialog has no Skip', () => {
    const explained = explainTripProblem(input({ allowSkip: false, diagnosis: { ...base, kind: 'gap', earlier, later, boundary } as AnchorDiagnosis }))!;
    expect(explained.actions.some((action) => action.id === 'skip')).toBe(false);
  });

  it('a block warning is a warning with no actions, and no findings is nothing', () => {
    const overlap = { ...finding('trip.regenerationBlockOverlap', 'warning'), parameters: { blockLabel: '104', nextDeparture: 30000, precedingEnd: 30060, precedingTripSelected: 1 } };
    expect(explainTripProblem(input({ findings: [overlap] }))).toMatchObject({ chip: 'Runs into next trip', tone: 'warning', actions: [] });
    expect(explainTripProblem(input({ findings: [] }))).toBeUndefined();
  });

  it('shiftText reads as minutes', () => {
    expect([shiftText(-120), shiftText(90), shiftText(0)]).toEqual(['2 min earlier', '1:30 min later', 'no change']);
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
