# Packages SS1 to SS4: Side-by-side Trips (level A)

- Requested by the user on 2026-11-06.
- Branch: `claude/costing-empty-blocking-scenario-6sbnrj`. Do not push to another branch. Do not open a pull request unless the user asks.
- Status: SS1 to SS3 done (2026-11-06). SS4 next.
- Decision: 0060.

## Goal

Show Outbound and Inbound trips side by side on the Trips tab, with either on the left, with editing in both panes, and with no horizontal scrolling when the screen is wide enough.

## User decisions (2026-11-06)

| # | Decision |
|---|---|
| U1 | Side by side is turned on from the Trips table's View menu. A strip then holds Switch sides and Close. |
| U2 | Planners can work on trips in either pane: add, build, regenerate, and the other actions. |
| U3 | Columns are narrowed in side by side to save width. |
| U4 | Runtimes is hidden while side by side is on. |
| U5 | Tables expand horizontally as far as the window allows, so a wide screen needs no horizontal scrolling. |
| U6 | Level A only: independent vertical scrolling. Time-aligned scrolling (B) and block-linked lineup (C) are later plans. |

## Packages

| Package | Content | Class / model | Depends on |
|---|---|---|---|
| SS1 | Decision 0060, this plan, `docs/ui-conventions.md` | Primary agent | None |
| SS2 | Structural: make `TripsWorkspace` drawable per direction; combined navigation guard; preferences | Structural (Luna) | SS1 |
| SS3 | UI: View item, strip, two panes, compact density, natural width, pinned right columns, minimum width | UI design (Sol) | SS2 |
| SS4 | Closeout: full browser suite, documentation check | Primary agent | SS3 |

Each package ends at a verification gate. Do not start the next package automatically.

## Read first (every package)

`AGENTS.md`, `codex.md`, `architecture_overview.md`, `docs/ui-conventions.md`, Decisions 0046, 0047, 0059, 0060.

---

## SS2: Per-direction Trips workspace (structural)

**File ownership:** `src/ui/trips/TripsWorkspace.tsx`, `src/ui/App.tsx` (the Trips mount and navigation guard only), `src/ui/preferences.ts` and its test, a new `src/ui/trips/SideBySideTrips.tsx` container with no styling of its own, and unit tests.

**Work:**

1. `TripsWorkspace` gains a `pane` prop: `undefined` (today's single table) or `{ side: 'left' | 'right' }`. With a pane prop it does not draw Runtimes, and it draws the Trip profile and Blocking scenario controls only when told to (`sharedControls: boolean`). No other behavior changes when `pane` is undefined.
2. Open-edit reporting: `TripsWorkspace` reports whether it holds an open edit (Add-trip row with values, staged Shift, Build drawer open) through a callback, in addition to its navigation guard.
3. `SideBySideTrips` mounts two `TripsWorkspace` instances for two direction ids, combines their guards into the one guard `App.tsx` registers (the pane holding the open edit answers), and before one pane starts an open edit runs the other pane's guard (Decision 0060 rule 14).
4. Preferences: `tripsSideBySide: boolean` and `tripsLeftDirectionId: string`, read with the existing `readStoredRecord` helpers and falling back to off and the first direction by `sequence`.
5. `App.tsx` mounts `SideBySideTrips` when the preference is on, the route has two or more directions, and the window is at least 1100 px wide; otherwise today's single `TripsWorkspace`. The Direction control is disabled while side by side is on.

**Acceptance:** with side by side off, the app is unchanged and every existing Trips test passes unchanged. With it on (set by preference in a test), two unstyled tables for the two directions render and each can add a trip. Starting an Add-trip row in one pane while the other holds one asks the existing question.

**Verification:** typecheck, the full unit suite, a production build, the Trips browser specs, and one new browser test for two panes and the one-open-edit rule.

---

## SS3: Side-by-side UI (UI design)

**File ownership:** `src/ui/trips/SideBySideTrips.tsx` (markup), `src/ui/trips/ScheduleTable.tsx` (compact density and pinned right columns), `src/ui/trips/TripsWorkspace.tsx` (View menu item and pane header only), `src/ui/styles/trips-workflow.css`, `src/ui/styles/shell.css` (the width cap rule only), and browser tests.

**Requirements:** Decision 0060 rules 1 to 4 and 6 to 12. The level A mock-up (version 2) is the visual reference. Specifically:

1. View menu item, strip with Switch sides and Close, disabled Direction toggle with its title.
2. Pane headers per rule 7; regions labeled "<Direction> trips".
3. Compact density per rule 8, applied with a `compact` prop on `ScheduleTable`.
4. Natural-width panes (rule 9), the width cap lifted only while side by side is on (rule 10).
5. Overflow per rule 11: right-pinned Run time, Layover, Next trip, Block using `position: sticky; right`, mirroring the existing left-pinned columns, including header and totals rows.
6. Minimum width per rule 12, measured on the window with `matchMedia('(min-width: 1100px)')`.
7. Keyboard: Tab order left pane then right pane; Switch sides and Close are buttons with visible focus.

**Acceptance:** at 1920 px with four timepoints per direction, neither pane scrolls horizontally. At 1280 px with twelve timepoints, each pane scrolls its timepoints while the pinned columns stay visible. The page never scrolls horizontally.

**Verification:** typecheck, the full unit suite, a production build, Trips browser specs, new tests for the View item, Switch sides, Close, and the minimum width, and visual checks at 1280, 1920, and 2560 px.

---

## SS4: Closeout

1. Review SS2 and SS3 against Decision 0060.
2. Update `architecture_overview.md` for the side-by-side container.
3. Run typecheck, the full unit suite, the build, and the full browser suite.
4. Mark this plan and Decision 0060 implemented.
