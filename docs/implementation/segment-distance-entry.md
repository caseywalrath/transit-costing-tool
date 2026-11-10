# Segment distance entry and sharing between patterns

- Requested by the user on 2026-11-10, after a design discussion (recorded in the Decision below).
- Branch: `claude/fervent-cannon-rw8mso`. Never push to another branch. Do not open a pull request.
- Orchestration: **Opus** (primary agent). Opus owns architecture, writes the Decision record, writes every package brief from this plan, reviews every package diff, and runs the final verification.
- Structural packages D1 and D2: delegated to **Haiku** (structural class, Luna). Haiku follows this plan literally. Where this plan does not say what to do, Haiku stops and reports the question to Opus. Haiku does not choose wording, layout, or behavior.
- Package D3 (optional UI-design work) is deferred. It is listed under "Out of scope".

## 1. Summary

Today a planner types **cumulative miles** for each pattern point, and segment miles are derived. After this plan:

1. The planner types **segment miles** (miles from the previous point). Cumulative miles are shown as a read-only, derived column.
2. **Storage does not change.** `PatternPoint.cumulativeMiles` stays the stored field. Typing a segment value rewrites the cumulative values from that point to the end of the pattern.
3. Two actions are added to the pattern editor's **Actions** menu:
   - **Fill distances from other patterns…** fills segments of the open pattern **draft** whose distance is 0, using the same node pair on other patterns of the Route. When no other pattern has the pair in the same direction, it uses the reverse pair (B→A for A→B), labeled "from reverse". It writes nothing to the database: the filled draft is saved through the existing "Review and save" flow.
   - **Copy distances to other patterns…** writes the open, **saved** pattern's segment distances to the same node pair on other saved patterns of the Route. It shows a preview with per-pattern exclusion, writes in one transaction, and can be undone once.
4. **Reverse** (the existing button) is unchanged. It already reverses segment distances (`reversePattern`, `src/domain/patterns.ts:18`).

No Dexie schema, backup schema, or export version changes.

## 2. Code facts this plan depends on (verified 2026-11-10)

Haiku must not assume anything beyond these facts. If any of these facts no longer holds when the package starts, stop and report to Opus.

| Fact | Location |
|---|---|
| `PatternPoint` is `{ id, nodeId, sequence, cumulativeMiles, directionColumnId? }`. | `src/domain/types.ts:16` |
| `RoutePattern` has `points`, `routeId`, `scenarioId`, `updatedAt` (from `EntityMetadata`). It has no revision field. | `src/domain/types.ts:33` |
| `getSegmentMiles(pattern, pointIndex)` returns miles of the segment **ending** at `pointIndex`; 0 for index 0. It reads `pattern.points` in array order. | `src/domain/patterns.ts:10` |
| `patternTotalMiles` returns `undefined` when the last cumulative value is 0 ("not entered"). | `src/domain/patterns.ts:6` |
| `validatePattern` requires the first cumulative value to be 0 and values to be non-decreasing and finite. | `src/domain/patterns.ts:17` |
| `segmentKeys(pattern)` returns `${fromNodeId}>${toNodeId}` per segment, in `sequence` order. Reuse it; do not write a second one. | `src/domain/segmentRuntimeMatching.ts:42` |
| A pattern edit that changes only distances is classified `'distance'`. It does not rebalance runtime profiles or Trips (`rebalanceDependentService` only acts on added or removed points). | `src/domain/safeRouteEditing.ts:200-205`, `src/application/routeDefinitionService.ts:1185-1200` |
| Trips do not store miles. Blocking and Costing read `patternTotalMiles` when they run. | `src/domain/blocking.ts:105`, `src/domain/autoBlocking.ts:285` |
| `updateScenarioRecords(scenarioId, change)` re-reads stored records inside the write (Decision 0036) and publishes save status. | `src/application/routeDefinitionService.ts:1251` |
| `basicPatternFindings(pattern, aggregate)` is the pattern validation used before saving. | `src/application/routeDefinitionService.ts:1114` |
| `aggregateFromRecords(records, routeId)` builds the `RouteDefinitionAggregate` returned by a commit as `RouteEditCommitResult { aggregate, records }`. | `src/application/routeDefinitionService.ts:207`, `:394` |
| The segment-runtime copy, fill, and undo implementation is the pattern to copy: preview type, stale check by `JSON.stringify(plan.changes)`, one-level in-memory undo. | `src/application/routeDefinitionService.ts:253-275`, `:765-857` |
| `RouteDefinitionApplication` is a `Pick` of service method names. New public methods must be added to it. | `src/application/routeDefinitionService.ts:~1260-1310` |
| The pattern points grid: `usePatternPointsGrid` (colCount 2, column 1 editable, edits `cumulativeMiles`). | `src/ui/route/RouteGrids.tsx:50-63` |
| The pattern editor: `PatternEditor` renders the points table, the **Reverse** button, and the **Actions** `MenuButton`. | `src/ui/route/RouteWorkspace.tsx:244-252` |
| After a commit the workspace calls `onCommitted(result)` with a `RouteEditCommitResult`. | `src/ui/route/RouteWorkspace.tsx:161` |
| `SegmentRuntimeDialog` is the dialog to copy for structure, classes, focus, and error handling. | `src/ui/trips/dialogs.tsx:141-201` |
| Browser specs that read the current mile column: `tests/ui/pattern-distance.spec.ts`, `tests/ui/route-grid.spec.ts` (lines 64-87 and 111-120). | `tests/ui/` |
| The next free Decision number is **0064**. | `docs/decisions/` |

## 3. Rules (Opus records these in Decision 0064 before D1 starts)

1. **Entry.** The planner types segment miles. Cumulative miles are derived for display. Storage stays `cumulativeMiles`.
2. **Segment index.** In domain code, segment `i` is the segment from point `i` to point `i + 1` of the points sorted by `sequence`, the same indexing as `segmentKeys`. In the UI, segment `i` is shown on the row of point `i + 1`. The first row has no segment.
3. **Setting a segment.** Setting segment `i` to `m` adds `m − current` to the cumulative value of every point after point `i`. Each value written is rounded to 6 decimal places to remove floating-point noise. Point 0 stays 0.
4. **Not entered.** A segment of 0 means "not entered", the same convention as runtimes (Decision 0049, rule 6). Fill writes only into 0 segments. Copy overwrites any value, including 0, but a source segment of 0 is never copied.
5. **Segment identity.** The ordered node pair, as in Decision 0049 rule 2. A pair that occurs more than once in the open pattern or in another pattern is skipped for that pattern and reported as `ambiguous`.
6. **Scope.** Only the other patterns of the same Route in the same Scenario. The open pattern itself is never a source or target.
7. **Fill sources.** For each 0 segment `A>B` of the draft, the sources are the other patterns that contain `A>B` exactly once with a non-zero value. If there are none, the sources are the other patterns that contain `B>A` exactly once with a non-zero value; such a fill is marked `fromReverse: true`. Same-direction sources always win over reverse sources.
8. **Fill conflicts.** If the sources selected in rule 7 have different values, after rounding to 6 decimal places, the segment is not filled and is reported as `conflict` with each value and the patterns that hold it. If they agree, the segment is filled.
9. **Copy targets.** Copy reads the open pattern **as saved** (never the draft). For each non-zero segment `A>B`, every other pattern that contains `A>B` exactly once is a target. Copy never writes reverse pairs. Excluded patterns are left out.
10. **Identical values** are not changes.
11. **Copy write.** The plan is rebuilt from stored records inside `updateScenarioRecords`. If the rebuilt `changes` differ from the preview's, the write throws `Error('Distances changed after the preview. Review the changes again.')` and nothing is written. Every changed pattern is validated with `basicPatternFindings`; any error aborts the whole write. Every changed pattern gets `withUpdatedAt`. Runtime profiles, Trips, Blocks, and directions are not changed.
12. **Copy undo.** One level, in memory in `RouteDefinitionService`. It stores the previous `RoutePattern` records and the `updatedAt` each one was written with. Undo restores them only if every stored pattern's `updatedAt` still equals the written value. Otherwise it throws `Error("These distances were changed after the copy, so it can't be undone.")` and writes nothing. The undo is cleared by `commitPatternChange`, `commitNodeChanges`, `deletePattern`, and on reload.
13. **Fill has no undo of its own.** It changes only the draft. The existing **Discard** action on the save bar removes it.
14. **No remembered choices.** Exclusions are not stored.

## 4. Package D0: Decision record and documentation (Opus)

Opus does this before delegating.

- Create `docs/decisions/0064-segment-distance-entry-and-sharing.md` with Context (summary of the 2026-11-10 discussion: shared corridors, opposite directions on different streets, the runtime precedent in Decision 0049), Decision (the rules in section 3), Alternatives considered (a shared route-level distance table with per-point overrides, rejected for now because it needs a schema migration and lets one edit change the revenue miles of other patterns without a review), and Consequences (no schema change; 0-mile segments are treated as not entered; Copy can overwrite a deliberate difference, which the preview, exclusion, and undo reduce; undo is lost on reload).
- `architecture_overview.md` line 194: replace with "Each pattern point stores cumulative miles from the beginning of the pattern. The planner enters segment miles; the application rewrites the cumulative values (Decision 0064). Fill and Copy share segment distances between patterns of one Route; matching is derived and not stored." Line 205: append "(Decision 0064 adds Fill, which can use reverse-direction distances.)"
- `docs/data-schema.md` line 186: add a sentence that segment entry does not change storage (Decision 0064).
- `docs/domain-glossary.md` "Segment" entry (line 49): add "The planner enters segment distance; cumulative distance is derived for display (Decision 0064)."
- Commit: `Record Decision 0064: segment distance entry and sharing`.

Opus then gives Haiku the D1 brief (section 5) verbatim, plus the facts table (section 2) and the rules (section 3).

## 5. Package D1: Domain and application (Haiku, structural)

### Read first

`AGENTS.md`, `codex.md`, Decision 0049, Decision 0064, `src/domain/patterns.ts`, `src/domain/segmentRuntimeMatching.ts` (all of it), `src/application/routeDefinitionService.ts` lines 200-330, 370-415, 760-860, 1110-1260, and the `RouteDefinitionApplication` type near line 1260.

### Files Haiku may change

- `src/domain/patterns.ts` (add one function)
- `src/domain/segmentDistanceMatching.ts` (new)
- `src/domain/segmentDistanceMatching.test.ts` (new)
- `src/domain/patterns.test.ts` (add tests)
- `src/application/routeDefinitionService.ts`
- `src/application/routeDefinitionService.test.ts` (add tests)

Do not change any other file. Do not change `segmentRuntimeMatching.ts`.

### 5.1 `src/domain/patterns.ts`

Add, directly after `getSegmentMiles`:

```ts
/**
 * Decision 0064. Sets the miles of segment `segmentIndex` (point `segmentIndex` to point `segmentIndex + 1`, by `sequence`) and shifts
 * the cumulative miles of every later point by the difference. Values are rounded to 6 decimal places. Returns a new Pattern.
 * Throws if `segmentIndex` is out of range or `miles` is not a finite, non-negative number.
 */
export function setSegmentMiles(pattern: RoutePattern, segmentIndex: number, miles: number): RoutePattern
```

Behavior:
- Sort a copy of `points` by `sequence`. Out of range means `segmentIndex < 0` or `segmentIndex >= points.length - 1`: throw `Error('Segment not found.')`. A non-finite or negative `miles` value: throw `Error('Enter a non-negative number.')`.
- `delta = miles − (points[i+1].cumulativeMiles − points[i].cumulativeMiles)`. For each point `j > i`: `cumulativeMiles = round6(points[j].cumulativeMiles + delta)`, where `round6 = (x) => Math.round(x * 1e6) / 1e6`.
- Return `{ ...pattern, points }`, keeping the points in their original array order and every other point field unchanged. Do not change `updatedAt`.

Tests in `src/domain/patterns.test.ts`:
1. A 3-point pattern `[0, 1.5, 4]`: setting segment 0 to 2 gives `[0, 2, 4.5]`.
2. Setting the last segment changes only the last value.
3. `0.1 + 0.2` style noise: with points `[0, 0.1]`, setting segment 0 to 0.3 and then adding a point gives exactly `0.3` (no `0.30000000000000004`).
4. Out-of-range index and negative miles throw the messages above.
5. The input pattern is not mutated.

### 5.2 `src/domain/segmentDistanceMatching.ts` (new, pure; no React, no repository)

```ts
import type { EntityId, Miles, RoutePattern } from './types';
import { segmentKeys } from './segmentRuntimeMatching';
import { setSegmentMiles } from './patterns';

export type DistanceSkipReason = 'ambiguous' | 'conflict';
export interface DistanceChange {
  patternId: EntityId;            // the pattern that would be written (Fill: the draft)
  segmentIndex: number;
  previousMiles: Miles; nextMiles: Miles;
  sourcePatternIds: EntityId[];   // every agreeing source (Fill) or the open pattern (Copy)
  fromReverse: boolean;           // Fill only; always false for Copy
}
export interface DistanceSkip {
  patternId: EntityId; reason: DistanceSkipReason; segmentIndex?: number;
  candidates?: { miles: Miles; patternIds: EntityId[] }[];  // conflict only
}
export interface SegmentDistancePlan {
  mode: 'copyToOthers' | 'fillFromOthers';
  sourcePatternId: EntityId;      // the open pattern in both modes
  changes: DistanceChange[];
  skips: DistanceSkip[];
  affectedPatterns: { patternId: EntityId; changeCount: number; overwriteCount: number }[];
}
export interface SegmentDistancePlanInput {
  openPattern: RoutePattern;      // Fill: the draft. Copy: the saved pattern.
  patterns: RoutePattern[];       // the Route's saved patterns; may include the open pattern's saved record, which is ignored
  excludedPatternIds?: readonly EntityId[];  // Copy only
}

export function planDistanceFill(input: SegmentDistancePlanInput): SegmentDistancePlan;
export function planDistanceCopy(input: SegmentDistancePlanInput): SegmentDistancePlan;
export function applySegmentDistancePlan(patterns: RoutePattern[], plan: SegmentDistancePlan): RoutePattern[]; // returns only changed patterns
```

Rules to implement exactly:

- "Other patterns" = `patterns.filter((p) => p.id !== openPattern.id && p.routeId === openPattern.routeId && p.scenarioId === openPattern.scenarioId)`.
- Segment miles are read with the sorted points: `sorted[i+1].cumulativeMiles − sorted[i].cumulativeMiles`, rounded with `round6`. Do not use `getSegmentMiles`, because it reads array order, not `sequence` order.
- **Ambiguity (rule 5).** A key that occurs more than once in `segmentKeys(openPattern)` gives one `ambiguous` skip with `patternId: openPattern.id` and the first `segmentIndex`, and is not processed. For another pattern, a key occurring more than once there makes that pattern unusable for that key; record one `ambiguous` skip `{ patternId: other.id, segmentIndex: <index in the open pattern> }`.
- **Fill (rules 4, 7, 8).** For each segment `i` of the open pattern whose miles equal 0 and whose key is not ambiguous in the open pattern: collect same-direction sources (other patterns with the key exactly once and non-zero miles). If there are none, collect reverse sources with key `${to}>${from}`. Group the sources by value. One value: a change with `fromReverse` set to whether reverse sources were used, and `sourcePatternIds` listing every source, sorted. More than one value: a `conflict` skip with `candidates` sorted by `miles` ascending. No sources: nothing (not reported).
- **Copy (rules 4, 9, 10).** For each segment `i` of the open pattern with non-zero miles and a key that is not ambiguous in the open pattern: for each other pattern not in `excludedPatternIds` that contains the key exactly once at index `k`: if its miles at `k` differ from the source value, add a change `{ patternId: other.id, segmentIndex: k, previousMiles, nextMiles, sourcePatternIds: [openPattern.id], fromReverse: false }`.
- `affectedPatterns`: one entry per pattern with at least one change. `overwriteCount` counts changes whose `previousMiles` is not 0.
- **Ordering.** Sort `changes` and `skips` by pattern name (`localeCompare`, with `numeric: true` and `sensitivity: 'base'`), then pattern id, then `segmentIndex`. Sort `affectedPatterns` the same way. Fill changes all belong to the open pattern, so they sort by `segmentIndex`.
- `applySegmentDistancePlan`: group changes by `patternId`; apply `setSegmentMiles` in ascending `segmentIndex` order; return the changed patterns in the order of `affectedPatterns`. It sets no timestamps.

Tests: `src/domain/segmentDistanceMatching.test.ts`. Build the fixture inline: nodes `FRCC, 112AVE, 104AVE, WSTMNST, CCR, EVANS, YALE, ENGLWD`. Pattern **A** (Southbound) `FRCC→112AVE→104AVE→WSTMNST→CCR→EVANS`, segments `[1.1, 0.9, 2.0, 1.5, 3.2]`. Pattern **B** (Southbound) `WSTMNST→CCR→EVANS→YALE→ENGLWD`, segments `[0, 0, 0, 0]`. Pattern **C** (Northbound) `EVANS→CCR→WSTMNST`, segments `[3.4, 1.5]`. Required cases:

1. Fill B: segments 0 and 1 become 1.5 and 3.2, with `fromReverse: false` and source `[A]`. Segments 2 and 3 stay 0 and are not reported.
2. Fill a new pattern **D** `WSTMNST→CCR→EVANS` with segments `[0, 0]`, with only C as another pattern: it gets `[1.5, 3.4]` and both changes have `fromReverse: true`.
3. Same-direction wins: with A and C both present, D gets `CCR→EVANS = 3.2` from A, not 3.4 from C.
4. Fill does not change a non-zero segment.
5. Conflict: a pattern **E** `CCR→EVANS` of 3.0 plus A (3.2) gives a `conflict` for D segment 1 with candidates `[3.0 (E), 3.2 (A)]`. When E is 3.2, D is filled and `sourcePatternIds` lists A and E.
6. Copy from A: B segments 0 and 1 change (overwrite count 0, since they were 0); C is untouched, because Copy never writes reverse pairs.
7. Copy with B excluded: no changes.
8. Ambiguity: a loop pattern `WSTMNST→CCR→WSTMNST→CCR` gives `ambiguous` and no change for `WSTMNST>CCR`.
9. A pattern with another `routeId` is never a source or target.
10. Equal values give no change.
11. `applySegmentDistancePlan` on case 6 returns B with cumulative values `[0, 1.5, 4.7, 4.7, 4.7]` (later points shift by the deltas) and does not return A or C.

### 5.3 `src/application/routeDefinitionService.ts`

Add near the segment-runtime types (line ~253):

```ts
/** What the distance Fill and Copy dialogs show (Decision 0064). */
export interface SegmentDistancePreview extends SegmentDistancePlan {
  scenarioId: string; routeId: string;
  excludedPatternIds: string[];                          // empty for Fill
  copyCandidates: { patternId: string; included: boolean }[]; // Copy: every other pattern sharing at least one non-ambiguous key; empty for Fill
  patternNames: Record<string, string>;
  /** Pattern id to its segment labels by segment index, such as `WSTMNST → CCR`, built exactly like `segmentLabels` in describeSegmentRuntimePlan. */
  segmentLabels: Record<string, string[]>;
}
export const SEGMENT_DISTANCE_UNDO_REFUSED = "These distances were changed after the copy, so it can't be undone.";
const SEGMENT_DISTANCE_PREVIEW_STALE = 'Distances changed after the preview. Review the changes again.';
interface SegmentDistanceUndo { routeId: string; scenarioId: string; before: RoutePattern[]; writtenUpdatedAt: Map<string, string> }
```

Add a private field `segmentDistanceUndo?: SegmentDistanceUndo` next to `segmentRuntimeUndo`.

Public methods (add each name to `RouteDefinitionApplication`):

1. `previewDistanceFill(aggregate: RouteDefinitionAggregate, draft: RoutePattern): SegmentDistancePreview` (synchronous, no repository read). Input: `openPattern: draft`, `patterns: aggregate.patterns`. Names and labels come from `aggregate.patterns`, `aggregate.nodes`, and the draft. `scenarioId` and `routeId` come from `aggregate.route`.
2. `applyDistanceFill(draft: RoutePattern, preview: SegmentDistancePreview): RoutePattern` (synchronous). Applies only `preview.changes` to the draft with `setSegmentMiles` in ascending `segmentIndex` order and returns the new draft. It writes nothing.
3. `async previewDistanceCopy(patternId: string, excludedPatternIds: string[] = []): Promise<SegmentDistancePreview>`. It reads the stored pattern with `repository.getScenarioRecords` (find the scenario the same way `recordsForPattern` does, line ~598). If the pattern is not stored, throw `Error('Save this pattern before copying its distances.')`.
4. `async applyDistanceCopy(preview: SegmentDistancePreview): Promise<RouteEditCommitResult>`. Implement rule 11 with `updateScenarioRecords`. Inside the change callback: rebuild the plan, compare `JSON.stringify(plan.changes)`, apply it with `applySegmentDistancePlan`, set `withUpdatedAt(pattern, now)`, validate with `basicPatternFindings(pattern, this.managedAggregate(current, preview.routeId))`, and throw `RouteEditValidationError(findings)` if any finding has `severity === 'error'`. Replace only those patterns in `current.patterns`. After the write, set `segmentDistanceUndo` and return `{ records, aggregate: this.aggregateFromRecords(records, preview.routeId) }`. If `preview.changes` is empty, throw `Error('No distances would change.')`.
5. `getDistanceUndo(): { routeId: string; patternCount: number } | undefined`.
6. `async undoDistanceCopy(): Promise<RouteEditCommitResult>`. Implement rule 12. Clear `segmentDistanceUndo` before the write. Restored patterns get `withUpdatedAt(previous, now)`.

Clear `segmentDistanceUndo` (set it to `undefined`) as the first statement of `commitPatternChange`, `commitNodeChanges`, and `deletePattern`.

Tests in `src/application/routeDefinitionService.test.ts`, using the in-memory repository setup the existing segment-runtime tests use (search the file for `previewSegmentRuntimeCopy` and copy their setup):

1. Fill preview and apply change only the draft; the repository is unchanged.
2. Copy preview → apply writes the expected cumulative values to the target patterns and returns an aggregate containing them; runtime profiles and Trips are byte-for-byte unchanged.
3. Changing a target pattern between preview and apply makes apply throw the stale message, and nothing is written.
4. An invalid target (force one with a decreasing value in stored data) aborts the whole write.
5. Undo restores the previous patterns; undo after `commitPatternChange` is unavailable (`getDistanceUndo()` is `undefined`); undo after an external `updatedAt` change throws `SEGMENT_DISTANCE_UNDO_REFUSED`.
6. `previewDistanceCopy` for an unsaved pattern id throws "Save this pattern before copying its distances."

### 5.4 D1 verification (Haiku runs, Opus repeats)

- While working: `pnpm vitest run src/domain/segmentDistanceMatching.test.ts`, `pnpm vitest run src/domain/patterns.test.ts`, `pnpm vitest run src/application/routeDefinitionService.test.ts`.
- At the end: `pnpm typecheck` and `pnpm test` (the full unit suite). Report the summary lines and any failures only.
- Skipped: browser suite (no UI changed); backup round-trip (no schema change; `src/persistence/backup.test.ts` runs in `pnpm test` and must pass unchanged).
- Commit message: `Add segment distance fill and copy planning (Decision 0064)` with `Verified:` lines naming the commands, and naming the browser suite as skipped because no UI changed.

### 5.5 Opus review gate after D1

Opus checks, before D2 starts:
- The diff touches only the files listed in "Files Haiku may change".
- Every rule in section 3 has a test, and the tests assert values, not only counts.
- No React or Dexie import in `src/domain/segmentDistanceMatching.ts`.
- Cross-check: the applied cumulative values pass `validatePattern`.
- Opus reruns `pnpm typecheck` and `pnpm test`.
- Opus reports the result to the user and recommends D2 to Haiku. Opus does not start D2 automatically.

## 6. Package D2: UI wiring (Haiku, structural, with this exact specification)

This package reuses established components only: the points grid (`useGridNavigation`), `MenuButton`, `ModalDialog`, and the `SegmentRuntimeDialog` structure and classes. Haiku must not add CSS classes, colors, or a new layout. If a visual question comes up, stop and report it to Opus.

### Read first

`docs/ui-conventions.md`, `src/ui/route/RouteGrids.tsx` lines 50-63, `src/ui/route/RouteWorkspace.tsx` (whole file), `src/ui/trips/dialogs.tsx` lines 1-30 and 141-201, `src/ui/trips/TripsWorkspace.tsx` lines 540-560 and 770-785 (how the runtime undo menu item is shown), `tests/ui/pattern-distance.spec.ts`, `tests/ui/route-grid.spec.ts`, `tests/ui/segment-runtime-fill.spec.ts`.

### Files Haiku may change

- `src/ui/route/RouteGrids.tsx`
- `src/ui/route/RouteWorkspace.tsx`
- `src/ui/route/PatternDistanceDialog.tsx` (new)
- `tests/ui/pattern-distance.spec.ts`, `tests/ui/route-grid.spec.ts`, `tests/ui/support/ui.ts` (comment on line 103 only)
- `tests/ui/segment-distance-fill.spec.ts` (new)

### 6.1 Points grid (`RouteGrids.tsx`)

Change `usePatternPointsGrid`:
- `isEditable: (r, c) => c === 1 && r > 0`.
- `cellText: (r) => r === 0 ? '' : String(round6(points[r].cumulativeMiles − points[r-1].cumulativeMiles))`, where `points` is `pattern.points` (array order, the order the table renders).
- `onCommit`: keep both existing messages unchanged ("A value is required. Zero is valid." and "Enter a non-negative number."). On success call a new callback `onSetSegment(r - 1, parsed)` instead of `onUpdatePoint`. The hook signature becomes `usePatternPointsGrid(pattern, onSetSegment: (segmentIndex: number, miles: number) => void)`.
- Update the doc comment: "column 1 is Segment mi; the first point has no segment."

The table renders `pattern.points` in array order, and `normalizePattern` keeps `sequence` equal to array index in drafts (`updateDraft`, `RouteWorkspace.tsx:142`), so `r - 1` is the domain segment index.

### 6.2 Pattern editor (`RouteWorkspace.tsx`)

1. Add `function setSegment(segmentIndex: number, miles: number) { if (!patternDraft) return; updateDraft({ points: setSegmentMiles(patternDraft, segmentIndex, miles).points }); }` next to `updatePoint`. Import `setSegmentMiles` from `../../domain/patterns`. This is a domain helper, and the UI already imports `patternTotalMiles` the same way.
2. Pass `onSetSegment={setSegment}` to `PatternEditor`, add it to its props type, and pass it to `usePatternPointsGrid`.
3. Table header: replace `<th scope="col">Cumulative mi</th><th scope="col">Segment mi</th>` with `<th scope="col">Segment mi</th><th scope="col">Cumulative mi</th>`.
4. Segment cell (the grid cell, column 1): `data-cell` and the input's `aria-label` become `Point ${index + 1} segment miles`. At rest it shows `index === 0 ? '—' : formatMiles(segment)`, where `segment = segmentMiles(pattern, index)`. The edited marker compares segment values: the cell gets `grid-cell--edited` when `savedPattern` has a point with the same id and the previous point's id is also unchanged, and their segment miles differ, or when the point is new. Otherwise it gets `grid-cell`.
5. Cumulative cell (now read-only, in the position of the old Segment mi): `<td><output>{patternTotalMiles(pattern) === undefined ? 'incomplete' : point.cumulativeMiles.toFixed(2)}</output></td>`. Keep the `<output>` element: the browser specs locate it.
6. Actions menu: add a second group to the `MenuButton` `groups`, after the existing group:
   ```
   { items: [
     { id: 'fill-distances', label: 'Fill distances from other patterns…', disabled: !hasOtherPatterns, onSelect: onFillDistances },
     { id: 'copy-distances', label: 'Copy distances to other patterns…', disabled: !canDuplicate || dirty || !hasOtherPatterns, title: dirty ? 'Save this pattern before copying its distances' : undefined, onSelect: onCopyDistances },
     ...(distanceUndoApplies ? [{ id: 'undo-distances', label: 'Undo last distance copy', disabled: saving, onSelect: onUndoDistances }] : []),
   ] }
   ```
   `hasOtherPatterns` is true when the aggregate has at least one saved pattern whose id differs from the draft's id. `distanceUndoApplies` is `service.getDistanceUndo()?.routeId === aggregate.route.id`. If `MenuButton` items do not accept `title`, omit it and report this to Opus; do not change `MenuButton`.
7. State in `RouteWorkspace`: `const [distanceDialog, setDistanceDialog] = useState<'copy' | 'fill'>();`. `onFillDistances = () => setDistanceDialog('fill')`. `onCopyDistances = () => setDistanceDialog('copy')`. `onUndoDistances = () => void service.undoDistanceCopy().then(onCommitted).catch(onError)`.
8. Render, next to the existing impact dialog: `{distanceDialog && patternDraft && <PatternDistanceDialog service={service} mode={distanceDialog} aggregate={aggregate} draft={patternDraft} onFilled={(next) => { updateDraft({ points: next.points }); setDistanceDialog(undefined); }} onCopied={(result) => { onCommitted(result); setDistanceDialog(undefined); }} onClose={() => setDistanceDialog(undefined)} />}`.

### 6.3 `PatternDistanceDialog.tsx` (new)

Copy the structure of `SegmentRuntimeDialog` (`dialogs.tsx:141-201`): the same `ModalDialog` props pattern, the same class names (`confirm-dialog preview-dialog segment-runtime-dialog`, `preview-times`, `disclosure`, `recalculation-candidates`, `segment-runtime-skips`, `dialog-actions`), the same focus behavior (first checkbox for Copy, `autoFocus` on Cancel for Fill), the same `userFacingError` handling, and the same busy handling. Differences, exactly:

| Item | Fill | Copy |
|---|---|---|
| Title (`id="pattern-distance-title"`) | Fill distances from other patterns | Copy distances to other patterns |
| Sentence | Segments of 0.00 mi in this pattern will be filled from other patterns of this route that share the segment. When no pattern shares it in this direction, the opposite direction is used. | Distances for segments shared with other patterns of this route will be replaced with this pattern's values. Opposite-direction segments are not changed. |
| Preview source | `service.previewDistanceFill(aggregate, draft)`, synchronous, computed once on mount | `service.previewDistanceCopy(draft.id, excluded)`, async, rerun when `excluded` changes |
| Table columns | Segment, Miles, Source | Include (checkbox), Pattern, Segments changed, Replaced |
| Table rows | One per change: `segmentLabels[draft.id][segmentIndex]`, `formatMiles(nextMiles)`, the source pattern names joined with ", ", followed by " (from reverse)" when `fromReverse` | One per `copyCandidates` entry that is excluded or affected, the same filter as `SegmentRuntimeDialog` `rows` |
| Checkbox label | — | `Include ${patternName}` |
| Details disclosure | none (the table already lists every change) | "Show segment details": `Pattern · segment label · old → new mi` |
| Skips | "Segment appears more than once in a pattern" (`ambiguous`), "Other patterns disagree" (`conflict`), followed by `formatMiles(miles) (pattern names)` joined with " vs " | the same |
| Empty state | "No distances would change." | "No distances would change." |
| Confirm button | "Fill distances" calls `onFilled(service.applyDistanceFill(draft, preview))` | "Replace distances" calls `await service.applyDistanceCopy(preview)`, then `onCopied(result)`; "Saving…" while busy |

The confirm button is disabled when there is no preview, no changes, or the dialog is busy. A Copy error is shown in the `field-error` alert, and the dialog stays open.

### 6.4 Browser tests

Update the existing specs:
- `pattern-distance.spec.ts`: change `'Point 2 cumulative miles'` to `'Point 2 segment miles'`. The `output` expectations stay the same, because the outputs are now the cumulative column: `['incomplete','incomplete']`, then `['0.00','4.50']`, then `['incomplete','incomplete']`. Update the header comment.
- `route-grid.spec.ts` lines 64-87: rename the test to "Pattern points: Segment mi edits…", use `'Point 2 segment miles'`, and keep every assertion. Lines 111-120: use `'Point 2 segment miles'`, then make the Tab sequence assertions match point 2 (`Move point up`, ... ). If the Tab order differs from what the old test asserted for point 1, report the actual order to Opus before changing the assertions.
- `tests/ui/support/ui.ts` line 103: change the example name in the comment only.

Add `tests/ui/segment-distance-fill.spec.ts`, built with the helpers that `segment-runtime-fill.spec.ts` uses:
1. Typing segment miles 1.5 and then 3.2 on a 3-point pattern shows cumulative outputs `0.00, 1.50, 4.70`.
2. Fill: after saving pattern A, create a reverse with **Reverse**, set its segments to 0, run Fill, and see "(from reverse)" and the values; then **Review and save**.
3. Copy with one target excluded changes only the included target; **Undo last distance copy** restores it.
4. Copy is disabled while the draft has unsaved changes.
5. The dialog has no horizontal page scroll at 390 px (use the layout-check helper the runtime spec uses).

### 6.5 D2 verification

- `pnpm typecheck`.
- `pnpm test:ui -- --trace off tests/ui/pattern-distance.spec.ts tests/ui/route-grid.spec.ts tests/ui/segment-distance-fill.spec.ts tests/ui/pattern-discard-save.spec.ts tests/ui/route-editing.spec.ts tests/ui/keyboard.spec.ts`.
- `pnpm test` (full unit suite) and `pnpm build`.
- Skipped: the full browser suite runs in the closeout (section 8).
- Commit message: `Enter segment miles and add distance fill and copy to the pattern editor (Decision 0064)` with `Verified:` lines.

### 6.6 Opus review gate after D2

- The diff touches only the listed files, adds no CSS, and does not change `MenuButton`, `ModalDialog`, or `useGridNavigation`.
- The dialog wording matches section 6.3 exactly.
- The UI has no matching logic: it calls only the service methods from 5.3.
- Visual inspection by Opus: Playwright screenshots of the pattern editor and of both dialogs, in light and dark themes, at desktop width and at 390 px.

## 7. Verification per package

| Package | Run | Skip | Do not cut |
|---|---|---|---|
| D0 | Proofread; cross-check Decision 0064 against sections 3 and 4 | Tests (documentation only) | — |
| D1 | Focused Vitest files; `pnpm typecheck`; `pnpm test` | Browser suite (no UI changed) | `backup.test.ts`, `safeRouteEditing.test.ts`, the existing segment-runtime tests in `routeDefinitionService.test.ts` |
| D2 | `pnpm typecheck`; the six browser specs in 6.5; `pnpm test`; `pnpm build`; visual inspection | Full browser suite (closeout) | `pattern-distance.spec.ts`, `route-grid.spec.ts`, `pattern-discard-save.spec.ts`, `route-editing.spec.ts` |
| Closeout (Opus) | Full `pnpm test`, `pnpm typecheck`, `pnpm build`, full `pnpm test:ui -- --trace off` | — | All of it |

## 8. Closeout (Opus)

- Run the full verification row above. Report the results, including any failures with their output.
- Confirm that `exportProject` followed by `importProject` round-trips a project with edited segment distances (the existing backup test covers the schema; add no new schema version).
- Update the Status line of Decision 0064 to "Accepted and implemented".
- Push to `claude/fervent-cannon-rw8mso`. Report to the user and stop.

## 9. Out of scope

- A shared route-level distance table with live links (the rejected alternative in Decision 0064).
- Package D3 (UI design): automatic fill when a node is added to a pattern, and a marker on segments that differ from other patterns.
- Changing how **Move point** and **Remove point** treat distances. Cumulative values still move with their points, and `validatePattern` reports a decreasing distance.
- Matching across Routes.
- Changes to pull-out, pull-in, or deadhead miles.
