// Package P03 (issues I-004, I-005; decision 4; decision C8): recovery of Scenario copies made before Scenario duplication
// remapped the Node references of pull-out, deadhead, and pull-in activities.
import { describe, expect, it } from 'vitest';
import { asSnapshot, goldenWithDeadhead } from '../testSupport/goldenBackup';
import { metadata } from './ids';
import type { Block, BlockActivity, Node, Route, RoutePattern, Scenario, Trip } from './types';
import { duplicateScenario, snapshotForScenario } from './project';
import { recoverScenarioCopyNodeReferences, type ScenarioCopyRecoveryInput } from './scenarioCopyRecovery';

type NodeEnd = 'fromNodeId' | 'toNodeId';
const nodeEnds = (activity: BlockActivity): Array<[NodeEnd, string]> =>
  activity.type === 'revenueTrip' ? [] : (['fromNodeId', 'toNodeId'] as const).flatMap((end) => ((activity as any)[end] ? [[end, (activity as any)[end] as string] as [NodeEnd, string]] : []));
const nodeReferences = (blocks: Block[]) => blocks.flatMap((block) => block.activities.flatMap(nodeEnds));

/** Reverses the Node remap on a copy's non-revenue activities: the shape the code before this package produced. */
function leak(blocks: Block[], toSource: Map<string, string>): Block[] {
  return blocks.map((block) => ({
    ...block,
    activities: block.activities.map((activity) => {
      if (activity.type === 'revenueTrip') return activity;
      const next = { ...activity } as any;
      for (const [end, nodeId] of nodeEnds(activity)) next[end] = toSource.get(nodeId) ?? nodeId;
      return next as BlockActivity;
    }),
  }));
}

/** The golden project (plus one deadhead) with a Scenario copy as the code before this package made it. */
function projectWithLeakyCopy() {
  const snapshot = asSnapshot(goldenWithDeadhead());
  const source = snapshotForScenario(snapshot, snapshot.scenarios[0].id)!;
  const copy = duplicateScenario(source, 'Copy');
  const toSource = new Map(copy.nodes.map((node, index) => [node.id, source.nodes[index].id]));
  const leaky = leak(copy.blocks, toSource);
  const input: ScenarioCopyRecoveryInput = {
    scenarios: [...snapshot.scenarios, copy.scenario],
    routes: [...snapshot.routes, ...copy.routes],
    nodes: [...snapshot.nodes, ...copy.nodes],
    patterns: [...snapshot.patterns, ...copy.patterns],
    trips: [...snapshot.trips, ...copy.trips],
    blocks: [...snapshot.blocks, ...leaky],
  };
  return { snapshot, source, copy, leaky, input, toSource };
}

describe('recoverScenarioCopyNodeReferences', () => {
  it('repoints the leaking references of a copy to the copy Nodes and changes nothing else', () => {
    const { source, copy, leaky, input } = projectWithLeakyCopy();
    const sourceNodeIds = new Set(source.nodes.map((node) => node.id));
    // 69 pull-outs and 69 pull-ins (138, as the review measured) plus the one deadhead added to the fixture.
    expect(nodeReferences(leaky).filter(([, id]) => sourceNodeIds.has(id))).toHaveLength(140);

    const result = recoverScenarioCopyNodeReferences(input);

    expect(result.findings).toEqual([]);
    expect(result.recoveredReferences).toBe(140);
    const recoveredCopyBlocks = result.blocks.filter((block) => block.scenarioId === copy.scenario.id);
    expect(nodeReferences(recoveredCopyBlocks).filter(([, id]) => sourceNodeIds.has(id))).toHaveLength(0);
    // The recovered copy equals the correctly made copy; the source Scenario's Blocks are untouched.
    expect(recoveredCopyBlocks).toEqual(copy.blocks);
    expect(result.blocks.filter((block) => block.scenarioId === source.scenario.id)).toEqual(source.blocks);
    expect(result.changedBlockIds.sort()).toEqual(copy.blocks.map((block) => block.id).sort());
    // Everything except the Node fields of non-revenue activities is byte-equal: ids, metadata, labels, revenue activities, timing, miles.
    const strip = (blocks: Block[]) => JSON.stringify(blocks.map((block) => ({ ...block, activities: block.activities.map((activity) => (activity.type === 'revenueTrip' ? activity : { ...activity, fromNodeId: undefined, toNodeId: undefined })) })));
    expect(strip(recoveredCopyBlocks)).toBe(strip(input.blocks.filter((block) => block.scenarioId === copy.scenario.id)));
  });

  it('is idempotent and returns unchanged Blocks as the same objects', () => {
    const { input } = projectWithLeakyCopy();
    const first = recoverScenarioCopyNodeReferences(input);
    const second = recoverScenarioCopyNodeReferences({ ...input, blocks: first.blocks });
    expect(second.changedBlockIds).toEqual([]);
    expect(second.recoveredReferences).toBe(0);
    second.blocks.forEach((block, index) => expect(block).toBe(first.blocks[index]));
  });

  it('leaves a Scenario that is not a copy alone, so import validation can reject a foreign reference', () => {
    const { input, copy, source } = projectWithLeakyCopy();
    const original = input.blocks.find((block) => block.scenarioId === source.scenario.id && block.activities.some((activity) => activity.type === 'pullOut'))!;
    const tampered = { ...original, activities: original.activities.map((activity) => (activity.type === 'pullOut' ? { ...activity, toNodeId: copy.nodes[0].id } : activity)) };
    const result = recoverScenarioCopyNodeReferences({ ...input, blocks: input.blocks.map((block) => (block.id === original.id ? tampered : block)) });
    expect(result.blocks.find((block) => block.id === original.id)).toBe(tampered);
  });

  it('does not repair a reference to an unknown Node while the copy source still exists', () => {
    const { input, copy } = projectWithLeakyCopy();
    const block = input.blocks.find((candidate) => candidate.scenarioId === copy.scenario.id && candidate.activities.some((activity) => activity.type === 'pullOut'))!;
    const broken = { ...block, activities: block.activities.map((activity) => (activity.type === 'pullOut' ? { ...activity, toNodeId: 'no-such-node' } : activity)) };
    const result = recoverScenarioCopyNodeReferences({ ...input, blocks: input.blocks.map((candidate) => (candidate.id === block.id ? broken : candidate)) });
    expect(result.blocks.find((candidate) => candidate.id === block.id)!.activities.find((activity) => activity.type === 'pullOut')).toMatchObject({ toNodeId: 'no-such-node' });
    // Not repaired, and not silent either.
    expect(result.findings).toEqual([expect.objectContaining({ entityId: block.id, field: 'pullOut.toNodeId' })]);
  });

  it('still repairs a copy after a Pattern in the source or the copy was renamed, because every Node name in the Route is unique', () => {
    const { input, copy } = projectWithLeakyCopy();
    const renamed = new Set([input.patterns.filter((pattern) => pattern.scenarioId === copy.scenario.id)[0].id]);
    const result = recoverScenarioCopyNodeReferences({ ...input, patterns: input.patterns.map((pattern) => (renamed.has(pattern.id) ? { ...pattern, name: 'ZZ renamed', sequence: 99 } : pattern)) });
    expect(result.findings).toEqual([]);
    expect(result.recoveredReferences).toBe(140);
  });

  it('infers the Nodes of a copy of a copy when the first source was deleted', () => {
    const { source, copy, input } = projectWithLeakyCopy();
    const second = duplicateScenario({ ...copy, blocks: input.blocks.filter((block) => block.scenarioId === copy.scenario.id) }, 'Copy of copy');
    const withoutFirstSource: ScenarioCopyRecoveryInput = {
      scenarios: [copy.scenario, second.scenario],
      routes: [...copy.routes, ...second.routes],
      nodes: [...copy.nodes, ...second.nodes],
      patterns: [...copy.patterns, ...second.patterns],
      trips: [...copy.trips, ...second.trips],
      blocks: [...input.blocks.filter((block) => block.scenarioId === copy.scenario.id), ...second.blocks],
    };
    expect(source.scenario.id).not.toBe(copy.scenario.id);
    const result = recoverScenarioCopyNodeReferences(withoutFirstSource);
    expect(result.findings).toEqual([]);
    const ownNodes = new Map([...copy.nodes, ...second.nodes].map((node) => [node.id, node.scenarioId]));
    for (const block of result.blocks) expect(nodeReferences([block]).every(([, id]) => ownNodes.get(id) === block.scenarioId)).toBe(true);
  });

  it('repairs a copy of a copy whose references still point at the first source', () => {
    const { snapshot, copy, input } = projectWithLeakyCopy();
    // Duplicating the leaky copy carries the first source's Node IDs along unchanged.
    const second = duplicateScenario({ ...copy, blocks: input.blocks.filter((block) => block.scenarioId === copy.scenario.id) }, 'Copy of copy');
    const result = recoverScenarioCopyNodeReferences({
      scenarios: [...input.scenarios, second.scenario],
      routes: [...input.routes, ...second.routes],
      nodes: [...input.nodes, ...second.nodes],
      patterns: [...input.patterns, ...second.patterns],
      trips: [...input.trips, ...second.trips],
      blocks: [...input.blocks, ...second.blocks],
    });
    const nameOf = new Map([...snapshot.nodes, ...second.nodes].map((node) => [node.id, node.name]));
    const secondNodeIds = new Set(second.nodes.map((node) => node.id));
    const before = nodeReferences(second.blocks);
    const after = nodeReferences(result.blocks.filter((block) => block.scenarioId === second.scenario.id));
    expect(after.every(([, id]) => secondNodeIds.has(id))).toBe(true);
    expect(after.map(([, id]) => nameOf.get(id))).toEqual(before.map(([, id]) => nameOf.get(id)));
  });
});

/** Two Scenarios by hand: a source and a copy, each with one Route of three Nodes and one Pattern through all three. */
function pair(options: { copyNodeNames?: string[]; copyRouteName?: string; sourceNodeNames?: string[]; copyPatternOrder?: number[] } = {}) {
  const stamp = '2026-01-01T00:00:00.000Z';
  const scenarios: Scenario[] = [
    { id: 's0', projectId: 'p', name: 'Source', ...metadata(stamp) },
    { id: 's1', projectId: 'p', name: 'Copy', sourceScenarioId: 's0', ...metadata(stamp) },
  ];
  const build = (scenarioId: string, prefix: string, names: string[], routeName: string, patternOrder?: number[]) => {
    const route: Route = { id: `${prefix}-route`, scenarioId, name: routeName, ...metadata(stamp) };
    const nodes: Node[] = names.map((name, index) => ({ id: `${prefix}-n${index + 1}`, scenarioId, routeId: route.id, name, kind: 'timepoint', ...metadata(stamp) }));
    const pattern: RoutePattern = { id: `${prefix}-pattern`, scenarioId, routeId: route.id, name: 'Full', points: (patternOrder ?? nodes.map((_, index) => index)).map((nodeIndex, sequence) => ({ id: `${prefix}-pp${sequence + 1}`, nodeId: nodes[nodeIndex].id, sequence, cumulativeMiles: sequence })), ...metadata(stamp) };
    const trip: Trip = { id: `${prefix}-trip`, scenarioId, routeId: route.id, serviceDayId: `${prefix}-day`, patternId: pattern.id, stopTimes: pattern.points.map((point, sequence) => ({ patternPointId: point.id, sequence, time: 3600 + sequence * 600 })), provenance: { kind: 'manual', manuallyChangedFields: [] }, ...metadata(stamp) };
    return { route, nodes, pattern, trip };
  };
  const source = build('s0', 's0', options.sourceNodeNames ?? ['Stop', 'Stop', 'Garage'], 'Route 1');
  const copy = build('s1', 's1', options.copyNodeNames ?? ['Stop', 'Stop', 'Garage'], options.copyRouteName ?? 'Route 1', options.copyPatternOrder);
  const block = (activities: BlockActivity[]): Block => ({ id: 'copy-block', scenarioId: 's1', blockingScenarioId: 'bs', serviceDayId: 's1-day', label: '7', activities, ...metadata(stamp) });
  const input = (blocks: Block[]): ScenarioCopyRecoveryInput => ({ scenarios, routes: [source.route, copy.route], nodes: [...source.nodes, ...copy.nodes], patterns: [source.pattern, copy.pattern], trips: [source.trip, copy.trip], blocks });
  return { source, copy, block, input };
}

describe('recoverScenarioCopyNodeReferences maps by Route, position, and name', () => {
  it('keeps two Nodes of the same name apart by their position in the Route', () => {
    const { copy, block, input } = pair();
    // Both stops are called "Stop". The leaked pull-out names the source's second stop and the pull-in its first.
    const leaked = block([
      { id: 'a1', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 5, toNodeId: 's0-n2' },
      { id: 'a2', type: 'pullIn', sequence: 1, minutesAfterLastTrip: 5, fromNodeId: 's0-n1' },
    ]);
    const result = recoverScenarioCopyNodeReferences(input([leaked]));
    expect(result.findings).toEqual([]);
    expect(result.blocks[0].activities).toEqual([
      { id: 'a1', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 5, toNodeId: copy.nodes[1].id },
      { id: 'a2', type: 'pullIn', sequence: 1, minutesAfterLastTrip: 5, fromNodeId: copy.nodes[0].id },
    ]);
  });

  it('reports a finding and leaves the reference when the copy Node was renamed', () => {
    const { block, input } = pair({ copyNodeNames: ['Stop', 'Stop', 'Depot'] });
    const leaked = block([{ id: 'a1', type: 'pullIn', sequence: 0, minutesAfterLastTrip: 5, fromNodeId: 's0-n3' }]);
    const result = recoverScenarioCopyNodeReferences(input([leaked]));
    expect(result.blocks[0]).toBe(leaked);
    expect(result.findings).toEqual([expect.objectContaining({ entityId: 'copy-block', field: 'pullIn.fromNodeId', parameters: expect.objectContaining({ blockLabel: '7' }) })]);
  });

  it('maps a unique name even when the Route order changed, and leaves a repeated name unresolved', () => {
    // The copy's Pattern now visits the third Node first, so positions no longer line up.
    const { copy, block, input } = pair({ copyPatternOrder: [2, 0, 1] });
    const leaked = block([
      { id: 'a1', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 5, toNodeId: 's0-n1' },
      { id: 'a2', type: 'pullIn', sequence: 1, minutesAfterLastTrip: 5, fromNodeId: 's0-n3' },
    ]);
    const result = recoverScenarioCopyNodeReferences(input([leaked]));
    expect(result.blocks[0].activities[1]).toMatchObject({ fromNodeId: copy.nodes[2].id });
    expect(result.blocks[0].activities[0]).toMatchObject({ toNodeId: 's0-n1' });
    expect(result.findings).toEqual([expect.objectContaining({ field: 'pullOut.toNodeId' })]);
  });

  it('reports a finding and leaves the reference when the copy Route was renamed', () => {
    const { block, input } = pair({ copyRouteName: 'Route 1A' });
    const leaked = block([{ id: 'a1', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 5, toNodeId: 's0-n3' }]);
    const result = recoverScenarioCopyNodeReferences(input([leaked]));
    expect(result.blocks[0]).toBe(leaked);
    expect(result.findings).toHaveLength(1);
  });
});

describe('recoverScenarioCopyNodeReferences when the copy source no longer exists (decision C8)', () => {
  /** The copy and its Trips, with the source Scenario removed; the copy still names the removed source. */
  function orphanedCopy() {
    const { copy, leaky } = projectWithLeakyCopy();
    const input: ScenarioCopyRecoveryInput = { scenarios: [copy.scenario], routes: copy.routes, nodes: copy.nodes, patterns: copy.patterns, trips: copy.trips, blocks: leaky };
    return { copy, input };
  }

  it('infers pull-out To, pull-in From, and deadhead From and To from the adjacent Trip endpoints', () => {
    const { copy, input } = orphanedCopy();
    const result = recoverScenarioCopyNodeReferences(input);
    expect(result.findings).toEqual([]);
    expect(result.blocks).toEqual(copy.blocks);
  });

  it('reports a finding naming the Block for each garage end that cannot be inferred and clears that end', () => {
    const { input, copy } = orphanedCopy();
    const target = input.blocks.find((block) => block.activities.some((activity) => activity.type === 'pullOut') && block.activities.some((activity) => activity.type === 'pullIn'))!;
    // A garage that existed only in the removed source Scenario.
    const withGarages: Block = {
      ...target,
      activities: target.activities.map((activity) => {
        if (activity.type === 'pullOut') return { ...activity, fromNodeId: 'removed-garage' };
        if (activity.type === 'pullIn') return { ...activity, toNodeId: 'removed-garage' };
        return activity;
      }),
    };
    const result = recoverScenarioCopyNodeReferences({ ...input, blocks: input.blocks.map((block) => (block.id === target.id ? withGarages : block)) });
    const recovered = result.blocks.find((block) => block.id === target.id)!;
    expect(recovered.activities.find((activity) => activity.type === 'pullOut')).not.toHaveProperty('fromNodeId');
    expect(recovered.activities.find((activity) => activity.type === 'pullIn')).not.toHaveProperty('toNodeId');
    expect(result.findings.map((found) => found.field).sort()).toEqual(['pullIn.toNodeId', 'pullOut.fromNodeId']);
    for (const found of result.findings) {
      expect(found).toMatchObject({ entityType: 'block', entityId: target.id, severity: 'warning', parameters: { blockLabel: target.label } });
    }
    // The ends that can be inferred are still repaired in the same Block.
    const copyNodeIds = new Set(copy.nodes.map((node) => node.id));
    expect(nodeReferences([recovered]).every(([, id]) => copyNodeIds.has(id))).toBe(true);
  });

  it('reports a finding and leaves a required end that has no adjacent Trip', () => {
    const { input, copy } = orphanedCopy();
    const empty: Block = { ...copy.blocks[0], id: 'empty-block', label: 'Empty', activities: [{ id: 'po', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 5, toNodeId: 'removed-garage' }] };
    const result = recoverScenarioCopyNodeReferences({ ...input, blocks: [...input.blocks, empty] });
    expect(result.blocks.find((block) => block.id === 'empty-block')!.activities[0]).toMatchObject({ toNodeId: 'removed-garage' });
    expect(result.findings).toEqual([expect.objectContaining({ entityId: 'empty-block', field: 'pullOut.toNodeId', parameters: expect.objectContaining({ blockLabel: 'Empty' }) })]);
  });

  it('does not infer anything for a Scenario that is not a copy', () => {
    const { copy, input } = orphanedCopy();
    const notCopy = { ...copy.scenario, sourceScenarioId: undefined };
    const result = recoverScenarioCopyNodeReferences({ ...input, scenarios: [notCopy] });
    expect(result.changedBlockIds).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});
