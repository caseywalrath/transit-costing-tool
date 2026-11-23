# Scenario Comparison (Phase V) — Closeout

- Date: 2026-11-23. Branch: `claude/dazzling-tesla-znfnl8`.
- Rules: `docs/decisions/0091-scenario-comparison.md`. Plan: `scenario-compare-phase-v.md`. Cards and as-built notes: `scenario-compare-phase-v-cards.md` §8–13.

## What was built

The Compare tab sets two sides side by side, each a Scenario, a Trip profile and a Blocking scenario or None (estimate).

- It shows totals, a route table with statuses (New, Discontinued, Changed, Unchanged), a route detail with span and headways, Annual, a CSV, and a narrow layout.
- Each side's figures come from the existing Costing code, so they equal the Costing tab under the same rate and count choices.

## Verification

- Unit tests: 2,552 passed. Typecheck clean. Build succeeds.
- The full browser suite (442 tests) ran once. Two Costing narrow-width checks failed because the fifth tab overflowed the app bar. That was fixed in `f50741b`, and those specs then passed.
- Compare spec: 10 of 10.
- RTD scale check (V5, partial, §13):
  - a cold comparison takes about 6 s (target 20 s);
  - the three edited Routes are Changed, with the right signs;
  - the 127 others are Unchanged.
- Code review at high effort found:
  - 5 important findings and 3 minor ones, all fixed: own counts on unmatched days, CSV `route_id` protection, ambiguous-route warning, stale cache across browser tabs, totals with missing measures or days, and the error state, CSV labels and local date;
  - the ambiguous-route warning now names any Routes left unmatched.

## Open

- **User check V-V:** compare the RTD import with an edited copy.
- **Feed blocks.** On the RTD import, Costing reported no eligible blocks for the feed's blocks, so V5 used estimates. The verdict comes from Costing itself, not from Compare. Check it on the Costing tab.
- Follow-ups are in `docs/backlog.md`, under "Scenario comparison follow-ups".
