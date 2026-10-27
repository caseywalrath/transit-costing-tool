import { formatServiceTime } from '../../domain/time';
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
  'trip.csvPointSetInvalid': 'Each row must contain exactly the timepoints for its pattern.',
};

export function userMessage(finding: ValidationFinding) {
  if (finding.messageKey === 'trip.regenerationBlockOverlap') return `Block ${finding.parameters?.blockLabel ?? ''}:${finding.parameters?.precedingTripSelected ? `trip ends after the next departure at ${formatServiceTime(Number(finding.parameters.nextDeparture))}` : `trip departs before the preceding trip ends at ${formatServiceTime(Number(finding.parameters?.precedingEnd))}`}.`;
  return USER_FACING_VALIDATION_MESSAGES[finding.messageKey] ?? 'Review this item and correct it before trying again.';
}
