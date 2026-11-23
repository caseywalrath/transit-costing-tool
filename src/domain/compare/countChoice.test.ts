import { describe, expect, it } from 'vitest';
import { ownOrScenarioCount } from '../costing';
import type { Route, ServiceDayDefinition } from '../types';
import { applyCountChoice, type CountSide } from './countChoice';
import { baselineSide, proposedSide, serviceDay } from './compareFixture';
import { matchRoutes } from './routeMatch';
import { matchServiceDays } from './serviceDayMatch';

const S = 'scn';

/** The example's two sides, with the pairs the count choice needs. */
function setup(overrides: { baselineRoutes?: Route[]; proposedRoutes?: Route[]; baselineDays?: ServiceDayDefinition[]; proposedDays?: ServiceDayDefinition[] } = {}) {
  const base = baselineSide();
  const prop = proposedSide();
  const baseline: CountSide = { serviceDays: overrides.baselineDays ?? base.serviceDays, routes: overrides.baselineRoutes ?? base.routes };
  const proposed: CountSide = { serviceDays: overrides.proposedDays ?? prop.serviceDays, routes: overrides.proposedRoutes ?? prop.routes };
  return { baseline, proposed, routePairs: matchRoutes(baseline.routes, proposed.routes).pairs, dayPairs: matchServiceDays(baseline.serviceDays, proposed.serviceDays) };
}

describe('applyCountChoice (Decision 0091 item 7)', () => {
  it('"each side\'s own" changes nothing, and returns copies, not the inputs', () => {
    const input = setup();
    const result = applyCountChoice('own', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    expect(result.proposed).toEqual(input.proposed);
    expect(result.proposed.serviceDays).not.toBe(input.proposed.serviceDays);
    expect(result.proposed.serviceDays[0]).not.toBe(input.proposed.serviceDays[0]);
  });

  it('never changes the inputs, whatever the choice', () => {
    const input = setup({ baselineRoutes: [{ ...baselineSide().routes[0], ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { 'b-wd': 240 } } }, ...baselineSide().routes.slice(1)] });
    const before = JSON.stringify(input);
    applyCountChoice('baseline', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    applyCountChoice('proposed', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('"Baseline\'s": the Proposed takes the Baseline annual count of each matched day, and keeps its unmatched day', () => {
    const extraDay = serviceDay(S, 'p-event', 'custom', 'Event', 7, 3);
    const input = setup({ proposedDays: [...proposedSide().serviceDays, extraDay] });
    const result = applyCountChoice('baseline', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    expect(result.proposed.serviceDays.find((day) => day.id === 'p-wd')?.annualServiceDays).toBe(251);
    expect(result.proposed.serviceDays.find((day) => day.id === 'p-sat')?.annualServiceDays).toBe(52);
    expect(result.proposed.serviceDays.find((day) => day.id === 'p-event')?.annualServiceDays).toBe(7);
    expect(result.baseline).toEqual(input.baseline);
  });

  it('"Proposed\'s": the Baseline takes the Proposed annual count of each matched day', () => {
    const input = setup({ proposedDays: [serviceDay(S, 'p-wd', 'weekday', 'Weekday', 240, 1), ...proposedSide().serviceDays.slice(1)] });
    const result = applyCountChoice('proposed', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    expect(result.baseline.serviceDays.find((day) => day.id === 'b-wd')?.annualServiceDays).toBe(240);
    expect(result.proposed).toEqual(input.proposed);
  });

  it('a Route with its own counts: the Baseline\'s switch and numbers replace the Proposed\'s, under the Proposed day IDs', () => {
    const baselineRoutes = [{ ...baselineSide().routes[0], ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { 'b-wd': 240 } } }, ...baselineSide().routes.slice(1)];
    const input = setup({ baselineRoutes });
    const result = applyCountChoice('baseline', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    const proposedR1 = result.proposed.routes.find((item) => item.id === 'p-r1');
    expect(proposedR1?.ownAnnualServiceDays).toEqual({ enabled: true, countsByServiceDayId: { 'p-wd': 240 } });
    const weekdayAfter = result.proposed.serviceDays.find((day) => day.id === 'p-wd');
    expect(ownOrScenarioCount(proposedR1, weekdayAfter!)).toEqual({ count: 240, source: 'route' });
  });

  it('the Baseline\'s own count switched off makes the Proposed Route use the Scenario count of the day (now the Baseline\'s)', () => {
    const baselineRoutes = [{ ...baselineSide().routes[0], ownAnnualServiceDays: { enabled: false, countsByServiceDayId: { 'b-wd': 200 } } }, ...baselineSide().routes.slice(1)];
    const proposedRoutes = [{ ...proposedSide().routes[0], ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { 'p-wd': 180 } } }, ...proposedSide().routes.slice(1)];
    const input = setup({ baselineRoutes, proposedRoutes });
    const result = applyCountChoice('baseline', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    const proposedR1 = result.proposed.routes.find((item) => item.id === 'p-r1')!;
    expect(proposedR1.ownAnnualServiceDays?.enabled).toBe(false);
    expect(ownOrScenarioCount(proposedR1, result.proposed.serviceDays.find((day) => day.id === 'p-wd')!).count).toBe(251);
  });

  it('the Proposed\'s Route with no own counts removes the Baseline\'s own counts when the Proposed is chosen', () => {
    const baselineRoutes = [{ ...baselineSide().routes[0], ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { 'b-wd': 240 } } }, ...baselineSide().routes.slice(1)];
    const input = setup({ baselineRoutes });
    const result = applyCountChoice('proposed', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    expect(result.baseline.routes.find((item) => item.id === 'b-r1')?.ownAnnualServiceDays).toBeUndefined();
  });

  it('a Route with no match keeps its own counts', () => {
    const proposedRoutes = [...proposedSide().routes.slice(0, 1), { ...proposedSide().routes[1], ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { 'p-wd': 30 } } }, ...proposedSide().routes.slice(2)];
    const input = setup({ proposedRoutes });
    const result = applyCountChoice('baseline', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    expect(result.proposed.routes.find((item) => item.id === 'p-r3')?.ownAnnualServiceDays).toEqual({ enabled: true, countsByServiceDayId: { 'p-wd': 30 } });
  });

  it('a Route keeps its own counts on days the other side does not have, and the matched days take the chosen side\'s', () => {
    const baselineRoutes = [{ ...baselineSide().routes[0], ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { 'b-wd': 240 } } }, ...baselineSide().routes.slice(1)];
    const proposedRoutes = [
      { ...proposedSide().routes[0], ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { 'p-wd': 180, 'p-sat': 40, 'p-event': 30 } } },
      ...proposedSide().routes.slice(1),
    ];
    const input = setup({ baselineRoutes, proposedRoutes, proposedDays: [...proposedSide().serviceDays, serviceDay(S, 'p-event', 'custom', 'Event', 7, 3)] });
    const result = applyCountChoice('baseline', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    // Weekday takes the Baseline's 240; Saturday (matched, no Baseline own count) is dropped; the Proposed-only Event day keeps 30.
    expect(result.proposed.routes.find((item) => item.id === 'p-r1')?.ownAnnualServiceDays).toEqual({ enabled: true, countsByServiceDayId: { 'p-wd': 240, 'p-event': 30 } });
    expect(input.proposed.routes[0].ownAnnualServiceDays?.countsByServiceDayId).toEqual({ 'p-wd': 180, 'p-sat': 40, 'p-event': 30 });
  });

  it('after the Baseline\'s choice, every matched Route-day has the same count as the Baseline\'s (the invariant Costing relies on)', () => {
    const baselineRoutes = [{ ...baselineSide().routes[0], ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { 'b-wd': 240 } } }, ...baselineSide().routes.slice(1)];
    const input = setup({ baselineRoutes });
    const result = applyCountChoice('baseline', input.baseline, input.proposed, input.routePairs, input.dayPairs);
    for (const pair of input.dayPairs) {
      if (!pair.baseline || !pair.proposed) continue;
      const proposedDay = result.proposed.serviceDays.find((day) => day.id === pair.proposed?.id)!;
      for (const routePair of input.routePairs) {
        if (!routePair.baseline || !routePair.proposed) continue;
        const baselineDay = input.baseline.serviceDays.find((day) => day.id === pair.baseline?.id)!;
        const proposedRoute = result.proposed.routes.find((item) => item.id === routePair.proposed?.id)!;
        expect(ownOrScenarioCount(proposedRoute, proposedDay).count).toBe(ownOrScenarioCount(routePair.baseline, baselineDay).count);
      }
    }
  });
});
