# Decision 0084: Stop Schedule Export

- Status: Accepted, not implemented (plan: `docs/implementation/stop-schedule-and-locations.md`)
- Date: 2026-11-19 (user design discussion, based on the Federal BRT STOPS modeling workbook "Travel Times Schedules - FTA Comments Incorporated")
- Related: Decision 0044 (Trips CSV is output only), Decision 0058 (planned frequencies), Decision 0079 (route stops, derived stop times; this decision adds the wide export that item 13 and its alternatives deferred), Decision 0080 (timepoint stop IDs), Decision 0085 (stop locations fill the location columns)

## Context

A STOPS ridership model run used a hand-built workbook: per direction, one row per stop (BRT ID, stop name, latitude, longitude, distance to the next stop, speed limit) and one column per service period and pattern, each column holding the times of one sample trip. The workbook for Federal Boulevard has three patterns per direction (two overlapping short patterns and a full-length pattern) and four distinct runtime sets, the same structure as the Federal project in this application.

Inspection of that workbook found errors that come from building it by hand: distances that no longer match the coordinates after stops were reordered, a stop whose time is earlier than the stop before it, and rows below a short pattern's terminal that carry another trip's times. The application already holds the trips, the patterns, the stops, and the runtime bands, so it can derive the same table.

The user asked to match the workbook's layout as closely as is reasonable, with Southbound and Northbound replaced by the Route's own direction names, without the "as the crow flies" note, and without the workbook's duplicate stop-name columns (W and X).

## Decision

1. **A third Trips CSV.** Trips **Actions → Export stop schedule CSV…** writes a wide table. It is output only (Decision 0044). The existing "Export trips CSV" and "Export trips with stops CSV" are unchanged.
2. **Scope.** The Route, service day, and Trip Profile of the Trips view, **both directions** (unlike the other two exports, which cover the displayed direction). Patterns without a direction are not exported.
3. **Blocks.** One block per direction, in direction order: a title row with the direction name; two header rows; one row per stop; a "Run time (min)" row; a blank row between blocks.
4. **Fixed columns.** `Stop ID`, `Stop Name`, `Latitude`, `Longitude`, `Distance (miles)`, `Speed Limit`. Latitude, longitude, and speed limit are blank until stop locations exist (Decision 0085).
5. **Rows.** The stops and timepoints of all exported patterns of the direction, merged into one order:
   - A row's identity is its stop ID (trimmed, case-insensitive) when it has one; otherwise its Route stop record (a stop) or its Node (a timepoint).
   - The pattern with the most rows sets the order. Every other pattern's rows that are not yet present are inserted after the nearest earlier row they share.
   - A row that a pattern visits in a different order from the merged list is added again as a separate row, and the export notes the order conflict.
   - The row's name and stop ID come from the first pattern, in column order, that serves it.
6. **Timepoints that are not stops.** An option leaves out timepoint rows that have no stop ID (for example a timing point at an intersection with no stop). Their times still drive the stops around them. Off by default.
7. **Time columns.** Grouped by pattern, in the direction's pattern order. Two modes:
   - **One sample trip per period** (default): each column is the first Trip of the pattern that departs in the period.
   - **Every trip**: one column per Trip, in departure order.
   A cell holds the derived stop time (Decision 0079), `-` where the pattern does not serve the row, and is empty where the Trip has no usable time.
8. **Periods.** For each pattern, the period boundaries are the start and end of every planned-frequency period of the day (Decision 0058) together with the start and end of every runtime band of the pattern's assigned runtime profile. Each pair of consecutive boundaries is one period; trips before the first or after the last boundary form their own periods; periods with no trips are left out. With no plan, only runtime bands are used; with neither, the pattern has one period. Both sources are needed: in the workbook, "PM Peak" has the same runtimes and headway as "Midday" and is separated only by the service plan.
9. **Column headers.** First header row: the pattern name. Second header row: three lines in one cell: the runtime band label of the period (or "Service" when no band covers it), the headway (`15 min`, or `1 trip` when the period has one trip), and the span (`6:00-10:00`; an open end uses the first or last departure). The headway is the median gap between consecutive departures of the pattern in the period, measured from the Trips, not read from the plan. In "Every trip" mode the second and third lines are the Trip label and its departure.
10. **Distance.** For each row, the distance in miles to the next exported row of the first pattern, in column order, that serves both. Without stop locations only a segment with no stops between its two timepoints has a distance (its segment miles). Decision 0085 adds the rules that use coordinates.
11. **Run time row.** For each column, the minutes from its first to its last time, to one decimal.
12. **Formatting.** Times use the format of the stop times export (`h:mm`, or `h:mm:ss` when seconds are not zero; times after midnight stay above 24 hours). Free text (direction, pattern, stop names, band labels, stop IDs, Trip labels) is protected against spreadsheet formulas as in every other export; `-` is a fixed value and is written as is.
13. **The planner edits the file.** Labels and direction names are written as they are stored. Renaming a column, merging periods, or adding notes is done in the spreadsheet; the export has no label editor.

## Alternatives considered

- **Periods from the plan only, or from runtime bands only.** Rejected: either alone misses periods the workbook has (section 8).
- **Periods detected from headway changes in the Trips.** Rejected: built Trips are often slightly irregular, so detected periods would change with small shifts. The planned-frequency comparison already handles that tolerance.
- **Headway read from the plan.** Rejected: the plan is per Route, and each pattern often runs at a multiple of the combined headway.
- **One file per direction.** Rejected: the workbook keeps both directions together, and the user edits one file.
- **Reproducing the workbook's second-level times.** Rejected: a fit of "fixed seconds per stop + distance ÷ speed limit" explains between about a quarter and three fifths of the stop-to-stop variation, so another model produced them. The export reports the planner's runtimes. Decision 0086 adds distance-weighted stop times and 1-second rounding.

## Consequences

- A planner can hand a modeler a stop-by-stop schedule that always agrees with the Trips.
- The export needs no change to stored data.
- A direction whose patterns visit shared stops in different orders shows duplicate rows; the planner resolves them in the spreadsheet.
