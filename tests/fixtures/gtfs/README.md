# GTFS test feeds

Small, made-up feeds for the GTFS import (Decision 0089, plan `docs/implementation/gtfs-import-phase-i.md`). Every name, stop and time is invented. No public agency feed is committed here; real feeds are downloaded for a check and deleted afterwards.

Git keeps these files byte for byte (`.gitattributes`: `-text`), because the byte-order mark and CRLF line endings are part of what they test.

## Feeds

| Folder | What it tests |
|---|---|
| `mini/` | Copied from the Transit Analysis tool (`test/fixtures/gtfs/mini`, our own made-up file; no code is shared). Two directions, rail, frequencies with `exact_times` 0 and 1, a window past midnight, a weekday holiday replaced by Sunday service, a one-off added date, a `calendar_dates`-only service, a trip past 24:00, a blank intermediate time, a blank first time, shuffled rows and sequence gaps, a block that switches routes, a parent station, shapes on two of three routes, BOM, CRLF, quoted commas, an unknown column. `ANALYSIS-APP-EXPECTED.md` is that app's hand-worked answer sheet; its trip counts and running times use the same conventions as this tool and may be used as expected values. Its peak-vehicle, layover and cost numbers belong to the Analysis app and do not apply here. |
| `edge-no-direction/` | No `direction_id` column, no `timepoint` column, no shapes, no `calendar_dates.txt`, a blank route long name. |
| `edge-loop-variants/` | A loop that returns to its first stop; two stop sequences with the same timepoints (merged under G-I3); a short-turn trip with different timepoints; a timepoint with dwell (arrival ≠ departure); `frequencies.txt` with `exact_times=0`; no shapes; blank `shape_id`. |
| `edge-multi-route-blocks/` | One block that serves two routes, one block per route, a stop shared by two routes. |
| `cal-school-days/` | A school-day service on 10 of 25 weekdays, the less common set, with the range's middle on a school date; no weekend service. Tests that the default weekday is a non-school date. `EXPECTED.md` has the hand-worked answers (day groups, defaults, annual counts). |
| `cal-friday-extras/` | An extra service on Fridays only, with the range's middle on a Friday. Tests the Monday–Friday typical sets that differ and the default weekday. `EXPECTED.md`. |
| `cal-holiday-saturday/` | Two routes; a Monday holiday that runs Saturday service on every route (`WKDY` removed, `SAT` added). `EXPECTED.md`. |
| `cal-holiday-mixed/` | Two routes; a Monday holiday on which one route runs its Saturday trips and the other its Sunday trips, under a new service. Scenario class is unique. `EXPECTED.md`. |
| `cal-holiday-unique/` | Three unique holiday dates: two share the same trips, one has different trips (Holiday and Holiday 2). `EXPECTED.md`. |
| `cal-part-year/` | A year-round route and a route that runs only in July, in a range covering June to August; the part-year route is flagged and gets its own counts. `EXPECTED.md`. |
| `zips/` | The same feeds as ZIP files: `mini-deflate.zip`, `mini-stored.zip` (no compression), `mini-in-folder-deflate.zip` (every file inside one folder `mini-feed/`) and `edge-no-direction-deflate.zip`. Made with Python's `zipfile` (fixed date 2026-01-01); remake them only when a folder above changes. |

## Expected answers for the edge feeds

Worked by hand under Decision 0089. All three run service `WK`, Monday to Friday, 2026-01-05 to 2026-01-30 (20 weekday dates, 26 dates in the range, no exceptions).

### `edge-no-direction`

- **Directions (rule 4, no `direction_id`):** trips grouped by their pair of terminals. North Terminal → South Terminal: `N1_a`, `N1_b` (2 trips). South Terminal → North Terminal: `N1_c` (1 trip). The group with more trips is proposed as Outbound. Proposed names: "South Terminal" for Outbound, "North Terminal" for Inbound (the most common headsign).
- **Route name:** the long name is blank, so the Route name is the short name "N1".
- **Timepoints (no `timepoint` column, suggestion rule):** median running time Outbound 13 min (12 and 14), Inbound 12 min. Count = round(minutes / 10) + 1 = 2 for both, so only the terminals. `NM` (Middle) becomes a Route stop on both patterns: one stop record.
- **Patterns:** one per direction.
- **Run-time bands, Weekday:** Outbound 06:00–07:00 = 720 s, 07:00–08:00 = 840 s. Inbound 06:00–07:00 = 720 s.
- **Distances:** no shapes, so great-circle miles through `NM`; the report says so.
- **Blocks:** none in the feed.
- **Annual counts (rule 11):** Weekday 20, Saturday 3, Sunday 3 dates in the 26-day range. Scaled by 365 / 26: 280.77, 42.12, 42.12 → 281, 42, 42 (total 365). Holiday 0. The report says the feed covers only 26 days.

### `edge-loop-variants`

- **One direction (Outbound).** Inbound has no patterns.
- **Patterns (G-I3, timepoint sequence):**
  - Full-loop pattern, timepoints `LA` → `LC` → `LA`: trips `L1_full_1`, `L1_full_2`, `L1_skip` and the two trips expanded from `L1_freq` (5 trips). Its stops are those of the most common stop sequence (`LA LB LC LD LA`, 4 trips). `L1_skip` (no `LB`) is listed as a merged variant.
  - Short-turn pattern, timepoints `LA` → `LC`: trip `L1_short` (1 trip).
  - No trip has a headsign, so the names follow the fallback rule: "Loop Hub to Loop Hub" and "Loop Hub to Loop Far".
- **Loop:** `LA` is one Node (kind `terminal`) used at both ends of the loop pattern.
- **Frequencies:** `L1_freq` window 10:00–11:00, headway 30 min, `exact_times=0`: trips at 10:00 and 10:30, marked "approximate" in the report. The template's own row is not an extra trip.
- **Dwell:** `L1_full_1` arrives `LC` 06:10, departs 06:11. The stored time is the departure 06:11. The report counts 1 timepoint with dwell.
- **Weekday trips:** 6.

### `edge-multi-route-blocks`

- Blocks `X` = `M1_1`, `M1_2`, `M2_1` (two routes); `Y` = `M1_3`, `M1_4` (M1 only); `Z` = `M2_2`, `M2_3` (M2 only).
- **Import M1 only:** block `Y` is imported. `X` is not imported and is listed ("also serves M2"); `M1_1` and `M1_2` are left unassigned.
- **Import M2 only:** `Z` imported; `X` listed; `M2_1` unassigned.
- **Import both:** `X`, `Y` and `Z` imported. `X` serves two Routes, so Costing puts it in the Unattributed row.
- **Shared stop:** `HUB` is copied into both Routes with the same stop ID.
