import type { DurationSeconds, EntityId, Trip, ValidationFinding } from './types';
import { createCopySourceSignature, type CopySourceSignature } from './serviceDayCopy';
import { shiftTrips } from './trips';

export interface TripShiftRequest {
  scenarioId: EntityId;
  routeId: EntityId;
  serviceDayId: EntityId;
  directionId: EntityId;
  tripProfileId?: EntityId;
  tripIds: EntityId[];
  /** Signed whole seconds. Negative values move Trips earlier. */
  offsetSeconds: DurationSeconds;
}

export interface TripShiftPreview {
  request: TripShiftRequest;
  sourceSignature: CopySourceSignature;
  originalTrips: Trip[];
  shiftedTrips: Trip[];
  selectedTripIds: EntityId[];
  netOffsetSeconds: DurationSeconds;
  findings: ValidationFinding[];
}

function finding(entityId: string, ruleId: string, messageKey: string, field?: string): ValidationFinding {
  return { ruleId, severity: 'error', entityType: 'tripShift', entityId, ...(field ? { field } : {}), messageKey };
}

export function validateTripShiftRequest(request: TripShiftRequest): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!request.scenarioId.trim()) findings.push(finding('trip-shift', 'tripShift.scenarioRequired', 'tripShift.scenarioRequired', 'scenarioId'));
  if (!request.routeId.trim()) findings.push(finding('trip-shift', 'tripShift.routeRequired', 'tripShift.routeRequired', 'routeId'));
  if (!request.serviceDayId.trim()) findings.push(finding('trip-shift', 'tripShift.serviceDayRequired', 'tripShift.serviceDayRequired', 'serviceDayId'));
  if (!request.directionId.trim()) findings.push(finding('trip-shift', 'tripShift.directionRequired', 'tripShift.directionRequired', 'directionId'));
  if (request.tripProfileId !== undefined && !request.tripProfileId.trim()) findings.push(finding('trip-shift', 'tripShift.tripProfileInvalid', 'tripShift.tripProfileInvalid', 'tripProfileId'));
  if (!request.tripIds.length) findings.push(finding('trip-shift', 'tripShift.tripsRequired', 'tripShift.tripsRequired', 'tripIds'));
  if (new Set(request.tripIds).size !== request.tripIds.length) findings.push(finding('trip-shift', 'tripShift.duplicateTrips', 'tripShift.duplicateTrips', 'tripIds'));
  if (!Number.isInteger(request.offsetSeconds)) findings.push(finding('trip-shift', 'tripShift.offsetInvalid', 'tripShift.offsetInvalid', 'offsetSeconds'));
  return findings;
}

export function createTripShiftSourceSignature(request: TripShiftRequest, trips: Trip[]): CopySourceSignature {
  const { offsetSeconds: _offsetSeconds, tripIds, ...scope } = request;
  return createCopySourceSignature('trip-shift', {
    request: { ...scope, tripIds: [...tripIds].sort() },
    trips: [...trips].sort((left, right) => left.id.localeCompare(right.id)),
  });
}

/** Build a transient preview. This function does not mutate or persist Trips. */
export function buildTripShiftPreview(request: TripShiftRequest, trips: Trip[], now: string): TripShiftPreview {
  const findings = validateTripShiftRequest(request);
  if (findings.length) throw new TripShiftValidationError(findings);
  const selected = new Set(request.tripIds);
  const selectedTrips = trips.filter((trip) => selected.has(trip.id));
  if (selectedTrips.length !== request.tripIds.length) throw new TripShiftValidationError([finding('trip-shift', 'tripShift.tripUnavailable', 'tripShift.tripUnavailable', 'tripIds')]);
  const shiftedTrips = shiftTrips(selectedTrips, request.tripIds, request.offsetSeconds, now);
  // Decision 0002: no scheduled time may fall before service-day midnight. Refuse the Shift, naming each Trip it would break.
  const beforeServiceDay = shiftedTrips.filter((trip) => trip.stopTimes.some((point) => point.time < 0));
  if (beforeServiceDay.length) throw new TripShiftValidationError(beforeServiceDay.map((trip): ValidationFinding => ({ ruleId: 'tripShift.timeBeforeServiceDay', severity: 'error', entityType: 'trip', entityId: trip.id, field: 'stopTimes', messageKey: 'tripShift.timeBeforeServiceDay' })));
  return {
    request,
    sourceSignature: createTripShiftSourceSignature(request, selectedTrips),
    originalTrips: selectedTrips.map((trip) => ({ ...trip, stopTimes: trip.stopTimes.map((point) => ({ ...point })), provenance: { ...trip.provenance, manuallyChangedFields: [...trip.provenance.manuallyChangedFields], ...(trip.provenance.calculationSource ? { calculationSource: { ...trip.provenance.calculationSource } } : {}) } })),
    shiftedTrips,
    selectedTripIds: [...request.tripIds],
    netOffsetSeconds: request.offsetSeconds,
    findings,
  };
}

export class TripShiftValidationError extends Error {
  constructor(readonly findings: ValidationFinding[]) {
    super(findings.some((item) => item.ruleId === 'tripShift.timeBeforeServiceDay') ? 'A Shift would move a Trip before 0:00. Use a smaller Shift.' : 'The Trip shift request is invalid.');
    this.name = 'TripShiftValidationError';
  }
}

/** The Shift minutes a planner typed, as seconds: a whole number of minutes above zero, else undefined. */
export function parseShiftSeconds(text: string): DurationSeconds | undefined {
  const minutes = Number(text);
  return text.trim() !== '' && Number.isInteger(minutes) && minutes > 0 ? minutes * 60 : undefined;
}

const shiftSize = (offsetSeconds: number) => `${Math.abs(offsetSeconds / 60)} minute${Math.abs(offsetSeconds) === 60 ? '' : 's'} ${offsetSeconds < 0 ? 'earlier' : 'later'}`;

/** "No net shift", "1 minute later", "2 minutes earlier". */
export function formatNetShift(offsetSeconds: number): string {
  return offsetSeconds === 0 ? 'No net shift' : shiftSize(offsetSeconds);
}

/** The note on a Trip row that a staged Shift moves: "Staged 1 minute later". None when nothing is staged or the net Shift is zero. */
export function formatStagedShift(offsetSeconds: number | undefined): string | undefined {
  return offsetSeconds === undefined || offsetSeconds === 0 ? undefined : `Staged ${shiftSize(offsetSeconds)}`;
}
