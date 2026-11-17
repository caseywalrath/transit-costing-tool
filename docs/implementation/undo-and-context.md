# Undo, warnings, and working context: work order plan

- Requested by the user on 2026-11-17 after the destructive-actions inventory (`docs/implementation/destructive-actions-inventory.md`). Decision 0081 (`docs/decisions/0081-restore-points-and-working-context.md`) is accepted: the user approved every recommendation D1 to D9 on 2026-11-17 (section 2).
- Branch: `claude/vibrant-sagan-6v2g57`, unless the user names another. Do not open a pull request unless the user asks.
- **Opus orchestrates.** Opus gives each Haiku package its brief from this plan, reviews every diff before the next package starts, does the delicate packages (FX2R, FX4, FX6), writes the work orders of FX7 and FX8 when they come up, and runs the final verification.
- **Haiku executes FX1, FX2, FX3, and FX5** from the exact instructions below, under the rules of section 3.
- Do not start the next package automatically. At each gate, report the result and recommend the next package and model.

## 1. Summary

1. **Undo by restore points.** Every High-risk deletion or replacement, and every Low-risk deletion whose dialog says "This cannot be undone", stores a restore point in the same IndexedDB transaction as its write (FX1, FX2). A restore point holds only the rows the command changed, so an older one can be restored while those rows are untouched (FX2R). After the command, the notice area shows what was done, where, and an **Undo** button; the Project menu holds **Undo {last action}** and **Undo history…** (FX4).
2. **Warning fixes.** Inventory gaps G2 to G17 get exact texts, counts, and button styles (FX2 supplies the counts, FX3 the screens). No new confirmation dialog is added.
3. **Working context.** The Trip profile and Day of each Scenario and the Direction of each Route are remembered across reloads; the application says so when it has to open a different Trip profile; the browser tab title names the context (FX5). The scope bar shows Project › Scenario › Trip profile › Blocking scenario, and Costing follows the same Trip profile and Blocking scenario (FX6).

### 1.1 How the plan avoids nagging

| Rule | Effect |
| --- | --- |
| N1. No new confirmation dialogs. | Three confirmations are removed (D3). |
| N2. Undo notices are non-modal, need no dismissal, and are replaced by the next notice. | The safety net never interrupts. |
| N3. Context text appears in three places only: the scope bar, dialogs whose effect reaches beyond the visible table, and Undo notices. | No "you are in…" interstitials. |
| N4. A context level with two or more choices gets an identity colour dot; one choice is plain. | A planner with one Trip profile sees nothing extra. |
| N5. The application reports a context change only when it made the change itself. | A planner's own choices are never echoed. |

## 2. Settled decisions (user, 2026-11-17)

| ID | Question | Answer |
| --- | --- | --- |
| D1 | Undo mechanism | Restore points of changed rows |
| D2 | Retention | Newest 20, none older than 30 days, at most 50 MB in total |
| D3 | Confirmations replaced by the Undo notice | Remove one trip, pull-out, or pull-in from the Current block (B8); delete one deadhead (B11, not "Delete similar"); unassign one trip from its Block pill (T9, single trip). Every other confirmation stays. |
| D4 | Backup prompts | Project deletion only, as today |
| D5 | Costing cost basis | Follows the working Trip profile and Blocking scenario, with Blocked or Estimated |
| D6 | Context line | Breadcrumb Project › Scenario › Trip profile › Blocking scenario in the scope bar |
| D7 | Identity colour dots | Yes, only when the level has two or more choices |
| D8 | Optional packages | FX7 yes; FX8 yes, after FX10; FX9 decided after FX6 is in use |
| D9 | Accepted without change | G14, G16, G18 (G9 is resolved by FX7) |

## 3. Rules for every Haiku package

1. Read `AGENTS.md`, `codex.md`, Decision 0081, the inventory, and this plan's section for the package. Then read every file the package changes, in full, before editing it.
2. Each edit names an **anchor**: text quoted from the current file. Find the anchor with a search. An anchor must occur exactly once in the file, or, where the edit names a function ("In `TripDayCopyDialog`"), exactly once inside that function. If it does not, or a fact in section 4 no longer holds, **stop and report to Opus**. Do not adapt the edit.
3. Code blocks in this plan are the code to write. Copy them as written. Do not rename, reorder, reformat, add comments, or "improve" them. Where the plan says "keep the rest unchanged", the rest of the line or block must stay byte-for-byte.
4. Change only the files the package owns (section 5). Never change an existing test case, except the exact lines this plan names; add new test cases only where this plan says.
5. Use the file-edit tool for every change. No shell redirection, `sed`, or code generation scripts.
6. Run the commands of section 6 for the package, in the order given. If a command fails and the cause is not a typing slip in code you just wrote, stop and report the output to Opus. Never skip, disable, or loosen a test.
7. Commit once per package. The message starts with the package ID and ends with `Verified:` lines naming each command and its result, and what was skipped and why. Do not push unless Opus says so.

## 4. Code facts this plan depends on (verified 2026-11-17 on `main` at `33bc716`)

| Fact | Location |
| --- | --- |
| Dexie is at version 12; the class declares every table in one property line beginning `projects!: Table<`. The last version block is `this.version(12).stores({}).upgrade(`. | `src/persistence/database.ts:9`, `:109` |
| `DatabaseRecordMap` is the last line of `src/domain/types.ts`. `ProjectSnapshot` lists the backup collections; restore point tables must never be added to it. | `src/domain/types.ts:179-204` |
| `ScenarioRecords` (16 collections; `scenario` and `costingAssumptions` single, `directions`, `tripProfiles`, `blockingScenarios`, `costingAssumptions`, `plannedFrequencies`, `routeStopSets` optional). | `src/domain/project.ts:46-66` |
| `getScenarioRecords` omits empty optional collections; `saveScenarioRecords` replaces every collection of the Scenario, never deletes a costing assumptions record, and works when the Scenario does not exist yet. | `src/persistence/dexieRepository.ts:81-208` |
| `getProjectSnapshot`, `saveProjectSnapshot`, `deleteProject` (explicit table list). | `src/persistence/dexieRepository.ts:23`, `:247`, `:272` |
| An outer `db.transaction('rw', db.tables, …)` around service commands joins their own transactions, and a throw rolls all of them back (throwaway test, 2026-11-17: `renameScenarioById`, `deleteScenario`, `copyTripProfile`, `deleteBlockingScenario`, plus repository and `DexieBlockingRepository` writes). | Decision 0081, Consequences |
| `SaveStatusPublisher.run` counts writes in flight and publishes "saved" only when the last one ends; quota failures become `StorageFullError` with the original as `cause`. `isQuotaExceeded` looks through `cause`. | `src/application/saveStatus.ts:15`, `:51-79` |
| `publishWrites` wraps a repository in a `Proxy` whose methods are bound to the target. The same technique is used for `withRestorePoints`. | `src/application/saveStatus.ts:87-98` |
| Service constructors: `RouteDefinitionService(repository, backup, now?, saveStatus?, protection?)`, `TripGenerationService(repository, now?, saveStatus?)`, `BlockingApplicationService(repository, context, saveStatus?)`, `PlannedFrequencyService(repository, now?, saveStatus?)`. | `routeDefinitionService.ts:402`, `tripGenerationService.ts:86`, `blockingService.ts:42`, `plannedFrequencyService.ts:175` |
| Composition root builds every service with the one `saveStatus`. | `src/main.tsx:20-69` |
| Covered method signatures: `deleteProject(projectId, reviewToken)`, `deleteScenario(scenarioId, reviewToken)`, `deleteRoute(routeId, reviewToken)`, `deletePattern(patternId, reviewToken)`, `commitPatternChange(previewToken, mode)`, `commitNodeChanges(previewToken, mode)`, `deleteRuntimeProfile(profileId, replacementProfileId, reviewToken)`; `deleteTrips(tripIds, reviewToken)`, `applyTripCopy(preview)`, `deleteTripProfile(profileId, previewToken)`; `deleteBlockingScenario(blockingScenarioId, sourceSignature)`, `deleteBlock(blockingScenarioId, blockId, sourceSignature)`, `deleteBlocks(blockingScenarioId, blockIds, sourceSignature)`, `applyBlockingDayCopy(review)`, `createAutoBlockingScenario(request)`, `applyBulkBoundaryActivities(request)`, `removeTrip(blockingScenarioId, serviceDayId, tripId, sourceSignature)`, `removeTrips(blockingScenarioId, serviceDayId, tripIds, sourceSignature)`, `reassignTrips(request)`, `assignTripsToBlock(request)`; `clearPlan(routeId, serviceDayId)`, `applyCopyFromDay(preview)`, `applyCopyFromScenario(preview)`. | the four service files |
| `routeEditPreviews` is a private `Map<string, StoredRouteEditPreview>` with `{ routeId, scenarioId, kind: 'pattern' \| 'nodes', proposedPattern?, … }`; `takePreview` deletes the entry. | `src/application/routeDefinitionService.ts:262-270`, `:390`, `:1465` |
| The Current block's pull-out and pull-in removal, and deadhead deletion, call `updateBlock` from the screen with a filtered activity list. | `src/ui/blocking/BlockingWorkspace.tsx:353`, `:360` |
| `adjustBlockReferences` removes revenue activities and the deadheads next to them; `blocks.map` keeps the index order. | `src/domain/trips.ts:619-640` |
| `deadheadsRemoved` (not exported) counts the deadheads that leave a Block with given Trips. | `src/application/tripsWorkspaceView.ts:182` |
| `applyDeadheadToMatchingConnections` and its helpers `tripMap`, `patternMap`, `sortedActivities`, `patternEndNode`, `patternStartNode` are in `src/domain/blocking.ts`. | `src/domain/blocking.ts:345` |
| Selection memory: `SelectionPreference` keeps project, scenario, route; the Day, Direction, and Trip profile memory is the session-only `lastViewed` ref; `reload` resets the Trip profile to the first one when the current one is not in the Scenario. | `src/ui/App.tsx:30-39`, `:92`, `:103-123` |
| The notice `kind` is `'error' \| 'success'`; the stylesheet already has `.notice.info`. | `src/ui/App.tsx:28`, `src/ui/styles/shell.css:58` |
| The page title is "Transit Costing Tool" in `index.html`; `standards-mode.spec.ts` asserts it with no project open. | `index.html:7`, `tests/ui/standards-mode.spec.ts:28` |
| Version assertions to update in FX1: `src/persistence/database.test.ts:8, 76, 85, 86, 162, 194, 221`; `src/persistence/repository.test.ts:19, 21, 46, 47`; `tests/ui/database-migration.spec.ts:68`; `tests/ui/scenario-copy-recovery.spec.ts:148, 167, 177`. | — |
| The trimmed golden fixture is the function `fixture()` in `src/persistence/repositoryContract.test.ts:65-109`. | — |

## 5. Package overview

| Package | Title | Model | Depends on | Files it may change |
| --- | --- | --- | --- | --- |
| FX0 | Decision 0081 and this plan | Opus | — | done |
| FX1 | Restore point types, pure rules, Dexie 13, recorder | Haiku | — | `src/domain/types.ts`, new `src/domain/restorePoints.ts` (+ test), `src/persistence/database.ts`, new `src/persistence/restorePointPersistence.ts` (+ test), `src/application/ports.ts`, new `src/testSupport/trimmedGolden.ts`, `src/persistence/repositoryContract.test.ts` (fixture move only), the version lines of section 4 |
| FX2 | Coverage proxy, composition root, new commands and impact fields | Haiku | FX1 reviewed | new `src/application/restorePointCoverage.ts` (+ test), `src/main.tsx`, `src/application/routeDefinitionService.ts`, `src/application/tripGenerationService.ts`, `src/application/blockingService.ts`, `src/application/ports.ts`, `src/application/tripsWorkspaceView.ts`, `src/domain/blocking.ts`, new test files named in 8.10, `tests/ui/route-save-race.spec.ts` (8.11 only) |
| FX2R | Restore service: status, conflicts, restore, App prop; round-trip tests | Opus | FX2 reviewed | new `src/application/restorePointService.ts` (+ test), `src/application/ports.ts`, `src/main.tsx`, `src/ui/App.tsx` (prop type only) |
| Gate A | User review: Opus demonstrates delete → undo on the golden project | — | FX2R | — |
| FX3 | Warning texts, counts, button styles, Auto-blocking draft | Haiku | Gate A | `src/ui/route/RouteWorkspace.tsx`, `src/ui/App.tsx` (deletion texts), `src/ui/trips/dialogs.tsx`, `src/ui/trips/TripsWorkspace.tsx` (trip deletion lines), `src/ui/blocking/BlockingWorkspace.tsx`, `src/ui/blocking/AutoBlockingDialog.tsx`, new `tests/ui/warning-texts.spec.ts` |
| FX4 | Undo notice, Project-menu Undo, Undo history; D3; "cannot be undone" removed | Opus | FX3 reviewed | `src/ui/App.tsx`, `src/ui/shell/`, new `src/ui/shell/UndoHistoryDialog.tsx`, covered dialogs (text), `src/ui/shared/messages.ts`, styles, specs |
| Gate B | User review of the undo interface | — | FX4 | — |
| FX5 | Working context memory, fallback notice, window title | Haiku | Gate A (independent of FX3, FX4) | `src/ui/preferences.ts` (+ `preferences.test.ts`), `src/ui/App.tsx` (selection lines only), new `tests/ui/working-context.spec.ts` |
| FX6 | Context line, context stamp, identity dots, Costing basis follows context | Opus: mock-ups → Gate C → build | FX4, FX5 | `src/ui/shell/`, `src/ui/App.tsx`, `src/ui/trips/TripsWorkspace.tsx`, `src/ui/blocking/BlockingWorkspace.tsx`, `src/ui/costing/CostingWorkspace.tsx`, new `src/ui/shared/ContextStamp.tsx`, styles, specs |
| FX10 | Documentation, closeout, full verification | Opus | all above | `architecture_overview.md`, `docs/data-schema.md`, `docs/ui-conventions.md`, `docs/domain-glossary.md`, `codex.md`, the inventory, `docs/implementation/undo-and-context-closeout.md` |
| FX7 | Run-time staleness by content | Opus writes the work order after FX10; Haiku executes | FX10 | in its work order |
| FX8 | Trip change history replaces the regeneration undo slot | Opus writes the work order after FX7; Haiku structural, Opus UI | FX7 | in its work order |
| FX9 | Scenario lock | Decided after FX6 is in use | — | — |

Order: FX1 → FX2 → FX2R → Gate A → FX3 → FX4 → Gate B → FX5 → FX6 (mock-ups, Gate C, build) → FX10 → FX7 → FX8. FX5 may move earlier, to any point after Gate A.

FX7 and FX8 get their work orders later on purpose: they change trip provenance and the regeneration undo, and FX1 to FX6 change the files around them, so line-accurate instructions written now would be wrong by then.

## 6. Verification per package

Browser commands in a Claude Code cloud session: prefix `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` and add `--trace off`. The two golden-project specs in `segment-runtime-fill.spec.ts` need `--workers=4` or fewer.

| Package | Run, in order | Skip | Do not cut |
| --- | --- | --- | --- |
| FX1 | `pnpm typecheck`; `pnpm exec vitest run src/domain/restorePoints.test.ts src/persistence/restorePointPersistence.test.ts src/persistence/database.test.ts src/persistence/repository.test.ts src/persistence/repositoryContract.test.ts`; `pnpm test`; `pnpm build`; full browser suite `pnpm test:ui` (the Dexie version changes app startup) | Visual tour | `database.test.ts`, `repository.test.ts`, `repositoryContract.test.ts`, `backup*.test.ts` |
| FX2 | `pnpm typecheck`; `pnpm exec vitest run` on every test file named in 8.10 and every existing test file of a changed source file; `pnpm test`; `pnpm build`; full browser suite (writes in every area go through the proxy) | Visual tour | Every existing service, deletion, copy, and contract test; `route-save-race` |
| FX2R | `pnpm typecheck`; `restorePointService.test.ts`; `pnpm test`; `pnpm build` | Browser suite (no screen change; FX4 runs it) | the round trip of every coverage row |
| FX3 | `pnpm typecheck`; `pnpm test`; specs `warning-texts`, `deletion-reviews`, `impact-dialogs`, `route-editing`, `route-save-race`, `drafts-and-preferences`, `segment-distance-fill`, `blocking-workspace`, `blocking-rules`, `blocking-day-copy`, `automatic-blocking`, `trip-profile`, `keyboard`; `pnpm build` | Costing specs; full suite (FX4 and FX10 run it) | `deletion-reviews`, `impact-dialogs`, `keyboard` |
| FX4 | `pnpm typecheck`; `pnpm test`; new `undo-history.spec.ts`; full browser suite; `pnpm build`; screenshots at 1024, 1440, 390 px | — | `keyboard` with the Undo history dialog and a notice with Undo in its axe run |
| FX5 | `pnpm typecheck`; `pnpm exec vitest run src/ui/preferences.test.ts`; `pnpm test`; new `working-context.spec.ts`; full browser suite (app startup changes); `pnpm build` | Visual tour | `drafts-and-preferences`, `blocking-defaults`, `standards-mode`, `onboarding` |
| FX6 | Mock-ups first (Gate C). Then `pnpm typecheck`; `pnpm test`; new `context-line.spec.ts`; full browser suite; visual tour (`UI_TOUR=1`); `pnpm build`; screenshots light and dark at 1024, 1280, 1440 px | — | `keyboard`, `app-shell`, `scope-toggles`, `costing-estimated`, `costing-workspace`, `trips-blocking-scenario-menu`, `side-by-side-trips` |
| FX10 | Typecheck, unit suite, build, full browser suite, visual tour, a backup round trip, a delete → undo on the golden project | Nothing | The whole run |

## 7. FX1: Restore point types, pure rules, Dexie 13, recorder (Haiku)

### 7.1 `src/domain/types.ts`

1. Anchor: the line beginning `export interface DatabaseRecordMap {`. Immediately **above** it, insert:

```ts
/** Decision 0081. The commands that store a restore point, and `restore`, which records a restore of an existing Scenario. */
export type RestorePointKind =
  | 'deleteProject' | 'deleteScenario' | 'deleteRoute' | 'deletePattern' | 'resetPatternService' | 'rebalancePattern' | 'deleteNodes'
  | 'deleteRuntimeProfile' | 'deleteTrips' | 'copyTripsFromDay' | 'deleteTripProfile' | 'unassignTrips' | 'moveTripsToBlock'
  | 'deleteBlockingScenario' | 'deleteBlocks' | 'copyBlocksFromDay' | 'rebuildAutoBlocks' | 'replaceBoundaryActivities'
  | 'removeBlockActivity' | 'deleteDeadheads' | 'clearPlan' | 'copyPlanFromDay' | 'copyPlansFromScenario' | 'restore';
/** Decision 0081. One collection of `ScenarioRecords`. `scenario` and `costingAssumptions` are single records, read as lists of 0 or 1. */
export type RecordCollection = 'scenario' | 'serviceDays' | 'routes' | 'nodes' | 'patterns' | 'directions' | 'runtimeProfiles' | 'runtimeAssignments'
  | 'tripProfiles' | 'blockingScenarios' | 'costingAssumptions' | 'generationSets' | 'trips' | 'blocks' | 'plannedFrequencies' | 'routeStopSets';
/** Decision 0081. What one command did to one Scenario's records. */
export interface RecordChange {
  /** Full rows the command deleted. */
  removed: Partial<Record<RecordCollection, Array<{ id: EntityId }>>>;
  /** Full previous versions of the rows the command changed. */
  changedBefore: Partial<Record<RecordCollection, Array<{ id: EntityId }>>>;
  /** Ids the command created. */
  added: Partial<Record<RecordCollection, EntityId[]>>;
  /** Row id → stamp of the row as the command left it, for every changed and added row. */
  writtenStamps: Partial<Record<RecordCollection, Record<EntityId, string>>>;
}
/** Decision 0081. The records a restore point names; their names are stored with it. */
export interface RestorePointRefs { routeId?: EntityId; patternId?: EntityId; runtimeProfileId?: EntityId; tripProfileId?: EntityId; blockingScenarioId?: EntityId; serviceDayId?: EntityId; sourceServiceDayId?: EntityId; blockId?: EntityId; }
export interface RestorePointNames { project: string; scenario: string; route?: string; pattern?: string; runtimeProfile?: string; tripProfile?: string; blockingScenario?: string; serviceDay?: string; sourceServiceDay?: string; block?: string; sourceScenario?: string; }
export type RestorePointCounts = Partial<Record<RecordCollection, { removed: number; changed: number; added: number }>>;
/** Decision 0081. A restore point as listed. Its payload is a separate record. Local operational data, never in a backup. */
export interface RestorePointSummary {
  id: EntityId; kind: RestorePointKind; scope: 'scenario' | 'project';
  projectId: EntityId; scenarioId?: EntityId; createdAt: IsoTimestamp;
  names: RestorePointNames; counts: RestorePointCounts;
  /** A count the command was given, such as the number of selected trips. */
  quantity?: number;
  /** A word the label needs, such as 'pullOut' or 'pullIn'. */
  detail?: string;
  /** For kind 'restore': the kind of the point that was restored. */
  restoredKind?: RestorePointKind;
  /** JSON length of the payload at capture, for the size limit. */
  sizeEstimate: number;
}
export interface RestorePointPayload { id: EntityId; change?: RecordChange; projectSnapshot?: ProjectSnapshot; }
```

2. In the `DatabaseRecordMap` line, replace `appMetadata: AppMetadata; }` with `appMetadata: AppMetadata; restorePoints: RestorePointSummary; restorePointPayloads: RestorePointPayload; }`. Keep the rest of the line unchanged.

### 7.2 New file `src/domain/restorePoints.ts`

```ts
// Decision 0081. Pure rules of restore points: the difference one command made to one Scenario's records, how to put it back, the names a
// restore point keeps, and which restore points to drop. No React, no IndexedDB.
import type { ScenarioRecords } from './project';
import type { RecordChange, RecordCollection, RestorePointCounts, RestorePointNames, RestorePointRefs, RestorePointSummary } from './types';

type Row = { id: string };

export const RECORD_COLLECTIONS: readonly RecordCollection[] = ['scenario', 'serviceDays', 'routes', 'nodes', 'patterns', 'directions', 'runtimeProfiles', 'runtimeAssignments', 'tripProfiles', 'blockingScenarios', 'costingAssumptions', 'generationSets', 'trips', 'blocks', 'plannedFrequencies', 'routeStopSets'];

/** The rows of one collection. The single records `scenario` and `costingAssumptions` read as lists of 0 or 1. */
export function collectionRows(records: ScenarioRecords | undefined, collection: RecordCollection): Row[] {
  if (!records) return [];
  if (collection === 'scenario') return [records.scenario];
  if (collection === 'costingAssumptions') return records.costingAssumptions ? [records.costingAssumptions] : [];
  return (records[collection] ?? []) as Row[];
}

/** A short stable stamp of one row: cyrb53 over its JSON, with the JSON length (the method of `fingerprint` in `src/application/reviewToken.ts`). */
export function rowStamp(row: unknown): string {
  const text = JSON.stringify(row) ?? '';
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    high = Math.imul(high ^ code, 2654435761);
    low = Math.imul(low ^ code, 1597334677);
  }
  high = Math.imul(high ^ (high >>> 16), 2246822507) ^ Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507) ^ Math.imul(high ^ (high >>> 13), 3266489909);
  return `${text.length.toString(36)}-${(4294967296 * (2097151 & low) + (high >>> 0)).toString(36)}`;
}

/** What changed between `before` and `after`, matched by `id` per collection. `after` undefined (the Scenario was deleted) removes every row. */
export function diffScenarioRecords(before: ScenarioRecords | undefined, after: ScenarioRecords | undefined): RecordChange {
  const change: RecordChange = { removed: {}, changedBefore: {}, added: {}, writtenStamps: {} };
  for (const collection of RECORD_COLLECTIONS) {
    const beforeRows = new Map(collectionRows(before, collection).map((row) => [row.id, row]));
    const afterRows = new Map(collectionRows(after, collection).map((row) => [row.id, row]));
    const removed: Row[] = [];
    const changed: Row[] = [];
    const added: string[] = [];
    const stamps: Record<string, string> = {};
    for (const [id, row] of beforeRows) {
      const next = afterRows.get(id);
      if (!next) removed.push(row);
      else if (JSON.stringify(next) !== JSON.stringify(row)) { changed.push(row); stamps[id] = rowStamp(next); }
    }
    for (const [id, row] of afterRows) if (!beforeRows.has(id)) { added.push(id); stamps[id] = rowStamp(row); }
    if (removed.length) change.removed[collection] = removed;
    if (changed.length) change.changedBefore[collection] = changed;
    if (added.length) change.added[collection] = added;
    if (Object.keys(stamps).length) change.writtenStamps[collection] = stamps;
  }
  return change;
}

export function isEmptyChange(change: RecordChange): boolean {
  return !Object.keys(change.removed).length && !Object.keys(change.changedBefore).length && !Object.keys(change.added).length;
}

/** Rows removed, changed, and added per collection; collections with none are left out. */
export function changeCounts(change: RecordChange): RestorePointCounts {
  const counts: RestorePointCounts = {};
  for (const collection of RECORD_COLLECTIONS) {
    const removed = change.removed[collection]?.length ?? 0;
    const changed = change.changedBefore[collection]?.length ?? 0;
    const added = change.added[collection]?.length ?? 0;
    if (removed || changed || added) counts[collection] = { removed, changed, added };
  }
  return counts;
}

export type RestoreConflictReason = 'changedSince' | 'recreated' | 'scenarioMissing' | 'scenarioExists' | 'cannotRemove';
export interface RestoreConflict { collection: RecordCollection; id: string; reason: RestoreConflictReason; }

/**
 * The Scenario records with `change` undone, or the conflicts that stop it. A changed row that differs from what the command wrote, or was
 * deleted since, is `changedSince`; an added row that differs is `changedSince` (one deleted since is fine); a removed row whose id exists again
 * is `recreated`. A costing assumptions record that the command added cannot be removed by a Scenario write (`cannotRemove`).
 */
export function planRestore(current: ScenarioRecords | undefined, change: RecordChange): { next?: ScenarioRecords; conflicts: RestoreConflict[] } {
  const removedScenario = change.removed.scenario?.[0];
  if (!current && !removedScenario) return { conflicts: [{ collection: 'scenario', id: '', reason: 'scenarioMissing' }] };
  if (current && removedScenario) return { conflicts: [{ collection: 'scenario', id: current.scenario.id, reason: 'scenarioExists' }] };
  const rows = new Map<RecordCollection, Map<string, Row>>();
  for (const collection of RECORD_COLLECTIONS) rows.set(collection, new Map(collectionRows(current, collection).map((row) => [row.id, row])));
  const conflicts: RestoreConflict[] = [];
  for (const collection of RECORD_COLLECTIONS) {
    const present = rows.get(collection)!;
    const stamps = change.writtenStamps[collection] ?? {};
    for (const row of change.changedBefore[collection] ?? []) {
      const now = present.get(row.id);
      if (!now || rowStamp(now) !== stamps[row.id]) conflicts.push({ collection, id: row.id, reason: 'changedSince' });
    }
    for (const id of change.added[collection] ?? []) {
      const now = present.get(id);
      if (now && rowStamp(now) !== stamps[id]) conflicts.push({ collection, id, reason: 'changedSince' });
      else if (now && collection === 'costingAssumptions') conflicts.push({ collection, id, reason: 'cannotRemove' });
    }
    for (const row of change.removed[collection] ?? []) if (present.has(row.id)) conflicts.push({ collection, id: row.id, reason: 'recreated' });
  }
  if (conflicts.length) return { conflicts };
  for (const collection of RECORD_COLLECTIONS) {
    const present = rows.get(collection)!;
    for (const id of change.added[collection] ?? []) present.delete(id);
    for (const row of change.changedBefore[collection] ?? []) present.set(row.id, row);
    for (const row of change.removed[collection] ?? []) present.set(row.id, row);
  }
  const list = <T>(collection: RecordCollection): T[] => [...rows.get(collection)!.values()] as T[];
  const optional = <K extends 'directions' | 'tripProfiles' | 'blockingScenarios' | 'plannedFrequencies' | 'routeStopSets'>(key: K): Partial<Pick<ScenarioRecords, K>> => {
    const values = list<unknown>(key);
    return (values.length ? { [key]: values } : {}) as Partial<Pick<ScenarioRecords, K>>;
  };
  const costingAssumptions = list<NonNullable<ScenarioRecords['costingAssumptions']>>('costingAssumptions')[0];
  const next: ScenarioRecords = {
    scenario: list<ScenarioRecords['scenario']>('scenario')[0],
    serviceDays: list('serviceDays'),
    routes: list('routes'),
    nodes: list('nodes'),
    patterns: list('patterns'),
    ...optional('directions'),
    runtimeProfiles: list('runtimeProfiles'),
    runtimeAssignments: list('runtimeAssignments'),
    ...optional('tripProfiles'),
    generationSets: list('generationSets'),
    trips: list('trips'),
    blocks: list('blocks'),
    ...optional('blockingScenarios'),
    ...(costingAssumptions ? { costingAssumptions } : {}),
    ...optional('plannedFrequencies'),
    ...optional('routeStopSets'),
  };
  return { next, conflicts: [] };
}

/** The names a restore point keeps, read from the first of `sources` that has each record. `extra` names win. */
export function restorePointNames(projectName: string, sources: Array<ScenarioRecords | undefined>, refs: RestorePointRefs, extra: Partial<RestorePointNames> = {}): RestorePointNames {
  const records = sources.filter((source): source is ScenarioRecords => Boolean(source));
  const pick = <T extends { id: string }>(rowsOf: (source: ScenarioRecords) => T[] | undefined, id: string | undefined): T | undefined =>
    id === undefined ? undefined : records.flatMap((source) => rowsOf(source) ?? []).find((row) => row.id === id);
  const names: RestorePointNames = { project: projectName, scenario: records[0]?.scenario.name ?? '' };
  const route = pick((source) => source.routes, refs.routeId);
  if (route) names.route = route.shortName || route.name || 'Untitled route';
  const pattern = pick((source) => source.patterns, refs.patternId);
  if (pattern) names.pattern = pattern.name || 'Untitled pattern';
  const runtimeProfile = pick((source) => source.runtimeProfiles, refs.runtimeProfileId);
  if (runtimeProfile) names.runtimeProfile = runtimeProfile.name;
  const tripProfile = pick((source) => source.tripProfiles, refs.tripProfileId);
  if (tripProfile) names.tripProfile = tripProfile.name;
  const blockingScenario = pick((source) => source.blockingScenarios, refs.blockingScenarioId);
  if (blockingScenario) names.blockingScenario = blockingScenario.name;
  const serviceDay = pick((source) => source.serviceDays, refs.serviceDayId);
  if (serviceDay) names.serviceDay = serviceDay.name;
  const sourceServiceDay = pick((source) => source.serviceDays, refs.sourceServiceDayId);
  if (sourceServiceDay) names.sourceServiceDay = sourceServiceDay.name;
  const block = pick((source) => source.blocks, refs.blockId);
  if (block) names.block = block.label;
  for (const [key, value] of Object.entries(extra) as Array<[keyof RestorePointNames, string | undefined]>) if (value) names[key] = value;
  return names;
}

export const RESTORE_POINT_POLICY = { maxCount: 20, maxAgeDays: 30, maxTotalSize: 50_000_000 } as const;

/** Newest first by `createdAt`, then by `id` descending, so the order is total. */
export function sortNewestFirst<T extends Pick<RestorePointSummary, 'id' | 'createdAt'>>(points: readonly T[]): T[] {
  return [...points].sort((left, right) => left.createdAt === right.createdAt ? (left.id < right.id ? 1 : left.id > right.id ? -1 : 0) : left.createdAt < right.createdAt ? 1 : -1);
}

/**
 * The ids to drop: points older than `maxAgeDays`, and, from the first point that would pass `maxCount` or `maxTotalSize` (counting from the
 * newest), that point and every older one. The newest point is always kept.
 */
export function restorePointsToPrune(points: ReadonlyArray<Pick<RestorePointSummary, 'id' | 'createdAt' | 'sizeEstimate'>>, now: string, policy: { maxCount: number; maxAgeDays: number; maxTotalSize: number } = RESTORE_POINT_POLICY): string[] {
  const oldestKept = Date.parse(now) - policy.maxAgeDays * 86_400_000;
  const drop: string[] = [];
  let kept = 0;
  let total = 0;
  let full = false;
  sortNewestFirst(points).forEach((point, index) => {
    if (index > 0 && !full && (kept >= policy.maxCount || total + point.sizeEstimate > policy.maxTotalSize)) full = true;
    if (index > 0 && (full || Date.parse(point.createdAt) < oldestKept)) { drop.push(point.id); return; }
    kept += 1;
    total += point.sizeEstimate;
  });
  return drop;
}
```

### 7.3 Test `src/domain/restorePoints.test.ts`

Build two small `ScenarioRecords` objects by hand (one Scenario, two service days, one Route, one Trip profile, two Trips, one Block; `metadata()` from `src/domain/ids.ts` for timestamps). Write these cases, each its own `it`:

1. `diffScenarioRecords` of identical records is empty (`isEmptyChange` true).
2. Removing a Trip, changing the Block's label, and adding a Trip give exactly `removed.trips` (the full row), `changedBefore.blocks` (the old row), `added.trips` (the new id), and stamps for the changed Block and the added Trip; `changeCounts` gives `{ trips: { removed: 1, changed: 0, added: 1 }, blocks: { removed: 0, changed: 1, added: 0 } }`.
3. `after` undefined puts every row in `removed`, including `scenario`.
4. `planRestore(after, diff(before, after))` returns `next` equal to `before` when each collection is sorted by `id` (write a local `byId` helper for the comparison).
5. Editing the changed Block again after the change gives one `changedSince` conflict and no `next`.
6. Deleting the changed Block after the change gives `changedSince`.
7. Deleting the added Trip after the change gives no conflict, and `next` equals `before`.
8. Re-adding a removed Trip id gives `recreated`.
9. A Scenario deletion change applied to `current` undefined returns `before`; applied to an existing Scenario returns `scenarioExists`.
10. A change that removes no Scenario, applied to `current` undefined, returns `scenarioMissing`.
11. A change that adds `costingAssumptions` returns `cannotRemove`.
12. `restorePointNames` takes names from the first source that has the record, uses `shortName` for a Route when present, and lets `extra` win.
13. `restorePointsToPrune`: 21 points of size 1 → the oldest is dropped; a point 31 days old is dropped; with `maxTotalSize` 10 and sizes 6, 6, 1 (newest first) the second and third are dropped; a single point larger than the limit is kept.
14. `rowStamp` is equal for equal rows and differs when one field changes.

### 7.4 `src/persistence/database.ts`

1. In the property line beginning `projects!: Table<`, replace `appMetadata!: Table<DatabaseRecordMap['appMetadata'], string>;` with `appMetadata!: Table<DatabaseRecordMap['appMetadata'], string>; restorePoints!: Table<DatabaseRecordMap['restorePoints'], string>; restorePointPayloads!: Table<DatabaseRecordMap['restorePointPayloads'], string>;`.
2. Anchor: the closing `});` of the `this.version(12)` block, followed by the constructor's closing `}`. Between that `});` and the constructor's `}`, insert:

```ts
    // Version 13 adds the local restore point tables (Decision 0081). They start empty, no existing data is read or written, and they are
    // never part of a backup.
    this.version(13).stores({ restorePoints: 'id,projectId,createdAt', restorePointPayloads: 'id' });
```

### 7.5 Version assertions

Change only these lines. The line numbers are those at `33bc716`; make the line edits first and add the `HISTORY` entry last, because it moves the later lines down by one. Each edit was checked in a dry run on 2026-11-17.

- `src/persistence/database.test.ts:8`, `:85`, `:162`, `:194`, `:221`: `toBe(12)` → `toBe(13)`.
- `src/persistence/database.test.ts:86`: `toBe(120)` → `toBe(130)`.
- `src/persistence/database.test.ts:76`: the list `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]` → `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]`, and `to version 12` → `to version 13` in the title.
- `src/persistence/database.test.ts`, the `HISTORY` array: after its last entry `{ routeStopSets: 'id,scenarioId,routeId' },` add the line `  {},` (version 12 changed no store).
- In the same file, at the start of the first `it` (the one containing line 8), add after the existing table assertions: `expect(db.tables.map((table) => table.name)).toEqual(expect.arrayContaining(['restorePoints', 'restorePointPayloads']));`
- `src/persistence/repository.test.ts:19`: `schema version 12` → `schema version 13`; `:21` and `:46`: `toBe(12)` → `toBe(13)`; `:47`: `toBe(120)` → `toBe(130)`.
- `tests/ui/database-migration.spec.ts:68`: `toBe(120)` → `toBe(130)`.
- `tests/ui/scenario-copy-recovery.spec.ts:148`, `:167`, and `:177`: `toBe(12)` → `toBe(13)`.

If any other test fails because of the version, stop and report it.

### 7.6 `src/application/ports.ts`

Append at the end of the file:

```ts
/** Decision 0081. What a covered command records. `keep` can decline a change the command made (for example a pattern save that changed no service). */
export interface ScenarioChangeRequest {
  kind: import('../domain/types').RestorePointKind;
  scenarioId: string;
  refs?: import('../domain/types').RestorePointRefs;
  extraNames?: Partial<import('../domain/types').RestorePointNames>;
  quantity?: number;
  detail?: string;
  restoredKind?: import('../domain/types').RestorePointKind;
  keep?: (change: import('../domain/types').RecordChange) => boolean;
}
/** Decision 0081. Runs a write and stores its restore point in the same transaction. */
export interface RestorePointRecorder {
  recordScenarioChange<T>(request: ScenarioChangeRequest, write: () => Promise<T>): Promise<T>;
  recordProjectDeletion<T>(projectId: string, write: () => Promise<T>): Promise<T>;
}
/** Decision 0081. The stored restore points. Listing never loads payloads. */
export interface RestorePointStore {
  listRestorePoints(): Promise<import('../domain/types').RestorePointSummary[]>;
  getRestorePointPayload(id: string): Promise<import('../domain/types').RestorePointPayload | undefined>;
  deleteRestorePoint(id: string): Promise<void>;
  keepNewest(count: number): Promise<void>;
  /** Called after a restore point is stored and its transaction has committed. */
  subscribeToRestorePoints(listener: (point: import('../domain/types').RestorePointSummary) => void): () => void;
}
```

### 7.7 New file `src/persistence/restorePointPersistence.ts`

```ts
import type { RestorePointRecorder, RestorePointStore, ScenarioChangeRequest } from '../application/ports';
import { newId } from '../domain/ids';
import { changeCounts, diffScenarioRecords, isEmptyChange, restorePointNames, restorePointsToPrune, sortNewestFirst } from '../domain/restorePoints';
import type { RestorePointPayload, RestorePointSummary } from '../domain/types';
import type { TransitDatabase } from './database';
import type { DexieRouteDefinitionRepository } from './dexieRepository';

/**
 * Decision 0081. Runs a covered command and stores its restore point in one transaction over every table, so the command's own transactions
 * join it: a command that fails stores nothing, and a restore point never exists without its change.
 */
export class DexieRestorePoints implements RestorePointRecorder, RestorePointStore {
  private readonly listeners = new Set<(point: RestorePointSummary) => void>();

  constructor(
    private readonly db: TransitDatabase,
    private readonly repository: Pick<DexieRouteDefinitionRepository, 'getScenarioRecords' | 'getProjectSnapshot'>,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async recordScenarioChange<T>(request: ScenarioChangeRequest, write: () => Promise<T>): Promise<T> {
    let stored: RestorePointSummary | undefined;
    const result = await this.db.transaction('rw', this.db.tables, async () => {
      const before = await this.repository.getScenarioRecords(request.scenarioId);
      const value = await write();
      const after = await this.repository.getScenarioRecords(request.scenarioId);
      const change = diffScenarioRecords(before, after);
      const scenario = before?.scenario ?? after?.scenario;
      if (!scenario || isEmptyChange(change) || (request.keep && !request.keep(change))) return value;
      const project = await this.db.projects.get(scenario.projectId);
      const id = newId();
      const payload: RestorePointPayload = { id, change };
      const summary: RestorePointSummary = {
        id, kind: request.kind, scope: 'scenario', projectId: scenario.projectId, scenarioId: scenario.id, createdAt: this.now(),
        names: restorePointNames(project?.name ?? '', [before, after], request.refs ?? {}, request.extraNames),
        counts: changeCounts(change),
        ...(request.quantity === undefined ? {} : { quantity: request.quantity }),
        ...(request.detail ? { detail: request.detail } : {}),
        ...(request.restoredKind ? { restoredKind: request.restoredKind } : {}),
        sizeEstimate: JSON.stringify(payload).length,
      };
      await this.store(summary, payload);
      stored = summary;
      return value;
    });
    if (stored) this.notify(stored);
    return result;
  }

  async recordProjectDeletion<T>(projectId: string, write: () => Promise<T>): Promise<T> {
    let stored: RestorePointSummary | undefined;
    const result = await this.db.transaction('rw', this.db.tables, async () => {
      const snapshot = await this.repository.getProjectSnapshot(projectId);
      const value = await write();
      if (!snapshot || await this.db.projects.get(projectId)) return value;
      const id = newId();
      const payload: RestorePointPayload = { id, projectSnapshot: snapshot };
      const summary: RestorePointSummary = {
        id, kind: 'deleteProject', scope: 'project', projectId, createdAt: this.now(),
        names: { project: snapshot.project.name, scenario: '' }, counts: {}, quantity: snapshot.scenarios.length,
        sizeEstimate: JSON.stringify(payload).length,
      };
      await this.store(summary, payload);
      stored = summary;
      return value;
    });
    if (stored) this.notify(stored);
    return result;
  }

  async listRestorePoints(): Promise<RestorePointSummary[]> { return sortNewestFirst(await this.db.restorePoints.toArray()); }
  async getRestorePointPayload(id: string): Promise<RestorePointPayload | undefined> { return this.db.restorePointPayloads.get(id); }
  async deleteRestorePoint(id: string): Promise<void> { await this.drop([id]); }
  async keepNewest(count: number): Promise<void> { await this.drop(sortNewestFirst(await this.db.restorePoints.toArray()).slice(count).map((point) => point.id)); }
  subscribeToRestorePoints(listener: (point: RestorePointSummary) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private async store(summary: RestorePointSummary, payload: RestorePointPayload): Promise<void> {
    await this.db.restorePoints.put(summary);
    await this.db.restorePointPayloads.put(payload);
    const pruned = restorePointsToPrune(await this.db.restorePoints.toArray(), this.now());
    if (pruned.length) {
      await this.db.restorePoints.bulkDelete(pruned);
      await this.db.restorePointPayloads.bulkDelete(pruned);
    }
  }

  private async drop(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.db.transaction('rw', [this.db.restorePoints, this.db.restorePointPayloads], async () => {
      await this.db.restorePoints.bulkDelete(ids);
      await this.db.restorePointPayloads.bulkDelete(ids);
    });
  }

  private notify(point: RestorePointSummary): void { for (const listener of this.listeners) listener(point); }
}
```

### 7.8 Fixture move

1. Create `src/testSupport/trimmedGolden.ts`. Move the comment block and the whole `function fixture() { … }` from `src/persistence/repositoryContract.test.ts` (lines 65 to 109 at `33bc716`) into it, renamed `export function trimmedGoldenFixture()`, with the imports it needs: `asSnapshot`, `goldenWithAltBlocking` from `./goldenBackup`, and `type PlannedFrequency, type ProjectSnapshot, type RouteStopSet` from `../domain/types`.
2. In `repositoryContract.test.ts`, replace the moved lines with `const fixture = trimmedGoldenFixture;` and add `import { trimmedGoldenFixture } from '../testSupport/trimmedGolden';` to its imports. Remove an import from that file only if TypeScript reports it unused after the move. Nothing else in the file changes.

### 7.9 Test `src/persistence/restorePointPersistence.test.ts`

Each test opens `new TransitDatabase(name)` with a unique name, builds `new DexieRouteDefinitionRepository(db)`, `new DexieBlockingRepository(db)`, and `new DexieRestorePoints(db, repository, () => clock)`, seeds `trimmedGoldenFixture().snapshot` with `repository.saveProjectSnapshot`, and ends with `db.close(); await Dexie.delete(name);`. Cases:

1. **Rollback.** `recordScenarioChange({ kind: 'deleteRoute', scenarioId }, async () => { await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, scenario: { ...current.scenario, name: 'Changed' } })); await blocking.saveBlockingScenario({ ...firstBlockingScenario, name: 'Renamed' }); throw new Error('stop'); })` rejects with `stop`; afterwards the Scenario and Blocking scenario keep their names and `listRestorePoints()` is empty.
2. **Commit.** The same write without the throw resolves; one summary is listed with `kind: 'deleteRoute'`, `scope: 'scenario'`, `names.scenario` equal to the old name, `counts.scenario` `{ removed: 0, changed: 1, added: 0 }`, `counts.blockingScenarios` `{ removed: 0, changed: 1, added: 0 }`; its payload's `change.changedBefore.scenario[0].name` is the old name.
3. **Empty change.** A write that changes nothing stores no point.
4. **keep.** `keep: () => false` stores no point; the write is kept.
5. **Return value.** The write's return value is returned.
6. **Project deletion.** `recordProjectDeletion(projectId, () => repository.deleteProject(projectId))` stores one `scope: 'project'` point whose payload snapshot equals the snapshot read before (`toEqual`).
7. **Pruning.** 21 commits with increasing clock values leave 20 summaries and 20 payloads; the oldest is gone.
8. **keepNewest(5)** leaves the 5 newest.
9. **Notification.** A listener is called once after a commit and not after a rollback.
10. **Not in backups.** After case 2, `exportProjectJson(await repository.getProjectSnapshot(projectId))` (from `./backup`) does not contain the text `restorePoint`.

### 7.10 FX1 commit and gate

Commit `FX1: Restore point types, pure rules, Dexie 13 and recorder (Decision 0081)`. Gate: Opus reviews the diff and reruns `pnpm typecheck` and `pnpm test`.

## 8. FX2: Coverage proxy, composition root, new commands and impact fields (Haiku)

### 8.1 New file `src/application/restorePointCoverage.ts`

```ts
// Decision 0081. Which service commands store a restore point, and the proxy that applies them at the composition root. The covered service
// methods are not changed: the proxy resolves the Scenario and the named records, then runs the command inside the recorder and the
// shared save-status publisher.
import type { RestorePointRecorder, RestorePointStore, ScenarioChangeRequest } from './ports';
import { isQuotaExceeded, type SaveStatusPublisher } from './saveStatus';
import type { RecordChange, RecordCollection, RestorePointKind } from '../domain/types';

/** Reads the coverage needs to find a command's Scenario. Each is a single-row read. */
export interface RestorePointLookup {
  getTrip(id: string): Promise<{ scenarioId: string; routeId: string; serviceDayId: string; tripProfileId?: string } | undefined>;
  getTripProfile(id: string): Promise<{ scenarioId: string } | undefined>;
  getRuntimeProfile(id: string): Promise<{ scenarioId: string; routeId: string; patternId: string } | undefined>;
  getPattern(id: string): Promise<{ scenarioId: string; routeId: string } | undefined>;
  getRoute(id: string): Promise<{ scenarioId: string } | undefined>;
  getBlockingScenario(id: string): Promise<{ scenarioId: string; tripProfileId: string } | undefined>;
  getBlock(id: string): Promise<{ scenarioId: string; serviceDayId: string; activities: Array<{ id: string; type: string }> } | undefined>;
  getScenario(id: string): Promise<{ name: string } | undefined>;
  routeEditPreviewScope(previewToken: string): { scenarioId: string; routeId: string; kind: 'pattern' | 'nodes'; patternId?: string } | undefined;
}

export type CoverageTarget = { scope: 'project'; projectId: string } | ({ scope: 'scenario'; kind?: RestorePointKind } & Omit<ScenarioChangeRequest, 'kind' | 'keep'>);
export interface CoverageSpec {
  kind: RestorePointKind;
  /** The Scenario and named records of one call, or undefined to run the command without a restore point. */
  resolve(args: readonly unknown[], lookup: RestorePointLookup): Promise<CoverageTarget | undefined>;
  keep?: (change: RecordChange) => boolean;
}
export type Coverage = Readonly<Record<string, CoverageSpec>>;

/** Returns `service` with each method named in `coverage` recorded. Other methods are returned bound to the service, as `publishWrites` does. */
export function withRestorePoints<T extends object>(service: T, coverage: Coverage, recorder: RestorePointRecorder, store: Pick<RestorePointStore, 'keepNewest'>, publisher: SaveStatusPublisher, lookup: RestorePointLookup): T {
  return new Proxy(service, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      const method = (value as (...args: unknown[]) => Promise<unknown>).bind(target);
      const spec = typeof property === 'string' && Object.prototype.hasOwnProperty.call(coverage, property) ? coverage[property] : undefined;
      if (!spec) return method;
      return async (...args: unknown[]) => {
        const destination = await spec.resolve(args, lookup);
        if (!destination) return method(...args);
        try {
          if (destination.scope === 'project') return await publisher.run(() => recorder.recordProjectDeletion(destination.projectId, () => method(...args)));
          const { scope: _scope, kind, ...request } = destination;
          return await publisher.run(() => recorder.recordScenarioChange({ ...request, kind: kind ?? spec.kind, ...(spec.keep ? { keep: spec.keep } : {}) }, () => method(...args)));
        } catch (error) {
          // Decision 0081 item 4: when storage is full, keep the newest 5 restore points and report the command's error unchanged.
          if (isQuotaExceeded(error)) await store.keepNewest(5).catch(() => undefined);
          throw error;
        }
      };
    },
  });
}

/** Runs every write directly. For tests and in-memory repositories. */
export class PassThroughRestorePointRecorder implements RestorePointRecorder {
  recordScenarioChange<T>(_request: ScenarioChangeRequest, write: () => Promise<T>): Promise<T> { return write(); }
  recordProjectDeletion<T>(_projectId: string, write: () => Promise<T>): Promise<T> { return write(); }
}

const SERVICE_COLLECTIONS: readonly RecordCollection[] = ['trips', 'runtimeProfiles', 'runtimeAssignments', 'blocks'];
/** A pattern save is recorded only when it removed or changed trips, runtime profiles, runtime assignments, or blocks. */
export const touchesService = (change: RecordChange): boolean => SERVICE_COLLECTIONS.some((collection) => Boolean(change.removed[collection]?.length || change.changedBefore[collection]?.length));
const size = (ids: unknown): number => new Set(ids as string[]).size;

export const ROUTE_DEFINITION_COVERAGE: Coverage = {
  deleteProject: { kind: 'deleteProject', resolve: async ([projectId]) => ({ scope: 'project', projectId: projectId as string }) },
  deleteScenario: { kind: 'deleteScenario', resolve: async ([scenarioId]) => ({ scope: 'scenario', scenarioId: scenarioId as string }) },
  deleteRoute: { kind: 'deleteRoute', resolve: async ([routeId], lookup) => {
    const route = await lookup.getRoute(routeId as string);
    return route && { scope: 'scenario', scenarioId: route.scenarioId, refs: { routeId: routeId as string } };
  } },
  deletePattern: { kind: 'deletePattern', resolve: async ([patternId], lookup) => {
    const pattern = await lookup.getPattern(patternId as string);
    return pattern && { scope: 'scenario', scenarioId: pattern.scenarioId, refs: { routeId: pattern.routeId, patternId: patternId as string } };
  } },
  commitPatternChange: { kind: 'rebalancePattern', keep: touchesService, resolve: async ([previewToken, mode], lookup) => {
    const scope = lookup.routeEditPreviewScope(previewToken as string);
    if (!scope || scope.kind !== 'pattern') return undefined;
    return { scope: 'scenario', scenarioId: scope.scenarioId, kind: mode === 'reset' ? 'resetPatternService' : 'rebalancePattern', refs: { routeId: scope.routeId, ...(scope.patternId ? { patternId: scope.patternId } : {}) } };
  } },
  commitNodeChanges: { kind: 'deleteNodes', keep: (change) => Boolean(change.removed.nodes?.length), resolve: async ([previewToken], lookup) => {
    const scope = lookup.routeEditPreviewScope(previewToken as string);
    if (!scope || scope.kind !== 'nodes') return undefined;
    return { scope: 'scenario', scenarioId: scope.scenarioId, refs: { routeId: scope.routeId } };
  } },
  deleteRuntimeProfile: { kind: 'deleteRuntimeProfile', resolve: async ([profileId], lookup) => {
    const profile = await lookup.getRuntimeProfile(profileId as string);
    return profile && { scope: 'scenario', scenarioId: profile.scenarioId, refs: { routeId: profile.routeId, patternId: profile.patternId, runtimeProfileId: profileId as string } };
  } },
};

export const TRIP_GENERATION_COVERAGE: Coverage = {
  deleteTrips: { kind: 'deleteTrips', resolve: async ([tripIds], lookup) => {
    const first = (tripIds as string[])[0];
    const trip = first === undefined ? undefined : await lookup.getTrip(first);
    return trip && { scope: 'scenario', scenarioId: trip.scenarioId, quantity: size(tripIds), refs: { routeId: trip.routeId, serviceDayId: trip.serviceDayId, ...(trip.tripProfileId ? { tripProfileId: trip.tripProfileId } : {}) } };
  } },
  applyTripCopy: { kind: 'copyTripsFromDay', resolve: async ([preview]) => {
    const request = (preview as { request: { scenarioId: string; routeId: string; tripProfileId: string; sourceServiceDayId: string; targetServiceDayId: string } }).request;
    return { scope: 'scenario', scenarioId: request.scenarioId, refs: { routeId: request.routeId, tripProfileId: request.tripProfileId, serviceDayId: request.targetServiceDayId, sourceServiceDayId: request.sourceServiceDayId } };
  } },
  deleteTripProfile: { kind: 'deleteTripProfile', resolve: async ([profileId], lookup) => {
    const profile = await lookup.getTripProfile(profileId as string);
    return profile && { scope: 'scenario', scenarioId: profile.scenarioId, refs: { tripProfileId: profileId as string } };
  } },
};

/** The Scenario and Trip profile of a Blocking scenario, as refs. */
async function blockingTarget(lookup: RestorePointLookup, blockingScenarioId: string, extra: Omit<ScenarioChangeRequest, 'kind' | 'keep' | 'scenarioId'> & { kind?: RestorePointKind } = {}): Promise<CoverageTarget | undefined> {
  const blockingScenario = await lookup.getBlockingScenario(blockingScenarioId);
  if (!blockingScenario) return undefined;
  return { ...extra, scope: 'scenario', scenarioId: blockingScenario.scenarioId, refs: { tripProfileId: blockingScenario.tripProfileId, blockingScenarioId, ...(extra.refs ?? {}) } };
}

export const BLOCKING_COVERAGE: Coverage = {
  deleteBlockingScenario: { kind: 'deleteBlockingScenario', resolve: async ([blockingScenarioId], lookup) => blockingTarget(lookup, blockingScenarioId as string) },
  deleteBlock: { kind: 'deleteBlocks', resolve: async ([blockingScenarioId, blockId], lookup) => {
    const block = await lookup.getBlock(blockId as string);
    return blockingTarget(lookup, blockingScenarioId as string, { quantity: 1, refs: block ? { serviceDayId: block.serviceDayId } : {} });
  } },
  deleteBlocks: { kind: 'deleteBlocks', resolve: async ([blockingScenarioId, blockIds], lookup) => {
    const first = (blockIds as string[])[0];
    const block = first === undefined ? undefined : await lookup.getBlock(first);
    return blockingTarget(lookup, blockingScenarioId as string, { quantity: size(blockIds), refs: block ? { serviceDayId: block.serviceDayId } : {} });
  } },
  applyBlockingDayCopy: { kind: 'copyBlocksFromDay', resolve: async ([review], lookup) => {
    const request = (review as { preview: { request: { blockingScenarioId: string; sourceServiceDayId: string; targetServiceDayId: string } } }).preview.request;
    return blockingTarget(lookup, request.blockingScenarioId, { refs: { serviceDayId: request.targetServiceDayId, sourceServiceDayId: request.sourceServiceDayId } });
  } },
  createAutoBlockingScenario: { kind: 'rebuildAutoBlocks', resolve: async ([request], lookup) => {
    const replaceId = (request as { replaceBlockingScenarioId?: string }).replaceBlockingScenarioId;
    return replaceId ? blockingTarget(lookup, replaceId) : undefined;
  } },
  applyBulkBoundaryActivities: { kind: 'replaceBoundaryActivities', resolve: async ([request], lookup) => {
    const bulk = request as { blockingScenarioId: string; serviceDayId: string; activity: { type: string } };
    return blockingTarget(lookup, bulk.blockingScenarioId, { detail: bulk.activity.type, refs: { serviceDayId: bulk.serviceDayId } });
  } },
  removeTrip: { kind: 'unassignTrips', resolve: async ([blockingScenarioId, serviceDayId], lookup) => blockingTarget(lookup, blockingScenarioId as string, { quantity: 1, refs: { serviceDayId: serviceDayId as string } }) },
  removeTrips: { kind: 'unassignTrips', resolve: async ([blockingScenarioId, serviceDayId, tripIds], lookup) => blockingTarget(lookup, blockingScenarioId as string, { quantity: size(tripIds), refs: { serviceDayId: serviceDayId as string } }) },
  reassignTrips: { kind: 'moveTripsToBlock', resolve: async ([request], lookup) => {
    const move = request as { blockingScenarioId: string; serviceDayId: string; tripIds: string[]; destinationBlockId: string };
    return blockingTarget(lookup, move.blockingScenarioId, { quantity: size(move.tripIds), refs: { serviceDayId: move.serviceDayId, blockId: move.destinationBlockId } });
  } },
  assignTripsToBlock: { kind: 'moveTripsToBlock', keep: (change) => (change.changedBefore.blocks?.length ?? 0) >= 2, resolve: async ([request], lookup) => {
    const move = request as { blockingScenarioId: string; serviceDayId: string; tripIds: string[]; destinationBlockId: string };
    return blockingTarget(lookup, move.blockingScenarioId, { quantity: size(move.tripIds), refs: { serviceDayId: move.serviceDayId, blockId: move.destinationBlockId } });
  } },
  removeBoundaryActivity: { kind: 'removeBlockActivity', resolve: async ([blockingScenarioId, blockId, activityId], lookup) => {
    const block = await lookup.getBlock(blockId as string);
    const activity = block?.activities.find((candidate) => candidate.id === activityId);
    return blockingTarget(lookup, blockingScenarioId as string, { ...(activity ? { detail: activity.type } : {}), refs: { blockId: blockId as string, ...(block ? { serviceDayId: block.serviceDayId } : {}) } });
  } },
  removeDeadheads: { kind: 'deleteDeadheads', resolve: async ([blockingScenarioId, blockId, activityIds], lookup) => {
    const block = await lookup.getBlock(blockId as string);
    return blockingTarget(lookup, blockingScenarioId as string, { quantity: size(activityIds), refs: { blockId: blockId as string, ...(block ? { serviceDayId: block.serviceDayId } : {}) } });
  } },
};

export const PLANNED_FREQUENCY_COVERAGE: Coverage = {
  clearPlan: { kind: 'clearPlan', resolve: async ([routeId, serviceDayId], lookup) => {
    const route = await lookup.getRoute(routeId as string);
    return route && { scope: 'scenario', scenarioId: route.scenarioId, refs: { routeId: routeId as string, serviceDayId: serviceDayId as string } };
  } },
  applyCopyFromDay: { kind: 'copyPlanFromDay', resolve: async ([preview]) => {
    const copy = preview as { scenarioId: string; routeId: string; sourceServiceDayId: string; targetServiceDayId: string };
    return { scope: 'scenario', scenarioId: copy.scenarioId, refs: { routeId: copy.routeId, serviceDayId: copy.targetServiceDayId, sourceServiceDayId: copy.sourceServiceDayId } };
  } },
  applyCopyFromScenario: { kind: 'copyPlansFromScenario', resolve: async ([preview], lookup) => {
    const copy = preview as { scenarioId: string; sourceScenarioId: string; targetRouteId: string };
    const source = await lookup.getScenario(copy.sourceScenarioId);
    return { scope: 'scenario', scenarioId: copy.scenarioId, refs: { routeId: copy.targetRouteId }, ...(source ? { extraNames: { sourceScenario: source.name } } : {}) };
  } },
};
```

If TypeScript rejects a `return route && { … }` line because `route` can be `undefined`, write it as `return route ? { … } : undefined` with the same object. Make no other change.

### 8.2 `src/application/routeDefinitionService.ts`

1. Anchor: the line `  getSaveStatus(): SaveStatus { return this.saveStatus.getSaveStatus(); }`. Immediately above it, insert:

```ts
  /** Decision 0081: the Scenario and Route a reviewed edit belongs to, read without taking the preview. Undefined for an unknown token. */
  routeEditPreviewScope(previewToken: string): { scenarioId: string; routeId: string; kind: 'pattern' | 'nodes'; patternId?: string } | undefined {
    const stored = this.routeEditPreviews.get(previewToken);
    return stored ? { scenarioId: stored.scenarioId, routeId: stored.routeId, kind: stored.kind, ...(stored.proposedPattern ? { patternId: stored.proposedPattern.id } : {}) } : undefined;
  }

  /** Decision 0081: a restore rewrote stored records, so the in-memory copy undos no longer describe them. */
  forgetCopyUndos(): void {
    this.segmentRuntimeUndo = undefined;
    this.segmentDistanceUndo = undefined;
    this.stopCopyUndo = undefined;
  }

```

2. In `export interface RouteDeletionImpact`, after the line `  routeStopCount: number;`, insert:

```ts
  /** Decision 0081 (inventory gap G7): Route estimate factor entries deleted with the Route (Decision 0077). */
  routeEstimateFactorCount: number;
```

3. In `planRouteDeletion`, after the line `      routeStopCount: removed.routeStopSets.reduce((count, set) => count + set.stops.length, 0),`, insert:

```ts
      routeEstimateFactorCount: (records.costingAssumptions?.routeEstimateFactors ?? []).filter((entry) => entry.routeId === routeId).length,
```

Do not add `routeEditPreviewScope` or `forgetCopyUndos` to `RouteDefinitionApplication`; only `src/main.tsx` calls them.

### 8.3 `src/application/tripGenerationService.ts`

1. In `export interface TripProfileDeletionPreview`, after the line `  blockingScenarioCount: number;`, insert:

```ts
  /** Decision 0081 (inventory gap G7): the profile's Costing estimate factor entries (its own and its Route entries), deleted with it. */
  estimateFactorEntryCount: number;
```

2. In `previewTripProfileDeletion`, in the line beginning `    const preview = { profileId, tripCount: trips.length,`, replace `blockingScenarioCount: blockingScenarios.length, isLastProfile: profiles.length <= 1 };` with:

```ts
blockingScenarioCount: blockingScenarios.length, estimateFactorEntryCount: (records?.costingAssumptions?.tripProfileEstimateFactors ?? []).filter((entry) => entry.tripProfileId === profileId).length + (records?.costingAssumptions?.routeEstimateFactors ?? []).filter((entry) => entry.tripProfileId === profileId).length, isLastProfile: profiles.length <= 1 };
```

3. Anchor: the line `export interface TripProfileDeletionPreview {`. Immediately above it, insert:

```ts
/** Decision 0081 (inventory gaps G5, G6): what removing Trips from the Blocks of one service day also removes, and in which Blocking scenarios. */
export interface TripBlockImpact { removedDeadheadCount: number; blockingScenarios: Array<{ blockingScenarioId: string; name: string; blockCount: number }>; }

```

4. Anchor: the comment line above `async deleteTrips(` that begins `  /** Delete one or more saved trips`. Immediately above that comment, insert:

```ts
  /** Decision 0081 (inventory gaps G5, G6): the deadheads and Blocking scenarios that removing `removedTripIds` from the Blocks of `serviceDayId` changes. Reads only. */
  async describeTripBlockImpact(serviceDayId: string, removedTripIds: string[]): Promise<TripBlockImpact> {
    if (!removedTripIds.length) return { removedDeadheadCount: 0, blockingScenarios: [] };
    const blocks = await this.repository.listBlocks(serviceDayId);
    const adjusted = adjustBlockReferences(blocks, removedTripIds);
    const changed = new Set(adjusted.adjustments.map((adjustment) => adjustment.blockId));
    const deadheads = (block: Block) => block.activities.filter((activity) => activity.type === 'deadhead').length;
    const removedDeadheadCount = blocks.reduce((count, block, index) => count + (changed.has(block.id) ? deadheads(block) - deadheads(adjusted.blocks[index]) : 0), 0);
    const scenarioId = blocks.find((block) => changed.has(block.id))?.scenarioId;
    const records = scenarioId && this.repository.getScenarioRecords ? await this.repository.getScenarioRecords(scenarioId) : undefined;
    const names = new Map((records?.blockingScenarios ?? []).map((blockingScenario) => [blockingScenario.id, blockingScenario.name]));
    const counts = new Map<string, number>();
    for (const block of blocks) if (changed.has(block.id) && block.blockingScenarioId) counts.set(block.blockingScenarioId, (counts.get(block.blockingScenarioId) ?? 0) + 1);
    const blockingScenarios = [...counts].map(([blockingScenarioId, blockCount]) => ({ blockingScenarioId, name: names.get(blockingScenarioId) ?? 'Blocking scenario', blockCount }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
    return { removedDeadheadCount, blockingScenarios };
  }

```

5. In the `export type TripGenerationApplication = Pick<TripGenerationService,` line, replace `'previewTripDeletion' | 'deleteTrips'` with `'previewTripDeletion' | 'describeTripBlockImpact' | 'deleteTrips'`.

### 8.4 `src/domain/blocking.ts`

Anchor: the line beginning `export function applyDeadheadToMatchingConnections(`. Immediately above it, insert:

```ts
/** Decision 0081 (inventory gap G11): how many consecutive Trip pairs of `block` run from `fromNodeId` to `toNodeId`. The matching of `applyDeadheadToMatchingConnections`; reads only. */
export function countMatchingConnections(block: BlockingBlock, fromNodeId: EntityId, toNodeId: EntityId, tripsValue: Trip[] | Map<EntityId, Trip>, patternsValue: RoutePattern[] | Map<EntityId, RoutePattern> | undefined): number {
  const trips = tripMap(tripsValue); const patterns = patternMap(patternsValue); const activities = sortedActivities(block.activities);
  const revenueIndices = activities.map((activity, index) => activity.type === 'revenueTrip' ? index : -1).filter((index) => index >= 0);
  let matched = 0;
  for (let position = 0; position < revenueIndices.length - 1; position += 1) {
    const previous = activities[revenueIndices[position]]; const next = activities[revenueIndices[position + 1]];
    if (previous.type !== 'revenueTrip' || next.type !== 'revenueTrip') continue;
    const previousTrip = trips.get(previous.tripId); const nextTrip = trips.get(next.tripId);
    if (previousTrip && nextTrip && patternEndNode(previousTrip, patterns) === fromNodeId && patternStartNode(nextTrip, patterns) === toNodeId) matched += 1;
  }
  return matched;
}

```

### 8.5 `src/application/tripsWorkspaceView.ts`

Append at the end of the file:

```ts

/** Decision 0081 (inventory gap G10): the deadheads that leave `block` when the Trips in `tripIds` leave it. */
export function deadheadsRemovedFromBlock(block: BlockingBlock, tripIds: string[]): number { return deadheadsRemoved(block, new Set(tripIds)); }
```

### 8.6 `src/application/blockingService.ts`

1. Anchor: the line beginning `  async deleteBlock(blockingScenarioId: string, blockId: string, sourceSignature: string): Promise<void> {`. Immediately above it, insert:

```ts
  /** Decision 0081: removes one pull-out or pull-in from a Block, as the Current block's remove button did through `updateBlock`. */
  async removeBoundaryActivity(blockingScenarioId: string, blockId: string, activityId: string, sourceSignature: string): Promise<BlockingBlock> {
    const { scenario, blocks, block } = await this.loadBlock(blockingScenarioId, blockId, sourceSignature);
    const activity = block.activities.find((candidate) => candidate.id === activityId);
    if (!activity || (activity.type !== 'pullOut' && activity.type !== 'pullIn')) throw new Error('Pull-out or pull-in not found.');
    return this.saveBlock(scenario, blocks, normalizeBlockActivities(withUpdatedAt({ ...block, activities: block.activities.filter((candidate) => candidate.id !== activityId) })), sourceSignature);
  }

  /** Decision 0081: removes deadheads from a Block (Delete deadhead, Delete similar deadheads), as the dialog did through `updateBlock`. */
  async removeDeadheads(blockingScenarioId: string, blockId: string, activityIds: string[], sourceSignature: string): Promise<BlockingBlock> {
    const { scenario, blocks, block } = await this.loadBlock(blockingScenarioId, blockId, sourceSignature);
    const removeIds = new Set(activityIds);
    const removing = block.activities.filter((activity) => removeIds.has(activity.id));
    if (!removeIds.size || removing.length !== removeIds.size || removing.some((activity) => activity.type !== 'deadhead')) throw new Error('Deadhead not found.');
    return this.saveBlock(scenario, blocks, normalizeBlockActivities(withUpdatedAt({ ...block, activities: block.activities.filter((activity) => !removeIds.has(activity.id)) })), sourceSignature);
  }

```

2. In `previewAutoBlocking`, replace the line `    return { result, ruleFindings, nameFindings, ...(check ? { check } : {}) };` with:

```ts
    // Decision 0081 (inventory gap G12): a rebuild states how many Blocks it replaces on each day.
    const replacedBlocks = request.replaceBlockingScenarioId ? await this.repository.listBlockingBlocks(request.replaceBlockingScenarioId) : undefined;
    const replacedBlockCountByServiceDayId = replacedBlocks?.reduce<Record<string, number>>((counts, block) => ({ ...counts, [block.serviceDayId]: (counts[block.serviceDayId] ?? 0) + 1 }), {});
    return { result, ruleFindings, nameFindings, ...(check ? { check } : {}), ...(replacedBlockCountByServiceDayId ? { replacedBlockCountByServiceDayId } : {}) };
```

If that line occurs more than once in the file, stop and report.

### 8.7 `src/application/ports.ts`

1. In `export interface AutoBlockingPreview {`, after the line `  check?: import('../domain/autoBlocking').AutoBlockingCheck;`, insert:

```ts
  /** Decision 0081: with `replaceBlockingScenarioId`, the Blocks the rebuild replaces on each service day. */
  replacedBlockCountByServiceDayId?: Record<string, number>;
```

2. In `export interface BlockingCommands`, after the line `  updateBlock(block: BlockingBlock, sourceSignature: string): Promise<BlockingBlock>;`, insert:

```ts
  /** Decision 0081: removes one pull-out or pull-in. */
  removeBoundaryActivity(blockingScenarioId: string, blockId: string, activityId: string, sourceSignature: string): Promise<BlockingBlock>;
  /** Decision 0081: removes deadheads from one Block. */
  removeDeadheads(blockingScenarioId: string, blockId: string, activityIds: string[], sourceSignature: string): Promise<BlockingBlock>;
```

### 8.8 `src/main.tsx`

1. Add these imports after the line `import { LocalStorageDataProtectionStore } from './persistence/localDataProtectionStore';`:

```ts
import { DexieRestorePoints } from './persistence/restorePointPersistence';
import { BLOCKING_COVERAGE, PLANNED_FREQUENCY_COVERAGE, ROUTE_DEFINITION_COVERAGE, TRIP_GENERATION_COVERAGE, withRestorePoints, type RestorePointLookup } from './application/restorePointCoverage';
```

2. Replace the line `  const routeDefinition = new RouteDefinitionService(repository, backup, undefined, saveStatus, protection);` with:

```ts
  // Decision 0081: the covered commands store a restore point in the same transaction as their write.
  const restorePoints = new DexieRestorePoints(repository.db, repository);
  const routeDefinitionCore = new RouteDefinitionService(repository, backup, undefined, saveStatus, protection);
  const restoreLookup: RestorePointLookup = {
    getTrip: (id) => repository.db.trips.get(id),
    getTripProfile: (id) => repository.db.tripProfiles.get(id),
    getRuntimeProfile: (id) => repository.db.runtimeProfiles.get(id),
    getPattern: (id) => repository.db.patterns.get(id),
    getRoute: (id) => repository.db.routes.get(id),
    getBlockingScenario: (id) => repository.db.blockingScenarios.get(id),
    getBlock: (id) => repository.db.blocks.get(id),
    getScenario: (id) => repository.db.scenarios.get(id),
    routeEditPreviewScope: (token) => routeDefinitionCore.routeEditPreviewScope(token),
  };
  const routeDefinition = withRestorePoints(routeDefinitionCore, ROUTE_DEFINITION_COVERAGE, restorePoints, restorePoints, saveStatus, restoreLookup);
```

3. Replace `  const tripGeneration = new TripGenerationService(repository, undefined, saveStatus);` with `  const tripGeneration = withRestorePoints(new TripGenerationService(repository, undefined, saveStatus), TRIP_GENERATION_COVERAGE, restorePoints, restorePoints, saveStatus, restoreLookup);`.
4. Replace `  const blocking = new BlockingApplicationService(new DexieBlockingRepository(repository.db), {` with `  const blocking = withRestorePoints(new BlockingApplicationService(new DexieBlockingRepository(repository.db), {`, and the line `  }, saveStatus);` that closes that constructor call with `  }, saveStatus), BLOCKING_COVERAGE, restorePoints, restorePoints, saveStatus, restoreLookup);`.
5. Replace `  const plannedFrequencies = new PlannedFrequencyService(repository, undefined, saveStatus);` with `  const plannedFrequencies = withRestorePoints(new PlannedFrequencyService(repository, undefined, saveStatus), PLANNED_FREQUENCY_COVERAGE, restorePoints, restorePoints, saveStatus, restoreLookup);`.

Nothing else in `main.tsx` changes.

### 8.9 Coverage names must match

Every key of the four coverage objects must be a public async method of its service. Add this test (8.10, file 1, case 1): for each coverage object and its service class, every key is `typeof Service.prototype[key] === 'function'`.

### 8.10 Tests

1. New `src/application/restorePointCoverage.test.ts`:
   1. Every coverage key is a method of its service (8.9).
   2. With a fake recorder that records each request and runs the write, a fake store, a real `SaveStatusPublisher`, and a fake lookup: one `it` per coverage key asserting the exact request (`kind`, `scenarioId`, `refs`, `quantity`, `detail`, `extraNames`, and whether `keep` is set) for a sample call. For `createAutoBlockingScenario` without `replaceBlockingScenarioId`, and for `commitPatternChange` with an unknown token, the recorder is not called and the method still runs.
   3. A method not in the coverage runs without the recorder and keeps `this`.
   4. The publisher publishes `saving` once and `saved` once for one covered call whose method itself calls `publisher.run` inside.
   5. A write that throws a `{ name: 'QuotaExceededError' }` error calls `keepNewest(5)` once and rethrows the same error (inside `StorageFullError` as the publisher makes it: assert `isQuotaExceeded(error)` is true).
   6. `touchesService` is true for a change that removes a trip and false for one that changes only a pattern.
2. New `src/application/restorePointCoverage.dexie.test.ts`, on `fake-indexeddb` with `trimmedGoldenFixture()`, the real Dexie repositories, `DexieRestorePoints`, and services wrapped as in `main.tsx`: run `deleteRoute`, `deleteTrips` (two trips of one day), `deleteBlockingScenario`, and `clearPlan` (on the fixture's `plan-weekday`), each after its own preview, and assert one restore point each, with the expected `kind`, `names.scenario`, the route or blocking scenario name, and `counts`.
3. Add to `src/application/blockingService.test.ts`, at the end of its `describe`: `removeBoundaryActivity` removes a pull-out and refuses a revenue trip id; `removeDeadheads` removes two deadheads and refuses an id that is not a deadhead; both refuse a stale `sourceSignature`. Build the data like the first test of that file.
4. Add to `src/domain/blocking.test.ts` (create a `describe('countMatchingConnections')` at the end): two matching pairs and one non-matching pair give 2; an empty Block gives 0.
5. Add to `src/application/tripsWorkspaceView.test.ts`: `deadheadsRemovedFromBlock` returns 1 for a Trip with one adjacent deadhead and 0 for a Trip with none.
6. Add to `src/application/tripGenerationService.test.ts`: `describeTripBlockImpact` returns the deadhead count and one entry per blocking scenario, sorted by name; with no removed trips it returns zero and an empty list.
7. Add to `src/application/routeDefinitionService.test.ts`: `getRouteDeletionImpact(...).routeEstimateFactorCount` counts the Route's entries; `routeEditPreviewScope` returns the scope of a fresh preview token and `undefined` after the commit; `forgetCopyUndos` clears `getDistanceUndo()`.
8. Add to `src/application/autoBlocking.test.ts`: `previewAutoBlocking` with `replaceBlockingScenarioId` returns `replacedBlockCountByServiceDayId` equal to the Blocks per day of that scenario, and without it has no such field.

### 8.11 One existing spec changes: `tests/ui/route-save-race.spec.ts`

Its `slowSaves` helper delays every database transaction with a timer. With FX2 a pattern or node save runs inside the restore point transaction, and the delayed inner transaction would start after the outer one has closed, so the save fails. The fix delays only top-level transactions, which keeps the spec's purpose (the save is still slow). Verified in the dry run of 2026-11-17: both tests pass with this change and fail without it.

In `slowSaves`, find:

```ts
    TransitDatabase.prototype.transaction = function (...args) {
      return new Promise
```

and replace it with:

```ts
    TransitDatabase.prototype.transaction = function (...args) {
      // A transaction opened inside another (a covered command inside its restore point transaction, Decision 0081) joins it and is not delayed.
      if (Object.getPrototypeOf(TransitDatabase).currentTransaction) return original.apply(this, args);
      return new Promise
```

No other spec patches `transaction` (checked with a search on 2026-11-17).

### 8.12 FX2 commit and gate

Commit `FX2: Restore point coverage of every destructive command, new removal commands and impact fields (Decision 0081)`. Gate: Opus reviews the diff and reruns typecheck, unit suite, and the full browser suite.

## 9. FX2R: Restore service (Opus)

Opus writes `src/application/restorePointService.ts` with:

- `RestorePointQueries`: `listRestorePoints(): Promise<RestorePointListing[]>` (summary plus `status`: `restorable`, `conflict` with up to three named records and a count of the rest, `projectMissing`, or `projectExists`); `latestRestorable(projectId?: string)`; `subscribeToRestorePoints(listener)`.
- `RestorePointCommands`: `restore(id): Promise<{ projectId: string; scenarioId?: string }>`. A Scenario point is restored with `planRestore` through `updateScenarioRecords` inside `recordScenarioChange({ kind: 'restore', restoredKind, … })` when the Scenario exists, or through `saveScenarioRecords` when it was deleted (its project must exist). A project point is restored with `saveProjectSnapshot` when the project id is absent. The status is checked again inside the write; a refusal throws `RestoreConflictError` with the conflicts. The restored point is deleted after success. `forgetCopyUndos` runs after every restore.
- Wiring in `src/main.tsx` and an optional `restorePoints?: RestorePointCommands & RestorePointQueries` prop on `App` (type only; FX4 uses it).
- Tests on `fake-indexeddb` with the trimmed fixture: for **every** key of the four coverage objects, run the command, restore, and assert `getScenarioRecords` (or `getProjectSnapshot`) equals the state before, collections sorted by id. Plus: a conflict after editing a written row; an older point restored after an unrelated newer one; undo of a restore; restoring a deleted Scenario and a deleted Project.

## 10. Gate A

Opus demonstrates, on the golden project in the browser console or a scripted spec: delete a Trip profile, list the restore point, restore it, and show the Trip profile and its blocking scenarios back. The user confirms the undo rules before any screen changes.

## 11. FX3: Warning texts, counts, button styles (Haiku)

Text marked {…} is computed as shown in the code. Make only these edits.

### 11.1 `src/ui/route/RouteWorkspace.tsx`

1. Add to the imports: `import { classifyPatternEdit } from '../../domain/safeRouteEditing';`, and change `import { SupportPanel, WorkSurface } from '../shared/surfaces';` to `import { InlineNote, SupportPanel, WorkSurface } from '../shared/surfaces';`.
2. Inside `RouteWorkspace`, anchor the line beginning `  function discardNodes() {`. Immediately above it, insert:

```tsx
  /** Inventory gap G3: the saved timepoints a pattern save removes or moves to another node, or the nodes a node save deletes. */
  function impactTimepointNames(preview: NodeChangePreview | SafePatternChangePreview): string[] {
    const nodeName = (nodeId: string) => aggregate.nodes.find((node) => node.id === nodeId)?.name || 'Untitled node';
    if (preview.kind === 'nodes') return preview.deletedNodeIds.map(nodeName);
    const saved = aggregate.patterns.find((pattern) => pattern.id === preview.proposedPattern.id);
    const pointIds = new Set([...preview.removedPointIds, ...preview.nodeChangedPointIds]);
    return [...new Set((saved?.points ?? []).filter((point) => pointIds.has(point.id)).map((point) => nodeName(point.nodeId)))];
  }
```

3. In the line beginning `    {impactDialog && <RouteEditImpactDialog preview={impactDialog.preview} mode={impactDialog.mode}`, replace `mode={impactDialog.mode}` with `mode={impactDialog.mode} timepointNames={impactTimepointNames(impactDialog.preview)}`.
4. In `PatternEditor`, anchor the line `  const pointsGrid = usePatternPointsGrid(pattern, onSetSegment);`. Immediately below it, insert:

```tsx
  // Inventory gap G2: a new order of saved points resets the pattern's service on save.
  const resetOnSave = !isNew && Boolean(savedPattern) && classifyPatternEdit(savedPattern, pattern) === 'reset';
```

5. In the long `return` line of `PatternEditor`, replace `{dirty && <SaveBar message={isNew ?` with `{resetOnSave && <InlineNote kind="warn">Saving this point order removes the pattern's runtimes and trips.</InlineNote>}{dirty && <SaveBar message={isNew ?`.
6. Replace the whole function `RouteEditImpactDialog` (from `export function RouteEditImpactDialog(` to its closing `}`) with:

```tsx
export function RouteEditImpactDialog({ preview, mode, timepointNames = [], onClose, onCommit }: { preview: NodeChangePreview | SafePatternChangePreview; mode: RouteEditMode; timepointNames?: string[]; onClose: () => void; onCommit: () => void }) {
  const impact = preview.impact;
  const reset = mode === 'reset';
  const title = preview.kind === 'nodes' ? 'Update service for deleted nodes?' : reset ? "Remove this pattern's service?" : 'Save pattern and rebalance?';
  const affected = [impact.profileIds.length ? `${impact.profileIds.length} runtime profile${impact.profileIds.length === 1 ? '' : 's'}` : '', impact.tripIds.length ? `${impact.tripIds.length} trip${impact.tripIds.length === 1 ? '' : 's'}` : '', impact.blockIds.length ? `${impact.blockIds.length} block${impact.blockIds.length === 1 ? '' : 's'}` : ''].filter(Boolean);
  const detail = reset
    ? `Saving the new point order removes this pattern's ${plural(impact.profileIds.length, 'runtime profile')} and ${plural(impact.tripIds.length, 'trip')}, and removes those trips from ${plural(impact.blockIds.length, 'block')}. Other patterns are not changed.`
    : preview.kind === 'nodes'
      ? `This will remove the selected node occurrences and update ${affected.join(', ') || 'the affected schedule'} while preserving retained times.`
      : `This will update ${affected.join(', ') || 'this pattern'} using the revised timepoint structure. Added timepoints begin with zero run time.`;
  // Inventory gap G3: name the timepoints whose runtime segments and trip times the save rewrites.
  const rewrites = !reset && timepointNames.length > 0 && (impact.profileIds.length > 0 || impact.tripIds.length > 0);
  const rewriteDetail = rewrites ? `${preview.kind === 'nodes' ? 'Deleted' : 'Removed or changed'} timepoints: ${timepointNames.join(', ')}. Saving rewrites the runtime segments around them in ${plural(impact.profileIds.length, 'runtime profile')} and removes their times from ${plural(impact.tripIds.length, 'trip')}.` : '';
  const nonRevenue = preview.kind === 'nodes' ? preview.nonRevenueImpact : undefined;
  const nonRevenueDetail = nonRevenue?.removedActivityCount ? `Removes ${nonRevenue.removedActivityCount} pull-out, pull-in, or deadhead ${nonRevenue.removedActivityCount === 1 ? 'activity' : 'activities'} in ${nonRevenue.blockIds.length} block${nonRevenue.blockIds.length === 1 ? '' : 's'}.` : '';
  // Decision 0079 section 10: stops that move into a merged segment or are removed with their segment are listed, one paragraph per count.
  const stopDetails = [
    preview.stopsMovedCount ? `Moves ${preview.stopsMovedCount} stop${preview.stopsMovedCount === 1 ? '' : 's'} into the merged segment.` : '',
    preview.stopsRemovedCount ? `Removes ${preview.stopsRemovedCount} stop${preview.stopsRemovedCount === 1 ? ' that is' : 's that are'} no longer on the pattern.` : '',
  ].filter(Boolean);
  return <ModalDialog role="alertdialog" labelledBy="route-edit-impact-title" className="confirm-dialog" onClose={onClose}><h2 id="route-edit-impact-title">{title}</h2><p>{detail}</p>{rewriteDetail && <p>{rewriteDetail}</p>}{nonRevenueDetail && <p>{nonRevenueDetail}</p>}{stopDetails.map((text) => <p key={text}>{text}</p>)}<div className="dialog-actions"><button onClick={onClose}>Cancel</button><button className={reset || rewrites ? 'danger' : 'primary'} onClick={onCommit}>{reset ? 'Remove service and save' : preview.kind === 'nodes' ? 'Delete nodes and update service' : 'Save and rebalance'}</button></div></ModalDialog>;
}
```

### 11.2 `src/ui/App.tsx` (deletion texts only)

1. In `deleteCurrentRoute`, find this line:

```tsx
        impact.routeStopCount ? `${impact.routeStopCount} stop${impact.routeStopCount === 1 ? '' : 's'}` : '',
```

   and insert this line directly below it:

```tsx
        impact.routeEstimateFactorCount ? 'estimate factors for this route' : '',
```
2. In `deleteTripProfile`, after the line beginning `      const blockingScenarioDetail = impact.blockingScenarioCount ?`, insert the line `      const factorDetail = impact.estimateFactorEntryCount ? 'Also deletes its costing estimate factors. ' : '';`, and in the `setConfirm` text replace `${blockingScenarioDetail}This cannot be undone.` with `${blockingScenarioDetail}${factorDetail}This cannot be undone.`.

### 11.3 `src/ui/trips/dialogs.tsx`

1. Replace `import { type TripGenerationApplication } from '../../application/tripGenerationService';` with `import { type TripBlockImpact, type TripGenerationApplication } from '../../application/tripGenerationService';`.
2. Replace the whole `DeleteTripsDialog` function (one line beginning `export function DeleteTripsDialog(`) with:

```tsx
export function DeleteTripsDialog({ tripCount, affectedBlockCount, blockImpact, onDelete, onClose, busy }: { tripCount: number; affectedBlockCount: number; blockImpact?: TripBlockImpact; onDelete: () => void; onClose: () => void; busy: boolean }) {
  // Inventory gap G6: name the deadheads and the Blocking scenarios the deletion also changes.
  const deadheads = blockImpact?.removedDeadheadCount ?? 0;
  const where = blockImpact?.blockingScenarios.length ? `, in ${blockImpact.blockingScenarios.map((entry) => `${entry.name} (${entry.blockCount})`).join(', ')}` : '';
  const blocksText = affectedBlockCount ? `This will also remove their revenue activities from ${affectedBlockCount} block${affectedBlockCount === 1 ? '' : 's'}${deadheads ? ` and ${deadheads} adjacent deadhead${deadheads === 1 ? '' : 's'}` : ''}${where}.` : 'These trips are not assigned to a block.';
  return <ModalDialog role="alertdialog" labelledBy="delete-trips-title" className="confirm-dialog" onClose={onClose} busy={busy}><h2 id="delete-trips-title">Delete {tripCount === 1 ? 'trip' : `${tripCount} trips`}?</h2><p>{blocksText} This cannot be undone.</p><div className="dialog-actions"><button onClick={onClose} disabled={busy}>Cancel</button><button className="danger" onClick={onDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button></div></ModalDialog>;
}
```

3. In `DeleteRuntimeProfileDialog`, replace `<button className="subtle-danger" disabled={blocked}` with `<button className="danger" disabled={blocked}`.
4. In `TripDayCopyDialog`:
   - Replace `const [preview, setPreview] = useState<TripCopyPreview>();` with `const [preview, setPreview] = useState<TripCopyPreview>(); const [blockImpact, setBlockImpact] = useState<TripBlockImpact>();`
   - Replace `try { setPreview(await tripService.previewTripCopy({ scenarioId, routeId, tripProfileId, sourceServiceDayId, targetServiceDayId: targetDay.id, allowEmptySource })); }` with `try { const next = await tripService.previewTripCopy({ scenarioId, routeId, tripProfileId, sourceServiceDayId, targetServiceDayId: targetDay.id, allowEmptySource }); setPreview(next); setBlockImpact(next.removedTripIds.length ? await tripService.describeTripBlockImpact(targetDay.id, next.removedTripIds) : undefined); }`.
   - In the Source day `onChange`, replace `setPreview(undefined); setAllowEmptySource(false);` with `setPreview(undefined); setBlockImpact(undefined); setAllowEmptySource(false);`.
   - Find `['Block activities removed', preview.impact.removedBlockActivityCount]]} />` and insert directly after it, on the same line:

```tsx
{blockImpact && blockImpact.blockingScenarios.length > 0 && <p>Removes trips from blocks in: {blockImpact.blockingScenarios.map((entry) => `${entry.name} (${entry.blockCount} block${entry.blockCount === 1 ? '' : 's'})`).join(', ')}.</p>}
```
   - Replace `<button className={preview.impact.requiresExplicitEmptySourceReview ? 'danger' : 'primary'} onClick={() => void apply()} disabled={errors || busy}>{busy ? 'Copying…' : preview.impact.requiresExplicitEmptySourceReview ? 'Clear target trips' : 'Copy trips'}</button>` with `<button className={preview.impact.requiresExplicitEmptySourceReview || preview.impact.targetTripsReplaced > 0 ? 'danger' : 'primary'} onClick={() => void apply()} disabled={errors || busy}>{busy ? 'Copying…' : preview.impact.requiresExplicitEmptySourceReview ? 'Clear target trips' : preview.impact.targetTripsReplaced > 0 ? 'Replace trips' : 'Copy trips'}</button>`.

### 11.4 `src/ui/trips/TripsWorkspace.tsx` (trip deletion lines only)

1. In the import from `'../../application/tripGenerationService'`, replace `type TripGenerationApplication }` with `type TripBlockImpact, type TripGenerationApplication }`.
2. Replace `const [tripDeletion, setTripDeletion] = useState<{ tripIds: string[]; affectedBlockIds: string[]; reviewToken: string }>();` with `const [tripDeletion, setTripDeletion] = useState<{ tripIds: string[]; affectedBlockIds: string[]; reviewToken: string; blockImpact?: TripBlockImpact }>();`.
3. In `requestTripDeletion`, replace `      setTripDeletion({ tripIds: preview.deletedTripIds, affectedBlockIds: preview.affectedBlockIds, reviewToken: preview.reviewToken });` with:

```tsx
      const blockImpact = preview.affectedBlockIds.length ? await tripService.describeTripBlockImpact(serviceDayId, preview.deletedTripIds) : undefined;
      setTripDeletion({ tripIds: preview.deletedTripIds, affectedBlockIds: preview.affectedBlockIds, reviewToken: preview.reviewToken, ...(blockImpact ? { blockImpact } : {}) });
```

4. Replace `<DeleteTripsDialog tripCount={tripDeletion.tripIds.length} affectedBlockCount={tripDeletion.affectedBlockIds.length}` with `<DeleteTripsDialog tripCount={tripDeletion.tripIds.length} affectedBlockCount={tripDeletion.affectedBlockIds.length} blockImpact={tripDeletion.blockImpact}`.

### 11.5 `src/ui/blocking/BlockingWorkspace.tsx`

1. In the import from `'../../domain/blocking'` (line 7), add `countMatchingConnections, ` directly after `BlockingValidationError, `.
2. Add `import { deadheadsRemovedFromBlock } from '../../application/tripsWorkspaceView';` after the last existing import line.
3. In `removeActivity`, replace `else await blockingService.updateBlock({ ...selectedBlock, activities: selectedBlock.activities.filter((item) => item.id !== activity.id) }, sourceSignature());` with `else await blockingService.removeBoundaryActivity(blockingScenario.id, selectedBlock.id, activity.id, sourceSignature());`.
4. In `removeDeadhead`, replace `await blockingService.updateBlock({ ...request.draft.block, activities: request.draft.block.activities.filter((activity) => !removeIds.has(activity.id)) }, sourceSignature());` with `await blockingService.removeDeadheads(blockingScenario.id, request.draft.block.id, [...removeIds], sourceSignature());`.
5. In the line beginning `    {reassignTrips && <ReassignDialog tripCount={reassignTrips.trips.length}`, replace `<ReassignDialog tripCount={reassignTrips.trips.length}` with `<ReassignDialog tripCount={reassignTrips.trips.length} deadheadCount={(() => { const source = dayBlocks.find((block) => block.id === reassignTrips.sourceBlockId); return source ? deadheadsRemovedFromBlock(source, reassignTrips.trips.map((trip) => trip.id)) : 0; })()}`.
6. In `function ReassignDialog({ tripCount, sourceBlock,`, replace `{ tripCount, sourceBlock, destinationBlocks, busy, onSubmit, onClose }: { tripCount: number;` with `{ tripCount, deadheadCount, sourceBlock, destinationBlocks, busy, onSubmit, onClose }: { tripCount: number; deadheadCount: number;`, and replace `to the end of the destination block in one save.</p>` with `to the end of the destination block in one save.</p>{deadheadCount > 0 && <p>{deadheadCount} adjacent deadhead activit{deadheadCount === 1 ? 'y will' : 'ies will'} be removed.</p>}`.
7. In the line beginning `    {activityDraft && <ActivityDialog draft={activityDraft}`, replace `<ActivityDialog draft={activityDraft}` with `<ActivityDialog draft={activityDraft} similarConnectionCount={(fromNodeId, toNodeId) => countMatchingConnections(activityDraft.block, fromNodeId, toNodeId, trips, allPatterns)}`.
8. In `function ActivityDialog({ draft, nodes,`, replace `{ draft, nodes, busy, boundaryPreview, onSubmit,` with `{ draft, nodes, busy, boundaryPreview, similarConnectionCount, onSubmit,`, and replace `{ draft: ActivityDraft; nodes: Node[]; busy: boolean; boundaryPreview?: BulkBoundaryPreview;` with `{ draft: ActivityDraft; nodes: Node[]; busy: boolean; boundaryPreview?: BulkBoundaryPreview; similarConnectionCount?: (fromNodeId: string, toNodeId: string) => number;`.
9. In `ActivityDialog`, after the line beginning `  const canDelete = draft.type === 'deadhead'`, insert:

```tsx
  // Inventory gap G11: say how many connections "Apply to all similar trips" changes.
  const similarCount = draft.type === 'deadhead' && fromNodeId && toNodeId && similarConnectionCount ? similarConnectionCount(fromNodeId, toNodeId) : undefined;
```

10. Find `<span>Apply to all similar trips in this block</span>` and replace it with:

```tsx
<span>Apply to all similar trips in this block{similarCount === undefined ? '' : ` (${similarCount} connection${similarCount === 1 ? '' : 's'})`}</span>
```

If `trips` or `allPatterns` is not in scope at the `ActivityDialog` line, stop and report.

### 11.6 `src/ui/blocking/AutoBlockingDialog.tsx`

1. Anchor: the line `const text = (value: number | undefined) => value === undefined ? '' : String(value);`. Immediately above it, insert:

```tsx
/** Inventory gap G17: the values of a new-scenario dialog closed without creating, per Trip profile, until the page reloads. */
const autoBlockingDrafts = new Map<string, { form: Form; name: string; sourceId: string; shapeKey: string }>();
/** A stored draft is used only while the Trip profile still has the same patterns, terminals, and routes. */
const draftShapeKey = (form: Form) => `${form.patterns.map((row) => row.patternId).sort().join(',')}|${Object.keys(form.terminals).sort().join(',')}|${Object.keys(form.garages).sort().join(',')}`;

```

2. In the setup effect, replace `      setSetup(value); setName(value.defaultName); setForm(formFromRules(value.defaultRules, value));` with:

```tsx
      setSetup(value);
      const defaults = formFromRules(value.defaultRules, value);
      const draft = autoBlockingDrafts.get(tripProfileId);
      if (draft && draft.shapeKey === draftShapeKey(defaults)) { setName(draft.name); setForm(draft.form); setSourceId(draft.sourceId); }
      else { setName(value.defaultName); setForm(defaults); }
```

3. Anchor: the line `  async function create() {`. Immediately above it, insert:

```tsx
  /** Keeps a new scenario's values for the next opening (inventory gap G17). A rebuild keeps nothing: its rules are stored on the scenario. */
  function closeKeepingDraft() {
    if (form && !replace) autoBlockingDrafts.set(tripProfileId, { form, name, sourceId, shapeKey: draftShapeKey(form) });
    onClose();
  }

```

4. In `create()`, replace `await onCreated(created); }` with `autoBlockingDrafts.delete(tripProfileId); await onCreated(created); }`.
5. Replace `  return <DialogShell onClose={onClose} busy={creating} onSubmit={() => void create()}>` with `  return <DialogShell onClose={closeKeepingDraft} busy={creating} onSubmit={() => void create()}>`.
6. In the line beginning `    <div className="dialog-actions"><button type="button" onClick={onClose} disabled={creating}>Cancel</button>`, replace `onClick={onClose} disabled={creating}` with `onClick={closeKeepingDraft} disabled={creating}`.
7. In the preview table header, replace `<th scope="col">2+ breaks</th></tr></thead>` with `<th scope="col">2+ breaks</th>{replaceId && <th scope="col">Replaces</th>}</tr></thead>` (inventory gap G12).
8. In the preview table row, replace `<td>{day.blocksWithTwoOrMoreBreaks}</td>` with `<td>{day.blocksWithTwoOrMoreBreaks}</td>{replaceId && <td>{preview?.replacedBlockCountByServiceDayId?.[day.serviceDayId] ?? 0}</td>}`.

The loading-state `DialogShell` (the one with `<p role="status">Loading…</p>`) keeps `onClose`.

### 11.7 New spec `tests/ui/warning-texts.spec.ts`

Model the setup on `tests/ui/support/tripsWorkspace.ts` (`createShiftReadySchedule`) and the commands on `tests/ui/support/ui.ts` (`runCommand`). Cases:

1. With trips on the pattern, press **Move point down** on point 1 in the Route tab: the warning "Saving this point order removes the pattern's runtimes and trips." shows; **Review and save** opens the alertdialog "Remove this pattern's service?" with the button "Remove service and save"; Cancel closes it with nothing changed.
2. Removing an intermediate point of a pattern with trips and choosing **Review and save** shows "Removed or changed timepoints:" and the confirm button has the class `danger` and the name "Save and rebalance". (Build a three-point pattern with `savePattern`-style UI steps; if no helper builds three points through the UI, add the points with "+ Add node to pattern" as `route-editing.spec.ts` does.)
3. Copying Weekday trips to another day twice: the second review shows the button "Replace trips" with class `danger`.
4. The Auto-blocking dialog, closed with Cancel after typing a name, shows that name when opened again.

### 11.8 FX3 commit and gate

Commit `FX3: Warning texts, counts and button styles for the inventory gaps (Decision 0081)`. Gate: Opus reviews screenshots of each changed dialog.

## 12. FX4: Undo interface (Opus)

1. After every covered command the notice area shows a success notice "{label} · {context}" and an **Undo** button, driven by `subscribeToRestorePoints`, so no workspace needs its own wiring. The label comes from a new `restorePointLabel(summary)` in `src/ui/shared/messages.ts`:

   | Kind | Label |
   | --- | --- |
   | deleteProject | Deleted project {names.project} |
   | deleteScenario | Deleted scenario {names.scenario} |
   | deleteRoute | Deleted route {names.route} |
   | deletePattern | Deleted pattern {names.pattern} |
   | resetPatternService | Removed the service of pattern {names.pattern} |
   | rebalancePattern | Saved pattern {names.pattern} |
   | deleteNodes | Deleted {counts.nodes.removed} nodes |
   | deleteRuntimeProfile | Deleted runtime profile {names.runtimeProfile} |
   | deleteTrips | Deleted {quantity} trips |
   | copyTripsFromDay | Copied {names.sourceServiceDay} trips to {names.serviceDay} |
   | deleteTripProfile | Deleted trip profile {names.tripProfile} |
   | unassignTrips | Unassigned {quantity} trips |
   | moveTripsToBlock | Moved {quantity} trips to {names.block} |
   | deleteBlockingScenario | Deleted blocking scenario {names.blockingScenario} |
   | deleteBlocks | Deleted {counts.blocks.removed} blocks |
   | copyBlocksFromDay | Copied {names.sourceServiceDay} blocks to {names.serviceDay} |
   | rebuildAutoBlocks | Rebuilt the blocks of {names.blockingScenario} |
   | replaceBoundaryActivities | Updated {pull-outs or pull-ins} in {counts.blocks.changed} blocks |
   | removeBlockActivity | Removed {the pull-out or the pull-in} from {names.block} |
   | deleteDeadheads | Deleted {quantity} deadheads |
   | clearPlan | Cleared the {names.serviceDay} plan |
   | copyPlanFromDay | Copied the {names.sourceServiceDay} plan to {names.serviceDay} |
   | copyPlansFromScenario | Copied plans from {names.sourceScenario} |
   | restore | Undid: {label of restoredKind} |

   Plurals follow the existing helpers ("1 trip", "2 trips").
2. The notice is non-modal, keeps the existing `role="status"`, does not take focus, and stays until dismissed, replaced, or the Project or Scenario changes.
3. Project menu, group "Project data": **Undo {label}** for the newest restorable point of the open project (absent when none) and **Undo history…**.
4. Undo history dialog: newest first; each row has the label, the context line, the age, and **Restore** or the reason it cannot be restored. Deleted projects are listed and restore as a project. With no project open, the empty state adds **Restore deleted project…** when a deleted-project point exists.
5. After a restore the workspace reloads the restored Project, Scenario, and Route; a missing Route falls back as today.
6. The confirmations of D3 are removed (the commands write at once and show the notice): `removeActivityPending` for a single Current-block activity, `deleteDeadhead` without `applyToSimilar`, and the Block pill's single-trip unassign.
7. "This cannot be undone." is removed from every dialog of a covered command. Project deletion keeps its backup check.
8. `undo-history.spec.ts` covers delete → Undo from the notice, Undo from the Project menu, a refused restore with its reason, and a deleted project restored from the empty state. The axe run in `keyboard.spec.ts` includes the dialog and a notice with Undo.

## 13. Gate B

The user reviews the undo interface.

## 14. FX5: Working context memory (Haiku)

### 14.1 `src/ui/preferences.ts`

Append at the end of the file:

```ts

// Working context (Decision 0081 item 6): per-device convenience state, never Scenario data and never in backups.
export const WORKING_CONTEXT_KEY = 'transit-costing-tool.working-context.v1';
export type WorkingContext = { scenarios: Record<string, { tripProfileId?: string; serviceDayId?: string }>; routes: Record<string, { directionId?: string }> };

const storedObject = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** The remembered Trip profile and Day of each Scenario and Direction of each Route. A wrong-shaped entry or field reads as not stored. */
export function readWorkingContext(storage?: StorageReader): WorkingContext {
  const stored = readStoredRecord(WORKING_CONTEXT_KEY, storage);
  const scenarios: WorkingContext['scenarios'] = {};
  for (const [id, value] of Object.entries(storedObject(stored.scenarios) ?? {})) {
    const entry = storedObject(value);
    const tripProfileId = storedText(entry?.tripProfileId);
    const serviceDayId = storedText(entry?.serviceDayId);
    if (tripProfileId || serviceDayId) scenarios[id] = { ...(tripProfileId ? { tripProfileId } : {}), ...(serviceDayId ? { serviceDayId } : {}) };
  }
  const routes: WorkingContext['routes'] = {};
  for (const [id, value] of Object.entries(storedObject(stored.routes) ?? {})) {
    const directionId = storedText(storedObject(value)?.directionId);
    if (directionId) routes[id] = { directionId };
  }
  return { scenarios, routes };
}

export function writeWorkingContext(context: WorkingContext) {
  try { localStorage.setItem(WORKING_CONTEXT_KEY, JSON.stringify(context)); } catch { /* Storage is a convenience only. */ }
}
```

Add to `src/ui/preferences.test.ts` (a new `describe('readWorkingContext')` at the end): a well-formed value round trips; `null`, an array, a number, wrong-shaped entries, and empty strings read as empty maps; one bad entry does not drop the good ones. Use the `storage` argument with a fake `{ getItem }`, as the file's other tests do.

### 14.2 `src/ui/App.tsx` (selection lines only)

1. In the preferences import (line 8), add `readWorkingContext, writeWorkingContext, type WorkingContext, ` directly after `import { `.
2. Replace `export type Notice = { kind: 'error' | 'success'; text: string } | undefined;` with `export type Notice = { kind: 'error' | 'success' | 'info'; text: string } | undefined;`.
3. In `reload`, replace the line `    setWorkspaceTripProfileId((current) => current && tripProfiles.some((profile) => profile.id === current) ? current : tripProfiles[0]?.id ?? '');` with:

```tsx
    // Decision 0081 item 6: a reload or a Scenario switch opens the Trip profile last used in that Scenario on this device. When it no longer
    // exists the first time this Scenario opens in this page, say which one is open instead.
    const rememberedProfileId = workingContext.current.scenarios[scenario.id]?.tripProfileId;
    const rememberedProfile = tripProfiles.find((profile) => profile.id === rememberedProfileId);
    if (rememberedProfileId && !rememberedProfile && tripProfiles[0] && !openedScenarios.current.has(scenario.id)) setNotice({ kind: 'info', text: `The trip profile open last time is no longer in this scenario. ${tripProfiles[0].name} is open.` });
    openedScenarios.current.add(scenario.id);
    setWorkspaceTripProfileId((current) => current && tripProfiles.some((profile) => profile.id === current) ? current : rememberedProfile?.id ?? tripProfiles[0]?.id ?? '');
```

4. Replace the block from the comment line `  // The Day and Trip Profile last viewed in each Scenario, and the direction last viewed on each Route, for this session. A Scenario switch` through the closing `}, [records?.tripProfiles, workspaceTripProfileId]);` of the third effect with:

```tsx
  // The Day and Trip Profile last viewed in each Scenario, and the direction last viewed on each Route, kept on this device (Decision 0081
  // item 6). A Scenario switch or a reload restores them instead of falling back to the first entry.
  const workingContext = useRef<WorkingContext>(readWorkingContext());
  const openedScenarios = useRef(new Set<string>());
  function rememberContext(change: (context: WorkingContext) => void) { change(workingContext.current); writeWorkingContext(workingContext.current); }
  useEffect(() => {
    const days = sortServiceDays(records?.serviceDays ?? []);
    if (days.some((day) => day.id === workspaceServiceDayId)) { if (records) rememberContext((context) => { context.scenarios[records.scenario.id] = { ...context.scenarios[records.scenario.id], serviceDayId: workspaceServiceDayId }; }); return; }
    const remembered = records ? workingContext.current.scenarios[records.scenario.id]?.serviceDayId : undefined;
    setWorkspaceServiceDayId(days.find((day) => day.id === remembered)?.id ?? days[0]?.id ?? '');
  }, [records?.serviceDays, workspaceServiceDayId]);
  useEffect(() => {
    const directions = orderDirections(aggregate?.directions ?? []);
    if (directions.some((direction) => direction.id === workspaceDirectionId)) { if (aggregate) rememberContext((context) => { context.routes[aggregate.route.id] = { directionId: workspaceDirectionId }; }); return; }
    const remembered = aggregate ? workingContext.current.routes[aggregate.route.id]?.directionId : undefined;
    setWorkspaceDirectionId(directions.find((direction) => direction.id === remembered)?.id ?? directions[0]?.id ?? '');
  }, [aggregate?.directions, workspaceDirectionId]);
  useEffect(() => {
    const profiles = records?.tripProfiles ?? [];
    if (profiles.some((profile) => profile.id === workspaceTripProfileId)) { if (records) rememberContext((context) => { context.scenarios[records.scenario.id] = { ...context.scenarios[records.scenario.id], tripProfileId: workspaceTripProfileId }; }); return; }
    const remembered = records ? workingContext.current.scenarios[records.scenario.id]?.tripProfileId : undefined;
    setWorkspaceTripProfileId(profiles.find((profile) => profile.id === remembered)?.id ?? profiles[0]?.id ?? '');
  }, [records?.tripProfiles, workspaceTripProfileId]);
  // Decision 0081 item 6: the browser tab names the working context.
  useEffect(() => {
    const scenarioName = records?.scenario.name;
    const routeName = aggregate ? aggregate.route.shortName || aggregate.route.name || 'Untitled route' : undefined;
    const profileName = records?.tripProfiles?.find((profile) => profile.id === workspaceTripProfileId)?.name;
    const parts = !scenarioName ? [] : activeTab === 'costing' ? ['Costing', scenarioName] : activeTab === 'route' ? [routeName, scenarioName] : [routeName, profileName, scenarioName];
    const label = parts.filter(Boolean).join(' · ');
    document.title = label ? `${label} — Transit Costing Tool` : 'Transit Costing Tool';
  }, [activeTab, records?.scenario.name, aggregate?.route.name, aggregate?.route.shortName, records?.tripProfiles, workspaceTripProfileId]);
```

If `useRef` is not already imported from `react` in `App.tsx`, stop and report (it is at `33bc716`).

### 14.3 New spec `tests/ui/working-context.spec.ts`

Seed the golden project with an Alt Trip profile (`goldenWithAltProfile` from `tests/ui/support/goldenFixture.ts`, `seedSnapshot` from `tests/ui/support/dexieEnv.ts`); open Trips as `openGoldenTrips` does. Cases:

1. Choose the Alt Trip profile and Saturday, reload: Alt and Saturday are open again.
2. Change the remembered Trip profile in `localStorage` (`transit-costing-tool.working-context.v1`) to an id that does not exist, reload: the notice "The trip profile open last time is no longer in this scenario. Default is open." shows once; choosing another tab does not show it again.
3. Delete the Alt Trip profile from the Trips menu while it is open: no info notice appears.
4. The page title reads "{route} · Alt · {scenario} — Transit Costing Tool" on Trips and "Costing · {scenario} — Transit Costing Tool" on Costing.

Model the profile and day choices on `tests/ui/trip-profile.spec.ts` and `tests/ui/blocking-defaults.spec.ts`.

### 14.4 FX5 commit and gate

Commit `FX5: Working context remembered across reloads, fallback notice and window title (Decision 0081)`. Gate: Opus reviews the diff.

## 15. FX6: Context line (Opus, UI design)

1. Mock-ups of the scope bar on each tab at 1024, 1280, and 1440 px, light and dark, with one and with several Trip profiles and Blocking scenarios, go to the user (Gate C) before any code.
2. Breadcrumb Project › Scenario › Trip profile › Blocking scenario: Trip profile on Trips, Blocking, and Costing; Blocking scenario on Trips, Blocking, and Costing with a blocked basis. Each is a switcher with its choices and lifecycle commands (Trip profile: Rename, Copy, Delete; Blocking scenario: `useBlockingScenarioCommands`, plus Auto-blocking and Export on Blocking). The Trips work-surface menus and the Blocking summary field menu are removed. Route, Day, Direction, and View year follow as today. Row 2 never wraps at 1024 px; the design states the truncation order.
3. Costing: the Cost basis select becomes a Blocked | Estimated choice; the basis is the working Blocking scenario or Trip profile. The per-Scenario basis preference is replaced by a per-Scenario Blocked or Estimated choice.
4. Identity dots on the Scenario, Trip profile, and Blocking scenario switchers when that level has two or more choices, from a hashed token like `blockColorToken`; the name always shows.
5. `src/ui/shared/ContextStamp.tsx`: one line naming the context levels a dialog declares, with the same dots; used as the first line of the dialogs of S2, R1 to R6, T1 to T3, T9, T10, T13, B1 to B7, and in Undo notices.
6. The Trips day line names the Trip profile: "{Trip profile} · Weekday, both directions: …".
7. Side-by-side Trips keeps one shared header; the breadcrumb serves both panes.
8. The blocking-scenario fallback notice (the remembered Blocking scenario of a Trip profile no longer exists) moves here, because the Blocking scenario becomes one working choice.

## 16. FX10: Closeout (Opus)

Update `architecture_overview.md` (Persistence: restore points and Dexie 13; Undo; UI Structure: context line), `docs/data-schema.md` (the two tables, outside backups), `docs/ui-conventions.md` (Undo notice, Undo history, context line, the warning texts), `docs/domain-glossary.md` (restore point), `codex.md` (status), the inventory (status of each gap), and write `docs/implementation/undo-and-context-closeout.md`. Run the full verification of section 6.

## 17. Later packages

- **FX7, staleness by content.** Opus writes the work order after FX10, against the code at that time, in the format of sections 7 and 8. Outline: a Trip's calculation source gains `runtimeInputsSignature` (a fingerprint of the profile's method, bands, and segment runtimes); a Trip is stale when the assigned profile's current signature differs; Trips without a signature keep the revision rule; Dexie 14 gives a current Trip the current signature; backup schema 15 carries the field; Route rebalancing writes the signature where it writes the revision.
- **FX8, trip change history.** Opus writes the work order after FX7. Outline: Regenerate, Change pattern, the start-time edit, and Shift Done record restore points in a separate retention group (newest 10); the Trips menu offers "Undo {last trip change}" for the newest restorable one in view; the `tripRegenerationUndo` table is retired (Decisions 0046 and 0070 amended).
- **FX9, scenario lock.** Decided after FX6 is in use.

## 18. Out of scope

- A keyboard shortcut for Undo (it would collide with text and grid editing).
- Undo for ordinary field edits, draft saves, and additive commands (Build trips, Add trip, New …).
- Restore as a copy of a Scenario (a restore point holds a difference, not a whole Scenario).
- Synchronizing restore points between browsers, or putting them in backups.
