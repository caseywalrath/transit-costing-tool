// One Block from the trips that share a feed block_id on one service day (Decision 0089 items 34 and 35). Pure. The caller decides
// which trips are imported; this module orders them, adds the pull-out, pull-in and deadheads, and runs the existing block validation.

import { normalizeBlockActivities, validateBlockingBlock } from '../blocking';
import { metadata, newId } from '../ids';
import type { BlockActivity, BlockingBlock, EntityId, RoutePattern, Trip, ValidationFinding } from '../types';
import { GtfsFeedError } from './feedTables';

/** One imported trip of the Block, with the Nodes it starts and ends at. */
export interface BlockMember {
  trip: Trip;
  /** The feed's trip_id (or the expanded frequency trip's ID); used only to order trips that start at the same time. */
  feedTripId: string;
  startNodeId: EntityId;
  endNodeId: EntityId;
}

export interface BlockFromFeedInput {
  scenarioId: EntityId;
  blockingScenarioId: EntityId;
  serviceDayId: EntityId;
  label: string;
  members: readonly BlockMember[];
  /** The planner's default pull-out minutes. Left undefined, the pull-out has no minutes. */
  pullOutMinutes?: number;
  /** The planner's default pull-in minutes. Left undefined, the pull-in has no minutes. */
  pullInMinutes?: number;
  trips: Map<EntityId, Trip>;
  patterns: Map<EntityId, RoutePattern>;
  now: string;
}

export type BlockFromFeedResult = { block: BlockingBlock } | { findings: ValidationFinding[] };

/**
 * The Block with its activities in time order: a pull-out from the first trip's start Node, the revenue trips, a zero-minute deadhead
 * wherever one trip ends at a different Node from where the next starts, and a pull-in at the last trip's end Node. A Block the existing
 * validation refuses is returned with its error findings, and no Block.
 */
export function blockFromFeed(input: BlockFromFeedInput): BlockFromFeedResult {
  if (input.members.length === 0) throw new GtfsFeedError(`Block ${input.label} has no trips`);
  const members = [...input.members].sort(
    (a, b) => startTimeOf(a.trip) - startTimeOf(b.trip) || compareText(a.feedTripId, b.feedTripId),
  );
  const first = members[0];
  const last = members[members.length - 1];

  const drafts: BlockActivity[] = [
    {
      id: newId(),
      type: 'pullOut',
      sequence: 0,
      toNodeId: first.startNodeId,
      ...(input.pullOutMinutes === undefined ? {} : { minutesBeforeFirstTrip: input.pullOutMinutes }),
    },
  ];
  members.forEach((member, index) => {
    const previous = index > 0 ? members[index - 1] : undefined;
    if (previous && previous.endNodeId !== member.startNodeId) {
      drafts.push({
        id: newId(),
        type: 'deadhead',
        sequence: 0,
        minutesAfterPreviousTrip: 0,
        fromNodeId: previous.endNodeId,
        toNodeId: member.startNodeId,
      });
    }
    drafts.push({ id: newId(), type: 'revenueTrip', sequence: 0, tripId: member.trip.id });
  });
  drafts.push({
    id: newId(),
    type: 'pullIn',
    sequence: 0,
    fromNodeId: last.endNodeId,
    ...(input.pullInMinutes === undefined ? {} : { minutesAfterLastTrip: input.pullInMinutes }),
  });

  const block = normalizeBlockActivities<BlockingBlock>({
    id: newId(),
    scenarioId: input.scenarioId,
    blockingScenarioId: input.blockingScenarioId,
    serviceDayId: input.serviceDayId,
    label: input.label,
    activities: drafts.map((activity, sequence) => ({ ...activity, sequence })),
    ...metadata(input.now),
  });

  const findings = validateBlockingBlock(block, {
    scenario: { id: input.scenarioId },
    trips: input.trips,
    patterns: input.patterns,
  }).filter((finding) => finding.severity === 'error');
  return findings.length > 0 ? { findings } : { block };
}

function startTimeOf(trip: Trip): number {
  return trip.stopTimes[0]?.time ?? 0;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
