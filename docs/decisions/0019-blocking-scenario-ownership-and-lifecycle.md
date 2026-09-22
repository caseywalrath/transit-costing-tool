# Decision 0019: Blocking Scenario Ownership and Lifecycle

- Status: Accepted for Phase 4 planning
- Date: 2026-09-18

## Context

Decision 0016 established scenario-wide Trip Profiles and required future Blocking Scenarios to select exactly one Trip Profile. The current placeholder `Block` record belongs directly to a Trip Profile and service day. That representation cannot distinguish multiple alternative blocking arrangements using the same timetable.

Phase 4 must introduce named Blocking Scenarios without duplicating Trip Profile authority on every Block. It must also define creation, duplication, deletion, service-day scope, and migration behavior before an editing interface is implemented.

## Decision

1. Add a scenario-owned `BlockingScenario` record with an immutable `tripProfileId`.
2. A Blocking Scenario is one complete blocking alternative spanning every service day in its Scenario. Each Block still belongs to exactly one service day.
3. A Scenario may contain zero or more Blocking Scenarios. The application does not automatically provision an empty Blocking Scenario for every Trip Profile.
4. Users may create an empty Blocking Scenario or duplicate an existing one.
5. Blocking Scenario names are non-empty and unique within the parent Scenario after trimming and case normalization.
6. Duplicating a Blocking Scenario copies all service-day Blocks and activities, allocates new Blocking Scenario, Block, and activity IDs, retains the same source Trip Profile and Trip references, and commits atomically.
7. Renaming changes metadata only. The source Trip Profile cannot be changed after creation. A user creates another Blocking Scenario to use another Trip Profile.
8. Deleting a Blocking Scenario deletes all owned Blocks after an impact review and stale-source check. The Scenario is allowed to have no remaining Blocking Scenarios.
9. A Block stores `blockingScenarioId` and `serviceDayId`. It does not store a second authoritative `tripProfileId`; Trip Profile ownership is derived through the Blocking Scenario.
10. Deleting a Trip Profile deletes its Blocking Scenarios and their Blocks in the same reviewed transaction. Copying a Trip Profile continues to copy no Blocking Scenarios or Blocks.
11. Project Scenario duplication copies and remaps Blocking Scenarios, Blocks, activities, Trip references, and non-revenue Node references as part of the complete Scenario graph.
12. The Phase 4 database migration discards pre-Phase-4 placeholder Blocks instead of converting them into Blocking Scenarios. It reports the discarded record count in migration tests and must not remove Trips, Trip Profiles, or other scheduling records.
13. JSON version 4 backups remain readable, but their placeholder Blocks are discarded when normalized into the Phase 4 schema. This is an explicit exception to the normal migration-preservation rule because no accepted Phase 4 Blocking workflow owned those records.
14. Archiving remains deferred. Introducing it later requires explicit rules for selectors, calculations, exports, backups, and deletion.

## Consequences

- Multiple independent Blocking Scenarios can use one Trip Profile without mixing timetable alternatives.
- Block queries require the Blocking Scenario and service day rather than relying on Trip Profile alone.
- The normalized ownership chain has one source of truth: Blocking Scenario to Trip Profile, then Block to Blocking Scenario.
- Database and JSON schema versions must increase.
- Import, restore, duplication, and deletion transactions must include Blocking Scenarios.
- The approved placeholder-Block discard is destructive and must be documented in release and migration verification results.

## Rejected alternatives

### Store both Blocking Scenario and Trip Profile on each Block

Rejected because the two references can disagree and create competing ownership authorities.

### Make each Blocking Scenario belong to one service day

Rejected because a named blocking alternative should cover the complete service plan and duplicate as one coherent branch.

### Permit source Trip Profile replacement

Rejected because Trip IDs are profile-specific and cannot be mapped reliably without a separate destructive or heuristic workflow.

### Migrate placeholder Blocks into provisioned Blocking Scenarios

Rejected by the approved Phase 4 planning choice. Placeholder Blocks predate an accepted Blocking workflow and will not become authoritative Phase 4 arrangements.
