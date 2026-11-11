import { propagatePatternTimes, resolveSegmentStartBand, selectRuntimeBand } from './runtime';
import { recalculateTripWithAnchor, TripGenerationError } from './trips';
import type { DurationSeconds, RoutePattern, RuntimeBand, RuntimeProfile, ServiceSeconds, Trip } from './types';

/** Decision 0072. A reachable anchor time near the one that failed, and the first departure that reaches it. */
export interface AnchorSolution { anchorTime: ServiceSeconds; firstDeparture: ServiceSeconds; differenceSeconds: number }
export interface AnchorBoundary {
  time: ServiceSeconds;
  fromBand: { id: string; label: string };
  toBand: { id: string; label: string };
  /** Segments before the anchor whose runtime differs between the two bands, by segment index. */
  segmentChanges: { segmentIndex: number; fromSeconds: DurationSeconds; toSeconds: DurationSeconds }[];
}
export interface AnchorDiagnosis {
  anchorPointId: string;
  anchorTime: ServiceSeconds;
  /** gap: no departure reaches the time. overlap: more than one does. outside: the time lies before or after every reachable arrival. */
  kind: 'gap' | 'overlap' | 'outside';
  earlier?: AnchorSolution;
  later?: AnchorSolution;
  boundary?: AnchorBoundary;
  /** True when recalculating from the Trip's saved first departure gives a valid Trip. */
  firstDepartureWorks: boolean;
}

/** The scan never covers more than this many seconds of first departures. */
const MAX_SCAN_SECONDS = 6 * 3600;

function works(run: () => unknown): boolean {
  try { run(); return true; } catch (error) { if (error instanceof TripGenerationError) return false; throw error; }
}

/** The band each segment before the anchor uses for a departure, under the profile's method. */
function segmentBands(pattern: RoutePattern, profile: RuntimeProfile, departure: ServiceSeconds, stopTimes: { time: number }[], anchorIndex: number): (RuntimeBand | undefined)[] {
  return Array.from({ length: anchorIndex }, (_, index) => profile.calculationMethod === 'segmentStart' ? resolveSegmentStartBand(profile, stopTimes[index].time) : selectRuntimeBand(profile, departure));
}

/**
 * Explains why keeping the Trip's saved time at `anchorPointId` fails, and offers the nearest anchor times that a single first departure
 * reaches. Returns undefined when the anchor is the first point, the Trip has no time there, or the recalculation succeeds.
 *
 * Every integer first departure inside a runtime band, in a window around the anchor time less the shortest and longest runtimes to it, is
 * propagated once. An arrival reached by exactly one departure is a solution; `earlier` is the latest such arrival before the anchor time
 * and `later` the earliest after it. Requiring one departure means each solution can be applied without a further ambiguity.
 */
export function diagnoseAnchor(trip: Trip, pattern: RoutePattern, profile: RuntimeProfile, anchorPointId: string, now = new Date().toISOString()): AnchorDiagnosis | undefined {
  const anchorIndex = pattern.points.findIndex((point) => point.id === anchorPointId);
  if (anchorIndex <= 0) return undefined;
  const anchorTime = trip.stopTimes.find((point) => point.patternPointId === anchorPointId)?.time;
  if (anchorTime === undefined) return undefined;
  if (works(() => recalculateTripWithAnchor(trip, pattern, profile, now, anchorPointId))) return undefined;
  const firstDepartureWorks = trip.stopTimes[0] !== undefined && works(() => recalculateTripWithAnchor(trip, pattern, profile, now));

  let shortest = 0;
  let longest = 0;
  for (let index = 0; index < anchorIndex; index += 1) {
    const values = profile.bands.map((band) => band.segmentRuntimeSeconds[index]).filter((value): value is number => Number.isInteger(value) && value >= 0);
    if (!values.length) return { anchorPointId, anchorTime, kind: 'outside', firstDepartureWorks };
    shortest += Math.min(...values);
    longest += Math.max(...values);
  }
  const margin = longest - shortest + 600;
  const low = Math.max(0, anchorTime - longest - margin);
  const high = Math.min(anchorTime - shortest + margin, low + MAX_SCAN_SECONDS);

  const departuresByArrival = new Map<number, number[]>();
  for (let departure = low; departure <= high; departure += 1) {
    if (!selectRuntimeBand(profile, departure)) continue;
    const result = propagatePatternTimes(pattern, departure, profile);
    if ('finding' in result) continue;
    const arrival = result.stopTimes[anchorIndex]?.time;
    if (arrival === undefined) continue;
    const list = departuresByArrival.get(arrival);
    if (list) list.push(departure); else departuresByArrival.set(arrival, [departure]);
  }

  let earlier: AnchorSolution | undefined;
  let later: AnchorSolution | undefined;
  for (const [arrival, departures] of departuresByArrival) {
    if (departures.length !== 1) continue;
    const solution = { anchorTime: arrival, firstDeparture: departures[0], differenceSeconds: arrival - anchorTime };
    if (arrival < anchorTime && (!earlier || arrival > earlier.anchorTime)) earlier = solution;
    if (arrival > anchorTime && (!later || arrival < later.anchorTime)) later = solution;
  }
  const exactCount = departuresByArrival.get(anchorTime)?.length ?? 0;
  const kind: AnchorDiagnosis['kind'] = exactCount > 1 ? 'overlap' : earlier && later ? 'gap' : 'outside';

  let boundary: AnchorBoundary | undefined;
  if (earlier && later) {
    const times = (departure: number) => { const result = propagatePatternTimes(pattern, departure, profile); return 'finding' in result ? undefined : result.stopTimes; };
    const earlierTimes = times(earlier.firstDeparture);
    const laterTimes = times(later.firstDeparture);
    if (earlierTimes && laterTimes) {
      const fromBands = segmentBands(pattern, profile, earlier.firstDeparture, earlierTimes, anchorIndex);
      const toBands = segmentBands(pattern, profile, later.firstDeparture, laterTimes, anchorIndex);
      const differing = fromBands.findIndex((band, index) => band && toBands[index] && band.id !== toBands[index]!.id);
      if (differing >= 0) {
        const from = fromBands[differing]!;
        const to = toBands[differing]!;
        const segmentChanges = Array.from({ length: anchorIndex }, (_, segmentIndex) => ({ segmentIndex, fromSeconds: from.segmentRuntimeSeconds[segmentIndex], toSeconds: to.segmentRuntimeSeconds[segmentIndex] }))
          .filter((change) => change.fromSeconds !== change.toSeconds);
        boundary = { time: Math.max(from.startTime, to.startTime), fromBand: { id: from.id, label: from.label }, toBand: { id: to.id, label: to.label }, segmentChanges };
      }
    }
  }
  return { anchorPointId, anchorTime, kind, ...(earlier ? { earlier } : {}), ...(later ? { later } : {}), ...(boundary ? { boundary } : {}), firstDepartureWorks };
}
