import type { Block, BlockingBlock, BlockingScenario, DirectionTimepointColumn, Node, Route, RouteDirection, RoutePattern, RuntimeProfile, Trip, TripGenerationSet, TripProfile } from '../domain/types';
import type { BlockSummary, BlockingSummary } from '../domain/blocking';
import { formatServiceTime } from '../domain/time';
export function csvEscape(value: unknown): string { const s = String(value ?? ''); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }
export function toCsv(headers: string[], rows: Array<object>): string { return [headers, ...rows.map(r => { const record = r as Record<string, unknown>; return headers.map(h => csvEscape(record[h])); })] .map(row => row.join(',')).join('\r\n') + '\r\n'; }
export const routeCsv = (route: Route) => toCsv(['id', 'scenarioId', 'name', 'shortName', 'description'], [route]);
export const nodesCsv = (nodes: Node[]) => toCsv(['id', 'scenarioId', 'routeId', 'name', 'shortName', 'kind', 'notes'], nodes);
export const patternsCsv = (patterns: RoutePattern[]) => toCsv(['id', 'scenarioId', 'routeId', 'name', 'directionId', 'sequence', 'directionLabel', 'notes'], patterns);
export const patternPointsCsv = (patterns: RoutePattern[]) => toCsv(['patternId', 'pointId', 'nodeId', 'sequence', 'cumulativeMiles', 'directionColumnId'], patterns.flatMap(p => p.points.map(point => ({ patternId: p.id, pointId: point.id, nodeId: point.nodeId, sequence: point.sequence, cumulativeMiles: point.cumulativeMiles, directionColumnId: point.directionColumnId }))));
export const directionsCsv = (directions: RouteDirection[]) => toCsv(['id', 'scenarioId', 'routeId', 'name', 'sequence'], directions);
export const directionColumnsCsv = (directions: RouteDirection[]) => toCsv(['directionId', 'columnId', 'nodeId', 'sequence', 'labelOverride'], directions.flatMap((direction) => direction.columns.map((column: DirectionTimepointColumn) => ({ directionId: direction.id, columnId: column.id, nodeId: column.nodeId, sequence: column.sequence, labelOverride: column.labelOverride }))));
export const runtimeBandsCsv = (profiles: RuntimeProfile[]) => toCsv(['profileId', 'patternId', 'profileName', 'calculationRevision', 'bandId', 'label', 'sequence', 'startTime', 'endTime', 'segmentRuntimeSeconds'], profiles.flatMap(profile => profile.bands.map(band => ({ profileId: profile.id, patternId: profile.patternId, profileName: profile.name, calculationRevision: profile.calculationRevision ?? 0, bandId: band.id, label: band.label, sequence: band.sequence, startTime: formatServiceTime(band.startTime), endTime: formatServiceTime(band.endTime), segmentRuntimeSeconds: band.segmentRuntimeSeconds.join('|') }))));
/** @deprecated Historical pre-2R export retained for the old UI only. */
export const generationSetsCsv = (sets: TripGenerationSet[]) => toCsv(['id', 'scenarioId', 'routeId', 'serviceDayId', 'patternId', 'name', 'firstDeparture', 'headwaySeconds', 'limitMode', 'limitValue', 'generationRevision'], sets.map(set => ({ id: set.id, scenarioId: set.scenarioId, routeId: set.routeId, serviceDayId: set.serviceDayId, patternId: set.patternId, name: set.name, firstDeparture: formatServiceTime(set.firstDeparture), headwaySeconds: set.headwaySeconds, limitMode: set.limit.mode, limitValue: set.limit.mode === 'endTime' ? formatServiceTime(set.limit.endTime) : set.limit.tripCount, generationRevision: set.generationRevision })));
export const tripsCsv = (trips: Trip[], tripProfiles: TripProfile[] = []) => {
  const names = new Map(tripProfiles.map((profile) => [profile.id, profile.name]));
  return toCsv(
    ['id', 'scenarioId', 'routeId', 'serviceDayId', 'tripProfileId', 'tripProfileName', 'patternId', 'generationSetId', 'generationSequence', 'publicLabel', 'manualTimeShiftSeconds', 'manuallyChangedFields'],
    trips.map((trip) => ({
      id: trip.id, scenarioId: trip.scenarioId, routeId: trip.routeId, serviceDayId: trip.serviceDayId,
      tripProfileId: trip.tripProfileId, tripProfileName: trip.tripProfileId ? names.get(trip.tripProfileId) : undefined,
      patternId: trip.patternId, generationSetId: trip.provenance.generationSetId, generationSequence: trip.provenance.generationSequence,
      publicLabel: trip.publicLabel, manualTimeShiftSeconds: trip.provenance.manualTimeShiftSeconds,
      manuallyChangedFields: trip.provenance.manuallyChangedFields.join('|'),
    })),
  );
};
/** Authoritative trip report. It intentionally has no generation-set columns. */
export const authoritativeTripsCsv = (trips: Trip[], tripProfiles: TripProfile[] = []) => {
  const names = new Map(tripProfiles.map((profile) => [profile.id, profile.name]));
  const sorted = [...trips].sort((a, b) => (a.stopTimes[0]?.time ?? Number.MAX_SAFE_INTEGER) - (b.stopTimes[0]?.time ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  return toCsv(
    ['id', 'scenarioId', 'routeId', 'serviceDayId', 'tripProfileId', 'tripProfileName', 'patternId', 'creationMethod', 'runtimeProfileId', 'runtimeCalculationRevision', 'publicLabel', 'manualTimeShiftSeconds', 'manuallyChangedFields'],
    sorted.map((trip) => ({
      id: trip.id, scenarioId: trip.scenarioId, routeId: trip.routeId, serviceDayId: trip.serviceDayId,
      tripProfileId: trip.tripProfileId, tripProfileName: trip.tripProfileId ? names.get(trip.tripProfileId) : undefined,
      patternId: trip.patternId, creationMethod: trip.provenance.creationMethod ?? trip.provenance.kind,
      runtimeProfileId: trip.provenance.calculationSource?.runtimeProfileId ?? trip.provenance.runtimeProfileId,
      runtimeCalculationRevision: trip.provenance.calculationSource?.runtimeCalculationRevision ?? trip.provenance.runtimeCalculationRevision,
      publicLabel: trip.publicLabel, manualTimeShiftSeconds: trip.provenance.manualTimeShiftSeconds,
      manuallyChangedFields: trip.provenance.manuallyChangedFields.join('|'),
    })),
  );
};
export const scheduledPointsCsv = (trips: Trip[]) => toCsv(['tripId', 'patternPointId', 'sequence', 'time'], trips.flatMap(trip => trip.stopTimes.map(point => ({ tripId: trip.id, patternPointId: point.patternPointId, sequence: point.sequence, time: formatServiceTime(point.time) }))));
export const blocksCsv = (blocks: Block[], tripProfiles: TripProfile[] = []) => {
  const names = new Map(tripProfiles.map((profile) => [profile.id, profile.name]));
  return toCsv(
    ['id', 'scenarioId', 'tripProfileId', 'tripProfileName', 'serviceDayId', 'label', 'notes'],
    blocks.map((block) => ({ ...block, tripProfileName: block.tripProfileId ? names.get(block.tripProfileId) : undefined })),
  );
};
export const blockActivitiesCsv = (blocks: Block[]) => toCsv(
  ['blockId', 'activityId', 'type', 'sequence', 'tripId', 'startTime', 'endTime', 'minutesBeforeFirstTrip', 'minutesAfterPreviousTrip', 'minutesAfterLastTrip', 'fromNodeId', 'toNodeId', 'miles'],
  blocks.flatMap((block) => block.activities.map((activity) => ({
    blockId: block.id,
    activityId: activity.id,
    type: activity.type,
    sequence: activity.sequence,
    tripId: activity.type === 'revenueTrip' ? activity.tripId : undefined,
    startTime: 'startTime' in activity && typeof activity.startTime === 'number' ? formatServiceTime(activity.startTime) : undefined,
    endTime: 'endTime' in activity && typeof activity.endTime === 'number' ? formatServiceTime(activity.endTime) : undefined,
    minutesBeforeFirstTrip: activity.type === 'pullOut' ? activity.minutesBeforeFirstTrip : undefined,
    minutesAfterPreviousTrip: activity.type === 'deadhead' ? activity.minutesAfterPreviousTrip : undefined,
    minutesAfterLastTrip: activity.type === 'pullIn' ? activity.minutesAfterLastTrip : undefined,
    fromNodeId: 'fromNodeId' in activity ? activity.fromNodeId : undefined,
    toNodeId: 'toNodeId' in activity ? activity.toNodeId : undefined,
    miles: 'miles' in activity ? activity.miles : undefined,
  }))),
);

/** Phase 4 Blocking Scenario export. These serializers are report-only; CSV import is intentionally deferred. */
export const blockingScenariosCsv = (scenarios: BlockingScenario[], tripProfiles: TripProfile[] = []) => {
  const names = new Map(tripProfiles.map((profile) => [profile.id, profile.name]));
  return toCsv(['id', 'scenarioId', 'tripProfileId', 'tripProfileName', 'name', 'description'], scenarios.map((scenario) => ({ id: scenario.id, scenarioId: scenario.scenarioId, tripProfileId: scenario.tripProfileId, tripProfileName: names.get(scenario.tripProfileId), name: scenario.name, description: scenario.description })));
};

export const blockingBlocksCsv = (blocks: BlockingBlock[]) => toCsv(['id', 'scenarioId', 'blockingScenarioId', 'serviceDayId', 'label', 'notes'], [...blocks].sort((a, b) => a.serviceDayId.localeCompare(b.serviceDayId) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id)));

export const blockingActivitiesCsv = (blocks: BlockingBlock[]) => toCsv(
  ['blockingScenarioId', 'blockId', 'activityId', 'type', 'sequence', 'tripId', 'startTime', 'endTime', 'minutesBeforeFirstTrip', 'minutesAfterPreviousTrip', 'minutesAfterLastTrip', 'fromNodeId', 'toNodeId', 'miles'],
  [...blocks]
    .sort((a, b) => a.serviceDayId.localeCompare(b.serviceDayId) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
    .flatMap((block) => [...block.activities]
      .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))
      .map((activity) => ({
        blockingScenarioId: block.blockingScenarioId,
        blockId: block.id,
        activityId: activity.id,
        type: activity.type,
        sequence: activity.sequence,
        tripId: activity.type === 'revenueTrip' ? activity.tripId : undefined,
        startTime: 'startTime' in activity && typeof activity.startTime === 'number' ? formatServiceTime(activity.startTime) : undefined,
        endTime: 'endTime' in activity && typeof activity.endTime === 'number' ? formatServiceTime(activity.endTime) : undefined,
        minutesBeforeFirstTrip: activity.type === 'pullOut' ? activity.minutesBeforeFirstTrip : undefined,
        minutesAfterPreviousTrip: activity.type === 'deadhead' ? activity.minutesAfterPreviousTrip : undefined,
        minutesAfterLastTrip: activity.type === 'pullIn' ? activity.minutesAfterLastTrip : undefined,
        fromNodeId: 'fromNodeId' in activity ? activity.fromNodeId : undefined,
        toNodeId: 'toNodeId' in activity ? activity.toNodeId : undefined,
        miles: 'miles' in activity ? activity.miles : undefined,
      }))),
);

export const blockingSummariesCsv = (summaries: Array<BlockSummary | BlockingSummary>) => {
  const headers = ['id', 'kind', 'revenueHours', 'runningHours', 'platformHours', 'deadheadHours', 'layoverHours', 'revenueMiles', 'platformMiles', 'status', 'complete', 'valid', 'invalidBlockCount', 'incompleteBlockCount'];
  if (!summaries.length) return toCsv(headers, []);
  const rows: Array<Record<string, unknown>> = summaries.flatMap((summary) => 'blockId' in summary
    ? [{ id: summary.blockId, kind: 'block', revenueHours: summary.revenueHours, runningHours: summary.runningHours, platformHours: summary.platformHours, deadheadHours: summary.deadheadHours, layoverHours: summary.layoverHours, revenueMiles: summary.revenueMiles, platformMiles: summary.platformMiles, status: summary.status, complete: summary.complete, valid: summary.valid }]
    : [{ id: summary.blockingScenarioId, kind: 'blockingScenario', revenueHours: summary.revenueHours, runningHours: summary.runningHours, platformHours: summary.platformHours, deadheadHours: summary.deadheadHours, layoverHours: summary.layoverHours, revenueMiles: summary.revenueMiles, platformMiles: summary.platformMiles, status: summary.complete ? ('complete' as const) : ('incomplete' as const), complete: summary.complete, valid: summary.invalidBlockCount === 0, invalidBlockCount: summary.invalidBlockCount, incompleteBlockCount: summary.incompleteBlockCount }]);
  return toCsv(headers, rows);
};
