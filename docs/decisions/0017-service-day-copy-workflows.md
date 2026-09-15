# Decision 0017: Separate Service-Day Copy Workflows

- Status: Accepted for implementation planning
- Date: 2026-09-14

## Context

Runtime profiles are Pattern-owned calculation inputs, while Trips are authoritative timetable records owned by a scenario-wide Trip profile. A single Copy Service Day action would conceal these different scopes and consequences. The Trips workspace also uses Direction mainly as a view, so a Direction-filtered copy could create an unintentionally incomplete target schedule.

## Decision

1. Provide separate Runtime and Trip copy commands. Do not provide a combined service-day copy command in the initial Phase 3 implementation.
2. Use a target-first workflow. The currently selected Day is the default and fixed target; the user selects a source Day through `Copy day…`.
3. Runtime copy applies to all usable Patterns on the selected Route and is independent of Direction and Trip profile.
4. Runtime copy defaults to creating independent Runtime profiles and target-Day assignments. The user may explicitly choose to share the source profiles instead.
5. Runtime copy replaces target assignments after impact review but does not alter or recalculate existing Trips.
6. Trip copy applies to one selected Route and Trip profile, includes both Directions, and replaces the target Day's Trips within that scope.
7. Trip copy preserves authoritative times and provenance but allocates new Trip IDs and target-Day ownership.
8. Trip copy does not copy Runtime assignments, Blocks, or Blocking scenarios. Revenue-trip activities referencing replaced target Trips are removed atomically; Block records remain.
9. An empty Trip source is an explicit clear-target operation and requires a complete destructive-impact review.
10. Each command has separate validation, preview, stale-review protection, and transaction boundaries.

## Consequences

- Users may copy Runtimes, Trips, both in sequence, or neither.
- Independent Runtime copies avoid accidental cross-Day edits but create additional named Runtime profiles.
- Explicit sharing remains available when identical travel-time assumptions are intentional.
- Copying Trips before Runtimes remains valid because Trip times are authoritative; missing or different target Runtime assignments are reported because later recalculation may be unavailable or produce different times.
- Direction remains a schedule view and cannot silently narrow Trip-copy scope.
- The UI adds one low-frequency Runtime action near Runtime context controls and one low-frequency Trip action inside a compact `More` menu.

## Rejected alternatives

### One combined Copy Service Day action

Rejected for the initial implementation because it couples independent data, produces a larger impact surface, and makes partial planner intent harder to express.

### Separate Copy From and Copy To actions

Rejected because two entry points duplicate one operation and make the destructive target less obvious.

### Copy only the selected Direction

Rejected because Direction is primarily a view in Trips and a partial directional copy could be mistaken for a complete target-Day schedule.

### Merge copied Trips into the target

Rejected because exact duplicates are permitted and an additive copy would make the resulting timetable difficult to predict. Additive service remains available through Build and Add.
