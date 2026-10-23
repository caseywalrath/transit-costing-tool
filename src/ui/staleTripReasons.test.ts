import { describe, expect, it } from 'vitest';
import type { ValidationFinding } from '../domain/types';
import { staleTripNotice, staleTripNoticeText } from './staleTripReasons';

const finding = (entityId: string, messageKey: string): ValidationFinding => ({ ruleId: messageKey, severity: 'error', entityType: 'trip', entityId, messageKey });
const fallback = (item: ValidationFinding) => `Fallback for ${item.messageKey}.`;
const NO_BAND = 'No Runtime band covers its first departure. Add or extend a Runtime band.';

describe('staleTripNotice', () => {
  it('is empty when no shown Trip carries a finding', () => {
    expect(staleTripNotice([], new Set(['a']), fallback)).toBeUndefined();
    expect(staleTripNotice([finding('other', 'trip.anchorNoRuntime')], new Set(['a']), fallback)).toBeUndefined();
  });

  it('counts each Trip once and names a reason once however many Trips and findings share it', () => {
    const notice = staleTripNotice([finding('a', 'trip.anchorNoRuntime'), finding('b', 'runtime.noApplicableBand'), finding('a', 'runtime.noApplicableBand')], new Set(['a', 'b']), fallback);
    expect(notice).toEqual({ tripCount: 2, reasons: [NO_BAND] });
  });

  it('lists distinct reasons in the order they first appear and ignores Trips that are not shown', () => {
    const notice = staleTripNotice([finding('hidden', 'trip.pointCountMismatch'), finding('a', 'trip.pointCountMismatch'), finding('b', 'trip.anchorNoRuntime')], new Set(['a', 'b']), fallback);
    expect(notice).toEqual({ tripCount: 2, reasons: ['Fallback for trip.pointCountMismatch.', NO_BAND] });
  });

  it('words the notice for one Trip and for several', () => {
    expect(staleTripNoticeText({ tripCount: 1, reasons: [NO_BAND] })).toBe(`1 Trip cannot be recalculated. ${NO_BAND}`);
    expect(staleTripNoticeText({ tripCount: 3, reasons: ['One.', 'Two.'] })).toBe('3 Trips cannot be recalculated. One. Two.');
  });
});
