# Decision 0034: Trip Table Headway Display

- Status: Accepted
- Date: 2026-10-21

## Decision

Add an off-by-default **Show headways** toggle to the Trips Actions Display group. In each timetable column, order the Trips that serve that timepoint by their exact saved scheduled time. Show each Trip's difference from the preceding Trip at that same timepoint. A Trip that skips the timepoint does not participate in that column's sequence. Ties have a zero headway and retain table order. The first Trip at each timepoint continues to show its scheduled clock time, with a subtle accent to distinguish it from duration cells.

Calculate headways from exact times, including during a staged shift preview. The display does not change Trips, exports, blocking, or validation. **Round displayed times** continues to affect visible clock times, including the first Trip shown at a timepoint; headway durations remain exact. Other Trips table columns retain their current display.
