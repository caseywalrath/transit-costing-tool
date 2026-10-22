// Test fixtures built on the Federal BRT project backup in output/federal-brt-import/. Tests only; nothing here is imported by the app.
import type { ProjectSnapshot } from '../domain/types';
import goldenText from '../../output/federal-brt-import/federal-brt-project-backup.json?raw';

/** Parsed raw JSON of the golden backup. Returns a fresh copy on every call, so a test can mutate it. */
export const goldenRaw = (): any => JSON.parse(goldenText);
export const goldenJson = (): string => goldenText;

/** The backup's records as the running app stores them (normalized Blocks carry no `tripProfileId`), without passing through import. */
export const asSnapshot = (backup: any): ProjectSnapshot => ({ ...backup, generationSets: backup.generationSets ?? [] });

const STAMP = '2026-10-22T00:00:00.000Z';

/**
 * Golden backup plus a second Trip Profile ("Alt", listed after "Default") that holds copies of the Weekday Trips, and a second
 * Blocking Scenario ("Alt Blocks") on that profile that holds copies of the Weekday Blocks. This is the shape a planner produces
 * with Copy Trip Profile followed by a new Blocking Scenario.
 */
export function goldenWithAltBlocking(): any {
  const backup = goldenRaw();
  const scenarioId = backup.scenarios[0].id;
  const weekday = backup.serviceDays.find((day: any) => day.kind === 'weekday').id;
  const alt = { id: 'alt-profile', scenarioId, name: 'Alt', createdAt: STAMP, updatedAt: STAMP };
  backup.tripProfiles.push(alt);
  backup.trips.push(...backup.trips.filter((trip: any) => trip.serviceDayId === weekday).map((trip: any) => ({ ...trip, id: `alt-${trip.id}`, tripProfileId: alt.id })));
  const altBlocking = { id: 'alt-blocking', scenarioId, tripProfileId: alt.id, name: 'Alt Blocks', createdAt: STAMP, updatedAt: STAMP };
  backup.blockingScenarios.push(altBlocking);
  backup.blocks.push(...backup.blocks.filter((block: any) => block.serviceDayId === weekday).map((block: any) => ({
    ...block,
    id: `alt-${block.id}`,
    blockingScenarioId: altBlocking.id,
    activities: block.activities.map((activity: any) => ({ ...activity, id: `alt-${activity.id}`, ...(activity.type === 'revenueTrip' ? { tripId: `alt-${activity.tripId}` } : {}) })),
  })));
  return backup;
}

/** Golden backup plus one zero-minute deadhead between the first two Trips of the first multi-Trip Block. */
export function goldenWithDeadhead(): any {
  const backup = goldenRaw();
  const block = backup.blocks.find((candidate: any) => candidate.activities.filter((activity: any) => activity.type === 'revenueTrip').length >= 2);
  const ordered = [...block.activities].sort((left: any, right: any) => left.sequence - right.sequence);
  const revenue = ordered.filter((activity: any) => activity.type === 'revenueTrip');
  const tripPoints = (tripId: string) => {
    const trip = backup.trips.find((candidate: any) => candidate.id === tripId);
    return backup.patterns.find((pattern: any) => pattern.id === trip.patternId).points;
  };
  const deadhead = {
    id: 'golden-deadhead',
    type: 'deadhead',
    sequence: 0,
    minutesAfterPreviousTrip: 0,
    fromNodeId: tripPoints(revenue[0].tripId).at(-1).nodeId,
    toNodeId: tripPoints(revenue[1].tripId)[0].nodeId,
  };
  ordered.splice(ordered.indexOf(revenue[0]) + 1, 0, deadhead);
  block.activities = ordered.map((activity: any, sequence: number) => ({ ...activity, sequence }));
  return backup;
}
