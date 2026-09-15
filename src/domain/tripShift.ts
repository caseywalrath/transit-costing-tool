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
  constructor(readonly findings: ValidationFinding[]) { super('The Trip shift request is invalid.'); this.name = 'TripShiftValidationError'; }
}
