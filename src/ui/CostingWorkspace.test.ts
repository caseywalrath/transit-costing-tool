import { describe, expect, it } from 'vitest';
import type { ValidationFinding } from '../domain/types';
import { costingFindingMessage } from './CostingWorkspace';

const finding = (messageKey: string, entityId = 'x', parameters?: Record<string, string | number>): ValidationFinding => ({ ruleId: messageKey, severity: 'error', entityType: 'scenario', entityId, messageKey, ...(parameters ? { parameters } : {}) });
const everyKey = ['costing.annualServiceDaysExceed365', 'costing.annualServiceDaysInvalid', 'costing.duplicateServiceDay', 'costing.serviceDayScenarioMismatch', 'costing.blockingScenarioMismatch', 'costing.tripProfileMismatch', 'costing.duplicateTrip', 'costing.duplicateBlock', 'costing.tripSourceMismatch', 'costing.blockSourceMismatch', 'costing.adjustedRateInvalid', 'costing.calculationOverflow', 'costing.rateInvalid', 'costing.rateYearInvalid', 'costing.baseServiceYearInvalid', 'costing.rateYearAfterBaseServiceYear', 'costing.futureYearCountInvalid', 'costing.projectionYearOutOfRange', 'costing.annualEscalationInvalid'];

describe('costingFindingMessage', () => {
  it('says what is wrong and what to do for the 365-day total', () => {
    expect(costingFindingMessage(finding('costing.annualServiceDaysExceed365'))).toBe('Annual service days total more than 365. Correct the counts in the Service days table on the Route screen.');
  });

  it('names the service day that a finding identifies by id', () => {
    const names = (id: string) => ({ saturday: 'Saturday' } as Record<string, string>)[id];
    expect(costingFindingMessage(finding('costing.annualServiceDaysInvalid', 'saturday'), names)).toMatch(/^Saturday has an annual count/);
    expect(costingFindingMessage(finding('costing.tripSourceMismatch', 't1', { serviceDayId: 'saturday' }), names)).toMatch(/does not belong to Saturday/);
    expect(costingFindingMessage(finding('costing.annualServiceDaysInvalid', 'unknown'), names)).toMatch(/^a service day has an annual count/);
  });

  it('never shows a message key or an identifier, for every rule the estimate can report', () => {
    for (const key of everyKey) {
      const text = costingFindingMessage(finding(key, 'abc-123-id', { serviceDayId: 'abc-123-id' }));
      expect(text, key).not.toMatch(/costing\.|abc-123-id/);
      expect(text.length, key).toBeGreaterThan(20);
    }
  });

  it('falls back to a general next step for a rule it does not know', () => {
    expect(costingFindingMessage(finding('costing.somethingNew'))).toBe('Review this item and correct it before trying again.');
  });
});
