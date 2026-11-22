# Scenario Comparison — Phase V Sub-plan and Work Cards

- Status: Written in sitting 1 (2026-11-22, package V0). No code package has started.
- Rules: `docs/decisions/0091-scenario-comparison.md` (cited as "0091 item n").
- Plan, gates and sittings: `docs/implementation/scenario-compare-phase-v.md`. Run rules: `docs/implementation/gtfs-interoperability.md`, Part 7.
- Worked example: `tests/fixtures/scenario-compare/README.md`.
- Mock-up: `docs/implementation/scenario-compare/mockup.html`.

## 1. Branch

The work is on `claude/dazzling-tesla-znfnl8`, the only branch this session may push to.

## 2. Where the code goes

| Folder | Holds | Package |
|---|---|---|
| `src/domain/compare/` | Pure rules: matching, count and rate overrides, measures, peak, headways, change rows, status, order, CSV text. No React, no IndexedDB. | V1 |
| `src/application/compare/` | Service: reads both sides, applies overrides, runs Costing, calls V1; worker and client | V2 |
| `src/ui/compare/` | The Compare tab | V4 |

## 3. Packages

| Package | Model | Sitting | Files |
|---|---|---|---|
| V0 | Opus | 1 | This file, Decision 0091, the worked example (done) |
| V1 | Haiku `xhigh` | 2 | `src/domain/compare/**` and tests |
| V2 | Sonnet | 2 (after V1) | `src/application/compare/**` and tests; `src/main.tsx` only if wiring is needed for the worker URL |
| V4 | Sonnet | 3 | Card written at the start of sitting 3 |
| V5, V6 | Haiku, Opus | 4 | Cards written at the start of sitting 4 |

## 4. Verification per package

As in the plan, Part 5. The worked-example test (V1) and the equality with Costing (V2) are never cut.

## 5. Rules for every card

- Edit with the file-edit tool. Scratch output goes in the session scratchpad only. Never commit. Never copy a public feed into the repo.
- No new libraries (D12). Domain code imports nothing from persistence, application or UI.
- Reuse; do not copy:
  - `peakVehicles` (`src/domain/autoBlocking.ts`);
  - `patternDirectionGroups` and `directionDisplayName` (`src/domain/directions.ts`);
  - `sortRouteResults` ordering and `UNATTRIBUTED_ROUTE_NAME` (`routeCosting.ts`, `costSummary.ts`);
  - `ownOrScenarioCount` (`costing.ts`);
  - the formula protection used by the Costing CSV (find it in `src/persistence/csv.ts` or `src/application/csvText.ts`). If it is not importable from the domain, move it to the domain and re-export it, leaving its tests unchanged.
- Every warning has a code (`compare.<name>`).
- Stop and report any rule conflict with Decision 0091. Do not choose silently.

## 6. Card V1 — Comparison rules (pure domain)

**Rules:** 0091 items 4, 5, 7 (count override), 9–18.

**Build** in `src/domain/compare/`:

1. `matchRoutes(baseline: Route[], proposed: Route[])` returns `{ pairs: {baseline?: Route; proposed?: Route}[]; ambiguous: {side; key; routeIds}[] }`.
   - Keys are tried in turn: `gtfsRouteId`, then short name, then name, each trimmed and compared ignoring case. Each key is tried only on Routes still unmatched (item 4).
2. `matchServiceDays(baseline, proposed)` (item 5).
3. `applyCountChoice(choice, baselineSide, proposedSide, routePairs, dayPairs)` returns copies of each side's `serviceDays` and `routes` with the counts replaced (item 7). The inputs are never changed.
4. `routeDayMeasures(input)` for one side, one Route and one day: trips, revenue miles, span per direction, departures per direction. The input is that side's Trips (profile already filtered), patterns and directions.
5. `headwaysByPeriod(departuresSeconds[])` returns six values in minutes, rounded to the half minute, or `undefined` (item 11). Export the period table as a constant.
6. `peakByRoute(blocks, trips)`: each block's interval, its attribution (one Route, or Unattributed), and the peak for the system, each Route and Unattributed (item 12).
   - Use the block summaries' `platformStartSeconds` and `platformEndSeconds` when present, else the first and last revenue trip.
   - Call `peakVehicles` for every count.
7. `buildComparison(input)` returns `{ totals, rows, warnings }` for a day or for `'annual'`.
   - The input is both sides' measures, the per-Route Costing figures (revenue hours, platform hours, first-year cost for each day; the Unattributed row too), peaks or "not blocked", the day pairs and the counts in use.
   - Each row has: key, display name (Proposed's when matched), status, and for each measure base, proposed, change and % (items 13–17).
   - Unchanged rows are flagged for folding; the UI folds them.
8. `comparisonCsvText(comparison, heading)` (item 18).

**Tests (never cut):**
- `tests/fixtures/scenario-compare/README.md`, built in a test helper (`src/domain/compare/compareFixture.ts`). Check every figure in "Worked answers": Weekday rows and totals, the 1 Main St span and headways, Saturday statuses, and the Annual totals with the peak day.
- Plus:
  - an ambiguous short name: two "S" Routes on Proposed and one on Baseline gives no match and one `compare.ambiguousRoute` warning;
  - a custom day matched by name, and a day only one side has;
  - the count override for a Route with own counts;
  - headways past 24:00 (Night);
  - a block ending exactly as another starts (no overlap);
  - CSV heading and formula protection;
  - swapping the sides flips every sign.

**Run:** the new tests, `pnpm typecheck`, `pnpm test`.

## 7. Card V2 — Comparison service and worker

**Rules:** 0091 items 1–3, 6–8; plan V-D2. **Model:** Sonnet.

**Build** in `src/application/compare/`:

1. `CompareService.compare(request, onProgress)`.
   - The request holds both sides `{scenarioId, tripProfileId, blockingScenarioId | null}`, the day (a service-day pair key or `'annual'`), and the rate and count choices.
   - For each side:
     - Build the Costing context with `buildCostingCalculationContext` (blocked) or `buildEstimatedCostingContext` (estimated), from `src/application/costingContext.ts`.
     - Apply the V1 count override, and replace the Costing assumptions per the rate choice (item 6; estimate factors stay with their own side).
     - Run `calculateCosting` or `calculateEstimatedCosting`.
   - Read the Trips, patterns and directions for V1 measures and the block summaries for peaks. Call `buildComparison`.
   - Return the comparison plus a `differences` list for the warning line (item 8): rates, counts and basis, each with both values.
2. **Cache per side**, keyed on the side, the overrides that reach it, and the Project's save stamp. Changing only one side or the day recomputes only what changed.
3. **Worker** (`compareWorker.ts`, `compareWorkerClient.ts`), shaped like `src/application/gtfsExport/gtfsExportWorker*.ts`. It falls back to the main thread when workers are unavailable, keeping every record (see the phase E review fix in `gtfsExportWorkerClient.ts`). Progress is reported per side as "Costing baseline… n of N routes": route count after each Route's figures. If Costing has no per-route hook, report per side done.
4. **Tests:**
   - **Equality (never cut):** for the worked example and for the Federal BRT golden Scenario against itself:
     - each side's per-Route revenue hours and first-year cost equal a direct `CostingApplicationService` estimate with the same assumptions and counts;
     - Federal BRT against itself shows every Route Unchanged and every change 0.
   - **Overrides:** a copy with a different Weekday count shows changes under "Each side's own" and none under "Baseline's".
   - **Caching:** changing one side recomputes only that side.
   - **Errors:** a side whose Costing is invalid (no rate) returns the Costing findings as the side's error, not a throw.

**Files:** the new folder and tests. Do not change Costing domain files. If an export is missing, add it with no behaviour change.

**Run:** the new tests, `pnpm typecheck`, `pnpm test`.
