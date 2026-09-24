import type { CostingAssumptions } from '../domain/types';
import { validatePersistedCostingAssumptions } from '../domain/costing';

export function assertCostingAssumptions(value: CostingAssumptions, scenarioId: string): void {
  const errors = validatePersistedCostingAssumptions(value, scenarioId).filter((finding) => finding.severity === 'error');
  if (errors.length) throw new Error(`Invalid costing assumptions: ${errors.map((finding) => finding.code).join(', ')}`);
}

export function assertCostingAssumptionsCollection(values: CostingAssumptions[], scenarioIds: ReadonlySet<string>): void {
  const ids = new Set<string>();
  const owners = new Set<string>();
  for (const value of values) {
    assertCostingAssumptions(value, value.scenarioId);
    if (!scenarioIds.has(value.scenarioId)) throw new Error(`Costing assumptions ${value.id} reference a missing Scenario.`);
    if (ids.has(value.id)) throw new Error(`Duplicate costing assumptions id ${value.id}.`);
    if (owners.has(value.scenarioId)) throw new Error(`Scenario ${value.scenarioId} has more than one costing assumptions record.`);
    ids.add(value.id);
    owners.add(value.scenarioId);
  }
}
