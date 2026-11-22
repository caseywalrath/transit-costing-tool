# GTFS export (phase E) — plan

> **Status:** Draft 2026-11-22, for user review. No gate answered, no package started.
>
> **Parent plan:** `docs/implementation/gtfs-interoperability.md`, Part 6 "E". This file expands that section; the parent's fixed decisions (Part 8) and run rules (Part 7) apply unless this file says otherwise.
>
> **Origin:** the deferred plan's phases C1 and C2 (`docs/gtfs-costing-tool-plan.md` in `caseywalrath/transit-analysis-tool`, branch `claude/friendly-brahmagupta-51rk4t`), updated for what phase I built.
>
> **Where the work happens:** only in this repository.

---

## Summary

**Goal:** export a Scenario's schedules as a valid GTFS feed (a ZIP), so the Analysis app (or any GTFS tool) can map and analyse them: coverage, Title VI, travel times, and comparison with today's network.

**What the planner does:** Scenario menu → "Export as GTFS feed…". A dialog asks for the Routes, the Trip profile, an optional Blocking scenario, a date range and holidays, and agency details. Checks run first; problems are listed with the Route and pattern to fix. The download is one ZIP.

**Secondary goals:**
- An imported feed exported again keeps the agency's ids (routes, stops, and trips where unchanged).
- The export is read back by this tool's own importer in an automated test: same trips, running hours and blocks.

**Not in this phase:** true street alignments (needs phase J), planned frequencies as `frequencies.txt` windows, fares, transfers, accessibility fields, per-route calendars for own counts (Gate G-E6).

### What changed from the deferred plan

| Change | Why |
|---|---|
| C1 (stop identity) is folded in as package E1, decided at export only. | Phase I already keeps the feed's `stop_id`s; imported Routes share them. |
| Route ids, route type and colour come from the fields phase I added (`gtfsRouteId`, `gtfsRouteType`, `color`). | Built in I5. |
| The import note gives defaults for agency name, URL, time zone and dates. | Built in I9. |
| New gates G-E5 to G-E8 (custom service days, own counts, non-timepoint stops, trip ids). | Phase I added custom days, own counts and feed stop times. |
| Read-back test uses the phase I importer. | Phase I exists now. |

---

## Part 1 — Starting

### 1.1 Findings to re-check against the code (first step of E0)

| Finding | Where | Matters for |
|---|---|---|
| ZIP writer stores files uncompressed (`createCsvArchive`, `src/persistence/csv.ts`) | Persistence | Fine for export; size of a whole-feed export (RTD imported back out: estimate 60–80 MB) must be measured |
| Route stops: `RouteStop` with optional `latitude`/`longitude` and `stopCode` (Decision 0085); stop IDs on timepoints per pattern point (Decision 0080, `timepointStopCodesByPatternId`) | Domain | Stop records and the G-E1/G-E4 checks |
| Stop times between timepoints are derived (Decisions 0086, 0087; `src/domain/stopTimes.ts`) | Domain | `stop_times.txt` for non-timepoint stops (G-E7) |
| Service days: three standard kinds plus custom days; annual counts only, no dates | Domain | `calendar.txt` (G-E2, G-E5) |
| Trip provenance `feed` and the import note | Domain | Defaults and id reuse (G-E8) |
| Do timepoints (Nodes) have their own coordinates, or only through a stop at the same place? | Domain | G-E4 |

### 1.2 Inputs from the Analysis app

The Analysis app's GTFS loader is the first consumer. Its reader contract is in its `docs/reference/modules/gtfs.md`. E5 loads one export there by hand (user step) before closeout. Nothing in the Analysis app changes in this phase.

### 1.3 Steps when the user approves this draft

1. Record the gate answers in Part 7.
2. E0: decision record `docs/decisions/0090-gtfs-export.md` and the sub-plan with work cards, as for phase I.
3. The orchestrator runs the sittings in Part 5.

---

## Part 2 — Mapping

### 2.1 File by file

| GTFS file | Required | Source in this tool | Notes |
|---|---|---|---|
| `agency.txt` | Yes | Dialog (defaults from the import note) | One agency |
| `stops.txt` | Yes | Route stops and timepoint stop IDs, merged across Routes (G-E1) | `location_type` 0 only |
| `routes.txt` | Yes | Route: `gtfsRouteId` or a stable id, short and long name, `gtfsRouteType` (default 3, bus), `color` | |
| `trips.txt` | Yes | Trips of the chosen Trip profile; `direction_id` from Outbound (0) / Inbound (1); `block_id` from the Blocking scenario; `trip_headsign` from the direction name | `shape_id` per pattern (G-E3) |
| `stop_times.txt` | Yes | Timepoint times (`timepoint=1`) and derived stop times (`timepoint=0`, G-E7) | Seconds after midnight, past 24:00 allowed (D4) |
| `calendar.txt` | Yes (with dates) | One `service_id` per service day, weekday flags from its kind, date range from the dialog | |
| `calendar_dates.txt` | When holidays | Holiday dates: add the Holiday service, remove the day it replaces | |
| `shapes.txt` | Optional | Straight lines through each pattern's located stops (G-E3) | |
| `feed_info.txt` | Recommended | Publisher, version (export date), language `en`, start and end dates | |

### 2.2 How the models differ

1. **Dates.** This tool counts days per year; GTFS lists dates. The export needs a real date range and holidays (G-E2). The exported calendar will not reproduce the annual counts exactly; the report shows both.
2. **Stops.** Each Route owns its stops; GTFS has one stop per place (G-E1).
3. **Timepoints vs stops.** A timepoint without a stop ID still needs a `stops.txt` record (G-E4, G-E7).
4. **Own counts.** A Route on its own counts has a different year from the Scenario; GTFS can express this only with its own `service_id`s and dates (G-E6).
5. **Custom days** ("Holiday 2") have no weekday kind (G-E5).

---

## Part 3 — Export rules (to become Decision 0090)

1. **Scope.** One Scenario, one Trip profile, all or selected Routes, optional Blocking scenario. Only Trips of the selected Routes; a block that also serves an unselected Route keeps its `block_id` on the selected trips and is listed.
2. **Ids are stable.** Re-exporting unchanged data gives the same ids: `route_id` = `gtfsRouteId` or the Route's short name made unique; `service_id` = the day's abbreviation; `trip_id` per G-E8; `stop_id` per G-E1; `shape_id` = route id + pattern short name.
3. **Times.** Integer seconds written `HH:MM:SS`, past 24:00 kept. Arrival = departure except where a dwell is stored.
4. **Directions.** Outbound → 0, Inbound → 1, written in the report.
5. **Distances.** `shape_dist_traveled` written in miles from the pattern's cumulative miles, both in `stop_times` and `shapes` (D5: never trusted on import, but useful to readers).
6. **Checks before writing** (each refusal lists Route, pattern and stop): stops or timepoints without coordinates (G-E4); stops without an ID (generated, listed as a warning); trips with a missing time; a Route with no trips on the chosen profile (skipped, listed).
7. **Report.** A CSV beside the ZIP, like the import report: counts per Route and day (trips, running hours) in this tool and in the feed over the date range, ids created, anything left out.
8. **No silent change (D13).** Nothing in the Scenario is changed by an export, except remembering the dialog values (G-E2).

---

## Part 4 — Export screen (proposal for the design package E3)

A dialog in the style of the import dialog, one page with sections, not steps:

1. **What:** Routes (all, or a list with checkboxes), Trip profile, Blocking scenario ("None — no block ids").
2. **When:** start and end date, holidays (date list, each tagged with the service day it runs, default Holiday).
3. **Agency:** name, URL, time zone (defaults from the import note, else blank and required).
4. **Map lines:** per G-E3.
5. **Checks:** run live; the Export button is disabled while a refusal stands, with "Show problems".

Entry points: Scenario menu "Export as GTFS feed…", and the Project menu next to "Export backup".

---

## Part 5 — Packages

Run rules: as in the parent plan, Part 7 (the orchestrator continues between packages without asking and stops at gates and sitting ends).

| Package | What | Class / model | After |
|---|---|---|---|
| E0 | Decision record 0090, sub-plan with cards, fixtures (expected `.txt` files for the mini Scenario) | Opus | Gate answers |
| E1 | Stop identity: merge rule (G-E1), generated ids, conflict list. Pure domain | Structural / Haiku `xhigh` | E0 |
| E2 | Feed builder: calendar from dates and holidays, routes, trips, stop times (incl. derived), blocks, shapes, feed info; stable ids; checks; report. Pure domain, plus a ZIP writer call | Structural / Haiku `xhigh` | E1 |
| E3 | Dialog mock-up (HTML), user approval | Opus | E0 |
| E4 | Dialog, menus, remembered values, download; a worker if a whole feed is slow | UI / Sonnet | E2, E3 |
| E5 | Read-back test with the phase I importer; whole-feed round trip (RTD import → export → import); MobilityData validator steps for the user; Analysis app load (user) | Structural / Haiku; Opus judges | E4 |
| E6 | Closeout: docs, backlog, full browser suite, code review at high effort | Opus | E5 |

Sittings: 1 = E0; 2 = E1, E2; 3 = E3 (stop for mock-up approval); 4 = E4; 5 = E5, E6.

### Verification per package

| Package | Run | Never cut |
|---|---|---|
| E1, E2 | Unit tests; expected-file comparison on the mini Scenario; Federal BRT export unit test; `pnpm typecheck`; full `pnpm test` | Expected-file comparison |
| E4 | New `tests/ui/gtfs-export.spec.ts`; `keyboard.spec.ts` (axe), `draggable-dialogs.spec.ts`, `scenario-context-menu.spec.ts`, `project-context-menu.spec.ts`; `pnpm build`; screenshots inspected | Typecheck, build |
| E5 | Read-back: export → import gives the same trips per Route and day, the same running hours (to the second), the same blocks; RTD round trip timed | Read-back test |
| E6 | Full `pnpm test:ui` | Full run |

---

## Part 6 — Fixed decisions

Inherited from the parent plan, Part 8 (D1 clean room, D2 share files not code, D3 GTFS as interchange, D4 seconds past 24:00, D5 great-circle distances, D6 hour vocabulary, D12 no new libraries, D13 no silent number changes; C-D1 to C-D3).

Added: **E-D1** export never writes to the Scenario except the remembered dialog values; **E-D2** every exported feed must import back through phase I without errors.

---

## Part 7 — Gates

**Gate G-E1 — Stops shared by several Routes** (old G-C1)
Question: GTFS has one stop per place; this tool stores stops inside each Route. How should the export join them?
- Option A (recommended): merge stops that share a stop ID and lie within about 30 m. Same ID but farther apart: refuse and list. No ID: generate one per Route (`<route>-<n>`), never merged.
- Option B: also merge stops with different IDs within 10 m.
- Option C: a shared stop list for the whole Scenario (a data change; later).
Example: imported stop "24223" on routes 0 and 0L becomes one stop. A planner's new stop with no ID on Federal BRT becomes `FBRT-7`.
What changes: A needs no data change, and imported Routes join automatically. B can join stops that are really across the street from each other.
If you say "your call": Option A.

**Gate G-E2 — Dates for the export** (old G-C2a)
Question: GTFS needs real dates. Where do the date range and holidays come from?
- Option A (recommended): entered in the dialog, remembered per Scenario (in the Scenario's settings, part of its backup), defaulting to the import note's dates when the Scenario came from a feed.
- Option B: entered each time, not remembered.
Example: 2027-01-04 to 2027-06-30, with MLK Day, Presidents Day and Memorial Day on Holiday.
What changes: A adds one optional Scenario field (backup schema 18). B adds nothing but repeats typing.
If you say "your call": Option A.

**Gate G-E3 — Map lines** (old G-C2b)
Question: what should `shapes.txt` contain?
- Option A (recommended): straight lines through each pattern's located stops and timepoints, said in `feed_info` and the report.
- Option B: no shapes.
- Option C (later, phase J): the alignment drawn in the Analysis app.
What changes: A draws routes on a map, but the lines cut corners.
If you say "your call": Option A.

**Gate G-E4 — Stops and timepoints without coordinates** (old G-C2c)
Question: GTFS requires a location for every stop. Some have none.
- Option A (recommended): refuse and list them.
- Option B: leave out the unlocated stops (their times disappear); refuse only for unlocated timepoints.
Example: 12 of 40 stops on a new pattern have no location.
What changes: A always gives a valid, complete feed.
If you say "your call": Option A.

**Gate G-E5 — Custom service days** ("Holiday 2")
Question: a custom day has no weekday. How is it exported?
- Option A (recommended): as a `service_id` with no weekday flags, active only on dates the planner assigns to it in the holidays list.
- Option B: leave custom days out, listed in the report.
If you say "your call": Option A.

**Gate G-E6 — Routes on their own counts**
Question: a Route that runs fewer days than the Scenario (a summer shuttle, Weekday 62) has a different calendar. Should the export show this?
- Option A (recommended): no; export it on the Scenario's calendar and list it in the report ("own counts not expressed in dates").
- Option B: give it its own `service_id`s and ask for its date range in the dialog.
What changes: A is simple; the feed shows the shuttle running all year. B is accurate but adds a per-Route date entry.
If you say "your call": Option A, revisit when a real case needs it.

**Gate G-E7 — Stops between timepoints**
Question: stops between timepoints have derived times. Write them?
- Option A (recommended): yes, with `timepoint=0` and the derived time, so trip planners and the Analysis app see every stop.
- Option B: timepoints only.
What changes: A gives a complete feed; B a smaller one where readers interpolate.
If you say "your call": Option A.

**Gate G-E8 — Trip ids**
Question: how are `trip_id`s made?
- Option A (recommended): `<route>-<day>-<direction>-<first departure HHMM>-<n>`, readable and stable while times stay.
- Option C: as A, but an unchanged imported trip keeps the feed's `trip_id`.
- Option B: generated from this tool's internal ids (stable, unreadable).
What changes: phase I did not store the feed's `trip_id`, so C needs a new optional Trip field (a backup schema change) and a re-import of existing feeds.
If you say "your call": Option A.

### Gate register

| Gate | Topic | Recommendation | Answer | Date |
|---|---|---|---|---|
| G-E1 | Shared stops | A: merge same ID within 30 m | | |
| G-E2 | Dates | A: dialog, remembered per Scenario | | |
| G-E3 | Map lines | A: straight lines | | |
| G-E4 | Unlocated stops | A: refuse and list | | |
| G-E5 | Custom days | A: date-only service | | |
| G-E6 | Own counts | A: report only | | |
| G-E7 | Non-timepoint stops | A: write with `timepoint=0` | | |
| G-E8 | Trip ids | A: readable | | |
| V-E | User check: load an export in the Analysis app and the MobilityData validator | Before closeout | | |

---

## Part 8 — Risks

1. **Unlocated stops** are common in planner-built Routes; G-E4 A may block many exports. The checks list must make fixing quick (link to the Stops table).
2. **Annual counts vs dates** never match exactly; the report must make the difference visible so it is not mistaken for an error.
3. **Size.** A whole-feed export is large and uncompressed; E5 measures it, and E4 uses a worker if building takes over about 2 s.
4. **Derived stop times** depend on stop timing rules; a rule change between export and import makes the read-back differ. The read-back compares timepoints and running hours, not every stop.
5. **Phase I open items** (gate V-I) may change import rules that the read-back test depends on.

---

## Progress log

### 2026-11-22 — Draft (Opus)

Drafted from the parent plan's section E and the deferred plan's C1 and C2, updated for phase I as built. Eight gates proposed, with recommendations. Next: user review and gate answers, then E0.
