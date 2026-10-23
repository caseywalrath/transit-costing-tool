# Package F2: Structural follow-up and maintenance

- Approved by the user on 2026-10-23 (hand-offs 10, 11, 12, 13, 16, and 18 of the post-Stage-4 hand-off list).
- Model: Sonnet (main session). Class: structural. No layout or interaction change.
- Branch: `claude/stage-4k-review-fixes`, after F1. If `origin/main` already contains this branch's commits and the branch carries nothing that `main` lacks, restart it from `origin/main` with the same name. Never push to another branch. Do not open a pull request.

## Read first

1. `AGENTS.md`, `codex.md`, `architecture_overview.md`, `docs/data-schema.md`.
2. `docs/implementation/review-fixes.md`: the Next sitting note and "Standing rules for every sitting".
3. Decisions 0019 (item 13), 0039, and 0040; the P04, P06, U09, and P17 entries in the fix log.

## Items

### 10 and 11. Database version 8: Trip Profile index and placeholder clean-up

- Now: `listProfileTrips` in `src/main.tsx` loads every Trip of the Scenario and filters by `tripProfileId` in memory. Placeholder Blocks (no `blockingScenarioId`) stored by imports of version 3 and 4 files before P04 remain in some databases.
- Required: Dexie version 8 adds the compound index `[scenarioId+tripProfileId]` on `trips` (keep every existing index), and its upgrade deletes Blocks whose `blockingScenarioId` is absent, null, or empty. `listProfileTrips` uses the new index. Move the query into the repositories if that keeps `main.tsx` free of Dexie calls (both repositories and the contract suite, standing rule 6).
- The upgrade writes nothing else, and it must not fail the database open: on an error, log a warning and leave the data as it is (the version 7 pattern).
- Acceptance: `src/persistence/database.test.ts` upgrades a seeded version 7 database with placeholder and normal Blocks (placeholders gone, others byte-identical, Trips untouched); a test that the index is used (a query by the index returns only that profile's Trips); a JSON backup round trip; export schema stays 6. Update `docs/data-schema.md` (index table and migration history) and `architecture_overview.md` (Dexie schema version 8).

### 12. Time the U09 calculation

- Measure the Trips load (`loadTrips`, which calls `inspectStaleTrips`) at the capacity fixture (`tests/ui/support/capacityFixture.ts`) in a production build, with the Runtime profile revised so every Trip is stale, 5 runs, once (see "Expedited verification"). Change code only if the stale check adds more than about 100 ms; if it does, cache the calculation per Pattern and departure. Record the numbers in the fix log.

### 13. Contract tests for `saveBlocks` and the legacy generation-set methods

- `saveBlocks` (`src/application/ports.ts`, both repositories): if no production code calls it (check `src/` outside tests and the `*_WRITE_METHODS` list in `tripGenerationService.ts`), delete it from the port, both repositories, and the list. Otherwise add it to `src/persistence/repositoryContract.test.ts`.
- `listGenerationSets` and `saveGenerationSet` stay (decision 13: old backups); add both to the contract suite.

### 16. Delete `makePatternPoint`

- Remove it from `src/domain/commands.ts` and its re-export. Typecheck proves no caller remains.

### 18. Document the CSV importer rule

- Add to the CSV rules in `architecture_overview.md`: a new CSV importer must remove the leading apostrophe added to free-text cells that begin with `=`, `+`, `-`, or `@` (`restoreFormulaText`), for the same columns the writer protects. Then drop this item from the open hand-offs.

## Expedited verification (approved by the user on 2026-10-23; replaces the matching parts of standing rules 5, 7, 9, and 10 for this package)

- Read only the documents and sections named in "Read first". Do not re-read whole guiding documents.
- During work: `pnpm typecheck`, `pnpm test`, and only the browser specs that touch the changed screens. Run the full browser suite once, at the end of the package, and read only its summary line (and the names of any failures).
- Every new test is shown failing on the old code first. Do not skip this.
- One deliberate break per package, on the riskiest test named below. Not one per test group.
- `--repeat-each=10 --workers=8` only for the specs named below as timing-dependent.
- Fix log entry, short: issues, what changed, tests added, exact counts (unit, browser, build), the deliberate break, deferred items. No separate hash-record commit: write "Commit: see `git log`" in the entry.
- One commit for the package. Push. Then a short report.
- Riskiest test (deliberate break): the version 8 upgrade test. No stress run is needed unless a browser spec is added for item 10.
- No visual check (no UI change).
- Item 12: measure once, after the change (5 runs), not before and after; compare with the U08 load figures in the fix log if a baseline is needed.
- Do not cut: the version 8 upgrade test and the JSON backup round trip.

## Records (as modified by "Expedited verification" above)

- Regression and proof as in "Expedited verification".
- One commit. Short fix log entry "F2: Structural follow-up and maintenance" before the "Register map" section; mark items 10 to 13, 16, and 18 done in the "Post-Stage-4 hand-offs" list; replace the Next sitting note header and the `codex.md` status paragraph. Push. Report and stop.
