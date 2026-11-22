# GTFS export test Scenario

Expected output of the GTFS export (Decision 0090) for one small, made-up Scenario, worked by hand. The test builds the Scenario below in code, exports it with the fixed inputs, and compares each file in `mini-export/` byte for byte (LF line endings, no BOM, rows sorted as listed in Decision 0090 item 12).

## Input Scenario

- **Route** "Test Line", short name `T1`, no GTFS fields (so `route_id` = `T1`, `route_type` 3).
- **Nodes:** Alpha (terminal), Bravo (timepoint), Charlie (terminal).
- **Directions:** Outbound named "To Charlie", Inbound named "To Alpha".
- **Patterns:**
  - Outbound, short name `A-C`: Alpha 0.00 mi, Bravo 2.00 mi, Charlie 5.00 mi. Timepoint stop IDs Alpha `1001`, Bravo `1002`, Charlie `1003`. Timepoint locations Alpha (39.7000, -105.0000), Bravo (39.7180, -105.0000), Charlie (39.7450, -105.0000). One Route stop "Main & 1st", no stop ID, at (39.7090, -105.0000), placed after Alpha, timing `interpolate`, equal spacing.
  - Inbound, short name `C-A`: Charlie 0.00, Bravo 3.00, Alpha 5.00. Stop IDs Charlie `1003`, Bravo `2002` (the other side of the street), Alpha `1001`. Locations Charlie and Alpha as above, Bravo (39.7181, -105.0001). No Route stops.
- **Service days:** Weekday `WKD`, Saturday `SAT`, Holiday `HOL` (abbreviations set). Sunday not used.
- **Trip profile** "Base", trips (timepoint departures, no dwell):
  - Weekday Outbound 06:00 / 06:10 / 06:25 and 06:30 / 06:40 / 06:55; Inbound 07:00 / 07:12 / 07:25.
  - Saturday Outbound 08:00 / 08:10 / 08:25.
  - Holiday Outbound 09:00 / 09:10 / 09:25.
- **Blocking scenario** "Base blocks": block `1` = Weekday 06:00 Outbound then 07:00 Inbound. The 06:30 trip is unblocked.

## Export inputs

Agency "Test Transit", `https://example.org`, `America/Denver`. Dates 2027-01-04 (Monday) to 2027-01-31. Holiday 2027-01-18 runs Holiday. Map lines: straight. Export date (feed version) fixed at 2027-01-01.

## Worked answers

- **Stops (G-E1):** `1001` and `1003` are used by both patterns at the same place, so one record each. `1002` and `2002` are different IDs: two records. "Main & 1st" has no ID: generated `T1-1`. Five stops. Names: a timepoint stop takes its Node's name.
- **Derived time (G-E7):** one stop between Alpha and Bravo, equal spacing: halfway, 5 min after Alpha, at 1.00 mi.
- **Calendar (G-E2, G-E5):** `WKD` Monday–Friday, `SAT` Saturday, `HOL` no weekdays; all over the range. 2027-01-18: `HOL` added (1), `WKD` removed (2).
- **Trip ids (G-E8):** `<route>-<day>-<direction 0/1>-<first departure HHMM>-<n>`.
- **Blocks:** `block_id` `1` on the two blocked trips; blank on the others.
- **Shapes (G-E3):** each pattern's located stops and timepoints in order, `shape_id` = `<route>-<pattern short name>`.
- **Counts over the range:** Weekday 19 dates (20 weekdays less the holiday), Saturday 4, Holiday 1. The Scenario's annual counts are not used by the export; the report shows both.
