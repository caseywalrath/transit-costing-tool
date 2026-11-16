import type { CostingAssumptionsInput } from '../domain/costing';
import type { CostingEstimateFactors, CostingFactorPair, Node, RoutePattern } from '../domain/types';

const nodeKey = (node: Node) => JSON.stringify([node.name, node.shortName ?? '', node.kind, node.notes ?? '']);

/** How many edits the Node draft holds: each added or changed Node, and each saved Node marked for removal. Feeds the save bar's message. */
export function countNodeChanges(saved: readonly Node[], draft: readonly Node[], pendingDeleteIds: ReadonlySet<string>): number {
  const savedById = new Map(saved.map((node) => [node.id, node]));
  const changed = draft.filter((node) => !pendingDeleteIds.has(node.id) && (savedById.get(node.id) === undefined || nodeKey(savedById.get(node.id)!) !== nodeKey(node))).length;
  const removed = [...pendingDeleteIds].filter((id) => savedById.has(id)).length;
  return changed + removed;
}

/** How many edits a Pattern draft holds: each changed field, each point whose Node or miles changed, and each point added or removed. */
export function countPatternChanges(saved: RoutePattern | undefined, draft: RoutePattern): number {
  if (!saved) return 0;
  const fields = [draft.directionId !== saved.directionId, draft.name !== saved.name, (draft.directionLabel ?? '') !== (saved.directionLabel ?? '')].filter(Boolean).length;
  const shared = Math.min(saved.points.length, draft.points.length);
  const points = saved.points.slice(0, shared).filter((point, index) => point.nodeId !== draft.points[index].nodeId || point.cumulativeMiles !== draft.points[index].cumulativeMiles).length;
  return fields + points + Math.abs(saved.points.length - draft.points.length);
}

const assumptionKeys = ['enteredRate', 'rateYear', 'sourceType', 'sourceNote', 'baseServiceYear', 'futureYearCount', 'annualEscalation'] as const;

/** How many typed estimate factors differ from the saved ones: one per cell (All days and each service day, layover and deadhead). */
export function countEstimateFactorChanges(saved?: CostingEstimateFactors, draft?: CostingEstimateFactors): number {
  let changed = 0;
  const compare = (before: CostingFactorPair | undefined, after: CostingFactorPair | undefined) => {
    if (before?.layoverFraction !== after?.layoverFraction) changed += 1;
    if (before?.deadheadFraction !== after?.deadheadFraction) changed += 1;
  };
  compare(saved?.allDays, draft?.allDays);
  const dayIds = new Set([...(saved?.serviceDays ?? []), ...(draft?.serviceDays ?? [])].map((row) => row.serviceDayId));
  for (const serviceDayId of dayIds) {
    compare(saved?.serviceDays.find((row) => row.serviceDayId === serviceDayId), draft?.serviceDays.find((row) => row.serviceDayId === serviceDayId));
  }
  return changed;
}

/** How many Costing assumption fields differ from the saved values. */
export function countAssumptionChanges(saved: CostingAssumptionsInput, draft: CostingAssumptionsInput): number {
  return assumptionKeys.filter((key) => saved[key] !== draft[key]).length;
}
