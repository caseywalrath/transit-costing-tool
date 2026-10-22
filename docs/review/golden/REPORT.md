# A6 Golden dataset: Federal BRT backup

Backup: /home/user/transit-costing-tool/output/federal-brt-import/federal-brt-project-backup.json (sha256 780dc84d1cf896ef0d20ca56f8cbb13a1463e3aa8405109289f8d3952da49ab8)
No file in src/, tests/, tools/, docs/ or config was edited. Pre-existing uncommitted change in the repo: playwright.config.ts (git status; not mine).

## 1. Validator (tools/validate_federal_brt_backup.mjs)
Command (repo root): `node tools/validate_federal_brt_backup.mjs output/federal-brt-import/federal-brt-project-backup.json`  Exit 0. It runs as-is: it starts a Vite SSR server (tools/validate_federal_brt_backup.mjs:11) and loads the TS sources through `ssrLoadModule`.
Output (exact):
```
{
  "schemaVersion": 6,
  "roundTrip": "passed",
  "importAsCopy": "passed",
  "blockFindings": 0,
  "costingEligibleBlocks": 69,
  "runtimeMatchingTrips": 984,
  "serviceDays": [
    {
      "name": "Weekday",
      "trips": 276,
      "blocks": 18,
      "revenueHours": 311.59166666666664,
      "platformHours": 329.59166666666664
    },
    {
      "name": "Saturday",
      "trips": 260,
      "blocks": 17,
      "revenueHours": 280.94999999999993,
      "platformHours": 298.19999999999993
    },
    {
      "name": "Sunday",
      "trips": 224,
      "blocks": 17,
      "revenueHours": 245.8916666666666,
      "platformHours": 262.8916666666666
    },
    {
      "name": "Holiday",
      "trips": 224,
      "blocks": 17,
      "revenueHours": 245.8916666666666,
      "platformHours": 262.8916666666666
    }
  ]
}
```
Note: the "costingEligibleBlocks" and "runtimeMatchingTrips" keys are printed from `snapshot.blocks.length` / `snapshot.trips.length` (mjs last console.log), not from counted results. The per-Block asserts do enforce eligibility earlier in the loop, so the values hold only because no assert threw.

## 2. Loader
- Loader: docs/review/golden/federalBrt.golden.test.ts
- Config: docs/review/golden/vitest.golden.config.ts (root = repo, include = the scratch *.golden.test.ts)
- Exact invocation (from /home/user/transit-costing-tool, exit 0, 1 test passed):
```
pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts
```
- Env overrides: GOLDEN_BACKUP (backup path), GOLDEN_OUT (JSON output path; default docs/review/golden/golden-figures.json).
- Output JSON with all printed figures: docs/review/golden/golden-figures.json
- Path used: importProjectJson (src/persistence/backup.ts:477) -> ProjectBackupService.importProject(payload,'reject') (src/persistence/backupRepository.ts:17) -> InMemoryRouteDefinitionRepository.saveProjectSnapshot (inMemoryRepository.ts:185) -> getProjectSnapshot -> InMemoryBlockingRepository + BlockingApplicationService.getBlockSummary -> CostingApplicationService.calculateEstimate. Costing context is assembled exactly as src/main.tsx:27-45 does it, because InMemoryRouteDefinitionRepository does NOT implement CostingCalculationContextQueries (grep: only main.tsx and a test mock provide getCostingCalculationContext). Rate $100 per revenue hour, rateYear = baseServiceYear = 2025, futureYearCount 0, escalation 0.03 (irrelevant at year 0). Per-Block eligibility and reason codes also computed independently with summarizeBlock + evaluateBlockEligibility.

## 3. Printed figures
Counts: projects 1, scenarios 1, serviceDays 4, routes 1, nodes 11, patterns 6, runtimeProfiles 18, runtimeAssignments 24, tripProfiles 1, blockingScenarios 1, trips 984, blocks 69, costingAssumptions 0.
Patterns (name, points, total miles): SB Wagon Rd-Evans 9/18.5; SB Westminster-Englewood 8/13.5; SB Wagon Rd-Englewood 11/21; NB Englewood-Westminster 8/13.5; NB Evans-Wagon Rd 9/18.5; NB Englewood-Wagon Rd 11/21.

| Day | Annual days | Trips | SB/NB trips | Blocks | Eligible | Excluded (reason codes) | Revenue h/day | Platform h/day | Running h/day | Deadhead h | Layover h | Annual revenue h | Annual platform h | Annual cost @$100 |
|---|---:|---:|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Weekday | 255 | 276 | 138/138 | 18 | 18 | none | 311.591667 | 329.591667 | 256.283333 | 18 | 55.308333 | 79,455.875 | 84,045.875 | 7,945,587.50 |
| Saturday | 52 | 260 | 130/130 | 17 | 17 | none | 280.95 | 298.2 | 227.566667 | 17.25 | 53.383333 | 14,609.4 | 15,506.4 | 1,460,940.00 |
| Sunday | 52 | 224 | 112/112 | 17 | 17 | none | 245.891667 | 262.891667 | 196.216667 | 17 | 49.675 | 12,786.366667 | 13,670.366667 | 1,278,636.67 |
| Holiday | 6 | 224 | 112/112 | 17 | 17 | none | 245.891667 | 262.891667 | 196.216667 | 17 | 49.675 | 1,475.35 | 1,577.35 | 147,535.00 |
| Total | 365 | 984 | | 69 | 69 | none | | | | | | 108,326.991667 | 114,799.991667 | 10,832,699.17 |

Costing result: state=complete, findings=[], eligible 69, excluded 0, unassigned Trips 0, exclusions list empty for all 4 days. All 69 Blocks have status "incomplete" with the single finding block.platformMilesIncomplete (matches doc statement). Trips per day by Pattern are in golden-figures.json (tripsByDayPattern): Weekday SB 65/65/8, NB 66/65/7; Saturday 61/61/8, 62/61/7; Sunday and Holiday 52/52/8, 53/52/7.
"Revenue hours" in the app = Block first-Trip-start to last-Trip-end (running 256.28 + layover 55.31 = 311.59 on Weekday). It is not Trip run time alone. Costing multiplies this value.

## 4. Reconciliation
Documented sources: audit (A) and conversion doc (C). Computed from the loader. Hours-sheet-only figures in A are taken from the workbook and are not in the backup; the workbook is not in the repo (find / -iname "*Federal*Blvd*" found nothing), so they are compared only where the backup carries an equivalent.

| Figure | Documented | Computed | Diff |
|---|---:|---:|---:|
| Weekday annual days (A,C) | 255 | 255 | 0 |
| Saturday annual days | 52 | 52 | 0 |
| Sunday annual days | 52 | 52 | 0 |
| Holiday annual days | 6 | 6 | 0 |
| Weekday Trips / Blocks / SB / NB (A) | 276/18/138/138 | 276/18/138/138 | 0 |
| Saturday Trips / Blocks / SB / NB | 260/17/130/130 | 260/17/130/130 | 0 |
| Sunday Trips / Blocks / SB / NB | 224/17/112/112 | 224/17/112/112 | 0 |
| Holiday Trips / Blocks / SB / NB | 224/17/112/112 | 224/17/112/112 | 0 |
| Total Trips (A) | 984 | 984 | 0 |
| Total Blocks (A) | 69 | 69 | 0 |
| Eligible Blocks (C: "all 69") | 69 | 69 | 0 |
| Patterns (A,C) | 6 | 6 | 0 |
| Runtime Profiles (A) | 18 | 18 | 0 |
| Runtime Assignments (A) | 24 | 24 | 0 |
| Pattern totals 18.5/13.5/21 mi (A,C) | 18.5, 13.5, 21 | 18.5, 13.5, 21 (two Patterns each of 18.5, 13.5, 21) | 0 |
| Costing rate imported (A,C: none) | none | costingAssumptions = 0 | 0 |
| Blocks incomplete for mileage only (C) | yes | 69 incomplete, sole finding platformMilesIncomplete | 0 |
| Saturday timetable Block span total (A) | 280:57:00 (280.95 h) | 280.95 h = 280:57:00 | 0 |
| Saturday per-Block timetable Revenue, 17 Blocks (A table) | listed per Block | all 17 equal (e.g. 11 17:01:00, 26 15:46:30, 28 20:04:00) | 0 on all 17 |
| Saturday SA Hours revenue total (A) | 277:02:00 (sum of the 17 listed Hours values = 277:02:00, recomputed) | not in backup (comparison-only) | n/a |
| Saturday difference per day (A) | 03:55:00 | 280:57:00 - 277:02:00 = 03:55:00 (derived from A's own columns) | 0 |
| Saturday pull-in 30 min, 17 Blocks (A) | 30 | 30 on all 17 | 0 |
| Saturday pull-out: 30 min except Block 26 = 45 (A table) | 30 / 45 | 30 on 16 Blocks, 45 on Block 26 | 0 |
| Saturday Block 29 pull-out inferred 30 (A) | 30 | 30 | 0 |
| Saturday platform h/day (derived: 280.95 + 17 x 1.0 + 0.25) | 298.20 | 298.20 | 0 |
| Weekday/Sunday movement durations "retain source" (C) | source durations | all 18 Weekday Blocks 30/30 min; all Sunday Blocks deadhead 1.0 h each (17.0 h) | cannot verify, uniform values |
| Hours-sheet BRT subtotals (WK Hours!E25:H31) (A) | no value stated | n/a | no documented number to reconcile |
| Route 29 additional hours (A,C) | 4,427 | not in backup (excluded by design) | n/a |
| Workbook Federal BRT timetable subtotal (C: "compare app totals with") | no value stated | app annual revenue 108,326.99 h | cannot reconcile; documents give no number |
| SA Times row 134 / SU Times row 116 NB listed 21.0 mi vs Pattern 13.5 (A) | 21.0 vs 13.5 | NB Englewood-Westminster Pattern = 13.5; trip-level 21.0 listing not checkable | cannot verify |

Differences found against stated figures: none. Figures the docs do not state (weekday and Sunday hours, annual hours, cost) were computed but have nothing to reconcile against.

## 5. Defects and suspicious behavior
1. Documentation gap, no workbook subtotal. The conversion doc (docs/implementation/federal-brt-workbook-conversion.md:29) tells the reader to "compare app totals with the Federal BRT timetable subtotal" but neither document states that subtotal; the audit points to WK Hours!E25:H31 only (audit last 2 lines). The app totals (annual revenue 108,326.99 h) cannot be reconciled from the repo. Needs the workbook.
2. Doc claim not verifiable: conversion doc "weekday and Sunday movements retain their source durations". The backup shows every Weekday Block with exactly 30/30 min pull-out/pull-in (incl. Block 30) and every Sunday Blocks' deadhead = 1.0 h, so either the source is uniformly 30 min or the converter flattened it. The audit lists inferences only for Saturday and does not list the Weekday/Sunday source values. Check against tools/federal_brt_to_backup.py in a later phase.
3. Validator prints counts rather than measuring them: tools/validate_federal_brt_backup.mjs final console.log uses `costingEligibleBlocks: snapshot.blocks.length` and `runtimeMatchingTrips: snapshot.trips.length`. It is only correct because earlier asserts throw on failure. Cosmetic risk.
4. Validator and loader assemble the costing context by hand; InMemoryRouteDefinitionRepository (src/persistence/inMemoryRepository.ts) lacks CostingCalculationContextQueries, so the only production assembly is src/main.tsx:27-45 and the loader copies it. Any divergence between main.tsx and the loader would not be caught by tests; no test covers main.tsx assembly (grep: only costingService.test.ts mocks it).
5. Inconsistent Trip counts per direction by Pattern: Weekday/Sat/Sun NB "Englewood to Westminster Station" has 1 more Trip than its SB mirror (66 vs 65, 62 vs 61, 53 vs 52), and the short Wagon Road-Englewood Pattern has 8 SB and 7 NB. Totals still balance (138/138). Looks like a legitimate timetable asymmetry; not verified against the workbook.
6. Doc/terminology trap: "Revenue Hours" in costing includes between-Trip layover (Weekday 311.59 vs running 256.28). The conversion doc says "Costs use Revenue Hours" without saying this. Later phases should decide if layover belongs in the costed quantity (domain rule, src/domain/blocking.ts summarizeBlock; costing.ts calculateCosting uses row.revenueHoursPerDay).
7. Pre-existing uncommitted modification to playwright.config.ts in the working tree (git status). Unrelated to A6; left untouched.
