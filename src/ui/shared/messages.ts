import { formatServiceTime } from '../../domain/time';
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

/** A duration without a sign: "2 min", or "1:30 min" when it has seconds. */
function minutesText(seconds: number): string {
  const magnitude = Math.abs(seconds);
  return magnitude % 60 === 0 ? `${magnitude / 60} min` : `${Math.floor(magnitude / 60)}:${String(magnitude % 60).padStart(2, '0')} min`;
}

/** "2 min earlier" or "1 min later". */
export function shiftText(difference: number): string {
  return difference === 0 ? 'no change' : `${minutesText(difference)} ${difference < 0 ? 'earlier' : 'later'}`;
}

/**
 * One option of a review row's Action list (Decision 0072 item 8). Ids:
 * `run`, `keep:<seconds>` (keep the same stop at a nearby time), `keepStart`, `start:<seconds>` (a start time that reaches the kept time),
 * `band:<bandId>` (a time period for a profile with one period per trip), `skip`.
 */
export interface ProblemAction { id: string; label: string; cost?: string }

/**
 * Decision 0072 items 7 to 10, as cut on 2026-11-11 (user direction: only what the planner needs to decide). A chip, a headline, at most
 * one cause line, whether Open runtimes applies, and the Action options. The options carry their own cost, so the panel lists no fixes.
 */
export interface TripProblemExplanation {
  chip: string;
  tone: 'error' | 'warning';
  headline: string;
  cause?: string;
  openRuntimes: boolean;
  actions: ProblemAction[];
}

export interface TripProblemInput {
  mode: 'regenerate' | 'patternChange';
  findings: ValidationFinding[];
  diagnosis?: AnchorDiagnosis;
  /** The stop whose time is kept, and whether it is the trip's first stop. */
  keptStopName: string;
  keptAtStart: boolean;
  /** The trip's saved start time. */
  startTime?: number;
  bandChoices?: { bandId: string; bandLabel: string; departure: number; distanceSeconds: number }[];
  bandPickable?: boolean;
  /** "A to B" for a segment index of the pattern being calculated. */
  segmentName: (segmentIndex: number) => string;
  serviceDayName?: string;
  /** False in the single-trip dialog, where Cancel leaves the trip unchanged. */
  allowSkip: boolean;
}

const ANCHOR_RULE_IDS = new Set(['trip.anchorNoRuntime', 'trip.anchorAmbiguous', 'trip.anchorNearestTie']);
const RUNTIME_RULE_IDS = new Set(['trip.targetRuntimeUnavailable', 'runtime.noApplicableBand', 'runtime.segmentCountMismatch', 'runtime.noBands']);
const CHIP_BY_RULE: Record<string, string> = {
  'trip.targetRuntimeUnavailable': 'No runtimes for this day',
  'runtime.noApplicableBand': 'Outside time periods',
  'trip.anchorNodeNotServed': 'Stop not on new pattern',
  'trip.timeBeforeServiceDay': 'Starts before 0:00',
  'trip.patternDirectionMismatch': 'Other direction',
  'trip.departureMissing': 'No start time',
};

const mmss = (seconds: number) => `${Math.floor(Math.abs(seconds) / 60)}:${String(Math.abs(seconds) % 60).padStart(2, '0')}`;

/** "AM Peak (from 8:00) adds 1:00 from A to B and 2:00 from B to C", or undefined without a boundary. */
function jumpText(diagnosis: AnchorDiagnosis, segmentName: (segmentIndex: number) => string): string | undefined {
  const boundary = diagnosis.boundary;
  if (!boundary?.segmentChanges.length) return undefined;
  const parts = boundary.segmentChanges.map((change) => `${change.toSeconds > change.fromSeconds ? 'adds' : 'saves'} ${mmss(change.toSeconds - change.fromSeconds)} from ${segmentName(change.segmentIndex)}`);
  return `${boundary.toBand.label} (from ${clock(boundary.time)}) ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`}`;
}

/** Builds the chip, the Why panel, and the Action list for one review row from fixed templates. Returns undefined for a row without findings. */
export function explainTripProblem(input: TripProblemInput): TripProblemExplanation | undefined {
  const errors = input.findings.filter((finding) => finding.severity === 'error');
  const skip: ProblemAction[] = input.allowSkip ? [{ id: 'skip', label: 'Skip this trip' }] : [];
  const keepStartLabel = input.mode === 'regenerate' ? `Keep the start time${input.startTime === undefined ? '' : ` (${clock(input.startTime)})`}` : "Keep the first stop's time";
  const keepStart: ProblemAction[] = input.keptAtStart ? [] : [{ id: 'keepStart', label: keepStartLabel, cost: `${input.keptStopName} will change` }];
  if (!errors.length) {
    const warning = input.findings[0];
    if (!warning) return undefined;
    return { chip: warning.messageKey === 'trip.regenerationBlockOverlap' ? 'Runs into next trip' : 'Check this trip', tone: 'warning', headline: userMessage(warning), openRuntimes: false, actions: [] };
  }
  const finding = errors[0];
  const diagnosis = ANCHOR_RULE_IDS.has(finding.ruleId) ? input.diagnosis : undefined;
  const stop = input.keptStopName;
  if (diagnosis) {
    const kept = clock(diagnosis.anchorTime);
    const nearby = [diagnosis.earlier, diagnosis.later].filter((solution): solution is AnchorSolution => Boolean(solution)).sort((left, right) => Math.abs(left.differenceSeconds) - Math.abs(right.differenceSeconds));
    const keepActions: ProblemAction[] = nearby.map((solution) => ({ id: `keep:${solution.anchorTime}`, label: `Keep ${stop} at ${clock(solution.anchorTime)} instead`, cost: shiftText(solution.differenceSeconds) }));
    const jump = jumpText(diagnosis, input.segmentName);
    if (diagnosis.kind === 'gap') {
      const between = diagnosis.earlier && diagnosis.later ? `no start time reaches ${stop} between ${clock(diagnosis.earlier.anchorTime)} and ${clock(diagnosis.later.anchorTime)}` : undefined;
      const cause = jump && between ? `${jump}, so ${between}.` : between ? `${between[0].toUpperCase()}${between.slice(1)}.` : undefined;
      return { chip: `Can't keep ${kept}`, tone: 'error', headline: `No trip reaches ${stop} at ${kept}.`, ...(cause ? { cause } : {}), openRuntimes: Boolean(jump), actions: [...keepActions, ...keepStart, ...skip] };
    }
    if (diagnosis.kind === 'overlap') {
      const choices: ProblemAction[] = [];
      if (input.bandPickable && input.bandChoices?.length) for (const choice of input.bandChoices) choices.push({ id: `band:${choice.bandId}`, label: `Start at ${clock(choice.departure)} (${choice.bandLabel})`, cost: `${stop} stays ${kept}` });
      else if (input.mode === 'regenerate' && diagnosis.exactDepartures) for (const departure of diagnosis.exactDepartures) choices.push({ id: `start:${departure}`, label: `Start at ${clock(departure)}`, cost: `${stop} stays ${kept}` });
      return { chip: 'Two start times fit', tone: 'error', headline: `More than one start time reaches ${stop} at ${kept}.`, ...(jump ? { cause: `${jump}.` } : {}), openRuntimes: Boolean(jump), actions: [...choices, ...keepActions, ...keepStart, ...skip] };
    }
    const reach = diagnosis.later && !diagnosis.earlier ? `Earliest arrival at ${stop}: ${clock(diagnosis.later.anchorTime)}.` : diagnosis.earlier && !diagnosis.later ? `Latest arrival at ${stop}: ${clock(diagnosis.earlier.anchorTime)}.` : undefined;
    return { chip: 'Outside time periods', tone: 'error', headline: `${stop} at ${kept} is outside the time periods.`, ...(reach ? { cause: reach } : {}), openRuntimes: true, actions: [...keepActions, ...keepStart, ...skip] };
  }
  // A band choice without a diagnosis: one period per trip, and the kept time is too far from both periods.
  if (ANCHOR_RULE_IDS.has(finding.ruleId) && input.bandPickable && input.bandChoices?.length) {
    const actions = input.bandChoices.map((choice) => ({ id: `band:${choice.bandId}`, label: `Start at ${clock(choice.departure)} (${choice.bandLabel})`, cost: choice.distanceSeconds ? `${minutesText(choice.distanceSeconds)} outside ${choice.bandLabel}` : undefined }));
    return { chip: 'Choose a time period', tone: 'error', headline: 'Choose the time period for this trip.', openRuntimes: false, actions: [...actions, ...keepStart, ...skip] };
  }
  const runtimeProblem = RUNTIME_RULE_IDS.has(finding.ruleId);
  return {
    chip: CHIP_BY_RULE[finding.ruleId] ?? "Can't recalculate",
    tone: 'error',
    headline: finding.ruleId === 'trip.targetRuntimeUnavailable' && input.serviceDayName ? `No runtimes for ${input.serviceDayName}.` : userMessage(finding),
    openRuntimes: runtimeProblem,
    actions: [...keepStart, ...skip],
  };
}
