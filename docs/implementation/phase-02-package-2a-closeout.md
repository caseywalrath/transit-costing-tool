# Phase 2 Package 2A Closeout: Runtime Domain and Application Ports

## Status

Implemented on 2026-09-11. User verification decisions were incorporated into Package 2B. This record is superseded for current status by `phase-02-package-2b-closeout.md`.

## Delivered result

Package 2A adds pure runtime behavior and behavior-oriented application ports without changing React, CSS, Dexie, or IndexedDB persistence.

### Domain behavior

- Half-open runtime-band selection, including service times above 24:00.
- Runtime-profile validation for ownership, names, band identifiers, bounds, overlaps, band sequences, and segment-runtime counts.
- Non-negative integer segment-runtime validation.
- Runtime-assignment validation for duplicate IDs, scenario/pattern/profile relationships, and unique pattern/service-day assignment.
- Runtime-profile band normalization that preserves stable band IDs.
- Runtime resolution that reports a structured finding when a departure falls in a permitted band gap.
- Pattern-time propagation using the band selected by the individual departure.
- Independent profile copying with new profile and band IDs.
- Reverse-compatible profile copying with reversed segment runtimes and new IDs.

### Application ports

`src/application/ports.ts` now defines runtime command and query interfaces for later persistence and UI packages. The interfaces describe behavior and do not prescribe a page or table layout.

## Files changed

- `src/domain/runtime.ts`
- `src/domain/runtime.test.ts`
- `src/application/ports.ts`
- `docs/implementation/phase-02-runtime-trip-generation.md`
- `docs/implementation/phase-02-package-2a-closeout.md`
- `codex.md`
- `architecture_overview.md`

No schema or migration change was required. Existing `RuntimeProfile`, `RuntimeBand`, and `RuntimeAssignment` types already matched the Package 2A requirements.

## Verification

- TypeScript typecheck: passed.
- Focused runtime suite: 7 tests passed.
- Full Vitest suite: 10 files and 40 tests passed.
- Domain boundary check: runtime domain and application ports contain no React, Dexie, or IndexedDB imports.
- Git status: repository is not initialized; no commit or branch was created.

## Rules implemented for review

- Runtime bands use inclusive starts and exclusive ends.
- Band gaps are allowed in a profile, but a requested departure without a band produces an error finding.
- The selected band applies to the complete trip; selecting a later band during the trip is deferred.
- Reverse-copy requires the target pattern's node sequence to equal the source pattern's reversed node sequence.
- Copy and reverse-copy generate independent profile and band identifiers.

## Review decisions carried into Package 2B

1. Profiles with gaps remain valid saved data; a requested departure in a gap returns a `No run time defined for this time period`-equivalent finding.
2. Runtime profile copy and reverse-copy require a user-provided name.
3. Node-sequence compatibility is sufficient for reverse-copy while mileage behavior is being rebuilt.

These decisions are recorded in `docs/decisions/0007-runtime-persistence-and-copy-rules.md`.

## Historical recommendation

Package 2B, runtime persistence, migration, backup, and scenario duplication, is recommended after user verification. Luna is the recommended model because the package is bounded persistence and schema work. Terra is not involved until Package 2C runtime-table UI/UX.
