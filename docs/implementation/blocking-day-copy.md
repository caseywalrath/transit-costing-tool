# Packages BC1 to BC5: Copy blocks from another service day

- Requested by the user on 2026-11-02. Rules: Decision 0052.
- Branch: `claude/admiring-sagan-4lfwzp`. Never push to another branch. Do not open a pull request.
- Orchestration: the primary agent owns BC1, reviews and integrates every package, does BC4 itself, and does BC5. BC2 and BC3 are each delegated to one Sonnet agent (structural class, Luna), one after the other.

| Package | Content | Class / model | Owner |
|---|---|---|---|
| BC1 | Decision 0052 and this plan | Primary | Primary agent |
| BC2 | Domain: trip matching and copy preview | Structural (Luna) / Sonnet | Agent 1 |
| BC3 | Persistence and application service | Structural (Luna) / Sonnet | Agent 2 |
| BC4 | UI: "Copy blocks from day…" dialog | UI design (Sol) | Primary agent |
| BC5 | Documentation, browser test, closeout | Primary | Primary agent |

## Read first (every package)

`AGENTS.md`, `codex.md`, `architecture_overview.md`, Decisions 0017, 0019, 0022, 0023, 0036, 0052. Code: `src/domain/types.ts` (Trip, BlockingScenario, BlockingBlock, BlockActivity), `src/domain/blocking.ts`, `src/domain/serviceDayCopy.ts` (the Trip-copy preview to mirror), `src/application/blockingService.ts`, `src/application/ports.ts`.

## BC2: Domain (`src/domain/blockingDayCopy.ts`, new, pure)

File ownership: `src/domain/blockingDayCopy.ts`, `src/domain/blockingDayCopy.test.ts`, and moving `removeSelectedTripsFromBlock` from `src/application/blockingService.ts` into `src/domain/blocking.ts` (blockingService re-exports it so existing callers and tests keep working). No other files.

Exports:

```ts
export interface BlockingDayCopyRequest {
  scenarioId: EntityId; blockingScenarioId: EntityId;
  sourceServiceDayId: EntityId; targetServiceDayId: EntityId;
  /** Required to apply when the source day has no Blocks (clear target). */
  allowEmptySource?: boolean;
  /** Required to apply when the match is partial, has tier-2 matches, or is ambiguous. */
  acknowledgeMismatch?: boolean;
}
export type TripMatchTier = 'exact' | 'firstDeparture';
export interface TripMatch { sourceTripId: EntityId; targetTripId: EntityId; tier: TripMatchTier; ambiguous: boolean; }
export interface TripMatchResult { matches: TripMatch[]; unmatchedSourceTripIds: EntityId[]; unmatchedTargetTripIds: EntityId[]; }
export function matchTripsAcrossDays(sourceTrips: Trip[], targetTrips: Trip[]): TripMatchResult;

export interface BlockingDayCopyRouteImpact { routeId: EntityId; heldTripCount: number; exactCount: number; firstDepartureCount: number; unmatchedCount: number; unassignedTargetTripCount: number; }
export interface BlockingDayCopyImpact {
  sourceBlockCount: number; replacedTargetBlockCount: number; copiedBlockCount: number;
  heldTripCount: number; matchedTripCount: number; exactCount: number; firstDepartureCount: number; ambiguousCount: number;
  /** matched / held; undefined when the source Blocks hold no Trips. */
  matchRate?: number;
  unmatchedSourceTripIds: EntityId[];   // held source Trips removed from the copy
  unassignedTargetTripIds: EntityId[];  // in-scope target Trips no copied Block holds
  removedDeadheadCount: number;
  /** Copied Blocks that held Trips on the source day and hold none after the copy. */
  emptiedBlockIds: EntityId[];          // ids of the new target Blocks
  routes: BlockingDayCopyRouteImpact[]; // sorted by routeId
  requiresExplicitEmptySourceReview: boolean;
  requiresMismatchAcknowledgment: boolean;
  belowThreshold: boolean;
}
export interface BlockingDayCopyPreview {
  request: BlockingDayCopyRequest;
  sourceSignature: string;
  blocks: BlockingBlock[];              // the new target-day Blocks
  removedTargetBlockIds: EntityId[];
  tripMatches: TripMatch[];             // only matches of held source Trips
  impact: BlockingDayCopyImpact;
  /** Findings of `validateBlockingBlock` on the proposed Blocks. */
  blockFindings: ValidationFinding[];
  /** Number of findings the same rules give on the source-day Blocks, for comparison. */
  sourceBlockFindingCount: number;
  /** Request-level findings; an error here forbids applying. */
  findings: ValidationFinding[];
}
export interface BlockingDayCopyInput {
  request: BlockingDayCopyRequest; blockingScenario: BlockingScenario; serviceDays: ServiceDayDefinition[];
  sourceBlocks: BlockingBlock[]; targetBlocks: BlockingBlock[];
  sourceTrips: Trip[]; targetTrips: Trip[]; patterns: RoutePattern[];
  minimumLayover?: MinimumLayoverRules; patternDirections?: Map<EntityId, DirectionGroup>;
  now: string;
}
export function buildBlockingDayCopyPreview(input: BlockingDayCopyInput): BlockingDayCopyPreview;
export function createBlockingDayCopySignature(input: Omit<BlockingDayCopyInput, 'now' | 'minimumLayover' | 'patternDirections' | 'serviceDays' | 'patterns'>): string;
export const BLOCKING_DAY_COPY_MATCH_THRESHOLD = 0.5;
```

Rules:

1. In scope: Trips whose `scenarioId` is the request's and whose `tripProfileId` is the Blocking Scenario's, filtered to the source or target day. Blocks: only those of the Blocking Scenario and the day.
2. `matchTripsAcrossDays`: group by `routeId` and `patternId`. Tier 1 key: stop times ordered by `sequence` as `patternPointId@time` joined. Tier 2 key (remaining Trips): first stop time by sequence. Within one key, sort each side by (full stop-time key, then `id`) and pair by position. `ambiguous` is true when that key has more than one Trip on either side. Output is deterministic.
3. Match rate over held source Trips (Trips referenced by a revenue activity of a source Block). `belowThreshold` = `matchRate < 0.5`. `requiresMismatchAcknowledgment` = some held Trip unmatched, or some held Trip matched in tier 2, or some held match ambiguous.
4. Copied Blocks: new Block ID and new activity IDs (`newId`), `serviceDayId` = target, same label and notes, `createdAt`/`updatedAt` = `now`. Revenue activities get the matched target Trip ID. Unmatched held Trips are removed with `removeSelectedTripsFromBlock` (removes adjacent deadheads; count them). Then `normalizeBlockActivities`. A Block with no Trips is kept.
5. `blockFindings`: `validateBlockingBlock` on each new Block with the target Trips, patterns, Blocking Scenario, minimum layover, and pattern directions. `sourceBlockFindingCount`: the same on the source Blocks with the source Trips.
6. Request findings (severity error, entity type `blockingDayCopy`): `blockingDayCopy.sameDay`; `blockingDayCopy.dayUnavailable` (a day is missing or of another Scenario); `blockingDayCopy.scenarioMismatch` (the Blocking Scenario belongs to another Scenario); `blockingDayCopy.emptySourceRequiresExplicitClear` (no source Blocks and not `allowEmptySource`); `blockingDayCopy.matchBelowThreshold` (parameters `matched`, `held`); `blockingDayCopy.mismatchRequiresAcknowledgment` (when required and not `acknowledgeMismatch`). The preview is still fully built when it carries these findings, so the review can show the counts.
7. Signature: a stable JSON string over the request without `allowEmptySource` and `acknowledgeMismatch`, the Blocking Scenario's id and `tripProfileId`, the in-scope source and target Blocks (id, label, notes, `updatedAt`, sorted activities), and the in-scope source and target Trips (id, routeId, patternId, stopTimes, `updatedAt`), each sorted by id. Ticking acknowledgment must not make the token stale.

Tests (`blockingDayCopy.test.ts`): identical tables give 100% exact, no acknowledgment; tier-2 match flagged; duplicate Trips paired and flagged ambiguous; unmatched Trip removed with both adjacent deadheads; Block emptied but kept; exactly 50% passes with acknowledgment; 49% refused; empty source requires `allowEmptySource`; same day refused; Trips of another Trip Profile ignored; other-day and other-scenario Blocks ignored; signature unchanged by the two flags and changed by a Trip time edit; output deterministic across input order.

Acceptance: `pnpm typecheck` and `pnpm test` pass. No UI, persistence, or documentation edits.

## BC3: Persistence and application service

File ownership: `src/application/ports.ts`, `src/application/blockingService.ts`, `src/application/blockingService.test.ts` (or a new `blockingDayCopy` application test), `src/persistence/blockingRepository.ts`, `src/persistence/repositoryContract.test.ts` (or the existing blocking repository tests), the application wiring where `BlockingContextProvider` is built, and the tab-write guard list if blocking write methods are listed there.

1. `BlockingRepository.replaceBlocksForDayAtomically(blockingScenarioId, serviceDayId, blocks, expectedBlockingScenarioSignature): Promise<void>`, in both repositories. In one transaction: read the Blocking Scenario and all its Blocks, check `assertBlockingScenarioSourceUnchanged`, refuse any incoming Block of another Blocking Scenario, Scenario, or service day, delete the Blocking Scenario's Blocks of that day, and put the incoming Blocks. Restore on failure in memory. Add to `BLOCKING_WRITE_METHODS` and to any write-guard list. Contract tests for both repositories: replaces only that day; leaves other days and other Blocking Scenarios; refuses a stale signature without writing; refuses an outside Block.
2. `BlockingContextProvider` gains `listServiceDays(scenarioId): Promise<ServiceDayDefinition[]>` (optional in the interface only if needed to avoid breaking existing test doubles; then the preview refuses when it is absent). Wire it in production.
3. `BlockingQueries.previewBlockingDayCopy(request, minimumLayover?): Promise<BlockingDayCopyReview>` where `BlockingDayCopyReview = { preview: BlockingDayCopyPreview; blockingScenarioSignature: string }`. It loads the Blocking Scenario, all its Blocks, the Trips of its Trip Profile, patterns, directions (`patternDirectionGroups`), and service days, then calls `buildBlockingDayCopyPreview`.
4. `BlockingCommands.applyBlockingDayCopy(review: BlockingDayCopyReview, minimumLayover?): Promise<BlockingDayCopyPreview>`. Previews again with `review.preview.request`; refuses with a stale error when `sourceSignature` differs (use the message style of `blockingScenario.sourceChanged`); refuses when the new preview has any error finding in `findings` (not `blockFindings`); then calls `replaceBlocksForDayAtomically` with the preview's blocks and `review.blockingScenarioSignature`.
5. Application tests with in-memory repositories: the full round trip writes the target day only; stale Trip edit between preview and apply is refused; below-threshold and unacknowledged mismatch are refused; acknowledged mismatch applies.

Acceptance: `pnpm typecheck` and `pnpm test` pass. No UI or documentation edits. No schema version change.

## BC4: UI (primary agent)

Entry point: Blocking actions menu, item "Copy blocks from day…", next to "Duplicate blocking scenario…". Disabled without a Blocking Scenario or while busy. The dialog follows the Trip-copy dialog (`src/ui/trips/dialogs.tsx`): source Day select (all days except the selected one), the preview loaded on selection, and a confirm button.

Review content: the target day and Blocking Scenario in the title line; a summary line (blocks copied, target blocks replaced); a per-Route table (Route, Trips held, exact, times differ, not found, target trips left unassigned); notes for removed deadheads, blocks left without trips, ambiguous pairs, and validation findings on the copy compared with the source.

States:
- 100% exact: confirm button "Copy blocks" enabled.
- Partial, tier 2, or ambiguous: a warning InlineNote and an unchecked checkbox "Copy anyway; trips that are not found are removed from their blocks". Confirm disabled until checked.
- Below 50%: an error InlineNote that the timetables differ too much (with matched/held counts); no checkbox; confirm disabled.
- Empty source: a destructive note naming the target Blocks that will be deleted, and a confirm labelled "Clear blocks".
- Stale on apply: an error message; the preview reloads.

Keyboard and accessibility: the existing ModalDialog behaviour; the checkbox has a label; the table has a caption or aria-label. Acceptance: typecheck, unit tests, build, a browser spec `tests/ui/blocking-day-copy.spec.ts` (exact copy; mismatch needs the checkbox; below threshold refused), the existing browser suite, and a screenshot inspection.

## BC5: Documentation and closeout (primary agent)

`architecture_overview.md` (Blocking section and data flow), `docs/ui-conventions.md` (menu item and dialog), `docs/domain-glossary.md` ("Trip match"), `codex.md` current status, Decision 0052 status to implemented. Full verification: typecheck, unit tests, build, browser suite.
