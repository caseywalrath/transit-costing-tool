# Review User Decisions

Consolidated in Stage 3B (2026-10-22). Decisions 1–18 are settled. Stage 3 decisions C1–C8 at the end were approved by the user on 2026-10-22.

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

## Wave 2 gate decisions (2026-10-22)

The user approved every recommendation from the Wave 2 gate.

| # | Source findings | Question | Decision |
| --- | --- | --- | --- |
| 10 | 4-002 | How should two open tabs be handled? | Allow one active tab only (a `BroadcastChannel` or Web Locks guard); other tabs become read-only. A Dexie `versionchange` handler is part of the same package. |
| 11 | 4-006 | Scope of the visible save status | Every write: Route, Trips, Blocking, and Costing. |
| 12 | 4-013, L-09 | CSV serializers in `src/ui` | Move `tripTableCsv.ts` and `csvDownload.ts` to `src/application`. Do not amend OV-TECH-03. |
| 13 | 4-015, L-11 | Dead generation-set UI and commands | Delete them. Keep the `generationSets` table and backup parsing for old backups. |
| 14 | 5-004 | Unsaved Runtime editor and Build Trips input | Guard the Runtime editor draft and the staged Shift with the discard dialog. Build Trips may close without a prompt but keeps its values until the drawer is reopened. |
| 15 | 5-015 | Trips from another Route inside a Block | Show the Route short name in the Pattern pill, only for activities from another Route. No new column. |

## Wave 3 gate decisions (2026-10-22)

The user approved every recommendation from the Wave 3 gate.

| # | Source findings | Question | Decision |
| --- | --- | --- | --- |
| 16 | 6-003 | How should the app protect local data? | Request persistent storage, map quota errors to plain guidance, and show when the last backup was exported. Record the choice in Decision 0001 or a new decision record. |
| 17 | 6-007 | Which Node line? | Node 22 LTS in CI, `engines`, `packageManager`, and `.nvmrc`. |
| 18 | 6-009, plan 8.4 item 6 | `zod` and `@tanstack/react-table` | Remove both; amend OV-TECH-01 and OV-TECH-02 to record hand-written validation. |

## Stage 3 decisions (approved 2026-10-22)

Found during Stage 3A consolidation (C1–C6) and Stage 3B packaging (C7–C8). The user approved every recommendation (option (a)) on 2026-10-22. Each names the package whose scope depends on it (`docs/review/fix-packages.md`).

| # | Source issues | Question | Options and consequences | Recommendation | Package | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | I-055 (1-011) | The minimum-layover candidate preference is implemented, but D0020-19 says no minimum-layover policy applies, and no decision record covers it. Is it accepted product behavior? | (a) Accept it: D01 writes a new decision record and annotates D0020-19. No code change. (b) Remove it to match D0020-19: a new structural and UI package deletes the rule and its dialog. | (a). It is implemented, described in the overview and ui-conventions, and affects only candidate classification. | D01 | Approved: (a) |
| C2 | I-015 (2-006) | How should legacy explicit-time deadheads and pull-outs be handled? | (a) Report a placement finding when explicit times fall outside the gap, and a boundary-overlap finding (smallest fix; stored data unchanged). (b) Convert legacy explicit-time activities to relative offsets on load and import (changes stored data; needs a migration and a decision record). | (a). | P12 | Approved: (a) |
| C3 | I-087 (5-019) | The Costing Total row sums daily hours across day types, and its totals are rounded independently of the displayed rows. Decision 2 accepted 5C, so a change alters accepted presentation. | (a) Leave the daily columns blank in the Total row, keep the annual totals, and add a note that totals are computed before rounding. (b) Keep the row and add only the rounding note. | (a). | U06 | Approved: (a) |
| C4 | I-099, I-100, I-101 (6-009 to 6-011) | Scope of dependency work. | (a) Update `vite` within its range in B01; upgrade `vitest` (a major version) in a later separate package; raise `chunkSizeWarningLimit` with a recorded reason instead of code-splitting. (b) Also code-split the Blocking and Costing workspaces in B01. | (a). The bundle is 210 kB gzip and works offline once loaded. | B01 | Approved: (a) |
| C5 | I-045 (6-003), I-026 (4-010) | GitHub Pages serves every repository of the account from one origin, so the IndexedDB store and `localStorage` keys are shared with sibling Pages sites (Phase 6 lead; not measured). | (a) Record the risk in the Decision 0001 amendment required by decision 16; no code change. (b) Move to a dedicated origin (custom domain or subdomain). Stored data does not move with it, so planners must export and re-import. | (a). | P10 | Approved: (a) |
| C6 | All packages; I-047 (A-007) | What happens to the review reproductions in `docs/review/golden/` during Stage 4? | (a) Each package ports the reproductions for its issues into `src/**/*.test.ts` or `tests/ui/` as its test-first step; `docs/review/` stays on the review branch only. (b) Merge `docs/review/golden/` into `main` as a second test suite. | (a). It keeps one test suite, and each fix carries its own regression test. | All | Approved: (a) |
| C7 | I-069, I-075, I-079 (X01) | Plan Section 8.3 places S3 cleanup after the S2 packages. Dead-code removal deletes several hundred lines from `src/ui/App.tsx`, which six UI packages then edit, and it removes the latent S0 path `deleteNode` (3-008). Should X01 move earlier? | (a) Run X01 right after P05, before the S2 packages. It is mechanical and reduces what every later package must read. (b) Keep the plan order (X01 after U07). | (a). | X01 | Approved: (a) |
| C8 | I-005 (3-006; decision 4) | Decision 4 adds automatic recovery for already-duplicated Scenarios. Recovery maps each source Node to the copy Node with the same Route position and name, which requires the source Scenario to exist. If the source was deleted, the source Node names are gone. What should recovery do then? | (a) Infer the Node from the adjacent Trip where it is determined (pull-out To = first Trip's first Node; pull-in From = last Trip's last Node; deadhead From/To = adjacent Trip endpoints), and report a finding naming the Block for each garage end (pull-out From, pull-in To) that cannot be inferred. (b) Infer nothing; report a finding for every unresolved reference so the planner re-selects each Node. | (a). | P03 | Approved: (a) |
