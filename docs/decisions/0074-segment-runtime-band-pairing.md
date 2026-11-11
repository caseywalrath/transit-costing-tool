# Decision 0074: Band Pairing for Segment Runtime Copy and Fill

- Status: Accepted (not implemented)
- Date: 2026-11-11 (user acceptance of D4 Option C; plan: `docs/implementation/trip-review-and-runtime-reconciliation.md`, packages R8 and R9)
- Supersedes: Decision 0049, the rule that a band matches only with the same start and end time
- Related: Decision 0049 (segment runtime copy and fill)

## Context

On the golden project, **Fill from other patterns…** fills 0 cells in every one of the 18 profiles, because each pattern's band boundaries differ (for example 5:47 against 6:00:30). The dialog also drops seconds from band ranges, so different bands can read as identical.

## Decision

1. **Default pairing.** For each band of the open profile and each other profile, the default partner is the other profile's band that overlaps it for the longest time. A partner is offered only when that overlap is more than half of the open band's length. Identical bands are always paired. A tie leaves the band unpaired.
2. **Band map.** The Fill and Copy dialogs show the pairing: one row per open band and other profile, with a select of that profile's bands and *None*. The preview is rebuilt when a pairing changes.
3. **Plan input.** `planCopyToOthers` and `planFillFromOthers` take an optional `bandPairs` input. Without it they use the default pairing. The apply step rebuilds the plan with the same `bandPairs`, and refuses when the result differs from the preview, as today.
4. **Reporting.** Band ranges show seconds when they are not zero. New skip reasons are reported: a profile assigned only to other service days (`otherServiceDays`), no shared segment (`noMatchingSegment`), and a source cell of `:00` (`emptySource`).
5. **One writer per target band (Copy).** Default pairing can pair several open bands with one band of a target profile, for example a target with one all-day band. Copy would then write that band's cells more than once, and the last write would win. Copy leaves out every target band claimed by more than one open band and reports it (`bandShared`). Fill reads from the other band, so several open bands may share one source band. Found in R8 on the golden project; added 2026-11-11.
6. All other rules of Decision 0049 stay: segments match by ordered node pair, sources must share a service day, Fill writes only `:00` cells, a conflict is skipped, and there is one undo.

## Consequences

- No storage, backup, or Dexie change. The pairing is a review input.
- Copy can now write into a band that is not identical to the source band. The band map shows each such pair before the write.
