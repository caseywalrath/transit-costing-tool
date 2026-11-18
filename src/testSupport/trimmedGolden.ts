import { type PlannedFrequency, type ProjectSnapshot, type RouteStopSet } from '../domain/types';
import { asSnapshot, goldenWithAltBlocking } from './goldenBackup';

/**
 * The Federal BRT project with a second Trip Profile ("Alt") and a second Blocking Scenario on it, cut down to four Blocks
 * per Blocking Scenario with the Trips they use, plus the first few Trips of every day and profile. fake-indexeddb is a
 * pure-JavaScript store whose overwrites slow down sharply with row count, so the full 1,100-Trip project makes one
 * Scenario write take seconds. All the structure (Nodes, Patterns, Runtime profiles and assignments, Directions) is kept.
 */
export function trimmedGoldenFixture() {
  const backup = goldenWithAltBlocking();
  const scenarioId = backup.scenarios[0].id;
  const weekday = backup.serviceDays.find((day: any) => day.kind === 'weekday').id;
  const defaultBlockingId = backup.blockingScenarios.find((candidate: any) => candidate.name !== 'Alt Blocks').id;
  const sourceBlocks = backup.blocks.filter((block: any) => block.blockingScenarioId === defaultBlockingId && block.serviceDayId === weekday).slice(0, 4);
  const blocks = backup.blocks.filter((block: any) => sourceBlocks.some((source: any) => block.id === source.id || block.id === `alt-${source.id}`));
  const tripIds = new Set<string>(blocks.flatMap((block: any) => block.activities.filter((activity: any) => activity.type === 'revenueTrip').map((activity: any) => activity.tripId)));
  const perDay = new Map<string, number>();
  for (const trip of backup.trips) {
    const key = `${trip.tripProfileId}:${trip.serviceDayId}`;
    if ((perDay.get(key) ?? 0) < 5) { perDay.set(key, (perDay.get(key) ?? 0) + 1); tripIds.add(trip.id); }
  }
  const { format: _format, exportSchemaVersion: _version, exportedAt: _exportedAt, ...records } = backup;
  const base = asSnapshot({ ...records, trips: backup.trips.filter((trip: any) => tripIds.has(trip.id)), blocks });
  // One planned frequency (Decision 0058) on the first Route's Weekday, measured at a mid-route node of its first direction.
  const planRoute = base.routes[0];
  const planDirection = base.directions!.find((direction) => direction.routeId === planRoute.id)!;
  const plan: PlannedFrequency = {
    id: 'plan-weekday', scenarioId, routeId: planRoute.id, serviceDayId: weekday, createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z',
    periods: [{ id: 'plan-p1', startTime: 6 * 3600, endTime: 8 * 3600, headwaySeconds: 1800 }, { id: 'plan-p2', startTime: 8 * 3600, endTime: 19 * 3600, headwaySeconds: 900 }],
    measureNodeIdByDirectionId: { [planDirection.id]: planDirection.columns[1].nodeId },
  };
  // One Route stop set (Decision 0079) on the same Route: stop A on the first segment of the Route's first pattern.
  const planPattern = base.patterns.find((pattern) => pattern.routeId === planRoute.id)!;
  const planFirstPoint = [...planPattern.points].sort((left, right) => left.sequence - right.sequence)[0];
  const routeStopSet: RouteStopSet = {
    id: 'stop-set-plan', scenarioId, routeId: planRoute.id, roundingSeconds: 60,
    stops: [{ id: 'stop-a', name: 'Stop A', stopCode: 'A1' }],
    placementsByPatternId: { [planPattern.id]: [{ id: 'placement-a', stopId: 'stop-a', afterPatternPointId: planFirstPoint.id, sequence: 0, timing: 'interpolate' }] },
    createdAt: '2026-11-16T00:00:00.000Z', updatedAt: '2026-11-16T00:00:00.000Z',
  };
  const snapshot: ProjectSnapshot = { ...base, plannedFrequencies: [plan], routeStopSets: [routeStopSet] };
  const defaultProfile = snapshot.tripProfiles!.find((profile) => profile.name === 'Default')!;
  const altProfile = snapshot.tripProfiles!.find((profile) => profile.name === 'Alt')!;
  const trip = snapshot.trips.find((candidate) => candidate.tripProfileId === defaultProfile.id && candidate.serviceDayId === weekday)!;
  const assignment = snapshot.runtimeAssignments[0];
  return { snapshot, scenarioId, weekday, defaultProfile, altProfile, trip, assignment, plan, planDirection, routeStopSet, planPattern };
}
