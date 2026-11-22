// One Trip from one feed trip, with its times taken from the Route's placements and its calculation source from the run-time profile
// of its pattern and service day (Decision 0089 items 31 and 40). Pure.

import { metadata, newId } from '../ids';
import { runtimeCalculationRevision, tripCalculationSource } from '../runtime';
import type { EntityId, RoutePattern, RuntimeProfile, Trip } from '../types';
import type { TripPlacement } from './routeFromFeed';
import { timesAtPatternPoints } from './runtimesFromFeed';
import type { FeedTrip } from './tripsOnDate';

export interface TripFromFeedInput {
  scenarioId: EntityId;
  tripProfileId: EntityId;
  /** The Route the trip belongs to (the Route's own ID, not the feed's route_id). */
  routeId: EntityId;
  serviceDayId: EntityId;
  feedTrip: FeedTrip;
  /** The trip's placement from routeFromFeed; its points follow the pattern's points in order. */
  placement: TripPlacement;
  pattern: RoutePattern;
  profile: RuntimeProfile;
  now: string;
}

/** A Trip made by the feed import. Its public label is the feed's trip_short_name, when it has one. */
export function tripFromFeed({
  scenarioId,
  tripProfileId,
  routeId,
  serviceDayId,
  feedTrip,
  placement,
  pattern,
  profile,
  now,
}: TripFromFeedInput): Trip {
  if (placement.patternId !== pattern.id || placement.points.length !== pattern.points.length) {
    throw new RangeError(`Placement of trip ${feedTrip.tripId} does not match pattern ${pattern.id}`);
  }
  const times = timesAtPatternPoints(placement.points);
  return {
    id: newId(),
    scenarioId,
    routeId,
    serviceDayId,
    patternId: pattern.id,
    tripProfileId,
    ...(feedTrip.shortName === undefined ? {} : { publicLabel: feedTrip.shortName }),
    stopTimes: pattern.points.map((point, index) => ({ patternPointId: point.id, sequence: point.sequence, time: times[index] })),
    provenance: {
      kind: 'generated',
      creationMethod: 'feed',
      manuallyChangedFields: [],
      runtimeProfileId: profile.id,
      runtimeCalculationRevision: runtimeCalculationRevision(profile),
      calculationSource: tripCalculationSource(profile),
    },
    ...metadata(now),
  };
}
