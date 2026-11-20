import { describe, expect, it } from 'vitest';
import { ProjectBackupService } from '../persistence/backupRepository';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { RouteDefinitionService, RouteStopValidationError, routeStopCommandMessage, STOPS_CHANGED_ELSEWHERE } from './routeDefinitionService';
import { newId } from '../domain/ids';
import type { PatternStopPlacement, RoutePattern, RouteStop, RouteStopSet } from '../domain/types';
import { addRouteNodes, savePattern } from '../testSupport/routeFixtures';

const START = '2026-09-10T12:00:00.000Z';
const LATER = '2026-09-10T12:05:00.000Z';
const STOPS: RouteStop[] = [{ id: 'elm', name: 'Elm Street' }, { id: 'oak', name: 'Oak Avenue' }];

/**
 * A Route with Trunk in Outbound and Branch in Inbound, both through South, North, and Third, and no stops yet.
 * The clock is a value the test moves, so a later write carries a later `updatedAt`.
 */
async function stopRoute() {
  const repository = new InMemoryRouteDefinitionRepository();
  const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
  const clock = { now: START };
  const service = new RouteDefinitionService(repository, backup, () => clock.now);
  const created = await service.createProject('Stops');
  const scenarioId = created.records.scenario.id;
  const routeId = (await service.addRoute(created.records)).route.id;
  let aggregate = (await service.loadWorkspace(created.project.id, scenarioId, routeId)).aggregate!;
  const withNodes = await addRouteNodes(service, aggregate, [{ name: 'South' }, { name: 'North' }, { name: 'Third' }]);
  aggregate = withNodes.aggregate;
  const stops = withNodes.nodes.map((node, index) => ({ nodeId: node.id, miles: [0, 1.5, 4][index] }));
  const outbound = aggregate.directions!.find((direction) => direction.name === 'Outbound')!;
  const inbound = aggregate.directions!.find((direction) => direction.name === 'Inbound')!;
  const trunk = await savePattern(service, aggregate, { name: 'Trunk', stops, directionId: outbound.id });
  const branch = await savePattern(service, trunk.aggregate, { name: 'Branch', stops, directionId: inbound.id });
  return { repository, service, clock, scenarioId, routeId, outbound, inbound, trunk: trunk.pattern, branch: branch.pattern };
}
type Harness = Awaited<ReturnType<typeof stopRoute>>;

/** Point IDs of a pattern in sequence order. */
const pointIds = (pattern: RoutePattern) => [...pattern.points].sort((left, right) => left.sequence - right.sequence).map((point) => point.id);
const placement = (stopId: string, afterPatternPointId: string): PatternStopPlacement => ({ id: newId(), stopId, afterPatternPointId, sequence: 0, timing: 'interpolate' });
/** Saves one pattern's placements through the existing stop-list save, with the stored stamp, so it is not refused as stale. */
async function savePlacements(h: Harness, patternId: string, placements: PatternStopPlacement[]) {
  const stored = await h.service.getRouteStopSet(h.routeId);
  return h.service.saveRouteStops({ routeId: h.routeId, patternId, stops: stored?.stops ?? STOPS, placements, timepointStopCodes: {}, roundingSeconds: 60, baseUpdatedAt: stored?.updatedAt });
}
/** Elm Street is used by Trunk (Outbound) and Branch (Inbound); Oak Avenue only by Trunk. */
async function withSharedStop(h: Harness): Promise<RouteStopSet> {
  const [trunkFirst, trunkSecond] = pointIds(h.trunk);
  const [branchFirst] = pointIds(h.branch);
  await savePlacements(h, h.trunk.id, [placement('elm', trunkFirst), placement('oak', trunkSecond)]);
  return (await savePlacements(h, h.branch.id, [placement('elm', branchFirst)]))!;
}
const storedSet = (h: Harness) => h.service.getRouteStopSet(h.routeId);

describe('route stop management service (Decision 0087, RS2)', () => {
  it('saves field edits, trims them, and keeps every placement', async () => {
    const h = await stopRoute();
    const before = await withSharedStop(h);
    const saved = await h.service.saveRouteStopRecords({
      routeId: h.routeId, edits: [{ id: 'elm', name: '  Elm  ', stopCode: ' 1001 ' }, { id: 'oak', name: 'Oak Avenue' }], baseUpdatedAt: before.updatedAt,
    });
    expect(saved.stops).toEqual([{ id: 'elm', name: 'Elm', stopCode: '1001' }, { id: 'oak', name: 'Oak Avenue' }]);
    expect(saved.placementsByPatternId).toEqual(before.placementsByPatternId);
    expect(await storedSet(h)).toEqual(saved);
  });

  it('splits one stop for one direction: the new stop gets a new ID and only that direction\'s placement moves', async () => {
    const h = await stopRoute();
    const before = await withSharedStop(h);
    const saved = await h.service.splitRouteStop({ routeId: h.routeId, stopId: 'elm', directionId: h.inbound.id, newStop: { name: 'Elm Street NB' }, baseUpdatedAt: before.updatedAt });
    const created = saved.stops.find((stop) => stop.id !== 'elm' && stop.id !== 'oak');
    expect(saved.stops.map((stop) => stop.id)).toEqual(['elm', created!.id, 'oak']);
    expect(created).toEqual({ id: expect.any(String), name: 'Elm Street NB' });
    expect(saved.placementsByPatternId[h.branch.id].map((item) => item.stopId)).toEqual([created!.id]);
    expect(saved.placementsByPatternId[h.trunk.id].map((item) => item.stopId)).toEqual(['elm', 'oak']);
  });

  it('splits every shared stop with a name suffix per direction, and refuses a stop that only one direction uses', async () => {
    const h = await stopRoute();
    const before = await withSharedStop(h);
    const saved = await h.service.splitSharedRouteStops({
      routeId: h.routeId, keepDirectionId: h.outbound.id, suffixByDirectionId: { [h.outbound.id]: 'SB', [h.inbound.id]: 'NB' }, renameKept: true, baseUpdatedAt: before.updatedAt,
    });
    expect(saved.stops.map((stop) => stop.name)).toEqual(['Elm Street SB', 'Elm Street NB', 'Oak Avenue']);
    const nb = saved.stops[1].id;
    expect(saved.placementsByPatternId[h.branch.id].map((item) => item.stopId)).toEqual([nb]);
    expect(saved.placementsByPatternId[h.trunk.id].map((item) => item.stopId)).toEqual(['elm', 'oak']);
    await expect(h.service.splitRouteStop({ routeId: h.routeId, stopId: 'oak', directionId: h.inbound.id, newStop: { name: 'Oak' }, baseUpdatedAt: saved.updatedAt }))
      .rejects.toThrow(routeStopCommandMessage('nothingToSplit'));
  });

  it('deletes stops and their placements, and removes the set when no stop is left', async () => {
    const h = await stopRoute();
    const before = await withSharedStop(h);
    const kept = await h.service.deleteRouteStops({ routeId: h.routeId, stopIds: ['oak'], baseUpdatedAt: before.updatedAt });
    expect(kept?.stops.map((stop) => stop.id)).toEqual(['elm']);
    expect(kept?.placementsByPatternId[h.trunk.id].map((item) => item.stopId)).toEqual(['elm']);
    expect(await h.service.deleteRouteStops({ routeId: h.routeId, stopIds: ['elm'], baseUpdatedAt: kept!.updatedAt })).toBeUndefined();
    expect(await storedSet(h)).toBeUndefined();
  });

  it('merges stops into the kept stop, pointing their placements at it', async () => {
    const h = await stopRoute();
    const before = await withSharedStop(h);
    const merged = await h.service.mergeRouteStops({ routeId: h.routeId, keepStopId: 'elm', mergeStopIds: ['oak'], baseUpdatedAt: before.updatedAt });
    expect(merged.stops.map((stop) => stop.id)).toEqual(['elm']);
    expect(merged.placementsByPatternId[h.trunk.id].map((item) => item.stopId)).toEqual(['elm', 'elm']);
    expect(await storedSet(h)).toEqual(merged);
  });

  it('refuses a merge that repeats a stop within one segment, and writes nothing', async () => {
    const h = await stopRoute();
    const [trunkFirst] = pointIds(h.trunk);
    const set = (await savePlacements(h, h.trunk.id, [placement('elm', trunkFirst), placement('oak', trunkFirst)]))!;
    const before = JSON.stringify(await h.repository.getScenarioRecords(h.scenarioId));
    await expect(h.service.mergeRouteStops({ routeId: h.routeId, keepStopId: 'elm', mergeStopIds: ['oak'], baseUpdatedAt: set.updatedAt }))
      .rejects.toMatchObject({ name: 'RouteStopValidationError', findings: [expect.objectContaining({ ruleId: 'stopPlacement.repeatedInSegment' })] });
    expect(JSON.stringify(await h.repository.getScenarioRecords(h.scenarioId))).toBe(before);
  });

  it('refuses the merge inputs the RS1 rules name, with their messages', async () => {
    const h = await stopRoute();
    const set = await withSharedStop(h);
    const base = set.updatedAt;
    await expect(h.service.mergeRouteStops({ routeId: h.routeId, keepStopId: 'elm', mergeStopIds: [], baseUpdatedAt: base })).rejects.toThrow(routeStopCommandMessage('mergeNeedsTwo'));
    await expect(h.service.mergeRouteStops({ routeId: h.routeId, keepStopId: 'elm', mergeStopIds: ['elm'], baseUpdatedAt: base })).rejects.toThrow(routeStopCommandMessage('mergeNeedsTwo'));
    await expect(h.service.mergeRouteStops({ routeId: h.routeId, keepStopId: 'elm', mergeStopIds: ['missing'], baseUpdatedAt: base })).rejects.toThrow(routeStopCommandMessage('stopMissing'));
  });

  it('refuses a command from an editor that opened before a later save, and writes nothing', async () => {
    const h = await stopRoute();
    const opened = await withSharedStop(h);
    h.clock.now = LATER;
    await h.service.saveRouteStopRecords({ routeId: h.routeId, edits: [{ id: 'elm', name: 'Elm Street' }, { id: 'oak', name: 'Oak Avenue' }], baseUpdatedAt: opened.updatedAt });
    const before = JSON.stringify(await h.repository.getScenarioRecords(h.scenarioId));
    await expect(h.service.splitRouteStop({ routeId: h.routeId, stopId: 'elm', directionId: h.inbound.id, newStop: { name: 'Elm NB' }, baseUpdatedAt: opened.updatedAt })).rejects.toThrow(STOPS_CHANGED_ELSEWHERE);
    await expect(h.service.deleteRouteStops({ routeId: h.routeId, stopIds: ['oak'], baseUpdatedAt: opened.updatedAt })).rejects.toThrow(STOPS_CHANGED_ELSEWHERE);
    expect(JSON.stringify(await h.repository.getScenarioRecords(h.scenarioId))).toBe(before);
  });

  it('refuses a command when the Route has no stop set', async () => {
    const h = await stopRoute();
    await expect(h.service.deleteRouteStops({ routeId: h.routeId, stopIds: ['elm'], baseUpdatedAt: START })).rejects.toThrow(STOPS_CHANGED_ELSEWHERE);
    expect(await storedSet(h)).toBeUndefined();
  });

  it('refuses a duplicate Stop ID from an edit and from a split, and writes nothing', async () => {
    const h = await stopRoute();
    const set = await withSharedStop(h);
    await expect(h.service.saveRouteStopRecords({ routeId: h.routeId, edits: [{ id: 'elm', name: 'Elm', stopCode: '1001' }, { id: 'oak', name: 'Oak', stopCode: ' 1001 ' }], baseUpdatedAt: set.updatedAt }))
      .rejects.toMatchObject({ name: 'RouteStopValidationError', findings: [expect.objectContaining({ ruleId: 'routeStop.codeDuplicate' })] });
    const coded = await h.service.saveRouteStopRecords({ routeId: h.routeId, edits: [{ id: 'elm', name: 'Elm', stopCode: '1001' }, { id: 'oak', name: 'Oak' }], baseUpdatedAt: set.updatedAt });
    const before = JSON.stringify(await h.repository.getScenarioRecords(h.scenarioId));
    await expect(h.service.splitRouteStop({ routeId: h.routeId, stopId: 'elm', directionId: h.inbound.id, newStop: { name: 'Elm NB', stopCode: '1001' }, baseUpdatedAt: coded.updatedAt }))
      .rejects.toBeInstanceOf(RouteStopValidationError);
    expect(JSON.stringify(await h.repository.getScenarioRecords(h.scenarioId))).toBe(before);
  });
});
