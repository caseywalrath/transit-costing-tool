# Decision 0049: Copy and Fill of Matching Segment Runtimes Between Patterns

- Status: Accepted and implemented
- Date: 2026-10-30 (user request: Package S1, `docs/implementation/segment-runtime-fill.md`)
- Supersedes in part: Decision 0003 (profiles are not linked across patterns)

## Context

Decision 0003 kept Runtime profiles pattern-specific and deferred shared segments, with the Federal Boulevard patterns as the review trigger. Federal Southbound Wagon Road to Evans and Westminster Station to Englewood share five segments, and a planner entered those runtimes twice. Runtime profiles are still stored per Pattern, so a deliberate difference between Patterns must stay possible.

## Decision

Two actions in the Runtime profile menu share values between the profiles of one Route. Runtime storage does not change.

1. **Scope.** Matching is limited to the profiles of one Route in one Scenario.
2. **Segment identity.** A segment is the ordered node pair `(points[i].nodeId, points[i+1].nodeId)`. Direction matters.
3. **Ambiguous segments.** A node pair that occurs more than once in either Pattern is skipped and reported as `ambiguous`.
4. **Profile matching.** A profile qualifies only if it shares at least one Service day assignment with the open profile. A profile with no assignments matches nothing and is reported as `unassigned`. Profiles on the open profile's own Pattern are never sources or targets.
5. **Band matching.** A value moves only between bands with the same start and end time. Other bands are reported as `bandMismatch`. Band labels are ignored.
6. **Zero means "not entered" for Fill only.** Cells are stored as numbers and new profiles start at `0`. **Fill from other patterns…** writes only into `0` cells. **Copy segments to other patterns…** overwrites any value, including `0`.
7. **Disagreeing sources (Fill).** Qualifying sources with different non-zero values for one segment and band produce a `conflict`; the cell is not filled. Agreeing sources fill it.
8. **Identical values** are not changes.
9. **Calculation method** is untouched; all profiles of a Route share it (Decision 0045).
10. **Calculation revision.** Each changed profile is saved with `withRuntimeCalculationRevision`, so its Trips show as having changed runtimes (Decision 0030). Saved Trip times are not rewritten; regeneration stays separate (Decision 0046).
11. **No remembered choices.** Exclusions and skipped cells are not stored.
12. **Undo.** One level, in memory in `RouteDefinitionService`. It keeps the previous profiles and restores them only while each profile's revision still equals the revision the action wrote. Other runtime writes clear it. Undo raises the revisions again.

The preview is a calculated plan (`planCopyToOthers`, `planFillFromOthers`). Applying rebuilds the plan from the stored records inside the write (Decision 0036) and refuses if it differs from the preview. One invalid profile aborts the whole write.

## Consequences

- No schema, backup, or Dexie change; existing scenarios work immediately, and Copy covers data entered before this decision.
- A Copy can overwrite a deliberate per-pattern difference. The preview, the per-profile exclusion, the Trip count, and the undo reduce that risk.
- Undo is lost when the page reloads.
- Band times must match exactly, so patterns with different band boundaries are reported and not changed.
