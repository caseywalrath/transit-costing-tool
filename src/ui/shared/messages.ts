import { formatServiceTime } from '../../domain/time';
import { type Node, type Route, type Trip, type ValidationFinding } from '../../domain/types';

export function messages(findings: ValidationFinding[], entityId: string, field?: string) {
  return findings
    .filter((item) => item.entityId === entityId && (!field || item.field === field))
    .map((item) => userMessage(item));
}

export const USER_FACING_VALIDATION_MESSAGES: Record<string, string> = {
  'route.nameRequired': 'Enter a Route name.',
  'route.scenarioRequired': 'Select a Scenario for this Route.',
  'node.nameRequired': 'Enter a Node name.',
  'node.scenarioRequired': 'This Node is not assigned to the current Scenario.',
  'node.routeRequired': 'This Node is not assigned to the current Route.',
  'node.duplicateId': 'This Node has a duplicate identifier.',
  'node.referencedBeforeDelete': 'This Node is used by one or more Patterns. Remove it from those Patterns first.',
  'node.deleteLeavesPatternTooShort': 'Keep at least two points in every affected Pattern before deleting this Node.',
  'pattern.nameRequired': 'Enter a Pattern name.',
  'pattern.directionRequired': 'Choose a Direction.',
  'pattern.requiresTwoPoints': 'Add at least two points.',
  'pattern.duplicatePointId': 'Pattern points must be unique.',
  'pattern.sequenceNormalized': 'The point order was corrected. Check the order, then save again.',
  'pattern.missingNode': 'Select a valid Node for this point.',
  'pattern.invalidDistance': 'Enter a non-negative distance.',
  'pattern.firstDistanceNotZero': 'The first point distance must be 0.',
  'pattern.distanceDecreases': 'Distances must not decrease.',
  'block.missingTrip': 'This Block refers to a Trip that no longer exists. Remove that Trip from the Block.',
  'block.activityEndsBeforeStart': 'An activity ends before it starts. Check its times.',
  'block.overlap': 'Activities overlap in this Block. Move or remove one of them.',
  'runtime.profileNameRequired': 'Enter a Runtime profile name.',
  'runtime.noBands': 'Add at least one Runtime band.',
  'runtime.bandLabelRequired': 'Enter a band name.',
  'runtime.bandSequenceInvalid': 'Review the order of these time bands.',
  'runtime.bandBoundsInvalid': 'Enter an end time after the start time.',
  'runtime.segmentCountMismatch': 'Enter a runtime for every segment.',
  'runtime.segmentDurationInvalid': 'Enter a non-negative runtime for each segment.',
  'runtime.bandOverlap': 'Runtime bands cannot overlap.',
  'runtime.noApplicableBand': 'No runtime is defined for this time period. Add or extend a Runtime band.',
  'runtime.assignmentNotUnique': 'Only one Runtime profile can be assigned to this Pattern and service day.',
  'runtimeCopy.sameDay': 'Choose a different source day.',
  'runtimeCopy.sourceAssignmentUnresolved': 'The source day is missing a Runtime assignment for this Pattern.',
  'runtimeCopy.sourceDayRequired': 'Choose a source day.',
  'tripCopy.sameDay': 'Choose a different source day.',
  'tripCopy.emptySourceRequiresExplicitClear': 'Confirm that the target schedule should be cleared.',
  'tripCopy.sourceDayRequired': 'Choose a source day.',
  'batchPatternChange.tripsRequired': 'Select one or more Trips.',
  'batchPatternChange.patternRequired': 'Choose a target Pattern.',
  'tripGeneration.firstTripInvalid': 'Enter a valid first Trip time.',
  'tripGeneration.headwayInvalid': 'Enter a positive whole-minute headway.',
  'tripGeneration.tripCountInvalid': 'Enter at least one Trip.',
  'tripGeneration.tripCountTooLarge': 'Enter 500 Trips or fewer.',
  'tripGeneration.limitRequired': 'Enter either Last Trip or Number of Trips.',
  'tripGeneration.lastTripInvalid': 'Enter a valid last Trip time.',
  'tripGeneration.lastBeforeFirst': 'The last Trip must not be before the first Trip.',
  'trip.patternDirectionMismatch': 'Choose a Pattern in the selected Direction.',
  'trip.patternChangeUnavailable': 'This Trip cannot be recalculated with the selected Pattern.',
  'trip.departureMissing': 'This Trip does not have a valid first departure.',
  'trip.patternMismatch': 'This Trip no longer matches its selected Pattern.',
  'trip.pointCountMismatch': 'This Trip does not contain every required timepoint.',
  'trip.patternPointMismatch': 'This Trip has incompatible timepoints.',
  'trip.timesNotMonotonic': 'Trip times must not decrease.',
  'trip.csvDuplicateId': 'A Trip ID appears more than once in the CSV.',
  'trip.csvPatternInvalid': 'Choose a Pattern in the selected Route and Direction.',
  'trip.csvTripInvalid': 'A Trip ID does not belong to the selected schedule.',
  'trip.timeBeforeServiceDay': 'A Trip has a time before 0:00. Correct the Trip time.',
  'tripShift.timeBeforeServiceDay': 'A Shift would move a Trip before 0:00. Use a smaller Shift.',
  'trip.anchorNoRuntime': 'The fixed timepoint cannot be reached with the current runtimes. Choose another anchor or adjust the runtime bands.',
  'trip.anchorAmbiguous': 'The fixed timepoint can be reached from more than one first departure. Choose another anchor or adjust the runtime bands.',
  'trip.csvPointSetInvalid': 'Each row must contain exactly the timepoints for its Pattern.',
};

export function userMessage(finding: ValidationFinding) {
  if (finding.messageKey === 'trip.regenerationBlockOverlap') return `Block ${finding.parameters?.blockLabel ?? ''}: ${finding.parameters?.precedingTripSelected ? `trip ends after the next departure at ${formatServiceTime(Number(finding.parameters.nextDeparture))}` : `trip departs before the preceding trip ends at ${formatServiceTime(Number(finding.parameters?.precedingEnd))}`}.`;
  return USER_FACING_VALIDATION_MESSAGES[finding.messageKey] ?? 'Review this item and correct it before trying again.';
}
