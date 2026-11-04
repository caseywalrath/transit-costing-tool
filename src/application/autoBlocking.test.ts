import { describe, expect, it } from 'vitest';
import type { AutoBlockingRules } from '../domain/autoBlocking';
import { createBlockingScenarioSourceSignature } from '../domain/blocking';
import { metadata } from '../domain/ids';
import type { Node, Route, RouteDirection, RoutePattern, Scenario, ServiceDayDefinition, Trip, TripProfile } from '../domain/types';
import { InMemoryBlockingRepository } from '../persistence/blockingRepository';
import { BlockingApplicationService, type BlockingContextProvider } from './blockingService';

const meta = metadata('2026-01-01T00:00:00.000Z');

/** One Scenario of the synthetic out-and-back Route (docs/implementation/automatic-blocking/synthetic-check.py), with ids prefixed per Scenario. */
function scenarioData(prefix: string, runMinutes = 35) {
  const id = (name: string) => `${prefix}-${name}`;
  const scenarioId = id('scenario');
  const routes: Route[] = [{ id: id('route'), scenarioId, name: 'Route 1', ...meta }];
  const nodes: Node[] = ['A', 'B'].map((name) => ({ id: id(name), scenarioId, routeId: id('route'), name, kind: 'terminal' as const, ...meta }));
  const directions: RouteDirection[] = [
    { id: id('dOut'), scenarioId, routeId: id('route'), name: 'Outbound', group: 'outbound', sequence: 0, columns: [], ...meta },
    { id: id('dIn'), scenarioId, routeId: id('route'), name: 'Inbound', group: 'inbound', sequence: 1, columns: [], ...meta },
  ];
  const pattern = (name: string, from: string, to: string, directionId: string, sequence: number): RoutePattern => ({
    id: id(name), scenarioId, routeId: id('route'), name: name === 'AB' ? 'To B' : 'To A', directionId, sequence,
    points: [{ id: id(`${name}0`), nodeId: id(from), sequence: 0, cumulativeMiles: 0 }, { id: id(`${name}1`), nodeId: id(to), sequence: 1, cumulativeMiles: 5 }], ...meta,
  });
  const patterns = [pattern('AB', 'A', 'B', id('dOut'), 0), pattern('BA', 'B', 'A', id('dIn'), 1)];
  const profile: TripProfile = { id: id('profile'), scenarioId, name: 'Default', ...meta };
  const serviceDays: ServiceDayDefinition[] = [
    { id: id('weekday'), scenarioId, kind: 'weekday', name: 'Weekday', annualServiceDays: 260, sequence: 0, ...meta },
    { id: id('saturday'), scenarioId, kind: 'saturday', name: 'Saturday', annualServiceDays: 52, sequence: 1, ...meta },
  ];
  const trips: Trip[] = [];
  for (let k = 0; k < 29; k += 1) {
    const out = 9 * 3600 + 900 * k; const back = 9 * 3600 + runMinutes * 60 + 900 * k;
    const make = (name: string, patternName: 'AB' | 'BA', start: number): Trip => ({
      id: id(`${name}-${String(k).padStart(2, '0')}`), scenarioId, routeId: id('route'), serviceDayId: id('weekday'), patternId: id(patternName), tripProfileId: profile.id,
      stopTimes: [{ patternPointId: id(`${patternName}0`), sequence: 0, time: start }, { patternPointId: id(`${patternName}1`), sequence: 1, time: start + runMinutes * 60 }],
      provenance: { kind: 'manual', manuallyChangedFields: [] }, ...meta,
    });
    trips.push(make('ab', 'AB', out), make('ba', 'BA', back));
  }
  return { scenarioId, routes, nodes, directions, patterns, profile, serviceDays, trips, id };
}

function setup() {
  const first = scenarioData('one'); const second = scenarioData('two');
  const all = [first, second];
  const byScenario = (scenarioId: string) => all.find((data) => data.scenarioId === scenarioId)!;
  const scenarios: Scenario[] = all.map((data, index) => ({ id: data.scenarioId, projectId: 'project', name: index === 0 ? 'Baseline' : 'Alternative', ...meta }));
  const context: BlockingContextProvider = {
    getTrip: async (tripId) => all.flatMap((data) => data.trips).find((trip) => trip.id === tripId),
    listTrips: async (scenarioId, tripProfileId) => byScenario(scenarioId).trips.filter((trip) => trip.tripProfileId === tripProfileId),
    getTripProfile: async (profileId) => all.map((data) => data.profile).find((profile) => profile.id === profileId),
    listPatterns: async (scenarioId) => byScenario(scenarioId).patterns,
    listDirections: async (scenarioId) => byScenario(scenarioId).directions,
    listServiceDays: async (scenarioId) => byScenario(scenarioId).serviceDays,
    listNodes: async (scenarioId) => byScenario(scenarioId).nodes,
    listRoutes: async (scenarioId) => byScenario(scenarioId).routes,
    listProjectScenarios: async () => scenarios,
  };
  const repository = new InMemoryBlockingRepository();
  return { first, second, repository, service: new BlockingApplicationService(repository, context), context };
}

/** The reference rules: 20 minutes after inbound, a 35-minute break after inbound, blocks over 4 h, first break after 1 h. */
function referenceRules(data: ReturnType<typeof scenarioData>, base: AutoBlockingRules): AutoBlockingRules {
  return {
    ...base,
    patterns: base.patterns.map((row) => row.patternId === data.id('BA')
      ? { ...row, minimumLayover: { mode: 'minutes' as const, value: 20 }, breakAllowed: true }
      : { ...row, breakAllowed: false }),
    break: { lengthMinutes: 35, minimumBlockHours: 4, firstBreakAfterHours: 1 },
  };
}

describe('Automatic blocking application service (Decision 0055)', () => {
  it('lists Patterns, defaults, days with Trip counts, and sources across two Scenarios of one Project', async () => {
    const { first, second, repository, service } = setup();
    const secondScenario = await service.createBlockingScenario({ scenarioId: second.scenarioId, tripProfileId: second.profile.id, name: 'Hand built' });
    await service.createAutoBlockingScenario({ scenarioId: second.scenarioId, tripProfileId: second.profile.id, name: 'Auto two', rules: (await service.getAutoBlockingSetup(second.scenarioId, second.profile.id)).defaultRules });
    expect(repository.scenarios.size).toBe(2);

    const setupResult = await service.getAutoBlockingSetup(first.scenarioId, first.profile.id, { inbound: { mode: 'minutes', value: 20 } });
    expect(setupResult.patterns.map((pattern) => pattern.name)).toEqual(['To B', 'To A']);
    expect(setupResult.patternTripCounts).toEqual({ [first.id('AB')]: 29, [first.id('BA')]: 29 });
    expect(setupResult.patternGroups).toEqual({ [first.id('AB')]: 'outbound', [first.id('BA')]: 'inbound' });
    expect(setupResult.serviceDays.map((entry) => [entry.day.name, entry.tripCount])).toEqual([['Weekday', 58], ['Saturday', 0]]);
    expect(setupResult.milesIncompletePatternIds).toEqual([]);
    expect(setupResult.defaultName).toBe('Auto 1');
    expect(setupResult.defaultRules.serviceDayIds).toEqual([first.id('weekday')]);
    expect(setupResult.defaultRules.patterns.find((row) => row.patternId === first.id('BA'))?.minimumLayover).toEqual({ mode: 'minutes', value: 20 });
    // Only Blocking Scenarios that hold Blocks are sources; the empty hand-built one is left out.
    expect(setupResult.sources).toEqual([{ blockingScenarioId: expect.any(String), scenarioName: 'Alternative', name: 'Auto two', blockCount: expect.any(Number) }]);
    expect(secondScenario.name).toBe('Hand built');
  });

  it('proposes a unique default name among the Scenario\'s Blocking Scenarios', async () => {
    const { first, service } = setup();
    await service.createBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Auto 1' });
    await service.createBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'auto 2' });
    expect((await service.getAutoBlockingSetup(first.scenarioId, first.profile.id)).defaultName).toBe('Auto 3');
  });

  it('rebuilds an automatically built Blocking Scenario in place, keeping its id and the Blocks of days not rebuilt', async () => {
    const { first, service } = setup();
    const rules = (await service.getAutoBlockingSetup(first.scenarioId, first.profile.id)).defaultRules;
    const built = await service.createAutoBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Auto 1', rules });
    const saturdayBlock = await service.createBlock(built.id, first.id('saturday'), 'S1', createBlockingScenarioSourceSignature(built, await service.listBlockingBlocks(built.id)));
    const before = await service.listBlockingBlocks(built.id, first.id('weekday'));
    const rebuilt = await service.createAutoBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Auto 1 renamed', rules: { ...rules, maxRunningHours: 6 }, replaceBlockingScenarioId: built.id });
    expect(rebuilt.id).toBe(built.id);
    expect(rebuilt.name).toBe('Auto 1 renamed');
    expect(rebuilt.autoBlocking?.rules.maxRunningHours).toBe(6);
    const after = await service.listBlockingBlocks(built.id);
    expect(after.some((block) => block.id === saturdayBlock.id)).toBe(true);
    expect(after.filter((block) => block.serviceDayId === first.id('weekday')).some((block) => before.some((old) => old.id === block.id))).toBe(false);
    expect((await service.listBlockingScenarios(first.scenarioId)).length).toBe(1);
    const plain = await service.createBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Plain' });
    await expect(service.createAutoBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Plain', rules, replaceBlockingScenarioId: plain.id })).rejects.toThrow('Only an automatically built');
  });

  it('creates a Default Blocking Scenario only when the Trip Profile has none', async () => {
    const { first, service } = setup();
    const created = await service.ensureDefaultBlockingScenario(first.scenarioId, first.profile.id);
    expect(created.name).toBe('Default');
    expect((await service.ensureDefaultBlockingScenario(first.scenarioId, first.profile.id)).id).toBe(created.id);
    expect((await service.listBlockingScenarios(first.scenarioId)).length).toBe(1);
  });

  it('previews the reference numbers without writing', async () => {
    const { first, repository, service } = setup();
    const base = (await service.getAutoBlockingSetup(first.scenarioId, first.profile.id)).defaultRules;
    const preview = await service.previewAutoBlocking({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Preview', rules: referenceRules(first, base) });
    expect(preview.ruleFindings).toEqual([]);
    expect(preview.nameFindings).toEqual([]);
    expect(preview.result.blocks).toHaveLength(7);
    expect(preview.result.days[0]).toMatchObject({ blockCount: 7, revenueSeconds: 153600, blocksWithOneBreak: 6 });
    expect(preview.check).toBeUndefined();
    expect(repository.scenarios.size).toBe(0);
    expect(repository.blocks.size).toBe(0);
  });

  it('previews peak vehicles and stores maxVehicles in the record', async () => {
    const { first, repository, service } = setup();
    const base = (await service.getAutoBlockingSetup(first.scenarioId, first.profile.id)).defaultRules;
    const rules = { ...referenceRules(first, base), maxVehicles: 12 };
    const preview = await service.previewAutoBlocking({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Preview', rules });
    expect(preview.ruleFindings).toEqual([]);
    expect(preview.result.days[0].peakVehicles).toBeGreaterThanOrEqual(1);
    expect(preview.result.days[0].peakVehicles).toBeLessThanOrEqual(12);
    const created = await service.createAutoBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Limited', rules });
    expect(repository.scenarios.get(created.id)!.autoBlocking!.rules.maxVehicles).toBe(12);
    await expect(service.createAutoBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Bad limit', rules: { ...rules, maxVehicles: 0 } })).rejects.toThrow('autoBlocking.limitVehicles');
  });

  it('creates one Blocking Scenario with its record and Blocks, leaving others untouched', async () => {
    const { first, repository, service } = setup();
    const other = await service.createBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Existing' });
    const base = (await service.getAutoBlockingSetup(first.scenarioId, first.profile.id)).defaultRules;
    const rules = referenceRules(first, base);
    const created = await service.createAutoBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: '  Auto  ', rules });
    expect(created.name).toBe('Auto');
    expect(repository.scenarios.size).toBe(2);
    expect(repository.scenarios.get(other.id)).toEqual(other);
    const blocks = await service.listBlockingBlocks(created.id);
    expect(blocks).toHaveLength(7);
    expect(await service.listBlockingBlocks(other.id)).toEqual([]);
    const stored = repository.scenarios.get(created.id)!;
    expect(stored.autoBlocking).toMatchObject({ rules, tripCount: 58, blockCount: 7 });
    expect(stored.autoBlocking!.builtAt).toBe(blocks[0].updatedAt);
    expect(blocks.every((block) => block.updatedAt === stored.autoBlocking!.builtAt && block.blockingScenarioId === created.id)).toBe(true);
    expect((await service.getScenarioSummary(created.id))?.invalidBlockCount).toBe(0);
  });

  it('refuses a duplicate name, invalid rules, and an empty build without writing', async () => {
    const { first, repository, service } = setup();
    const base = (await service.getAutoBlockingSetup(first.scenarioId, first.profile.id)).defaultRules;
    await service.createBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Taken' });
    const before = repository.scenarios.size;
    const request = { scenarioId: first.scenarioId, tripProfileId: first.profile.id, rules: base };
    await expect(service.createAutoBlockingScenario({ ...request, name: 'taken' })).rejects.toThrow('blockingScenario.nameUnique');
    await expect(service.createAutoBlockingScenario({ ...request, name: ' ' })).rejects.toThrow('blockingScenario.nameRequired');
    await expect(service.createAutoBlockingScenario({ ...request, name: 'Bad', rules: { ...base, deadheads: [{ fromNodeId: first.id('A'), toNodeId: first.id('A'), minutes: 5, bothWays: false }] } })).rejects.toThrow('autoBlocking.deadheadSameNode');
    await expect(service.createAutoBlockingScenario({ ...request, name: 'Empty', rules: { ...base, serviceDayIds: [first.id('saturday')] } })).rejects.toThrow('no Trips');
    expect(repository.scenarios.size).toBe(before);
    expect(repository.blocks.size).toBe(0);
  });

  it('measures rules from a Blocking Scenario of another Scenario and checks against it', async () => {
    const { first, second, service } = setup();
    const secondBase = (await service.getAutoBlockingSetup(second.scenarioId, second.profile.id)).defaultRules;
    const built = await service.createAutoBlockingScenario({ scenarioId: second.scenarioId, tripProfileId: second.profile.id, name: 'Source', rules: { ...referenceRules(second, secondBase), break: { lengthMinutes: 50, minimumBlockHours: 4, firstBreakAfterHours: 1 } } });
    const draft = (await service.getAutoBlockingSetup(first.scenarioId, first.profile.id)).defaultRules;
    const measured = await service.measureAutoBlockingSource(first.scenarioId, first.profile.id, built.id, draft);
    expect(measured.rules.break?.lengthMinutes).toBe(50);
    expect(measured.rules.patterns.find((row) => row.patternId === first.id('BA'))?.minimumLayover).toEqual({ mode: 'minutes', value: 20 });
    expect(measured.lines.some((line) => line.basis === 'sameName')).toBe(true);
    const preview = await service.previewAutoBlocking({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Checked', rules: measured.rules, sourceBlockingScenarioId: built.id });
    expect(preview.check?.differencePercent).toBe(0);
    await expect(service.measureAutoBlockingSource(first.scenarioId, first.profile.id, 'missing', draft)).rejects.toThrow('not found');
  });

  it('reports the rule summary and edited Blocks after updateBlock', async () => {
    const { first, repository, service } = setup();
    const base = (await service.getAutoBlockingSetup(first.scenarioId, first.profile.id)).defaultRules;
    const created = await service.createAutoBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Auto', rules: referenceRules(first, base) });
    const fresh = await service.getAutoBlockingStatus(created.id);
    expect(fresh).toMatchObject({ editedBlockCount: 0, blockCountChanged: false });
    expect(fresh?.summary).toContain('break: 35 min after To A');
    expect(await service.getAutoBlockingStatus((await service.createBlockingScenario({ scenarioId: first.scenarioId, tripProfileId: first.profile.id, name: 'Plain' })).id)).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 5));
    const blocks = await service.listBlockingBlocks(created.id);
    const signature = createBlockingScenarioSourceSignature(repository.scenarios.get(created.id)!, blocks);
    await service.updateBlock({ ...blocks[0], label: 'Renamed' }, signature);
    expect(await service.getAutoBlockingStatus(created.id)).toMatchObject({ editedBlockCount: 1, blockCountChanged: false });
  });

  it('refuses automatic blocking when the context cannot read Nodes or Routes', async () => {
    const { first, repository, context } = setup();
    const { listNodes: _nodes, listRoutes: _routes, ...partial } = context;
    const service = new BlockingApplicationService(repository, partial);
    await expect(service.getAutoBlockingSetup(first.scenarioId, first.profile.id)).rejects.toThrow('not available');
  });
});
