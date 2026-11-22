import { describe, expect, it } from 'vitest';
import type { ValidationFinding } from '../../domain/types';
import { costingFindingMessage, sortCostBasisOptions } from './CostingWorkspace';

describe('sortCostBasisOptions', () => {
  const option = (kind: 'blocked' | 'estimated', name: string) => ({ kind, id: kind + name, name, tripProfileId: 'p', tripProfileName: 'P' });
  it('keeps one kind, alphabetical, ignoring case and reading digits as numbers', () => {
    const options = [option('estimated', 'Weekend'), option('blocked', 'scenario 10'), option('blocked', 'Scenario 2'), option('blocked', 'Alpha'), option('estimated', 'Default')];
    expect(sortCostBasisOptions(options, 'blocked').map((item) => item.name)).toEqual(['Alpha', 'Scenario 2', 'scenario 10']);
    expect(sortCostBasisOptions(options, 'estimated').map((item) => item.name)).toEqual(['Default', 'Weekend']);
    expect(options).toHaveLength(5);
  });
});

const finding = (messageKey: string, entityId = 'x', parameters?: Record<string, string | number>): ValidationFinding => ({ ruleId: messageKey, severity: 'error', entityType: 'scenario', entityId, messageKey, ...(parameters ? { parameters } : {}) });
const everyKey = ['costing.annualServiceDaysExceed365', 'costing.annualServiceDaysInvalid', 'costing.duplicateServiceDay', 'costing.serviceDayScenarioMismatch', 'costing.blockingScenarioMismatch', 'costing.tripProfileMismatch', 'costing.duplicateTrip', 'costing.duplicateBlock', 'costing.tripSourceMismatch', 'costing.blockSourceMismatch', 'costing.adjustedRateInvalid', 'costing.calculationOverflow', 'costing.rateInvalid', 'costing.rateYearInvalid', 'costing.baseServiceYearInvalid', 'costing.rateYearAfterBaseServiceYear', 'costing.futureYearCountInvalid', 'costing.projectionYearOutOfRange', 'costing.annualEscalationInvalid', 'costing.routeCountsInUse', 'costing.unattributedUsesLargestCount', 'costing.routeAnnualServiceDaysInvalid'];

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

  it('names the routes on their own counts, the day an Unattributed block uses the largest count for, and the route with a bad count', () => {
    const days = (id: string) => ({ weekday: 'Weekday' } as Record<string, string>)[id];
    const routes = (id: string) => ({ r1: 'Route 31' } as Record<string, string>)[id];
    expect(costingFindingMessage(finding('costing.routeCountsInUse', 'scenario', { routes: 'Route 31; Route 0' }))).toMatch(/own annual service days.*Route 31; Route 0.*This route uses its own counts/);
    expect(costingFindingMessage(finding('costing.unattributedUsesLargestCount', 'weekday', { serviceDayId: 'weekday', annualServiceDays: 255 }), days)).toMatch(/^A block of Weekday .*largest count, 255 days/);
    expect(costingFindingMessage(finding('costing.routeAnnualServiceDaysInvalid', 'r1', { routeId: 'r1', serviceDayId: 'weekday' }), days, routes)).toMatch(/^Route 31 has an annual count for Weekday that is not a whole number/);
    expect(costingFindingMessage(finding('costing.routeAnnualServiceDaysInvalid', 'r1', { routeId: 'r1', total: 400 }), days, routes)).toMatch(/^Route 31 has its own annual service days totalling more than 365/);
    expect(costingFindingMessage(finding('costing.routeAnnualServiceDaysInvalid', 'zz', { routeId: 'zz', total: 400 }), days, routes)).toMatch(/^A route has/);
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
