# Phase 2 Package 2B Closeout: Runtime Persistence, Backup, and Duplication

## Status

Implemented on 2026-09-11. The user proceeded to Package 2C. This record is superseded for current status by `phase-02-package-2c-closeout.md`.

## Delivered result

- Extended project snapshots and scenario records with runtime profiles and assignments.
- Added runtime profile and assignment repository methods to the route-definition repository boundary and both in-memory and Dexie implementations.
- Enforced runtime ownership, segment-count, duplicate-ID, and `patternId + serviceDayId` assignment rules before writes.
- Kept the existing Dexie version 1 schema at the time of this historical package; a later follow-up migration (Decision 0012) adds the runtime-profile assignment lookup index.
- Increased the JSON backup schema to version 2 with top-level runtime arrays.
- Preserved version 1 backup import by normalizing missing runtime arrays to empty collections.
- Added runtime-aware project import-as-copy and scenario duplication with independent profile, band, assignment, pattern, route, service-day, and scenario identifiers.
- Required user-provided names for runtime profile copy and reverse-copy. Reverse compatibility remains node-sequence based while mileage behavior is being rebuilt.

## Files changed

- `src/domain/types.ts`
- `src/domain/project.ts`
- `src/domain/runtime.ts`
- `src/application/ports.ts`
- `src/persistence/runtimePersistence.ts`
- `src/persistence/inMemoryRepository.ts`
- `src/persistence/dexieRepository.ts`
- `src/persistence/backup.ts`
- persistence and domain tests
- `docs/data-schema.md`
- `docs/decisions/0007-runtime-persistence-and-copy-rules.md`
- `architecture_overview.md`
- `codex.md`

## Verification

- TypeScript typecheck: passed.
- Vitest: 10 files and 44 tests passed.
- Production build: passed with Vite.
- Backup tests cover version 1 import, version 2 round trip, invalid-reference rejection before writes, and independent runtime copies.
- Repository tests cover runtime round trips and assignment uniqueness.
- No React, CSS, or UI files were changed.
- No database migration was added in this historical package. The current follow-up migration is documented in Decision 0012.

## User verification

Please verify that:

1. Version 1 backups importing with empty runtime collections is the desired compatibility behavior.
2. Runtime profile copy and reverse-copy requiring a name matches the intended UI workflow.
3. Runtime data should be included in scenario duplication and import-as-copy as implemented.

## Recommended next package

Package 2C, runtime-table UI/UX, is next. Terra is recommended because it owns table density, editing interactions, warnings, accessibility, and visual verification. Do not begin it until this package is verified.
