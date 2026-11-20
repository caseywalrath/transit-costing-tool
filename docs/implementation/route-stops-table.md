# Route stops table: work order plan

- Requested by the user on 2026-11-20, after the Federal BRT stop cleanup showed stop records shared across directions.
- Rules: Decision 0087 (`docs/decisions/0087-route-stops-table.md`). Where this plan and the decision differ, the decision governs and the difference is reported to Opus.
- Branch: `claude/sweet-allen-m3vw3x`, unless the user names another. Do not push to any other branch. Do not open a pull request unless the user asks.
- **Orchestration: Opus** (primary agent).
  - Opus gives each Haiku package its brief from this plan and reviews every package diff against it.
  - Opus does the UI-design packages (RS3, RS4), resolves every question a Haiku package stops on, and runs the final verification.
- **Structural packages: Haiku** (structural class, Luna): RS1 and RS2.
  - Haiku follows this plan literally. Every function name, file, rule, and test in a Haiku package is written here.
  - Where this plan does not say what to do, or a code fact in section 3 no longer holds, Haiku stops and reports the question to Opus.
  - Haiku does not choose wording, layout, or behaviour beyond what is written here.
- Do not start the next package automatically. At each gate, report the result to the user and recommend the next package and model.

## 1. Summary

A **Stops** section on the Route tab lists the Route's stop records with editable name, stop ID, and location, and shows which directions use each record. Planners can split a record by direction (one stop, or every shared stop at once), delete, merge, and import locations for the whole Route. The Stops drawer says when a typed name or stop ID links a row to an existing stop, and offers Undo link. There is no stored-data change.

## 2. Settled decisions (user, 2026-11-20)

| Question | Answer |
|---|---|
| Placement | Route tab, between Nodes and Patterns, collapsible |
| Main fix | Split by direction, for one stop and for every shared stop |
| New records from Split all | Name suffix per direction; no stop ID and no location, to be entered or imported |
| Undo | Restore points for Split, Split all, Delete, Merge |
| Drawer linking | Keep the rules; show a notice with Undo link |
| Model split | Haiku implements RS1 and RS2 from this plan with no assumptions; Opus orchestrates, does UI, and reviews |

## 3. Code facts this plan depends on (verified 2026-11-20 on `main` at `aea64aa`)

Haiku must not assume anything beyond these facts. If a fact no longer holds when a package starts, stop and report it to Opus.

| Fact | Location |
|---|---|
| `RouteStop { id; name; stopCode?; latitude?; longitude?; speedLimitMph? }`; `PatternStopPlacement { id; stopId; afterPatternPointId; sequence; timing }`; `RouteStopSet` with `stops`, `placementsByPatternId`, optional `timepointStopCodesByPatternId`, `timepointLocationsByPatternId`, `interpolation`. | `src/domain/types.ts:54-81` |
| `RoutePattern.directionId?`; `RouteDirection { id, name, … }`; `orderDirections(directions)`. | `src/domain/types.ts`, `src/domain/directions.ts:52` |
| `normalizeStopLocation`, `validateRouteStopSet(set, patterns)` (errors include `routeStop.nameRequired`, `routeStop.codeDuplicate`, `stopPlacement.repeatedInSegment`, and the `stopLocation.*` rules), `pruneRouteStopSets` (removes stops no placement uses). | `src/domain/stops.ts:65`, `:146`, `:202` |
| `newId()`. | `src/domain/ids.ts:5` |
| `RouteStopValidationError(findings)`, `STOPS_CHANGED_ELSEWHERE`, `saveRouteStops` (stale check `stored?.updatedAt !== edit.baseUpdatedAt`, write through `this.updateScenarioRecords`, clears `this.stopCopyUndo`). | `src/application/routeDefinitionService.ts:339`, `:354`, `:798` |
| `RouteDefinitionApplication = Pick<RouteDefinitionService, …>` method-name union. | `src/application/routeDefinitionService.ts:1749` |
| Restore point coverage: `ROUTE_DEFINITION_COVERAGE` entries such as `deleteRoute` (`resolve` reads `lookup.getRoute(routeId)` and returns `{ scope: 'scenario', scenarioId, refs: { routeId } }`). | `src/application/restorePointCoverage.ts:67-80` |
| `RestorePointKind` union; `routeStopSets` is a `RecordCollection`. | `src/domain/types.ts:217-224` |
| Restore point labels by kind (`case 'deleteRoute': return \`Deleted route ${names.route ?? ''}\`.trim();`). | `src/ui/shared/messages.ts:233-237` |
| `readStopLocationFile`, `matchStopLocations(rows, targets)` with targets `{ key, stopCode?, name }`. | `src/application/stopLocationImport.ts:76`, `:131` |
| Stops drawer: `linkIfSuggested` (162), `linkIfSavedCode` (176), `pasteLocations` (228), `readImportFile` (262), name and Stop ID inputs (365-366). | `src/ui/route/PatternStopsDrawer.tsx` |
| `StopLocationImportDialog`, `StopLocationImportReview`, `locationText`. | `src/ui/route/StopLocationImportDialog.tsx` |
| Route tab sections: `WorkSurface title="Nodes"` (line 278) and `WorkSurface title="Patterns"` (279). `WorkSurface` takes `collapse: { open, onToggle, id }`. | `src/ui/route/RouteWorkspace.tsx`, `src/ui/shared/surfaces.tsx:7` |
| The modal dialog inventory and count. | `src/ui/modalDialogs.test.ts` |
| Scripts: `pnpm typecheck`, `pnpm test`, `pnpm build`. Browser runs in a cloud session: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test <spec> --trace off`. | `codex.md` |

## 4. Rules (RS1, `src/domain/routeStopManagement.ts`, new)

All functions are pure. They never mutate their inputs. "Patterns" means the patterns of the set's Route.

```ts
export interface RouteStopUsage { stopId: EntityId; patternIds: EntityId[]; countByDirectionId: Record<string, number>; sharedAcrossDirections: boolean }
export function routeStopUsage(set: RouteStopSet, patterns: readonly RoutePattern[]): Map<EntityId, RouteStopUsage>

export type RouteStopFields = Pick<RouteStop, 'name' | 'stopCode' | 'latitude' | 'longitude' | 'speedLimitMph'>;
export function applyRouteStopEdits(set: RouteStopSet, edits: ReadonlyArray<{ id: EntityId } & RouteStopFields>): RouteStopSet

export function splitRouteStop(set: RouteStopSet, patterns: readonly RoutePattern[], input: { stopId: EntityId; directionId: EntityId; newStop: { id: EntityId } & RouteStopFields }): RouteStopSet
export function splitSharedRouteStops(set: RouteStopSet, patterns: readonly RoutePattern[], input: { directionOrder: readonly EntityId[]; keepDirectionId: EntityId; suffixByDirectionId: Readonly<Record<EntityId, string>>; renameKept: boolean; newId: () => EntityId }): { set: RouteStopSet; created: Array<{ fromStopId: EntityId; stopId: EntityId; directionId: EntityId }> }
export function deleteRouteStops(set: RouteStopSet, stopIds: readonly EntityId[]): RouteStopSet
export function mergeRouteStops(set: RouteStopSet, input: { keepStopId: EntityId; mergeStopIds: readonly EntityId[] }): RouteStopSet

export class RouteStopCommandError extends Error { constructor(readonly code: 'stopMissing' | 'nothingToSplit' | 'mergeNeedsTwo') }
```

1. **`routeStopUsage`.**
   - There is one entry per stop of `set.stops`.
   - `patternIds`: the patterns whose `placementsByPatternId` entry has at least one placement of the stop, in `patterns` order, each once.
   - `countByDirectionId`: the number of those patterns per `pattern.directionId`; a pattern without one counts under the key `''`.
   - `sharedAcrossDirections`: true when two or more keys other than `''` have a count above 0.
2. **`applyRouteStopEdits`.**
   - For each edit, it replaces the matching stop's five fields with the edit's.
   - `name` is trimmed. `stopCode` is trimmed and omitted when blank. The location goes through `normalizeStopLocation` (an absent result omits all three fields).
   - The stop's `id` and place in `set.stops` are kept.
   - An edit whose `id` is not in the set throws `RouteStopCommandError('stopMissing')`.
   - It does not validate; the service does.
3. **`splitRouteStop`.**
   - It throws `stopMissing` when `stopId` is not in the set.
   - Let *moved* be the patterns with `directionId === input.directionId` that place the stop, and *kept* the other patterns that place it. When *moved* or *kept* is empty, it throws `nothingToSplit`.
   - The new stop is built as in rule 2 and inserted in `set.stops` right after the original.
   - In every *moved* pattern, each placement with `stopId === input.stopId` gets `stopId = newStop.id`. Its `id`, `sequence`, and `timing` are kept.
4. **`splitSharedRouteStops`.**
   - It walks `set.stops` in order. For every stop with `sharedAcrossDirections`:
     - The *keeper direction* is `keepDirectionId` when that direction uses the stop. Otherwise it is the first direction in `directionOrder` that uses it.
     - For every other direction that uses the stop, in `directionOrder` order, it applies rule 3 with a new stop:
       - `id`: `newId()`.
       - `name`: the original name, then a space and the trimmed suffix of that direction when the suffix is not blank; otherwise the name is unchanged.
       - No stop ID and no location.
       - It is recorded in `created`.
     - When `renameKept` is true and the keeper direction's suffix is not blank, the original is renamed the same way.
   - Patterns without a direction stay on the original.
   - Stops that are not shared are unchanged.
   - New stops follow the rule 3 order: each right after its original, and several in `directionOrder` order.
5. **`deleteRouteStops`.**
   - It removes the listed stops and every placement of them. A pattern left with no placements loses its `placementsByPatternId` entry.
   - Unknown IDs are ignored.
   - Timepoint stop IDs and locations are unchanged.
6. **`mergeRouteStops`.**
   - It throws `mergeNeedsTwo` when `mergeStopIds` is empty or contains `keepStopId`.
   - It throws `stopMissing` when any of the IDs is not in the set.
   - Every placement of a stop in `mergeStopIds` gets `stopId = keepStopId`, and those stops are removed. The kept stop's fields are unchanged.
   - It does not check for repeats; `validateRouteStopSet` reports `stopPlacement.repeatedInSegment`, which the service refuses.

### Tests (`src/domain/routeStopManagement.test.ts`, new)

Use a fixture with two directions (D1, D2), patterns P1 and P2 in D1, P3 in D2, P4 without a direction, and stops S1 (on P1, P2, P3), S2 (P1 only), and S3 (P3, P4).

1. Usage:
   - S1 counts `{ D1: 2, D2: 1 }` and is shared.
   - S2 is not shared.
   - S3 counts `{ D2: 1, '': 1 }` and is not shared.
2. Edits trim the name and stop ID, drop a blank stop ID, and normalize the location. An unknown ID throws `stopMissing`.
3. Splitting S1 for D2 moves only P3's placement, keeps its `id`, `sequence`, and `timing`, and inserts the new stop after S1.
4. Splitting S2 for D1 throws `nothingToSplit`. So do S2 for D2 and S3 for D2, since P4 has no direction and does not count as another direction.
5. Split all with keep D1, suffixes `{ D1: 'SB', D2: 'NB' }`, and `renameKept: true`:
   - It renames S1 to "S1 SB" and creates "S1 NB" for P3 only.
   - S2 and S3 are unchanged.
   - `created` has one entry.
6. Split all with keep D2 when D2 does not use the stop: the keeper is the first direction in `directionOrder`.
7. Delete S1 removes it and its placements. P2's entry disappears when it held only S1. Timepoint stop IDs are unchanged.
8. Merge S2 into S1:
   - P1's S2 placement points to S1 and S2 is removed.
   - `validateRouteStopSet` then reports `stopPlacement.repeatedInSegment` when P1 already had S1 in that segment.
   - `mergeNeedsTwo` and `stopMissing` are thrown as stated.

### Commit and gate

`RS1: Route stop usage, split, delete, merge, and field edits (Decision 0087)`. Run `pnpm typecheck`, the new test file, then `pnpm test`. Opus reviews and starts RS2.

## 5. RS2: Service, restore points, messages (Haiku)

Files: `src/application/routeDefinitionService.ts`, `src/application/restorePointCoverage.ts`, `src/domain/types.ts` (the `RestorePointKind` union only), `src/ui/shared/messages.ts`, and the tests below.

1. **Methods on `RouteDefinitionService`.**
   - Each method:
     - starts with `this.stopCopyUndo = undefined`;
     - writes through `this.updateScenarioRecords` like `saveRouteStops`;
     - refuses with `STOPS_CHANGED_ELSEWHERE` when the stored set's `updatedAt` differs from `baseUpdatedAt`, or when there is no stored set;
     - applies the RS1 function;
     - runs `validateRouteStopSet` on the result against the Route's patterns, and throws `RouteStopValidationError` with the findings when any has severity `error`;
     - stamps `updatedAt` with `this.now()`, writes, and returns the written set.
   - A `RouteStopCommandError` is rethrown as `Error` with the message for its code (item 3).
   - The methods:

   ```ts
   saveRouteStopRecords(input: { routeId: string; edits: Array<{ id: string } & RouteStopFields>; baseUpdatedAt: string }): Promise<RouteStopSet>
   splitRouteStop(input: { routeId: string; stopId: string; directionId: string; newStop: RouteStopFields; baseUpdatedAt: string }): Promise<RouteStopSet>   // newStop.id = newId()
   splitSharedRouteStops(input: { routeId: string; keepDirectionId: string; suffixByDirectionId: Record<string, string>; renameKept: boolean; baseUpdatedAt: string }): Promise<RouteStopSet>   // directionOrder from orderDirections of the Route's directions; newId
   deleteRouteStops(input: { routeId: string; stopIds: string[]; baseUpdatedAt: string }): Promise<RouteStopSet | undefined>   // undefined when the set is pruned away
   mergeRouteStops(input: { routeId: string; keepStopId: string; mergeStopIds: string[]; baseUpdatedAt: string }): Promise<RouteStopSet>
   ```

   - Add the five names to the `RouteDefinitionApplication` union.
2. **Restore points.**
   - Add `'splitRouteStops' | 'deleteRouteStops' | 'mergeRouteStops'` to `RestorePointKind`.
   - In `ROUTE_DEFINITION_COVERAGE`, add `splitRouteStop` and `splitSharedRouteStops` (both kind `splitRouteStops`), `deleteRouteStops`, and `mergeRouteStops`.
   - Each `resolve` reads `args[0].routeId` with `lookup.getRoute` and returns `{ scope: 'scenario', scenarioId, refs: { routeId } }`, as `deleteRoute` does.
   - `saveRouteStopRecords` is not covered.
3. **Messages.**
   - Restore point labels in `messages.ts`, next to `deleteRoute`:
     - `splitRouteStops`: `Split stops by direction on route ${names.route ?? ''}` (trimmed);
     - `deleteRouteStops`: `Deleted stops of route …`;
     - `mergeRouteStops`: `Merged stops of route …`.
   - Command errors:
     - `stopMissing`: "A selected stop is no longer on this route."
     - `nothingToSplit`: "Only one direction uses this stop, so there is nothing to split."
     - `mergeNeedsTwo`: "Choose at least two stops to merge."
4. **Tests** (`src/application/routeStopManagementService.test.ts`, new; follow the fixture style of the existing `saveRouteStops` tests):
   - each method writes and returns the set;
   - a stale `baseUpdatedAt` is refused with `STOPS_CHANGED_ELSEWHERE`;
   - a duplicate stop ID from an edit or a split throws `RouteStopValidationError` and writes nothing;
   - a merge that repeats a stop in a segment is refused;
   - deleting every stop of a set with no timepoint data removes the set.
   - In the restore point coverage test, split, delete, and merge each store one restore point of their kind, and Restore returns the set as before.

### Commit and gate

`RS2: Route stop management service and restore points (Decision 0087)`. Run `pnpm typecheck`, the new and touched test files, then `pnpm test`. Opus reviews and starts RS3.

## 6. RS3: Stops section (Opus, UI)

Files: `src/ui/route/RouteStopsSurface.tsx` (new), `src/ui/route/routeStopDialogs.tsx` (new), `src/ui/route/RouteWorkspace.tsx` (placement only), `src/ui/styles/route.css`, `src/ui/modalDialogs.test.ts`, and `tests/ui/route-stops-table.spec.ts` (new).

- **The section.**
  - A `WorkSurface` titled "Stops" with the stop count, between Nodes and Patterns.
  - It is collapsible. The open state is stored under `transit-costing-tool.route-stops-open.v1`, closed when the Route has no stops.
- **The table.**
  - A checkbox, then Stop, Stop ID, Latitude, Longitude, Speed (mph), Used by, and a row Actions menu.
  - Fields are edited in place. A **Save** bar counts the unsaved edits and saves through `saveRouteStopRecords`.
  - A pasted spreadsheet block fills across and down, as in the drawer.
  - Validation findings show under their row.
- **Used by** shows the counts per direction by direction name. The shared mark has the accessible name "Used by more than one direction".
- **Filters** are segmented buttons with counts (All, Shared across directions, Missing stop ID, Missing location) and a text filter.
- **The row menu:** Split by direction…, Delete…. **Merge…** and **Delete…** appear in a selection bar when two or more rows are ticked.
- **The section Actions menu:** Split all shared stops…, Import stop locations….
- **Dialogs** (`routeStopDialogs.tsx`):
  - Split one stop: the direction to move, plus name, stop ID, and location for the new record.
  - Split all: the keep direction, a suffix per direction, "Add the suffix to the kept stops too", and a list of the stops it will split.
  - Delete review: the patterns per stop.
  - Merge: choose the kept stop, with the pattern list.
  - Each write shows its restore-point notice. Unsaved field edits must be saved or discarded before a structural command.
- **Spec:**
  - split one stop and check both drawers;
  - split all with suffixes;
  - Undo from the notice;
  - edit and save a stop ID;
  - a duplicate stop ID error;
  - delete review;
  - merge refusal on a repeat;
  - the filters.
- **Checks:** screenshots at 1024 px and 1440 px. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, the new spec, and `route-stops.spec.ts` and `route-stop-locations.spec.ts`.

## 7. RS4: Route-wide import and the drawer link notice (Opus, UI)

- The section's **Import stop locations…** builds one target per stop (`stop:<id>`, its stop ID and name) and reuses `StopLocationImportDialog`. Apply writes into the table's unsaved edits.
- **Stops drawer:**
  - `linkIfSuggested` and `linkIfSavedCode` record the row's previous stop and values.
  - The row shows "Linked to existing stop {name} ({stop ID})" and an **Undo link** button, until the next edit of that row or Save.
  - Undo link restores the placement's `stopId` and the previous stop's draft values.
- **Specs:** an import that fills stops of both directions; a typed stop ID that links shows the notice, and Undo link restores the new stop.

## 8. Gate C (user)

On Federal BRT, run **Split all shared stops…** (keep Southbound, suffixes "SB" and "NB"). Then enter or import the Northbound stop IDs and locations, and check the Stops drawers of both directions.

## 9. RX: Documentation and closeout (Opus)

- `architecture_overview.md` (Route Stops section), `docs/ui-conventions.md`, `docs/domain-glossary.md` (Stop record, Split by direction).
- Decision 0087 status "Accepted and implemented".
- `codex.md` dated status line; closeout file with per-package results.
- Full browser suite; push; report and stop.

## 10. Out of scope

- Adding a stop from the Stops section. A stop exists through a placement; it is added in the Stops drawer.
- Moving placements between patterns, or changing stop order, from the section.
- Linking timepoints to stop records (Decision 0085, alternatives).
- Showing stops on a map.
