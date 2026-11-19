# Decision 0086: Distance-Weighted Stop Times and 1-Second Rounding

- Status: Accepted, not implemented (plan: `docs/implementation/stop-schedule-and-locations.md`)
- Date: 2026-11-19 (user design discussion)
- Amends: Decision 0079 item 5 (interpolation) and item 6 (rounding interval)
- Related: Decision 0084 (stop schedule export), Decision 0085 (stop and timepoint locations)

## Context

Decision 0079 divides a segment's time equally among its interpolated stops and deferred distance-based interpolation because stops had no distance. Decision 0085 gives stops and timepoints locations. A modeling export also benefits from a finer interval than 30 seconds.

## Decision

1. **Spacing setting.** `RouteStopSet.interpolation`: `'equal'` (the default, and the meaning when absent) or `'distance'`. It is a Route setting, like rounding, because it changes every exported time of the Route. It is edited in the Stop trips drawer next to Rounding.
2. **Distance spacing.** In one segment from timepoint *A* (time *A*) to timepoint *B* (time *B*), the chain is *A*'s location, then each stop of the segment in order (every timing rule), then *B*'s location. When every chain member has a location and the chain's total straight-line length is above 0, the stop at chain position *k* has fraction *f* = (straight-line length from *A* to the stop along the chain) ÷ (total length). An `interpolate` stop gets `max(A, floor((A + (B − A) × f) ÷ r + 10⁻⁹) × r)`. `previous` and `next` are unchanged, and each time is still raised to at least the previous stop's time (Decision 0079 item 7).
3. **Fallback.** A segment where any chain member has no location, or whose total length is 0, uses equal spacing. The Stop trips drawer says how many segments of the shown pattern fell back. The export does not mark them.
4. **Rounding.** The interval may also be 1 second: `roundingSeconds` is 1, 30, or 60. Times are still rounded down and never earlier than *A*.
5. **Formats.** Backup schema 16 (Decision 0085) carries `interpolation` and accepts `roundingSeconds` 1.

## Alternatives considered

- **A per-stop "distance" timing rule.** Rejected: mixing equal and distance spacing within one segment has no clear meaning, and a Route-wide setting is one control.
- **Along-route distances.** Not available: there is no route geometry. The straight-line chain is proportional within a segment, which is what spacing needs.
- **Speed-limit-weighted spacing.** Rejected: the STOPS workbook showed that speed limits explain little of the stop-to-stop variation.

## Consequences

- Stop times look closer to a modeled schedule wherever locations are complete.
- Existing Routes keep equal spacing and their rounding until a planner changes them.
