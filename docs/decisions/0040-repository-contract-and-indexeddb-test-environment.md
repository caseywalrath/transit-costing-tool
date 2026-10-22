# Decision 0040: One Repository Contract for Both Implementations, Tested on a Real IndexedDB Implementation

- Status: Accepted and implemented
- Date: 2026-10-22

## Context

The code review (issues I-007, I-008, I-020, I-047; findings A-002, A-003, 3-013, 3-014, A-007) found that the production IndexedDB repository had no unit-test coverage. Vitest ran in a Node environment with no IndexedDB, so every atomicity, rollback, and cascade test ran against the in-memory repository or against a fake that threw before it wrote. The one migration unit test returned early because `indexedDB` was undefined, and asserted a stale database version. The browser migration test seeded IndexedDB version 4, which Dexie reads as version 0.4 and upgrades from the beginning.

The two repositories had also drifted apart (Decision 0029 requires "the same cascade behavior"). Against the same calls, the in-memory repository did not reject a regeneration whose before-state was stale, kept a removed Scenario's service days and Routes, returned rows in insertion order where IndexedDB returns primary-key order, raised a `TypeError` for an assignment to a missing profile, discarded the regeneration undo before a write that was then rejected, and returned an empty `directions` list where Dexie omits the field. Most unit tests use the in-memory repository, so they could neither detect Dexie-only behavior nor reproduce order-dependent defects.

## Decision

1. `vitest.config.ts` loads `fake-indexeddb/auto` before every test file. Unit tests can now open a real Dexie database, run its upgrades, and run the Dexie repository. `fake-indexeddb` is the only new dependency, and it is a development dependency.
2. `src/persistence/repositoryContract.test.ts` is the repository contract. Every test runs against `InMemoryRouteDefinitionRepository` and `DexieRouteDefinitionRepository`. It covers each row of the parity table in the Phase 3 review findings: ordering, stale regeneration before-state, duplicate Trip ids, runtime assignment and Trip profile rules, Scenario deletion, the undo and the ownership checks, and the shape of `getScenarioRecords`. The public methods of the Dexie repository are the contract; the suite assigns the in-memory repository to that type, so the compiler fails when a method is missing from either implementation.
3. Both repositories return rows in primary-key order, compared as UTF-16 code units. That is what every Dexie read in the repository returns, because each is a whole-table read or an equality query on one index. The in-memory repository now sorts by `id` to match. Generated identifiers are random, so no code and no test may depend on the order in which a repository lists rows that it did not sort. Two existing tests that did were changed to compare sorted names.
4. Where the repositories word an error differently, the contract asserts what they share. The only case is a duplicate Trip id: Dexie reports its raw bulk-write failure and the in-memory repository says the Trip already exists. Both reject and store none of the batch. Making Dexie's message readable is not part of this decision (finding 3-015).
5. Database upgrades are tested from seeded databases of every earlier schema version (1 to 6). Each test records how many placeholder Blocks the version 4 upgrade discarded (Decision 0019 item 12). The browser migration spec seeds IndexedDB version 40, which is Dexie version 4.

## Consequences

- `pnpm test` exercises `dexieRepository.ts` (86.54% of lines, from 0%) and the database upgrades. It runs in about 9 seconds.
- `fake-indexeddb` is a pure-JavaScript store, and overwriting rows that have several indexes slows down with row count. The contract suite therefore uses the Federal BRT project cut down to 173 Trips and 8 Blocks. The full 1,100-Trip project made one Scenario write take 9 seconds. A test that needs the full project belongs in the browser suite.
- A new repository method must be added to both implementations, and the contract suite must cover it. A behavior that exists only in Dexie (for example the unused `costPlans` table and the rollback of a failed write) is tested in the Dexie-only block of the same file.
- `fake-indexeddb` is not Chromium's IndexedDB. The browser specs remain the check for behavior that depends on the real engine (transaction timing, quota, multi-tab upgrades).
