// Test fixture helpers built on the Federal BRT project backup in output/federal-brt-import/. They never write files.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GOLDEN_PATH = fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url));
export const goldenRaw = (): any => JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

/**
 * Golden backup plus a second Trip Profile ("Alt") holding copies of the Weekday Trips. Mirrors the ordinary shape a planner
 * produces with Copy Trip Profile.
 */
export function goldenWithAltProfile(): any {
  const backup = goldenRaw();
  const scenarioId = backup.scenarios[0].id;
  const weekday = backup.serviceDays.find((day: any) => day.kind === 'weekday').id;
  const stamp = '2026-10-22T00:00:00.000Z';
  const alt = { id: 'alt-profile', scenarioId, name: 'Alt', createdAt: stamp, updatedAt: stamp };
  backup.tripProfiles.push(alt);
  backup.trips.push(...backup.trips.filter((trip: any) => trip.serviceDayId === weekday).map((trip: any) => ({ ...trip, id: `alt-${trip.id}`, tripProfileId: alt.id })));
  return backup;
}
