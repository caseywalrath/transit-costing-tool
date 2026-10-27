// What the Trips and Runtime screens derive from their data (review package P15, issue I-074c, finding 4-014). The screen calls these
// instead of calculating, so the rules have one home and a test. Everything here is pure: no reads, no writes.
import { sortServiceDays } from '../domain/serviceDays';
import { createBlockingScenarioSourceSignature } from '../domain/blocking';
import { isUsablePattern, orderDirections, usableDirectionPatterns } from '../domain/directions';
import { parseRuntimeDuration, RuntimeDurationError } from '../domain/durations';
import { patternTotalMiles } from '../domain/patterns';
import { addRuntimeBand, describeTripBandShading, duplicateRuntimeBand, removeRuntimeBand, reverseRuntimeCandidates, routeRuntimeCalculationMethod, runtimeBandTotalSeconds, updateRuntimeBand, type BlendedSegment, type RuntimeCalculationMethod } from '../domain/runtime';
import { formatServiceTime, parseServiceTime } from '../domain/time';
import { formatNetShift, formatStagedShift, parseShiftSeconds } from '../domain/tripShift';
import { MAX_TRIPS_PER_GENERATION, calculateTimepointHeadways, duplicateDepartureKeys, roundServiceTimeToMinute, tripRunTimeSeconds, validateGenerateTripsRequest } from '../domain/trips';
import type { BlockingBlock, GenerateTripsRequest, RoutePattern, RuntimeBand, RuntimeProfile, ServiceSeconds, Trip } from '../domain/types';
import { removeSelectedTripsFromBlock } from './blockingService';

export {
  addRuntimeBand, createBlockingScenarioSourceSignature, duplicateRuntimeBand, formatNetShift, formatStagedShift, isUsablePattern, MAX_TRIPS_PER_GENERATION, orderDirections, parseShiftSeconds,
  patternTotalMiles, removeRuntimeBand, reverseRuntimeCandidates, roundServiceTimeToMinute, routeRuntimeCalculationMethod, runtimeBandTotalSeconds, sortServiceDays, tripRunTimeSeconds, updateRuntimeBand, usableDirectionPatterns,
};
export type { BlendedSegment, RuntimeCalculationMethod };

/** A layover, deadhead, or headway as the Trips table shows it: `H:MM`, with seconds when not whole minutes, and a leading minus when negative. */
export function formatTripConnectionDuration(seconds?: number) { return seconds === undefined || !Number.isInteger(seconds) ? '' : `${seconds < 0 ? '−' : ''}${formatServiceTime(Math.abs(seconds), seconds % 60 !== 0)}`; }

export interface TripRowView { runTimeSeconds?: number; duplicate: boolean; singleBand?: RuntimeBand; segments?: BlendedSegment[] }
export type TripHeadways = ReturnType<typeof calculateTimepointHeadways>;
export interface TripTableView { rows: Map<string, TripRowView>; headways: TripHeadways }
export interface TripTableViewInput {
  /** The saved Trips of the schedule, in table order. */
  savedTrips: Trip[];
  /** Trips of a staged Shift; each is shown in place of the saved Trip with the same id. */
  previewTrips?: Trip[];
  patterns: RoutePattern[];
  /** The Runtime profile assigned to each Pattern on the day. */
  runtimeProfiles: Map<string, RuntimeProfile | undefined>;
  changedRuntimeTripIds: Set<string>;
  showRuntimeBands: boolean;
  showHeadways: boolean;
}

/**
 * The run time, the duplicate-departure flag, and the band shading of every Trip row, and the headways of every column. Duplicates are
 * found from the saved Trips; run times, shading, and headways use the Trips as shown (a staged Shift's times in place of the saved ones).
 */
export function buildTripTableView(input: TripTableViewInput): TripTableView {
  const previewById = new Map((input.previewTrips ?? []).map((trip) => [trip.id, trip]));
  const shown = (trip: Trip) => previewById.get(trip.id) ?? trip;
  const duplicates = duplicateDepartureKeys(input.savedTrips);
  const rows = new Map<string, TripRowView>();
  for (const saved of input.savedTrips) {
    const trip = shown(saved);
    const pattern = input.patterns.find((item) => item.id === trip.patternId);
    const shading = input.showRuntimeBands ? describeTripBandShading(trip, pattern, input.runtimeProfiles.get(trip.patternId), input.changedRuntimeTripIds.has(trip.id)) : {};
    const runTimeSeconds = tripRunTimeSeconds(trip);
    rows.set(saved.id, { ...(runTimeSeconds === undefined ? {} : { runTimeSeconds }), duplicate: duplicates.has(`${saved.patternId}:${saved.stopTimes[0]?.time}`), ...shading });
  }
  return { rows, headways: input.showHeadways ? calculateTimepointHeadways(input.savedTrips.map(shown), input.patterns) : new Map() };
}

export interface BuildTripsFormValues { patternId: string; firstTrip: string; headway: string; tripCount: string; lastTrip: string }
export type BuildTripsFormResult =
  | { ok: true; request: GenerateTripsRequest }
  | { ok: false; reason: 'missingFields' | 'headwayNotPositive' | 'headwayFormat' | 'timeFormat' | 'lastBeforeFirst' }
  | { ok: false; reason: 'tripCountRange'; maximum: number };

/**
 * Turns what the planner typed into a Generate Trips request: times as `H:MM` (hours may pass 24), the headway in minutes or minutes and
 * seconds, and either a Last Trip or a Number of Trips (a count wins when both are filled in). The rules about the request itself are the
 * domain's (`validateGenerateTripsRequest`); a problem it reports that the form can name is returned as a reason, and anything else is
 * left for the Trip service to refuse when the request is sent.
 */
export function parseBuildTripsForm(values: BuildTripsFormValues, context: { scenarioId: string; routeId: string; serviceDayId: string; tripProfileId: string }): BuildTripsFormResult {
  const byCount = values.tripCount.trim() !== '';
  const byLastTrip = values.lastTrip.trim() !== '';
  if (!values.patternId || !values.firstTrip.trim() || !values.headway.trim() || (!byCount && !byLastTrip)) return { ok: false, reason: 'missingFields' };
  let headwaySeconds: number | undefined;
  try { headwaySeconds = parseRuntimeDuration(values.headway); } catch (error) { if (error instanceof RuntimeDurationError) return { ok: false, reason: 'headwayFormat' }; throw error; }
  if (!headwaySeconds || headwaySeconds <= 0) return { ok: false, reason: 'headwayNotPositive' };
  let firstTrip: ServiceSeconds;
  let lastTrip: ServiceSeconds | undefined;
  try {
    firstTrip = parseServiceTime(values.firstTrip);
    if (!byCount) lastTrip = parseServiceTime(values.lastTrip);
  } catch { return { ok: false, reason: 'timeFormat' }; }
  const base = { ...context, patternId: values.patternId, firstTrip, headwaySeconds };
  const request: GenerateTripsRequest = byCount ? { ...base, tripCount: Number(values.tripCount) } : { ...base, lastTrip: lastTrip! };
  const findings = validateGenerateTripsRequest(request);
  if (findings.some((finding) => finding.ruleId === 'tripGeneration.lastBeforeFirst')) return { ok: false, reason: 'lastBeforeFirst' };
  if (byCount && findings.some((finding) => finding.field === 'tripCount')) return { ok: false, reason: 'tripCountRange', maximum: MAX_TRIPS_PER_GENERATION };
  return { ok: true, request };
}

/** Which Build Trips entries cannot be used as they stand, so the form can mark them once an error is showing. */
export function buildTripsFieldProblems(values: BuildTripsFormValues): { pattern: boolean; firstTrip: boolean; headway: boolean; tripCount: boolean; lastTrip: boolean } {
  const byCount = values.tripCount.trim() !== '';
  const byLastTrip = values.lastTrip.trim() !== '';
  const validTime = (value: string) => { try { parseServiceTime(value); return true; } catch { return false; } };
  const validHeadway = (value: string) => { try { const seconds = parseRuntimeDuration(value); return seconds !== undefined && seconds > 0; } catch { return false; } };
  const count = Number(values.tripCount);
  return {
    pattern: !values.patternId,
    firstTrip: !values.firstTrip.trim() || !validTime(values.firstTrip),
    headway: !validHeadway(values.headway),
    tripCount: byCount ? !Number.isInteger(count) || count < 1 || count > MAX_TRIPS_PER_GENERATION : !byLastTrip,
    lastTrip: byLastTrip ? !validTime(values.lastTrip) : !byCount,
  };
}

const deadheadCount = (block: BlockingBlock) => block.activities.filter((activity) => activity.type === 'deadhead').length;
/** The deadheads that leave `block` when the Trips in `tripIds` leave it: the ones next to them. The Blocking service removes exactly these. */
const deadheadsRemoved = (block: BlockingBlock, tripIds: Set<string>) => deadheadCount(block) - deadheadCount(removeSelectedTripsFromBlock(block, tripIds));

/** What assigning `tripIds` to `destinationBlockId` changes: Trips moved from another Block, newly assigned, or already there, and the deadheads removed from the Blocks they leave. */
export function tripBlockAssignmentImpact(tripIds: string[], destinationBlockId: string, blocks: BlockingBlock[], currentAssignments: Map<string, BlockingBlock>) {
  const assignedElsewhereCount = tripIds.filter((id) => currentAssignments.has(id) && currentAssignments.get(id)?.id !== destinationBlockId).length;
  const unassignedCount = tripIds.filter((id) => !currentAssignments.has(id)).length;
  const alreadyThereCount = tripIds.filter((id) => currentAssignments.get(id)?.id === destinationBlockId).length;
  const movedIds = new Set(tripIds.filter((id) => currentAssignments.get(id)?.id !== destinationBlockId));
  const removedDeadheads = blocks.filter((block) => block.id !== destinationBlockId).reduce((count, block) => count + deadheadsRemoved(block, movedIds), 0);
  return { assignedElsewhereCount, unassignedCount, alreadyThereCount, movedIds, deadheadCount: removedDeadheads };
}

/** What unassigning `tripIds` changes: the assigned Trips, the Blocks they leave, those already unassigned, and the deadheads removed. */
export function tripBlockUnassignmentImpact(tripIds: string[], blocks: BlockingBlock[], currentAssignments: Map<string, BlockingBlock>) {
  const assignedTripIds = tripIds.filter((id) => currentAssignments.has(id));
  const selected = new Set(assignedTripIds);
  const sourceBlockLabels = [...new Set(assignedTripIds.map((id) => currentAssignments.get(id)?.label).filter((label): label is string => Boolean(label)))];
  return { assignedTripIds, alreadyUnassignedCount: tripIds.length - assignedTripIds.length, sourceBlockLabels, deadheadCount: blocks.reduce((count, block) => count + deadheadsRemoved(block, selected), 0) };
}
