# Decision 0065: Segment Distance Entry and Sharing Between Patterns

- Status: Accepted and implemented
- Date: 2026-11-10 (user request; plan: `docs/implementation/segment-distance-entry.md`)
- Related: Decision 0049 (copy and fill of matching segment runtimes)

## Context

Planners entered cumulative miles for each pattern point, and segment miles were derived. Distances are measured and reasoned about per segment, and overlapping patterns on one Route (for example the Federal Boulevard full and short patterns) share segments, so the same distances were entered more than once. Opposite directions often serve the same nodes on different streets, so a reverse distance is a useful starting value but must stay editable. Segment runtimes already solve the same problem with Fill and Copy actions (Decision 0049).

## Decision

1. **Entry.** The planner types segment miles. Cumulative miles are shown read-only. Storage stays `PatternPoint.cumulativeMiles`.
2. **Segment index.** Segment `i` runs from point `i` to point `i + 1` by `sequence`. The UI shows it on the row of point `i + 1`.
3. **Setting a segment** shifts the cumulative miles of every later point by the difference. Written values are rounded to 6 decimal places.
4. **Zero means "not entered".** Fill writes only into 0 segments. Copy overwrites any value but never copies a 0 source.
5. **Segment identity** is the ordered node pair. A pair that occurs more than once in a pattern is skipped for that pattern (`ambiguous`).
6. **Scope.** Only the other patterns of the same Route in the same Scenario.
7. **Fill** changes the open pattern draft only. Sources are other patterns with the same pair; if there are none, patterns with the reverse pair, and the value is marked "from reverse". The filled draft is saved through the normal pattern save review.
8. **Fill conflicts.** Sources that disagree leave the segment unfilled and are reported.
9. **Copy** reads the saved open pattern and writes the same pair on other saved patterns, never reverse pairs. Patterns can be excluded in the preview.
10. **Identical values** are not changes.
11. **Copy write.** The plan is rebuilt from stored records inside the write (Decision 0036) and refused if it differs from the preview. Each changed pattern is validated; one error aborts the whole write. Runtime profiles, Trips, Blocks, and directions are not changed.
12. **Copy undo.** One level, in memory. It restores the previous patterns only while each pattern's `updatedAt` still equals the value the copy wrote. It is cleared by any other pattern or node commit, by pattern deletion, and on reload.
13. **No remembered choices.** Exclusions are not stored.

## Alternatives considered

- **Shared route-level distance table with per-point overrides.** Rejected for now: it needs a schema migration and backup change, and one edit would change the revenue miles of other patterns without the per-pattern save review. It remains possible later because points keep stable identifiers.

## Consequences

- No Dexie, backup, or export schema change.
- A genuine 0-mile segment reads as not entered.
- Copy can overwrite a deliberate difference; the preview, exclusion, and undo reduce that risk.
- Undo is lost when the page reloads.
- Moving or removing a point still moves its cumulative value with it.
