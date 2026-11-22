// Patterns of a direction: trips with the same timepoint stops share a pattern. The pattern's stops
// come from its most common variant (the full stop sequence of a trip). Other variants are merged into it.

import type { DirectionGroup } from '../directions';
import { commonHeadsign, compareTripsByOrigin } from './directionsFromFeed';
import type { FeedTrip } from './tripsOnDate';

/** Trips that share one exact sequence of stops. */
export interface VariantGroup {
  stopIds: string[];
  /** The trips of this variant, earliest first. */
  trips: FeedTrip[];
}

/** The variants of a set of trips, most common first. A tie goes to the variant of the earliest trip. */
export function variantsOf(trips: readonly FeedTrip[]): VariantGroup[] {
  const byKey = new Map<string, VariantGroup>();
  for (const trip of [...trips].sort(compareTripsByOrigin)) {
    const stopIds = trip.stopTimes.map((stop) => stop.stopId);
    const key = JSON.stringify(stopIds);
    const group = byKey.get(key) ?? { stopIds, trips: [] };
    group.trips.push(trip);
    byKey.set(key, group);
  }
  // Array.prototype.sort is stable, and the groups were created earliest trip first, so a tie keeps that order.
  return [...byKey.values()].sort((a, b) => b.trips.length - a.trips.length);
}

/** The most common variant of the trips, or undefined when there are none. */
export function commonVariant(trips: readonly FeedTrip[]): VariantGroup | undefined {
  return variantsOf(trips)[0];
}

/** Decision 0089 item 25: '{outbound|inbound}:{timepoint stop IDs joined by ">"}'. */
export function patternKeyOf(group: DirectionGroup, timepointIds: readonly string[]): string {
  return `${group}:${timepointIds.join('>')}`;
}

/** A pattern before its geometry, numbering or name are settled. */
export interface PatternDraft {
  key: string;
  group: DirectionGroup;
  timepointIds: string[];
  /** Earliest trip first. */
  trips: FeedTrip[];
}

/** One trip's grouping: its direction and the timepoint stop IDs it has under the rules in force. */
export interface TripTimepoints {
  trip: FeedTrip;
  group: DirectionGroup;
  timepointIds: string[];
}

/** Groups trips into patterns by key. Patterns come out in the order of their earliest trip. */
export function draftPatterns(assignments: readonly TripTimepoints[]): PatternDraft[] {
  const byKey = new Map<string, PatternDraft>();
  for (const { trip, group, timepointIds } of [...assignments].sort((a, b) => compareTripsByOrigin(a.trip, b.trip))) {
    const key = patternKeyOf(group, timepointIds);
    const draft = byKey.get(key) ?? { key, group, timepointIds, trips: [] };
    draft.trips.push(trip);
    byKey.set(key, draft);
  }
  return [...byKey.values()];
}

/** The trips of a pattern whose variant is not the pattern's most common one. Each is listed as a merged variant. */
export function mergedVariantTrips(trips: readonly FeedTrip[]): FeedTrip[] {
  const common = commonVariant(trips);
  if (!common) return [];
  const commonKey = JSON.stringify(common.stopIds);
  return trips.filter((trip) => JSON.stringify(trip.stopTimes.map((stop) => stop.stopId)) !== commonKey);
}

/**
 * Decision 0089 item 25. The most common non-blank headsign of the pattern's trips, or "{first timepoint} to {last timepoint}"
 * when there is none. The names are the Node names of the first and last timepoints.
 */
export function patternNameOf(trips: readonly FeedTrip[], firstName: string, lastName: string): string {
  return commonHeadsign(trips) ?? `${firstName} to ${lastName}`;
}

/** One pattern for the naming rule: its direction, the name it would have, the headsign it is named after, and its last timepoint's name. */
export interface NamingEntry {
  group: DirectionGroup;
  name: string;
  headsign: string | undefined;
  lastName: string;
}

/**
 * Sub-plan I8, section 18 (answer C). Patterns of one direction that share a headsign are named "{headsign} (to {last timepoint name})".
 * Only those patterns change; the other names are kept. The clash suffixes come after this, across the whole Route (uniquePatternNames).
 */
export function directionalPatternNames(entries: readonly NamingEntry[]): string[] {
  const shared = new Map<string, number>();
  for (const entry of entries) {
    if (entry.headsign === undefined) continue;
    const key = `${entry.group}|${entry.headsign}`;
    shared.set(key, (shared.get(key) ?? 0) + 1);
  }
  return entries.map((entry) => {
    if (entry.headsign === undefined || entry.name !== entry.headsign) return entry.name;
    if ((shared.get(`${entry.group}|${entry.headsign}`) ?? 0) < 2) return entry.name;
    return `${entry.headsign} (to ${entry.lastName})`;
  });
}

/**
 * Decision 0089 item 25. A repeated name gets " 2", " 3" and so on in the order the patterns are given. A suffix that would
 * clash with another name is skipped.
 */
export function uniquePatternNames(names: readonly string[]): string[] {
  const used = new Set(names);
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  return names.map((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      return name;
    }
    let number = (counts.get(name) ?? 1) + 1;
    while (used.has(`${name} ${number}`)) number += 1;
    counts.set(name, number);
    const unique = `${name} ${number}`;
    used.add(unique);
    seen.add(unique);
    return unique;
  });
}
