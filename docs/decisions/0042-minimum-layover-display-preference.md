# Decision 0042: Minimum-Layover Display Preference

- Status: Accepted and implemented
- Date: 2026-10-22 (user decision C1 of the code review; the record was written on 2026-10-23)
- Annotates: Decision 0020 item 19
- Annotated by: Decision 0050 (the rule is set per direction: outbound, inbound, or both)

## Context

Decision 0020 item 19 says "No minimum-layover policy is applied in Phase 4", and the Phase 4 plan lists minimum-layover policies as deferred. The application nevertheless has a minimum-layover control in the Unassigned Trips **Actions** menu (`src/ui/BlockingWorkspace.tsx`, label "Minimum layover", type `MinimumLayoverRule`). `architecture_overview.md` and `docs/ui-conventions.md` describe it, and no decision record covered it. The code review (finding 1-011, issue I-055) found the contradiction. The user decided on 2026-10-22 (decision C1) to accept the behavior as product behavior and to record it. No code changes.

## Decision

1. The minimum layover is a **display preference** of the Unassigned Trips list. The planner enters it as a fixed number of minutes per connection or as a percentage of the preceding Trip's revenue runtime.
2. The pure Blocking classifier (`src/domain`) applies the preference when it classifies a candidate Trip for an insertion point: a connection whose usable layover is below the minimum is not classified as compatible. The preference changes classification only.
3. The preference is not authoritative data. It is not stored in a Block, a Blocking Scenario, or a backup. It does not change a Block's layover, its validity, its completeness, or any summary. Layover stays derived from activities and Trip times (Decision 0020 items 12 to 14).
4. A blank minutes field or a blank minimum-layover amount is refused, never read as 0 (review package P14).
5. Decision 0020 item 19 keeps its meaning for persisted data: no minimum-layover policy is applied to Blocks, validation, or summaries. Item 19 is annotated to point here.

## Consequences

- The Phase 4 plan's deferral of "minimum-layover policies" still holds for any rule that would validate or reject a Block. A rule of that kind needs its own decision record.
- The preference may be lost when the browser data is cleared. That has no effect on stored Blocks.
- `docs/domain-glossary.md` defines the term; `docs/implementation/schedule-development-roadmap.md` and `architecture_overview.md` refer to this record.
