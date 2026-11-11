import { formatRuntimeDuration, formatServiceTime } from '../../domain/time';
import type { AnchorDiagnosis, AnchorSolution } from '../../domain/anchorDiagnosis';
import { type Node, type Route, type Trip, type ValidationFinding } from '../../domain/types';

export function messages(findings: ValidationFinding[], entityId: string, field?: string) {
  return findings
    .filter((item) => item.entityId === entityId && (!field || item.field === field))
    .map((item) => userMessage(item));
}

export const USER_FACING_VALIDATION_MESSAGES: Record<string, string> = {
  'route.nameRequired': 'Enter a route name.',
  'route.scenarioRequired': 'Select a scenario for this route.',
  'node.nameRequired': 'Enter a node name.',
  'node.scenarioRequired': 'This node is not assigned to the current scenario.',
  'node.routeRequired': 'This node is not assigned to the current route.',
  'node.duplicateId': 'This node has a duplicate identifier.',
  'node.referencedBeforeDelete': 'This node is used by one or more patterns. Remove it from those patterns first.',
  'node.deleteLeavesPatternTooShort': 'Keep at least two points in every affected pattern before deleting this node.',
  'pattern.nameRequired': 'Enter a pattern name.',
  'pattern.directionRequired': 'Choose a direction.',
  'pattern.requiresTwoPoints': 'Add at least two points.',
  'pattern.duplicatePointId': 'Pattern points must be unique.',
  'pattern.sequenceNormalized': 'The point order was corrected. Check the order, then save again.',
  'pattern.missingNode': 'Select a valid node for this point.',
  'pattern.invalidDistance': 'Enter a non-negative distance.',
  'pattern.firstDistanceNotZero': 'The first point distance must be 0.',
  'pattern.distanceDecreases': 'Distances must not decrease.',
  'block.missingTrip': 'This block refers to a trip that no longer exists. Remove that trip from the block.',
  'block.activityEndsBeforeStart': 'An activity ends before it starts. Check its times.',
  'block.overlap': 'Activities overlap in this block. Move or remove one of them.',
  'runtime.profileNameRequired': 'Enter a runtime profile name.',
  'runtime.noBands': 'Add at least one runtime band.',
  'runtime.bandLabelRequired': 'Enter a band name.',
  'runtime.bandSequenceInvalid': 'Review the order of these time bands.',
  'runtime.bandBoundsInvalid': 'Enter an end time after the start time.',
  'runtime.segmentCountMismatch': 'Enter a runtime for every segment.',
  'runtime.segmentDurationInvalid': 'Enter a non-negative runtime for each segment.',
  'runtime.bandOverlap': 'Runtime bands cannot overlap.',
  'runtime.noApplicableBand': 'No runtime is defined for this time period. Add or extend a runtime band.',
  'runtime.assignmentNotUnique': 'Only one runtime profile can be assigned to this pattern and service day.',
  'runtimeCopy.sameDay': 'Choose a different source day.',
  'runtimeCopy.sourceAssignmentUnresolved': 'The source day is missing a runtime assignment for this pattern.',
  'runtimeCopy.sourceDayRequired': 'Choose a source day.',
  'tripCopy.sameDay': 'Choose a different source day.',
  'tripCopy.emptySourceRequiresExplicitClear': 'Confirm that the target schedule should be cleared.',
  'tripCopy.sourceDayRequired': 'Choose a source day.',
  'batchPatternChange.tripsRequired': 'Select one or more trips.',
  'batchPatternChange.patternRequired': 'Choose a target pattern.',
  'tripGeneration.firstTripInvalid': 'Enter a valid first trip time.',
  'tripGeneration.headwayInvalid': 'Enter a positive whole-minute headway.',
  'tripGeneration.tripCountInvalid': 'Enter at least one trip.',
  'tripGeneration.tripCountTooLarge': 'Enter 500 trips or fewer.',
  'tripGeneration.limitRequired': 'Enter either the last trip or the number of trips.',
  'tripGeneration.lastTripInvalid': 'Enter a valid last trip time.',
  'tripGeneration.lastBeforeFirst': 'The last trip must not be before the first trip.',
  'tripGeneration.anchorNodeNotServed': 'The pattern does not stop at the measure stop.',
  'tripGeneration.slotsInvalid': 'The planned times must be whole seconds in increasing order.',
  'tripGeneration.slotsExclusive': 'Build either from a headway or from planned times, not both.',
  'trip.patternDirectionMismatch': 'Choose a pattern in the selected direction.',
  'trip.patternChangeUnavailable': 'This trip cannot be recalculated with the selected pattern.',
  'trip.departureMissing': 'This trip does not have a valid first departure.',
  'trip.patternMismatch': 'This trip no longer matches its selected pattern.',
  'trip.pointCountMismatch': 'This trip does not contain every required timepoint.',
  'trip.patternPointMismatch': 'This trip has incompatible timepoints.',
  'trip.timesNotMonotonic': 'Trip times must not decrease.',
  'trip.csvDuplicateId': 'A trip ID appears more than once in the CSV.',
  'trip.csvPatternInvalid': 'Choose a pattern in the selected route and direction.',
  'trip.csvTripInvalid': 'A trip ID does not belong to the selected schedule.',
  'trip.timeBeforeServiceDay': 'A trip has a time before 0:00. Correct the trip time.',
  'tripShift.timeBeforeServiceDay': 'A shift would move a trip before 0:00. Use a smaller shift.',
  'trip.anchorNoRuntime': 'The fixed timepoint cannot be reached with the current runtimes. Choose another anchor or adjust the runtime bands.',
  'trip.anchorAmbiguous': 'The fixed timepoint can be reached from more than one first departure. Choose another anchor or adjust the runtime bands.',
  'trip.anchorNodeNotServed': 'The anchor stop is not served by both patterns. Choose a stop that both patterns serve.',
  'trip.csvPointSetInvalid': 'Each row must contain exactly the timepoints for its pattern.',
  'trip.targetRuntimeUnavailable': 'The target pattern has no runtime profile for this service day. Assign one in Runtimes.',
  'trip.anchorNearestTie': 'Two runtime bands are equally close to the calculated departure. Choose a band or another anchor.',
  'trip.anchorBandChoiceInvalid': 'The chosen runtime band no longer applies. Review the trip again.',
  'trip.patternRouteMismatch': 'Choose a pattern on the same route.',
  'trip.anchorMissing': 'The anchor timepoint is not on this pattern. Choose another anchor.',
  'trip.anchorTimeMissing': 'This trip has no saved time at the anchor timepoint. Choose another anchor.',
};

export function userMessage(finding: ValidationFinding) {
  if (finding.messageKey === 'trip.regenerationBlockOverlap') return `Block ${finding.parameters?.blockLabel ?? ''}:${finding.parameters?.precedingTripSelected ? `trip ends after the next departure at ${formatServiceTime(Number(finding.parameters.nextDeparture))}` : `trip departs before the preceding trip ends at ${formatServiceTime(Number(finding.parameters?.precedingEnd))}`}.`;
  return USER_FACING_VALIDATION_MESSAGES[finding.messageKey] ?? 'Review this item and correct it before trying again.';
}

/** A clock time as the interface shows it: seconds appear only when they are not zero. */
function clock(value: number): string {
  return formatServiceTime(value, value % 60 !== 0);
}

/** A signed difference, shown as the Regenerate review shows it (`formatPreviewTimeChange` in `src/ui/trips/dialogs.tsx`). */
function signedClock(difference: number): string {
  const sign = difference > 0 ? '+' : difference < 0 ? '−' : '';
  // Minutes and seconds, as Decision 0072 shows ("−1:01", "+2:00"): a difference is a duration, not a clock time.
  const magnitude = Math.abs(difference);
  return `${sign}${Math.floor(magnitude / 60)}:${String(magnitude % 60).padStart(2, '0')}`;
}

function solutionText(solution: AnchorSolution): string {
  return `${clock(solution.anchorTime)} (${signedClock(solution.differenceSeconds)})`;
}

/**
 * One sentence that states why a failed anchor cannot be kept, and the nearest times that can (Decision 0072 item 3). `anchorName` names the
 * timepoint. `segmentLabel` is not used here; `describeAnchorSegmentChanges` uses it for the Details list.
 */
export function describeAnchorDiagnosis(diagnosis: AnchorDiagnosis, anchorName: string, segmentLabel: (segmentIndex: number) => string): string {
  void segmentLabel;
  const anchor = `Keeping ${anchorName} at ${clock(diagnosis.anchorTime)}`;
  const solutions = [diagnosis.earlier, diagnosis.later].filter((solution): solution is AnchorSolution => solution !== undefined);
  if (diagnosis.kind === 'gap' && diagnosis.boundary) {
    const nearest = solutions.length ? ` Nearest: ${solutions.map(solutionText).join(' or ')}.` : '';
    return `${anchor} is not possible: runtimes change at ${clock(diagnosis.boundary.time)} (${diagnosis.boundary.fromBand.label} to ${diagnosis.boundary.toBand.label}).${nearest}`;
  }
  if (diagnosis.kind === 'overlap') {
    const because = diagnosis.boundary ? ` because runtimes change at ${clock(diagnosis.boundary.time)}` : '';
    const nearest = solutions.length ? ` Nearest single solutions: ${solutions.map((solution) => clock(solution.anchorTime)).join(' or ')}.` : '';
    return `${anchor} is reached from more than one first departure${because}.${nearest}`;
  }
  return `${anchor} needs a first departure outside every runtime band.`;
}

/** The segments whose runtime changes across the band boundary, as `segment: from → to` lines for the Details list (Decision 0072 item 3). */
export function describeAnchorSegmentChanges(diagnosis: AnchorDiagnosis, segmentLabel: (segmentIndex: number) => string): string[] {
  return (diagnosis.boundary?.segmentChanges ?? []).map((change) => `${segmentLabel(change.segmentIndex)}: ${formatRuntimeDuration(change.fromSeconds)} → ${formatRuntimeDuration(change.toSeconds)}`);
}
