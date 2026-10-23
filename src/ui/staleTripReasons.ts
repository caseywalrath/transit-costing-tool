import type { ValidationFinding } from '../domain/types';

/** Why the Trips marked "Run Times Have Changed" cannot be recalculated (U09). Built from the findings of `inspectStaleTrips`. */
export interface StaleTripNotice { tripCount: number; reasons: string[]; }

/** The stale-Trip check raises these two keys when no Runtime band covers a Trip's first departure; the anchor wording does not fit a status line. */
const NO_BAND = 'No Runtime band covers its first departure. Add or extend a Runtime band.';
const STALE_TRIP_REASONS: Record<string, string> = { 'trip.anchorNoRuntime': NO_BAND, 'runtime.noApplicableBand': NO_BAND };

/**
 * The distinct reasons, in the order they first appear, and the number of shown Trips that carry one. `describe` words every finding
 * that has no text of its own here. Undefined when no shown Trip is affected, so that nothing is displayed.
 */
export function staleTripNotice(findings: readonly ValidationFinding[], shownTripIds: ReadonlySet<string>, describe: (finding: ValidationFinding) => string): StaleTripNotice | undefined {
  const tripIds = new Set<string>();
  const reasons: string[] = [];
  for (const finding of findings) {
    if (finding.entityType !== 'trip' || !shownTripIds.has(finding.entityId)) continue;
    tripIds.add(finding.entityId);
    const reason = STALE_TRIP_REASONS[finding.messageKey] ?? describe(finding);
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  return tripIds.size ? { tripCount: tripIds.size, reasons } : undefined;
}

export function staleTripNoticeText(notice: StaleTripNotice): string {
  return `${notice.tripCount} ${notice.tripCount === 1 ? 'Trip cannot' : 'Trips cannot'} be recalculated. ${notice.reasons.join(' ')}`;
}
