# Review User Decisions

Decisions given by the user at the Wave 1 gate on 2026-10-22. Stage 3 carries them into the issue register and fix packages.

| # | Source findings | Question | Decision |
| --- | --- | --- | --- |
| 1 | L-07, Phase 1 UD-1 | Does this review replace Phase 5 Package 5D? | Yes. Record this in `phase-05-costing.md`; only user acceptance remains. |
| 2 | Phase 1 UD-2 | Is the Package 5C user review complete? | Yes. Costing UI findings are regressions, not open 5C work. |
| 3 | 1-005, 2-003 | When an anchor fits more than one departure under the `segmentStart` or blended method | Reject and list the candidates, as Decision 0031 and single-band profiles do. |
| 4 | 3-006, A-004 | Repair Scenarios already duplicated | Add automatic recovery on load, as commit `4fc88ba` did. |
| 5 | 3-011, L-20 | CSV formula injection | Prefix `'` to free-text cells beginning with `=`, `+`, `-` or `@`, and strip it on import. Free-text columns only. |
| 6 | 3-009 | Severity of the Runtime "Copy from day" failure | S2; fix it in the first package. |
| 7 | 1-013 | Label of the Blocking Scenario selector in Trips | Rename it "Blocking Scenario". |
| 8 | 2-012 | Does a Pattern with 0 total miles mean "distance missing"? | Yes. Treat a zero total as incomplete; no schema change. |
| 9 | 1.7, L-21 | Agent-neutral `AGENTS.md` and `codex.md` | Use neutral wording and model capability classes. Do not rename `codex.md`. |
