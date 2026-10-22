// Phase 3 review helper (not a test). Builds variants of the Federal BRT golden
// backup used by the p3-*.golden.test.ts reproductions. It never writes files.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GOLDEN_PATH = fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url));
export const goldenText = () => readFileSync(GOLDEN_PATH, 'utf8');
export const goldenRaw = (): any => JSON.parse(goldenText());

/**
 * Golden backup plus a second Trip Profile ("Alt", listed after "Default") that
 * holds copies of the Weekday Trips, and a second Blocking Scenario ("Alt Blocks")
 * on that profile holding copies of the Weekday Blocks. The original "Workbook
 * Blocks" Blocking Scenario stays on "Default". This is the ordinary shape a
 * planner produces with Copy Trip Profile followed by a new Blocking Scenario.
 */
export function goldenWithAltProfile(): any {
  const b = goldenRaw();
  const scenarioId = b.scenarios[0].id;
  const weekday = b.serviceDays.find((d: any) => d.kind === 'weekday').id;
  const ts = '2026-10-22T00:00:00.000Z';
  const alt = { id: 'p3-alt-profile', scenarioId, name: 'Alt', createdAt: ts, updatedAt: ts };
  b.tripProfiles.push(alt);
  const altTrips = b.trips.filter((t: any) => t.serviceDayId === weekday).map((t: any) => ({ ...t, id: `alt-${t.id}`, tripProfileId: alt.id }));
  b.trips.push(...altTrips);
  const altBs = { id: 'p3-alt-blocking', scenarioId, tripProfileId: alt.id, name: 'Alt Blocks', createdAt: ts, updatedAt: ts };
  b.blockingScenarios.push(altBs);
  const altBlocks = b.blocks.filter((k: any) => k.serviceDayId === weekday).map((k: any) => ({
    ...k, id: `alt-${k.id}`, blockingScenarioId: altBs.id,
    activities: k.activities.map((a: any) => ({ ...a, id: `alt-${a.id}`, ...(a.type === 'revenueTrip' ? { tripId: `alt-${a.tripId}` } : {}) })),
  }));
  b.blocks.push(...altBlocks);
  return b;
}

/** Count records per collection of a snapshot-like object. */
export function counts(s: any): Record<string, number> {
  const keys = ['scenarios', 'serviceDays', 'routes', 'nodes', 'patterns', 'directions', 'runtimeProfiles', 'runtimeAssignments', 'tripProfiles', 'blockingScenarios', 'costingAssumptions', 'generationSets', 'trips', 'blocks'];
  return Object.fromEntries(keys.map((k) => [k, Array.isArray(s?.[k]) ? s[k].length : (s?.[k] ? 1 : 0)]));
}

/**
 * goldenWithAltProfile() plus the optional ID-bearing fields the golden file does
 * not exercise: Costing assumptions, a deadhead activity, Trip calculationSource
 * and legacy provenance.runtimeProfileId, a historical generation set referenced
 * by a Trip, and a Scenario sourceScenarioId.
 */
export function goldenAugmented(): any {
  const b = goldenWithAltProfile();
  const scenarioId = b.scenarios[0].id;
  const ts = b.exportedAt;
  b.costingAssumptions = [{ id: 'p3-costing', scenarioId, currencyCode: 'USD', enteredRate: 100, rateYear: 2025, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 0, annualEscalation: 0.03, createdAt: ts, updatedAt: ts }];
  const trip = b.trips.find((t: any) => t.tripProfileId !== 'p3-alt-profile');
  const profile = b.runtimeProfiles.find((p: any) => p.patternId === trip.patternId);
  trip.provenance = { ...trip.provenance, runtimeProfileId: profile.id, runtimeCalculationRevision: 0, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: 0 }, generationSetId: 'p3-genset' };
  b.generationSets = [{ id: 'p3-genset', scenarioId, routeId: trip.routeId, serviceDayId: trip.serviceDayId, patternId: trip.patternId, name: 'Historical', firstDeparture: 0, headwaySeconds: 600, limit: { mode: 'tripCount', tripCount: 1 }, generationRevision: 0, createdAt: ts, updatedAt: ts }];
  const block = b.blocks.find((k: any) => k.activities.filter((a: any) => a.type === 'revenueTrip').length >= 2);
  const ordered = [...block.activities].sort((x: any, y: any) => x.sequence - y.sequence);
  const revenue = ordered.filter((a: any) => a.type === 'revenueTrip');
  const endNode = (tripId: string) => { const t = b.trips.find((x: any) => x.id === tripId); return b.patterns.find((p: any) => p.id === t.patternId).points.at(-1).nodeId; };
  const startNode = (tripId: string) => { const t = b.trips.find((x: any) => x.id === tripId); return b.patterns.find((p: any) => p.id === t.patternId).points[0].nodeId; };
  const deadhead = { id: 'p3-deadhead', type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: 0, fromNodeId: endNode(revenue[0].tripId), toNodeId: startNode(revenue[1].tripId) };
  ordered.splice(ordered.indexOf(revenue[0]) + 1, 0, deadhead);
  block.activities = ordered.map((a: any, i: number) => ({ ...a, sequence: i }));
  return b;
}
