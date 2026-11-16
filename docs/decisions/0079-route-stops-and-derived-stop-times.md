# Decision 0079: Route Stops and Derived Stop Times

- Status: Accepted and implemented (2026-11-16; closeout: `docs/implementation/stop-trips-closeout.md`)
- Date: 2026-11-16 (user design discussion; plan: `docs/implementation/stop-trips.md`)
- Related: Decision 0036 (writes re-read stored data), Decision 0044 (Trips CSV is output only), Decision 0049 and Decision 0065 (node-pair matching for copy and fill), Decision 0058 (the precedent for a new Scenario-owned table)

## Context

The application models Routes with Nodes (timepoints) only. Intermediate passenger stops are not represented. This is enough for runtimes, trips, blocking, and costing. Planners sometimes need a full stop-level trip table, for example for a public timetable draft or for checking a stop list against a schedule.

Trapeze attaches stops to routes and patterns, and its Stop Trips process gives each stop a time: the previous node's time, the next node's time, or a distance-based interpolation. The user asked for a simpler version: equal time division between the timepoints, or inheriting a timepoint's time, rounded down. The feature must stay out of the main Trips table.

## Decision

1. **A stop is not a Node.** A Route stop never becomes a pattern point, a timetable column, a runtime segment end, or a Blocking location. Runtimes, Trips, Blocking, Costing, and planned frequencies are unchanged by this decision.
2. **Route-owned stops.** Each Route has at most one `RouteStopSet`: its list of stops (`RouteStop { id, name, stopCode? }`), the stop placements of each of its patterns, and its rounding setting. A stop used by several patterns of the Route is one record. Stops are not shared between Routes. A stop ID (`stopCode`) is optional and, when present, unique within the Route (case-insensitive, after trimming).
3. **Placements.** A placement puts one stop on one pattern segment: `PatternStopPlacement { id, stopId, afterPatternPointId, sequence, timing }`. The segment runs from the point `afterPatternPointId` to the next point by `sequence`. `sequence` orders the stops within their segment. A placement after a pattern's last point is not valid. One stop may appear at most once in one segment; it may appear in two segments of the same pattern (a loop).
4. **Stop times are derived, never stored.** A stop's time comes from the Trip's own saved times at the two timepoints around it. It is calculated whenever it is shown or exported. Shifts, regeneration, pattern changes, service-day copies, and Trip Profile copies need no stop-time handling, and nothing can go out of date.
5. **Timing rules.** Each placement has one rule:
   - `interpolate` (the default): the interpolated stops of a segment divide the segment's time equally among themselves. With *m* interpolated stops between times *A* and *B*, the *j*-th (counting from 1) is at *A* + (*B* − *A*) × *j* ⁄ (*m* + 1).
   - `previous`: the time of the timepoint before the stop (*A*).
   - `next`: the time of the timepoint after the stop (*B*).
   There is no fixed-offset rule (user decision).
6. **Rounding.** Interpolated times are always rounded down to the Route's interval, 1 minute (the default) or 30 seconds, and are never earlier than *A*. Inherited times (`previous`, `next`) equal the timepoint time and are not rounded. The rounding interval is stored on the `RouteStopSet` because it changes exported data.
7. **Order.** Within a segment, the rules should read `previous`, then `interpolate`, then `next`. Any other order is a warning, not an error, and each stop's time is raised to at least the previous stop's time.
8. **Missing times.** When a Trip has no time at either timepoint of a segment, or the later time is earlier than the earlier time, the segment's stops have no time.
9. **Copy and fill between patterns.** A segment is identified by its ordered node pair (`segmentKeys`, Decision 0049). A pair that occurs more than once in a pattern is skipped as ambiguous. Reverse pairs are never used, because the opposite direction serves different stops.
   - **Fill** writes into the empty segments of the open editor's draft only, from the other patterns of the Route that have stops on the same pair. When the sources disagree, the segment is not filled and the conflict is reported.
   - **Copy** reads the saved open pattern and replaces the stop list of the same pair on other patterns, with per-pattern exclusion in a preview. It is rebuilt and compared inside the write (Decision 0036) and has a one-level in-memory undo, like distance copy (Decision 0065).
10. **Pattern edits.** When a pattern's points change, its placements are reconciled in the same write:
    - A placement whose point remains, and is not the new last point, stays.
    - A placement whose point is removed from the middle of the pattern moves to the end of the nearest earlier remaining segment (the two segments merge).
    - A placement whose segment now lies outside the pattern (the first point removed, or the last point removed or made last) is removed.
    - A pattern left with fewer than 2 points keeps no placements.
    The pattern save review states how many stops move and how many are removed. A Node deletion applies the same rules to every pattern it shortens.
11. **Lifecycle.** Pattern deletion removes its placements and the deletion review counts them. Route deletion removes the Route's stop set and the review counts its stops. Duplicating a Route or a Scenario, and import as a copy, copy the stop set with the Route, the pattern IDs, and the pattern point IDs remapped. A stop's `id` and a placement's `id` are unique within their stop set only, so copies keep them. Every write of Scenario records prunes placements whose pattern or point no longer exists, stops no placement uses, and stop sets with no stops left.
12. **Timepoint stop IDs.** *Superseded by Decision 0080: a timepoint's stop ID is stored per pattern point in the stop set and edited in the Stops drawer.* A Node has an optional `stopCode`, edited in the Nodes table, so timepoint rows of the stop-level export carry a stop ID.
13. **Export.** A second Trips CSV, "Export trips with stops CSV", writes one row per Trip per stop in long form: `Trip, Direction, Pattern, Stop Order, Stop ID, Stop Name, Timepoint, Time, Block`. Timepoints and stops appear in pattern order. The file covers the displayed schedule, like the Trips CSV, and is output only (Decision 0044).
14. **Formats.** Dexie version 11 adds the table `routeStopSets` (`id,scenarioId,routeId`). JSON backup schema 13 adds the `routeStopSets` array (omitted when empty) and `Node.stopCode`; versions 1 to 12 import with no stops.
15. **Screens.** Stops are edited in a drawer opened from the pattern editor's Actions menu on the Route tab. Stop trips are viewed, and timing rules and rounding edited, in a drawer opened from the Trips Actions menu, one pattern at a time. Neither changes the Trips table.

## Alternatives considered

- **Stop times generated and stored per Trip.** Rejected: stored times go out of date after every shift, regeneration, or pattern change, and they raise the question of how to copy them between service days and Trip Profiles. Derived times answer both automatically.
- **Manual per-Trip stop times.** Rejected for now (user decision). They would need stored overrides relative to the previous timepoint, findings when a regenerated segment no longer contains them, and handling in Change pattern, undo snapshots, and backups.
- **Stops as Nodes.** Rejected: every stop would become a runtime segment end and a Trips table column.
- **Stops and placements inside the Route and Pattern records.** Rejected: `updateRoute` (`saveRouteDefinition`) and the pattern editor write whole records from the screen's copy, so a Route rename or a pattern save could overwrite newer stop edits. A separate record per Route is written only by the stop commands and by pattern reconciliation, both inside `updateScenarioRecords` or the route-edit commit.
- **A Scenario-wide stop list shared by Routes.** Deferred with multi-route interlining.
- **Distance-based interpolation.** Deferred: stops have no distance from the previous timepoint.
- **Wide CSV with one column per stop.** Deferred: patterns of one direction serve different stops, and a merged column order is ambiguous when one pattern skips a timepoint another serves.
- **No rounding, or round to nearest.** Rejected (user decision): times are always rounded down.

## Consequences

- One new table, one backup schema version, and one more collection in every Scenario copy path.
- Stop times always agree with the Trips. Planners cannot type a single Trip's stop time.
- An interior timepoint removal moves stops into the merged segment, and an end removal removes stops. Both are listed in the save review.
- Copy undo is lost on reload, as for distance and runtime copy.
