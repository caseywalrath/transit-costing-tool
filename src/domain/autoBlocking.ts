import { normalizeBlockActivities, requiredLayoverSeconds, summarizeBlockingScenario, validateBlockingBlock, type MinimumLayoverRule, type MinimumLayoverRules } from './blocking';
import { patternDirectionGroups, type DirectionGroup } from './directions';
import { metadata, newId as defaultNewId } from './ids';
import { patternTotalMiles } from './patterns';
import { sortServiceDays } from './serviceDays';
import { tripRunTimeSeconds } from './trips';
import type { BlockActivity, BlockingBlock, BlockingScenario, EntityId, Node, Route, RouteDirection, RoutePattern, ServiceDayDefinition, Trip, ValidationFinding } from './types';

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
  maxVehicles?: number; // whole number >= 1 when present (Decision 0056 item 9)
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

  if (rules.maxVehicles !== undefined && (!isWholeNumber(rules.maxVehicles) || rules.maxVehicles < 1)) findings.push(problem('limitVehicles', 'maxVehicles'));

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

// ---------------------------------------------------------------------------------------------------------------------
// Engine (package AB2). Pure: no React, no IndexedDB. Rules: Decision 0055 items 4 to 13.
// ---------------------------------------------------------------------------------------------------------------------

export interface AutoBlockingContext {
  scenarioId: EntityId;
  routes: Route[]; patterns: RoutePattern[]; nodes: Node[]; directions: RouteDirection[];
  serviceDays: ServiceDayDefinition[];
  trips: Trip[]; // all Trips of the Trip Profile (any day)
}
export interface AutoBlockingBuildInput extends AutoBlockingContext {
  blockingScenario: BlockingScenario; // the new, unsaved scenario (id, scenarioId, tripProfileId)
  rules: AutoBlockingRules;
  now: string;
  newId?: () => EntityId;
}
export interface AutoBlockingDaySummary {
  serviceDayId: EntityId; tripCount: number; blockCount: number; peakVehicles: number;
  revenueSeconds: number; runningSeconds: number; layoverSeconds: number; layoverPercent?: number;
  longestBlockSeconds: number;
  blocksWithOneBreak: number; blocksWithTwoOrMoreBreaks: number;
}
export interface AutoBlockingResult {
  blocks: BlockingBlock[];
  days: AutoBlockingDaySummary[];
  findings: ValidationFinding[];
  blockFindings: ValidationFinding[];
  passes: number;
}

const MAX_BREAK_PASSES = 5;

/** The largest number of intervals open at one time. Intervals are [start, end): one that ends at t does not overlap one that starts at t. */
export function peakVehicles(intervals: Array<{ start: number; end: number }>): number {
  const events = intervals.flatMap(({ start, end }) => [{ at: start, delta: 1 }, { at: end, delta: -1 }]).sort((left, right) => left.at - right.at || left.delta - right.delta);
  let open = 0; let peak = 0;
  for (const event of events) { open += event.delta; peak = Math.max(peak, open); }
  return peak;
}
const isStartEndKind = (node: Node | undefined) => node?.kind === 'terminal' || node?.kind === 'garage';

function autoFinding(ruleId: string, level: 'warning' | 'info', entityId: EntityId, parameters?: Record<string, string | number>): ValidationFinding {
  // `ValidationSeverity` has only 'error' and 'warning', so an "info" finding (see the plan's findings table) is stored as a warning.
  // Its rule ID identifies it; `level` documents the intent at the call site.
  void level;
  return { ruleId, severity: 'warning', category: 'operational', entityType: 'autoBlocking', entityId, messageKey: ruleId, ...(parameters ? { parameters } : {}) };
}

function firstAndLastPoint(pattern: RoutePattern) {
  const points = [...pattern.points].sort((left, right) => left.sequence - right.sequence);
  return { first: points[0], last: points.at(-1) };
}

function groupRank(group: DirectionGroup | undefined): number { return group === 'outbound' ? 0 : group === 'inbound' ? 1 : 2; }

/** Decision 0055 item 6: a pattern row from the node kinds of the Pattern's ends and the Blocking tab's layover preference. */
function defaultPatternRule(pattern: RoutePattern, nodes: Map<EntityId, Node>, group: DirectionGroup | undefined, preference?: MinimumLayoverRules): AutoBlockingPatternRule {
  const { first, last } = firstAndLastPoint(pattern);
  const canStart = isStartEndKind(first ? nodes.get(first.nodeId) : undefined);
  const canEnd = isStartEndKind(last ? nodes.get(last.nodeId) : undefined);
  const minimumLayover = group ? preference?.[group] : undefined;
  return { patternId: pattern.id, ...(minimumLayover ? { minimumLayover: { ...minimumLayover } } : {}), breakAllowed: canEnd, canStart, canEnd };
}

export function defaultAutoBlockingRules(context: AutoBlockingContext, tripProfileId: EntityId, preference?: MinimumLayoverRules): AutoBlockingRules {
  const trips = context.trips.filter((trip) => trip.scenarioId === context.scenarioId && trip.tripProfileId === tripProfileId);
  const dayIds = new Set(trips.map((trip) => trip.serviceDayId));
  const patternIds = new Set(trips.map((trip) => trip.patternId));
  const nodes = new Map(context.nodes.map((node) => [node.id, node]));
  const routeName = new Map(context.routes.map((route) => [route.id, route.name]));
  const groups = patternDirectionGroups(context.patterns, context.directions);
  const used = context.patterns.filter((pattern) => patternIds.has(pattern.id)).sort((left, right) =>
    (routeName.get(left.routeId) ?? '').localeCompare(routeName.get(right.routeId) ?? '')
    || groupRank(groups.get(left.id)) - groupRank(groups.get(right.id))
    || (left.sequence ?? 0) - (right.sequence ?? 0)
    || left.name.localeCompare(right.name));
  const patterns = used.map((pattern) => defaultPatternRule(pattern, nodes, groups.get(pattern.id), preference));
  const terminalIds = new Set<EntityId>();
  used.forEach((pattern, index) => {
    const { first, last } = firstAndLastPoint(pattern);
    if (patterns[index].canStart && first) terminalIds.add(first.nodeId);
    if (patterns[index].canEnd && last) terminalIds.add(last.nodeId);
  });
  const terminals = [...terminalIds].flatMap((nodeId) => nodes.has(nodeId) ? [nodes.get(nodeId)!] : [])
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .map((node) => ({ nodeId: node.id, pullOutMinutes: 0, pullInMinutes: 0 }));
  return { serviceDayIds: sortServiceDays(context.serviceDays).filter((day) => dayIds.has(day.id)).map((day) => day.id), patterns, garages: [], terminals, deadheads: [] };
}

interface TripFact { trip: Trip; routeId: EntityId; patternId: EntityId; origin: EntityId; destination: EntityId; dep: number; arr: number; run: number; miles?: number }

function tripFact(trip: Trip, patterns: Map<EntityId, RoutePattern>): TripFact | undefined {
  const run = tripRunTimeSeconds(trip);
  const pattern = patterns.get(trip.patternId);
  if (run === undefined || !pattern) return undefined;
  const stops = [...trip.stopTimes].sort((left, right) => left.sequence - right.sequence);
  const nodeOf = (pointId: EntityId) => pattern.points.find((point) => point.id === pointId)?.nodeId;
  const origin = nodeOf(stops[0].patternPointId); const destination = nodeOf(stops.at(-1)!.patternPointId);
  if (!origin || !destination) return undefined;
  return { trip, routeId: trip.routeId, patternId: trip.patternId, origin, destination, dep: stops[0].time, arr: stops.at(-1)!.time, run, miles: patternTotalMiles(pattern) };
}

interface UsedDeadhead { from: EntityId; to: EntityId; minutes: number; miles?: number }
interface Vehicle {
  index: number; firstTripId: EntityId; firstDeparture: number; atNodeId: EntityId; readyAt: number; runningSeconds: number;
  revenueMiles?: number; breaks: number; lastBreakEndAt?: number; lastPatternId: EntityId; lastArrival: number;
  items: Array<{ fact: TripFact; deadhead?: UsedDeadhead }>;
}

interface BuildEnvironment {
  rules: AutoBlockingRules;
  ruleOf: (patternId: EntityId) => AutoBlockingPatternRule;
  milesLimitActive: boolean;
}

function findConnection(rules: AutoBlockingRules, from: EntityId, to: EntityId): UsedDeadhead | undefined {
  let best: UsedDeadhead | undefined;
  for (const row of rules.deadheads) {
    const forward = row.fromNodeId === from && row.toNodeId === to;
    const reverse = row.bothWays && row.fromNodeId === to && row.toNodeId === from;
    if ((forward || reverse) && (!best || row.minutes < best.minutes)) best = { from, to, minutes: row.minutes, ...(row.miles === undefined ? {} : { miles: row.miles }) };
  }
  return best;
}

/** How chainPass picks among open Blocks that can take a Trip (Decision 0056 items 1 and 2). */
export type AutoBlockingChoice = 'mostRecentlyReady' | 'readyLongest';

/**
 * One chaining pass over the Trips of one (service day, Route), already sorted by first departure then Trip id.
 * A direct candidate (already at the Trip's first node) always wins over a deadhead candidate. Among candidates of the
 * same kind, 'mostRecentlyReady' takes the latest effective ready time (Decision 0056) and 'readyLongest' the earliest
 * (Decision 0055 item 4). An equal ready time keeps the earlier-created Block.
 */
function chainPass(facts: TripFact[], env: BuildEnvironment, suppressed: ReadonlySet<EntityId>, ownerId: EntityId, choice: AutoBlockingChoice): { vehicles: Vehicle[]; findings: ValidationFinding[] } {
  const { rules } = env;
  const vehicles: Vehicle[] = []; const findings: ValidationFinding[] = [];
  const maxRunning = rules.maxRunningHours === undefined ? undefined : rules.maxRunningHours * 3600;
  const maxMiles = env.milesLimitActive ? rules.maxRevenueMiles : undefined;
  for (const fact of facts) {
    const rule = env.ruleOf(fact.patternId);
    const fits = (vehicle: Vehicle) => (maxRunning === undefined || vehicle.runningSeconds + fact.run <= maxRunning)
      && (maxMiles === undefined || fact.miles === undefined || vehicle.revenueMiles === undefined || vehicle.revenueMiles + fact.miles <= maxMiles);
    if ((maxRunning !== undefined && fact.run > maxRunning) || (maxMiles !== undefined && fact.miles !== undefined && fact.miles > maxMiles)) {
      findings.push(autoFinding('autoBlocking.tripExceedsLimit', 'warning', ownerId, { tripId: fact.trip.id }));
    }
    let chosen: { vehicle: Vehicle; effectiveReady: number; direct: boolean; deadhead?: UsedDeadhead } | undefined;
    for (const vehicle of vehicles) {
      if (!fits(vehicle)) continue;
      let candidate: { effectiveReady: number; direct: boolean; deadhead?: UsedDeadhead } | undefined;
      if (vehicle.atNodeId === fact.origin) {
        if (vehicle.readyAt <= fact.dep) candidate = { effectiveReady: vehicle.readyAt, direct: true };
      } else {
        const connection = findConnection(rules, vehicle.atNodeId, fact.origin);
        if (connection && vehicle.readyAt + connection.minutes * 60 <= fact.dep) candidate = { effectiveReady: vehicle.readyAt + connection.minutes * 60, direct: false, deadhead: connection };
      }
      if (!candidate) continue;
      const better = choice === 'mostRecentlyReady' ? candidate.effectiveReady > (chosen?.effectiveReady ?? 0) : candidate.effectiveReady < (chosen?.effectiveReady ?? 0);
      if (!chosen || (candidate.direct && !chosen.direct) || (candidate.direct === chosen.direct && better)) chosen = { vehicle, ...candidate };
    }
    let vehicle: Vehicle; let deadhead: UsedDeadhead | undefined;
    if (chosen) { vehicle = chosen.vehicle; deadhead = chosen.deadhead; }
    else {
      vehicle = { index: vehicles.length, firstTripId: fact.trip.id, firstDeparture: fact.dep, atNodeId: fact.origin, readyAt: fact.dep, runningSeconds: 0, revenueMiles: 0, breaks: 0, lastPatternId: fact.patternId, lastArrival: fact.dep, items: [] };
      vehicles.push(vehicle);
      if (!rule.canStart) findings.push(autoFinding('autoBlocking.startNotAllowed', 'warning', ownerId, { tripId: fact.trip.id, patternId: fact.patternId }));
    }
    vehicle.items.push({ fact, ...(deadhead ? { deadhead } : {}) });
    vehicle.atNodeId = fact.destination; vehicle.runningSeconds += fact.run; vehicle.lastPatternId = fact.patternId; vehicle.lastArrival = fact.arr;
    vehicle.revenueMiles = vehicle.revenueMiles !== undefined && fact.miles !== undefined ? vehicle.revenueMiles + fact.miles : undefined;
    let wait = requiredLayoverSeconds(rule.minimumLayover, fact.run) ?? 0;
    const breakRule = rules.break;
    if (breakRule && rule.breakAllowed && !suppressed.has(vehicle.firstTripId)) {
      const eligible = vehicle.breaks === 0
        ? fact.arr - vehicle.firstDeparture >= breakRule.firstBreakAfterHours * 3600
        : breakRule.anotherBreakAfterHours !== undefined && vehicle.lastBreakEndAt !== undefined && fact.arr - vehicle.lastBreakEndAt >= breakRule.anotherBreakAfterHours * 3600;
      if (eligible) { wait = Math.max(wait, breakRule.lengthMinutes * 60); vehicle.breaks += 1; vehicle.lastBreakEndAt = fact.arr + breakRule.lengthMinutes * 60; }
    }
    vehicle.readyAt = fact.arr + wait;
  }
  return { vehicles, findings };
}

export function buildAutoBlocks(input: AutoBlockingBuildInput): AutoBlockingResult {
  const { rules, blockingScenario, now } = input;
  const nextId = input.newId ?? defaultNewId;
  const ownerId = blockingScenario.id;
  const patterns = new Map(input.patterns.map((pattern) => [pattern.id, pattern]));
  const nodes = new Map(input.nodes.map((node) => [node.id, node]));
  const groups = patternDirectionGroups(input.patterns, input.directions);
  const findings: ValidationFinding[] = [];
  const dayIds = new Set(rules.serviceDayIds);
  const inScope = input.trips.filter((trip) => trip.scenarioId === input.scenarioId && trip.tripProfileId === blockingScenario.tripProfileId && dayIds.has(trip.serviceDayId));

  const facts: TripFact[] = [];
  for (const trip of [...inScope].sort((left, right) => left.id.localeCompare(right.id))) {
    const fact = tripFact(trip, patterns);
    if (fact) facts.push(fact); else findings.push(autoFinding('autoBlocking.tripWithoutTimes', 'info', ownerId, { tripId: trip.id }));
  }

  const rows = new Map(rules.patterns.map((row) => [row.patternId, row]));
  const reportedMissing = new Set<EntityId>();
  const ruleOf = (patternId: EntityId): AutoBlockingPatternRule => {
    const row = rows.get(patternId);
    if (row) return row;
    const pattern = patterns.get(patternId)!;
    const created = defaultPatternRule(pattern, nodes, groups.get(patternId));
    rows.set(patternId, created);
    if (!reportedMissing.has(patternId)) { reportedMissing.add(patternId); findings.push(autoFinding('autoBlocking.patternRuleMissing', 'warning', ownerId, { patternId })); }
    return created;
  };
  // Resolve every missing row before any pass so the finding order does not depend on the chain.
  [...new Set(facts.map((fact) => fact.patternId))].sort().forEach((patternId) => ruleOf(patternId));

  const milesKnown = facts.every((fact) => fact.miles !== undefined);
  const milesLimitActive = rules.maxRevenueMiles !== undefined && milesKnown;
  if (rules.maxRevenueMiles !== undefined && !milesKnown) findings.push(autoFinding('autoBlocking.revenueMilesUnavailable', 'warning', ownerId));
  const env: BuildEnvironment = { rules, ruleOf, milesLimitActive };

  const routes = [...input.routes].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const garageOf = new Map(rules.garages.map((garage) => [garage.routeId, garage.nodeId]));
  const terminalOf = new Map(rules.terminals.map((row) => [row.nodeId, row]));
  const days: AutoBlockingDaySummary[] = []; const blocks: BlockingBlock[] = [];
  let passes = 1;

  /** The Vehicle's in-service interval: first departure minus pull-out minutes to last arrival plus pull-in minutes. */
  const vehicleInterval = (vehicle: Vehicle) => ({
    start: vehicle.firstDeparture - (terminalOf.get(vehicle.items[0].fact.origin)?.pullOutMinutes ?? 0) * 60,
    end: vehicle.lastArrival + (terminalOf.get(vehicle.items.at(-1)!.fact.destination)?.pullInMinutes ?? 0) * 60,
  });

  /** Builds one service day (all Routes, with the break rebuilding passes) with one vehicle choice. Findings are returned, not recorded. */
  const buildDay = (dayId: EntityId, choice: AutoBlockingChoice) => {
    const dayVehicles: Array<{ route: Route; vehicle: Vehicle }> = [];
    const dayFindings: ValidationFinding[] = []; let dayPasses = 1;
    for (const route of routes) {
      const routeFacts = facts.filter((fact) => fact.trip.serviceDayId === dayId && fact.routeId === route.id)
        .sort((left, right) => left.dep - right.dep || left.trip.id.localeCompare(right.trip.id));
      if (!routeFacts.length) continue;
      const suppressed = new Set<EntityId>();
      let result = chainPass(routeFacts, env, suppressed, ownerId, choice); let used = 1;
      for (; used <= MAX_BREAK_PASSES; used += 1) {
        const minimum = (rules.break?.minimumBlockHours ?? 0) * 3600;
        const short = result.vehicles.filter((vehicle) => vehicle.breaks > 0 && vehicle.lastArrival - vehicle.firstDeparture <= minimum && !suppressed.has(vehicle.firstTripId));
        if (!short.length) break;
        if (used === MAX_BREAK_PASSES) { dayFindings.push(autoFinding('autoBlocking.breakPassesExhausted', 'info', ownerId, { serviceDayId: dayId, routeId: route.id })); break; }
        short.forEach((vehicle) => suppressed.add(vehicle.firstTripId));
        result = chainPass(routeFacts, env, suppressed, ownerId, choice);
      }
      dayPasses = Math.max(dayPasses, Math.min(used, MAX_BREAK_PASSES));
      dayFindings.push(...result.findings);
      // A Trip ending where no Trip of the Route departs and no connection leaves breaks the chain.
      const departureNodes = new Set(routeFacts.map((fact) => fact.origin));
      const endingAt = new Map<EntityId, number>();
      routeFacts.forEach((fact) => endingAt.set(fact.destination, (endingAt.get(fact.destination) ?? 0) + 1));
      for (const [nodeId, tripCount] of [...endingAt].sort((left, right) => left[0].localeCompare(right[0]))) {
        const leaves = departureNodes.has(nodeId) || rules.deadheads.some((row) => row.fromNodeId === nodeId || (row.bothWays && row.toNodeId === nodeId));
        if (!leaves) dayFindings.push(autoFinding('autoBlocking.deadEndNode', 'warning', ownerId, { nodeId, tripCount, serviceDayId: dayId }));
      }
      result.vehicles.forEach((vehicle) => dayVehicles.push({ route, vehicle }));
    }
    return { dayVehicles, dayFindings, dayPasses, peak: peakVehicles(dayVehicles.map(({ vehicle }) => vehicleInterval(vehicle))), revenueSeconds: dayVehicles.reduce((sum, { vehicle }) => sum + vehicle.lastArrival - vehicle.firstDeparture, 0) };
  };

  for (const day of sortServiceDays(input.serviceDays).filter((candidate) => dayIds.has(candidate.id))) {
    let kept = buildDay(day.id, 'mostRecentlyReady');
    const limit = rules.maxVehicles;
    if (limit !== undefined && kept.peak > limit) {
      const alternate = buildDay(day.id, 'readyLongest');
      // Ready longest wins when it fits the limit; otherwise the lower peak wins and most recently ready keeps a tie.
      if (alternate.peak <= limit || alternate.peak < kept.peak) {
        alternate.dayFindings.push(autoFinding('autoBlocking.vehicleLimitAlternateRule', 'info', ownerId, { serviceDayId: day.id, revenueDifferenceSeconds: alternate.revenueSeconds - kept.revenueSeconds }));
        kept = alternate;
      }
      if (kept.peak > limit) kept.dayFindings.push(autoFinding('autoBlocking.vehicleLimitExceeded', 'warning', ownerId, { serviceDayId: day.id, peakVehicles: kept.peak, maxVehicles: limit }));
    }
    passes = Math.max(passes, kept.dayPasses);
    findings.push(...kept.dayFindings);
    const { dayVehicles } = kept;
    const order = [...dayVehicles].sort((left, right) =>
      routes.indexOf(left.route) - routes.indexOf(right.route) || left.vehicle.firstDeparture - right.vehicle.firstDeparture || left.vehicle.index - right.vehicle.index);
    const dayBlocks: BlockingBlock[] = [];
    order.forEach(({ route, vehicle }, position) => {
      const label = `Block ${position + 1}`;
      if (!env.ruleOf(vehicle.lastPatternId).canEnd) findings.push(autoFinding('autoBlocking.endNotAllowed', 'warning', ownerId, { blockLabel: label, patternId: vehicle.lastPatternId }));
      const first = vehicle.items[0].fact; const last = vehicle.items.at(-1)!.fact;
      const garage = garageOf.get(route.id);
      const startRow = terminalOf.get(first.origin); const endRow = terminalOf.get(last.destination);
      const activities: BlockActivity[] = [{ id: nextId(), type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: startRow?.pullOutMinutes ?? 0, fromNodeId: garage ?? first.origin, toNodeId: first.origin, ...(garage && startRow?.miles !== undefined ? { miles: startRow.miles } : {}) }];
      for (const item of vehicle.items) {
        if (item.deadhead) activities.push({ id: nextId(), type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: item.deadhead.minutes, fromNodeId: item.deadhead.from, toNodeId: item.deadhead.to, ...(item.deadhead.miles === undefined ? {} : { miles: item.deadhead.miles }) });
        activities.push({ id: nextId(), type: 'revenueTrip', sequence: 0, tripId: item.fact.trip.id });
      }
      activities.push({ id: nextId(), type: 'pullIn', sequence: 0, minutesAfterLastTrip: endRow?.pullInMinutes ?? 0, fromNodeId: last.destination, ...(garage ? { toNodeId: garage } : {}), ...(garage && endRow?.miles !== undefined ? { miles: endRow.miles } : {}) });
      // Activities are created in order; explicit sequence numbers keep `normalizeBlockActivities` (which sorts by sequence, then id) from reordering them.
      const ordered = activities.map((activity, sequence) => ({ ...activity, sequence }));
      const block: BlockingBlock = normalizeBlockActivities({ id: nextId(), scenarioId: blockingScenario.scenarioId, blockingScenarioId: blockingScenario.id, serviceDayId: day.id, label, activities: ordered, ...metadata(now) });
      dayBlocks.push(block);
    });
    blocks.push(...dayBlocks);
    const summary = summarizeBlockingScenario(blockingScenario, dayBlocks, { trips: input.trips, patterns: input.patterns });
    const seconds = (select: (block: (typeof summary.blockSummaries)[number]) => number | undefined, hours: number) =>
      summary.blockSummaries.every((block) => select(block) !== undefined) ? summary.blockSummaries.reduce((sum, block) => sum + select(block)!, 0) : Math.round(hours * 3600);
    days.push({
      serviceDayId: day.id,
      tripCount: order.reduce((sum, { vehicle }) => sum + vehicle.items.length, 0),
      blockCount: dayBlocks.length,
      peakVehicles: kept.peak,
      revenueSeconds: seconds((block) => block.revenueSeconds, summary.revenueHours),
      runningSeconds: Math.round(summary.runningHours * 3600),
      layoverSeconds: Math.round(summary.layoverHours * 3600),
      ...(summary.layoverPercent === undefined ? {} : { layoverPercent: summary.layoverPercent }),
      longestBlockSeconds: order.reduce((max, { vehicle }) => Math.max(max, vehicle.lastArrival - vehicle.firstDeparture), 0),
      blocksWithOneBreak: order.filter(({ vehicle }) => vehicle.breaks === 1).length,
      blocksWithTwoOrMoreBreaks: order.filter(({ vehicle }) => vehicle.breaks >= 2).length,
    });
  }

  const tripsById = new Map(input.trips.map((trip) => [trip.id, trip]));
  const blockFindings = blocks.flatMap((block) => validateBlockingBlock(block, { scenario: { id: input.scenarioId }, blockingScenario, trips: tripsById, patterns }));
  return { blocks, days, findings, blockFindings, passes };
}

const trimNumber = (value: number) => `${+value.toFixed(2)}`;

/** How many breaks a block of each length gets under the rule (Decision 0055 item 7). */
export function describeBreakRule(rule: AutoBlockingBreakRule | undefined, lengthsHours: number[] = [4, 8, 16]): Array<{ hours: number; breaks: number }> {
  return lengthsHours.map((hours) => {
    if (!rule || hours <= rule.minimumBlockHours) return { hours, breaks: 0 };
    let breaks = 0;
    const step = rule.anotherBreakAfterHours === undefined ? undefined : rule.anotherBreakAfterHours + rule.lengthMinutes / 60;
    while (rule.firstBreakAfterHours + breaks * (step ?? 0) < hours) {
      breaks += 1;
      if (step === undefined) break;
    }
    return { hours, breaks };
  });
}

function layoverText(rule: MinimumLayoverRule | undefined): string {
  if (!rule || rule.value === 0) return 'none';
  return rule.mode === 'minutes' ? `${trimNumber(rule.value)} min` : `${trimNumber(rule.value)}% of run time`;
}

/** A one-line plain-English summary of a rule set, for the provenance note. */
export function summarizeAutoBlockingRules(rules: AutoBlockingRules, patterns: RoutePattern[], nodes: Node[], serviceDays: ServiceDayDefinition[] = []): string {
  const patternName = new Map(patterns.map((pattern) => [pattern.id, pattern.name]));
  const nodeName = new Map(nodes.map((node) => [node.id, node.name]));
  const parts: string[] = [];
  if (rules.patterns.length) parts.push(`Minimum layover: ${rules.patterns.map((row) => `${patternName.get(row.patternId) ?? row.patternId} ${layoverText(row.minimumLayover)}`).join(', ')}`);
  const rule = rules.break;
  if (rule) {
    const after = rules.patterns.filter((row) => row.breakAllowed).map((row) => patternName.get(row.patternId) ?? row.patternId);
    let text = `break: ${trimNumber(rule.lengthMinutes)} min${after.length ? ` after ${after.join(', ')}` : ''}, from ${trimNumber(rule.firstBreakAfterHours)} h`;
    if (rule.minimumBlockHours > 0) text += `, blocks over ${trimNumber(rule.minimumBlockHours)} h`;
    if (rule.anotherBreakAfterHours !== undefined) text += ` · again after ${trimNumber(rule.anotherBreakAfterHours)} h`;
    parts.push(text);
  }
  if (rules.maxRunningHours !== undefined) parts.push(`max ${trimNumber(rules.maxRunningHours)} running h`);
  if (rules.maxRevenueMiles !== undefined) parts.push(`max ${trimNumber(rules.maxRevenueMiles)} revenue mi`);
  if (rules.maxVehicles !== undefined) parts.push(`max ${rules.maxVehicles} vehicles`);
  if (rules.garages.length) parts.push(`garage ${rules.garages.map((garage) => nodeName.get(garage.nodeId) ?? garage.nodeId).join(', ')}`);
  if (rules.deadheads.length) parts.push(`${rules.deadheads.length} deadhead connection${rules.deadheads.length === 1 ? '' : 's'}`);
  const dayNames = rules.serviceDayIds.map((id) => serviceDays.find((day) => day.id === id)?.name).filter((name): name is string => Boolean(name));
  if (dayNames.length) parts.push(dayNames.length === 1 ? dayNames[0] : `${dayNames.slice(0, -1).join(', ')} and ${dayNames.at(-1)}`);
  return parts.join(' · ');
}

// --- Reading rules from built blocks (Decision 0055 item 11) ---

export interface AutoBlockingMeasureInput {
  source: AutoBlockingContext & { blocks: BlockingBlock[] };
  target: AutoBlockingContext;
  targetRules: AutoBlockingRules;
}
export type AutoBlockingMatchBasis = 'sameName' | 'sameDirection' | 'notMatched';
export interface AutoBlockingMeasurementLine { targetPatternId?: EntityId; basis?: AutoBlockingMatchBasis; text: string }
export interface AutoBlockingMeasurement { rules: AutoBlockingRules; lines: AutoBlockingMeasurementLine[] }

interface SourcePatternFacts { patternId: EntityId; minGapSeconds?: number; canStart: boolean; canEnd: boolean; breakHere: boolean }
interface SourceBlockFacts { first: TripFact; last: TripFact; gaps: Array<{ afterPattern: EntityId; start: number; end: number }> }

/** The revenue Trips of each source Block with the layover gaps between them (a gap with a deadhead between its Trips is skipped). */
function sourceBlockFacts(source: AutoBlockingContext & { blocks: BlockingBlock[] }): SourceBlockFacts[] {
  const patterns = new Map(source.patterns.map((pattern) => [pattern.id, pattern]));
  const trips = new Map(source.trips.map((trip) => [trip.id, trip]));
  const result: SourceBlockFacts[] = [];
  for (const block of source.blocks) {
    const activities = [...block.activities].sort((left, right) => left.sequence - right.sequence);
    const items: Array<{ fact: TripFact; deadheadBefore: boolean }> = [];
    let deadhead = false;
    for (const activity of activities) {
      if (activity.type === 'deadhead') deadhead = true;
      else if (activity.type === 'revenueTrip') {
        const trip = trips.get(activity.tripId); const fact = trip ? tripFact(trip, patterns) : undefined;
        if (fact) items.push({ fact, deadheadBefore: deadhead });
        deadhead = false;
      }
    }
    if (!items.length) continue;
    const gaps = items.slice(1).flatMap((item, index) => item.deadheadBefore ? [] : [{ afterPattern: items[index].fact.patternId, start: items[index].fact.arr, end: item.fact.dep }]);
    result.push({ first: items[0].fact, last: items.at(-1)!.fact, gaps });
  }
  return result;
}

const floorTo = (value: number, step: number) => Math.floor(value / step) * step;

export function measureBuiltBlocks(input: AutoBlockingMeasureInput): AutoBlockingMeasurement {
  const { source, target, targetRules } = input;
  const blocks = sourceBlockFacts(source);
  const sourceGroups = patternDirectionGroups(source.patterns, source.directions);
  const sourceRoute = new Map(source.routes.map((route) => [route.id, route.name]));
  const facts = new Map<EntityId, SourcePatternFacts>();
  const factsOf = (patternId: EntityId) => { let entry = facts.get(patternId); if (!entry) { entry = { patternId, canStart: false, canEnd: false, breakHere: false }; facts.set(patternId, entry); } return entry; };
  for (const block of blocks) {
    factsOf(block.first.patternId).canStart = true; factsOf(block.last.patternId).canEnd = true;
    for (const gap of block.gaps) { const entry = factsOf(gap.afterPattern); const length = gap.end - gap.start; entry.minGapSeconds = entry.minGapSeconds === undefined ? length : Math.min(entry.minGapSeconds, length); }
  }
  const largestMinimumMinutes = Math.max(0, ...[...facts.values()].map((entry) => entry.minGapSeconds === undefined ? 0 : Math.floor(entry.minGapSeconds / 60)));

  // Break: the longest gap of each Block with at least two Trips. Only gaps longer than the largest minimum layover
  // plus 5 minutes count, so a Block with only turn layovers does not hide the break (Decision 0056 item 4).
  const longest = blocks.flatMap((block) => block.gaps.length ? [{ block, gap: block.gaps.reduce((best, gap) => gap.end - gap.start > best.end - best.start ? gap : best) }] : []);
  const breakGaps = longest.filter(({ gap }) => Math.floor((gap.end - gap.start) / 60) > largestMinimumMinutes + 5);
  let breakRule: AutoBlockingBreakRule | undefined; const lines: AutoBlockingMeasurementLine[] = [];
  if (breakGaps.length) {
    const lengthMinutes = floorTo(Math.min(...breakGaps.map(({ gap }) => gap.end - gap.start)) / 60, 5);
    const lengthSeconds = lengthMinutes * 60;
    breakGaps.forEach(({ gap }) => { factsOf(gap.afterPattern).breakHere = true; });
    const first = Math.min(...breakGaps.map(({ block, gap }) => gap.start - block.first.dep));
    const withBreak = blocks.filter((block) => block.gaps.some((gap) => gap.end - gap.start >= lengthSeconds));
    const shortestSpan = Math.min(...withBreak.map((block) => block.last.arr - block.first.dep));
    const intervals = withBreak.flatMap((block) => { const long = block.gaps.filter((gap) => gap.end - gap.start >= lengthSeconds); return long.length >= 2 ? [long[1].start - long[0].end] : []; });
    breakRule = {
      lengthMinutes,
      minimumBlockHours: Math.max(0, (Math.ceil(shortestSpan / 1800) - 1) / 2),
      firstBreakAfterHours: floorTo(first / 3600, 0.5),
      ...(intervals.length ? { anotherBreakAfterHours: Math.max(0.5, floorTo(Math.min(...intervals) / 3600, 0.5)) } : {}),
    };
  }

  const targetPatterns = new Map(target.patterns.map((pattern) => [pattern.id, pattern]));
  const targetRoute = new Map(target.routes.map((route) => [route.id, route.name]));
  const targetGroups = patternDirectionGroups(target.patterns, target.directions);
  const key = (route: string | undefined, name: string) => `${(route ?? '').trim().toLowerCase()}\u0000${name.trim().toLowerCase()}`;
  const sourceByName = new Map(source.patterns.map((pattern) => [key(sourceRoute.get(pattern.routeId), pattern.name), pattern.id]));
  const nameOf = (pattern: RoutePattern) => pattern.name;
  const patternRows: AutoBlockingPatternRule[] = targetRules.patterns.map((row) => {
    const pattern = targetPatterns.get(row.patternId);
    if (!pattern) return row;
    const group = targetGroups.get(pattern.id);
    const sameName = sourceByName.get(key(targetRoute.get(pattern.routeId), pattern.name));
    const sameNameFacts = sameName ? facts.get(sameName) : undefined;
    let matched: SourcePatternFacts[] = []; let basis: AutoBlockingMatchBasis = 'notMatched';
    if (sameNameFacts) { matched = [sameNameFacts]; basis = 'sameName'; }
    else if (group) {
      matched = [...facts.values()].filter((entry) => sourceGroups.get(entry.patternId) === group);
      if (matched.length) basis = 'sameDirection';
    }
    if (!matched.length) { lines.push({ targetPatternId: pattern.id, basis: 'notMatched', text: `${nameOf(pattern)}: no built pattern matched; the row is unchanged.` }); return row; }
    const gaps = matched.flatMap((entry) => entry.minGapSeconds === undefined ? [] : [Math.floor(entry.minGapSeconds / 60)]);
    const minutes = gaps.length ? Math.min(...gaps) : 0;
    const next: AutoBlockingPatternRule = {
      patternId: row.patternId,
      ...(minutes > 0 ? { minimumLayover: { mode: 'minutes' as const, value: minutes } } : {}),
      breakAllowed: breakRule ? matched.some((entry) => entry.breakHere) : row.breakAllowed,
      canStart: matched.some((entry) => entry.canStart),
      canEnd: matched.some((entry) => entry.canEnd),
    };
    const from = basis === 'sameName' ? `"${pattern.name}" (same name)` : `the ${group} patterns (same direction)`;
    lines.push({ targetPatternId: pattern.id, basis, text: `${nameOf(pattern)} ← ${from}: minimum layover ${minutes > 0 ? `${minutes} min` : 'none'}${next.canStart ? ', can start' : ''}${next.canEnd ? ', can end' : ''}${breakRule && next.breakAllowed ? ', break here' : ''}.` });
    return next;
  });
  if (breakRule) lines.push({ text: `Break: ${breakRule.lengthMinutes} min, first from ${trimNumber(breakRule.firstBreakAfterHours)} h, blocks over ${trimNumber(breakRule.minimumBlockHours)} h${breakRule.anotherBreakAfterHours !== undefined ? `, again after ${trimNumber(breakRule.anotherBreakAfterHours)} h` : ''}.` });
  else lines.push({ text: 'Break: none found in the built blocks; the break rule is unchanged.' });
  if (blocks.length) {
    const spans = blocks.map((block) => block.last.arr - block.first.dep);
    lines.push({ text: `Block lengths: ${blocks.length} blocks, shortest ${trimNumber(Math.min(...spans) / 3600)} h, longest ${trimNumber(Math.max(...spans) / 3600)} h.` });
  }
  return { rules: { ...targetRules, patterns: patternRows, ...(breakRule ? { break: breakRule } : {}) }, lines };
}

// --- Check against built blocks ---

export interface AutoBlockingCheckInput {
  source: AutoBlockingContext & { blockingScenario: BlockingScenario; blocks: BlockingBlock[] };
  rules: AutoBlockingRules;
  now: string;
  /** The Scenario the rules were written for. When omitted the rules are taken to name the source's own Patterns and Nodes. */
  target?: AutoBlockingContext;
}
export interface AutoBlockingCheck {
  days: Array<{ serviceDayId: EntityId; name: string; builtBlocks: number; builtPeakVehicles: number; builtRevenueSeconds: number; autoBlocks: number; autoPeakVehicles: number; autoRevenueSeconds: number }>;
  differencePercent?: number;
}

export function checkAgainstBuiltBlocks(input: AutoBlockingCheckInput): AutoBlockingCheck {
  const { source, rules, now, target } = input;
  const sourceNodes = new Map(source.nodes.map((node) => [node.id, node]));
  const sourceGroups = patternDirectionGroups(source.patterns, source.directions);
  const sourceRoute = new Map(source.routes.map((route) => [route.id, route.name]));
  let mapped: AutoBlockingRules = rules;
  if (target) {
    const targetPatterns = new Map(target.patterns.map((pattern) => [pattern.id, pattern]));
    const targetRoute = new Map(target.routes.map((route) => [route.id, route.name]));
    const targetGroups = patternDirectionGroups(target.patterns, target.directions);
    const key = (route: string | undefined, name: string) => `${(route ?? '').trim().toLowerCase()}\u0000${name.trim().toLowerCase()}`;
    const rowByName = new Map(rules.patterns.flatMap((row) => { const pattern = targetPatterns.get(row.patternId); return pattern ? [[key(targetRoute.get(pattern.routeId), pattern.name), row] as const] : []; }));
    const usedPatternIds = new Set(source.trips.map((trip) => trip.patternId));
    const patterns = source.patterns.filter((pattern) => usedPatternIds.has(pattern.id)).map((pattern) => {
      const group = sourceGroups.get(pattern.id);
      const row = rowByName.get(key(sourceRoute.get(pattern.routeId), pattern.name))
        ?? (group ? rules.patterns.find((candidate) => targetGroups.get(candidate.patternId) === group) : undefined);
      return row ? { ...row, patternId: pattern.id } : defaultPatternRule(pattern, sourceNodes, group);
    });
    const nodeKey = (routeName: string | undefined, nodeName: string) => key(routeName, nodeName);
    const targetNodes = new Map(target.nodes.map((node) => [node.id, node]));
    const sourceNodeByName = new Map(source.nodes.map((node) => [nodeKey(sourceRoute.get(node.routeId), node.name), node.id]));
    const nodeFor = (id: EntityId) => { const node = targetNodes.get(id); return node ? sourceNodeByName.get(nodeKey(targetRoute.get(node.routeId), node.name)) : undefined; };
    const routeByName = new Map(source.routes.map((route) => [route.name.trim().toLowerCase(), route.id]));
    mapped = {
      ...rules,
      patterns,
      garages: rules.garages.flatMap((garage) => { const routeId = routeByName.get((targetRoute.get(garage.routeId) ?? '').trim().toLowerCase()); const nodeId = nodeFor(garage.nodeId); return routeId && nodeId ? [{ routeId, nodeId }] : []; }),
      terminals: rules.terminals.flatMap((row) => { const nodeId = nodeFor(row.nodeId); return nodeId ? [{ ...row, nodeId }] : []; }),
      deadheads: rules.deadheads.flatMap((row) => { const fromNodeId = nodeFor(row.fromNodeId); const toNodeId = nodeFor(row.toNodeId); return fromNodeId && toNodeId ? [{ ...row, fromNodeId, toNodeId }] : []; }),
    };
  }
  const builtDayIds = new Set(source.blocks.map((block) => block.serviceDayId));
  const days = sortServiceDays(source.serviceDays).filter((day) => builtDayIds.has(day.id));
  let counter = 0;
  const throwaway: BlockingScenario = { id: 'auto-blocking-check', scenarioId: source.scenarioId, tripProfileId: source.blockingScenario.tripProfileId, name: 'Check', ...metadata(now) };
  const built = buildAutoBlocks({ ...source, blockingScenario: throwaway, rules: { ...mapped, serviceDayIds: days.map((day) => day.id) }, now, newId: () => `check-${counter++}` });
  const rows = days.map((day) => {
    const dayBlocks = source.blocks.filter((block) => block.serviceDayId === day.id);
    const summary = summarizeBlockingScenario(source.blockingScenario, dayBlocks, { trips: source.trips, patterns: source.patterns });
    const builtRevenueSeconds = summary.blockSummaries.every((block) => block.revenueSeconds !== undefined) ? summary.blockSummaries.reduce((sum, block) => sum + block.revenueSeconds!, 0) : Math.round(summary.revenueHours * 3600);
    const auto = built.days.find((entry) => entry.serviceDayId === day.id);
    const tripsById = new Map(source.trips.map((trip) => [trip.id, trip]));
    const builtIntervals = dayBlocks.flatMap((block) => {
      const times = block.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [tripsById.get(activity.tripId)] : [])
        .flatMap((trip) => trip && trip.stopTimes.length ? [[...trip.stopTimes].sort((left, right) => left.sequence - right.sequence)] : []);
      if (!times.length) return [];
      const pullOut = block.activities.find((activity) => activity.type === 'pullOut'); const pullIn = block.activities.find((activity) => activity.type === 'pullIn');
      return [{
        start: times[0][0].time - (pullOut?.type === 'pullOut' ? pullOut.minutesBeforeFirstTrip ?? 0 : 0) * 60,
        end: times.at(-1)!.at(-1)!.time + (pullIn?.type === 'pullIn' ? pullIn.minutesAfterLastTrip ?? 0 : 0) * 60,
      }];
    });
    return { serviceDayId: day.id, name: day.name, builtBlocks: dayBlocks.length, builtPeakVehicles: peakVehicles(builtIntervals), builtRevenueSeconds, autoBlocks: auto?.blockCount ?? 0, autoPeakVehicles: auto?.peakVehicles ?? 0, autoRevenueSeconds: auto?.revenueSeconds ?? 0 };
  });
  const builtTotal = rows.reduce((sum, row) => sum + row.builtRevenueSeconds, 0);
  const autoTotal = rows.reduce((sum, row) => sum + row.autoRevenueSeconds, 0);
  return { days: rows, ...(builtTotal > 0 ? { differencePercent: (autoTotal - builtTotal) / builtTotal * 100 } : {}) };
}

/** Blocks changed after the build (`updatedAt` later than `builtAt`) and whether the Block count differs from the build. */
export function autoBlockingEditedCount(record: AutoBlockingRecord, blocks: BlockingBlock[]): { editedBlockCount: number; blockCountChanged: boolean } {
  return { editedBlockCount: blocks.filter((block) => block.updatedAt > record.builtAt).length, blockCountChanged: blocks.length !== record.blockCount };
}
