# Decision 0043: Database Version 8, Trip Profile Index and Placeholder Block Clean-up

- Status: Accepted and implemented
- Date: 2026-10-23 (user approval of post-Stage-4 hand-offs 10 and 11; package F2)
- Annotates: Decision 0019 (item 12, placeholder Blocks), Decision 0040 (repository contract)

## Context

Two loose ends remained after the October 2026 code review. First, `listProfileTrips` in `src/main.tsx` read every Trip of a Scenario and filtered by Trip Profile in memory, and it called Dexie directly from the composition root. Second, the version 4 upgrade discards placeholder Blocks (Blocks without a Blocking Scenario) only for databases that were upgraded; imports of version 3 and 4 backup files made before package P04 could still store such Blocks in a database that was already at version 4 or later.

## Decision

1. Dexie version 8 adds the compound index `[scenarioId+tripProfileId]` to `trips`. Every earlier index stays.
2. The query moves into both repositories as `listTripsForScenarioProfile(scenarioId, tripProfileId)` (Dexie reads through the new index; the in-memory repository filters in key order), covered by the repository contract suite. `src/main.tsx` calls it and holds no Dexie query for Trips.
3. The version 8 upgrade deletes every Block whose `blockingScenarioId` is absent, null, or empty. It writes nothing else. If it throws, it logs a warning and leaves the data as it was, so the database still opens (the version 7 pattern).
4. The JSON export schema stays 6. No backup field changes.
5. `saveBlocks` is removed from the `TripGenerationRepository` port and both repositories: no production code called it (only test setup did). Tests that need Blocks beside stored data use `src/testSupport/addBlocks.ts`, which goes through the project snapshot.

## Consequences

- A planner whose database holds placeholder Blocks loses them at the first open of version 8. They never appeared in Blocking (it lists Blocks by Blocking Scenario), so no visible Block disappears.
- The Trips of one profile are read without loading the Scenario's other Trips, which matters once a Scenario holds several Trip Profiles.
- Opening the application at version 8 upgrades the database once; an older tab that still runs version 7 is closed by the existing upgrade handshake (Decision 0037).
