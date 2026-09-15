# Decision 0016: Trip Profiles and the Blocking Boundary

- Status: Accepted; implementation and user verification complete
- Date: 2026-09-14

## Context

The current Scenario contains one authoritative trip collection. Runtime profiles allow alternative travel-time assumptions, but they do not represent complete timetable alternatives: they do not own headways, manually added trips, trip shifts, pattern choices, or the resulting schedule.

Planners need to compare timetable alternatives inside one Scenario without duplicating Route definitions or treating a runtime profile as a timetable. Future blocking must use one internally consistent timetable and must not combine trips from competing alternatives.

## Proposed decision

1. Add a scenario-owned `TripProfile`. A Trip profile is one complete timetable alternative spanning every Route and service day in the Scenario.
2. Every Scenario has at least one Trip profile. New and migrated Scenarios receive one named `Default`; it may be renamed.
3. Every Trip belongs to exactly one Trip profile. Generate, Add, change-pattern, shift, recalculate, delete, query, CSV, backup, restore, and copy commands are scoped to that profile.
4. Runtime profiles and runtime assignments remain independent of Trip profiles. Building or recalculating a Trip resolves the currently applicable runtime assignment. Each Trip continues to retain the runtime profile ID and calculation revision that produced its current times.
5. Copying a Trip profile creates new Trip IDs and copies all Trips across Routes and service days. It preserves trip times, manual adjustments, and runtime calculation provenance. It does not copy Blocks or future Blocking scenarios.
6. Deleting a Trip profile deletes its Trips after an impact review. The last Trip profile in a Scenario cannot be deleted.
7. A Block belongs to one Trip profile and may reference only Trips from that profile. This keeps current placeholder Block data on a single schedule tree before a formal Blocking-scenario entity is introduced.
8. A future Blocking scenario will reference exactly one Trip profile. Multiple Blocking scenarios may be created from one Trip profile, but one Blocking scenario cannot combine multiple Trip profiles.
9. Interlining remains possible because a Trip profile is scenario-wide rather than Route-owned. A Block may contain Trips from multiple Routes when all belong to its selected Trip profile.

## Consequences

- Trip profile selection becomes part of the Trips workspace context.
- Route definitions, Directions, Patterns, runtime profiles, runtime assignments, and service-day definitions remain shared across Trip profiles.
- Editing shared Route or runtime inputs may affect or mark Trips in several Trip profiles; existing safe-edit and stale-runtime impact reporting must count affected Trips by profile.
- Scenario duplication copies Trip profiles, Trips, and Blocks as part of the complete Scenario graph.
- Route deletion removes that Route's Trips from every Trip profile and removes their Block activities while retaining the remaining Blocks.
- A database migration and backup-schema revision are required.
- Costing based on Blocks must later select a Blocking scenario and therefore inherits its source Trip profile.

## Rejected alternatives

### Use Runtime profiles as timetable alternatives

Rejected because a Runtime profile contains travel-time assumptions rather than a saved schedule and cannot own manual or generated Trips.

### Make Trip profiles Route-owned

Rejected because future interlining would require combining separately selected Route alternatives with no guarantee that they represent one coherent schedule assumption.

### Allow Blocks to combine Trip profiles

Rejected because competing versions of the same service could be assigned simultaneously, invalidating vehicle and cost totals.
