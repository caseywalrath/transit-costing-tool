# Phase 2 Package 2E Closeout: Trip Persistence, Transactions, Backup, and CSV

## Status

Implemented on 2026-09-11. Paused for persistence verification and user review. Package 2F is not started.

## Delivered result

- Added generation sets, trips, scheduled points, and blocks to `ProjectSnapshot` and `ScenarioRecords`.
- Extended in-memory and Dexie repositories with generation-set, trip, block, pattern, and runtime-profile operations.
- Added `replaceGenerationSet` transaction support in Dexie. The operation replaces affected trips, writes the generation set, and updates blocks in one IndexedDB transaction.
- Extended scenario duplication and project import-as-copy with fresh IDs and remapped generation-set, trip, pattern-point, and revenue-trip references.
- Increased JSON backup schema to version 3. Versions 1 and 2 remain importable with empty later-phase collections.
- Validated generation, trip, scheduled-point, block, and cross-record references before backup writes.
- Added stable CSV serializers for runtime bands, generation sets, trips, scheduled points, blocks, and block activities. Service times use 24-plus formatting.
- Added a 500-trip generation-capacity test.

## Files changed

- `src/domain/types.ts`
- `src/domain/project.ts`
- `src/persistence/backup.ts`
- `src/persistence/csv.ts`
- `src/persistence/dexieRepository.ts`
- `src/persistence/inMemoryRepository.ts`
- persistence and domain tests
- `src/application/ports.ts`
- `src/application/tripGenerationService.ts`
- `docs/data-schema.md`
- `docs/decisions/0009-trip-persistence-and-backup-schema.md`
- `architecture_overview.md`
- `codex.md`
- `docs/implementation/phase-02-runtime-trip-generation.md`

## Verification

- TypeScript typecheck: passed.
- Vitest: 12 test files and 55 tests passed.
- Production Vite build: passed.
- Tests cover trip and block snapshot round trips, backup schema version 3, legacy version 1 import, independent import-as-copy remapping, stable CSV headers and extended times, repository cleanup, and 500-trip generation.
- Dexie database version remains 1 because the required generation, trip, and block tables and indexes already existed. Export schema version is now 3.

## User verification

Please verify the following before Package 2F:

1. Export a project containing a runtime profile, generation set, shifted trip, and block. Re-import it as a copy and confirm all records are independent.
2. Confirm version 1 and version 2 backups remain acceptable with empty trip-generation collections.
3. Review CSV column names and 24-plus time formatting for downstream spreadsheet use.
4. Confirm that regeneration persistence must remain atomic when Package 2F invokes the application service.

## Recommended next package

Package 2F, trip-building UI/UX, is next. Terra is recommended because it owns the generation-set editor, compact trip schedule, selection, shift controls, pattern-change dialogs, warnings, accessibility, and visual verification. Do not begin it until this persistence package is verified.
