# Decision 0090: GTFS Export

- Status: Accepted 2026-11-22 (gate answers in `docs/implementation/gtfs-export-phase-e.md`, Part 7: G-E1 to G-E8, Option A each). Not implemented.
- Date: 2026-11-22
- Plan: `docs/implementation/gtfs-export-phase-e.md`; sub-plan and work cards `docs/implementation/gtfs-export-phase-e-cards.md`
- Related: Decisions 0080 (timepoint stop IDs), 0085 (locations), 0086 and 0087 (stop timing and the Stops table), 0089 (GTFS import)

## Context

Planners want to see this tool's schedules in the Analysis app and other GTFS tools. GTFS lists real dates and one stop per place; this tool counts days per year and keeps stops inside each Route. The export has to bridge both without changing the Scenario (plan E-D1) and must import back through Decision 0089 (E-D2).

## Decision

### A. Scope

1. One Scenario, one Trip profile, all or selected Routes, an optional Blocking scenario. Only Trips of the selected Routes and profile are written.
2. A Route with no Trips in the profile is skipped and listed. A service day with no Trips is left out of `calendar.txt` and listed.
3. Nothing in the Scenario changes, except the remembered export settings (item 16).

### B. Files

4. Written: `agency.txt`, `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`, `calendar.txt`, `calendar_dates.txt` (when there are holidays), `shapes.txt`, `feed_info.txt`. UTF-8, no BOM, LF, a header row, fields quoted only when they hold a comma, quote or line break. One ZIP (the existing stored-file writer), plus a report CSV downloaded beside it.

### C. Stops (G-E1, G-E4)

5. A stop record comes from each Route stop placed on an exported pattern and each timepoint of each pattern (its stop ID and location, Decisions 0080 and 0085). Records with the same stop ID within 30 m (great-circle) are one stop; the first in Route, pattern, sequence order gives name and location. Same ID farther apart: refused and listed.
6. A Route stop without an ID gets `<route_id>-<n>`, n counting such stops in Route stop order from 1; a timepoint without an ID gets `<route_id>-<node short name or name>-<direction 0/1>`. A generated timepoint id is shared by that Route's patterns of the same direction at the same Node, merged under the 30 m rule like any id; generated Route stop ids are never merged. Generated ids are listed as a warning.
7. A stop or timepoint without a location refuses the export and is listed with Route and pattern.
8. A timepoint stop's name is its Node's name; a Route stop's name is its own.

### D. Routes, trips, times

9. `route_id` = `gtfsRouteId`, else the short name, else the name; made unique with `-2`, `-3`. `route_type` = `gtfsRouteType` or 3. `route_color` = `color` when set.
10. `direction_id` 0 for Outbound, 1 for Inbound (a pattern whose direction has no Outbound or Inbound group refuses the export, `gtfsExport.directionUnassigned`); `trip_headsign` = the direction's name. `service_id` = the day's abbreviation (Decision 0059). `trip_id` = `<route_id>-<service_id>-<direction>-<first departure HHMM>-<n>`, n counting equal prefixes in departure order (G-E8). `block_id` = the block's name in the chosen Blocking scenario, blank when unblocked or no Blocking scenario.
11. `stop_times`: every timepoint (`timepoint=1`, its stored time) and every Route stop with its derived time (`timepoint=0`, G-E7), in pattern order, `stop_sequence` from 1. Arrival equals departure except a stored dwell. Times `HH:MM:SS`, hours past 24 kept. `shape_dist_traveled` in miles, three decimals: timepoints from the pattern's cumulative miles, Route stops placed by the same spacing rule as their time.
12. Row order: by `service_id`, then route, direction, first departure (`trips`); by trip then sequence (`stop_times`); by `stop_id` (`stops`); by `shape_id` then sequence (`shapes`).

### E. Dates (G-E2, G-E5, G-E6)

13. `calendar.txt`: one row per used service day over the chosen range. Weekday kind Monday–Friday; Saturday; Sunday; Holiday and custom days no weekdays.
14. Each holiday date names the service day it runs (default Holiday); a date appears at most once: that day is added (1), and a weekday-kind day that would run on that date is removed (2).
15. Routes on their own counts use the Scenario calendar and are listed (G-E6).
16. The range, holidays, agency details and map-line choice are remembered on the Scenario as optional `gtfsExportSettings` (backup schema 18). An imported Scenario defaults its range to its import note's dates.

### F. Shapes and feed info

17. One shape per exported pattern, `shape_id` = `<route_id>-<pattern short name or sequence>`: straight lines through its located stops and timepoints in order (G-E3), stated in the report.
18. `feed_info.txt`: publisher = agency, `en`, the range, version = export date.

### G. Checks and report

19. Refusals (export disabled): unlocated stops or timepoints, conflicting stop IDs, a trip with a missing timepoint time, a range with no dates, a blank agency name, URL or time zone.
20. Warnings: generated stop ids, skipped Routes and days, own counts not expressed, blocks that also serve an unselected Route (their `block_id` kept on the selected trips).
21. The report CSV lists, per Route and service day: trips, running hours, dates in the range and the Scenario's annual count, plus every warning.

## Alternatives considered

- Shared Scenario stop list (G-E1 C): bigger data change; later.
- Leaving unlocated stops out (G-E4 B): gives an incomplete feed silently.
- Own calendars per Route (G-E6 B): accurate, but needs per-Route dates; revisit with a real case.
- Reusing the feed's `trip_id` (G-E8 C): needs a stored field and re-import.

## Consequences

- New pure modules in `src/domain/gtfsExport/`, a dialog in `src/ui/gtfsExport/`, backup schema 18.
- Every export must import back through Decision 0089 with the same trips, running hours and blocks, with one stated exception: a holiday whose trips equal another day's (for example Sunday's) is read back as that day, because Decision 0089 item 19 classifies holiday dates by their trips. No trips or hours are lost on the remaining days; the separate Holiday day is. Found in E5 on Federal BRT; the RTD whole feed round-trips exactly.
