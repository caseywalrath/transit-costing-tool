import type { Block, BlockActivity, EntityId, Node, Route, RoutePattern, Scenario, Trip, ValidationFinding } from './types';

/**
 * Recovery for Scenarios that were duplicated before duplication remapped the Node references of non-revenue activities
 * (user decision 4; decision C8). A copy's pull-out, deadhead, and pull-in activities then still named the source Scenario's Nodes.
 *
 * A Scenario is treated as a copy only when it records a `sourceScenarioId`. Only Blocks of a copy are touched, and only the
 * `fromNodeId` and `toNodeId` of non-revenue activities. Every other record is returned as given.
 */
export interface ScenarioCopyRecoveryInput {
  /** Every Scenario that could own a referenced Node. The copy source is looked up here. */
  scenarios: Scenario[];
  routes: Route[];
  nodes: Node[];
  patterns: RoutePattern[];
  trips: Trip[];
  blocks: Block[];
}

export interface ScenarioCopyRecoveryResult {
  /** Same order and length as the input. A Block that needed no change is the same object. */
  blocks: Block[];
  changedBlockIds: EntityId[];
  /** References repointed to a copy Node, whether mapped from the source or inferred from an adjacent Trip. */
  recoveredReferences: number;
  /** One finding per reference that could not be repaired, naming the Block. */
  findings: ValidationFinding[];
}

type NodeEnd = 'fromNodeId' | 'toNodeId';
type NonRevenueActivity = Exclude<BlockActivity, { type: 'revenueTrip' }>;

const RULE_ID = 'scenarioCopy.nodeUnresolved';
const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const bySequence = (left: BlockActivity, right: BlockActivity) => left.sequence - right.sequence || compareText(left.id, right.id);

/** Pull-out From and pull-in To are the optional garage ends; every other end is required by the activity type. */
function isOptionalEnd(activity: NonRevenueActivity, end: NodeEnd): boolean {
  return (activity.type === 'pullOut' && end === 'fromNodeId') || (activity.type === 'pullIn' && end === 'toNodeId');
}

export function recoverScenarioCopyNodeReferences(input: ScenarioCopyRecoveryInput): ScenarioCopyRecoveryResult {
  const scenarioById = new Map(input.scenarios.map((scenario) => [scenario.id, scenario]));
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const routeById = new Map(input.routes.map((route) => [route.id, route]));
  const patternById = new Map(input.patterns.map((pattern) => [pattern.id, pattern]));
  const tripById = new Map(input.trips.map((trip) => [trip.id, trip]));
  const routesByScenarioAndName = new Map<string, Route[]>();
  for (const route of input.routes) {
    const key = `${route.scenarioId}\u0000${route.name}`;
    routesByScenarioAndName.set(key, [...(routesByScenarioAndName.get(key) ?? []), route]);
  }
  const nodesByRoute = new Map<EntityId, Node[]>();
  for (const node of input.nodes) nodesByRoute.set(node.routeId, [...(nodesByRoute.get(node.routeId) ?? []), node]);
  const patternsByRoute = new Map<EntityId, RoutePattern[]>();
  for (const pattern of input.patterns) patternsByRoute.set(pattern.routeId, [...(patternsByRoute.get(pattern.routeId) ?? []), pattern]);

  // The Route's Node order: Nodes in the order the Route's Patterns first visit them, then the Nodes no Pattern visits by name.
  // A slot is null when Nodes cannot be told apart (the same name outside every Pattern), so no reference is moved onto it.
  const nodeOrders = new Map<EntityId, Array<Node | null>>();
  function routeNodeOrder(routeId: EntityId): Array<Node | null> {
    const cached = nodeOrders.get(routeId);
    if (cached) return cached;
    const nodes = nodesByRoute.get(routeId) ?? [];
    const routeNodeIds = new Set(nodes.map((node) => node.id));
    const patterns = [...(patternsByRoute.get(routeId) ?? [])].sort((left, right) =>
      (left.sequence ?? 0) - (right.sequence ?? 0)
      || compareText(left.name, right.name)
      || compareText(left.points.map((point) => nodeById.get(point.nodeId)?.name ?? '').join('\u0000'), right.points.map((point) => nodeById.get(point.nodeId)?.name ?? '').join('\u0000')));
    const order: Array<Node | null> = [];
    const seen = new Set<EntityId>();
    for (const pattern of patterns) {
      for (const point of [...pattern.points].sort((left, right) => left.sequence - right.sequence)) {
        const node = nodeById.get(point.nodeId);
        if (!node || !routeNodeIds.has(node.id) || seen.has(node.id)) continue;
        seen.add(node.id);
        order.push(node);
      }
    }
    const rest = nodes.filter((node) => !seen.has(node.id)).sort((left, right) => compareText(left.name, right.name));
    rest.forEach((node, index) => order.push(rest[index - 1]?.name === node.name || rest[index + 1]?.name === node.name ? null : node));
    nodeOrders.set(routeId, order);
    return order;
  }

  /**
   * The copy's Node for a Node of another Scenario. The Route is the one with the same name in both Scenarios. A Node whose name is
   * unique in both Routes maps by name. A repeated name maps by position in the Route's Node order, and only when the two Routes
   * list the same names in the same order, so a reordered or edited Route never moves a reference onto a look-alike Node.
   */
  function mapToCopy(foreign: Node, copyScenarioId: EntityId): EntityId | undefined {
    const foreignRoute = routeById.get(foreign.routeId);
    if (!foreignRoute) return undefined;
    const sameRouteInSource = routesByScenarioAndName.get(`${foreignRoute.scenarioId}\u0000${foreignRoute.name}`) ?? [];
    const sameRouteInCopy = routesByScenarioAndName.get(`${copyScenarioId}\u0000${foreignRoute.name}`) ?? [];
    if (sameRouteInSource.length !== 1 || sameRouteInCopy.length !== 1) return undefined;
    const namedInSource = (nodesByRoute.get(foreignRoute.id) ?? []).filter((node) => node.name === foreign.name);
    const namedInCopy = (nodesByRoute.get(sameRouteInCopy[0].id) ?? []).filter((node) => node.name === foreign.name);
    if (namedInSource.length === 1 && namedInCopy.length === 1) return namedInCopy[0].id;
    const sourceOrder = routeNodeOrder(foreignRoute.id);
    const copyOrder = routeNodeOrder(sameRouteInCopy[0].id);
    if (sourceOrder.length !== copyOrder.length || sourceOrder.some((node, index) => !node || !copyOrder[index] || node.name !== copyOrder[index]!.name)) return undefined;
    const position = sourceOrder.findIndex((node) => node?.id === foreign.id);
    return position < 0 ? undefined : copyOrder[position]?.id;
  }

  /** The copy Node at the first or last stop of a Trip, when the Trip's Pattern runs through the copy's own Nodes. */
  function tripEndNode(tripId: EntityId, which: 'first' | 'last', scenarioId: EntityId): EntityId | undefined {
    const trip = tripById.get(tripId);
    const pattern = trip && patternById.get(trip.patternId);
    if (!trip || !pattern || !trip.stopTimes.length) return undefined;
    const stops = [...trip.stopTimes].sort((left, right) => left.sequence - right.sequence);
    const stop = which === 'first' ? stops[0] : stops[stops.length - 1];
    const node = nodeById.get(pattern.points.find((point) => point.id === stop.patternPointId)?.nodeId ?? '');
    return node && node.scenarioId === scenarioId ? node.id : undefined;
  }

  /** Decision C8: the Node a non-revenue end must have, taken from the Trips on either side of it. */
  function inferFromAdjacentTrip(block: Block, activity: NonRevenueActivity, end: NodeEnd): EntityId | undefined {
    const ordered = [...block.activities].sort(bySequence);
    const at = ordered.findIndex((candidate) => candidate.id === activity.id);
    const revenueTripIdAt = (index: number) => { const candidate = ordered[index]; return candidate?.type === 'revenueTrip' ? candidate.tripId : undefined; };
    const before = () => { for (let index = at - 1; index >= 0; index -= 1) { const id = revenueTripIdAt(index); if (id) return id; } return undefined; };
    const after = () => { for (let index = at + 1; index < ordered.length; index += 1) { const id = revenueTripIdAt(index); if (id) return id; } return undefined; };
    const firstRevenue = () => { for (let index = 0; index < ordered.length; index += 1) { const id = revenueTripIdAt(index); if (id) return id; } return undefined; };
    const lastRevenue = () => { for (let index = ordered.length - 1; index >= 0; index -= 1) { const id = revenueTripIdAt(index); if (id) return id; } return undefined; };
    if (activity.type === 'pullOut' && end === 'toNodeId') { const id = firstRevenue(); return id ? tripEndNode(id, 'first', block.scenarioId) : undefined; }
    if (activity.type === 'pullIn' && end === 'fromNodeId') { const id = lastRevenue(); return id ? tripEndNode(id, 'last', block.scenarioId) : undefined; }
    if (activity.type === 'deadhead' && end === 'fromNodeId') { const id = before(); return id ? tripEndNode(id, 'last', block.scenarioId) : undefined; }
    if (activity.type === 'deadhead' && end === 'toNodeId') { const id = after(); return id ? tripEndNode(id, 'first', block.scenarioId) : undefined; }
    return undefined;
  }

  /** True when a Scenario in the chain of `sourceScenarioId` links is no longer there, so Nodes it owned may be gone with it. */
  function lineageBroken(scenario: Scenario): boolean {
    const seen = new Set<EntityId>([scenario.id]);
    let current = scenario;
    while (current.sourceScenarioId) {
      const next = scenarioById.get(current.sourceScenarioId);
      if (!next) return true;
      if (seen.has(next.id)) return false;
      seen.add(next.id);
      current = next;
    }
    return false;
  }

  const findings: ValidationFinding[] = [];
  let recoveredReferences = 0;
  const changedBlockIds: EntityId[] = [];

  const blocks = input.blocks.map((block) => {
    const scenario = scenarioById.get(block.scenarioId);
    if (!scenario?.sourceScenarioId) return block;
    const sourceMissing = lineageBroken(scenario);
    let changed = false;
    const activities = block.activities.map((activity) => {
      if (activity.type === 'revenueTrip') return activity;
      let next: NonRevenueActivity = activity;
      for (const end of ['fromNodeId', 'toNodeId'] as const) {
        const nodeId = (activity as { fromNodeId?: EntityId; toNodeId?: EntityId })[end];
        if (!nodeId) continue;
        const node = nodeById.get(nodeId);
        if (node?.scenarioId === block.scenarioId) continue;
        const unresolved = () => findings.push({
          ruleId: RULE_ID, severity: 'warning', category: 'operational', entityType: 'block', entityId: block.id, field: `${activity.type}.${end}`, messageKey: RULE_ID,
          parameters: { blockLabel: block.label, activityId: activity.id, activityType: activity.type, end: end === 'fromNodeId' ? 'from' : 'to' },
        });
        if (node) {
          // The Node exists in another Scenario: the source it was copied from, when the Routes and Nodes still line up.
          const target = mapToCopy(node, block.scenarioId);
          if (target) { next = { ...next, [end]: target } as NonRevenueActivity; recoveredReferences += 1; changed = true; } else unresolved();
        } else if (!sourceMissing) {
          // The Node exists nowhere although the copy's lineage is intact: not a leak that can be repaired. Left as it is.
          unresolved();
        } else {
          // A Scenario in the copy's lineage is gone, and its Nodes with it.
          const target = inferFromAdjacentTrip(block, activity, end);
          if (target) { next = { ...next, [end]: target } as NonRevenueActivity; recoveredReferences += 1; changed = true; continue; }
          unresolved();
          if (isOptionalEnd(activity, end)) {
            const { [end]: _gone, ...rest } = next as NonRevenueActivity & Record<NodeEnd, unknown>;
            next = rest as NonRevenueActivity;
            changed = true;
          }
        }
      }
      return next;
    });
    if (!changed) return block;
    changedBlockIds.push(block.id);
    return { ...block, activities };
  });

  return { blocks, changedBlockIds, recoveredReferences, findings };
}
