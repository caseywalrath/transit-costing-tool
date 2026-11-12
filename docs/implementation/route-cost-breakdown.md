# Per-Route Cost Breakdown and Route Estimate Factors: Implementation Plan

- Decision: `docs/decisions/0076-per-route-cost-breakdown-and-factors.md` (governs where this plan is unclear)
- Backlog entry: `docs/backlog.md`, "Per-route cost breakdown and factors"
- Status: Planned 2026-11-12. RC0 done. RC1 not started.

## Roles

- **Orchestrator (Opus).** Owns architecture, integration review, cross-layer consistency, the UI-design package (RC4), every review gate, and the closeout (RC6). Reviews each Haiku package's diff against this plan before the user gate.
- **Structural agent (Haiku).** Implements RC1, RC2, RC3 and RC5 exactly as written. It makes no visual, layout, interaction or wording decisions. When the code differs from what a step names (a function moved, a signature changed), it stops and reports instead of adapting.
- This maps the classes in `AGENTS.md`: Haiku stands in for the structural class (Luna), Opus for the UI-design class (Sol) and the primary agent.

## Package overview

| Package | Title | Agent | Depends on | Owns |
| --- | --- | --- | --- | --- |
| RC0 | Decision record and plan | Opus | none | Decision 0076, this plan, backlog entry |
| RC1 | Domain: route factor types and resolution | Haiku | RC0 | `src/domain/types.ts`, `src/domain/estimatedCosting.ts`, `src/domain/costing.ts` (validation only), `src/domain/routeEstimateFactors.test.ts` (new) |
| RC2 | Domain: costing grouped by Route | Haiku | RC1 | `src/domain/routeCosting.ts` (new, + test), `src/domain/estimatedCosting.ts`, `src/domain/costing.ts`, `src/application/costingContext.ts` |
| RC3 | Persistence, backup, lifecycle, service | Haiku, Opus review | RC1 | `src/persistence/backup.ts`, `src/persistence/dexieRepository.ts`, `src/persistence/inMemoryRepository.ts`, `src/domain/project.ts`, `src/application/costingService.ts`, `src/application/ports.ts`, `src/main.tsx` (wiring only) |
| RC4 | Costing screen: Route table and factor Route selector | Opus | RC2, RC3 | `src/ui/costing/CostingWorkspace.tsx`, `src/ui/costing/RouteCostTable.tsx` (new), `src/ui/costing/EstimateFactorsGrid.tsx`, `src/ui/costing/costBreakdownText.ts` (row model only), `src/ui/styles/costing.css`, Costing browser specs |
| RC5 | Cost Summary, CSV report, copied text | Haiku | RC4 | `src/domain/costSummary.ts`, `src/ui/costing/CostSummaryView.tsx`, `src/persistence/csv.ts`, `src/ui/costing/costBreakdownText.ts` (`costBreakdownText` only) |
| RC6 | Documentation, closeout, full verification | Opus | all | `architecture_overview.md`, `docs/data-schema.md`, `docs/domain-glossary.md`, `docs/backlog.md`, `docs/implementation/route-cost-breakdown-closeout.md` (new) |

Order: RC1 → RC2 and RC3 (any order) → RC4 → RC5 → RC6. Each package ends at a user gate. The orchestrator reports, recommends the next package, and does not start it.

## Instructions that apply to every package

- Read first: `AGENTS.md`, `codex.md`, `architecture_overview.md`, `docs/data-schema.md`, `docs/ui-conventions.md`, Decisions 0051, 0062 and 0076, and this plan.
- Read every file a step names before editing it. Line numbers in this plan are from 2026-11-12 and are hints only; find code by the function or type name.
- Keep domain code free of React and IndexedDB. Store inputs only; Route rows, totals and shares are derived and never stored.
- Edit files with the file-edit tool, not shell scripts.
- Do not change files another package owns. If a step needs a change elsewhere, stop and report it.
- Keep existing behaviour unchanged when no Route factors exist (Decision 0076 item 3.5). Existing tests must pass without edits, except where a step names the test to change.
- Commit at the end of each package with `Verified:` lines naming what ran and what was skipped and why.

## Verification per package

The unit suite is fast: run it in full once at the end of every code package. While working, run only the test file being written. Report summaries and failures only.

| Package | Run | Skip | Do not cut |
| --- | --- | --- | --- |
| RC0 | Proofread; cross-check names against `src/domain/types.ts`, `src/domain/estimatedCosting.ts`, `src/domain/costing.ts` | All tests | — |
| RC1 | `pnpm typecheck`; new test file; full unit suite | Browser tests, build (no UI or persistence change) | `src/domain/estimatedCosting.test.ts`, `src/domain/tripProfileEstimateFactors.test.ts`, `src/domain/costing.test.ts` unchanged and passing |
| RC2 | `pnpm typecheck`; new test file; full unit suite | Browser tests, build (no UI change) | `estimatedCosting.test.ts`, `costing.test.ts`, `costingContext.test.ts`, `costingService.test.ts` unchanged and passing (proves totals unchanged) |
| RC3 | `pnpm typecheck`; full unit suite; browser: `backup-import`, `database-migration`, `scenario-copy-recovery`, `deletion-reviews`, `data-safety`, `automatic-blocking-backup`, `trip-profile`, `costing-trip-profile-factors` | Other browser tests, build | Every persistence, backup and migration test; an exact v12 backup round trip; a v11 file import test |
| RC4 | `pnpm typecheck`; full unit suite; browser: all six `costing-*.spec.ts`, `app-shell`, `keyboard`; `pnpm build`; screenshots at desktop and phone width, light and dark | Route, Trips, Blocking browser specs | Column-position test (RC4 acceptance 3) |
| RC5 | `pnpm typecheck`; full unit suite; browser: `costing-summary`, `costing-copy-table` | Other browser tests, build | `csv.test.ts`, `costSummary.test.ts`, `costBreakdownText.test.ts` |
| RC6 | Typecheck, full unit suite, full browser suite, build, screenshots, backup round trip | Nothing | The whole run |

If a skipped area turns out to be touched, add its tests and say so at the gate.

---

## RC0: Decision record and plan (Opus) — done

Decision 0076 and this plan. The backlog entry links to both.

---

## RC1: Domain — route factor types and resolution (Haiku)

### Steps

1. **`src/domain/types.ts`.** After `TripProfileEstimateFactors`, add:

   ```ts
   /** Decision 0076. The estimate factors of one Route under one Trip Profile. Blank cells inherit the Trip Profile's resolved factors. */
   export interface RouteEstimateFactors { tripProfileId: EntityId; routeId: EntityId; factors: CostingEstimateFactors }
   ```

   In `CostingAssumptions`, after `tripProfileEstimateFactors`, add:

   ```ts
   /** Decision 0076. At most one entry per Trip Profile × Route. */
   routeEstimateFactors?: RouteEstimateFactors[];
   ```

2. **`src/domain/costing.ts`, `CostingAssumptionsInput`.** After `estimateFactors`, add:

   ```ts
   /** Decision 0076. The selected Trip Profile's Route factors (draft or saved). Used only by an estimated cost basis. */
   routeEstimateFactors?: { routeId: string; factors: CostingEstimateFactors }[];
   ```

3. **`src/domain/costing.ts`, `validateCostingAssumptions`.** Find where `estimateFactors` is validated with `validateEstimateFactors(factors, scenarioId)`. Add the same check for each entry of `assumptions.routeEstimateFactors` (call `validateEstimateFactors(entry.factors, scenarioId)`), and add a finding `costing.routeEstimateFactorDuplicate` (severity `error`, entityType `costingAssumptions`, entityId `scenarioId`, field `routeEstimateFactors`, parameters `{ routeId }`) when a `routeId` occurs twice. Use the existing `costingFinding` helper. Do not change the existing checks.

4. **`src/domain/estimatedCosting.ts`.** Add, below `resolveDayFactors`:

   ```ts
   export type RouteFactorSource = 'routeServiceDay' | 'routeAllDays' | CostingFactorSource;
   export interface ResolvedRouteDayFactors {
     layoverFraction?: number; layoverSource?: RouteFactorSource;
     deadheadFraction?: number; deadheadSource?: RouteFactorSource;
   }
   /**
    * Decision 0076 item 2.2. Each factor independently: the Route's day row, else the Route's All days, else `profileFactors` resolved by
    * `resolveDayFactors`. `routeFactors` undefined means the Route has no entry.
    */
   export function resolveRouteDayFactors(routeFactors: CostingEstimateFactors | undefined, profileFactors: CostingEstimateFactors | undefined, serviceDayId: string): ResolvedRouteDayFactors
   ```

   Implement it by calling `resolveDayFactors(routeFactors, serviceDayId)` and mapping its sources (`serviceDay` → `routeServiceDay`, `allDays` → `routeAllDays`), then filling each factor still undefined from `resolveDayFactors(profileFactors, serviceDayId)` with that call's source unchanged.

5. **`src/domain/estimatedCosting.ts`.** Add these pure helpers next to `setTripProfileEstimateFactors`, each with a one-line doc comment citing Decision 0076:

   - `routeEstimateFactorsForTripProfile(assumptions: Pick<CostingAssumptions, 'routeEstimateFactors'> | undefined, tripProfileId: string): { routeId: string; factors: CostingEstimateFactors }[]` — the Profile's entries, in stored order.
   - `setRouteEstimateFactors(entries: RouteEstimateFactors[] | undefined, tripProfileId: string, routeId: string, factors: CostingEstimateFactors | undefined, tripProfileIds: ReadonlySet<string>, routeIds: ReadonlySet<string>): RouteEstimateFactors[]` — drops entries whose Trip Profile or Route is not in the sets; replaces the pair's entry, or appends it; **removes** the pair's entry when `factors` is undefined (Decision 0076 item 2.2, unlike 0062).
   - `assumptionsAfterTripProfileCopy`: extend so the copy also receives a clone of every Route entry of the source Profile, replacing any existing entries of the target. It must still return `undefined` only when the source has neither an own entry nor Route entries. When the source has Route entries but no own entry, the result keeps `tripProfileEstimateFactors` unchanged.
   - `assumptionsAfterTripProfileDeletion`: extend so it also removes the Profile's Route entries, and returns `undefined` only when the Profile had neither.
   - `assumptionsAfterRouteDeletion(assumptions: CostingAssumptions | undefined, routeIds: ReadonlySet<string>, now: string): CostingAssumptions | undefined` — removes entries whose `routeId` is not in `routeIds` (the Routes that remain); `undefined` when nothing changes.
   - `remapRouteEstimateFactors(entries: RouteEstimateFactors[], tripProfileIds: ReadonlyMap<string, string>, routeIds: ReadonlyMap<string, string>, serviceDayIds: ReadonlyMap<string, string>): RouteEstimateFactors[]` — follows `remapTripProfileEstimateFactors`.

6. **Tests: `src/domain/routeEstimateFactors.test.ts` (new).** Cover:
   - every fallback step of `resolveRouteDayFactors`, each factor independently (layover from Route day, deadhead from Profile All days in the same call);
   - Profile factors from the Scenario's shared factors (owner `scenario`) are inherited;
   - `setRouteEstimateFactors`: replace, append, remove on undefined, drop unknown Profile, drop unknown Route;
   - Trip Profile copy and deletion with and without Route entries, including "Route entries only";
   - `assumptionsAfterRouteDeletion` returns `undefined` when unchanged;
   - the duplicate-route validation finding.

### Acceptance

1. `resolveRouteDayFactors(undefined, p, d)` equals `resolveDayFactors(p, d)` for every `p` and `d` in the tests.
2. No existing test file changes.

---

## RC2: Domain — costing grouped by Route (Haiku)

### Steps

1. **`src/domain/routeCosting.ts` (new).** Types shared by both bases:

   ```ts
   export interface CostingRouteDayResult {
     serviceDayId: string; serviceDayName: string; annualServiceDays: number;
     tripCount?: number;            // estimated basis
     blockCount?: number;           // blocked basis: eligible Blocks attributed to the Route
     unassignedTripCount?: number;  // blocked basis
     tripsWithoutRunTimeCount?: number; // estimated basis
     runningHoursPerDay?: number;   // estimated basis
     revenueHoursPerDay?: number; platformHoursPerDay?: number;
     annualRevenueHours?: number; annualPlatformHours?: number;
     factors?: ResolvedRouteDayFactors; // estimated basis
     yearCosts: CostingDailyYearResult[];
   }
   /** `routeId` null is the Unattributed row (Decision 0076 item 3.2). */
   export interface CostingRouteResult { routeId: string | null; routeName?: string; days: CostingRouteDayResult[] }
   export function sortRouteResults(rows: CostingRouteResult[]): CostingRouteResult[]
   ```

   `sortRouteResults`: by `routeName` (`localeCompare` with `{ numeric: true, sensitivity: 'base' }`), then `routeId`; the null row last. `days` follow the order of the result's `dailyRows`.

2. **Estimated basis, `calculateEstimatedCosting` in `src/domain/estimatedCosting.ts`.**
   - Add `routeRows: CostingRouteResult[]` to `EstimatedCostingCalculationResult`. It is `[]` for an `invalid` result.
   - Group Trips by `trip.routeId` per day, adding whole seconds as the existing day loop does (`tripRunTimeSeconds`).
   - For each Route present among the Trips, and each sorted service day, build a `CostingRouteDayResult`. Its factors are `resolveRouteDayFactors(routeEntry?.factors, assumptions.estimateFactors, day.id)`, where `routeEntry` comes from `assumptions.routeEstimateFactors`. Revenue and platform hours use the same formulas as the existing day row. `yearCosts` use the same `appliedRates` as the day rows, when they are computed.
   - **Day rows.** When no Route of that day has a factor whose source is `routeServiceDay` or `routeAllDays`, compute the day row exactly as today (unchanged code path). Otherwise its `revenueHoursPerDay` and `platformHoursPerDay` are the sums over that day's Route rows, undefined if any Route row's value is undefined, and its `factors` stays the Profile-level resolution.
   - **Findings.** `costing.layoverFactorMissing` and `costing.deadheadFactorMissing` stay one per day. Emit them when any Route row of the day with running seconds > 0 lacks the factor. When route factors are absent, this gives today's findings exactly.
   - `routeName` comes from `input.routes`, as `deriveImpliedService` does.
3. **Blocked basis, `src/domain/costing.ts`.**
   - Add `routes?: Route[]` to `CostingCalculationContext`.
   - Add `routeRows: CostingRouteResult[]` to `CostingCalculationResult`. Set it in `makeResult`; it is `[]` for `invalid` and for `noEligibleBlocks`.
   - In `buildCoverage`, for each eligible Block, collect the distinct `routeId`s of its revenue Trips (look each `tripId` up in a `Map` of `input.trips`). One `routeId` → that Route. Otherwise → the null row, plus a warning `costing.multiRouteBlock` (entityType `block`, entityId `block.id`, parameters `{ serviceDayId }`). Add the Block's revenue and platform seconds to the Route's day, using the same seconds expression as the day totals. Count `blockCount`.
   - Unassigned Trips: count per `trip.routeId` per day, next to the existing day count.
   - Year costs per Route day, from the same `appliedRates` as the day rows.
   - A Route with only unassigned Trips still gets a row (zero hours), so its unassigned count shows.
   - Findings from `buildCoverage` must be pushed into `findings` before `makeResult`; add the multi-route warnings there. Do not change the result `state` rules.
4. **`src/application/costingContext.ts`, `buildCostingCalculationContext`.** Load `sources.listRoutes?.(scenarioId) ?? Promise.resolve([])` in the existing `Promise.all` and return `routes` in the context, as `buildEstimatedCostingContext` does.
5. **Tests: `src/domain/routeCosting.test.ts` (new).** For each basis, with two Routes and two service days:
   - Route day rows sum to the day rows, and Route totals sum to `yearRows` totals (`toBeCloseTo` to 6 places);
   - with no Route factors, every existing field of the result equals the result computed before this change (`toEqual` on `dailyRows`, `yearRows`, `findings`);
   - a Route factor on one Route changes only that Route's revenue hours and the day sum;
   - blocked: a multi-route Block goes to the null row with one `costing.multiRouteBlock` warning; the Blocks of the Route rows and the null row add up to `eligibleBlockCount`;
   - blocked: unassigned counts per Route add up to `unassignedTripCount`.

### Acceptance

1. Existing tests pass unchanged.
2. The null row is present only when a multi-route eligible Block exists.

---

## RC3: Persistence, backup, lifecycle, service (Haiku, Opus review)

### Steps

1. **Backup schema 12, `src/persistence/backup.ts`.**
   - `PROJECT_BACKUP_SCHEMA_VERSION = 12`. Add `11` to every list of accepted versions that today ends `10, PROJECT_BACKUP_SCHEMA_VERSION` (search for `PROJECT_BACKUP_SCHEMA_VERSION].includes`), so version 11 files keep every field they have today.
   - `validateCostingAssumptions(..., ownFactorsAllowed)`: today `ownFactorsAllowed` is `exportSchemaVersion === PROJECT_BACKUP_SCHEMA_VERSION`. Change the call so own factors are allowed for versions 11 and 12, and add a parameter `routeFactorsAllowed` (true for 12 only). When false, drop `routeEstimateFactors` the same way `tripProfileEstimateFactors` is dropped. When true, validate it as `tripProfileEstimateFactors` is validated: an array; each entry an object; `tripProfileId` a Trip Profile of this Scenario; `routeId` a Route of this Scenario (pass the file's Routes in); each pair at most once; `validateEstimateFactors` on `factors`.
   - `cloneProjectSnapshot` (near the `remapTripProfileEstimateFactors` call): remap `routeEstimateFactors` with `remapRouteEstimateFactors`, using the clone's Route ID map.
   - Update the tests that assert `exportSchemaVersion` is 11 (`backup.test.ts`, `repositoryContract.test.ts`, `plannedFrequencyBackup.test.ts`, `backupImportValidation.test.ts`, and `tests/ui/automatic-blocking-backup.spec.ts`) to 12. Add: a v12 round trip with Route entries; a v11 file with a `routeEstimateFactors` field imports with the field dropped; a v12 file with an unknown Route fails with a message naming the path.
2. **`src/domain/project.ts`.**
   - Scenario duplication (near the existing `remapTripProfileEstimateFactors` call): remap `routeEstimateFactors`.
   - `duplicateRouteRecords`: append a copy of every entry of the source Route with the new Route's ID, following how `plannedFrequencies` are copied there.
3. **Route deletion.** In `saveScenarioRecords` of both `src/persistence/dexieRepository.ts` and `src/persistence/inMemoryRepository.ts`, next to the `prunePlannedFrequencies` call, replace `records.costingAssumptions` with `assumptionsAfterRouteDeletion(records.costingAssumptions, new Set(records.routes.map((route) => route.id)), now) ?? records.costingAssumptions` before `assertCostingAssumptions`. Use the timestamp source each repository already uses. Do the same in the in-memory snapshot import path that calls `prunePlannedFrequencies(snapshot.plannedFrequencies ...)`.
4. **Trip Profile copy and deletion.** No edit needed: both repositories already call `assumptionsAfterTripProfileCopy` and `assumptionsAfterTripProfileDeletion`, which RC1 extended. Add a repository contract test proving both carry Route entries.
5. **Ports, `src/application/ports.ts`.** Add `listRoutes(scenarioId: string): Promise<Route[]>` to `CostingCalculationContextQueries`, and implement it in `createCostingContextQueries` (`src/application/costingContext.ts`) as `sources.listRoutes?.(scenarioId) ?? Promise.resolve([])`. Add to the `CostingCommands` port the method in step 6.
6. **Service, `src/application/costingService.ts`.**
   - `saveAssumptions`: strip `routeEstimateFactors` from `input` exactly as `estimateFactors` is stripped.
   - Add `saveRouteEstimateFactors(scenarioId, tripProfileId, routeId, factors: CostingEstimateFactors | undefined, assumptionsIfNew)`. Follow `saveEstimateFactors` line by line: check the Profile is in the Scenario; check the Route is in the Scenario (`listRoutes`); check service days; validate; `normalizeEstimateFactors`; `setRouteEstimateFactors` (an undefined normalized value removes the entry); create the record when none exists; save.
   - Do not change `saveEstimateFactors`.
7. **`src/main.tsx`.** Only if the costing context sources object lacks `listRoutes`, wire it to the existing repository method. Check first; the estimated context already calls it.
8. **Tests.** `costingService.test.ts`: save, replace, remove, unknown Route refused, unknown Profile refused; `repositoryContract.test.ts`: Route deletion removes entries; Route duplication copies them; Scenario duplication remaps them.

### Acceptance

1. A v12 backup with Route entries round-trips exactly. A v11 file imports. Dexie stays at version 10.
2. Deleting a Route in the app leaves no entry naming it.

### Opus review focus

Transactions (the Route deletion prune is inside the same write), the version lists in `parseProjectBackupWithReport`, and that `saveEstimateFactors` behaviour is unchanged.

---

## RC4: Costing screen — Route table and factor Route selector (Opus)

The orchestrator designs and builds this package. Requirements:

### Route cost table

1. New `src/ui/costing/RouteCostTable.tsx` replaces `CostBreakdownTable` inside the "Cost breakdown" WorkSurface. The first column heading is "Route"; the other ten are `BREAKDOWN_COLUMNS[1..]`.
2. `breakdownRows` in `costBreakdownText.ts` is replaced by a Route-level row model built from `result.routeRows`: one Route row (sums of its day rows, using the existing `sum` rule: undefined if any part is undefined) with child day rows. The Total row is computed as today.
3. **Stable columns.** `table-layout: fixed` with the existing `<colgroup>` classes; the expand toggle takes a fixed-width slot inside the first cell of every Route row; day rows indent inside the first cell only; numeric cells right-aligned with tabular digits. A browser test reads each `th` `getBoundingClientRect().left` and `width` with every Route collapsed, expanded, and mixed, and requires them to be identical.
4. Expand toggle: a `button` in the Route row's header cell with `aria-expanded` and `aria-controls` naming the child rows; Enter and Space toggle; focus stays on the button. Child rows carry `aria-level`-equivalent indentation and their header cell names the service day.
5. One Route row → expanded by default. Expanded state persists in localStorage under `transit-costing-tool.costing-route-expanded.v1`, keyed by Scenario ID, read through `readStoredRecord` and written inside try/catch, as `VEHICLE_REQUIREMENT_OPEN_PREFERENCE_KEY` is.
6. Expand all / Collapse all: a quiet link-style control in the WorkSurface header actions, not a primary button.
7. Unassigned Trips (blocked basis): a muted note within the Route row's first cell, for example "3 unassigned", with the full sentence as accessible text. Not a column.
8. The Unattributed row: last before Total, labelled "Unattributed (multi-route blocks)", expandable like a Route row. The `costing.multiRouteBlock` finding needs a message in `costingFindingMessage`.
9. Row order: propose at the gate (name order from the domain, or sort by annual cost); implement the domain order until the user decides.

### Factor Route selector

1. A `select` in the Estimate factors WorkSurface header, labelled "Route", with "All routes" then each Route by `routeOptionLabel`. Remove `factorSubtitle` and its use.
2. "All routes" edits the Trip Profile's factors exactly as today. A Route edits that Route's entry through `saveRouteEstimateFactors`.
3. The grid shows inherited values distinct from values entered at the selected level, reusing `costing-factor-fallback` styling. Inherited cells show the inherited value as a placeholder, not as a value.
4. Changing the Route with unsaved factor edits opens the existing leave dialog (the `factorsOnly` variant), titled "Save estimate factors before changing the route?".
5. The calculation input passes the selected Profile's Route entries, with the draft entry of the selected Route substituted, in `calculationInput` as `routeEstimateFactors`.
6. The Vehicle requirement section's "Use layover" action writes to the level the selector shows.

### Acceptance

1. Column positions are identical in every expand state (test above).
2. With one Route and no Route factors, every number on the Costing screen equals the number before this package.
3. Keyboard: Tab reaches each toggle; Enter and Space toggle; Expand all is reachable.
4. Screenshots at desktop and 390 px width, light and dark, show no horizontal page scroll and no clipped column.

---

## RC5: Cost Summary, CSV report, copied text (Haiku)

### Steps

1. **`costBreakdownText` (`src/ui/costing/costBreakdownText.ts`).** Use the RC4 row model. Output: header row `['Route', 'Service day', ...BREAKDOWN_COLUMNS.slice(1)]`; per Route, one row with Service day `All days`, then one row per service day with the Route cell empty; then the Total row. Cells use the existing formatters and `MISSING`. Update `costBreakdownText.test.ts` and `tests/ui/costing-copy-table.spec.ts`.
2. **Cost Summary (`src/domain/costSummary.ts`).** Add `routes: CostSummaryRoute[]` to `CostSummary`, with `CostSummaryRoute { routeId: string | null; name: string; annualRevenueHours?: number; firstYearCostUsd?: number; shareOfFirstYearCost?: number }`. Build it from `result.routeRows`: sums of the days; first-year cost from `yearCosts` where `serviceYear === first.serviceYear`; share = Route cost ÷ `first.annualCostUsd` when both are defined and the divisor is above 0. Name the null row "Unattributed (multi-route blocks)". Keep `days`.
3. **`CostSummaryView.tsx`.** Add a "Cost by route" section after the existing by-service-day table and before "Cost by year". Copy the markup and classes of the service-day table exactly. Columns: Route, Annual revenue (h), `{firstYear}` annual cost, Share. Share uses `formatPercent`. Omit the section when `summary.routes.length < 2`.
4. **CSV (`src/persistence/csv.ts`, `costingCsvFiles`).** Add a fourth file `{ suffix: 'costing-routes', contents }`. Headers: `projectId, scenarioId, scenarioName, blockingScenarioId, blockingScenarioName, tripProfileId, tripProfileName, routeId, routeName, rowType, serviceDayId, serviceDayName, annualServiceDays, tripCount, blockCount, unassignedTripCount, runningHoursPerDay, revenueHoursPerDay, platformHoursPerDay, annualRevenueHours, annualPlatformHours, firstYear, firstYearAnnualCostUsd`. `rowType` is `routeDay` or `routeTotal`. Use the existing `context`, `hours` and `toCsv` helpers and the same free-text list plus `routeName`. Empty `routeId` for the Unattributed row. Existing files are unchanged.
5. **Tests.** `costSummary.test.ts`: shares add to 1 within 1e-9; null row named. `csv.test.ts`: header row; one Route total row per Route; existing files byte-identical for a fixed input.

### Acceptance

1. Existing CSV files are unchanged.
2. The summary page shows the Route table for a two-Route scenario and not for a one-Route scenario.

---

## RC6: Documentation, closeout, full verification (Opus)

1. `architecture_overview.md`: Costing section (Route rows, Route factors, attribution rule), backup schema 12.
2. `docs/data-schema.md`: `routeEstimateFactors`, backup version 12.
3. `docs/domain-glossary.md`: "Route estimate factors", "Unattributed (cost)".
4. `docs/backlog.md`: mark the entry implemented and link the closeout.
5. Closeout file with packages, acceptance results and the verification run.
6. Full verification as the table states, then report to the user for acceptance.

## Out of scope

- A scenario-wide by-service-day view (backlog: "Costing by service day across routes").
- Attribution rules for multi-route Blocks beyond the Unattributed row (backlog: "Multi-route interlining").
- Different service by forecast year (backlog: "Year-varying service").
- Route factors for the blocked basis.
