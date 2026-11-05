# Planned Frequencies: Closeout

- Date: 2026-11-05
- Decision: `docs/decisions/0058-planned-frequencies.md`
- Plan: `docs/implementation/planned-frequencies.md` (each package has an "as built" section)
- Branch: `claude/elegant-mayer-6bcaqg`

## What shipped

| Package | Result |
| --- | --- |
| PF1 | Domain types, period and slot rules, measure-node resolution, validation |
| PF2 | The pure comparison of built trips with a plan (including the edge-trip refinement of Decision 0058 item 6) |
| PF3 | Dexie version 10, backup schema 10, Scenario and Route duplication, Route deletion, pruning on every Scenario write |
| PF4 | `PlannedFrequencyService`: save, clear, copy from a day, copy from another Scenario (stale previews refused), compare |
| PF5 | Planned frequencies panel and copy dialogs on the Route tab |
| PF6 | Trip generation at a measure node (`anchorNodeId`) and from an exact slot list (`slots`) |
| PF7 | Build trips, From planned frequencies mode, with duplicate slots skipped |
| PF8 | Plan chip with popover and headway markers on the Trips tab |
| PF9 | Documentation and this closeout |

## Verification (PF9)

Run on 2026-11-05 at the head of the branch.

| Check | Result |
| --- | --- |
| Typecheck (`npx tsc --noEmit -p .`) | Clean |
| Unit tests (`npx vitest run`) | 1136 of 1136 pass (72 files) |
| Full browser suite (`playwright test`) | 268 passed, 2 skipped, 0 failed (7.1 min) |
| Production build (`pnpm build`) | Builds (only the usual chunk-size warning) |
| Backup round trip | Covered by `src/persistence/plannedFrequencyBackup.test.ts` (export, import, import-as-copy remapping, version 1 to 9 files import with no plans) and by the browser specs for backup and database migration. 308 persistence unit tests pass. |

Screenshots were inspected at 1280 px (Route panel and dialogs in PF5, Build trips drawer in PF7, Plan chip popover in PF8). The application has no dark theme, so there are no dark screenshots.

## Known limits

- Periods are shared by both directions. Periods that differ by direction are deferred.
- Build trips builds one Pattern at a time. Alternating Patterns in one build are deferred.
- A build refuses a slot whose anchor time cannot be reached, or can be reached from more than one first departure. Unlike Regenerate, it does not ask which runtime band to use.
- A direction with no trips is not counted as a difference in the Plan chip. A period with no trips inside a direction that has trips is.
- At 390 px the application header already makes the page wider than the screen (before this work). The panel itself fits.
- Plans are not used by Costing yet. The "Auto-shift to a consistent frequency" backlog entry would use them as its periods.
- The Shift drawer and Shift undo were not driven through the browser in the chip tests. The chip tests write the departures directly.

## Checks for the user

1. Enter the Federal Weekday plan (6:00–8:00 every 30, 8:00–19:00 every 15, 19:00–24:00 every 30) on the Route tab and copy it to Saturday.
2. Copy the plan into an alternative Scenario (Actions, Copy from another scenario).
3. Build trips from the plan for FRCC to Evans. The Plan chip shows "Plan: matches".
4. Shift all trips 5 minutes earlier. The chip still shows "Plan: matches".
5. Delete one mid-day trip. The chip shows the period that differs, and the popover says why.
