import type { PlannedFrequency } from '../domain/types';
import { validatePlannedFrequency } from '../domain/plannedFrequencies';

export interface PlannedFrequencyOwners {
  scenarioIds: ReadonlySet<string>;
  routes: Array<{ id: string; scenarioId: string }>;
  serviceDays: Array<{ id: string; scenarioId: string }>;
  directions: Array<{ id: string; routeId: string }>;
  nodes: Array<{ id: string; routeId: string }>;
}

/**
 * Refuse a write that would store a plan breaking Decision 0058: a missing or foreign owner, a second plan for one
 * Route × Service day, no periods, invalid periods, or a measure node that is not a node of the plan's Route for a
 * direction of that Route. A node that is no longer served is allowed (it falls back when read).
 */
export function assertPlannedFrequencies(plans: PlannedFrequency[], owners: PlannedFrequencyOwners): void {
  const routeById = new Map(owners.routes.map((route) => [route.id, route]));
  const dayById = new Map(owners.serviceDays.map((day) => [day.id, day]));
  const directionRoute = new Map(owners.directions.map((direction) => [direction.id, direction.routeId]));
  const nodeRoute = new Map(owners.nodes.map((node) => [node.id, node.routeId]));
  const ids = new Set<string>();
  const pairs = new Set<string>();
  for (const plan of plans) {
    const label = `Planned frequency ${plan.id}`;
    if (ids.has(plan.id)) throw new Error(`Duplicate planned frequency id ${plan.id}.`);
    ids.add(plan.id);
    if (!owners.scenarioIds.has(plan.scenarioId)) throw new Error(`${label} references a missing Scenario.`);
    const route = routeById.get(plan.routeId);
    if (!route || route.scenarioId !== plan.scenarioId) throw new Error(`${label} references a missing Route.`);
    const day = dayById.get(plan.serviceDayId);
    if (!day || day.scenarioId !== plan.scenarioId) throw new Error(`${label} references a missing Service day.`);
    const pair = `${plan.routeId}\u0000${plan.serviceDayId}`;
    if (pairs.has(pair)) throw new Error(`Route ${plan.routeId} has more than one planned frequency for Service day ${plan.serviceDayId}.`);
    pairs.add(pair);
    if (!Array.isArray(plan.periods) || plan.periods.length === 0) throw new Error(`${label} has no periods.`);
    const periodIds = new Set<string>();
    for (const period of plan.periods) {
      if (typeof period.id !== 'string' || !period.id || periodIds.has(period.id)) throw new Error(`${label} has a missing or duplicate period id.`);
      periodIds.add(period.id);
    }
    const errors = validatePlannedFrequency(plan, { directions: [], patterns: [] });
    if (errors.length) throw new Error(`${label} is invalid: ${[...new Set(errors.map((finding) => finding.ruleId))].join(', ')}`);
    for (const [directionId, nodeId] of Object.entries(plan.measureNodeIdByDirectionId ?? {})) {
      if (directionRoute.get(directionId) !== plan.routeId) throw new Error(`${label} names a direction that is not on its Route.`);
      if (nodeRoute.get(nodeId) !== plan.routeId) throw new Error(`${label} names a measure node that is not on its Route.`);
    }
  }
}
