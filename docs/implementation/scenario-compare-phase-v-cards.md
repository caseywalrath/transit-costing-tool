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

## 8. V1 as built (2026-11-22)

- Code: `src/domain/compare/` (matching, counts, measures, peaks, `buildComparison`, `comparisonCsvText`, `comparisonFileName`, `compareFixture.ts`), with 97 tests. Every worked answer matches.
- The CSV formula protection moved to `src/domain/csvFormula.ts`; `src/persistence/csv.ts` re-exports it.
- Decision 0091 amended in two places:
  - item 14: no % on New or Discontinued rows;
  - item 12: valid blocks only.
- Choices accepted:
  - the display name is the short name plus the name;
  - `route_id` in the CSV is the GTFS id, else the short name;
  - the Annual status is Changed if any day is;
  - the CSV uses LF line endings;
  - custom day keys are `custom:<name>`.
- **For V2:**
  - Build a `SideDay` for each side and day pair: `annualServiceDays` from `ownOrScenarioCount` after `applyCountChoice`, the Costing Route row figures, and the measures from `routeDayMeasures`.
  - Pass only valid blocks (`summary.valid`) to `peakByRoute`.

## 9. V2 as built (2026-11-22)

- Code: `src/application/compare/`:
  - `CompareService.compare(request, onProgress)`;
  - a per-side cache, scoped by the save stamp, keeping 12 sides;
  - the worker and its client, which falls back to the main thread;
  - `differences` for the warning line;
  - 27 tests.
- Federal BRT against itself: every Route equals Costing exactly, and every row is Unchanged. A whole cold compare takes about 50 ms in Node.
- Choices accepted:
  - A side whose Costing is invalid or has no estimate (for example, no rate entered) returns an error, not zeros. **V4 must say how to fix it.** For example: "Enter a rate on the Costing tab for <Scenario>, or set Rates to the other side's."
  - `differences` reports each side's own values, with `applied` naming the side in use.
  - Costing reports progress per side, not per Route; measuring reports per Route.
- **For V4, wiring in `src/main.tsx`:**
  - Build `CompareService` from the repository queries used by `createCostingContextQueries`, plus `listDirections` and `getCostingAssumptions`.
  - Pass the save stamp from `createSaveStamp(saveStatus)`.
  - Call `dispose()` on teardown.
- Hand-off: next is sitting 3, V4 (the tab), with its card written at the start.

## 10. Card V4 — The Compare tab

**Rules:** 0091 items 1–18; plan Part 4 and V-D1, V-D2. **Look:** the mock-up, frames 1–5. **Model:** Sonnet.

**Build** in `src/ui/compare/` (plus the wiring below):

1. **The tab.**
   - Add `'compare'` to `ActiveTab` in `src/ui/App.tsx`, labelled "Compare", after Costing.
   - Enabled once the Project has a Scenario. It picks its own sides, so it does not use the header's Scenario, Trip profile or Blocking switchers. Hide those crumbs on this tab.
   - It is read only (V-D1): no save, no undo entry, no navigation guard.
2. **Header (frame 1).**
   - Two side pickers, Baseline and Proposed, each with Scenario, Trip profile and Blocking scenario. The Blocking menu has "None (estimate)" at the end.
   - A Day menu: the matched day pairs from the result, then "Annual".
   - Rates and Counts menus: "Baseline's" (default), "Proposed's", "Each side's own".
   - A "Download CSV" button, using `comparisonCsvText` and `comparisonFileName`.
   - First open, with nothing remembered: Baseline is the Scenario selected in the app; Proposed is the first other Scenario, or the same Scenario if it is the only one.
3. **Warnings line (frame 3).**
   - One line per item in `differences` (rates, counts, basis), plus the comparison's own warnings (`compare.ambiguousRoute` and the rest), in plain words.
   - A side error explains the fix:
     - `compare.costingNoEstimate` or `compare.costingInvalid` with no rate: "Enter a rate on the Costing tab for <Scenario>, or set Rates to the other side's."
     - Any other Costing finding: show its message using the existing `errorMessages.ts` helpers.
   - The other side's figures are not shown as zeros.
4. **Calculating (frame 3).**
   - Show progress messages from `onProgress`. Keep the previous result visible but dimmed.
   - Drop stale results with `latestRequest.ts`.
5. **Totals tiles (frame 1).** Trips, miles, revenue hours, peak vehicles and cost, each with Baseline → Proposed and the change (number and %).
6. **Route table (frames 1, 2 and 4).**
   - Columns as in the mock-up, in the 0091 order: largest absolute hours change first, Unattributed last, Unchanged rows folded under "n unchanged routes" (expandable).
   - Status chip: New, Discontinued, Changed, Unchanged. "—" for % on New and Discontinued rows.
   - Clicking a row opens its detail in place (frame 2), one at a time. The detail shows span, the headway by period and the other measures, with the cells that differ in bold accent colour.
   - Rows are buttons or have `aria-expanded`, and work with the keyboard.
7. **Annual (frame 4).** Same table, with peak as the highest of the days.
8. **Narrow (frame 5).** Below the existing narrow breakpoint, the side pickers stack and the table shows Route, Status, Hours Δ and Cost Δ. The rest is in the detail. No horizontal page scroll at 390 px.
9. **Remembered on the device.** Sides, day, rates and counts are stored per Project, through `src/ui/preferences.ts`, the same as `COST_BASIS_KIND_KEY`. A remembered id that no longer exists falls back to the first-open rule.
10. **Wiring.** Do this in `src/main.tsx` as described in §9, and pass the service down the way `costingService` is passed. Call `dispose()` on teardown.
11. **Styles.** Use the existing tokens and table styles in `src/ui/styles/`, with no raw hex for chrome. Light and dark must both work.

**Tests:**
- `tests/ui/compare.spec.ts`, using the worked example.
  - Build the example's two Scenarios through the UI or the existing test-seeding helpers that other specs use (look in `tests/ui/` for the pattern).
  - Check the Weekday totals: trips 9→10, hours 4.15→4.85, peak 2→3, cost $104,165→$121,735.
  - Check Annual: hours 1,062.45→1,248.55.
  - Check R3 New, R2 Discontinued, R1 Changed.
  - Open a row's detail.
  - Download the CSV and check its name and header.
  - Make a no-rate side and check the fix message.
  - Reload and check the choices are remembered.
  - Check 390 px width has no horizontal scroll.
- Add the Compare tab to `tests/ui/keyboard.spec.ts` (axe, no violations).
- Unit tests for any pure helpers in `src/ui/compare/`.

**Run:** `pnpm typecheck`; `pnpm test`; `pnpm build`. Then:
- `pnpm exec playwright test tests/ui/compare.spec.ts tests/ui/keyboard.spec.ts tests/ui/app-shell.spec.ts --trace off`, and any spec touching tabs;
- screenshots at 1440 and 390 px, light and dark, saved to the scratchpad and inspected.

**Files:** `src/ui/compare/**`, `src/ui/App.tsx`, `src/main.tsx`, `src/ui/preferences.ts`, `src/ui/styles/**`, `tests/ui/compare.spec.ts`, `tests/ui/keyboard.spec.ts`. Change `src/application/compare/` or `src/domain/compare/` only to fix a bug found here. Report any such fix.

## 11. V4 as built (2026-11-23)

- Code:
  - `src/ui/compare/`: `CompareWorkspace.tsx`, `compareModel.ts`, 47 unit tests;
  - `src/ui/styles/compare.css`;
  - wiring in `App.tsx`, `AppHeader.tsx` (the Scenario switcher is optional), `main.tsx` and `preferences.ts` (`transit-costing-tool.compare.v1`, per Project);
  - `tests/ui/compare.spec.ts` (9 tests) with `tests/ui/support/compareExample.ts`, and one Compare case in `keyboard.spec.ts`.
- Test figures:
  - The README's hours and cost are inputs to V1's pure tests, not Costing output.
  - The spec checks trips, miles, peak and status literally, and checks hours and cost against a direct Costing estimate run in the page (V-D2).
- Extras: a Show, Sort and Find row, and a swap-sides button.
- Deferred to the backlog:
  - the "Open on Trips/Costing tab" links;
  - the detail's "day count used" line;
  - the phone picker sheet (narrow windows use stacked menus).
- Notes for V5 and V6:
  - Under the blocked basis, hours on multi-route blocks sit in Unattributed, as on the Costing tab. A New route whose trips are all interlined shows 0.0 hours.
  - The app has no dark theme yet. The tab uses tokens only.
  - V6 runs the full browser suite.

## 12. Card V5 — Scale check on the RTD feed

**Rules:** plan Part 5, row V5; V-D2. **Model:** Haiku `xhigh`; Opus judges. **No repo code changes.** This is a measurement. Everything you write goes in the scratchpad.

**Steps** (a Playwright script driving the built app, the same way the phase I and E scale checks did):
1. Build with `pnpm build`, serve `dist/`, and open it in Chromium.
2. Import `<scratchpad>/rtd-feed/google_transit.zip` through the GTFS import, as `tests/ui/gtfs-import.spec.ts` does. Run automatic blocking if the import does not create blocks.
3. Copy the Scenario (Scenario context menu → Copy). In the copy, make three edits through the UI:
   - delete some Weekday trips on one Route (expect fewer hours);
   - add a Weekday trip on a second Route (expect more hours);
   - lengthen a runtime on a third Route (expect more hours). Do not change counts or rates.
   Re-block the copy if blocks go stale, or use "None (estimate)" for both sides.
4. On the Compare tab, set Baseline to the import and Proposed to the copy, with Day = Weekday. Then:
   - time from the change of side to the tiles showing, cold and warm (repeat 3 times);
   - check the page stays responsive: while calculating, a click on a header menu opens within 500 ms;
   - repeat with Day = Annual.
5. **Checks:**
   - the three edited Routes are Changed, with the expected signs;
   - every other Route is Unchanged (the plan expects 127; report the real count);
   - for 5 Routes chosen across the table, and the totals, the Compare hours and cost for each side equal the Costing tab for that Scenario and settings (same profile, blocking and basis).
6. **Report:** the timings (target: under 20 s), the counts, any mismatch with its figures, and screenshots at 1440 px saved to `<scratchpad>/v5/`.

## 13. V5 result (2026-11-23, stopped early to save usage)

- Import of the RTD feed: 12 s (130 Routes). Copying the Scenario: 9 s.
- Edits in the copy, with the Weekday result in Compare:

  | Route | Edit | Status | Hours | Cost per year |
  |---|---|---|---|---|
  | 20 | 2 Weekday trips deleted | Changed | −2.1 | −$79,462 |
  | AB1 | 1 trip added | Changed | +1.7 | +$64,181 |
  | 14 | one runtime +1 min | Changed | 0.0 (rounded) | +$764 |

- The other 127 Routes are Unchanged.
- Timing, both sides estimated: about 6 s cold for Weekday; under 0.1 s to switch to Annual. The target is 20 s.
- Not done:
  - the responsiveness probe;
  - the equality check against the Costing tab on RTD (equality is covered by V2's tests);
  - the blocked-basis run.
- **Open item for V6:** with the feed's blocks, Compare said "no blocks can be costed" on both sides. Check whether the Costing tab agrees for the imported Scenario before closing phase V.
