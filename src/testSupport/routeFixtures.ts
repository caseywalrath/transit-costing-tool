// Test setup for Routes, built the way the Route screen saves them: through the application's preview and commit, so a fixture goes
// through the same validation as a planner's edit (review package P17; the per-field mutators these replace are deleted).
import { metadata, newId } from '../domain/ids';
import type { RouteDefinitionService } from '../application/routeDefinitionService';
import type { Node, NodeKind, RouteDefinitionAggregate, RoutePattern } from '../domain/types';

export interface NodeSpec { name: string; kind?: NodeKind; shortName?: string }
export interface StopSpec { nodeId: string; miles?: number }

/** Adds Nodes to a Route (one preview, one commit). `nodes` are the added ones, in the order of `specs`. */
export async function addRouteNodes(service: RouteDefinitionService, aggregate: RouteDefinitionAggregate, specs: NodeSpec[]): Promise<{ aggregate: RouteDefinitionAggregate; nodes: Node[] }> {
  const added: Node[] = specs.map((spec) => ({ id: newId(), scenarioId: aggregate.route.scenarioId, routeId: aggregate.route.id, name: spec.name, kind: spec.kind ?? 'timepoint', ...(spec.shortName ? { shortName: spec.shortName } : {}), ...metadata() }));
  const preview = await service.previewNodeChanges(aggregate.route.id, [...aggregate.nodes, ...added]);
  const committed = (await service.commitNodeChanges(preview.previewToken)).aggregate;
  return { aggregate: committed, nodes: added.map((node) => committed.nodes.find((candidate) => candidate.id === node.id)!) };
}

/**
 * Saves a new Pattern. `stops` are Nodes of the Route with cumulative miles (default: one mile per stop). The Pattern starts from
 * `createPatternDraft`, so it takes the first managed Direction unless `directionId` says otherwise.
 */
export async function savePattern(service: RouteDefinitionService, aggregate: RouteDefinitionAggregate, spec: { name?: string; stops: StopSpec[]; directionId?: string }): Promise<{ aggregate: RouteDefinitionAggregate; pattern: RoutePattern }> {
  const draft = service.createPatternDraft(aggregate);
  const proposed: RoutePattern = {
    ...draft,
    name: spec.name ?? draft.name,
    ...(spec.directionId ? { directionId: spec.directionId } : {}),
    points: spec.stops.map((stop, index) => ({ id: newId(), nodeId: stop.nodeId, sequence: index, cumulativeMiles: stop.miles ?? index })),
  };
  const preview = await service.previewPatternChange(aggregate.route.id, undefined, proposed);
  const result = await service.commitPatternChange(preview.previewToken);
  return { aggregate: result.aggregate, pattern: result.aggregate.patterns.find((pattern) => pattern.id === proposed.id)! };
}

/** Saves a changed copy of an existing Pattern (for example a reverse or a duplicate draft). */
export async function savePatternDraft(service: RouteDefinitionService, aggregate: RouteDefinitionAggregate, draft: RoutePattern): Promise<{ aggregate: RouteDefinitionAggregate; pattern: RoutePattern }> {
  const preview = await service.previewPatternChange(aggregate.route.id, undefined, draft);
  const result = await service.commitPatternChange(preview.previewToken);
  return { aggregate: result.aggregate, pattern: result.aggregate.patterns.find((pattern) => pattern.id === draft.id)! };
}

/** A Route with Nodes `A` and `B` (and more, if `names` says so) and one Pattern through the first two. */
export async function addTwoStopPattern(service: RouteDefinitionService, aggregate: RouteDefinitionAggregate, options: { names?: string[]; patternName?: string; miles?: number } = {}): Promise<{ aggregate: RouteDefinitionAggregate; pattern: RoutePattern }> {
  const withNodes = await addRouteNodes(service, aggregate, (options.names ?? ['A', 'B']).map((name) => ({ name })));
  const [first, second] = withNodes.nodes;
  return savePattern(service, withNodes.aggregate, { name: options.patternName, stops: [{ nodeId: first.id, miles: 0 }, { nodeId: second.id, miles: options.miles ?? 1 }] });
}
