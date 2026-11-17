# Undo, warnings, and working context: work order plan

- Requested by the user on 2026-11-17, after the destructive-actions inventory (`docs/implementation/destructive-actions-inventory.md`). Design recorded in Decision 0081 (`docs/decisions/0081-restore-points-and-working-context.md`), status Proposed.
- Branch: `claude/vibrant-sagan-6v2g57`, unless the user names another. Do not open a pull request unless the user asks.
- **Orchestration: the primary agent** (Opus-class). It owns the architecture, briefs each package from this plan, reviews every diff, and runs the final verification.
- **Structural packages FX1, FX2, FX3, FX5 (and optional FX7, FX8, FX9 structural parts): structural class (Luna).** Recommended models: Sonnet for FX1 and FX2 (transaction handling across every write path), Haiku for FX3 and FX5 (exact specification below). The structural agent follows this plan literally and stops to report when the plan does not say what to do. It does not choose wording, layout, or behaviour beyond what is written here.
- **UI-design packages FX4 and FX6: UI-design class (Sol, Opus).** FX6 starts with mock-ups and a user gate.
- Do not start the next package automatically. At each gate, report the result and recommend the next package and model.

## 1. Summary

The plan has three parts.

1. **Undo by restore points** (FX1, FX2, FX4). Every High-risk deletion or replacement, and every Low-risk deletion whose dialog now says "This cannot be undone", stores a restore point in the same transaction as its write. After the command, the notice area shows what was done, where, and an **Undo** button. The Project menu holds **Undo {last action}** and **Undo history…**. A restore point holds only the rows the command changed, so an older one can be restored as long as those rows are untouched.
2. **Warning fixes** (FX3). The gaps G2 to G17 of the inventory get exact new texts, counts, and button styles. No new confirmation dialog is added.
3. **Working context** (FX5, FX6). The application remembers the Trip profile and Day of each Scenario across reloads and says so when it has to open a different one. The scope bar shows the whole working context, Project › Scenario › Trip profile › Blocking scenario, followed by the tab's Route, Day, and Direction. Costing follows the same Trip profile and Blocking scenario. Dialogs that reach beyond the visible table, and Undo notices, name the context on one line.

### 1.1 How the plan avoids nagging

| Rule | Effect |
| --- | --- |
| N1. No new confirmation dialogs. | The net number of confirmations goes down (section 2, D3). |
| N2. Undo notices are non-modal, need no dismissal, and are replaced by the next notice. | Work is never interrupted by the safety net. |
| N3. Context text appears in three places only: the scope bar (always, passively), dialogs whose effect reaches beyond the visible table, and Undo notices. | No "you are in…" interstitials. |
| N4. Emphasis follows ambiguity. A context level with one choice is plain; with two or more it gets an identity colour dot. | A planner with one Trip profile sees no extra signal. |
| N5. The application reports a context change only when it made the change itself. | A planner's own choices are never echoed back. |

### 1.2 Relation to the Trapeze model

Trapeze makes the planner set a context and shows it in the menu bar. Here the Scenario plays the role of Trapeze's signup period, and the Trip profile and Blocking scenario are the alternatives inside it. Part 3 keeps the existing per-tab selectors, but makes the chain Project › Scenario › Trip profile › Blocking scenario one visible line, the same on every tab that depends on it. Setting the context stays implicit (choosing a value is setting it); the line makes it hard to miss.

## 2. Decisions for the user (Gate 0)

The plan is written for the recommended answer. A different answer changes the packages named.

| ID | Question | Recommended | Packages affected |
| --- | --- | --- | --- |
| D1 | Undo mechanism | Restore points of changed rows (Decision 0081 items 1 to 5) | FX1, FX2, FX4 |
| D2 | Retention | Newest 20, none older than 30 days, at most 50 MB in total | FX1 |
| D3 | Confirmations replaced by the Undo notice | Only three single, visible removals: remove one trip, pull-out, or pull-in from the Current block (inventory B8); delete one deadhead (B11, not "Delete similar"); unassign one trip from its Block pill (T9, single trip). Every other confirmation stays. | FX4 |
| D4 | Backup prompts | Keep "Back up and delete" for project deletion only; add none elsewhere (inventory gap G1 is resolved by restore points) | — |
| D5 | Costing cost basis | Follows the working Trip profile and Blocking scenario, with a Blocked or Estimated choice; choosing on Costing changes the working context for Trips and Blocking | FX6 |
| D6 | Context line | Option A: breadcrumb Project › Scenario › Trip profile › Blocking scenario in the scope bar, each a switcher holding its lifecycle commands; the Trips work-surface menus and the Blocking summary field menu are removed. Option B: keep the placement; do FX5 and the context stamp only. | FX6 |
| D7 | Identity colour dots | Yes, for Scenario, Trip profile, and Blocking scenario, only when that level has two or more choices | FX6 |
| D8 | Optional packages | FX7 (staleness by content): yes. FX8 (trip change history): yes, after FX10. FX9 (scenario lock): decide after using FX6. | FX7, FX8, FX9 |
| D9 | Gaps accepted without change | G14 (save-bar Discard and "Discard new pattern" act at once), G16 (a blank annual count saves 0, a user decision of 2026-10-30), G18 (in-memory undos end on reload). G9 is resolved by FX7; if FX7 is declined, G9 is accepted too. | — |

## 3. Code facts this plan depends on (verified 2026-11-17 on `main` at `33bc716`)

If a fact no longer holds when a package starts, stop and report it.

| Fact | Location |
| --- | --- |
| Dexie is at version 12 (no store change; stop ID migration). The JSON backup schema is 14. | `src/persistence/database.ts:109`, `src/persistence/backup.ts:43` |
| The single-tab write guard is a `dbcore` middleware on every table's `mutate`; schema upgrades are exempt. | `src/persistence/database.ts:127-145` |
| Route, Trip, Costing, and Blocking repositories share one `TransitDatabase` instance. | `src/main.tsx:31`, `:40` |
| `getScenarioRecords(scenarioId)` reads every Scenario-owned collection, including blocking scenarios, blocks, costing assumptions, planned frequencies, and stop sets. | `src/persistence/dexieRepository.ts:81` |
| `updateScenarioRecords` re-reads inside an `rw` transaction and calls `saveScenarioRecords`, which validates, prunes, writes, and invalidates the regeneration undo when trips change. | `src/persistence/dexieRepository.ts:114`, `:124`, `:165`, `:473` |
| `getProjectSnapshot` and `saveProjectSnapshot` read and write a whole project. | `src/persistence/dexieRepository.ts:247`, `:272` |
| `ScenarioRecords` is declared in `src/domain/project.ts`. | `src/domain/project.ts:46` |
| `fingerprint(sets)` is synchronous (cyrb53 over sorted JSON). | `src/application/reviewToken.ts` |
| The Blocking in-memory repository keeps its own maps, separate from the in-memory route repository. | `src/persistence/blockingRepository.ts:26` |
| The one-step regeneration undo: `persistWithUndo`, `regenerationUndoApplies`. | `src/application/tripGenerationService.ts:225`, `src/application/tripsWorkspaceView.ts:29` |
| Trip deletion reads every Block of the service day (all blocking scenarios) and removes revenue activities and their adjacent deadheads through `adjustBlockReferences`. | `src/application/tripGenerationService.ts:565-588`, `src/domain/trips.ts:619` |
| Trip day copy reads every Block of the target day. | `src/application/tripGenerationService.ts:617` |
| `classifyPatternEdit` returns `reset` when retained points change order or no saved point is retained. | `src/domain/safeRouteEditing.ts:198` |
| Deadhead counts for Trips-tab assignment dialogs come from `tripBlockAssignmentImpact` and `tripBlockUnassignmentImpact`. | `src/application/tripsWorkspaceView.ts:186`, `:196` |
| The stored selection keeps only `projectId`, `scenarioId`, `routeId`. Day, Direction, and Trip profile are kept in a session-only ref (`lastViewed`), and the Trip profile falls back to the first one after a reload. | `src/ui/App.tsx:30-39`, `:92`, `:105-123` |
| The Costing cost basis is a per-Scenario device preference. | `src/ui/costing/CostingWorkspace.tsx:108-124` |
| Confirmation texts: project, scenario, route, pattern, Trip profile deletion. | `src/ui/App.tsx:140-246` |
| Route edit review dialog (reset, rebalance, nodes). | `src/ui/route/RouteWorkspace.tsx:306-324` |
| Trips dialogs: `DeleteRuntimeProfileDialog`, `DeleteTripsDialog`, `TripDayCopyDialog`. | `src/ui/trips/dialogs.tsx:132`, `:237`, `:299-306` |
| Blocking confirmations and `ReassignDialog`, `ActivityDialog`. | `src/ui/blocking/BlockingWorkspace.tsx:554-560`, `:705`, `:710-740` |
| Auto-blocking rebuild warning. | `src/ui/blocking/AutoBlockingDialog.tsx:345` |

## 4. Restore point rules

### 4.1 Types (FX1, `src/domain/types.ts`)

```ts
export type RestorePointKind =
  | 'deleteProject' | 'deleteScenario' | 'deleteRoute' | 'deletePattern' | 'resetPatternService' | 'rebalancePattern' | 'deleteNodes'
  | 'deleteTrips' | 'copyTripsFromDay' | 'deleteTripProfile' | 'deleteRuntimeProfile' | 'unassignTrips' | 'moveTripsToBlock'
  | 'deleteBlockingScenario' | 'deleteBlocks' | 'copyBlocksFromDay' | 'rebuildAutoBlocks' | 'replaceBoundaryActivities'
  | 'removeBlockActivity' | 'deleteDeadheads' | 'clearPlan' | 'copyPlanFromDay' | 'copyPlansFromScenario' | 'restore';

export interface RestorePointContext {
  projectName: string; scenarioName: string;
  routeName?: string; tripProfileName?: string; blockingScenarioName?: string; serviceDayName?: string; directionName?: string;
}

/** One collection of `ScenarioRecords` ('scenario' and 'costingAssumptions' are single records, treated as lists of 0 or 1). */
export type RecordCollection = 'scenario' | 'serviceDays' | 'routes' | 'nodes' | 'patterns' | 'directions' | 'runtimeProfiles'
  | 'runtimeAssignments' | 'tripProfiles' | 'blockingScenarios' | 'costingAssumptions' | 'generationSets' | 'trips' | 'blocks'
  | 'plannedFrequencies' | 'routeStopSets';

export interface RecordChange {
  removed: Partial<Record<RecordCollection, { id: string }[]>>;        // full rows the command deleted
  changedBefore: Partial<Record<RecordCollection, { id: string }[]>>;  // full previous rows the command changed
  writtenStamps: Partial<Record<RecordCollection, Record<string, string>>>; // id → fingerprint after the command, for changed and added rows
  added: Partial<Record<RecordCollection, string[]>>;                  // ids the command created
}

export interface RestorePoint {
  id: string; kind: RestorePointKind; scope: 'scenario' | 'project';
  projectId: string; scenarioId?: string; createdAt: string;
  context: RestorePointContext;
  parameters: Record<string, string | number>; // counts and names for the label, e.g. { trips: 12 } or { pattern: 'NB Evans–Wagon Rd' }
  change?: RecordChange;             // scope 'scenario'
  projectSnapshot?: ProjectSnapshot; // scope 'project' (deleteProject only)
  sizeEstimate: number;              // JSON length of change or projectSnapshot at capture
}
```

`RestorePoint` is not part of `ProjectSnapshot`, `DatabaseRecordMap`'s backup collections, or any backup or copy path.

### 4.2 Pure functions (FX1, new `src/domain/restorePoints.ts`)

1. `diffScenarioRecords(before: ScenarioRecords, after: ScenarioRecords | undefined): RecordChange`. Rows are matched by `id` per collection. A row present before and absent after is removed. A row absent before and present after is added. A row in both whose `JSON.stringify` differs is changed. `after` undefined (the Scenario was deleted) makes every row removed. Stamps use `fingerprint({ row })`.
2. `isEmptyChange(change): boolean`. True when nothing was removed, changed, or added. An empty change stores no restore point.
3. `planRestore(current: ScenarioRecords | undefined, change: RecordChange, scenarioId: string): { next?: ScenarioRecords; conflicts: RestoreConflict[] }` with `RestoreConflict = { collection: RecordCollection; id: string; reason: 'changedSince' | 'recreated' | 'scenarioMissing' | 'scenarioExists' }`.
   - A changed or added row whose current fingerprint differs from its stamp is `changedSince`. An added row that no longer exists is not a conflict.
   - A removed row whose id exists in `current` is `recreated`.
   - `current` undefined and the change does not remove the `scenario` row: `scenarioMissing`. `current` defined and the change removes the `scenario` row (a Scenario deletion being restored while the Scenario exists): `scenarioExists`.
   - With no conflict, `next` is `current` (or an empty Scenario shell when the change removed the Scenario) minus the added ids, with the `changedBefore` rows and `removed` rows put back. Optional collections that end up empty are omitted, as `getScenarioRecords` omits them.
4. `restorePointsToPrune(points: Pick<RestorePoint, 'id' | 'createdAt' | 'sizeEstimate'>[], now: string, policy = { maxCount: 20, maxAgeDays: 30, maxTotalSize: 50_000_000 }): string[]`. Drops points older than `maxAgeDays`, then the oldest until at most `maxCount` remain and the sum of `sizeEstimate` is within `maxTotalSize`. The newest point is never dropped.

### 4.3 Persistence (FX1)

1. **Dexie version 13** adds `restorePoints: 'id,projectId,createdAt'`. No upgrade function. Add a `database.test.ts` case: a version 12 database upgrades with its data unchanged and an empty `restorePoints` table.
2. **Recorder port** (`src/application/ports.ts`):

   ```ts
   export interface RestorePointRecorder {
     /** Runs `write` and stores a restore point of the Scenario's change, in one transaction. Returns `write`'s result. */
     recordScenarioChange<T>(request: { kind: RestorePointKind; scenarioId: string; contextIds: { routeId?: string; tripProfileId?: string; blockingScenarioId?: string; serviceDayId?: string; directionId?: string }; parameters: Record<string, string | number> }, write: () => Promise<T>): Promise<T>;
     /** The same for a project deletion: the whole project snapshot is stored. */
     recordProjectDeletion<T>(request: { projectId: string }, write: () => Promise<T>): Promise<T>;
   }
   export interface RestorePointStore {
     listRestorePoints(): Promise<RestorePoint[]>;     // newest first
     getRestorePoint(id: string): Promise<RestorePoint | undefined>;
     deleteRestorePoint(id: string): Promise<void>;
   }
   ```

3. **`DexieRestorePointRecorder`** (new `src/persistence/restorePointPersistence.ts`). `recordScenarioChange` opens `db.transaction('rw', db.tables, …)`: reads `before` with the repository's `getScenarioRecords`, awaits `write()`, reads `after`, resolves the context names from `before` (from `after` when `before` lacks them), builds the point, stores it unless the change is empty, then deletes the ids that `restorePointsToPrune` returns. `recordProjectDeletion` reads `getProjectSnapshot` before the write and stores it with `scope: 'project'`.
4. **Transaction check (first task of FX1).** Write `restorePointPersistence.test.ts` with one case before anything else: a `recordScenarioChange` whose `write` calls `repository.updateScenarioRecords` and a `DexieBlockingRepository` write, then throws; assert that neither write nor a restore point is stored. A second case without the throw asserts that all three are stored. If Dexie does not join the inner transactions to the outer one, stop and report; do not work around it.
5. **Storage full.** When the transaction fails with a quota error, the recorder deletes all but the newest 5 restore points in a separate transaction and runs the whole transaction once more. A second failure is thrown unchanged (the existing "Browser storage is full" message applies).
6. **In-memory and tests.** `PassThroughRestorePointRecorder` (in the same file) runs `write` and stores nothing. Every existing service test keeps using in-memory repositories and the pass-through recorder; restore behaviour is tested on Dexie (`fake-indexeddb`).

### 4.4 Application (FX2)

1. **Coverage.** Each command below calls the recorder around its existing write, with the kind and parameters shown. Its preview, review token, and validation are unchanged and run inside `write`.

   | Inventory | Service method | Kind | Parameters |
   | --- | --- | --- | --- |
   | S1 | `RouteDefinitionService.deleteProject` | `deleteProject` (project scope) | `project` |
   | S2 | `deleteScenario` | `deleteScenario` | `scenario` |
   | R1 | `deleteRoute` | `deleteRoute` | `route` |
   | R2 | `deletePattern` | `deletePattern` | `pattern` |
   | R3, R4 | `commitPatternChange` when the mode is `reset`, or the preview has removed or node-changed points | `resetPatternService` / `rebalancePattern` | `pattern` |
   | R6 | `commitNodeChanges` with deleted nodes | `deleteNodes` | `nodes` (count) |
   | T1 | `TripGenerationService.deleteTrips` | `deleteTrips` | `trips` |
   | T2 | `applyTripCopy` | `copyTripsFromDay` | `source`, `target` (day names) |
   | T3 | `deleteTripProfile` | `deleteTripProfile` | `tripProfile` |
   | T13 | `RouteDefinitionService.deleteRuntimeProfile` | `deleteRuntimeProfile` | `runtimeProfile` |
   | T9, B8, B9 | `BlockingApplicationService.removeTrip`, `removeTrips` | `unassignTrips` | `trips`, `block` |
   | B8 | new `removeBoundaryActivity(blockingScenarioId, blockId, activityId, sourceSignature)` (today the screen filters the activity out and calls `updateBlock`) | `removeBlockActivity` | `activity` ('pull-out' or 'pull-in'), `block` |
   | T10, B10 | `assignTripsToBlock` when a trip leaves another block, `reassignTrips` | `moveTripsToBlock` | `trips`, `block` |
   | B1 | `deleteBlockingScenario` | `deleteBlockingScenario` | `blockingScenario` |
   | B2, B3, B4 | `deleteBlocks`, `deleteBlock` | `deleteBlocks` | `blocks` |
   | B5 | `applyBlockingDayCopy` | `copyBlocksFromDay` | `source`, `target` |
   | B6 | `createAutoBlockingScenario` with `replaceBlockingScenarioId` | `rebuildAutoBlocks` | `blockingScenario`, `days` |
   | B7 | `applyBulkBoundaryActivities` | `replaceBoundaryActivities` | `activity` ('pull-out' or 'pull-in'), `blocks` |
   | B11 | new `removeDeadheads(blockingScenarioId, blockId, activityIds, sourceSignature)` (today the screen filters and calls `updateBlock`) | `deleteDeadheads` | `deadheads` |

   `updateBlock` itself (rename, notes) is not recorded. FX3 switches `removeActivity` and `removeDeadhead` in `BlockingWorkspace.tsx` to the two new methods; it changes nothing else in those functions.
   | R12 | `PlannedFrequencyService.clearPlan` | `clearPlan` | `day` |
   | R13 | `applyCopyFromDay` | `copyPlanFromDay` | `day` |
   | R14 | `applyCopyFromScenario` | `copyPlansFromScenario` | `scenario` |

   Each service receives the recorder through its constructor (defaulting to the pass-through recorder) and `src/main.tsx` passes the Dexie one. If a command's write cannot run inside the recorder (the FX1 check passes but a command still fails), stop and report that command.
2. **`RestorePointService`** (new `src/application/restorePointService.ts`), exposed to the UI through a `RestorePointCommands & RestorePointQueries` port:
   - `listRestorePoints(): Promise<RestorePointSummary[]>`, newest first, each `{ id, kind, scope, projectId, scenarioId, createdAt, context, parameters, status }` with `status` `{ kind: 'restorable' } | { kind: 'conflict'; conflicts: { collection; name: string }[] } | { kind: 'projectMissing' } | { kind: 'projectExists' }`. Conflict names come from the stored rows (`name`, `label`, or the trip's first departure and day); at most 3 are listed, plus a count of the rest.
   - `latestRestorePoint(projectId?: string): Promise<RestorePointSummary | undefined>`: the newest restorable point of that project, or of any project when no project is open.
   - `restore(id: string): Promise<{ projectId: string; scenarioId?: string }>`: re-checks the status inside the transaction, then writes `planRestore`'s `next` through `updateScenarioRecords` (or `saveScenarioRecords` when the Scenario was deleted, or `saveProjectSnapshot` when the project was deleted), recorded as kind `restore` with `parameters.of` = the restored point's kind. Refused with `RestoreConflictError` (with the conflicts) when the status is not `restorable`. After a successful restore the restored point is deleted.
   - A restore clears the in-memory segment, distance, and stop-copy undos, as other writes do.
3. **Impact fields for FX3** (the dialog text needs them):
   - `previewTripDeletion` and `previewTripCopy` add `removedDeadheadCount` and `affectedBlockingScenarios: { blockingScenarioId: string; name: string; blockCount: number }[]`. `adjustBlockReferences` returns `removedDeadheadCount`.
   - `getRouteDeletionImpact` adds `routeEstimateFactorCount` (entries of `routeEstimateFactors` for the Route).
   - `previewTripProfileDeletion` adds `estimateFactorEntryCount` (the Trip profile's entry, plus its Route entries).
   - `BlockingApplicationService.previewDeadheadToMatchingConnections(request)` returns `{ appliedCount, replacedCount }` without writing.
   - `previewAutoBlocking` with `replaceBlockingScenarioId` adds `replacedBlockCount` to each day row.
4. **Tests** (`restorePointService.test.ts`, Dexie on `fake-indexeddb`, trimmed fixture from the contract file): for every row of the coverage table, run the command, restore, and assert that `getScenarioRecords` (or `getProjectSnapshot`) equals the state before the command, ignoring nothing. Also: a conflict after editing a written row; an older point restored after a newer unrelated one; restore of a restore; pruning by count, age, and size; a failing command stores no point; the restore point table is absent from an exported backup.

## 5. Package overview

| Package | Title | Class (model) | Depends on | Owns |
| --- | --- | --- | --- | --- |
| FX0 | Decision 0081 (Proposed) and this plan | Primary agent | inventory | `docs/decisions/0081-…`, this file (done 2026-11-17) |
| Gate 0 | User answers D1 to D9 | — | FX0 | — |
| FX1 | Restore point domain and persistence, Dexie 13 | Structural (Sonnet) | Gate 0 | `src/domain/types.ts`, `src/domain/restorePoints.ts`, `src/persistence/database.ts`, `src/persistence/restorePointPersistence.ts`, `src/application/ports.ts` (+ tests) |
| FX2 | Recorder in every covered command; restore service; impact fields | Structural (Sonnet) | FX1 | `src/application/*Service.ts`, `src/application/restorePointService.ts`, `src/application/tripsWorkspaceView.ts`, `src/domain/trips.ts` (`adjustBlockReferences` count only), `src/main.tsx` (+ tests) |
| Gate A | User review of the undo rules with the primary agent's demonstration (a scripted delete → undo on the golden project) | — | FX2 | — |
| FX3 | Warning text, counts, and button fixes | Structural (Haiku, exact text in section 8) | FX2 | the dialog files named in section 8, `src/ui/shared/messages.ts`, browser specs |
| FX4 | Undo notice, Project-menu Undo, Undo history dialog; confirmations of D3 removed; "cannot be undone" removed from covered dialogs | UI design (Opus) | FX3 | `src/ui/App.tsx`, `src/ui/shell/`, new `src/ui/shell/UndoHistoryDialog.tsx`, the covered dialogs (text only), `src/ui/styles/shell.css`, specs |
| Gate B | User review of the undo interface | — | FX4 | — |
| FX5 | Working context remembered across reloads; fallback notices; window title | Structural (Haiku, exact spec in section 10) | Gate 0 (independent of FX1–FX4) | `src/ui/App.tsx` (selection state only), `src/ui/preferences.ts`, specs |
| FX6 | Context line, context stamp, identity dots, Costing basis follows context | UI design (Opus): mock-ups → Gate C → build | FX4, FX5 | `src/ui/shell/`, `src/ui/App.tsx`, `src/ui/trips/TripsWorkspace.tsx` (header menus), `src/ui/blocking/BlockingWorkspace.tsx` (summary field menu), `src/ui/costing/CostingWorkspace.tsx` (basis), `src/ui/shared/` (ContextStamp), styles, specs |
| FX10 | Documentation and closeout, full verification | Primary agent | all chosen | `architecture_overview.md`, `docs/data-schema.md`, `docs/ui-conventions.md`, `docs/domain-glossary.md`, `codex.md`, the inventory, closeout file |
| FX7 (optional) | Run-time staleness by content | Structural (Sonnet) | FX10 or after FX2 | domain trips/runtime, persistence (Dexie 14, backup 15) |
| FX8 (optional) | Trip change history replaces the regeneration undo slot | Structural (Sonnet) + UI (Opus) | FX4 | trips service, Trips menu, `tripRegenerationUndo` retirement |
| FX9 (optional) | Scenario lock | Structural + UI | FX6 | to be planned when chosen |

Order: Gate 0 → FX1 → FX2 → Gate A → FX3 → FX4 → Gate B → FX6 (mock-ups, Gate C, build) → FX10. FX5 may run at any point after Gate 0 and before FX6.

## 6. Instructions that apply to every package

- Read first: `AGENTS.md`, `codex.md`, `architecture_overview.md`, Decision 0081, the inventory, this plan, and the files the package owns.
- Keep domain code free of React and IndexedDB. `src/ui` imports nothing from `src/persistence`.
- Edit files with the file-edit tool, not shell redirection or `sed`.
- Change only the files the package owns. If a change is needed elsewhere, stop and report it.
- Existing tests that prove unchanged behaviour must pass without edits, except the assertions this plan names (dialog texts in FX3 and FX4, the Dexie version in FX1).
- Commit messages begin with the package ID, for example `FX1: Restore point domain and persistence, Dexie 13 (Decision 0081)`, and end with `Verified:` lines naming what was skipped and why.

## 7. Verification per package

Browser commands in a Claude Code cloud session use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` and `--trace off`. Two golden-project specs in `segment-runtime-fill.spec.ts` need four workers or fewer (`codex.md`, 2026-11-11). While working, run only the test file being written; run `pnpm test` in full once at the end of each code package.

| Package | Run | Skip | Do not cut |
| --- | --- | --- | --- |
| FX0 | Proofread; cross-check names against the code facts | All tests (documentation only) | — |
| FX1 | `pnpm typecheck`; `restorePoints.test.ts`, `restorePointPersistence.test.ts`, `database.test.ts`, `repositoryContract.test.ts`; `pnpm test`; `pnpm build`; full browser suite (Dexie version changes app startup) | Visual tour | `database.test.ts` (versions 1 to 12 upgrade); `backup*.test.ts`; the transaction check of 4.3 item 4 |
| FX2 | `pnpm typecheck`; `restorePointService.test.ts` and every changed service test; `pnpm test`; `pnpm build`; full browser suite (writes in every area change) | Visual tour | Every existing service, deletion, copy, and contract test; `deletion-reviews`, `data-safety`, `blocking-day-copy`, `automatic-blocking`, `blocking-bulk-delete`, `planned-frequencies`, `single-tab` |
| Gate A | Primary agent reruns `pnpm typecheck`, `pnpm test` | — | — |
| FX3 | `pnpm typecheck`; `pnpm test`; specs `deletion-reviews`, `impact-dialogs`, `route-editing`, `pattern-discard-save`, `trip-profile`, `service-day-copy-layout`, `trips-blocking-scenario-menu`, `blocking-workspace`, `blocking-rules`, `blocking-day-copy`, `automatic-blocking`, `keyboard`; `pnpm build`; screenshots of each changed dialog | Costing specs; full suite (FX10) | `deletion-reviews`, `impact-dialogs`, `keyboard` |
| FX4 | `pnpm typecheck`; `pnpm test`; new `undo-history.spec.ts`; full browser suite (header and every covered dialog change); `pnpm build`; screenshots at 1024, 1440, 390 px | — | `keyboard` (axe run includes the Undo history dialog and the notice) |
| FX5 | `pnpm typecheck`; `pnpm test` (`preferences.test.ts`); new `working-context.spec.ts`; full browser suite (app startup changes) | Visual tour | `drafts-and-preferences`, `app-shell`, `onboarding`, `blocking-defaults` |
| FX6 | Mock-ups first (Gate C). Then `pnpm typecheck`; `pnpm test`; new `context-line.spec.ts`; full browser suite; visual tour (`UI_TOUR=1`); `pnpm build`; screenshots light and dark at 1024, 1280, 1440 px | — | `keyboard`, `app-shell`, `scope-toggles`, `costing-estimated`, `costing-workspace`, `trips-blocking-scenario-menu`, `side-by-side-trips` |
| FX10 | Everything: typecheck, unit suite, build, full browser suite, visual tour, a backup round trip | Nothing | The whole run |

## 8. FX3: Warning fixes (exact specification)

Plural forms follow the existing `plural` helpers. `{…}` marks a value. A sentence whose count is 0 is left out.

| Gap | Where | Change |
| --- | --- | --- |
| G2 | `RouteEditImpactDialog`, mode `reset` | Title: "Remove this pattern's service?". Body: "Saving the new point order removes this pattern's {N runtime profiles} and {N trips}, and removes those trips from {N blocks}. Other patterns are not changed." Confirm button (danger): "Remove service and save". |
| G2 | `PatternEditor`, below the points grid | While `classifyPatternEdit(savedPattern, pattern) === 'reset'` and the saved pattern has trips or runtime profiles (counts from the aggregate are not available; use `isUsablePattern(savedPattern)` as the condition), show `<InlineNote kind="warn">New point order: saving removes this pattern's trips and runtimes.</InlineNote>` above the save bar. |
| G3 | `RouteEditImpactDialog`, pattern rebalance with removed or node-changed points | Add one line per removed or changed point: "Removing {node name} merges its two runtime segments in {N runtime profiles} and removes its time from {N trips}." Confirm button becomes danger "Save and merge". Without removed or changed points the dialog is unchanged. |
| G3, G4 | `RouteEditImpactDialog`, kind `nodes` | Add: "Removing {node names} merges runtime segments in {N runtime profiles} and removes their times from {N trips}." Confirm button becomes danger (label unchanged). |
| G5 | `TripDayCopyDialog` | When `targetTripsReplaced > 0` the apply button is danger and reads "Replace trips". Add under the impact figures: "Removes trips from blocks in: {Default (3 blocks), Auto 2 (4 blocks)}." from `affectedBlockingScenarios`. |
| G6 | `DeleteTripsDialog` | Body: "Removes them from {N blocks} with {N adjacent deadheads}, in: {Default (3), Auto 2 (4)}." when blocks are affected; otherwise "These trips are not assigned to a block." "This cannot be undone." stays until FX4. |
| G7 | Route deletion (`App.tsx`) | Add to the affected list: "estimate factors for this route" when `routeEstimateFactorCount > 0`. |
| G7 | Trip profile deletion (`App.tsx`) | Add: "Also deletes its costing estimate factors." when `estimateFactorEntryCount > 0`. |
| G10 | `ReassignDialog` (Blocking) | Add the sentence the Trips dialog uses: "{N} adjacent deadhead activities will be removed." from `tripBlockAssignmentImpact`. |
| G11 | `ActivityDialog`, deadhead | The checkbox label reads "Apply to all similar trips in this block ({N} connections, {M} replaced)" from `previewDeadheadToMatchingConnections`, refreshed when From or To changes; "{M} replaced" is left out at 0. |
| G12 | `AutoBlockingDialog`, rebuild | The preview table gains a "Replaces" column (blocks replaced on that day) while rebuilding. The existing edited-blocks warning stays. |
| G15 | `DeleteRuntimeProfileDialog` | The Delete button uses `danger` instead of `subtle-danger`. |
| — | `BlockingWorkspace.tsx` `removeActivity`, `removeDeadhead` | Call `removeBoundaryActivity` and `removeDeadheads` (FX2) instead of `updateBlock`. No visible change. |
| G17 | `AutoBlockingDialog` | When the dialog closes without creating, its values are kept in memory per Trip profile and shown the next time it opens in the same session; a successful create or rebuild clears them; a page reload clears them. (The Build trips drawer works the same way.) |

## 9. FX4: Undo interface (UI design requirements)

1. **After every covered command** the notice area shows a success notice: "{label} · {context stamp}" and an **Undo** button. The label comes from `restorePointLabel(kind, parameters)` in `src/ui/shared/messages.ts`:

   | Kind | Label |
   | --- | --- |
   | deleteProject | Deleted project {project} |
   | deleteScenario | Deleted scenario {scenario} |
   | deleteRoute | Deleted route {route} |
   | deletePattern | Deleted pattern {pattern} |
   | resetPatternService | Removed the service of pattern {pattern} |
   | rebalancePattern | Saved pattern {pattern} and merged runtimes |
   | deleteNodes | Deleted {N nodes} |
   | deleteTrips | Deleted {N trips} |
   | copyTripsFromDay | Copied {source} trips to {target} |
   | deleteTripProfile | Deleted trip profile {tripProfile} |
   | deleteRuntimeProfile | Deleted runtime profile {runtimeProfile} |
   | unassignTrips | Unassigned {N trips} |
   | moveTripsToBlock | Moved {N trips} to {block} |
   | deleteBlockingScenario | Deleted blocking scenario {blockingScenario} |
   | deleteBlocks | Deleted {N blocks} |
   | copyBlocksFromDay | Copied {source} blocks to {target} |
   | rebuildAutoBlocks | Rebuilt the blocks of {blockingScenario} |
   | replaceBoundaryActivities | Updated {activity}s in {N blocks} |
   | removeBlockActivity | Removed {activity} from {block} |
   | deleteDeadheads | Deleted {N deadheads} |
   | clearPlan | Cleared the {day} plan |
   | copyPlanFromDay | Copied a plan to {day} |
   | copyPlansFromScenario | Copied plans from {scenario} |
   | restore | Undid: {label of the restored point} |

2. The notice is non-modal, keeps its place, is announced by its existing `role="status"`, and does not take focus. It stays until dismissed, replaced, or the Project or Scenario changes.
3. **Project menu**, group "Project data": **Undo {label}** (the newest restorable point of the open project, absent when none) and **Undo history…**.
4. **Undo history dialog**: newest first; each row shows the label, the context stamp, the age, and either **Restore** or the reason it cannot be restored ("Changed since: Trip 7:15 Weekday, Block 12, and 3 more", "The project no longer exists"). Deleted projects appear in the list and restore as a project.
5. **No project open**: the empty state adds **Restore deleted project…** when a deleted-project point exists.
6. After a restore the workspace reloads the restored Project, Scenario, and Route; a missing Route falls back as today.
7. The three confirmations of D3 are removed; their commands write at once and show the notice.
8. "This cannot be undone." is removed from every covered dialog. Project deletion keeps its backup check.
9. Keyboard and accessibility: Undo reachable by Tab from the notice; the dialog follows `ModalDialog`; the axe run in `keyboard.spec.ts` includes the dialog and a notice with Undo.

## 10. FX5: Working context memory (exact specification)

1. New preference `transit-costing-tool.working-context.v1` in `src/ui/preferences.ts`: `{ scenarios: { [scenarioId]: { tripProfileId?: string; serviceDayId?: string } }, routes: { [routeId]: { directionId?: string } } }`, read field by field like the other stored preferences (a value of the wrong shape reads as not stored).
2. `App.tsx` writes it whenever the Trip profile, Day, or Direction changes, and reads it where the session-only `lastViewed` ref is read today; the ref is removed. The fallback order is unchanged: stored value, then the first entry.
3. **Fallback notice.** When a stored Trip profile id for the open Scenario does not exist at load, the notice area shows the info notice "The trip profile open last time is no longer in this scenario. {Name} is open." The same for a Blocking scenario remembered for the open Trip profile: "The blocking scenario open last time is no longer in this trip profile. {Name} is open." No notice when the planner's own deletion caused the change in this tab.
4. **Window title.** `document.title` is "{route short name or name} · {trip profile} · {scenario} — Transit Costing Tool" on Trips and Blocking, "{route} · {scenario} — Transit Costing Tool" on Route, "Costing · {scenario} — Transit Costing Tool" on Costing, and "Transit Costing Tool" with no project.
5. Spec `working-context.spec.ts`: choose a second Trip profile and Saturday, reload, both are restored; delete the remembered Trip profile in a second browser context's storage state, reload, the notice shows once.

## 11. FX6: Context line (UI design requirements)

1. Mock-ups of the scope bar for each tab at 1024, 1280, and 1440 px, light and dark, with one and with several Trip profiles and Blocking scenarios, go to the user (Gate C) before any code.
2. **Breadcrumb** (D6 option A): Project › Scenario › Trip profile › Blocking scenario. Trip profile shows on Trips, Blocking, and Costing; Blocking scenario on Trips, Blocking, and Costing (blocked basis). Each is a switcher with its choices and lifecycle commands (the Trip profile menu's Rename, Copy, Delete; the Blocking scenario commands of `useBlockingScenarioCommands`, plus Auto-blocking and Export on Blocking). The Trips work-surface menus and the Blocking summary field menu are removed. Route, Day, Direction (and View year on Costing) follow as today. Row 2 never wraps at 1024 px; the design states the truncation order.
3. **Costing** (D5): the Cost basis select is replaced by a Blocked | Estimated choice; the basis is the working Blocking scenario or Trip profile. The per-Scenario basis preference is removed; a stored "estimated" choice is kept per Scenario.
4. **Identity dots** (D7) on the Scenario, Trip profile, and Blocking scenario switchers when that level has two or more choices, from a hashed token like `blockColorToken`; the name is always shown with it.
5. **Context stamp** component (`src/ui/shared/ContextStamp.tsx`): one line, the context levels a dialog declares, with the same dots. Used as the first line of the dialogs of S2, R1 to R6, T1 to T3, T9, T10, T13, B1 to B7, and in Undo notices.
6. The Trips day line under the table names the Trip profile: "{Trip profile} · Weekday, both directions: …".
7. Side-by-side Trips keeps one shared header; the breadcrumb serves both panes.

## 12. Optional packages (planned in outline; each needs its own go-ahead)

- **FX7, staleness by content.** A Trip's calculation source gains `runtimeInputsSignature` (a fingerprint of the profile's method, bands, and segment runtimes). A Trip is stale when the assigned profile's current signature differs; Trips without a signature keep the revision rule. Dexie 14 upgrade: a Trip whose revision equals its profile's current revision gets the current signature. Backup schema 15 carries the field; schema 14 files import with no signature. Route rebalancing writes the new signature where it writes the revision today. Effect: reverting runtime values or the method clears "Run times changed" (inventory T11, T12, gap G9).
- **FX8, trip change history.** Regenerate, Change pattern, the start-time edit, and Shift Done record restore points of a trip kind, kept in a separate retention group (newest 10) so they do not push out deletions. The Trips menu shows "Undo {last trip change}" for the newest restorable one in the current view and the Undo history lists all. The `tripRegenerationUndo` table is retired (Decisions 0046 and 0070 amended). Effect: gaps G8 and inventory T7, T8.
- **FX9, scenario lock.** A Scenario field `locked`; writes to a locked Scenario are refused with "Scenario {name} is locked. Unlock it in the Scenario menu, or duplicate it."; the breadcrumb shows a lock. Backup schema bump. Decide after FX6 is in use.

## 13. Out of scope

- A keyboard shortcut for Undo (Ctrl+Z would collide with text and grid editing).
- Undo for ordinary field edits, saves of drafts, and additive commands (Build trips, Add trip, New …).
- Restore as a copy of a Scenario (a restore point holds a difference, not a full Scenario).
- Synchronizing restore points between browsers or including them in backups.
