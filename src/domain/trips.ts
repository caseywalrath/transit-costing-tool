import type { Block, DurationSeconds, GenerateTripsRequest, RoutePattern, RuntimeBand, RuntimeProfile, ScheduledPoint, ServiceSeconds, Trip, TripGenerationSet, ValidationFinding } from './types';
import { metadata, newId, withUpdatedAt } from './ids';
import { propagatePatternTimes, propagatePatternTimesWithBand, resolveSegmentStartBand, selectRuntimeBand } from './runtime';

export class TripGenerationError extends Error {
  constructor(readonly findings: ValidationFinding[]) { super(findings.map((item) => item.messageKey).join('; ') || 'Trip generation failed'); this.name = 'TripGenerationError'; }
}

export interface AnchorBandChoice { bandId: string; bandLabel: string; startTime: ServiceSeconds; endTime: ServiceSeconds; departure: ServiceSeconds; distanceSeconds: number; side?: 'before' | 'after' }

export class AnchorBandChoiceError extends TripGenerationError {
  constructor(readonly tripId: string, readonly choices: AnchorBandChoice[], finding: ValidationFinding) { super([finding]); this.name = 'AnchorBandChoiceError'; }
}

export interface GenerateTripsPreview {
  request: GenerateTripsRequest;
  trips: Trip[];
  warnings: ValidationFinding[];
}

/** Prevent an accidental bulk command from creating an impractically large schedule. */
export const MAX_TRIPS_PER_GENERATION = 500;

function requestFinding(request: GenerateTripsRequest, ruleId: string, messageKey: string, field?: string, parameters?: Record<string, string | number>): ValidationFinding {
  return { ruleId, severity: 'error', entityType: 'generateTrips', entityId: `${request.serviceDayId}:${request.patternId}`, ...(field ? { field } : {}), messageKey, ...(parameters ? { parameters } : {}) };
}

/** Validate the transient Generate Trips form without creating a persistence record. */
export function validateGenerateTripsRequest(request: GenerateTripsRequest): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!request.scenarioId.trim()) findings.push(requestFinding(request, 'tripGeneration.scenarioRequired', 'tripGeneration.scenarioRequired', 'scenarioId'));
  if (!request.routeId.trim()) findings.push(requestFinding(request, 'tripGeneration.routeRequired', 'tripGeneration.routeRequired', 'routeId'));
  if (!request.serviceDayId.trim()) findings.push(requestFinding(request, 'tripGeneration.serviceDayRequired', 'tripGeneration.serviceDayRequired', 'serviceDayId'));
  if (!request.patternId.trim()) findings.push(requestFinding(request, 'tripGeneration.patternRequired', 'tripGeneration.patternRequired', 'patternId'));
  if (!Number.isInteger(request.firstTrip) || request.firstTrip < 0) findings.push(requestFinding(request, 'tripGeneration.firstTripInvalid', 'tripGeneration.firstTripInvalid', 'firstTrip'));
  if (!Number.isInteger(request.headwaySeconds) || request.headwaySeconds <= 0) findings.push(requestFinding(request, 'tripGeneration.headwayInvalid', 'tripGeneration.headwayInvalid', 'headwaySeconds'));
  const lastTrip = request.lastTrip;
  const tripCount = request.tripCount;
  const hasLastTrip = lastTrip !== undefined;
  const hasTripCount = tripCount !== undefined;
  if (hasLastTrip === hasTripCount) findings.push(requestFinding(request, 'tripGeneration.limitRequired', 'tripGeneration.limitRequired'));
  if (lastTrip !== undefined && (!Number.isInteger(lastTrip) || lastTrip < 0)) findings.push(requestFinding(request, 'tripGeneration.lastTripInvalid', 'tripGeneration.lastTripInvalid', 'lastTrip'));
  if (tripCount !== undefined && (!Number.isInteger(tripCount) || tripCount < 1)) findings.push(requestFinding(request, 'tripGeneration.tripCountInvalid', 'tripGeneration.tripCountInvalid', 'tripCount'));
  if (tripCount !== undefined && Number.isInteger(tripCount) && tripCount > MAX_TRIPS_PER_GENERATION) findings.push(requestFinding(request, 'tripGeneration.tripCountTooLarge', 'tripGeneration.tripCountTooLarge', 'tripCount', { maximum: MAX_TRIPS_PER_GENERATION }));
  if (Number.isInteger(request.firstTrip) && Number.isInteger(lastTrip) && lastTrip !== undefined && lastTrip < request.firstTrip) findings.push(requestFinding(request, 'tripGeneration.lastBeforeFirst', 'tripGeneration.lastBeforeFirst', 'lastTrip'));
  // The same 500-Trip limit applies to Last Trip: count the departures from First Trip to Last Trip, Last Trip included when it is on the headway sequence.
  if (lastTrip !== undefined && Number.isInteger(lastTrip) && Number.isInteger(request.firstTrip) && request.firstTrip >= 0 && lastTrip >= request.firstTrip && Number.isInteger(request.headwaySeconds) && request.headwaySeconds > 0
    && Math.floor((lastTrip - request.firstTrip) / request.headwaySeconds) + 1 > MAX_TRIPS_PER_GENERATION) findings.push(requestFinding(request, 'tripGeneration.tripCountTooLarge', 'tripGeneration.tripCountTooLarge', 'lastTrip', { maximum: MAX_TRIPS_PER_GENERATION }));
  return findings;
}

export function generateRequestDepartures(request: GenerateTripsRequest): ServiceSeconds[] {
  const findings = validateGenerateTripsRequest(request);
  if (findings.length) throw new TripGenerationError(findings);
  const departures: ServiceSeconds[] = [];
  if (request.tripCount !== undefined) {
    for (let sequence = 0; sequence < request.tripCount; sequence += 1) departures.push(request.firstTrip + (sequence * request.headwaySeconds));
  } else {
    // A departure exactly at Last Trip is included.
    for (let departure = request.firstTrip; departure <= request.lastTrip!; departure += request.headwaySeconds) departures.push(departure);
  }
  return departures;
}

function authoritativeTrip(request: GenerateTripsRequest, pattern: RoutePattern, profile: RuntimeProfile, stopTimes: ScheduledPoint[], creationMethod: 'generated' | 'manual', id = newId(), now = new Date().toISOString(), sequence?: number): Trip {
  const revision = profile.calculationRevision ?? 0;
  return {
    id,
    scenarioId: request.scenarioId,
    routeId: request.routeId,
    serviceDayId: request.serviceDayId,
    patternId: pattern.id,
    tripProfileId: request.tripProfileId,
    stopTimes,
    provenance: {
      kind: creationMethod,
      creationMethod,
      ...(sequence === undefined ? {} : { generationSequence: sequence }),
      manuallyChangedFields: [],
      runtimeProfileId: profile.id,
      runtimeCalculationRevision: revision,
      calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision },
    },
    ...metadata(now),
  };
}

/** Generate an additive group of authoritative trips. No records are written here. */
export function generateAuthoritativeTrips(request: GenerateTripsRequest, pattern: RoutePattern, profile: RuntimeProfile, now = new Date().toISOString()): Trip[] {
  const departures = generateRequestDepartures(request);
  const findings: ValidationFinding[] = [];
  const trips: Trip[] = [];
  departures.forEach((departure, sequence) => {
    const propagated = propagatePatternTimes(pattern, departure, profile);
    if ('finding' in propagated) {
      findings.push({ ...propagated.finding, entityType: 'generateTrips', entityId: `${request.serviceDayId}:${request.patternId}`, field: 'firstTrip', parameters: { departure } });
    } else {
      trips.push(authoritativeTrip(request, pattern, profile, propagated.stopTimes, 'generated', newId(), now, sequence));
    }
  });
  if (findings.length) throw new TripGenerationError(findings);
  return trips;
}

/** Return elapsed time between a Trip's first and last scheduled points. */
export function tripRunTimeSeconds(trip: Trip): DurationSeconds | undefined {
  if (trip.stopTimes.length < 2) return undefined;
  const points = [...trip.stopTimes].sort((left, right) => left.sequence - right.sequence);
  const first = points[0].time;
  const last = points.at(-1)!.time;
  return Number.isInteger(first) && Number.isInteger(last) && last >= first ? last - first : undefined;
}

/** Display rounding of a clock time to the nearest minute, exactly 30 seconds rounded up (Decision 0033). */
export function roundServiceTimeToMinute(seconds: ServiceSeconds): ServiceSeconds {
  return Math.floor((seconds + 30) / 60) * 60;
}

/** The keys (`patternId:firstTime`) of every departure that more than one Trip makes. A Trip with no times is never one. */
export function duplicateDepartureKeys(trips: Trip[]): Set<string> {
  const counts = new Map<string, number>();
  for (const trip of trips) {
    const first = trip.stopTimes[0]?.time;
    if (first === undefined) continue;
    const key = `${trip.patternId}:${first}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

/** Find each Trip's chronological predecessor at every timetable column it serves. */
export function calculateTimepointHeadways(trips: Trip[], patterns: RoutePattern[]): Map<string, Map<string, { time: ServiceSeconds; previousTime?: ServiceSeconds }>> {
  const patternsById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const visits = new Map<string, { tripId: string; time: ServiceSeconds; order: number }[]>();
  trips.forEach((trip, order) => {
    const pattern = patternsById.get(trip.patternId);
    for (const point of pattern?.points ?? []) {
      if (!point.directionColumnId) continue;
      const time = trip.stopTimes.find((stop) => stop.patternPointId === point.id)?.time;
      if (time === undefined) continue;
      const columnVisits = visits.get(point.directionColumnId) ?? [];
      columnVisits.push({ tripId: trip.id, time, order });
      visits.set(point.directionColumnId, columnVisits);
    }
  });
  return new Map([...visits].map(([columnId, columnVisits]) => {
    columnVisits.sort((left, right) => left.time - right.time || left.order - right.order);
    return [columnId, new Map(columnVisits.map((visit, index) => [visit.tripId, {
      time: visit.time,
      ...(index > 0 ? { previousTime: columnVisits[index - 1].time } : {}),
    }]))];
  }));
}

/** Possible duplicates are warnings: additive generation never rejects them. */
export function findExactTripDuplicates(proposed: Trip[], existing: Trip[]): ValidationFinding[] {
  const existingKeys = new Set(existing.map((trip) => `${trip.serviceDayId}:${trip.patternId}:${trip.stopTimes[0]?.time ?? ''}`));
  const seen = new Set<string>();
  const warnings: ValidationFinding[] = [];
  for (const trip of proposed) {
    const key = `${trip.serviceDayId}:${trip.patternId}:${trip.stopTimes[0]?.time ?? ''}`;
    if (!existingKeys.has(key) && !seen.has(key)) { seen.add(key); continue; }
    warnings.push({ ruleId: 'trip.possibleExactDuplicate', severity: 'warning', entityType: 'trip', entityId: trip.id, field: 'stopTimes', messageKey: 'trip.possibleExactDuplicate', parameters: { patternId: trip.patternId, departure: trip.stopTimes[0]?.time ?? -1 } });
    seen.add(key);
  }
  return warnings;
}

/** Create one authoritative trip using the same propagation rules as generation. */
export function createAuthoritativeTrip(request: Omit<GenerateTripsRequest, 'headwaySeconds' | 'lastTrip' | 'tripCount'>, pattern: RoutePattern, profile: RuntimeProfile, now = new Date().toISOString()): Trip {
  const findings = validateGenerateTripsRequest({ ...request, headwaySeconds: 1, lastTrip: request.firstTrip });
  if (findings.length) throw new TripGenerationError(findings);
  const propagated = propagatePatternTimes(pattern, request.firstTrip, profile);
  if ('finding' in propagated) throw new TripGenerationError([{ ...propagated.finding, entityType: 'trip', entityId: `${request.serviceDayId}:${request.patternId}`, field: 'firstTrip' }]);
  return authoritativeTrip({ ...request, headwaySeconds: 1, lastTrip: request.firstTrip }, pattern, profile, propagated.stopTimes, 'manual', newId(), now);
}

export interface RecalculationImpact {
  tripIds: string[];
  manualTimeShiftTripIds: string[];
  manualPatternChangeTripIds: string[];
  blockIds: string[];
  requiresConfirmation: boolean;
}

export interface RecalculationPreview {
  trips: Trip[];
  impact: RecalculationImpact;
  connections: RecalculationConnection[];
  findings: ValidationFinding[];
  bandSelections?: RecalculationBandSelection[];
  anchorByTripId?: Record<string, string>;
  bandOverrideByTripId?: Record<string, string>;
  sourceSignature?: string;
}

export interface RecalculationConnection {
  tripId: string;
  blockId: string;
  blockLabel: string;
  nextTripId: string;
  currentGapSeconds: number;
  revisedGapSeconds: number;
  currentLayoverSeconds?: number;
  revisedLayoverSeconds?: number;
  nextDeparture: ServiceSeconds;
}

export function calculateRecalculationConnections(selectedTrips: Trip[], recalculatedTrips: Trip[], allTrips: Trip[], blocks: Block[], patterns: RoutePattern[]): { connections: RecalculationConnection[]; findings: ValidationFinding[] } {
  const selectedIds = new Set(selectedTrips.map((trip) => trip.id));
  const saved = new Map(allTrips.map((trip) => [trip.id, trip]));
  const revised = new Map(recalculatedTrips.map((trip) => [trip.id, trip]));
  const patternsById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const connections: RecalculationConnection[] = [];
  const findings: ValidationFinding[] = [];
  for (const block of blocks) {
    const activities = [...block.activities].sort((left, right) => left.sequence - right.sequence).filter((activity) => activity.type === 'revenueTrip');
    for (let index = 0; index < activities.length - 1; index += 1) {
      const previousId = activities[index].tripId;
      const nextId = activities[index + 1].tripId;
      if (!selectedIds.has(previousId) && !selectedIds.has(nextId)) continue;
      const previousSaved = saved.get(previousId);
      const nextSaved = saved.get(nextId);
      if (!previousSaved || !nextSaved) continue;
      const currentEnd = previousSaved.stopTimes.at(-1)?.time;
      const currentStart = nextSaved.stopTimes[0]?.time;
      const revisedEnd = (revised.get(previousId) ?? previousSaved).stopTimes.at(-1)?.time;
      const revisedStart = (revised.get(nextId) ?? nextSaved).stopTimes[0]?.time;
      if (currentEnd === undefined || currentStart === undefined || revisedEnd === undefined || revisedStart === undefined) continue;
      const currentGapSeconds = currentStart - currentEnd;
      const revisedGapSeconds = revisedStart - revisedEnd;
      const between = block.activities.filter((activity) => activity.sequence > activities[index].sequence && activity.sequence < activities[index + 1].sequence);
      const deadhead = between.find((activity) => activity.type === 'deadhead');
      const deadheadSeconds = deadhead ? deadhead.minutesAfterPreviousTrip !== undefined ? deadhead.minutesAfterPreviousTrip * 60 : deadhead.startTime !== undefined && deadhead.endTime !== undefined ? deadhead.endTime - deadhead.startTime : undefined : 0;
      const previousEndNode = patternsById.get(previousSaved.patternId)?.points.at(-1)?.nodeId;
      const nextStartNode = patternsById.get(nextSaved.patternId)?.points[0]?.nodeId;
      const layoverDefined = deadhead ? deadheadSeconds !== undefined : Boolean(previousEndNode && nextStartNode && previousEndNode === nextStartNode);
      if (selectedIds.has(previousId)) connections.push({ tripId: previousId, blockId: block.id, blockLabel: block.label, nextTripId: nextId, currentGapSeconds, revisedGapSeconds, ...(layoverDefined ? { currentLayoverSeconds: currentGapSeconds - (deadheadSeconds ?? 0), revisedLayoverSeconds: revisedGapSeconds - (deadheadSeconds ?? 0) } : {}), nextDeparture: revisedStart });
      if (currentGapSeconds >= 0 && revisedGapSeconds < 0) {
        const precedingTripSelected = selectedIds.has(previousId);
        findings.push({ ruleId: 'trip.regenerationBlockOverlap', severity: 'warning', entityType: 'trip', entityId: precedingTripSelected ? previousId : nextId, messageKey: 'trip.regenerationBlockOverlap', parameters: { blockLabel: block.label, nextDeparture: revisedStart, precedingEnd: revisedEnd, precedingTripSelected: precedingTripSelected ? 1 : 0 } });
      }
    }
  }
  return { connections, findings };
}

/** An anchored trip may use a nearby band once without storing a permanent band assignment. */
export interface RecalculationBandSelection {
  tripId: string;
  bandLabel: string;
  departure: ServiceSeconds;
  distanceSeconds: number;
  side?: 'before' | 'after';
  selection: 'automatic' | 'manual';
}

export const MAX_NEAREST_BAND_DISTANCE_SECONDS = 10 * 60;

export function calculateRecalculationImpact(trips: Trip[], blocks: Block[]): RecalculationImpact {
  const selected = new Set(trips.map((trip) => trip.id));
  const manualTimeShiftTripIds = trips.filter((trip) => trip.provenance.manuallyChangedFields.includes('times')).map((trip) => trip.id);
  const manualPatternChangeTripIds = trips.filter((trip) => trip.provenance.manuallyChangedFields.includes('patternId')).map((trip) => trip.id);
  const hasUnverifiedRuntimeSource = trips.some((trip) => {
    const runtimeProfileId = trip.provenance.calculationSource?.runtimeProfileId ?? trip.provenance.runtimeProfileId;
    const runtimeRevision = trip.provenance.calculationSource?.runtimeCalculationRevision ?? trip.provenance.runtimeCalculationRevision;
    return !runtimeProfileId || runtimeRevision === undefined;
  });
  const blockIds = blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && selected.has(activity.tripId))).map((block) => block.id);
  return { tripIds: trips.map((trip) => trip.id), manualTimeShiftTripIds, manualPatternChangeTripIds, blockIds, requiresConfirmation: hasUnverifiedRuntimeSource || manualTimeShiftTripIds.length > 0 || manualPatternChangeTripIds.length > 0 || blockIds.length > 0 };
}

/**
 * Segment-start and blended profiles resolve a later anchor by searching first departures. Two or more departures that give the
 * same anchor time are ambiguous: the recalculation is rejected and lists them (Decision 0031; user decision 3), as the single-band
 * method does, instead of silently choosing the one nearest the saved departure. Returns the only solution, or none.
 */
function singleAnchorSolution(trip: Trip, profile: RuntimeProfile, matches: { departure: number; stopTimes: ScheduledPoint[] }[]): { departure: number; stopTimes: ScheduledPoint[] } | undefined {
  const byDeparture = [...new Map(matches.map((match) => [match.departure, match])).values()].sort((left, right) => left.departure - right.departure);
  if (byDeparture.length > 1) {
    throw new AnchorBandChoiceError(trip.id, byDeparture.map((match): AnchorBandChoice => {
      const band = selectRuntimeBand(profile, match.departure)!;
      return { bandId: band.id, bandLabel: band.label, startTime: band.startTime, endTime: band.endTime, departure: match.departure, distanceSeconds: 0 };
    }), tripFinding(trip, 'trip.anchorAmbiguous', 'trip.anchorAmbiguous'));
  }
  return byDeparture[0];
}

export function recalculateTripWithAnchor(trip: Trip, pattern: RoutePattern, profile: RuntimeProfile, now = new Date().toISOString(), anchorPointId?: string, chosenBandId?: string): { trip: Trip; bandSelection?: RecalculationBandSelection } {
  const departure = trip.stopTimes[0]?.time;
  if (departure === undefined) throw new TripGenerationError([tripFinding(trip, 'trip.departureMissing', 'trip.departureMissing')]);
  const anchorIndex = anchorPointId === undefined ? 0 : pattern.points.findIndex((point) => point.id === anchorPointId);
  if (anchorIndex < 0) throw new TripGenerationError([tripFinding(trip, 'trip.anchorMissing', 'trip.anchorMissing')]);
  const anchorTime = trip.stopTimes.find((point) => point.patternPointId === pattern.points[anchorIndex].id)?.time;
  if (anchorTime === undefined) throw new TripGenerationError([tripFinding(trip, 'trip.anchorTimeMissing', 'trip.anchorTimeMissing')]);
  if (profile.calculationMethod === 'segmentStart') {
    if (chosenBandId) throw new TripGenerationError([tripFinding(trip, 'trip.anchorBandChoiceInvalid', 'trip.anchorBandChoiceInvalid')]);
    let departures = new Set([anchorTime]);
    for (let index = anchorIndex - 1; index >= 0; index -= 1) {
      const earlier = new Set<number>();
      for (const arrival of departures) for (const band of profile.bands) {
        const duration = band.segmentRuntimeSeconds[index];
        if (!Number.isInteger(duration) || duration < 0) continue;
        const candidate = arrival - duration;
        if (candidate >= 0 && resolveSegmentStartBand(profile, candidate)?.id === band.id) earlier.add(candidate);
      }
      departures = earlier;
    }
    const matches = [...departures].filter((candidate) => selectRuntimeBand(profile, candidate)).flatMap((candidate) => {
      const result = propagatePatternTimes(pattern, candidate, profile);
      return 'finding' in result || result.stopTimes[anchorIndex]?.time !== anchorTime ? [] : [{ departure: candidate, stopTimes: result.stopTimes }];
    });
    const chosen = singleAnchorSolution(trip, profile, matches);
    if (!chosen) throw new TripGenerationError([tripFinding(trip, 'trip.anchorNoRuntime', 'trip.anchorNoRuntime')]);
    const revision = profile.calculationRevision ?? 0;
    return { trip: withUpdatedAt({ ...trip, patternId: pattern.id, stopTimes: chosen.stopTimes, provenance: { ...trip.provenance, runtimeProfileId: profile.id, runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision }, manuallyChangedFields: [], manualTimeShiftSeconds: undefined } }, now) };
  }
  if (profile.calculationMethod === 'blendSegments') {
    if (chosenBandId) throw new TripGenerationError([tripFinding(trip, 'trip.anchorBandChoiceInvalid', 'trip.anchorBandChoiceInvalid')]);
    const matches: { departure: number; stopTimes: ScheduledPoint[] }[] = [];
    for (const band of profile.bands) {
      let low = Math.max(0, band.startTime);
      let high = Math.min(anchorTime, band.endTime - 1);
      while (low <= high) {
        const candidate = Math.floor((low + high) / 2);
        const result = propagatePatternTimes(pattern, candidate, profile);
        if ('finding' in result) break;
        const actual = result.stopTimes[anchorIndex].time;
        if (actual < anchorTime) low = candidate + 1;
        else high = candidate - 1;
        if (actual === anchorTime) { matches.push({ departure: candidate, stopTimes: result.stopTimes }); break; }
      }
    }
    const chosen = singleAnchorSolution(trip, profile, matches);
    if (!chosen) throw new TripGenerationError([tripFinding(trip, 'trip.anchorNoRuntime', 'trip.anchorNoRuntime')]);
    const revision = profile.calculationRevision ?? 0;
    return { trip: withUpdatedAt({ ...trip, patternId: pattern.id, stopTimes: chosen.stopTimes, provenance: { ...trip.provenance, runtimeProfileId: profile.id, runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision }, manuallyChangedFields: [], manualTimeShiftSeconds: undefined } }, now) };
  }
  const candidates = anchorIndex === 0 ? [] : profile.bands.filter((band) => band.segmentRuntimeSeconds.length === pattern.points.length - 1).map((band) => {
    const first = anchorTime - band.segmentRuntimeSeconds.slice(0, anchorIndex).reduce((total, seconds) => total + seconds, 0);
    const distanceSeconds = first < band.startTime ? band.startTime - first : Math.max(0, first - band.endTime);
    return { band, first, distanceSeconds };
  }).filter(({ first }) => first >= 0);
  const exact = candidates.filter(({ band, first }) => selectRuntimeBand(profile, first)?.id === band.id);
  if (exact.length > 1 && !chosenBandId) throw new AnchorBandChoiceError(trip.id, exact.map((candidate): AnchorBandChoice => ({ bandId: candidate.band.id, bandLabel: candidate.band.label, startTime: candidate.band.startTime, endTime: candidate.band.endTime, departure: candidate.first, distanceSeconds: 0 })), tripFinding(trip, 'trip.anchorAmbiguous', 'trip.anchorAmbiguous'));
  if (exact.length > 1 && chosenBandId && !exact.some((candidate) => candidate.band.id === chosenBandId)) throw new TripGenerationError([tripFinding(trip, 'trip.anchorBandChoiceInvalid', 'trip.anchorBandChoiceInvalid')]);
  let chosen: { band: RuntimeBand; first: number; distanceSeconds: number } | undefined = exact.length > 1 ? exact.find((candidate) => candidate.band.id === chosenBandId) : exact[0];
  let bandSelection: RecalculationBandSelection | undefined = exact.length > 1 && chosen ? { tripId: trip.id, bandLabel: chosen.band.label, departure: chosen.first, distanceSeconds: 0, selection: 'manual' } : undefined;
  if (anchorIndex > 0 && !chosen) {
    const nearestDistance = Math.min(...candidates.map((candidate) => candidate.distanceSeconds));
    const nearest = candidates.filter((candidate) => candidate.distanceSeconds === nearestDistance);
    if (!nearest.length) throw new TripGenerationError([tripFinding(trip, 'trip.anchorNoRuntime', 'trip.anchorNoRuntime')]);
    const manualChoice = candidates.find((candidate) => candidate.band.id === chosenBandId);
    if (chosenBandId && !manualChoice) throw new TripGenerationError([tripFinding(trip, 'trip.anchorBandChoiceInvalid', 'trip.anchorBandChoiceInvalid')]);
    if (manualChoice) chosen = manualChoice;
    else if (nearestDistance <= MAX_NEAREST_BAND_DISTANCE_SECONDS && nearest.length === 1) chosen = nearest[0];
    else {
      const ruleId = nearest.length > 1 && nearestDistance <= MAX_NEAREST_BAND_DISTANCE_SECONDS ? 'trip.anchorNearestTie' : 'trip.anchorNoRuntime';
      throw new AnchorBandChoiceError(trip.id, candidates.map((candidate): AnchorBandChoice => ({ bandId: candidate.band.id, bandLabel: candidate.band.label, startTime: candidate.band.startTime, endTime: candidate.band.endTime, departure: candidate.first, distanceSeconds: candidate.distanceSeconds, side: candidate.first < candidate.band.startTime ? 'before' : 'after' })).sort((left, right) => left.distanceSeconds - right.distanceSeconds), tripFinding(trip, ruleId, ruleId));
    }
    bandSelection = { tripId: trip.id, bandLabel: chosen.band.label, departure: chosen.first, distanceSeconds: chosen.distanceSeconds, side: chosen.first < chosen.band.startTime ? 'before' : 'after', selection: manualChoice ? 'manual' : 'automatic' };
  }
  const propagated = bandSelection && chosen ? { stopTimes: propagatePatternTimesWithBand(pattern, chosen.first, chosen.band), band: chosen.band } : propagatePatternTimes(pattern, chosen?.first ?? departure, profile);
  if ('finding' in propagated) throw new TripGenerationError([{ ...propagated.finding, entityType: 'trip', entityId: trip.id }]);
  if (propagated.stopTimes[anchorIndex].time !== anchorTime) throw new TripGenerationError([tripFinding(trip, 'trip.anchorAmbiguous', 'trip.anchorAmbiguous')]);
  const revision = profile.calculationRevision ?? 0;
  return { trip: withUpdatedAt({ ...trip, patternId: pattern.id, stopTimes: propagated.stopTimes, provenance: { ...trip.provenance, runtimeProfileId: profile.id, runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision }, manuallyChangedFields: [], manualTimeShiftSeconds: undefined } }, now), bandSelection };
}

export function markTripRecalculated(trip: Trip, pattern: RoutePattern, profile: RuntimeProfile, now = new Date().toISOString(), anchorPointId?: string): Trip {
  return recalculateTripWithAnchor(trip, pattern, profile, now, anchorPointId).trip;
}

function generationFinding(set: TripGenerationSet, ruleId: string, messageKey: string, field?: string, parameters?: Record<string, string | number>): ValidationFinding {
  return { ruleId, severity: 'error', entityType: 'tripGenerationSet', entityId: set.id, ...(field ? { field } : {}), messageKey, ...(parameters ? { parameters } : {}) };
}
function tripFinding(trip: Trip, ruleId: string, messageKey: string, field?: string, parameters?: Record<string, string | number>): ValidationFinding {
  return { ruleId, severity: 'error', entityType: 'trip', entityId: trip.id, ...(field ? { field } : {}), messageKey, ...(parameters ? { parameters } : {}) };
}

export function validateTripGenerationSet(set: TripGenerationSet): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!set.name.trim()) findings.push(generationFinding(set, 'tripGeneration.nameRequired', 'tripGeneration.nameRequired', 'name'));
  if (!Number.isInteger(set.firstDeparture) || set.firstDeparture < 0) findings.push(generationFinding(set, 'tripGeneration.firstDepartureInvalid', 'tripGeneration.firstDepartureInvalid', 'firstDeparture'));
  if (!Number.isInteger(set.headwaySeconds) || set.headwaySeconds <= 0) findings.push(generationFinding(set, 'tripGeneration.headwayInvalid', 'tripGeneration.headwayInvalid', 'headwaySeconds'));
  if (set.limit.mode === 'tripCount') {
    if (!Number.isInteger(set.limit.tripCount) || set.limit.tripCount <= 0) findings.push(generationFinding(set, 'tripGeneration.tripCountInvalid', 'tripGeneration.tripCountInvalid', 'limit.tripCount'));
  } else if (!Number.isInteger(set.limit.endTime) || set.limit.endTime < 0) {
    findings.push(generationFinding(set, 'tripGeneration.endTimeInvalid', 'tripGeneration.endTimeInvalid', 'limit.endTime'));
  } else if (Number.isInteger(set.firstDeparture) && set.limit.endTime < set.firstDeparture) {
    findings.push(generationFinding(set, 'tripGeneration.endBeforeStart', 'tripGeneration.endBeforeStart', 'limit.endTime'));
  }
  if (!Number.isInteger(set.generationRevision) || set.generationRevision < 0) findings.push(generationFinding(set, 'tripGeneration.revisionInvalid', 'tripGeneration.revisionInvalid', 'generationRevision'));
  return findings;
}

export function generationDepartures(set: TripGenerationSet): ServiceSeconds[] {
  const findings = validateTripGenerationSet(set);
  if (findings.length) throw new TripGenerationError(findings);
  if (set.limit.mode === 'tripCount') return Array.from({ length: set.limit.tripCount }, (_, index) => set.firstDeparture + index * set.headwaySeconds);
  const departures: ServiceSeconds[] = [];
  for (let departure = set.firstDeparture; departure <= set.limit.endTime; departure += set.headwaySeconds) departures.push(departure);
  return departures;
}

function generatedTrip(set: TripGenerationSet, pattern: RoutePattern, profile: RuntimeProfile, sequence: number, stopTimes: ScheduledPoint[], id = newId(), now = new Date().toISOString()): Trip {
  const revision = profile.calculationRevision ?? 0;
  return { id, scenarioId: set.scenarioId, routeId: set.routeId, serviceDayId: set.serviceDayId, patternId: pattern.id, stopTimes, provenance: { kind: 'generated', creationMethod: 'generated', generationSetId: set.id, generationRevision: set.generationRevision, generationSequence: sequence, manuallyChangedFields: [], runtimeProfileId: profile.id, runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision } }, ...metadata(now) };
}

/** Generate historical or authoritative trips. Each departure independently selects its runtime band. */
export function generateTrips(request: GenerateTripsRequest, pattern: RoutePattern, profile: RuntimeProfile, now?: string): Trip[];
/** @deprecated Historical generation-set overload. */
export function generateTrips(set: TripGenerationSet, pattern: RoutePattern, profile: RuntimeProfile, now?: string): Trip[];
export function generateTrips(input: GenerateTripsRequest | TripGenerationSet, pattern: RoutePattern, profile: RuntimeProfile, now = new Date().toISOString()): Trip[] {
  if ('firstTrip' in input) return generateAuthoritativeTrips(input, pattern, profile, now);
  const set = input;
  const departures = generationDepartures(set);
  const findings: ValidationFinding[] = [];
  const trips: Trip[] = [];
  departures.forEach((departure, sequence) => {
    const propagated = propagatePatternTimes(pattern, departure, profile);
    if ('finding' in propagated) {
      findings.push({ ...propagated.finding, entityType: 'tripGenerationSet', entityId: set.id, field: 'firstDeparture', parameters: { departure } });
      return;
    }
    trips.push(generatedTrip(set, pattern, profile, sequence, propagated.stopTimes, newId(), now));
  });
  if (findings.length) throw new TripGenerationError(findings);
  return trips;
}

export function validateTrip(trip: Trip, pattern: RoutePattern): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (trip.patternId !== pattern.id) findings.push(tripFinding(trip, 'trip.patternMismatch', 'trip.patternMismatch', 'patternId'));
  if (trip.stopTimes.length !== pattern.points.length) findings.push(tripFinding(trip, 'trip.pointCountMismatch', 'trip.pointCountMismatch', 'stopTimes'));
  pattern.points.forEach((point, sequence) => {
    const scheduled = trip.stopTimes[sequence];
    if (!scheduled || scheduled.patternPointId !== point.id || scheduled.sequence !== sequence) findings.push(tripFinding(trip, 'trip.patternPointMismatch', 'trip.patternPointMismatch', 'stopTimes', { sequence }));
  });
  for (let index = 1; index < trip.stopTimes.length; index += 1) if (trip.stopTimes[index].time < trip.stopTimes[index - 1].time) findings.push(tripFinding(trip, 'trip.timesNotMonotonic', 'trip.timesNotMonotonic', 'stopTimes', { sequence: index }));
  // Decision 0002: schedule times are non-negative seconds from service-day midnight.
  trip.stopTimes.forEach((point, sequence) => { if (point.time < 0) findings.push(tripFinding(trip, 'trip.timeBeforeServiceDay', 'trip.timeBeforeServiceDay', 'stopTimes', { sequence })); });
  return findings;
}

function changedFields(provenance: Trip['provenance'], field: 'patternId' | 'times'): Trip['provenance'] {
  return { ...provenance, manuallyChangedFields: provenance.manuallyChangedFields.includes(field) ? provenance.manuallyChangedFields : [...provenance.manuallyChangedFields, field] };
}

export function shiftTrips(trips: Trip[], tripIds: string[], offsetSeconds: DurationSeconds, now = new Date().toISOString()): Trip[] {
  if (!Number.isInteger(offsetSeconds)) throw new Error('Trip shift must be an integer number of seconds');
  // A shift of zero changes no time, so it is not a manual edit: no flag, no new updatedAt.
  if (offsetSeconds === 0) return trips;
  const selected = new Set(tripIds);
  return trips.map((trip) => {
    if (!selected.has(trip.id)) return trip;
    const stopTimes = trip.stopTimes.map((point) => ({ ...point, time: point.time + offsetSeconds }));
    return withUpdatedAt({ ...trip, stopTimes, provenance: { ...changedFields(trip.provenance, 'times'), manualTimeShiftSeconds: (trip.provenance.manualTimeShiftSeconds ?? 0) + offsetSeconds } }, now);
  });
}

export interface PatternChangePreview { tripId: string; sourcePatternId: string; targetPatternId: string; oldStopTimes: ScheduledPoint[]; newStopTimes?: ScheduledPoint[]; finding?: ValidationFinding; /** Blocks referencing the trip require follow-up validation after a timing/pattern change. */ affectedBlockIds?: string[]; }
export function previewPatternChange(trip: Trip, targetPattern: RoutePattern, profile: RuntimeProfile): PatternChangePreview {
  const departure = trip.stopTimes[0]?.time;
  if (departure === undefined) return { tripId: trip.id, sourcePatternId: trip.patternId, targetPatternId: targetPattern.id, oldStopTimes: [...trip.stopTimes], finding: tripFinding(trip, 'trip.departureMissing', 'trip.departureMissing') };
  const propagated = propagatePatternTimes(targetPattern, departure, profile);
  if ('finding' in propagated) return { tripId: trip.id, sourcePatternId: trip.patternId, targetPatternId: targetPattern.id, oldStopTimes: [...trip.stopTimes], finding: { ...propagated.finding, entityType: 'trip', entityId: trip.id } };
  return { tripId: trip.id, sourcePatternId: trip.patternId, targetPatternId: targetPattern.id, oldStopTimes: [...trip.stopTimes], newStopTimes: propagated.stopTimes };
}
export function applyPatternChange(trip: Trip, targetPattern: RoutePattern, preview: PatternChangePreview, now = new Date().toISOString()): Trip {
  if (preview.tripId !== trip.id || preview.targetPatternId !== targetPattern.id) throw new Error('Pattern-change preview does not match the selected trip');
  if (preview.finding || !preview.newStopTimes) throw new TripGenerationError(preview.finding ? [preview.finding] : [tripFinding(trip, 'trip.patternChangeUnavailable', 'trip.patternChangeUnavailable')]);
  return withUpdatedAt({ ...trip, patternId: targetPattern.id, stopTimes: preview.newStopTimes.map((point) => ({ ...point })), provenance: changedFields(trip.provenance, 'patternId') }, now);
}

export interface BlockReferenceAdjustment { blockId: string; removedTripIds: string[]; survivingTripIds: string[]; }
export interface AdjustedBlocks { blocks: Block[]; adjustments: BlockReferenceAdjustment[]; }
export function adjustBlockReferences(blocks: Block[], removedTripIds: string[], survivingTripIds: string[] = [], now = new Date().toISOString()): AdjustedBlocks {
  const removed = new Set(removedTripIds); const surviving = new Set(survivingTripIds); const adjustments: BlockReferenceAdjustment[] = [];
  const adjusted = blocks.map((block) => {
    const referenced = block.activities.filter((activity) => activity.type === 'revenueTrip').map((activity) => activity.tripId);
    const removedHere = referenced.filter((tripId) => removed.has(tripId)); const survivingHere = referenced.filter((tripId) => surviving.has(tripId));
    // A block is affected only when a referenced activity is removed. Surviving
    // IDs are reported for that same block, but do not create a spurious update.
    if (!removedHere.length) return block;
    adjustments.push({ blockId: block.id, removedTripIds: [...new Set(removedHere)], survivingTripIds: [...new Set(survivingHere)] });
    const activities = block.activities.filter((activity, index, source) => {
      if (activity.type === 'revenueTrip') return !removed.has(activity.tripId);
      if (activity.type !== 'deadhead') return true;
      const previous = [...source.slice(0, index)].reverse().find((candidate) => candidate.type === 'revenueTrip');
      const next = source.slice(index + 1).find((candidate) => candidate.type === 'revenueTrip');
      return !(previous?.type === 'revenueTrip' && removed.has(previous.tripId)) && !(next?.type === 'revenueTrip' && removed.has(next.tripId));
    });
    return withUpdatedAt({ ...block, activities: activities.map((activity, sequence) => ({ ...activity, sequence })) }, now);
  });
  return { blocks: adjusted, adjustments };
}

/** Ensure a block never mixes Trips from different timetable profiles. Legacy
 * records may omit ownership until migration, so comparison is enforced when
 * both records carry a profile ID. */
export function assertTripProfileReferences(trips: Trip[], blocks: Block[]): void {
  const tripById = new Map(trips.map((trip) => [trip.id, trip]));
  for (const block of blocks) {
    for (const activity of block.activities) {
      if (activity.type !== 'revenueTrip') continue;
      const trip = tripById.get(activity.tripId);
      if (!trip) continue;
      if (block.scenarioId !== trip.scenarioId || block.serviceDayId !== trip.serviceDayId) throw new Error(`Block ${block.id} references a Trip from another service context.`);
      if (block.tripProfileId && trip.tripProfileId && block.tripProfileId !== trip.tripProfileId) throw new Error(`Block ${block.id} cannot reference a Trip from another Trip profile.`);
    }
  }
}

export interface RegenerationPreview {
  /** The authoritative generation input used for this preview. It is retained so an initial create can commit the set with its trips. */
  generationSet: TripGenerationSet;
  generationSetId: string; serviceDayId: string; generatedTrips: Trip[]; added: number[]; removed: string[]; changed: string[]; unchanged: string[];
  manualTimeShiftsOverwritten: string[]; manualPatternChangesOverwritten: string[]; affectedBlockIds: string[];
  removedBlockReferences: Array<{ blockId: string; tripId: string }>;
}
function sequenceOf(trip: Trip): number | undefined { return trip.provenance.generationSequence; }

export function previewRegeneration(set: TripGenerationSet, pattern: RoutePattern, profile: RuntimeProfile, existingTrips: Trip[], blocks: Block[] = []): RegenerationPreview {
  const generatedTrips = generateTrips(set, pattern, profile);
  const oldBySequence = new Map(existingTrips.filter((trip) => trip.provenance.generationSetId === set.id && sequenceOf(trip) !== undefined).map((trip) => [sequenceOf(trip)!, trip]));
  const newSequences = new Set(generatedTrips.map((trip) => sequenceOf(trip)!)); const removedTrips = [...oldBySequence.values()].filter((trip) => !newSequences.has(sequenceOf(trip)!));
  const added = generatedTrips.filter((trip) => !oldBySequence.has(sequenceOf(trip)!)).map((trip) => sequenceOf(trip)!); const changed: string[] = []; const unchanged: string[] = []; const manualTimeShiftsOverwritten: string[] = []; const manualPatternChangesOverwritten: string[] = [];
  for (const generated of generatedTrips) {
    const existing = oldBySequence.get(sequenceOf(generated)!); if (!existing) continue;
    const oldTimes = existing.stopTimes.map((point) => point.time); const newTimes = generated.stopTimes.map((point) => point.time);
    if (existing.patternId !== generated.patternId || oldTimes.some((time, index) => time !== newTimes[index])) changed.push(existing.id); else unchanged.push(existing.id);
    if (existing.provenance.manuallyChangedFields.includes('times')) manualTimeShiftsOverwritten.push(existing.id);
    if (existing.provenance.manuallyChangedFields.includes('patternId')) manualPatternChangesOverwritten.push(existing.id);
  }
  const removedIds = new Set(removedTrips.map((trip) => trip.id));
  const removedBlockReferences = blocks.flatMap((block) => block.activities.flatMap((activity) => activity.type === 'revenueTrip' && removedIds.has(activity.tripId) ? [{ blockId: block.id, tripId: activity.tripId }] : []));
  return { generationSet: set, generationSetId: set.id, serviceDayId: set.serviceDayId, generatedTrips, added, removed: removedTrips.map((trip) => trip.id), changed, unchanged, manualTimeShiftsOverwritten, manualPatternChangesOverwritten, affectedBlockIds: [...new Set(removedBlockReferences.map((item) => item.blockId))], removedBlockReferences };
}

export interface RegenerationResult { trips: Trip[]; blocks: Block[]; adjustments: BlockReferenceAdjustment[]; }
export function applyRegeneration(preview: RegenerationPreview, existingTrips: Trip[], blocks: Block[] = [], now = new Date().toISOString()): RegenerationResult {
  const oldBySequence = new Map(existingTrips.filter((trip) => trip.provenance.generationSetId === preview.generationSetId && sequenceOf(trip) !== undefined).map((trip) => [sequenceOf(trip)!, trip]));
  const materialized = preview.generatedTrips.map((trip) => { const existing = oldBySequence.get(sequenceOf(trip)!); return existing ? withUpdatedAt({ ...trip, id: existing.id }, now) : withUpdatedAt(trip, now); });
  const removedIds = new Set(preview.removed); const others = existingTrips.filter((trip) => trip.provenance.generationSetId !== preview.generationSetId && !removedIds.has(trip.id));
  const adjusted = adjustBlockReferences(blocks, preview.removed, materialized.map((trip) => trip.id), now);
  return { trips: [...others, ...materialized], blocks: adjusted.blocks, adjustments: adjusted.adjustments };
}
