import type { Route, RouteOwnAnnualServiceDays, ServiceDayDefinition } from '../../domain/types';

/** What the Route's column of the Annual service days panel holds, with nothing typed yet (Decision 0089 item 41). */
export const NO_OWN_COUNTS: RouteOwnAnnualServiceDays = { enabled: false, countsByServiceDayId: {} };

export function ownCountsOf(route: Pick<Route, 'ownAnnualServiceDays'>): RouteOwnAnnualServiceDays {
  return route.ownAnnualServiceDays ?? NO_OWN_COUNTS;
}

/** The Route's own counts with one day set, or cleared when `count` is undefined so the day falls back to the Scenario's. */
export function withOwnCount(own: RouteOwnAnnualServiceDays, serviceDayId: string, count: number | undefined): RouteOwnAnnualServiceDays {
  const { [serviceDayId]: _removed, ...rest } = own.countsByServiceDayId;
  return { ...own, countsByServiceDayId: count === undefined ? rest : { ...rest, [serviceDayId]: count } };
}

/**
 * The total of the Route's column: its own count where one is typed, else the Scenario's, so a blank cell counts as the value it shows.
 * Only the days of the Scenario count; a stored entry for a day that no longer exists is ignored.
 */
export function ownCountsTotal(days: readonly ServiceDayDefinition[], own: RouteOwnAnnualServiceDays): number {
  return days.reduce((sum, day) => sum + (own.countsByServiceDayId[day.id] ?? day.annualServiceDays), 0);
}
