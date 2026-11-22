# GTFS Export — Phase E Sub-plan and Work Cards

- Status: Written in sitting 1 (2026-11-22, package E0), awaiting user review with Decision 0090. No code package has started.
- Rules: `docs/decisions/0090-gtfs-export.md` (cited as "0090 item n").
- Plan, gates and sittings: `docs/implementation/gtfs-export-phase-e.md`; run rules from `docs/implementation/gtfs-interoperability.md`, Part 7.
- Expected output: `tests/fixtures/gtfs-export/` (README holds the input Scenario and worked answers).

## 1. Branch

Built on `claude/dazzling-tesla-znfnl8`, the only branch this session may push to, on top of phase I.

## 2. Where the code goes

| Folder | Holds | Package |
|---|---|---|
| `src/domain/gtfsExport/` | Pure rules: stop identity (E1); calendar, routes, trips, stop times, shapes, feed info, checks, report, CSV text (E2). No React, no IndexedDB. | E1, E2 |
| `src/domain/types.ts`, `src/persistence/backup.ts`, `src/domain/project.ts` | `Scenario.gtfsExportSettings`, backup schema 18, copy | E1b |
| `src/application/gtfsExport/` | Service: reads the Scenario, calls the builder, writes the ZIP with `createCsvArchive`; worker if needed | E4 |
| `src/ui/gtfsExport/` | Dialog and menu entries | E4 |

## 3. Packages

| Package | Model | Sitting | Files |
|---|---|---|---|
| E0 | Opus | 1 | This file, Decision 0090, fixtures (done) |
| E1 | Haiku `xhigh` | 2 | `src/domain/gtfsExport/stops.ts` and test |
| E1b | Haiku `high` | 2 (parallel with E1) | the three files in section 2 and their tests |
| E2 | Haiku `xhigh` | 2 (after E1) | `src/domain/gtfsExport/{calendar,feed,stopTimes,shapes,checks,report,csvText}.ts` and tests |
| E3 | Opus | 3 | `docs/implementation/gtfs-export/mockup.html` |
| E4 | Sonnet | 4 | application and UI folders, menus in `App.tsx`, `tests/ui/gtfs-export.spec.ts` |
| E5 | Haiku; Opus judges | 5 | `src/application/gtfsExport/roundTrip.test.ts`, timing in scratchpad |
| E6 | Opus | 5 | closeout |

Cards E3–E6 are written at the start of their sittings from the code as it then stands.

## 4. Verification per package

As in the plan, Part 5. The expected-file test (E2) and the read-back test (E5) are never cut.

## 5. Rules for every card

- Edit with the file-edit tool; scratch output in the session scratchpad only; never commit; never copy a public feed into the repo.
- No new libraries (D12). Domain code imports nothing from persistence, application or UI.
- Every refusal and warning has a code (`gtfsExport.<name>`) and the Route, pattern or stop it concerns.
- Stop and report on any rule conflict with Decision 0090; do not choose silently.

## 6. Card E1 — Stop identity

**Rules:** 0090 items 5–8.

**Build** `exportStops(input)`: input = for each selected Route, its stop set (Route stops with locations and codes, timepoint stop codes and locations per pattern), Nodes, patterns with direction group, and `route_id`. Output: `{ stops: ExportStop[]; byRouteStop: Map; byTimepoint: Map<patternId, Map<patternPointId, stop_id>>; refusals; warnings }`.
- Merge same ID within 30 m (use the existing great-circle helper from `src/domain/gtfs/distancesFromFeed.ts` or `stops.ts`; do not copy it).
- Generated ids per item 6; refusals `gtfsExport.stopIdConflict` and `gtfsExport.stopUnlocated`; warning `gtfsExport.stopIdGenerated`.

**Tests:** the fixture Scenario (five stops, `T1-1` generated); same ID 20 m apart merges; 40 m apart refuses; a timepoint without ID; an unlocated Route stop refuses; two Routes sharing `1001` give one record.

**Run:** the new tests, `pnpm typecheck`, `pnpm test`.

## 7. Card E1b — Remembered export settings, backup schema 18

**Rules:** 0090 item 16.

**Add** `Scenario.gtfsExportSettings?: { startDate: string; endDate: string; holidays: { date: string; serviceDayId: EntityId }[]; agencyName?: string; agencyUrl?: string; agencyTimezone?: string; mapLines: 'straight' | 'none' }` (dates `YYYY-MM-DD`).
- Backup schema 18: validate when present (dates valid, end not before start, holidays inside the range and naming a service day of the Scenario); versions 1–17 import with none.
- Scenario copy and import-as-copy remap the holiday service-day ids; deleting a service day removes its holidays (extend `removeServiceDayFromFeedFields`).
- No Dexie change. Update `docs/data-schema.md`.

**Run:** the I5 row of the phase I sub-plan section 4 (persistence, backup, migration, copy tests and their three browser specs), plus a Federal BRT round trip.

## 8. Card E2 — Feed builder

**Rules:** 0090 items 1–4 and 9–21.

**Build** `buildGtfsExport(input): { files: { name: string; text: string }[]; report: ExportReportRow[]; refusals; warnings }` from: the Scenario's selected Routes with their aggregates, service days, the Trip profile's Trips, derived stop times (use `stopTimeRows` in `src/domain/stopTimes.ts`; do not reimplement spacing), an optional Blocking scenario's blocks, the settings (item 16 shape) and an export date.
- Files and order per items 4 and 12; CSV text per item 4 (`csvText.ts`; reuse the quoting in `src/persistence/csv.ts` only if it is pure, else write it in the domain).
- Refusals and warnings per items 19–20; nothing is written when any refusal stands (`files` empty).

**Tests (never cut):** build the fixture Scenario from `tests/fixtures/gtfs-export/README.md` in a test helper and compare each output file byte for byte with `mini-export/`. Plus: past-24:00 time; dwell; a day with no trips left out; a Route on own counts warned; a block over an unselected Route; Federal BRT golden Scenario exports with no refusal once its stops are located (else assert the exact refusal list).

**Read-back preview:** also parse the output with the phase I readers (`src/persistence/gtfs/`) and `translateFeed`, and assert the same trip count per day and direction. The full read-back is E5.

**Run:** the new tests, `pnpm typecheck`, `pnpm test`.
