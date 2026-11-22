# Decision 0089: GTFS Import

- Status: Accepted 2026-11-21 (gate answers in `docs/implementation/gtfs-interoperability.md`, Part 9); record approved by the user 2026-11-21. Not implemented.
- Date: 2026-11-21
- Plan: `docs/implementation/gtfs-interoperability.md` (whole programme); `docs/implementation/gtfs-import-phase-i.md` (phase I sub-plan and work cards)
- Related: Decisions 0011 (Outbound and Inbound groups), 0041 (365-day total), 0058 (planned frequencies), 0068 (draggable dialogs), 0077 (inherited-value style), 0079, 0080, 0085, 0086, 0087 (Route stops, stop IDs, locations, distance spacing, Stops table), 0081 (restore points), 0088 (direction names)

## Context

Planners want to start from an agency's published service: a whole public GTFS feed, or a few of its routes. GTFS times every stop, groups trips by calendar dates and leaves patterns implicit. This tool stores timepoint times, service days with annual counts, and explicit patterns with run-time bands. The import has to translate between the two without changing any number silently (fixed decision D13 of the plan). The plan's Parts 2–5 hold the reasoning. This record holds the rules.

## Decision

### A. Where an import lands

1. **Three levels.** A: a new Project. B: a new Scenario in the current Project. C: new Routes in the current Scenario. Refreshing an existing Route from a newer feed (level D) is not part of this decision; it is in the backlog.
2. **Level A** creates a Project named "{agency name} ({feed version or first date})", with one Scenario "Existing service", the four standard service days, the Default Trip profile holding the trips, the empty Default Blocking scenario, and a "From feed" Blocking scenario when blocks are imported. It is written through the existing project-import path, as a copy (`importProject(payload)`). Undo: delete the Project (existing restore point).
3. **Level B** creates the same Scenario contents as level A inside the current Project. The Scenario is named "Existing service ({feed version or first date})", with " 2", " 3" added on a clash. Undo: delete the Scenario (existing restore point).
4. **Level C** adds Routes to the current Scenario.
   - Their trips go into one chosen Trip profile (default: the working one). Other Trip profiles get no trips for these Routes.
   - Blocks go into a chosen Blocking scenario of that Trip profile, or are not imported.
   - The Scenario's annual counts are not changed. The import's proposed counts are listed beside them, and any difference is reported.
   - A feed route whose name matches an existing Route of the Scenario (ignoring case) is imported as "{name} (feed)" and listed. Nothing is overwritten.
   - A new restore point `importGtfsRoutes` is taken before the write. Its Undo removes the added Routes and everything they own (Nodes, patterns, stop set, profiles, assignments, trips, blocks that hold only their trips).
5. **One write.** Levels B and C write through one Scenario write (one transaction). Nothing is written before the planner presses **Import**.

### B. Reading the feed

6. **ZIP.** A hand-written reader of stored and deflate entries. Deflate is decompressed with `DecompressionStream("deflate-raw")`. The feed's files may be at the root of the ZIP or inside one common folder. Encrypted entries, ZIP64 archives, multi-part archives and other compression methods are refused with a message naming the problem. No library is added (D12).
7. **CSV.** A streaming reader: a byte-order mark is removed; CRLF, LF and CR line ends are accepted; quoted fields may hold commas, quotes (`""`) and line breaks; a chunk may end anywhere, even inside a quoted field or between CR and LF. Header names are trimmed. Unknown columns are ignored. Rows with only empty fields are skipped. Field values are not trimmed except where a rule below says so.
8. **Order.** `routes.txt`, `trips.txt` and the calendars are read first. `stop_times.txt` is then read once, keeping only rows of trips of the selected routes.
9. **Where it runs.** The reading and translation run in a Web Worker when the browser allows it, and on the main thread otherwise. The result is the same.
10. **Files used:** `agency.txt`, `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`, `calendar.txt`, `calendar_dates.txt`, `frequencies.txt`, `shapes.txt`, `feed_info.txt`. Every other file is listed in the report as "not imported".

### C. What stops an import and what only informs (5b W5)

11. **Stops the import**, with a message and nothing written:
    - the file is not a readable ZIP, or uses a feature refused in item 6;
    - `stops.txt`, `routes.txt`, `trips.txt` or `stop_times.txt` is missing, or both `calendar.txt` and `calendar_dates.txt` are missing;
    - a required column is missing (`route_id` in `routes.txt`; `route_id`, `service_id`, `trip_id` in `trips.txt`; `trip_id`, `stop_id`, `stop_sequence` and a time column in `stop_times.txt`; `stop_id` in `stops.txt`);
    - no selected route has a trip on any chosen date.
12. **Informs only**, in the report: everything else. Examples: an invalid trip (blank time at its first or last stop) is left out and listed; a stop with no location; a route with no trips on a chosen date; a feed that has expired.

### D. Dates and service days (G-I2, G-I2b)

13. **Service days of a new Scenario** (levels A, B): Weekday (Monday–Friday), Saturday, Sunday, Holiday, as for any new Scenario, plus custom days from item 19.
14. **A trip runs on a date** when its `service_id` is active on that date: `calendar.txt` gives the weekdays and the date range (both ends included); a `calendar_dates.txt` row with `exception_type` 1 adds the date, 2 removes it. A trip belongs to the date its service runs on, even when it runs past 24:00.
15. **Service set of a date:** the set of `service_id`s active on it that have at least one trip of the selected routes. **Day groups:** the dates of the feed's range grouped by service set. For each day of the week, the **typical set** is the set with the most dates on that day of the week; a tie goes to the set whose first date is earliest.
16. **Default date per service day** (rule 2 of the plan):
    - Weekday: a Monday–Friday date whose set is the typical set of its day of the week, with no `calendar_dates` row on it, nearest the middle of the feed's range (a tie goes to the earlier date). When the typical sets of Monday to Friday differ (for example extra Friday trips), the set covering the most Monday–Friday dates is used, and the others are shown as day groups.
    - Saturday and Sunday: the same rule on that day of the week.
    - Holiday: item 19.
    - The **feed's range** is from the earliest to the latest date on which any selected route has a trip.
    - The planner may choose any day group or any date in the range instead.
17. **Part-year routes.** A selected route with no trip on the date chosen for a service day, but with trips on other dates of that day's days of the week, is flagged. The planner may give that route its own date for that service day. Its trips on that service day then come from its own date.
18. **Holiday candidates:** dates where the feed departs from the normal day of the week: a `calendar_dates` removal of a service that the typical set of that day of the week contains, an addition of a service it does not contain, or both. Public-holiday names are only labels in the list; they never classify a date.
19. **Holiday classification, per route and per candidate date**, comparing the route's trips on the date with its trips on the chosen Saturday and Sunday dates. Two trips are the same when they have the same direction, the same stop sequence and the same first departure (amended 2026-11-21, sub-plan section 10).
    - **Saturday service:** the same set of trips as Saturday.
    - **Sunday service:** the same set of trips as Sunday.
    - **Reduced or other weekday:** every trip is one of the chosen Weekday date's trips, or the date has the typical Monday–Friday set with some of it removed.
    - **Unique holiday service:** anything else.
    - **No trips:** the route does not run that date.
    - A date is Saturday-service (or Sunday-service) for the Scenario only when every route that runs it is; otherwise it is shown route by route as mixed and counts as Unique.
    - **Holiday service day:** gets the trips of one unique-service date chosen by the planner (default: the unique-service date with the most trips; tie: the earliest). A second unique-service date whose trips differ from the first becomes a custom service day "Holiday 2" ("Holiday 3" for a third), when the planner keeps the proposal; otherwise its dates count under Holiday with the first date's trips, and the report gives the difference in trips and hours.
    - With no candidates, the report says "This feed has no holiday exceptions". Holiday gets no trips and a count of 0.
    - The planner confirms or changes every classification before import.
20. **Annual counts (rule 11).** Every date of the feed's range is counted under one service day: Saturday-service and Sunday-service holidays under Saturday and Sunday; reduced-weekday dates under Weekday; unique dates under Holiday or their custom day; all other dates under their day of the week.
    - If the range has fewer than 365 dates, each count is multiplied by 365 / (dates in range) and rounded by the largest-remainder method, so the counts total exactly 365.
    - If the range has more than 365 dates, only the 365 dates centred on the middle of the range are counted (when the centre falls between two dates, the earlier start is used).
    - Dates that match no service day (no trips at all on the selected routes) are listed and counted under their day of the week, with a finding.
    - Example: `edge-no-direction`, 26 dates (Weekday 20, Saturday 3, Sunday 3) → 281, 42, 42.
21. **Per-route counts (G-I2c, opt in).** See item 41. The import proposes a Route's own counts only for a flagged part-year route (item 17): its own dates counted as in item 20, with the same scale factor as the Scenario's, and no rounding to 365. The switch stays off unless the planner turns it on.

### E. Frequencies and trips

22. **Frequencies.** Every `frequencies.txt` window is expanded: departures at `start_time + k × headway_secs` for every value below `end_time`. Each expanded trip copies the template's stop times, shifted by the same amount. The template trip itself is not an extra trip. `exact_times=0` (or blank) gives the same trips, marked "approximate" in the report.
23. **Invalid trips** (no time at the first or last stop after sorting by `stop_sequence`) are left out and listed. Rows of a trip are sorted by `stop_sequence` as a number; repeated sequence numbers make the trip invalid.

### F. Directions, patterns, timepoints, stops

Items 24–29 are amended by `docs/implementation/gtfs-import-phase-i.md` section 12a (2026-11-21): flagged timepoints apply per direction, mixed `direction_id`, bad route fields, missing locations.

24. **Directions (rule 4).** `direction_id` 0 → Outbound, 1 → Inbound. When the column is absent or blank on every trip of a route, its trips are grouped by (first stop, last stop). The group with the most trips is proposed as Outbound, and its reverse pair (if any) as Inbound; a tie goes to the group with the earliest first departure. Other pairs join the direction whose terminal pair shares the first stop, otherwise Outbound; the planner confirms. A direction's proposed name is its most common non-blank headsign (Decision 0088 rules: trimmed, at most 40 characters, the two names must differ; on a clash the defaults are kept).
25. **Patterns (G-I3, Option A).** Within a direction, one pattern per distinct sequence of timepoint stop IDs. Its stops are the stop sequence of its most common variant (tie: the variant of the earliest trip). Other variants are listed in the report as merged.
    - **Pattern name:** the most common non-blank headsign of its trips; when blank, "{first timepoint name} to {last timepoint name}". Duplicate names in a Route get " 2", " 3".
    - A loop that returns to its first stop keeps both pattern points.
26. **Timepoints (G-C5a).**
    - **Feed's flags**, when any `stop_times` row of the route has `timepoint` = 1: a trip's timepoints are its rows with `timepoint` = 1, plus its first and last stop always.
    - **Suggested**, when the route has no such row: per direction, from the most common stop sequence, choose N = round(median running minutes / 10) + 1 stops, at least 2 and at most 30: the two terminals, plus the stops whose times are closest to even shares of the running time. Each trip's timepoints are the chosen stops it serves, plus its own first and last stop.
    - **At most 30 per pattern.** Above 30, the pattern keeps its terminals plus the stops closest to even shares of its running time, and the report lists the dropped ones.
    - A timepoint whose time is blank in a trip is filled by great-circle distance between that trip's neighbouring timed stops, and listed.
    - The planner can add and remove timepoints per pattern before import.
27. **Nodes.** One Node per distinct timepoint stop ID in a Route. Kind `terminal` when it is the first or last point of any pattern, otherwise `timepoint`. Name = `stop_name` (trimmed). A pattern point is placed on **every** pattern that serves the stop as a timepoint.
28. **Stops (Decisions 0079–0087).** Every other served stop (`location_type` 0 or blank) becomes a Route stop: stop ID = GTFS `stop_id`, name = `stop_name`, location from `stop_lat`/`stop_lon` when both are valid numbers. One stop record per stop ID per Route, even when both directions serve it. Each placement sits on the segment from the preceding timepoint, in stop order, with timing `interpolate`. The Route's stop set uses distance spacing (`distance`) and rounding 1 second. Timepoints carry their stop ID (Decision 0080) and location (Decision 0085). Stations, entrances and accessibility fields are not imported.
29. **Distances (rule 8, D5).** Pattern segment miles are measured along the pattern's shape (the most common `shape_id` of the trips of its most common variant). Each timepoint is projected onto the line in order; a later timepoint is never projected before an earlier one. Without a usable shape (missing, fewer than 2 points, or a timepoint more than 0.25 miles from the line), the miles are great-circle distances summed stop to stop along the pattern's stops, and the report says so per pattern. `shape_dist_traveled` is never used. Great-circle distance uses an Earth radius of 3958.8 miles.

### G. Run times and trips

30. **Run-time profiles (G-C5b, 5b S4).** One profile per pattern and service day, named "{service day name} from feed" (for example "Weekday from feed"), with method `segmentStart` and an assignment for that pattern and service day.
    - Bands are hourly. A band holds the trips whose first departure falls in its hour. Each segment value is the median of those trips' segment times; for an even count, the mean of the two middle values, rounded half up to a whole second.
    - Bands run from the first trip's hour to the end of the last trip's hour. An hour with no trips joins the band before it; band labels are "HH:MM–HH:MM".
    - Times past 24:00 are kept (D4).
31. **Trips (G-I5, Option A; G-C5d kept).**
    - Times at timepoints are the feed's exact departures; the last point uses the arrival. Dwell is not stored; the report counts timepoints with dwell.
    - `publicLabel` = `trip_short_name` when present. `trip_id` appears only in the report.
    - **Status "From feed".** `provenance.creationMethod` = `feed` (a new value). `kind` = `generated`, `manuallyChangedFields` = [], and `calculationSource` = the trip's run-time profile as imported. The trip therefore counts as matching its bands until the planner changes a band; then it shows "run times changed", as a built trip does. Regenerating rebuilds it from the bands.
32. **Planned frequencies** (old G-C5e) are seeded only when the planner asks and the feed has `frequencies.txt`: one period per window, at its headway.

### H. Blocks (G-I4, Option A)

33. "Import the feed's blocks" is on when any selected trip has a `block_id`.
34. A block is imported for a service day when **every** trip with that `block_id` on that service day's date is being imported. Others are listed ("also serves {routes}"); their imported trips stay unassigned, for Auto-blocking or manual blocking.
35. An imported block: label = `block_id` (a repeated label on the same service day gets " (2)"); its trips in time order as revenue-trip activities; a pull-out and a pull-in with the planner's minutes. **Minutes are required** when blocks are imported (whole minutes, 0 allowed; the screen pre-fills 10): blank minutes would fail the existing block checks (user decision 2026-11-22, replacing "or without minutes"). Between trips that end and start at different Nodes, including two Routes' Nodes at a shared stop, a deadhead activity with 0 minutes and no miles is added. A block the existing validation still refuses is left out and listed.

### I. Report and fidelity check

36. The report lists per route: patterns, timepoints, stops, trips per service day, blocks; merged variants, thinned timepoints, filled blank times, approximate frequencies, invalid trips; files and fields not imported.
37. **Fidelity check:** for each service day and route, the number of trips and the running hours (first departure to last arrival, summed) from the feed on the chosen date, and as imported. They must be equal. Any difference is listed by trip. The report can be downloaded as CSV.

### J. Stored data (backup schema 17)

38. **Route** gains optional `gtfsRouteId` (string), `gtfsRouteType` (whole number) and `color` (six hexadecimal digits, upper case, no "#"). `color` shows as the Route's identity dot in the Route switcher and in Costing route rows (5b S3); nothing else uses it.
39. **Scenario** gains optional `importNotes`: a list, one entry per import into it, each with publisher (agency name), feed version, file name, the date used per service day, the number of Routes, and the import time. Shown in the Scenario switcher and the Cost summary footnote (5b S1, settled in I7).
40. **Trip** `provenance.creationMethod` accepts `feed`.
41. **Route** gains optional `ownAnnualServiceDays`: `{ enabled: boolean; countsByServiceDayId: Record<serviceDayId, number> }`.
    - Absent, or `enabled` false: the Route uses the Scenario's counts, exactly as today. The counts are kept while the switch is off, so turning it back on restores them.
    - A service day missing from `countsByServiceDayId` uses the Scenario's count.
    - Whole numbers from 0 up; the Route's counts total at most 365.
    - Costing uses them for that Route's rows, on both cost bases. A Block that serves Routes with different counts (the Unattributed row) uses the largest of their counts, with a finding. With no Route switched on, every number is unchanged; a test proves it.
    - Scenario copy remaps the service-day IDs; Route copy within a Scenario keeps them; deleting a service day removes its entry.
42. **Backup schema 17** holds items 38–41. Every older backup still reads, with none of the new fields. There is no Dexie store or index change: the Dexie version stays 15.
43. **Custom service days (5b U3, user approval 2026-11-21).** The import may create custom days (item 19). The Route tab's Annual service days panel gets "Add service day…" and a Delete command (with the existing deletion review), built in package I9b.

### K. Size (G-I6, Option A)

44. A whole feed may be imported. Above 40 Routes or 5,000 trips on any service day, the screen warns that the tool may be slow. Package I10 measures a large real feed and decides whether a hard limit is needed.

### L. Not done

45. No fetching from a web address (CORS; no server). No stored copy of the feed. No shapes, shared stops, calendar dates, dwell or exact non-timepoint times are stored. Fares, transfers, pathways, levels, translations, attributions and Flex files are ignored.

## Alternatives considered

- Import into a Trip profile of existing Routes: needs stop-to-Node matching; this is level D, in the backlog.
- One pattern per stop sequence (G-I3 Option B): exact stops, but many patterns and run-time tables.
- Flag every imported trip as "run times changed" (G-I5 Option B): makes the marker useless on imported Routes.
- Store calendar dates on service days: not needed for costing; export (phase E) keeps its dates in its own dialog.
- A library for ZIP and CSV: refused by D12; the formats needed are small.

## Consequences

- Backup schema 17; new optional fields on Route, Scenario and trip provenance; no Dexie change.
- A new restore point kind `importGtfsRoutes`.
- New pure modules for reading and translating feeds, a Web Worker wrapper, a converter `tools/gtfs_to_backup.mjs`, an import dialog, three menu entries, per-route counts in Costing and on the Route tab, and an "Add service day…" command.
- Rounding to 365 can move a count by 1 from a hand count; the counts are always shown for confirmation before import.
