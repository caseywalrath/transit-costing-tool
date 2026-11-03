import type { MinimumLayoverRule } from './blocking';
import type { EntityId, Node, RoutePattern, ValidationFinding } from './types';

/** Decision 0055 (automatic blocking). Shared types and rule validation; the engine is added by package AB2. */

/** One row per Pattern used by the Trip Profile. */
export interface AutoBlockingPatternRule {
  patternId: EntityId;
  /** Undefined = no minimum. Same shape and meaning as Decision 0050, applied after a Trip on this Pattern. */
  minimumLayover?: MinimumLayoverRule;
  breakAllowed: boolean; // "Break here"
  canStart: boolean; // "Block can start" at the Pattern's first node
  canEnd: boolean; // "Block can end" at the Pattern's last node
}
export interface AutoBlockingBreakRule {
  lengthMinutes: number; // whole minutes >= 1; includes the minimum layover
  minimumBlockHours: number; // >= 0; blocks whose span is <= this get no break
  firstBreakAfterHours: number; // >= 0; hours after the Block's first departure
  anotherBreakAfterHours?: number; // > 0 when present; hours after the previous break ended
}
export interface AutoBlockingTerminalRule {
  nodeId: EntityId;
  pullOutMinutes: number; // whole minutes >= 0, before the first Trip
  pullInMinutes: number; // whole minutes >= 0, after the last Trip
  miles?: number; // >= 0, each way; only used when the Route has a garage
}
export interface AutoBlockingGarage { routeId: EntityId; nodeId: EntityId } // node of kind 'garage' on that Route
export interface AutoBlockingDeadheadRule {
  fromNodeId: EntityId;
  toNodeId: EntityId; // different nodes of the same Route
  minutes: number; // whole minutes >= 0
  miles?: number; // >= 0
  bothWays: boolean;
}
export interface AutoBlockingRules {
  serviceDayIds: EntityId[]; // at least one; each has Trips in the Trip Profile
  patterns: AutoBlockingPatternRule[];
  break?: AutoBlockingBreakRule; // undefined = no breaks
  maxRunningHours?: number; // > 0 when present
  maxRevenueMiles?: number; // > 0 when present
  garages: AutoBlockingGarage[]; // at most one per Route
  terminals: AutoBlockingTerminalRule[];
  deadheads: AutoBlockingDeadheadRule[];
}
export interface AutoBlockingRecord {
  rules: AutoBlockingRules;
  builtAt: string; // ISO timestamp; equals the generated Blocks' updatedAt
  tripCount: number; // Trips placed in Blocks at build time
  blockCount: number; // Blocks at build time
  sourceBlockingScenarioId?: EntityId; // when rules were read from built blocks
}

export interface AutoBlockingValidationContext { patterns: RoutePattern[]; nodes: Node[]; serviceDayIds: EntityId[] }

const ENTITY_ID = 'auto-blocking-rules';

function problem(problemKey: string, field: string, parameters?: Record<string, string | number>): ValidationFinding {
  return { ruleId: `autoBlocking.${problemKey}`, severity: 'error', category: 'structural', entityType: 'autoBlocking', entityId: ENTITY_ID, field, messageKey: `autoBlocking.${problemKey}`, ...(parameters ? { parameters } : {}) };
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isWholeNumber = (value: unknown): value is number => isFiniteNumber(value) && Number.isInteger(value);

/** Validates stored or edited automatic-blocking rules against the Project's Patterns, Nodes and Service Days. Pure. */
export function validateAutoBlockingRules(rules: AutoBlockingRules, context: AutoBlockingValidationContext): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const patterns = new Map(context.patterns.map((pattern) => [pattern.id, pattern]));
  const nodes = new Map(context.nodes.map((node) => [node.id, node]));
  const serviceDays = new Set(context.serviceDayIds);

  if (!Array.isArray(rules.serviceDayIds) || rules.serviceDayIds.length === 0) findings.push(problem('serviceDaysRequired', 'serviceDayIds'));
  else {
    const seen = new Set<EntityId>();
    rules.serviceDayIds.forEach((id, index) => {
      if (!serviceDays.has(id)) findings.push(problem('serviceDayUnknown', `serviceDayIds[${index}]`));
      else if (seen.has(id)) findings.push(problem('serviceDayDuplicate', `serviceDayIds[${index}]`));
      seen.add(id);
    });
  }

  const seenPatterns = new Set<EntityId>();
  (rules.patterns ?? []).forEach((row, index) => {
    const field = `patterns[${index}]`;
    if (!patterns.has(row.patternId)) findings.push(problem('patternUnknown', `${field}.patternId`));
    else if (seenPatterns.has(row.patternId)) findings.push(problem('patternDuplicate', `${field}.patternId`));
    seenPatterns.add(row.patternId);
    const layover = row.minimumLayover;
    if (layover) {
      if (layover.mode !== 'minutes' && layover.mode !== 'percent') findings.push(problem('layoverMode', `${field}.minimumLayover`));
      else if (!isFiniteNumber(layover.value) || layover.value < 0) findings.push(problem('layoverValue', `${field}.minimumLayover`));
      else if (layover.mode === 'minutes' && !Number.isInteger(layover.value)) findings.push(problem('layoverMinutesWhole', `${field}.minimumLayover`));
      else if (layover.mode === 'percent' && layover.value > 100) findings.push(problem('layoverPercentRange', `${field}.minimumLayover`));
    }
    for (const flag of ['breakAllowed', 'canStart', 'canEnd'] as const) {
      if (typeof row[flag] !== 'boolean') findings.push(problem('flagInvalid', `${field}.${flag}`));
    }
  });

  const rule = rules.break;
  if (rule) {
    if (!isWholeNumber(rule.lengthMinutes) || rule.lengthMinutes < 1) findings.push(problem('breakLength', 'break.lengthMinutes'));
    if (!isFiniteNumber(rule.minimumBlockHours) || rule.minimumBlockHours < 0) findings.push(problem('breakMinimumBlock', 'break.minimumBlockHours'));
    if (!isFiniteNumber(rule.firstBreakAfterHours) || rule.firstBreakAfterHours < 0) findings.push(problem('breakFirstAfter', 'break.firstBreakAfterHours'));
    if (rule.anotherBreakAfterHours !== undefined && (!isFiniteNumber(rule.anotherBreakAfterHours) || rule.anotherBreakAfterHours <= 0)) findings.push(problem('breakAnotherAfter', 'break.anotherBreakAfterHours'));
  }

  if (rules.maxRunningHours !== undefined && (!isFiniteNumber(rules.maxRunningHours) || rules.maxRunningHours <= 0)) findings.push(problem('limitRunningHours', 'maxRunningHours'));
  if (rules.maxRevenueMiles !== undefined && (!isFiniteNumber(rules.maxRevenueMiles) || rules.maxRevenueMiles <= 0)) findings.push(problem('limitRevenueMiles', 'maxRevenueMiles'));

  const garageRoutes = new Set<EntityId>();
  (rules.garages ?? []).forEach((garage, index) => {
    const field = `garages[${index}]`;
    const node = nodes.get(garage.nodeId);
    if (!node) findings.push(problem('garageNodeUnknown', `${field}.nodeId`));
    else if (node.kind !== 'garage') findings.push(problem('garageNodeKind', `${field}.nodeId`));
    else if (node.routeId !== garage.routeId) findings.push(problem('garageRoute', `${field}.routeId`));
    if (garageRoutes.has(garage.routeId)) findings.push(problem('garageDuplicate', `${field}.routeId`));
    garageRoutes.add(garage.routeId);
  });

  const seenTerminals = new Set<EntityId>();
  (rules.terminals ?? []).forEach((row, index) => {
    const field = `terminals[${index}]`;
    if (!nodes.has(row.nodeId)) findings.push(problem('terminalNodeUnknown', `${field}.nodeId`));
    else if (seenTerminals.has(row.nodeId)) findings.push(problem('terminalDuplicate', `${field}.nodeId`));
    seenTerminals.add(row.nodeId);
    if (!isWholeNumber(row.pullOutMinutes) || row.pullOutMinutes < 0) findings.push(problem('pullOutMinutes', `${field}.pullOutMinutes`));
    if (!isWholeNumber(row.pullInMinutes) || row.pullInMinutes < 0) findings.push(problem('pullInMinutes', `${field}.pullInMinutes`));
    if (row.miles !== undefined && (!isFiniteNumber(row.miles) || row.miles < 0)) findings.push(problem('terminalMiles', `${field}.miles`));
  });

  (rules.deadheads ?? []).forEach((row, index) => {
    const field = `deadheads[${index}]`;
    const from = nodes.get(row.fromNodeId);
    const to = nodes.get(row.toNodeId);
    if (!from) findings.push(problem('deadheadNodeUnknown', `${field}.fromNodeId`));
    if (!to) findings.push(problem('deadheadNodeUnknown', `${field}.toNodeId`));
    if (from && to) {
      if (from.id === to.id) findings.push(problem('deadheadSameNode', `${field}.toNodeId`));
      else if (from.routeId !== to.routeId) findings.push(problem('deadheadRoute', `${field}.toNodeId`));
    }
    if (!isWholeNumber(row.minutes) || row.minutes < 0) findings.push(problem('deadheadMinutes', `${field}.minutes`));
    if (row.miles !== undefined && (!isFiniteNumber(row.miles) || row.miles < 0)) findings.push(problem('deadheadMiles', `${field}.miles`));
    if (typeof row.bothWays !== 'boolean') findings.push(problem('flagInvalid', `${field}.bothWays`));
  });

  return findings;
}

export interface AutoBlockingIdMaps {
  patterns: Map<EntityId, EntityId>;
  routes: Map<EntityId, EntityId>;
  nodes: Map<EntityId, EntityId>;
  serviceDays: Map<EntityId, EntityId>;
  blockingScenarios: Map<EntityId, EntityId>;
}

/**
 * Remaps every identifier inside a stored `autoBlocking` record for a copy or an import and sets `builtAt` to `now`.
 * A row whose reference has no mapping is dropped; a source Blocking Scenario outside the copied set is dropped.
 */
export function remapAutoBlockingRecord(record: AutoBlockingRecord, maps: AutoBlockingIdMaps, now: string): AutoBlockingRecord {
  const rules = record.rules;
  const nodeOf = (id: EntityId) => maps.nodes.get(id);
  const sourceId = record.sourceBlockingScenarioId === undefined ? undefined : maps.blockingScenarios.get(record.sourceBlockingScenarioId);
  const remapped: AutoBlockingRules = {
    ...rules,
    serviceDayIds: (rules.serviceDayIds ?? []).flatMap((id) => { const mapped = maps.serviceDays.get(id); return mapped === undefined ? [] : [mapped]; }),
    patterns: (rules.patterns ?? []).flatMap((row) => { const mapped = maps.patterns.get(row.patternId); return mapped === undefined ? [] : [{ ...row, patternId: mapped }]; }),
    garages: (rules.garages ?? []).flatMap((row) => { const routeId = maps.routes.get(row.routeId); const nodeId = nodeOf(row.nodeId); return routeId === undefined || nodeId === undefined ? [] : [{ routeId, nodeId }]; }),
    terminals: (rules.terminals ?? []).flatMap((row) => { const nodeId = nodeOf(row.nodeId); return nodeId === undefined ? [] : [{ ...row, nodeId }]; }),
    deadheads: (rules.deadheads ?? []).flatMap((row) => { const fromNodeId = nodeOf(row.fromNodeId); const toNodeId = nodeOf(row.toNodeId); return fromNodeId === undefined || toNodeId === undefined ? [] : [{ ...row, fromNodeId, toNodeId }]; }),
  };
  const { sourceBlockingScenarioId: _dropped, ...rest } = record;
  return { ...rest, rules: remapped, builtAt: now, ...(sourceId === undefined ? {} : { sourceBlockingScenarioId: sourceId }) };
}
