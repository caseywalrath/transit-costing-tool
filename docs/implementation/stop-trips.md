# Route stops and stop trips: work order plan

- Requested by the user on 2026-11-16, after a design discussion recorded in Decision 0079 (`docs/decisions/0079-route-stops-and-derived-stop-times.md`).
- Branch: `claude/funny-fermat-0hgeua`, unless the user names another. Do not push to any other branch. Do not open a pull request unless the user asks.
- **Orchestration: Opus** (the primary agent). Opus owns the architecture, gives each Haiku package its brief from this plan, reviews every package diff, does the two UI-design packages, and runs the final verification.
- **Structural packages ST1 to ST4: Haiku** (structural class, Luna). Haiku follows this plan literally. Where this plan does not say what to do, Haiku stops and reports the question to Opus. Haiku does not choose wording, layout, or behaviour beyond what is written here.
- **UI-design packages ST5 and ST6: Opus** (UI-design class, Sol). They are new drawers with new interaction.
- Do not start the next package automatically. At each gate, report the result to the user and recommend the next package and model.

## 1. Summary

1. Each Route can have **stops**: passenger stops that are not Nodes. A stop has a name and an optional stop ID.
2. Each pattern places stops on its **segments**, between two consecutive timepoints. Stops of one Route are shared by its patterns.
3. A stop's **time is derived** from each Trip's own timepoint times, by its timing rule: `interpolate` (equal division, the default), `previous`, or `next`. Interpolated times are always **rounded down** to 1 minute (the default) or 30 seconds. Nothing is stored per Trip.
4. Route tab: pattern **Actions → Stops…** opens a drawer to place, order, name, copy, and fill stops.
5. Trips tab: **Actions → Stop trips…** opens a drawer that shows one pattern's stop times for the displayed Trips and edits the timing rules and rounding.
6. Trips **Actions → Export trips with stops CSV** writes one row per Trip per stop.
7. A Node gets an optional **Stop ID** (`stopCode`), edited in the Nodes table.

Formats: Dexie version 11 (new table `routeStopSets`), JSON backup schema 13.

## 2. Settled decisions (user, 2026-11-16)

| Question | Answer |
|---|---|
| Derived rules or stored, generated times | Derived rules |
| Stop ownership | The Route |
| Fixed "N minutes after the previous timepoint" rule | No |
| Rounding | 30 seconds or 1 minute, always rounded down |
| Manual per-Trip stop times | No |
| Export format | Long form only, for now |
| Stop ID on Nodes | Yes |

## 3. Code facts this plan depends on (verified 2026-11-16 on `main` at `a5dbb48`)

Haiku must not assume anything beyond these facts. If a fact no longer holds when a package starts, stop and report it to Opus.

| Fact | Location |
|---|---|
| `Node` is `{ id, scenarioId, routeId, name, shortName?, kind, notes? }` plus metadata. | `src/domain/types.ts:15` |
| `PatternPoint` is `{ id, nodeId, sequence, cumulativeMiles, directionColumnId? }`. Points carry stable IDs; a loop visits a node twice with two point IDs. | `src/domain/types.ts:16` |
| `Trip.stopTimes` is `ScheduledPoint[]`, each `{ patternPointId, sequence, time }`, time in integer seconds from service-day midnight. | `src/domain/types.ts:83`, `:105` |
| `ValidationFinding` is `{ ruleId, severity, category?, entityType, entityId, field?, messageKey, parameters? }`. | `src/domain/types.ts:157` |
| `ProjectSnapshot` lists every collection; `plannedFrequencies?` is the newest optional one. `DatabaseRecordMap` names every table. | `src/domain/types.ts:161-184` |
| `ScenarioRecords` (with `plannedFrequencies?`) is declared in `src/domain/project.ts` near line 61. | `src/domain/project.ts` |
| `newId`, `metadata(now)`, `withUpdatedAt(entity, now)`. | `src/domain/ids.ts` |
| `segmentKeys(pattern)` returns `${fromNodeId}>${toNodeId}` per segment, in `sequence` order. Reuse it. | `src/domain/segmentRuntimeMatching.ts:48` |
| Distance Fill/Copy is the model for stop Fill/Copy: `planDistanceFill`, `planDistanceCopy`, `copyCandidatePatternIds`, `applySegmentDistancePlan`. | `src/domain/segmentDistanceMatching.ts` |
| Distance copy in the service: preview type, stale check by `JSON.stringify(plan.changes)`, one-level undo, `describeSegmentDistancePlan`. | `src/application/routeDefinitionService.ts:286-300`, `:344`, `:639-728` |
| `commitNodeChanges`, `commitPatternChange`, and `deletePattern` clear `segmentDistanceUndo` as their first statement. | `src/application/routeDefinitionService.ts:392`, `:417`, `:629` |
| `applyPatternChange` and `applyNodeChanges` return the next `ScenarioRecords`; `buildPatternPreview` and `buildNodePreview` build the previews. | `src/application/routeDefinitionService.ts:1269-1395` |
| `PatternChangePreview`, `NodeChangePreview`, `RouteDeletionImpact`, `PatternDeletionImpact` are exported interfaces. | `src/application/routeDefinitionService.ts:33`, `:57`, `:217`, `:232` |
| `planPatternDeletion`, `planRouteDeletion` (impact plus `next` records) and `scenarioDeletionToken`. | `src/application/routeDefinitionService.ts:738`, `:~1150-1199`, `:194` |
| `updateScenarioRecords(scenarioId, change)` re-reads stored records inside the write (Decision 0036) and publishes the save status. | `src/application/routeDefinitionService.ts:1398` |
| `ROUTE_DEFINITION_WRITE_METHODS` already contains `updateScenarioRecords` and `commitRouteEdit`. | `src/application/routeDefinitionService.ts:334` |
| `RouteDefinitionApplication` is a `Pick` of service method names. A new public method must be added to it. | `src/application/routeDefinitionService.ts:1414` |
| `updateRoute` writes the screen's whole aggregate through `saveRouteDefinition` (routes, nodes, patterns, directions tables only). It never writes `routeStopSets`. | `src/application/routeDefinitionService.ts:602`, `src/persistence/dexieRepository.ts:214` |
| The template for a new Scenario-owned table, through every repository, copy, backup, and deletion path, is commit `2c4e064` (PF3, planned frequencies). Read it with `git show 2c4e064`. | `git show 2c4e064` |
| The template for a backup schema bump is commit `d917026` (RC3, schema 12). | `git show d917026` |
| Dexie is at version 10 (`plannedFrequencies` table). JSON backup schema is 12 (`PROJECT_BACKUP_SCHEMA_VERSION`). | `src/persistence/database.ts:102`, `src/persistence/backup.ts:40` |
| Backup parsing passes whole records through (`value as unknown as Route`); a new optional field survives export and import unless a validator strips it. | `src/persistence/backup.ts:322-352` |
| Import as copy, Scenario duplication, and Route duplication each build a `pointIds` map (old pattern point ID → new) and a `patternIds` map. | `src/persistence/backup.ts:853`, `src/domain/project.ts:97`, `:245` |
| Tests that assert the current versions: backup 12 in `backup.test.ts` (138, 166, 269, 438, 504), `backupImportValidation.test.ts:56`, `plannedFrequencyBackup.test.ts:39`, `repositoryContract.test.ts:167`, `tests/ui/automatic-blocking-backup.spec.ts:29`; Dexie 10 in `database.test.ts` (8, 81, 153, 185), `repository.test.ts` (21, 44), `tests/ui/scenario-copy-recovery.spec.ts` (148, 167, 177). | as listed |
| `repositoryContract.test.ts` lists Scenario-owned collections in `SCENARIO_OWNED` (line 21) and the exact record keys (line 120). | `src/persistence/repositoryContract.test.ts` |
| The Trips CSV serializer and its `clock` formatter. The formula-protection test runs every exporter through `cases()`. | `src/application/tripTableCsv.ts`, `src/persistence/csvText.test.ts:121` |
| Trips export call site and the Trips Actions menu (`tripActionsMenu`). | `src/ui/trips/TripsWorkspace.tsx:640-647`, `:789-794` |
| `TripsWorkspace` receives `service: RouteDefinitionApplication`, so Route service methods are reachable from the Trips tab without new props. | `src/ui/trips/TripsWorkspace.tsx:87` |
| The Nodes grid (`NodesGrid`, `NODE_COLUMNS`) and the Node draft change key (`nodeKey`). | `src/ui/route/RouteGrids.tsx:9-50`, `src/application/draftChangeCounts.ts:4` |
| The pattern editor Actions menu, the save flow that opens `RouteEditImpactDialog` (`classification === 'deterministic'` or `requiresReset`), and the dialog. | `src/ui/route/RouteWorkspace.tsx:155-167`, `:271-275`, `:278-290` |
| Route and Pattern deletion confirmation texts are built in `App.tsx`. | `src/ui/App.tsx:176-205` |
| Existing drawers use the classes `shift-drawer`, `shift-drawer-body`, `header`, `footer` (`BuildTripsDrawer`). | `src/ui/trips/dialogs.tsx:128`, `src/ui/styles/trips-workflow.css:38-42` |
| Validation message text for a `messageKey` lives in `USER_FACING_VALIDATION_MESSAGES`. | `src/ui/shared/messages.ts:11` |
| This plan uses Decision **0079**. | `docs/decisions/` |

## 4. Rules

Decision 0079 is authoritative. These are the implementation rules every package follows.

### 4.1 Types (ST1 adds them to `src/domain/types.ts`)

```ts
/** Decision 0079. A passenger stop of one Route. Never a pattern point, timetable column, or runtime segment end. `id` is unique within its stop set. */
export interface RouteStop { id: EntityId; name: string; stopCode?: string; }
export type StopTimingRule = 'interpolate' | 'previous' | 'next';
/** Decision 0079. One stop on the segment from `afterPatternPointId` to the next point by sequence. `sequence` orders stops within the segment. `id` is unique within its pattern. */
export interface PatternStopPlacement { id: EntityId; stopId: EntityId; afterPatternPointId: EntityId; sequence: number; timing: StopTimingRule; }
export type StopTimeRoundingSeconds = 30 | 60;
/** Decision 0079. At most one per Route. Not stored when it has no stops. */
export interface RouteStopSet extends EntityMetadata {
  id: EntityId; scenarioId: EntityId; routeId: EntityId;
  roundingSeconds: StopTimeRoundingSeconds;
  stops: RouteStop[];
  /** Pattern ID → its placements, ordered by segment, then `sequence`. A pattern with no stops has no entry. */
  placementsByPatternId: Record<EntityId, PatternStopPlacement[]>;
}
```

Also:
- `Node` gains `/** Decision 0079. Optional public stop ID of this timepoint. */ stopCode?: string;`
- `ProjectSnapshot` gains `/** Decision 0079. Snapshots before backup schema 13 omit this collection. */ routeStopSets?: RouteStopSet[];` directly after `plannedFrequencies?`.
- `DatabaseRecordMap` gains `routeStopSets: RouteStopSet;` after `plannedFrequencies`.

### 4.2 Segments

Segment `i` of a pattern runs from point `i` to point `i + 1` of the points **sorted by `sequence`**, the same indexing as `segmentKeys`. A placement belongs to segment `i` when `afterPatternPointId` is the ID of sorted point `i` and `i < points.length − 1`.

### 4.3 Stop times (pure; `src/domain/stopTimes.ts`)

For one segment with time `A` at its first point, time `B` at its second point, rounding `r` seconds, and placements in `sequence` order:

1. If `A` or `B` is undefined, or `B < A`, every stop of the segment has no time.
2. Let `m` be the number of `interpolate` placements. The `j`-th `interpolate` placement (1-based, counting only `interpolate` placements) gets
   `t = Math.floor((A * (m + 1) + (B − A) * j) / ((m + 1) * r)) * r`, then `t = Math.max(A, t)`. Use this exact integer formula; do not divide first.
3. `previous` gets `A`. `next` gets `B`. Neither is rounded.
4. Walk the stops in `sequence` order and raise each time to at least the previous stop's time in the segment.

Timepoint rows show the Trip's saved time unchanged.

### 4.4 Validation (`validateRouteStopSet`; `ruleId` equals `messageKey`)

| ruleId | Severity | entityType / entityId | When |
|---|---|---|---|
| `routeStop.nameRequired` | error | `routeStop` / stop id, field `name` | name is empty after trimming |
| `routeStop.codeDuplicate` | error | `routeStop` / the second stop's id, field `stopCode`, parameters `{ stopCode }` | two stops of the set have the same `stopCode` after trimming, compared case-insensitively |
| `routeStop.idDuplicate` | error | `routeStop` / id | two stops share an `id` |
| `stopPlacement.stopMissing` | error | `stopPlacement` / placement id | `stopId` names no stop of the set |
| `stopPlacement.idDuplicate` | error | `stopPlacement` / placement id | two placements of one pattern share an `id` |
| `stopPlacement.repeatedInSegment` | error | `stopPlacement` / the second placement's id, parameters `{ patternId, segmentIndex }` | one stop placed twice in one segment |
| `stopPlacement.timingOutOfOrder` | warning | `stopPlacement` / the first placement out of order, parameters `{ patternId, segmentIndex }` | in a segment, the rank `previous` 0, `interpolate` 1, `next` 2 decreases from one placement to the next |
| `routeStopSet.roundingInvalid` | error | `routeStopSet` / set id, field `roundingSeconds` | `roundingSeconds` is not 30 or 60 |

### 4.5 Normalizing and pruning

- `normalizePlacements(pattern, placements)`: drops placements whose `afterPatternPointId` is not a point of the pattern or is its last point; within each segment sorts by `sequence` (ties: original array order) and renumbers `sequence` 0, 1, 2…; returns them ordered by segment index, then `sequence`. A pattern with fewer than 2 points returns `[]`.
- `pruneRouteStopSets(sets, owners: { routes: Route[]; patterns: RoutePattern[] })`, called on every Scenario write and project snapshot write (ST2):
  1. drops a set whose `routeId` is not in `owners.routes`;
  2. drops a `placementsByPatternId` entry whose pattern is missing or belongs to another Route, normalizes every other entry, and drops entries left empty;
  3. drops stops no placement references;
  4. drops a set with no stops left.
  It returns the input array itself (same reference) when nothing changed, as `prunePlannedFrequencies` does (`src/domain/plannedFrequencies.ts:104`).

### 4.6 Reconciling placements after a pattern edit (`reconcilePlacements`)

Input: the saved pattern, the next pattern, and the saved pattern's placements. Use the saved points sorted by `sequence` and the next points sorted by `sequence`. Let `nextLast` be the ID of the next pattern's last point. For each placement, in saved segment order, then `sequence`:

1. If the next pattern has fewer than 2 points: **remove** it.
2. If `afterPatternPointId` is in the next pattern and is not `nextLast`: **keep** it on the same point.
3. If `afterPatternPointId` is `nextLast`: **remove** it (its segment now lies beyond the pattern's end).
4. Otherwise the point was removed. Let `Q` be the nearest point **before** it in saved order that is in the next pattern, and `R` the nearest point **after** it in saved order that is in the next pattern. If both exist and `Q` is not `nextLast`, **move** the placement to `Q`, after the placements already on `Q`'s segment (kept ones first, then moved ones in processing order). Otherwise **remove** it.

Return `{ placements: normalizePlacements(next, result), movedCount, removedCount }`. A point added to a segment needs no rule: the stops stay on the earlier point and so sit before the new point.

### 4.7 Copy and fill matching (`src/domain/stopPlacementMatching.ts`)

These follow Decision 0065's rules 5, 6, 9, 10, and 14 (ambiguity, scope, copy targets, identical values, no remembered choices), with these differences:
- A segment's value is its ordered list of `{ stopId, timing }` entries. "Empty" (no stops) plays the role of distance 0. Two values are equal when the lists are equal element by element.
- Fill uses only same-direction pairs, never reverse pairs.
- Fill conflict candidates are sorted by `JSON.stringify(entries)`.

### 4.8 Writes

- Every stop write goes through `updateScenarioRecords`, or through the route-edit commit for reconciliation. No new repository write method is added.
- The editor's save carries `baseUpdatedAt`, the `updatedAt` of the set it loaded (`undefined` when none existed). The write refuses with `Error('Stops changed after this editor opened. Close it and open it again.')` when the stored set's `updatedAt` differs.

## 5. Package overview

| Package | Title | Model | Depends on | Owns |
|---|---|---|---|---|
| ST0 | Decision record and this plan | Opus | none | `docs/decisions/0079-…`, this file (done: written with this plan on 2026-11-16) |
| ST1 | Domain: types, stop times, normalization, reconciliation, matching | Haiku | ST0 | `src/domain/types.ts`, `src/domain/stops.ts`, `src/domain/stopTimes.ts`, `src/domain/stopPlacementMatching.ts` (+ tests) |
| ST2 | Persistence, backup 13, copies, deletion cascade | Haiku | ST1 | `src/persistence/*`, `src/domain/project.ts`, `src/application/ports.ts`, version assertions in tests |
| ST3 | Application: stop commands, reconciliation, impacts, views, CSV | Haiku | ST2 | `src/application/routeDefinitionService.ts`, `src/application/draftChangeCounts.ts`, `src/application/stopTripsView.ts`, `src/application/stopTimesCsv.ts` (+ tests) |
| Gate A | User review of the data rules | — | ST3 | — |
| ST4 | Simple UI wiring: Node Stop ID column, review texts, export menu item, messages | Haiku | Gate A | `src/ui/route/RouteGrids.tsx`, `src/ui/route/RouteWorkspace.tsx` (dialog and save-flow lines only), `src/ui/App.tsx` (deletion texts only), `src/ui/trips/TripsWorkspace.tsx` (export only), `src/ui/shared/messages.ts`, browser specs |
| ST5 | Route tab Stops drawer | Opus (UI design) | ST4 | `src/ui/route/PatternStopsDrawer.tsx` (new), `src/ui/route/RouteWorkspace.tsx`, `src/ui/styles/route.css`, spec |
| ST6 | Trips tab Stop trips drawer | Opus (UI design) | ST4 | `src/ui/trips/StopTripsDrawer.tsx` (new), `src/ui/trips/TripsWorkspace.tsx`, `src/ui/styles/trips-workflow.css`, spec |
| ST7 | Documentation, closeout, full verification | Opus | all | `architecture_overview.md`, `docs/data-schema.md`, `docs/domain-glossary.md`, `docs/ui-conventions.md`, `codex.md`, closeout file |

Order: ST1 → ST2 → ST3 → Gate A → ST4 → ST5 → ST6 → ST7. ST5 and ST6 may run in either order.

## 6. Instructions that apply to every package

- Read first: `AGENTS.md`, `codex.md`, `architecture_overview.md`, Decision 0079, this plan, and the files under "Read first" in the package.
- Keep domain code free of React and IndexedDB. `src/ui` imports nothing from `src/persistence`.
- Edit files with the file-edit tool, not shell redirection or `sed`.
- Change only the files the package owns. If a package needs a change outside them, stop and report it.
- Do not change behaviour that this plan does not name. Existing tests that prove unchanged behaviour must pass without edits, except the version assertions that ST2 lists.
- Verify exactly as section 7 says. Put the results in the commit message as `Verified:` lines, and name what was skipped and why.
- Commit messages begin with the package ID, for example `ST1: Stop types, derived stop times and placement matching (Decision 0079)`.

## 7. Verification per package

The unit suite takes about 10 seconds and runs in full once at the end of every code package. While working, run only the test file being written. Report only summaries and failures. Browser commands in a Claude Code cloud session use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` (`codex.md`) and `--trace off`.

| Package | Run | Skip | Do not cut |
|---|---|---|---|
| ST0 | Proofread; cross-check names against `src/domain/types.ts` | All tests (documentation only) | — |
| ST1 | `pnpm typecheck`; the three new test files; `pnpm test` | Browser suite and build (no UI, no persistence) | — |
| ST2 | `pnpm typecheck`; `pnpm test`; browser specs `backup-import`, `database-migration`, `scenario-copy-recovery`, `scenario-write-safety`, `deletion-reviews`, `data-safety`, `automatic-blocking-backup` | Other browser specs; build | Every persistence, migration, backup, and contract test; an exact backup round trip of a project with stops |
| ST3 | `pnpm typecheck`; new and changed test files; `pnpm test` | Browser suite and build (no UI) | `safeRouteEditing.test.ts`; the existing pattern, node, deletion, and distance tests in `routeDefinitionService.test.ts`; `tripTableCsv.test.ts`; `csvText.test.ts` |
| Gate A | Opus reruns `pnpm typecheck` and `pnpm test` | — | — |
| ST4 | `pnpm typecheck`; `pnpm test`; browser specs `route-grid`, `route-editing`, `impact-dialogs`, `deletion-reviews`, `pattern-discard-save`, `unified-action-layer`, `trips-context-menu`, `keyboard`; `pnpm build`; screenshots of the Nodes table | Full browser suite (ST7) | `route-grid`, `route-editing`, `deletion-reviews` |
| ST5 | `pnpm typecheck`; `pnpm test`; new `route-stops.spec.ts`; `route-editing`, `route-grid`, `segment-distance-fill`, `pattern-discard-save`, `drafts-and-preferences`, `keyboard`; `pnpm build`; screenshots (light, dark, 1024 px, 1440 px, 390 px) | Trips, Blocking, Costing specs | `keyboard` (axe run must include the drawer) |
| ST6 | `pnpm typecheck`; `pnpm test`; new `stop-trips.spec.ts`; `shift-drawer`, `side-by-side-trips`, `trips-layout`, `trip-table-layout`, `unified-action-layer`, `trips-context-menu`, `keyboard`; `pnpm build`; screenshots as ST5 | Route, Blocking, Costing specs | `keyboard`, `shift-drawer`, `side-by-side-trips` |
| ST7 | Everything: `pnpm typecheck`, `pnpm test`, `pnpm build`, the full browser suite, the visual tour, a backup round trip | Nothing | The whole run |

If a skipped area turns out to be touched (for example a shared component), add its tests and say so at the gate.

---

## 8. ST1: Domain (Haiku)

### Read first

Decision 0079; sections 3 and 4 of this plan; `src/domain/types.ts`; `src/domain/ids.ts`; `src/domain/segmentRuntimeMatching.ts` lines 1-55; `src/domain/segmentDistanceMatching.ts` (all of it, as the model for 8.4); `src/domain/plannedFrequencies.ts` lines 100-130 (the pruning model).

### Files Haiku may change

- `src/domain/types.ts` (the additions in 4.1 only)
- `src/domain/stops.ts` (new), `src/domain/stops.test.ts` (new)
- `src/domain/stopTimes.ts` (new), `src/domain/stopTimes.test.ts` (new)
- `src/domain/stopPlacementMatching.ts` (new), `src/domain/stopPlacementMatching.test.ts` (new)

### 8.1 `src/domain/types.ts`

Add exactly the declarations in section 4.1. Change nothing else.

### 8.2 `src/domain/stops.ts`

Imports: types from `./types` only (no ID generation happens in this module). Exports:

```ts
export const STOP_TIMING_RANK: Record<StopTimingRule, number> = { previous: 0, interpolate: 1, next: 2 };
export const DEFAULT_STOP_ROUNDING_SECONDS: StopTimeRoundingSeconds = 60;
/** Points sorted by sequence (a copy). */
export function sortedPoints(pattern: RoutePattern): PatternPoint[];
/** Section 4.2. Segment index of a placement, or undefined when its point is missing or is the last point. */
export function placementSegmentIndex(pattern: RoutePattern, placement: PatternStopPlacement): number | undefined;
/** Section 4.2. One array per segment (length points − 1, or 0), each sorted by sequence. Invalid placements are left out. */
export function placementsBySegment(pattern: RoutePattern, placements: readonly PatternStopPlacement[]): PatternStopPlacement[][];
/** Section 4.5. */
export function normalizePlacements(pattern: RoutePattern, placements: readonly PatternStopPlacement[]): PatternStopPlacement[];
/** Section 4.4. `patterns` are the Route's patterns; entries for other patterns are ignored. */
export function validateRouteStopSet(set: RouteStopSet, patterns: readonly RoutePattern[]): ValidationFinding[];
/** Section 4.5. */
export function pruneRouteStopSets(sets: RouteStopSet[], owners: { routes: readonly Route[]; patterns: readonly RoutePattern[] }): RouteStopSet[];
/** Section 4.6. */
export function reconcilePlacements(saved: RoutePattern, next: RoutePattern, placements: readonly PatternStopPlacement[]): { placements: PatternStopPlacement[]; movedCount: number; removedCount: number };
/** Copies a set for a duplicated Route or Scenario (Decision 0079 item 11). New set id; stop and placement ids are kept. Pattern keys and afterPatternPointId are mapped; an entry whose pattern has no mapping is dropped, and a placement whose point has no mapping is dropped. */
export function remapRouteStopSet(set: RouteStopSet, target: { id: EntityId; scenarioId: EntityId; routeId: EntityId; patternIds: ReadonlyMap<EntityId, EntityId>; pointIds: ReadonlyMap<EntityId, EntityId> }, now: string): RouteStopSet;
```

Details:
- `validateRouteStopSet` checks placements only for patterns in `patterns` whose `routeId` equals `set.routeId`, with segments from `placementsBySegment`. It does not report placements that normalization would drop.
- `remapRouteStopSet` returns `{ ...set, id, scenarioId, routeId, placementsByPatternId: <mapped>, createdAt: now, updatedAt: now }`, with `stops` deep-copied (`set.stops.map((stop) => ({ ...stop }))`).

Tests (`src/domain/stops.test.ts`). Build the fixture inline: nodes `A, B, C, D`; pattern `P` with points `pA(A, seq 0)`, `pB(B, 1)`, `pC(C, 2)`, `pD(D, 3)`; stops `s1..s4`; placements `x1(s1 after pA, 0)`, `x2(s2 after pB, 0)`, `x3(s3 after pB, 1)`, `x4(s4 after pC, 0)`, all `interpolate`. Required cases:

1. `placementsBySegment` returns `[[x1], [x2, x3], [x4]]`; a placement after `pD` is left out.
2. `normalizePlacements` renumbers sequences `5, 9` to `0, 1` and keeps order; drops a placement on a missing point; returns `[]` for a 1-point pattern.
3. Every rule in section 4.4 has one failing case and asserts `ruleId`, `severity`, and `entityId`. The same `stopCode` with different case (`"1001"` and `" 1001 "`; `"AB"` and `"ab"`) is a duplicate. A stop placed in two different segments of one pattern is not a finding.
4. `timingOutOfOrder`: `[next, interpolate]` gives the warning; `[previous, interpolate, interpolate, next]` gives none.
5. `pruneRouteStopSets`: the set of a deleted Route is dropped; the entry of a deleted pattern is dropped; a stop used by no placement is dropped; a set left with no stops is dropped; an unchanged input returns the same array reference (`toBe`).
6. `reconcilePlacements`:
   - removing `pB` moves `x2, x3` to `pA` after `x1` (`movedCount` 2, `removedCount` 0);
   - removing `pA` (the first point) removes `x1` (`removedCount` 1);
   - removing `pD` (the last point) removes `x4`, whose point `pC` is now last (`removedCount` 1);
   - inserting a point `pX` between `pA` and `pB` keeps `x1` on `pA`, and no counts change;
   - reducing the pattern to `pA` alone removes every placement;
   - removing both `pB` and `pC` moves `x2, x3, x4` to `pA` in that order.
7. `remapRouteStopSet` maps pattern keys and points, keeps stop and placement IDs, drops an unmapped pattern, and does not mutate its input.

### 8.3 `src/domain/stopTimes.ts`

```ts
export interface StopTimeRow {
  kind: 'timepoint' | 'stop';
  /** The timepoint's point, or for a stop the point it follows. */
  patternPointId: EntityId;
  segmentIndex?: number;        // stops only
  placementId?: EntityId;       // stops only
  stopId?: EntityId;            // stops only
  nodeId?: EntityId;            // timepoints only
  name: string;                 // node name or stop name
  stopCode?: string;            // Node.stopCode or RouteStop.stopCode
  timing?: StopTimingRule;      // stops only
  time?: ServiceSeconds;        // undefined without a trip or a usable time
}
/** Section 4.3 for one segment. Returns one entry per timing, in order. */
export function segmentStopTimes(a: ServiceSeconds | undefined, b: ServiceSeconds | undefined, timings: readonly StopTimingRule[], roundingSeconds: StopTimeRoundingSeconds): Array<ServiceSeconds | undefined>;
/** Rows in pattern order: each timepoint, then the stops of its segment. Without `set`, only timepoints. Without `trip`, no times. */
export function stopTimeRows(input: { pattern: RoutePattern; set?: RouteStopSet; nodes: readonly Node[]; trip?: Trip; placements?: readonly PatternStopPlacement[]; roundingSeconds?: StopTimeRoundingSeconds }): StopTimeRow[];
```

- `placements` and `roundingSeconds`, when given, replace the set's placements for this pattern and its rounding. The Stop trips drawer uses them to show unsaved rule edits.
- A timepoint row's name is the Node's `name` (not `shortName`); a stop row's name is the `RouteStop`'s `name`. A placement whose stop is missing is skipped.
- Times come from `trip.stopTimes`, matched by `patternPointId`.

Tests (`src/domain/stopTimes.test.ts`), with times in seconds (8:00:00 = 28800):

1. One interpolated stop between 8:00 and 8:10, rounding 60: 8:05 (29100).
2. Two interpolated stops between 8:10 and 8:16, rounding 60: 8:12 (29520) and 8:14 (29640).
3. Two interpolated stops between 8:10 and 8:17, rounding 30: 8:12:00 (29520) and 8:14:30 (29670); rounding 60: 8:12 and 8:14.
4. `previous` gives `A` and `next` gives `B`, unrounded, with `A` = 8:00:20.
5. `[previous, interpolate, interpolate, next]` between 8:00 and 8:09: `A`, 8:03, 8:06, `B`.
6. Rounding never goes below `A`: `A` = 28850, `B` = 28852, one interpolated stop, rounding 60 gives 28850 (the rounded value 28800 is raised to `A`).
7. Exact arithmetic: `A` = 0, `B` = 100, two interpolated stops, rounding 30 gives 30 and 60.
8. Out of order `[next, interpolate]`: the interpolated stop is raised to `B`.
9. A missing `A`, a missing `B`, and `B < A` each give `undefined` for every stop.
10. `stopTimeRows` on a 3-point pattern returns timepoint, stop, timepoint, stop, stop, timepoint in that order, with Node `stopCode` on timepoint rows and the timepoint times unchanged; it returns only timepoints without a set; it returns no times without a trip; the `placements` override changes a rule's result.

### 8.4 `src/domain/stopPlacementMatching.ts`

Copy the structure of `src/domain/segmentDistanceMatching.ts`, with the differences in section 4.7.

```ts
export interface StopSegmentEntry { stopId: EntityId; timing: StopTimingRule; }
export type StopSkipReason = 'ambiguous' | 'conflict';
export interface StopSegmentChange { patternId: EntityId; segmentIndex: number; previous: StopSegmentEntry[]; next: StopSegmentEntry[]; sourcePatternIds: EntityId[]; }
export interface StopSegmentSkip { patternId: EntityId; reason: StopSkipReason; segmentIndex?: number; candidates?: { entries: StopSegmentEntry[]; patternIds: EntityId[] }[]; }
export interface StopPlacementPlan {
  mode: 'copyToOthers' | 'fillFromOthers';
  sourcePatternId: EntityId;
  changes: StopSegmentChange[];
  skips: StopSegmentSkip[];
  affectedPatterns: { patternId: EntityId; changeCount: number; overwriteCount: number }[];
}
export interface StopPlacementPlanInput {
  openPattern: RoutePattern;
  /** Fill: the editor draft. Copy: the stored placements of the open pattern. */
  openPlacements: readonly PatternStopPlacement[];
  /** The Route's saved patterns; the open pattern's saved record, if present, is ignored. */
  patterns: readonly RoutePattern[];
  /** The stored placements of every pattern. */
  placementsByPatternId: Readonly<Record<EntityId, readonly PatternStopPlacement[]>>;
  excludedPatternIds?: readonly EntityId[];
}
export function planStopFill(input: StopPlacementPlanInput): StopPlacementPlan;
export function planStopCopy(input: StopPlacementPlanInput): StopPlacementPlan;
/** Every other pattern of the Route that shares at least one non-ambiguous node pair with the open pattern. */
export function stopCopyCandidatePatternIds(openPattern: RoutePattern, patterns: readonly RoutePattern[]): EntityId[];
/**
 * Applies `plan.changes` to `current` (pattern ID → placements; the open pattern's draft for Fill, the stored map for Copy) and returns the
 * changed patterns' new placement lists. A changed segment's placements are replaced by new placements `{ id: newId(), stopId, timing,
 * afterPatternPointId: <sorted point segmentIndex of that pattern>, sequence: 0.. }`; other segments keep theirs. Each result is normalized.
 */
export function applyStopPlacementPlan(patterns: readonly RoutePattern[], current: Readonly<Record<EntityId, readonly PatternStopPlacement[]>>, plan: StopPlacementPlan, makeId: () => EntityId): Record<EntityId, PatternStopPlacement[]>;
```

- `openPattern` placements are read through `placementsBySegment`; entries are `{ stopId, timing }` in `sequence` order.
- Fill: for each empty segment of the open pattern, sources are other patterns with the key exactly once and a non-empty segment there. One distinct value: a change with sorted `sourcePatternIds`. Several: a `conflict` skip. None: nothing.
- Copy: for each non-empty segment of the open pattern, every other, non-excluded pattern with the key exactly once and a different value is a change, with `sourcePatternIds: [openPattern.id]`. `overwriteCount` counts changes whose `previous` is non-empty.
- Ordering as in `segmentDistanceMatching.ts`.

Tests (`src/domain/stopPlacementMatching.test.ts`): copy the fixture shape of `src/domain/segmentDistanceMatching.test.ts` (patterns A, B, C with shared pairs and a reverse pattern) and cover:
1. Copy replaces a shared segment on B and leaves the reverse pattern C unchanged.
2. Copy with B excluded gives no change.
3. Copy of identical lists gives no change; a difference only in `timing` is a change.
4. Copy never copies an empty source segment.
5. Fill fills only empty segments of the draft; a pattern that has only the reverse pair is not a source.
6. Fill conflict between two sources with different lists; agreement lists both sources.
7. Ambiguous pairs in a loop pattern are skipped and reported.
8. A pattern of another Route is never a source or target.
9. `applyStopPlacementPlan` gives new IDs through `makeId`, the target's own `afterPatternPointId`, sequences `0..n-1`, and keeps the target's other segments.

### 8.5 ST1 commit and gate

- Commit: `ST1: Stop types, derived stop times, reconciliation and placement matching (Decision 0079)`.
- Opus checks: only the listed files changed; no React, Dexie, or `src/persistence` import in the new modules; each rule in sections 4.3 to 4.7 has a test that asserts values; Opus reruns `pnpm typecheck` and `pnpm test`, reports to the user, and recommends ST2 (Haiku).

---

## 9. ST2: Persistence, backup 13, copies, deletion (Haiku)

### Read first

`git show 2c4e064` (all of it) and `git show d917026 -- src/persistence/backup.ts`. These commits are the template: for every place where `plannedFrequencies` was added, add `routeStopSets` the same way, with the differences below. Also read Decisions 0036, 0039, 0040, and 0043, and `codex.md` "Unit tests that need IndexedDB".

### Files Haiku may change

- `src/persistence/database.ts`, `dexieRepository.ts`, `inMemoryRepository.ts`, `backup.ts`, `routeStopPersistence.ts` (new)
- `src/domain/project.ts`
- `src/application/ports.ts`
- `src/application/routeDefinitionService.ts` (only the lines in 9.6)
- Tests: `src/persistence/database.test.ts`, `repository.test.ts`, `repositoryContract.test.ts`, `backup.test.ts`, `backupImportValidation.test.ts`, `plannedFrequencyBackup.test.ts`, `routeStopBackup.test.ts` (new), `src/domain/project.test.ts`, `src/application/routeDefinitionService.test.ts` (deletion tests only), `src/application/saveStatus.test.ts` (only to add a missing port member to a mock), `tests/ui/automatic-blocking-backup.spec.ts` (line 29), `tests/ui/scenario-copy-recovery.spec.ts` (lines 148, 167, 177)

### 9.1 Dexie version 11

In `src/persistence/database.ts`, after version 10:

```ts
    // Version 11 adds the Route-owned `routeStopSets` table (Decision 0079). It starts empty; no existing data is read or written.
    this.version(11).stores({ routeStopSets: 'id,scenarioId,routeId' });
```

Add the `routeStopSets!: Table<DatabaseRecordMap['routeStopSets'], string>;` property after `plannedFrequencies`.

### 9.2 Repositories

- `src/application/ports.ts`: add `getRouteStopSet(routeId: string): Promise<RouteStopSet | undefined>;` to `RouteDefinitionRepository`, after `getPattern`. Fix any test mock that no longer typechecks by adding a method that returns `undefined`, and change nothing else in that mock.
- `src/persistence/routeStopPersistence.ts` (new), modeled on `plannedFrequencyPersistence.ts`:
  ```ts
  export interface RouteStopOwners { scenarioIds: ReadonlySet<string>; routes: Array<{ id: string; scenarioId: string }>; patterns: RoutePattern[]; }
  /** Refuse a write that would store an invalid stop set: missing or foreign owner, a second set for one Route, no stops, or any error finding of validateRouteStopSet. */
  export function assertRouteStopSets(sets: RouteStopSet[], owners: RouteStopOwners): void;
  ```
  Messages: `Duplicate route stop set id ${id}.`, `Route stop set ${id} references a missing Scenario.`, `Route stop set ${id} references a missing Route.`, `Route ${routeId} has more than one stop set.`, `Route stop set ${id} has no stops.`, `Route stop set ${id} is invalid: ${ruleIds joined by ', '}`. Warnings do not refuse.
- `dexieRepository.ts` and `inMemoryRepository.ts`: at every place the PF3 commit handles `plannedFrequencies` (transaction table lists, Scenario delete, `getScenarioRecords`, the owned-table list, `saveScenarioRecords`, `getProjectSnapshot`, `saveProjectSnapshot`), handle `routeStopSets` the same way. Before `assert…`, call `pruneRouteStopSets(records.routeStopSets ?? [], { routes: records.routes, patterns: records.patterns })` (snapshot: the snapshot's routes and patterns), and write the pruned list. Omit the key from returned records when there are none, as plans do.
- Implement `getRouteStopSet(routeId)`: Dexie `this.db.routeStopSets.where('routeId').equals(routeId).first()`; in memory, the first match in key order.

### 9.3 `src/domain/project.ts`

- `ScenarioRecords` gains `/** Route stop sets (Decision 0079). Omitted or empty when none exist. */ routeStopSets?: RouteStopSet[];` after `plannedFrequencies?`.
- `duplicateRouteRecords`: copy the source Route's set with `remapRouteStopSet(set, { id: newId(), scenarioId: source.scenario.id, routeId: route.id, patternIds, pointIds }, now)`, and append it the way plans are appended (line ~154).
- `duplicateScenario`: copy every set with `routeIds.get(set.routeId)`, the Scenario's new id, `patternIds`, and `pointIds` (both maps exist near line 218 and 245). Return it like `plannedFrequencies`.
- `snapshotForScenario`, `projectSnapshotWithScenario`, `projectLastChangedAt`: add `routeStopSets` exactly as `plannedFrequencies` is handled there (lines ~317, ~340, ~362).

### 9.4 Backup schema 13 (`src/persistence/backup.ts`)

1. `PROJECT_BACKUP_SCHEMA_VERSION = 13`. Update the comment on line 39 to add "Version 13 adds `routeStopSets` and `Node.stopCode` (Decision 0079)."
2. **Trap.** Every version list that ends with `PROJECT_BACKUP_SCHEMA_VERSION` must also include `12`, and every `parsed.exportSchemaVersion === PROJECT_BACKUP_SCHEMA_VERSION` (a version-12 feature, line 709) becomes `[12, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number)`. Search the file for `PROJECT_BACKUP_SCHEMA_VERSION` and check each use. A version 12 file must import exactly as before.
3. `validateNodes`: when `node.stopCode` is present it must be a string with non-whitespace content: `Invalid project backup: nodes[${index}].stopCode`.
4. `validateRouteStopSets(values, owners)`: for schema 13 only (`parsed.exportSchemaVersion === 13`), read `parsed.routeStopSets ?? []`. Check each element is an object with string `id`, `scenarioId`, `routeId`, `roundingSeconds` in `[30, 60]`, an array `stops` of objects with string `id` and `name`, and an object `placementsByPatternId` whose values are arrays of objects with string `id`, `stopId`, `afterPatternPointId`, integer `sequence` ≥ 0, and `timing` in the three rules. Then `assertMetadata`. Then run `assertRouteStopSets` inside a `try` and rethrow as `Invalid project backup: ${message}`. Earlier versions give `[]`.
5. Pruning: the parsed sets go through `pruneRouteStopSets` with the parsed routes and patterns before they are put into the snapshot.
6. Export: add `...(snapshot.routeStopSets?.length ? { routeStopSets: snapshot.routeStopSets } : {})` after `plannedFrequencies` (line ~766).
7. Import as copy (near line 862): map each set with `remapRouteStopSet(set, { id: newId(), scenarioId: scenarioIds.get(set.scenarioId)!, routeId: routeIds.get(set.routeId)!, patternIds, pointIds }, now)` and include it like plans.

### 9.5 Version assertions

Change backup 12 → 13 and Dexie 10 → 11 at exactly the lines listed in section 3. In `database.test.ts`, add `routeStopSets` to the table-list test and to the "stores added after version N start empty" upgrade test, modeled on the `plannedFrequencies` lines 9-10 and 119-122.

### 9.6 Deletion cascade (`src/application/routeDefinitionService.ts`)

Only these changes:
- `scenarioDeletionToken`: add `routeStopSets: records.routeStopSets ?? []`.
- `deleteScenario` (line ~544): filter `routeStopSets` out of the snapshot like `plannedFrequencies`.
- Route deletion plan (lines ~1160-1197): add `routeStopSets` to `removed` (the Route's set), add `routeStopCount: <number of stops in the removed set, or 0>` to the impact, and filter the set out of `next`. Add `/** Stops of the Route's stop set deleted with the Route (Decision 0079). */ routeStopCount: number;` to `RouteDeletionImpact`.
- `planPatternDeletion`: add `stopPlacementCount` (the number of placements of the pattern) to the impact and `placements` to the fingerprint; in `next`, set `routeStopSets` to `pruneRouteStopSets` of the sets with that pattern's entry removed, using the next routes and patterns. Add `/** Stop placements removed with the pattern (Decision 0079). */ stopPlacementCount: number;` to `PatternDeletionImpact`.

### 9.7 Tests

- Contract (`repositoryContract.test.ts`, both repositories): add `'routeStopSets'` to `SCENARIO_OWNED` and the key list on line 120; a stop set round trips through `saveScenarioRecords` and `getScenarioRecords`; `getRouteStopSet` returns it and returns `undefined` for another Route; a save that drops a pattern prunes its placements; a save that leaves a set with no stops deletes it; an invalid set (two stops with one `stopCode`) is refused and nothing is written; Scenario deletion removes sets.
- `routeStopBackup.test.ts` (new, modeled on `plannedFrequencyBackup.test.ts`): export → import → export is identical for a project with stops and a Node `stopCode`; a version 12 file imports with no stops; import as copy remaps pattern keys and `afterPatternPointId` and keeps stop IDs; import refuses a set with a missing Route, an unknown `timing`, and `roundingSeconds: 45`.
- `project.test.ts`: Route duplication and Scenario duplication copy the set with remapped keys and points; the source set is unchanged.
- `routeDefinitionService.test.ts`: Route deletion impact counts stops and removes the set; pattern deletion impact counts placements, removes them, and prunes stops no other pattern uses; a changed set between review and deletion makes the deletion refuse.
- Dexie upgrade from version 10 keeps every existing record and gives an empty `routeStopSets` table.

### 9.8 ST2 commit and gate

- Commit: `ST2: Route stop persistence, Dexie 11, backup 13, copies and deletion (Decision 0079)`.
- Opus checks: every `plannedFrequencies` site of `git show 2c4e064` has a `routeStopSets` counterpart; the trap in 9.4 step 2 is handled (a version 12 file with `routeEstimateFactors` still imports them); no UI file changed; Opus reruns the ST2 verification row, reports, and recommends ST3 (Haiku).

---

## 10. ST3: Application (Haiku)

### Read first

`src/application/routeDefinitionService.ts` lines 280-345, 380-430, 598-765, 1150-1412; `src/application/tripTableCsv.ts` and its test; `src/application/draftChangeCounts.ts`; `src/persistence/csvText.test.ts` lines 1-40 and 121-150.

### Files Haiku may change

- `src/application/routeDefinitionService.ts`, `src/application/routeDefinitionService.test.ts`
- `src/application/draftChangeCounts.ts`, `src/application/draftChangeCounts.test.ts`
- `src/application/stopTripsView.ts` (new), `src/application/stopTripsView.test.ts` (new)
- `src/application/stopTimesCsv.ts` (new), `src/application/stopTimesCsv.test.ts` (new)
- `src/persistence/csvText.test.ts` (add one `cases()` entry only)

### 10.1 Types and constants (near the distance types, line ~286)

```ts
export interface RouteStopsEdit {
  routeId: string; patternId: string;
  /** The Route's whole stop list as the editor holds it. Stops no placement uses are pruned on save. */
  stops: RouteStop[];
  /** The open pattern's whole placement list. */
  placements: PatternStopPlacement[];
  roundingSeconds: StopTimeRoundingSeconds;
  /** `updatedAt` of the stop set the editor loaded; undefined when the Route had none. */
  baseUpdatedAt?: string;
}
export class RouteStopValidationError extends Error {
  constructor(readonly findings: ValidationFinding[]) { super('Resolve the highlighted stop problems before saving.'); this.name = 'RouteStopValidationError'; }
}
export interface StopPlacementPreview extends StopPlacementPlan {
  scenarioId: string; routeId: string;
  excludedPatternIds: string[];
  copyCandidates: { patternId: string; included: boolean }[];
  patternNames: Record<string, string>;
  segmentLabels: Record<string, string[]>;
  /** Stop ID → name, for every stop a change or skip names. */
  stopNames: Record<string, string>;
}
export const STOPS_CHANGED_ELSEWHERE = 'Stops changed after this editor opened. Close it and open it again.';
export const STOP_COPY_UNDO_REFUSED = "These stops were changed after the copy, so it can't be undone.";
const STOP_COPY_PREVIEW_STALE = 'Stops changed after the preview. Review the changes again.';
interface StopCopyUndo { routeId: string; scenarioId: string; before: RouteStopSet; writtenUpdatedAt: string }
```

Add a private field `stopCopyUndo?: StopCopyUndo` next to `segmentDistanceUndo`, and set it to `undefined` wherever `segmentDistanceUndo` is cleared (lines 392, 417, 629) and at the start of `saveRouteStops`.

### 10.2 Public methods (add each name to `RouteDefinitionApplication`)

1. `getRouteStopSet(routeId: string): Promise<RouteStopSet | undefined>` reads `repository.getRouteStopSet`.
2. `async saveRouteStops(edit: RouteStopsEdit): Promise<RouteStopSet | undefined>`. Find the Scenario with `recordsForRoute(edit.routeId)`. Inside `updateScenarioRecords`:
   1. The Route must exist (`'The selected route is no longer available.'`). The pattern must exist with `routeId === edit.routeId` (`'The selected Pattern is no longer available.'`).
   2. Let `current` be the stored set of the Route. If `current?.updatedAt !== edit.baseUpdatedAt`, throw `Error(STOPS_CHANGED_ELSEWHERE)`.
   3. Build `next`: `id: current?.id ?? newId()`, `scenarioId`, `routeId`, `roundingSeconds: edit.roundingSeconds`, `stops` with `name` trimmed and `stopCode` trimmed (an empty `stopCode` is omitted), `placementsByPatternId: { ...current?.placementsByPatternId, [edit.patternId]: normalizePlacements(pattern, edit.placements) }` (an empty list removes the key), `createdAt: current?.createdAt ?? now`, `updatedAt: now`.
   4. `const findings = validateRouteStopSet(next, routePatterns)`. If any is an error, throw `new RouteStopValidationError(findings)`.
   5. Replace the Route's set with `pruneRouteStopSets([next], { routes: current.routes, patterns: current.patterns })` and keep other Routes' sets.
   Return the stored set for the Route after the write, or `undefined` when pruning removed it.
3. `previewStopFill(aggregate: RouteDefinitionAggregate, set: RouteStopSet | undefined, pattern: RoutePattern, draftPlacements: PatternStopPlacement[]): StopPlacementPreview` (synchronous; no repository read). `planStopFill` with `openPlacements: draftPlacements`, `placementsByPatternId: set?.placementsByPatternId ?? {}`.
4. `applyStopFill(pattern: RoutePattern, draftPlacements: PatternStopPlacement[], preview: StopPlacementPreview): PatternStopPlacement[]` (synchronous) returns `applyStopPlacementPlan([pattern], { [pattern.id]: draftPlacements }, preview, newId)[pattern.id] ?? draftPlacements`. It writes nothing.
5. `async previewStopCopy(patternId: string, excludedPatternIds: string[] = []): Promise<StopPlacementPreview>`. Read the stored pattern and records as `previewDistanceCopy` does. If the Route has no set, or the pattern has no stored placements, throw `Error("Save this pattern's stops before copying them.")`.
6. `async applyStopCopy(preview: StopPlacementPreview): Promise<RouteStopSet>`, modeled on `applyDistanceCopy`: refuse an empty plan (`'No stops would change.'`); inside `updateScenarioRecords`, rebuild the plan from stored records, compare `JSON.stringify(plan.changes)` (`STOP_COPY_PREVIEW_STALE`), apply it with `applyStopPlacementPlan(..., newId)`, write a set with `withUpdatedAt`, validate (an error throws `RouteStopValidationError`), and record `stopCopyUndo` with the set as it was before. Return the written set.
7. `getStopCopyUndo(): { routeId: string; patternCount: number } | undefined`. `patternCount` is the number of distinct patterns in the copy's changes; store it on the undo record.
8. `async undoStopCopy(): Promise<RouteStopSet | undefined>`. Clear the undo first. Restore `before` with a new `updatedAt` only while the stored set's `updatedAt` equals `writtenUpdatedAt`; otherwise throw `Error(STOP_COPY_UNDO_REFUSED)`.

Add a private `describeStopPlacementPlan` modeled on `describeSegmentDistancePlan` (line 713), adding `stopNames` from the set's stops.

### 10.3 Reconciliation in route edits

- `PatternChangePreview` and `NodeChangePreview` gain `stopsMovedCount: number; stopsRemovedCount: number;`.
- `buildPatternPreview`: when the pattern is saved and the Route's set has placements for it, run `reconcilePlacements(saved, <the reconciled proposed pattern>, placements)` and report its counts; otherwise both are 0.
- `buildNodePreview`: sum the counts of `reconcilePlacements(pattern, candidate, placements)` over the affected patterns.
- `applyPatternChange` (when `saved` exists) and `applyNodeChanges` (each pattern in `savedById`): replace that pattern's entry with the reconciled placements, set the set's `updatedAt` when anything changed, and put the result in `next.routeStopSets`. A new pattern has no placements. The reset mode reconciles too.
- In `RouteDefinitionService` nothing else changes: the draft pattern has no stop data, so a pattern save cannot overwrite stop edits.

### 10.4 Node draft key

In `src/application/draftChangeCounts.ts`, `nodeKey` becomes `JSON.stringify([node.name, node.shortName ?? '', node.kind, node.notes ?? '', node.stopCode ?? ''])`. Add a test that a changed `stopCode` counts as one change.

### 10.5 `src/application/stopTripsView.ts`

```ts
export interface StopTripsTable {
  rows: StopTimeRow[];            // layout rows without times (stopTimeRows without a trip)
  trips: Trip[];                  // the input trips of the pattern, in input order
  /** Trip ID → one time per row (undefined when none). */
  times: Map<string, Array<ServiceSeconds | undefined>>;
}
export function stopTripsTable(input: { pattern: RoutePattern; set?: RouteStopSet; nodes: readonly Node[]; trips: readonly Trip[]; placements?: readonly PatternStopPlacement[]; roundingSeconds?: StopTimeRoundingSeconds }): StopTripsTable;
```

Only Trips whose `patternId` equals `pattern.id` are included. Tests: a 3-point, 2-stop pattern with two Trips gives the expected rows and times; Trips of another pattern are left out; `placements` and `roundingSeconds` overrides change the times.

### 10.6 `src/application/stopTimesCsv.ts`

```ts
export interface StopTimesCsvInput {
  /** The Trips of the displayed schedule, in table order. */
  trips: Trip[];
  patterns: RoutePattern[];
  nodes: Node[];
  set?: RouteStopSet;
  directionName: string;
  /** The Block label of each assigned Trip. */
  blockLabels: Map<string, string>;
}
export function stopTimesCsv(input: StopTimesCsvInput): string;
```

- Header: `Trip, Direction, Pattern, Stop Order, Stop ID, Stop Name, Timepoint, Time, Block`.
- One row per `stopTimeRows` row of each Trip (with `trip` given). `Trip` is the 1-based position of the Trip in `input.trips`. `Stop Order` is the 1-based position of the row within the Trip. `Timepoint` is `Yes` or `No`. `Time` uses `formatServiceTime(seconds, seconds % 60 !== 0)` (the same `clock` as `tripTableCsv.ts`), or empty.
- Free-text columns, written through `neutralizeFormulaText`: `Direction`, `Pattern`, `Stop ID`, `Stop Name`, `Block`. Every cell goes through `csvEscape`. Rows join with `\r\n` and the file ends with `\r\n`, as `tripTableCsv` does.
- A Trip whose pattern is missing is skipped.

Tests (`stopTimesCsv.test.ts`): header and rows for two Trips; Trip numbering follows input order; a Trip in a Block carries its label; a stop name with a comma is quoted and one starting with `=` is protected. In `src/persistence/csvText.test.ts`, add a `cases()` entry for `stopTimesCsv` whose `freeText` is exactly `['Direction', 'Pattern', 'Stop ID', 'Stop Name', 'Block']`.

### 10.7 Service tests (`routeDefinitionService.test.ts`)

Use the in-memory repository setup of the existing distance-copy tests (search for `previewDistanceCopy`).

1. `saveRouteStops` creates a set, trims names and codes, normalizes sequences, and returns it; saving an empty placement list for the only pattern removes the set.
2. `saveRouteStops` with an old `baseUpdatedAt` throws `STOPS_CHANGED_ELSEWHERE` and writes nothing.
3. A duplicate `stopCode` throws `RouteStopValidationError` with `routeStop.codeDuplicate`.
4. Fill preview and apply change only the returned draft; the repository is unchanged.
5. Copy preview → apply writes the target pattern's segment; a change between preview and apply throws the stale message; undo restores the set; undo after `saveRouteStops` is unavailable; undo after another write throws `STOP_COPY_UNDO_REFUSED`.
6. Removing a middle point through `previewPatternChange` / `commitPatternChange` reports `stopsMovedCount` and stores the moved placements; removing the last point reports `stopsRemovedCount`.
7. A Node deletion that removes a middle point of two patterns moves both patterns' stops.
8. A Route rename through `updateRoute` leaves the stop set unchanged.

### 10.8 ST3 commit and gate

- Commit: `ST3: Route stop commands, pattern reconciliation, stop trips view and stop times CSV (Decision 0079)`.
- Opus checks: only listed files changed; no UI file changed; the reconciliation is in `applyPatternChange` and `applyNodeChanges`, not in the UI; Opus reruns the ST3 verification row.

## 11. Gate A: user review of the data rules

Opus reports to the user: what is stored, how times are derived (with the examples of 8.3), the reconciliation rules (4.6), and the backup and database versions. The user confirms or changes the rules before any screen work starts. Recommend ST4 (Haiku).

---

## 12. ST4: Simple UI wiring (Haiku, exact specification)

This package reuses established components only. Haiku must not add CSS classes, colours, or a new layout. If a visual question comes up, stop and report it to Opus.

### Read first

`docs/ui-conventions.md`; `src/ui/route/RouteGrids.tsx` lines 1-50; `src/ui/route/RouteWorkspace.tsx` lines 150-190 and 278-291; `src/ui/App.tsx` lines 176-205; `src/ui/trips/TripsWorkspace.tsx` lines 640-647 and 789-794; `src/ui/shared/messages.ts` lines 1-90; `tests/ui/route-grid.spec.ts`; `tests/ui/support/ui.ts`.

### Files Haiku may change

`src/ui/route/RouteGrids.tsx`, `src/ui/route/RouteWorkspace.tsx` (only the lines named below), `src/ui/App.tsx` (only the two deletion texts), `src/ui/trips/TripsWorkspace.tsx` (only the export function and the export menu group), `src/ui/shared/messages.ts`, `tests/ui/route-grid.spec.ts`, `tests/ui/route-stop-wiring.spec.ts` (new).

### 12.1 Nodes table: Stop ID column

- `NODE_COLUMNS` becomes `['Node name', 'Node short name', 'Node type', 'Node notes', 'Node stop ID']` (the new column is last, so existing column indices stay the same).
- `text` returns `node.stopCode ?? ''` for `c === 4`. `onCommit` for `c === 4` calls `onChange(id, { stopCode: value.trim() || undefined })`.
- The header row gains `<th scope="col">Stop ID</th>` after Notes. The empty-row and add-row `colSpan` values become 6.
- The placeholder for an empty Stop ID cell is empty text.
- `tests/ui/route-grid.spec.ts`: if a Tab-order assertion through a Nodes row fails because of the new cell, update it to include `Node stop ID` between `Node notes` and the remove button, and report the change to Opus.

### 12.2 Pattern save review

- `RouteWorkspace.tsx` line 163: open the impact dialog also when `preview.stopsMovedCount + preview.stopsRemovedCount > 0`: `if (preview.classification === 'deterministic' || preview.stopsMovedCount + preview.stopsRemovedCount > 0) { … }`.
- `RouteEditImpactDialog`: after the `nonRevenueDetail` paragraph, add one paragraph per non-zero count, using the singular for 1:
  - `Moves {n} stop{s} into the merged segment.`
  - `Removes {n} stop{s} that are no longer on the pattern.`

### 12.3 Deletion confirmations (`App.tsx`)

- Route deletion `affected` list: after the planned-frequency entry, add `impact.routeStopCount ? `${impact.routeStopCount} stop${impact.routeStopCount === 1 ? '' : 's'}` : ''`.
- Pattern deletion `affected` list: after the block entry, add `impact.stopPlacementCount ? `${impact.stopPlacementCount} stop placement${impact.stopPlacementCount === 1 ? '' : 's'}` : ''`.

### 12.4 Export trips with stops CSV

- Add `async function exportStopTimesCsv()` after `exportTripsCsv`. It uses the same `safeName`, `direction`, and `blockLabels`, reads `const set = await service.getRouteStopSet(aggregate.route.id)`, and downloads `${safeName}-stop-times.csv` with `stopTimesCsv({ trips, patterns, nodes: aggregate.nodes, set, directionName: direction?.name ?? '', blockLabels })`. Errors go to `onError(error, 'Unable to export stop times.')`.
- The export group of `tripActionsMenu` becomes `{ items: [{ id: 'export-trips-csv', … unchanged }, { id: 'export-stop-times-csv', label: 'Export trips with stops CSV', disabled: !trips.length, onSelect: () => void exportStopTimesCsv() }] }`.

### 12.5 Messages

Add to `USER_FACING_VALIDATION_MESSAGES`:

| key | text |
|---|---|
| `routeStop.nameRequired` | Enter a stop name. |
| `routeStop.codeDuplicate` | Another stop on this route has this stop ID. |
| `routeStop.idDuplicate` | This stop is listed twice. |
| `stopPlacement.stopMissing` | This stop is no longer on the route. |
| `stopPlacement.idDuplicate` | This stop is listed twice. |
| `stopPlacement.repeatedInSegment` | This stop is already between these timepoints. |
| `stopPlacement.timingOutOfOrder` | Stop timing rules are out of order here. |
| `routeStopSet.roundingInvalid` | Choose 1 min or 30 s rounding. |

### 12.6 Browser spec `tests/ui/route-stop-wiring.spec.ts`

1. A typed Node Stop ID saves with the Nodes save bar and is shown after reload.
2. The Trips Actions menu has "Export trips with stops CSV"; the download is named `…-stop-times.csv` and its first line is the header in 10.6. A project with no stops gives only timepoint rows.
3. A Route with stops exports a stop row with the interpolated, rounded-down time. There is no stop editor yet, so build the Route by importing a schema 13 backup written in the spec (one stop between two timepoints, one Trip). Import it with the file-input pattern of `importFile` in `tests/ui/backup-import.spec.ts:45`.
4. Deleting a pattern with stop placements shows "1 stop placement" in the confirmation.

### 12.7 ST4 commit and gate

- Commit: `ST4: Node stop ID, stop review texts and stop times export (Decision 0079)`.
- Opus checks the diff touches only the named lines and adds no CSS; screenshots of the Nodes table at 1024 px and 1440 px; reruns the ST4 verification row; reports; recommends ST5 (Opus).

---

## 13. ST5: Route tab Stops drawer (Opus, UI design)

Opus designs this package. The requirements below are fixed; layout, wording beyond the named labels, and visual treatment are Opus's decisions within `docs/ui-conventions.md` (including the no-explanatory-text rule) and Decision 0047.

### Requirements

1. **Entry.** Pattern editor Actions menu, new group after the distance group: `Stops…`. Disabled for an unsaved new pattern and while the pattern draft has unsaved changes (title "Save this pattern before editing its stops"), as Copy distances is.
2. **Placement.** A right-side drawer that reuses the `shift-drawer` structure (header, scrolling body, footer). It does not cover the Actions menu trigger. Escape closes it, asking first when it has unsaved edits.
3. **Content.** The pattern's timepoints in `sequence` order, each with its Node name and Node stop ID (read-only). After each timepoint except the last: that segment's stops, then an "Add stop" control.
4. **Stop row.** Name, Stop ID, move up, move down, remove. The name field suggests the Route's existing stops by name or stop ID. Choosing one links the row to that stop; typing a new name creates a new stop on save. Editing a linked stop's name or ID changes it on every pattern of the Route, and the row shows how many patterns use it when more than one does.
5. **Moving.** Move up on a segment's first stop moves it to the end of the previous segment; move down on the last stop moves it to the start of the next segment. Both are disabled at the pattern's ends. The moved row keeps the `row-moved` marker (2026-10-30 convention). Keyboard: every control is reachable by Tab and has an accessible name naming the stop.
6. **Actions in the drawer.** "Fill from other patterns…" (works on the draft; `previewStopFill`/`applyStopFill`), "Copy to other patterns…" (disabled while the drawer has unsaved edits; `previewStopCopy`/`applyStopCopy`), and "Undo last stop copy" (listed only while `getStopCopyUndo()?.routeId` is this Route). The Fill and Copy dialogs reuse the structure of `PatternDistanceDialog`.
7. **Save.** A save bar, "N unsaved changes" with Discard and Save, as the Route tab's other grouped forms. Save calls `saveRouteStops` with the loaded set's `updatedAt` as `baseUpdatedAt` and the set's current `roundingSeconds` (or 60). `RouteStopValidationError` findings show beside their rows through `USER_FACING_VALIDATION_MESSAGES`; `STOPS_CHANGED_ELSEWHERE` shows as the drawer's error.
8. **Guards.** Selecting another pattern, changing tab, Route, or Scenario while the drawer has unsaved edits uses the Cancel / Discard / Save prompt, registered through the workspace's navigation guard.
9. **Width.** It works at 1024 px and 1440 px, and at 390 px without horizontal page scroll.

### Browser spec `tests/ui/route-stops.spec.ts`

Add stops to two segments, reorder across a timepoint, save, reload and see them; link an existing stop from a second pattern and rename it once (both patterns change); Fill from a pattern that shares a node pair; Copy with one target excluded, then Undo; the unsaved-changes prompt on pattern change; a duplicate stop ID shows its message beside the row; 390 px layout check. Add the open drawer to the axe run in `keyboard.spec.ts`.

---

## 14. ST6: Trips tab Stop trips drawer (Opus, UI design)

### Requirements

1. **Entry.** Trips Actions menu, a new group before the export group: `Stop trips…`. Opening it follows `startOpenEdit` like Shift and Build trips. Only one of the Shift bar, the Build trips drawer, and the Stop trips drawer is open at a time.
2. **Scope.** The displayed Route, Day, Direction, and Trip Profile. A Pattern selector lists the direction's patterns. The default is the pattern of the first selected Trip, else the first pattern that has stops, else the first pattern.
3. **Grid.** Rows are `stopTripsTable` rows (timepoints visibly distinct from stops). Columns are the pattern's Trips in table order: the selected Trips of that pattern when any are selected, otherwise all of them. The drawer scrolls inside itself in both directions; the stop name column stays visible while scrolling across Trips.
4. **Rules.** Each stop row has a timing select (Interpolate, Previous timepoint, Next timepoint). A rounding control offers "Round down to 1 min" and "30 s". Times update at once from the draft rules (`stopTripsTable` with `placements` and `roundingSeconds`). The `timingOutOfOrder` warning shows on its row.
5. **Save.** A save bar with Discard and Save. Save calls `saveRouteStops` with the set's stops unchanged, the edited placements of the shown pattern, and the edited rounding. While the drawer has unsaved edits, it is included in `holdsOpenEdit` and in the navigation guard.
6. **Empty states.** A pattern with no stops shows only timepoint rows. A direction with no Trips shows the rows with no columns.
7. **Side by side.** In side-by-side mode each pane opens its own drawer from its own Actions menu; only one drawer is open at a time across panes (the container's single-open-edit rule, Decision 0060).

### Browser spec `tests/ui/stop-trips.spec.ts`

Using a schema 13 backup fixture with stops on two patterns: the drawer shows the derived times; changing a rule to Next timepoint updates the times before saving; 30 s rounding shows seconds; Save persists after reload; selected Trips limit the columns; the drawer and the Shift bar cannot both be open; side-by-side opens one drawer; axe run in `keyboard.spec.ts`; 390 px layout check.

---

## 15. ST7: Documentation, closeout, full verification (Opus)

- `architecture_overview.md`: a "Route stops" section after the Route and Pattern model (Decision 0079 items 1 to 6, 10, 13); the status paragraph names Dexie version 11 and backup schema 13; "A node represents a scheduling timepoint…" gains a sentence pointing to Route stops.
- `docs/data-schema.md`: `RouteStopSet`, `RouteStop`, `PatternStopPlacement`, `Node.stopCode`, the `routeStopSets` table and index, backup 13.
- `docs/domain-glossary.md`: entries for Route stop, Stop placement, Stop trips, and Timing rule.
- `docs/ui-conventions.md`: the two drawers and their entry points.
- `codex.md`: a dated status line.
- `docs/implementation/stop-trips-closeout.md`: per-package results, verification, and findings.
- Decision 0079 status: "Accepted and implemented".
- Run the ST7 verification row in full and report failures with their output. Push to the branch. Report to the user and stop.

## 16. Out of scope

- Manual per-Trip stop times (user decision).
- A fixed-offset timing rule (user decision).
- Distance-based interpolation; stop distances.
- A wide stop-times CSV.
- Stops shared between Routes; GTFS import or export of stops.
- Pasting a stop list from a spreadsheet into the Stops drawer.
- Promoting a stop to a timepoint automatically when a Node with the same stop ID is inserted into its segment.
- Showing stops in the main Trips table or in Blocking.
- Separate arrival and departure times at a stop.
