# Decision 0008: Materialized Trip Override Representation

- Status: Superseded for Phase 2R by Decision 0010
- Date: 2026-09-11

## Decision

Generated trips retain their materialized `patternId` and ordered `stopTimes`. Manual edits are represented in `Trip.provenance.manuallyChangedFields` while the trip remains linked to its generation set.

When a user shifts a trip, the signed net offset is also stored as `manualTimeShiftSeconds`. Multiple shifts accumulate, so a later negative shift can partially or fully restore the generated time while the `times` override remains visible.

A manual pattern change is represented by the materialized pattern differing from the generation set pattern and the `patternId` provenance flag. Pattern changes are recalculated only after a preview is accepted.

Regeneration overwrites both override types in the affected generation set. Stable logical positions use the generation-set ID plus generation sequence and reuse the existing trip ID when that position survives.

## Consequences

- The generated baseline remains reconstructable from the generation set and runtime profile.
- The UI can distinguish a shifted or pattern-changed trip without parsing a diff.
- Regeneration can report exactly which manual changes will be overwritten.
- Selective preservation, trip locks, and merge behavior remain deferred.
