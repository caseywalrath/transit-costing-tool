# GTFS import and export — plan

> **Status:** Plan approved 2026-11-21. All phase I gates answered except V-I (a later checkpoint). Interface decisions are listed in 5b. No work package has started. No decision record exists yet; the next step is I0 (1.3).
>
> **Origin:** adapted from the deferred plan `docs/gtfs-costing-tool-plan.md` in `caseywalrath/transit-analysis-tool` (branch `claude/friendly-brahmagupta-51rk4t`, commit `b5d9370`). Once the user approves this draft, this file governs and the Analysis app copy becomes a pointer (1.3).
>
> **Where the work happens:** only in this repository (`caseywalrath/transit-costing-tool`).

---

## Summary

**Primary goal:** import public GTFS feeds as editable baselines: a whole feed, or selected routes. Imported routes get timepoints, patterns, stops, run-time bands, trips with their real times, and (optionally) the feed's vehicle blocks. They can then be scheduled, blocked and costed like any other route.

**Secondary goals:**

- export this tool's schedules as GTFS;
- a round trip with the Analysis app (sketch there → schedule and cost here → analyse there).

### What changed from the deferred plan

| Change | Reason |
|---|---|
| Import (old C5) is now the first phase, **I**. Export (old C1 + C2) becomes phase **E**, after it. | The user's primary goal is import from public feeds. |
| Import works at three levels: a new project, a new scenario, or routes added to an existing scenario (Part 3). | The old plan never said where an import lands in the Project / Scenario / Trip profile structure. |
| Service days come from **one representative date per day**, not from `service_id`s (Gate G-I2). | Public feeds often have many `service_id`s per day, so they cannot map one-to-one onto service days. The Analysis app made the same choice (its gate G2b). |
| New gates: G-I1 to G-I7 (levels, dates, patterns, blocks, imported-trip status, scale, models). | These decisions were missing or only implied. |
| A structural checkpoint before the UI work: a command-line converter writes a normal project backup that the user opens with **Import project JSON** (Gate V-I). | It follows the Federal BRT converter (`docs/implementation/federal-brt-workbook-conversion.md`). The user can check real imported data before the import screens are built. |
| The old stop-identity phase C1 is folded into export (E). | Import keeps the feed's `stop_id`s, so most of C1's reconciliation is needed only at export. |
| Scenario comparison (old C3) moves up to the first optional phase after import. Blocks timeline and Marey chart stay optional. Interlining (old C4) stays deferred, with one exception (G-I4). | An imported "existing service" baseline makes "existing vs proposed" the most valuable comparison. |
| Start gates G-C0a and G-C0b are replaced. G-C0a: the user has started the work. G-C0b becomes G-I7. | — |
| The Analysis app round trip (old J1) is the last phase and optional. | Secondary goal. |

---

## Part 1 — Starting

### 1.1 Findings re-checked against current code

The deferred plan was written against `aea64aa`. Re-checked on `main` at `38323d8` (2026-11-21):

| Deferred-plan finding | Now |
|---|---|
| Stops belong to one Route; stop IDs are unique only within it (Decision 0079) | Unchanged. Decision 0087 added a Route **Stops** table with Split and Merge; Decision 0080 keeps timepoint stop IDs per pattern point. |
| No calendar dates on service days | Unchanged. `ServiceDayKind` includes `custom`, and backups accept custom days, but no screen creates or deletes one. Annual counts are per Scenario; the counts of all service days must total at most 365 (`MAX_ANNUAL_SERVICE_DAYS`, `src/domain/costing.ts`; edit check in `routeDefinitionService.ts`). |
| ZIP writer in `src/application/csvDownload.ts` | It re-exports `createCsvArchive` from `src/persistence/csv.ts`, which **stores files uncompressed**. That is fine for export. Reading public feeds needs a deflate reader (D12). |
| CSV reader | `parseCsv` in `src/application/csvRead.ts` reads whole text. A large `stop_times.txt` (100 MB or more) needs a streaming reader. |
| Direction groups | Decision 0088 added per-route display names. Import maps `direction_id` onto the **group** (Outbound/Inbound) and may propose a display name. |
| Trip times | `ScheduledPoint` holds **one** time per timepoint. There is no separate arrival and departure, so dwell at a timepoint is not stored. |
| Trip provenance | `kind` and `creationMethod` are `generated` or `manual`. There is no "imported" value (Gate G-I5). |
| Backup and database | Backup schema 16; Dexie 15. |
| Backup import-as-copy | `RouteDefinitionService.importProject(payload)` validates a whole project graph before writing, then writes it in one transaction. A GTFS import to a new project can build the same graph and reuse this path. |
| Route chooser | `RouteSwitcher` lists every Route as a radio item with type-ahead. It has not been tested with 100 or more Routes (Gate G-I6). |
| Capacity target | 500 trips per service day, 30 pattern points per pattern, 100 blocks per service day (`architecture_overview.md`, "Initial Capacity Target"). A whole large feed exceeds these (Gate G-I6). |

### 1.2 Inputs from the Analysis app

The Analysis app work is complete on branch `claude/friendly-brahmagupta-51rk4t` (not merged to its `main`). Its export contract is in `docs/reference/modules/gtfs.md`, section "Export drawn Services as GTFS", on that branch. The importer must handle that export as one more feed (Part 4, rule 12). Nothing else in this plan depends on the Analysis app.

### 1.3 Steps when the user approves this draft

1. Record the gate answers in Part 9.
2. Add a `docs/backlog.md` entry that points to this file, and an `architecture_overview.md` Phase 6 note.
3. In the Analysis app repository, replace `docs/gtfs-costing-tool-plan.md` with a one-paragraph pointer to this file. The user chooses the branch, because that file exists only on an unmerged branch.
4. Write the decision record(s) and the phase I sub-plan (Part 7). Present them, and start no package before approval.

---

## Part 2 — What a GTFS feed contains, and how it maps

GTFS Schedule is a ZIP of CSV text files (reference: <https://gtfs.org/documentation/schedule/reference/>).

### 2.1 File by file

| File | Holds | In the Costing tool today | Import proposal | Export proposal |
|---|---|---|---|---|
| `agency.txt` | Agency name, URL, time zone, language | Nothing | Shown in the wizard. The agency name and feed version go in the Scenario's import note (2.3 item 3). Multi-agency feeds: the route list filters by agency. | Dialog fields, remembered per project |
| `stops.txt` | `stop_id`, `stop_code`, name, latitude/longitude, `location_type`, `parent_station`, wheelchair boarding, platform code | Route stops `{name, stopCode, latitude, longitude, speedLimitMph}` per Route; timepoint stop IDs and locations per pattern point | Served stops (`location_type` 0 or blank) become Route stops or timepoints. Stop ID = GTFS `stop_id`. Stations, entrances and accessibility are not imported. | One stop per physical stop (old C1 rule) |
| `routes.txt` | `route_id`, short and long names, `route_type`, colour, sort order | Route `{name, shortName, description}` | Name = long name (or short name when the long name is blank); Short name = short name. Store `route_id`, `route_type` and colour (2.3 item 1). | Written from the stored values, with defaults |
| `trips.txt` | `route_id`, `service_id`, `trip_id`, headsign, `direction_id`, `block_id`, `shape_id` | Trip `{routeId, serviceDayId, patternId, publicLabel, stopTimes}` | `direction_id` → Outbound (0) or Inbound (1). Headsign → pattern name. `block_id` → Blocks (G-I4). `trip_short_name` → public label. `trip_id` is kept only in the import report. | `trip_id` from stable parts (old C2) |
| `stop_times.txt` | Arrival and departure at every stop, sequence, pickup and drop-off types, timepoint flag, `shape_dist_traveled` | Times only at timepoints; stop times derived (Decisions 0079, 0086) | Timepoint times are stored exactly. Other stop times become derived. The report gives the largest difference from the feed. | Timepoints `timepoint=1`; derived stops `timepoint=0` |
| `calendar.txt`, `calendar_dates.txt` | Service by weekday over a date range, plus added and removed dates | Service days with annual counts; no dates | One representative date per service day (G-I2). Annual counts proposed from the calendar. | Date range and holidays entered in the export dialog (old G-C2a) |
| `frequencies.txt` | Headway-based trips from a template | Planned frequencies (Decision 0058) exist, but are a plan, not trips | **Required:** expand every window into trips. The Analysis app writes one template trip per band. Optional: seed planned frequencies. | Optional windows for regular periods (phase J) |
| `shapes.txt` | Street-following line geometry | None; patterns hold segment miles | Used only to compute pattern miles along the line; not stored (2.3 item 4) | Straight lines through stops (old G-C2b) |
| `feed_info.txt` | Publisher, version, validity dates | Nothing | Goes in the import note | Written |
| Fares, transfers, pathways, levels, translations, attributions, Flex files | — | Out of scope | Ignored; listed as "not imported" in the report | Not written |

### 2.2 How the models differ

1. **Every stop vs timepoints.** GTFS times every stop. The Costing tool stores timepoint times and derives the rest. Import must **choose timepoints** (G-C5a, kept).
2. **Implicit vs managed patterns.** In GTFS every trip has its own stop sequence. Real feeds have many near-identical variants. The Costing tool has a few explicit patterns, each with run-time profiles. Import must **group trips into patterns** (G-I3).
3. **Calendars vs day types.** GTFS says which dates each trip runs. The Costing tool has Weekday / Saturday / Sunday / Holiday (plus custom days) with annual counts. Import must **pick dates** (G-I2).
4. **Blocks.** GTFS `block_id` is optional. It has no pull-out, pull-in, garage or deadhead, and real blocks often cross routes. The Costing tool's blocks need those for platform hours, and its Blocking screen is route-filtered (G-I4).
5. **System stops vs route stops.** One GTFS stop serves many routes. Here each Route owns its stops. Import copies a stop into each Route that serves it, with the same Stop ID. Export merges them back (phase E).
6. **No run-time bands.** GTFS has only resulting times. The Costing tool builds trips from bands. Import must **derive bands** from observed times (G-C5b, kept) and decide whether imported trips count as current against them (G-I5).
7. **No costs.** GTFS carries no rates. The Costing assumptions stay the planner's input.

### 2.3 Not covered today: add or not

| Gap | Recommendation |
|---|---|
| 1. GTFS route id, route type, route colour | **Add** as optional Route fields. They make re-export stable and let a later "refresh from a newer feed" find the route. Colour could feed the identity dot. Backup schema bump; no Dexie store change. |
| 2. Imported-trip status | **Add** a provenance value (G-I5). |
| 3. Where a scenario's data came from | **Add** an optional import note on the Scenario: feed publisher, feed version, file name, dates used, import time. It is shown in the Scenario menu. It is what makes an "existing service" baseline auditable. |
| 4. Shapes | **Do not store** for now. Use them to compute miles at import. Revisit with phase J (true alignments on export). |
| 5. Scenario-wide shared stops | **Do not add** now (old G-C1 Option A, merge at export). Same Stop ID across Routes is enough for import. |
| 6. Calendar dates on service days | **Do not store** for import. Export remembers its dates in the dialog (old G-C2a). |
| 7. Separate arrival and departure (dwell) at timepoints | **Do not add.** Import stores the departure at each timepoint and the arrival at the last, so running time is exact. The report counts timepoints that had dwell. |
| 8. Exact times at non-timepoint stops | **Do not add.** They are derived. Distance spacing is on by default for imports, because every stop has a location. The report gives the largest difference. |
| 9. Pickup and drop-off restrictions, accessibility, bikes | **Do not add.** Not costing inputs. |
| 10. Keep the last feed for adding more routes later | **Later idea:** a local "Recent feeds" store like the Analysis app's. It is not needed for a first release, because the planner can choose the ZIP again. |
| 11. Fetching a feed from a web address | **Not offered.** Most agency feed hosts do not allow browser downloads from other sites (the CORS rule), and this app has no server. The planner downloads the ZIP (from the agency's site or the Mobility Database) and opens it. |

---

## Part 3 — Where an import lands: Project, Scenario, Trip profile

Hierarchy (from `architecture_overview.md`): **Project → Scenario → (Service days, Routes with nodes, patterns, stops and runtimes; Trip profiles → Trips and Blocking scenarios → Blocks; Costing assumptions)**.

Routes, patterns and runtimes belong to the **Scenario**. Trips belong to a **Trip profile**, and Blocks to a **Blocking scenario** of that Trip profile. An import therefore always creates Routes in a Scenario and puts their Trips in one Trip profile.

| Level | What it creates | Example | Undo |
|---|---|---|---|
| **A. New project from a feed** | A Project named after the agency and feed version; one Scenario "Existing service" with its import note; the four standard service days with proposed annual counts; the Default Trip profile holding the trips; the empty Default Blocking scenario, plus a "From feed" Blocking scenario when blocks are imported | All 130 RTD routes, or just 0, 0L and 31, as a new project | Delete the project (already has a restore point) |
| **B. New scenario in an existing project** | The same as A, as a new Scenario of the current Project | Project "Federal Blvd BRT" gains an "Existing service (Jan 2027 feed)" Scenario next to the proposed one, so the two can be compared | Delete the scenario |
| **C. Add routes to an existing scenario** | New Routes in the current Scenario. Their trips go into **one chosen Trip profile** (default: the working one); other Trip profiles get none for those Routes. Blocks are added to a chosen Blocking scenario of that Trip profile, or not imported. Annual counts are not changed; differences are listed. | A proposed-network Scenario adds today's route 31 unchanged, so its cost is in the network total | A new restore point `importGtfsRoutes`, whose Undo deletes the added Routes |
| **D. Refresh an existing route from a feed** (not in this plan) | Replace or compare one Route's timetable with a newer feed | Re-import route 31 after a service change | — |

**Why not import "as a Trip profile"?** A Trip profile is an alternative timetable for Routes that already exist. Importing into one would mean matching feed stops to the planner's existing Nodes and patterns: level D. That matching is a separate, harder problem. It goes to the backlog.

**Route name clashes (level C):** a feed route whose name matches an existing Route in the Scenario is imported as "Name (feed)" and listed. Nothing is overwritten.

**Gate G-I1 — Where imports can go**
Question: At which levels should GTFS import be offered in the first release?
- Option A (recommended): a new project, a new scenario, and adding routes to an existing scenario (A, B and C above). Refreshing an existing route (D) goes to the backlog.
- Option B: a new project only. Scenarios and routes can be moved later with backup files.
- Option C: A, B and C now, and D as a later phase of this plan.
Example: under A, the planner opens the "Federal Blvd BRT" project and chooses **New scenario from GTFS feed…** to get today's routes 31 and 0L as a baseline beside the proposed BRT scenario.
What changes: A needs three menu entries and one shared import screen. No existing project, scenario or number changes unless the planner adds routes to it (level C), and that can be undone.
If you say "your call": Option A.

**Menu entries (proposal):**

- Project menu: **New project from GTFS feed…**
- Scenario switcher commands: **New scenario from GTFS feed…**
- Route switcher commands (Route tab): **Add routes from GTFS feed…**

All three open the same import screen with the target already chosen.

---

## Part 4 — Import rules

These rules go into the decision record in Opus's words, with worked examples on the fixtures. Haiku implements them as pure functions.

1. **Reading.** A hand-written ZIP reader (stored and deflate entries; `DecompressionStream("deflate-raw")`), plus a streaming CSV reader (BOM, CRLF, quotes, chunk boundaries). `trips.txt` is read first, so `stop_times.txt` keeps only the selected routes' rows. Both run off the main thread in a Web Worker where the browser allows it (Vite supports this). D12: no libraries.
2. **Dates (G-I2, answered).** Each service day gets one date. A trip is in that day if its `service_id` is active on the date (`calendar` weekday and range, plus `calendar_dates` additions and removals). The default is the most **representative** date, not the busiest:
   - **Service set of a date:** the set of `service_id`s active on it for the selected routes.
   - **Day groups:** every date in the feed's range is grouped by its service set. For each day of the week, the group with the most dates is the "typical" set. Example: Monday–Thursday share one set on 80 dates; school-only or event services add a second set on fewer dates.
   - **Default date:** a date of the typical set for that service day's days of the week (Monday–Friday for Weekday), with no `calendar_dates` exception on it, nearest the middle of the feed's range.
   - **Shown, not hidden:** the Days step lists every day group with its number of dates, trips, and what differs from the typical set ("+42 trips on routes 3, 11: school days", "+6 trips on Fridays"). The planner can choose any group, or any date in the range.
   - **Routes with no service on the chosen date** (seasonal or part-year routes) are flagged before import. The planner can give such a route its own date for that service day (G-I2c).
3. **Frequencies.** Every `frequencies.txt` window is expanded. `exact_times=1`: departures at `start + k × headway` below `end`. `exact_times=0`: the same, marked "approximate" in the report. Each expanded trip copies the template's stop times, shifted.
4. **Directions.** `direction_id` 0 → Outbound, 1 → Inbound. When the field is missing, trips are grouped by their pair of terminals, and the planner confirms which group is Outbound. The most common headsign or a compass direction is proposed as the direction's display name (Decision 0088).
5. **Patterns (G-I3).** Trips are grouped into patterns within a direction. A loop that returns to its first stop keeps repeated pattern points (already allowed).
6. **Timepoints (G-C5a).** A stop chosen as a timepoint becomes a Node of the Route (kind `terminal` at pattern ends, otherwise `timepoint`), and a pattern point on **every** pattern that serves it, so timetable columns line up across patterns. The Node name is the stop name. The pattern point carries the stop ID and location. Limit: 30 timepoints per pattern (capacity target). Over that, the suggestion thins to terminals plus stops closest to even run-time spacing.
7. **Stops.** Every other stop becomes a Route stop with a placement on its segment, timing "interpolate", spacing "By distance", rounding 1 second. A stop served by both directions is one stop record, as the Stops table expects (Decision 0087).
8. **Distances.** Pattern segment miles are measured along `shapes.txt`: each timepoint is projected onto the line in order. Without a shape, the miles are great-circle distances summed stop to stop, and the report says so. `shape_dist_traveled` is never used (D5).
9. **Run-time bands (G-C5b).** One Runtime profile per pattern and service day, named "{Day} from feed". Hourly bands hold the median observed segment time of the trips that start in that hour. Hours with no trips are merged into the nearest band. Method: `segmentStart`, the default for new profiles.
10. **Trips.** Times at timepoints are the feed's exact departures, and the arrival at the last point. Status per G-I5.
11. **Service days and annual counts (G-C5c).** Each date in the feed's range is counted under the service day whose set it matches (holidays per rule 11a). The counts are scaled to a 365-day year when the feed covers less, and shown for confirmation. Dates that match no service day are listed, not silently assigned. The 365 total rule (Decision 0041) applies.

11a. **Holidays (G-I2b, answered: classify from the data, assume nothing).**
   - **Candidate holidays** are dates where the feed itself departs from the normal day of the week: a `calendar_dates` removal of that day's regular service, an addition of other service, or both. Known public-holiday names are only labels for the list ("Mon May 31 — Memorial Day?"). They are never used to classify a date.
   - **Each candidate is classified per route**, by comparing that route's trips on the date with its trips on the chosen Saturday and Sunday dates:
     - **Saturday service:** same trips as Saturday;
     - **Sunday service:** same trips as Sunday;
     - **Reduced or other weekday:** a subset of, or a change to, the weekday trips (for example the day after Thanksgiving);
     - **Unique holiday service:** anything else, including a mix of Saturday trips on some routes and Sunday trips on others.
   - **Annual counts follow the classification.** A Saturday-service holiday adds one to the Saturday count, a Sunday-service holiday to the Sunday count. Unique holiday service goes to Holiday.
   - **Holiday trips:** when one or more dates have unique holiday service, the Holiday service day gets the trips of a date the planner picks (default: the unique-service date with the most trips). A second, different unique holiday service (for example Thanksgiving differing from Christmas) can become a **custom** service day ("Holiday 2"). The stored data and backups already accept custom days; the import creates it, but no screen can create or delete one today, so I0 decides whether a small Route-tab command is added. Otherwise its dates are counted under Holiday with the first date's trips, and the difference is reported.
   - **Mixed dates** are shown route by route, so the planner sees, for example, "route 15: Saturday trips, route 0: Sunday trips".
   - **No holiday exceptions in the feed:** the report says so. The feed runs normal service on those dates, and they count under their day of the week. Holiday is left with no trips and a count of 0, for the planner to set.
   - **The planner confirms or changes** every candidate's classification in the Days step before import.
12. **Analysis app sketches.** Their only timepoints are the first and last stops, so G-C5a's rule gives two-column run-time tables. Their headway windows may seed planned frequencies (old G-C5e, kept, optional).
13. **Blocks (G-I4).**
14. **Report.** Counts per route (patterns, timepoints, stops, trips per day, blocks), what was merged or thinned, what was not imported, and a **fidelity check**: trips and running hours per day from the feed vs. as imported. These must be equal; any difference is listed by trip.

**Gate G-I2 — answered 2026-11-21.** One real date per service day. The default is the most representative date (rule 2), not the busiest. Every day group is shown, so school-only or event service can be left out, and the planner can pick any date.

**Gate G-I2b — answered 2026-11-21.** Holidays are classified from the feed's own data, route by route (rule 11a), with no assumption that holidays run Sunday service. The planner confirms each classification.

**Gate G-I2c — answered 2026-11-21: per-route annual counts, opt in.** Every Route uses the Scenario's annual counts by default, exactly as today. A planner can switch a Route to its own counts; only then does that Route's Costing use them. The import proposes own counts for a part-year route (its real days in the feed, scaled to a year) but leaves the switch off unless the planner turns it on in the Days step.

Rules (for the decision record):
- Stored on the Route as an optional set of counts by service day. Absent = the Scenario's counts. A day missing from a Route's set uses the Scenario's count for that day.
- Whole numbers from 0 up; a Route's own counts may total at most 365.
- Costing uses a Route's counts for that Route's rows on both bases. With no Route switched on, every number is unchanged (D13; a test proves it).
- A Block that serves Routes with different counts (today's Unattributed row) uses the largest of their counts, with a finding.
- Scenario and Route copy carry the counts; backup schema 17 holds them; the Route tab's Annual service days panel shows them (5b, U1).

**Gate G-I3 — How trips are grouped into patterns**
Question: A real route often has many slightly different stop sequences (a skipped stop, a detour). How many patterns should the import make?
- Option A (recommended): one pattern per different sequence of **timepoints** in each direction. Variants that differ only in stops between timepoints share a pattern, which uses the stops of its most common variant.
- Option B: one pattern per different sequence of **stops**, as GTFS has them.
Example: a route's northbound trips might have 9 stop sequences but 3 timepoint sequences (full, short turn at Federal & 38th, and a garage trip). Under A: 3 patterns. Under B: 9.
What changes: A gives patterns a planner would draw and fewer run-time tables to maintain. A few trips' derived stop times use a stop they skip in reality; the report lists the variants merged. B keeps every stop exactly but multiplies patterns.
If you say "your call": Option A.

**Gate G-I4 — The feed's vehicle blocks**
Question: Some feeds include which trips each bus runs (blocks). Real blocks often switch between routes. What should the import do with them?
- Option A (recommended): offer "Import the feed's blocks" (on when the feed has them). A block is imported when **all** its trips that day are being imported. Blocks that also run on routes left out are not imported and are listed, and their trips stay unassigned for Auto-blocking. Pull-out and pull-in get a typed default (for example 10 minutes), or are left blank so platform hours show as incomplete.
- Option B: never import blocks; always use Auto-blocking.
- Option C: import partial blocks, cut down to the selected routes.
Example: importing one route whose 20 weekday blocks include 12 that also run another route's trips. Under A: 8 blocks imported, 12 listed, and their trips are left for Auto-blocking. Importing the whole feed: every block imports.
What changes: A reproduces the agency's real vehicle use and peak vehicles. Blocks that serve two routes appear in Costing's existing "Unattributed" row until interlining (old C4) sets a split rule. C would understate layover and overstate vehicles.
If you say "your call": Option A.

**Gate G-I5 — Imported trips and run-time bands**
Question: Imported trips keep their exact feed times, and the bands are medians, so most trips differ slightly from the bands. Should they show as "run times changed"?
- Option A (recommended): no. Imported trips are marked "From feed" and count as matching their bands until **you** change a band. After that, they show as changed, as built trips do today.
- Option B: yes, flag every trip whose times differ from its band, as the deferred plan proposed.
Example: a 07:12 trip that takes 41 minutes, where the band median is 39. Under A it is quiet until you edit that band. Under B it is flagged from the start, along with most of the route's trips.
What changes: A needs a new "From feed" trip status (a small stored-data addition). B needs no change but makes the "run times changed" marker useless on imported routes. Under both, regenerating a trip rebuilds it from the bands. Existing trips are unchanged.
If you say "your call": Option A.

**G-I2c note (2026-11-21, checked against code):** today's service days cannot model a part-year route by themselves:
- a custom "Summer weekday" day with 62 days holding only the shuttle's trips would cost the shuttle correctly, but 255 + 52 + 52 + 6 + 62 = 427 is refused by the 365-day total, which treats service days as separate calendar days;
- no screen creates custom days;
- every part-year schedule (summer weekday, summer Saturday, school-year weekday) would need its own day, shown on every Route's Day toggle.

Option B is therefore per-route counts: a Route may replace any service day's count with its own (shuttle: Weekday 62). Costing already groups hours by Route (`routeRows`), so the change is local to the count used for each Route's rows. A Route's own counts can only be fewer days than the year, so no new limit is needed beyond the usual whole-number check. One rule is needed: a Block that serves a part-year and a year-round Route (today's Unattributed row) uses the larger count, with a finding.

The old gates **G-C5a** (timepoints), **G-C5b** (hourly median bands), **G-C5c** (annual counts) and **G-C5e** (frequency windows) are kept as written in the deferred plan, with the rules above. **G-C5d** (keep exact times) is kept: Option A is assumed throughout.

---

## Part 5 — Import screen (proposal for the Opus design package)

One multi-step dialog (draggable, Decision 0068), with Back and Next. Each step's figures come from pure functions, never from the screen.

1. **Feed.** Choose the ZIP. It shows the agency, feed version, date range (with a warning when the feed has expired or ends within 30 days), the number of routes and stops, and files that will not be imported.
2. **Routes.** A table: short name, long name, type, agency, weekday trips, patterns. Checkbox per row, Select all, search, filter by type or agency. A running total: routes, weekday trips. Level C shows name clashes here.
3. **Days.** One row per service day: a date picker (default: the representative date, rule 2), trips on that date for the selected routes, and the proposed annual count (editable; level C shows the Scenario's counts instead). Below the rows:
   - the day groups, with their date counts and what differs from the typical set, each with "Use this";
   - routes with no trips on a chosen date, each with its own date picker (G-I2c);
   - the candidate holidays, with their per-route classification and a menu to change it (rule 11a).
4. **Options.** Timepoints (feed's flags, or suggested), pattern grouping (G-I3), import blocks plus pull-out/pull-in default (G-I4), seed planned frequencies (off unless the feed has `frequencies.txt`). Level C: the target Trip profile and Blocking scenario.
5. **Review.** Per-route counts and warnings, the fidelity check, and a timepoint review: each pattern's proposed timepoints, with add and remove before import. Then **Import**.

After import: a notice "{n} routes imported from {feed}" with Undo (level C) or "Open"; the first imported Route opens on the Route tab.

### 5b — Interface decisions

Some can be decided now; the rest are settled in the I7 mock-ups or when a package reaches them. "When" says which.

**Import screen**

| # | Decision | Proposal | When |
|---|---|---|---|
| W1 | A large dialog or a full-page workspace for the import | Large dialog (Decision 0068) with steps; a 130-route table fits with scrolling | Now or I7 |
| W2 | Route table: columns, sort, search, filters | Short name, long name, type, agency, weekday trips, patterns; sort by short name in route order; search and type filter | I7 |
| W3 | Days step: showing day groups, part-year routes and holiday classification without overwhelming | One row per service day up top; groups, part-year routes and holidays as collapsible sections with one-line results ("3 holidays · 2 Sunday service, 1 unique") | I7 (the hardest screen) |
| W4 | Timepoint review: editing which stops are timepoints, per pattern | A stop list per pattern with timepoint checkboxes and run time between timepoints; variants merged under G-I3 listed under the pattern | I7 |
| W5 | Which findings stop an import and which only inform | Stop: unreadable file, no trips on a chosen date. Inform: everything else, in the report | Decision record (I0) |
| W6 | Progress and cancel while a large feed is read | Progress line per file, Cancel; nothing is written until Import | I7 |
| W7 | After import: notice text, which Route opens, Undo for level C | As Part 5 | I7 |
| W8 | Where the report can be seen later | A "Download import report (CSV)" in the review step and in the notice; the Scenario's import note keeps the summary | I7 |

**Imported data in today's screens**

| # | Decision | Proposal | When |
|---|---|---|---|
| S1 | Where the Scenario's import note shows | Scenario switcher (a line under the name) and the Cost summary footnote | I7 |
| S2 | How "From feed" trips look in the Trips table, and what happens to the mark when a band is edited | A quiet "Feed" tag in the status cell; it changes to the existing "run times changed" mark once a band is edited (G-I5) | I7 |
| S3 | Use the feed's route colour | As the Route's identity dot in the Route switcher and Costing route rows; no other colour use | Now or I7 |
| S4 | Run-time profile names for imported patterns | "{Day} from feed" | Decision record (I0) |
| S5 | Blocks with no pull-out or pull-in | Existing "incomplete" marking; the import's default minutes are shown in the Blocking summary note | I7 |
| S6 | Blocks left out because they serve other routes | Listed in the report; their trips appear as unassigned in Blocking, as any unassigned trip does | Decided |

**Per-route annual counts (G-I2c)**

| # | Decision | Proposal | When |
|---|---|---|---|
| U1 | Where the switch and the counts are edited | The Route tab's **Annual service days** panel (already beside Route details): a "This route uses its own counts" switch; when on, a second column "This route" beside the Scenario's counts, with the Scenario value shown faintly in blank cells (the inherited-value style of Decision 0077) | Now |
| U2 | How Costing shows a Route on its own counts | A small marker on the Route row in the Cost breakdown, with the counts in its tooltip; the Cost summary and CSV name the counts used | I9b |
| U3 | Where extra service days are added and removed | Annual service days panel: "Add service day…" and a row menu with Delete (with the existing deletion review); five or more days make the Day toggles fall back to a menu | I9b |

**Many routes (G-I6)**

| # | Decision | Proposal | When |
|---|---|---|---|
| M1 | Route switcher with 100+ Routes | Type-ahead is there today; add a search box and sort by short name in route order | I10, from measurements |
| M2 | Costing route table with 100+ rows | Sort by annual cost, a "Top 20 / All" toggle | I10 |
| M3 | Blocking's Route filter with 100+ Routes | Same chooser as M1 | I10 |

Export, comparison, interlining and round-trip screens are decided in their own phases.

---

## Part 6 — Other phases (secondary)

### E — GTFS export (old C1 + C2)

Kept as written in the deferred plan (dialog, file list, mapping table, pre-export checks, stable ids, gates G-C1, G-C2a, G-C2b, G-C2c), with these changes:

- **Stop identity:** imported Routes share GTFS `stop_id`s, so the G-C1 merge (same Stop ID within about 30 m) joins them without work from the planner.
- **Route ids:** use the stored GTFS `route_id` when present (2.3 item 1), so an import followed by an export keeps the agency's ids.
- **Scope:** one Trip profile; all Routes or selected Routes; optional Blocking scenario for `block_id`.
- **Check:** the exported ZIP is read back by this plan's own importer (phase I) in an automated test: same trips, running hours and blocks. The user runs the MobilityData validator once per release.

### V — Scenario comparison, then blocks timeline and Marey chart (old C3)

Kept, with the comparison first (old G-C3 Option A). An imported baseline makes "Existing service vs Proposed" the main use: change in trips, revenue hours, peak vehicles and cost, by route. The timeline and Marey chart are optional and can be dropped without a gate.

### X — Interlining (old C4)

Deferred, as the backlog says. The one link to import: imported multi-route blocks use today's "Unattributed" row. If the user wants imported blocks costed per route sooner, G-C4c (split by revenue hours) can be pulled into phase I as one small package.

### J — Round trip with the Analysis app (old J1)

Kept as written, last and optional. It needs I and E.

---

## Part 7 — Phase I packages

Every phase follows `AGENTS.md` and `codex.md`: a decision record in `docs/decisions/`; a sub-plan in `docs/implementation/` with a "Verification per package" table; structural and UI packages kept apart, with a user gate between them; no automatic start of the next package.

**Models (G-I7):** Haiku (`high` or `xhigh` effort) does most packages from exact work cards written by Opus. Opus writes the decision record, the cards with worked examples, the import-screen design, reviews every package, and integrates. Sonnet may take a package that Opus judges too broad for Haiku (G-I7, answered yes); the sub-plan names those packages for user approval.

| Package | Content | Class / model | Depends on |
|---|---|---|---|
| I0 | Decision record(s): Part 4 rules, G-I answers, data additions (2.3 items 1–3), backup schema 17. Phase I sub-plan and Haiku work cards. Test fixtures: the Analysis app's `test/fixtures/gtfs/mini` (our own file; copied, not shared code), plus hand-made edge feeds (no `direction_id`, `exact_times=0`, loop, multi-route blocks, empty non-timepoint times, deflate ZIP). | Opus | Gate answers |
| I1 | ZIP reader and streaming CSV reader, pure, with unit tests | Structural / Haiku | I0 |
| I2 | Feed model: calendar on a date, frequency expansion, trips on a date per route, feed summary for steps 1–3 | Structural / Haiku | I1 |
| I2b | Day groups, representative dates, part-year route detection, holiday candidates and per-route classification, annual counts from classified dates (rules 2, 11, 11a), with edge fixtures: school-day service, Friday extras, Saturday-service holiday, mixed Saturday/Sunday holiday, unique holiday, a feed with no exceptions | Structural / Sonnet (several rules interact), Opus review | I2 |
| I3 | Translation, part 1: directions, pattern grouping, timepoint suggestion, Nodes, stops and placements, locations, distances along shapes | Structural / Haiku `xhigh`, Opus review | I2b |
| I4 | Translation, part 2: run-time bands, trips and status, service days and annual counts, blocks, optional planned frequencies, report and fidelity check | Structural / Haiku `xhigh`, Opus review | I3 |
| I5 | Persistence: new Route and Scenario fields (incl. per-route annual counts), trip status, backup schema 17 with round-trip and older-version tests, Scenario and Route copy remapping | Structural / Haiku | I0 |
| I6 | Application service: three targets (A via the project-import path; B and C through one Scenario write), restore point `importGtfsRoutes`, Web Worker wrapper; plus `tools/gtfs_to_backup.mjs`, which writes a project backup from a feed | Structural / Haiku | I4, I5 |
| **Gate V-I** | **User check:** the agent converts the mini feed and 2–3 real routes from a feed the user names into backup files. The user opens them with **Import project JSON** and checks routes, trips, blocks and costs against the agency's published numbers. | User | I6 |
| I7 | Import screen design: mock-ups of the five steps in `docs/implementation/gtfs-import/`, for user approval | UI design / Opus | V-I |
| I8 | Import screen wiring from the approved mock-ups, steps 1–3 | UI / Haiku (precise card) | I7 |
| I9 | Import screen steps 4–5, timepoint review, menu entries, after-import notice | UI / Sonnet from the approved mock-ups, Opus review | I8 |
| I5b | Costing with per-route annual counts (both bases, Unattributed rule), Cost summary and CSV naming the counts used; tests that totals are unchanged with no Route switched on | Structural / Haiku `xhigh`, Opus review | I5 |
| I9b | Per-route counts on the Route tab, Costing markers, and the extra-service-day command (5b, U1–U3) | UI / Sonnet, Opus review | I7, I5b |
| I10 | Scale: a whole large feed (G-I6), Route chooser with many Routes, Costing and Trips load times; fixes found | Structural / Haiku; Opus judges results | I9 |
| I11 | Closeout: full browser suite, `architecture_overview.md`, `docs/data-schema.md`, `docs/domain-glossary.md`, `docs/ui-conventions.md`, backlog | Opus | I10 |

**Draft verification table** (the I0 sub-plan finalises it, following `codex.md`):

| Package | Run | Skip | Do not cut |
|---|---|---|---|
| I1–I4 (incl. I2b) | Their unit tests; typecheck; full unit suite at package end | Browser suite (no screen or storage change) | Typecheck |
| I5 | Backup and migration unit tests; `tests/ui/backup-import.spec.ts`, `database-migration.spec.ts`, `scenario-copy-recovery.spec.ts`; backup round trip | Other browser specs | Persistence, migration and backup tests; round trip |
| I6 | Service tests with fake-indexeddb; `tests/ui/undo-history.spec.ts`, `data-safety.spec.ts`; converter run on the fixtures | Screen specs | Restore-point tests |
| I8–I9 | New `tests/ui/gtfs-import.spec.ts`; `draggable-dialogs.spec.ts`, `keyboard.spec.ts` (axe), `project-context-menu.spec.ts`, `scenario-context-menu.spec.ts`, `context-line.spec.ts`; build; screenshots | Blocking and Costing specs not touched | Typecheck; build |
| I10 | `capacity-read-paths.spec.ts`, `recalculation-capacity.spec.ts`, new large-feed timing check | — | Typecheck |
| I11 | Full browser suite | — | Full run |

**Gate G-I6 — How big an import may be**
Question: A whole large feed (for example RTD: about 130 routes, many thousands of weekday trips) is far beyond the sizes this tool was tested for. How should the first release handle it?
- Option A (recommended): allow a whole feed. Above 40 routes or 5,000 trips per day, the screen warns that the tool may be slow. Package I10 measures a real large feed, and its result decides whether a hard limit is needed.
- Option B: limit an import to 20 routes until I10 shows larger imports work.
Example: under A, importing all of RTD takes some seconds and shows a warning first. Under B, the planner imports RTD in groups of 20 routes using level C.
What changes: A meets the "whole feed" goal at once, at the risk of slow screens on very large scenarios. Nothing existing changes either way.
If you say "your call": Option A.

**Gate G-I7 — answered 2026-11-21.** Sonnet may take packages that Opus judges too broad for Haiku. The sub-plan names them (currently I2b and I9) for user approval, and I0 records the Sonnet class in `AGENTS.md`.

---

## Part 8 — Fixed decisions

Inherited unchanged from the Analysis app plan: **D1** clean room (no GTFS·X code, data or assets); **D2** each app keeps its stack, they share files not code; **D3** GTFS is the interchange format; **D4** integer seconds after service-day midnight, past 24:00 valid; **D5** great-circle distances, `shape_dist_traveled` never trusted; **D6** hour vocabulary (running, revenue including layover, platform), every cost names its basis; **D12** no new libraries; **D13** no silent number changes.

Added: **C-D1** governance by `AGENTS.md` and `codex.md`; **C-D2** the Analysis app contract is its export as built (`docs/reference/modules/gtfs.md` on its branch); **C-D3** one phase at a time, with a recommendation at each gate.

New for this plan:

- **I-D1 — Imports never change existing data except by level C**, which only adds Routes, Trips and Blocks and can be undone. Annual counts, Costing assumptions and other Routes are untouched.
- **I-D2 — Imported trips keep the feed's times exactly at timepoints** (G-C5d A). Bands are derived and never used to rebuild imported trips unless the planner regenerates.
- **I-D3 — Every import is validated as a whole before any write**, with the existing backup validators where the target allows it, and written in one transaction.

---

## Part 9 — Gate register

| Gate | Question (short) | Recommendation | Answer | Date |
|---|---|---|---|---|
| G-I1 | Import levels | New project, new scenario, add routes | A (as recommended) | 2026-11-21 |
| G-I2 | Days from the feed | One date per service day | One date per service day, default the most representative (not busiest); all day groups shown; any date may be picked (rule 2) | 2026-11-21 |
| G-I2b | Holiday service | — | Classify each holiday from the data, route by route; no Saturday/Sunday assumption; planner confirms (rule 11a) | 2026-11-21 |
| G-I3 | Pattern grouping | By timepoint sequence | A | 2026-11-21 |
| G-I4 | Feed blocks | Whole blocks only, rest listed | A | 2026-11-21 |
| G-I5 | Imported trips vs bands | "From feed", quiet until bands change | A | 2026-11-21 |
| G-I6 | Import size | Whole feed, warn above 40 routes / 5,000 trips | A | 2026-11-21 |
| G-I2c | Part-year routes | — | Per-route annual counts, opt in; Scenario counts by default | 2026-11-21 |
| Custom days command | Add/remove extra service days | Yes, small Route-tab command | Approved | 2026-11-21 |
| G-C4c early | Split shared-bus hours in phase I | Not pulled in; Unattributed row stays | Plan approved as written | 2026-11-21 |
| G-I7 | Sonnet allowed | — | Yes, for packages the sub-plan names | 2026-11-21 |
| G-C5a | Timepoints | Feed's flags, else suggested | A | 2026-11-21 |
| G-C5b | Bands from real times | Hourly medians | A | 2026-11-21 |
| G-C5c | Annual counts | From calendar, confirmed | A | 2026-11-21 |
| G-C5d | Exact or rebuilt trips | Exact | A | 2026-11-21 |
| G-C5e | Frequency windows → plan | Busiest direction, conflicts listed | A | 2026-11-21 |
| V-I | User check of converted backups | — | | |
| G-C1, G-C2a–c | Export gates (phase E) | As in the deferred plan | | |
| G-C3 | Views order (phase V) | Comparison first | | |
| G-C4a–c | Interlining (phase X) | As in the deferred plan | | |
| G-J1 | GTFS alone for the round trip | GTFS only | | |

---

## Part 10 — Risks

1. **Feed variety.** Real feeds break rules: missing `direction_id`, all stops or no stops marked as timepoints, blank times, duplicate sequences, loops, trips past 48:00. The edge fixtures (I0) and the fidelity check catch these. The report lists what was repaired; nothing is repaired silently (D13).
2. **Scale (G-I6).** Large feeds stress parsing, storage and scenario-wide screens. I10 measures them before closeout.
3. **Backups.** New fields raise the backup schema to 17. Older files stay readable; round-trip tests are never cut.
4. **Restore point size.** Level C stores only the added ids, so it stays small. Levels A and B are undone by deleting the project or scenario.
5. **Licensing (D1).** Reviews check that no GTFS·X code, data or text enters the repository. Public feeds are the planner's own downloads and are not committed. Only the small hand-made fixtures are.

---

## Progress log

### 2026-11-21 — Draft adapted from the deferred plan (Opus)

- Re-checked the deferred plan's findings against `main` at `38323d8` (1.1).
- Reordered for the primary goal (import), defined import levels, added gates G-I1 to G-I7 and V-I, folded C1 into export, and moved the round trip last.
- No code changed. Awaiting the user's gate answers.

### 2026-11-21 — Gate answers (user)

- G-I1, G-I3 to G-I6, G-C5a to G-C5e: as recommended.
- G-I2: one date per service day, but the default is the most representative date rather than the busiest, so school-only and event exceptions are not captured by default; the planner may pick any date. Rule 2 rewritten: day groups by active service set, typical set per day of the week, default date with no exception nearest the middle of the range, every group shown.
- G-I2b: classify holidays from the data, route by route, with no Saturday or Sunday assumption; agencies may run Saturday, Sunday, a mix, or unique service. New rule 11a; a second distinct holiday service can become a custom service day.
- New gate G-I2c (part-year routes), raised by the user's point on routes that run for part of the year. Open.
- G-I7: Sonnet may be used. New package I2b (day groups and holidays) goes to Sonnet; I9 moves to Sonnet.

### 2026-11-21 — Plan approved (user)

- G-I2c: per-route annual counts, opt in; Scenario counts stay the default. New packages I5b (Costing) and I9b (screens).
- Approved as recommended: a small command to add and remove extra service days; G-C4c not pulled in (the Unattributed row stays until interlining).
- Added 5b, the list of interface decisions, with when each is settled.
- Still needed before V-I: the agency feed (ZIP, supplied by the user) and 2–3 test routes.

