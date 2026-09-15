# Decision 0011: Managed Inbound and Outbound Direction Groups

## Status

Accepted for the Phase 2R revision.

## Decision

Each route has exactly two application-managed schedule groups: Outbound and Inbound. A pattern is assigned to one group. The Route interface does not expose direction creation, deletion, renaming, or timetable-column editing.

Patterns retain a user-entered `Label` field. It is descriptive only and may contain planner-chosen text, such as Southbound, Clockwise, or To Englewood. It does not rename the managed group or determine schedule membership.

The application retains stable internal direction records and timepoint-column mappings. It automatically creates the two records when a route is created, assigns new and duplicated patterns to Outbound by default, and assigns a reversed pattern to the opposite group. Internal columns are extended and aligned from pattern point order; they remain necessary to display multiple full-length, short-turn, offset, and loop patterns in one timetable.

## Consequences

- The Trips Direction selector always offers Outbound and Inbound.
- The schedule interlaces all patterns in the selected group.
- A loop may use either group; it is ordinarily assigned to Outbound.
- Existing validation and trip commands continue to compare stable direction IDs rather than UI text.
- A pattern that conflicts with established timepoint order cannot be silently placed into a timetable. The application reports the order conflict.
- Route-level aliases for displayed group names are deferred. They must not change stable group identity.
