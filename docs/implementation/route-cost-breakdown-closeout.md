# Per-Route Cost Breakdown: Closeout

- Decision: `docs/decisions/0077-per-route-cost-breakdown-and-factors.md`
- Plan: `docs/implementation/route-cost-breakdown.md`
- Date: 2026-11-12
- Status: Implemented. Awaiting user acceptance.

## Packages

| Package | Agent | Result |
| --- | --- | --- |
| RC1 Domain types and resolution | Haiku | Done. Orchestrator fixes: `costingService` strips `routeEstimateFactors` on save; duplicate check keyed on Trip Profile × Route, so a stored record with two Profiles sharing a Route is valid. |
| RC2 Costing grouped by Route | Haiku | Done. Six hand-built result literals in existing tests gained `routeRows: []`; no assertion changed. |
| RC3 Persistence, backup 12, service | Haiku, Opus review | Done. `saveStatus.test.ts` mock gained `listRoutes`. The Route-deletion prune is computed before the transaction and written inside it. |
| RC4 Costing screen | Opus | Done. Every service day shows under each Route, so a single Route's rows equal the former service-day rows. The table has a 940 px minimum width and scrolls inside its frame at phone width. |
| RC5 Summary, CSV, copied text | Haiku | Done. `costingService.test.ts` suffix lists gained `costing-routes`. |
| RC6 Documentation and closeout | Opus | Done. |

## Acceptance

| Criterion | Result |
| --- | --- |
| Column positions identical in every expand state | Pass: `costing-route-breakdown.spec.ts` compares every heading's left and width collapsed, one expanded, all expanded, and mixed. |
| One Route, no Route factors: every number unchanged | Pass: existing Costing specs and unit tests pass with only selector changes (`Service day` heading → `Route`; day rows selected by `.costing-route-day-row`). |
| Keyboard: Tab, Enter, Space toggle; Expand all reachable | Pass. |
| No page horizontal scroll at 1440 and 390 px, light and dark | Pass (measured `scrollWidth − clientWidth` = 0; screenshots inspected). |
| v12 round trip; v11 imports; Dexie stays 10 | Pass (unit tests). |
| Deleting a Route leaves no entry naming it | Pass (repository contract test, both repositories). |
| Existing CSV files unchanged | Pass. |
| Cost by route shown for two Routes, not for one | Pass. |

## Verification run

- `pnpm typecheck`: pass.
- `pnpm test`: 1420 passed.
- Full browser suite (8 workers): 351 passed, 2 skipped, 6 failed. The six failures (costing-workspace service-day total, impact-dialogs, keyboard shift bar, segment-runtime-fill ×2, trips-layout) are timing failures under load; all 46 tests of those five files pass when rerun with 3 workers.
- `pnpm build`: pass.

## Open points for the user

1. Resolved 2026-11-12: the Route table lists Routes by name (user decision); the Unattributed row stays last.
2. Resolved 2026-11-12 (Decision 0077 item 2.6): the Vehicle requirement surface starts each row from its Route's resolved layover %, shows its source, and enables "Use" only where the Estimate factors grid shows the result. Verified: typecheck, unit suite 1420 passed, browser `costing-route-breakdown`, `costing-trip-profile-factors`, `costing-estimated` (15 passed).
3. A Block whose revenue Trips match no known Route goes to the Unattributed row without a warning.
4. The Dexie `saveProjectSnapshot` path does not prune Route entries; backup validation already rejects entries naming a missing Route.
