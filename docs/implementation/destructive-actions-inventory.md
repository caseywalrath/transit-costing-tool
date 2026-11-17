# Destructive Actions Inventory

Status: Review complete; fixes not yet planned.
Date: 2026-11-17.
Code reviewed: `main` at commit `33bc716` (after PR #66, Decision 0080).

## 1. Purpose and scope

This document lists every planner action that can lose saved work or entered work that cannot be recovered in place. For each action it records the current warning, the current undo, the downstream effect on other tabs, and a risk class (High or Low). The next step (not part of this document) is to propose fixes.

The review covers the four tabs (Route, Trips, Blocking, Costing) and the header (Project and Scenario switchers), because header actions are reachable from every tab. It does not cover CSV exports, view preferences, or selection changes, which change no stored data.

Sources read: `src/ui/App.tsx`, `src/ui/shared/dialogs.tsx`, `src/ui/route/RouteWorkspace.tsx`, `src/ui/route/PlannedFrequenciesPanel.tsx`, `src/ui/route/PlannedFrequencyDialogs.tsx`, `src/ui/route/PatternDistanceDialog.tsx`, `src/ui/route/PatternStopsDrawer.tsx`, `src/ui/trips/TripsWorkspace.tsx`, `src/ui/trips/dialogs.tsx`, `src/ui/trips/RuntimeEditor.tsx`, `src/ui/trips/reviewDialogs.tsx`, `src/ui/blocking/BlockingWorkspace.tsx`, `src/ui/blocking/blockingScenarioCommands.tsx`, `src/ui/blocking/BlockingDayCopyDialog.tsx`, `src/ui/blocking/AutoBlockingDialog.tsx`, `src/ui/costing/CostingWorkspace.tsx`, `src/ui/costing/CycleCalculator.tsx`, and the services they call (`routeDefinitionService.ts`, `tripGenerationService.ts`, `blockingService.ts`, `tripsWorkspaceView.ts`, `src/domain/safeRouteEditing.ts`, `src/domain/trips.ts`).

## 2. Definitions

**Destructive action.** A command that deletes, replaces, or overwrites stored records, or discards entered work, where the previous state cannot be restored by an equal and opposite command without re-entering data.

### Warning levels

| Code | Meaning |
| --- | --- |
| W0 | No warning. The action runs at once. |
| W1 | A confirmation dialog that names the action but gives no counts. |
| W2 | A confirmation dialog with impact counts or named records. |
| W3 | A preview or review of the specific changes before apply. |
| +U | The warning states "This cannot be undone." |
| +B | The warning checks backup age and offers "Back up and delete". |

### Undo levels

| Code | Meaning |
| --- | --- |
| N | None. Recovery only by restoring a JSON backup, which creates a separate project copy (it does not restore in place). |
| D | Draft. Nothing is saved until the planner saves; Discard or Undo recovers the saved state. |
| M | One-level undo held in memory. Lost on page reload; cleared by other writes named in section 3. |
| P | One-step undo stored in IndexedDB. Survives reload; replaced by the next qualifying change. |
| R | Reversible by an equal opposite action without re-entering data (for example, move back, choose the original profile again). |

### Risk rubric

Each action is scored on six factors:

1. **Dependencies.** The action removes or changes records owned by another tab, another blocking scenario, or another route.
2. **Rework.** Recreating the lost work takes substantial time or source data the planner may not have at hand.
3. **Visibility.** The effect is not visible where the planner acts, or appears later on another tab.
4. **Scope.** The action affects many records at once (bulk, a whole day, a whole profile).
5. **Recoverability.** The undo level (N is worst).
6. **Trigger.** The loss is a side effect of an ordinary edit rather than an explicit destructive command.

**High risk:** undo level N (or R that is impractical), and at least two of factors 1, 2, 3, 4, and 6 are adverse.
**Low risk:** every other destructive action.

The risk class describes the consequence of an unintended action. It does not judge the quality of the current warning; warning gaps are listed separately in section 8.

## 3. Existing undo and recovery features

| Feature | Where | Covers | Limits |
| --- | --- | --- | --- |
| Undo last regeneration / Undo last pattern change (N trips) | Trips → Trip actions | Regenerate…, Change pattern… (single and batch), inline start-time edit | One step (P). Survives reload; excluded from JSON backups. Replaced by the next regeneration, pattern change, or start-time edit. Listed only while every covered trip is shown in the current Scenario, Trip profile, Day, and Direction. Refused when a covered trip changed or was removed. |
| Staged Shift Undo / Redo | Trips → selection bar, Shift mode | Each step of a staged shift | Only before **Done**. After Done there is no undo (reversible by shifting back, R). |
| Undo last segment copy | Trips → Runtime actions | Copy segments to other patterns…, Fill from other patterns…, Compare patterns "Use this value for" | One level (M). Cleared by any other runtime write and by reload. Refused when a written profile changed after the copy. |
| Undo last distance copy | Route → Pattern actions | Copy distances to other patterns… | One level (M). Cleared by any pattern or node commit, pattern deletion, and reload. Refused when a written pattern changed. |
| Undo last stop copy | Route → Stops drawer → Actions | Copy to other patterns… (stops) | One level (M). Cleared like the distance undo and by a stop save. |
| Pending node deletion with Undo | Route → Nodes table | Node row removal before **Save nodes** | Draft only (D). |
| Save-bar Discard | Nodes, Pattern, Planned frequencies, Stops, Runtimes, Stop trips, Costing assumptions, Estimate factors | Unsaved edits | Draft only (D). Discard itself has no confirmation. |
| Navigation guards (Cancel, Discard, Save) | Route, Trips, Costing tab changes; Route, Scenario, Project, Day, Direction, Trip profile changes; page reload | Unsaved drafts | Blocking has no guard; it has no draft state outside dialogs. |
| Review tokens | Every deletion and every bulk replacement | Refuses the write when stored data changed after the review | A safeguard against a stale review, not an undo. |
| Recent rates list | Costing → Operating cost per revenue hour | Last 10 saved rates with year and source | Browser only; not in backups. |
| Project JSON backup and restore | Project menu | Everything | Restore imports a separate project; it does not roll back the open one. Backup age shows in the header (amber after 7 days or when none). |

## 4. Inventory by area

### 4.1 Header (all tabs)

| ID | Action and location | What is lost or replaced | Downstream | Warning | Undo | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | **Delete project…** (Project menu; project context menu) | The project and every scenario, route, trip, block, and costing record in it. | All tabs. | W2 +U +B (counts; backup check; "Back up and delete") | N | **High** |
| S2 | **Delete scenario…** (Scenario menu; scenario context menu) | The whole scenario graph: service days, routes, runtime and trip profiles, trips, blocking scenarios, blocks, costing assumptions, planned frequencies, stops. Refused for the last scenario. | All tabs. | W2 +U (counts; no backup check) | N | **High** |
| S3 | Browser data cleared or evicted (not an in-app command) | Every project in this browser. | All tabs. | Header backup age; Project-menu line when persistent storage is denied. | N | **High** |
| S4 | A screen fails to draw (error boundary) | Unsaved edits on that screen. | None. | Message states the loss. | N | Low |
| S5 | Edits typed in a second, read-only tab | Writes are refused; typed edits cannot be saved there. | None. | Banner and header "Read-only". | N | Low |
| — | **Restore project from backup…** | Nothing. It imports a new independent project. | — | — | — | Not destructive |

### 4.2 Route tab

| ID | Action and location | What is lost or replaced | Downstream | Warning | Undo | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | **Delete route…** (Route actions) | Nodes, directions, patterns, runtime profiles and assignments, trips, revenue activities, pull-out/pull-in/deadhead activities naming its nodes, planned frequencies, stops, route estimate factors. Blocks remain. | Trips, Blocking (all blocking scenarios), Costing (route factors). | W2 +U (counts; route factors not listed) | N | **High** |
| R2 | **Delete pattern…** (Pattern actions) | Its runtime profiles and assignments, trips, revenue activities in blocks, stop placements. | Trips, Blocking. | W2 +U | N | **High** |
| R3 | **Review and save** → "Reset service for this pattern?" → **Save and reset service**. Triggered by moving any saved point with ↑/↓, or by replacing every point. | The pattern's runtime profiles and assignments, trips, revenue activities in blocks, historical generation records. Empty blocks remain. | Trips, Blocking. | W2 (counts; danger button; no +U; "N blocks" means activities removed from N blocks) | N | **High** |
| R4 | **Review and save** → "Save pattern and rebalance?" after removing an intermediate point (changing a saved point's node is classified the same way; see section 9) | Each runtime profile's two segments at the point are merged in every band; each trip's time at the point is dropped. Re-adding the point gives a zero-minute segment. | Trips (times, runtimes), Blocking (layovers). | W2 (counts; primary button; merge not stated) | N | **High** |
| R5 | **Review and save** → rebalance after adding a point or changing direction | Nothing is lost: added points take the predecessor's time and a zero segment; trips move with the pattern. | Trips. | W2 | N | Low |
| R6 | **Save nodes** with deleted nodes → "Update service for deleted nodes?" → **Delete nodes and update service** | The node occurrences in every pattern (rebalanced as R4), and every pull-out, pull-in, and deadhead activity naming the node. A pattern can fall below two points. | Trips, Blocking (all blocking scenarios). | W2 (counts of profiles, trips, blocks, activities; no +U) | N | **High** |
| R7 | Remove a node row or a pattern point (trash icon) | Nothing until save. | — | Node row shows "Will be deleted" + Undo; point removal is a draft. | D | Low |
| R8 | **Discard new pattern** (Pattern actions, unsaved new/duplicated/reversed pattern) | The unsaved pattern draft. | None. | W0 | N | Low |
| R9 | Save-bar **Discard** (Nodes, Pattern, Planned frequencies, Stops) | Unsaved edits. | None. | W0 | N | Low |
| R10 | **Copy distances to other patterns…** → **Replace distances** | Matching segment distances on other patterns (saved at once). | Costing (miles), Blocking (miles). | W3 | M | Low |
| R11 | Pattern save with distance changes only | Previous distances (saved without a dialog unless stops move). | Costing, Blocking (miles). | W0 | N | Low |
| R12 | Planned frequencies → **Clear plan…** | The day's planned periods and measure nodes. | Trips (Plan chip), Build trips from plan. | W1 (names the day; "Trips are not changed") | N | Low |
| R13 | Planned frequencies → **Copy from another day…** | The target day's plan. | As R12. | W3 (warn note when it replaces) | N | Low |
| R14 | Planned frequencies → **Copy from another scenario…** | The plans of matching days. | As R12. | W3 ("Replaces the existing plan" tag) | N | Low |
| R15 | **Save plan** after removing periods | The removed periods. | As R12. | Save bar only | N | Low |
| R16 | Stops drawer → **Copy to other patterns…** → **Replace stops** | Stops and timepoint stop IDs on other patterns. | Trips (stop trips, stop times CSV). | W3 | M | Low |
| R17 | Stops drawer → **Save stops** after removing stops or IDs | The removed placements and IDs. | As R16. | Save bar; leave and close prompts | N | Low |
| R18 | Route name, short name, description (commit on leaving the field) | Previous text. | Labels everywhere. | W0 | N | Low |
| R19 | Annual service days count, service day name, abbreviation (commit on leaving the field; a blank count saves 0) | Previous value. | Costing annual quantities (another tab, no indication). | W0 (a total above 365 is refused) | N | Low |

### 4.3 Trips tab

| ID | Action and location | What is lost or replaced | Downstream | Warning | Undo | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | **Delete…** (selection bar) / **Delete trip…** (row menu, trash) | The trips, their revenue activities, and the deadheads next to them, in every blocking scenario of the day, not only the selected one. Select-all makes this a whole-direction delete. | Blocking (all blocking scenarios), Costing. | W2 +U (block count; deadheads not mentioned; blocking scenarios not named) | N | **High** |
| T2 | **Copy trips from another day…** → **Copy trips** | Every trip of the route on the target day in this trip profile, both directions, including manually adjusted trips; their block activities. | Blocking (all blocking scenarios), Costing. | W3 (counts: target trips replaced, block activities removed, manual trips replaced; primary button; no +U). Empty source needs a "Clear … trips" checkbox and a danger button. | N | **High** |
| T3 | Trip profile menu → **Delete profile…** | Its trips on every route and day, its blocking scenarios and their blocks, its Costing estimate factors (trip-profile and route entries). Refused for the last profile. | Blocking, Costing. | W2 +U (counts; Costing factors not named) | N | **High** |
| T4 | Blocking scenario menu → **Delete…** | See B1. | | | | **High** |
| T5 | **Regenerate…** | Selected trips' times, including manual shifts and start-time edits. | Blocking (layovers). | W3 (review table, per-trip outcomes) | P | Low |
| T6 | **Change pattern…** (single and batch) | The trips' pattern and times. | Blocking (layovers, locations). | W3 | P | Low |
| T7 | Inline edit of a trip's first time in the table | The trip's times (recalculated). Also replaces the stored regeneration or pattern-change undo. | Blocking (layovers). | W0 when the trip is in no block and has no finding; otherwise "Change start time?" W2 | P | Low |
| T8 | Shift → **Done** | The selected trips' previous times. | Blocking (layovers). | Staged preview; leaving asks Discard or Save | R (staged Undo before Done) | Low |
| T9 | **Unassign…** (selection bar; Block pill → Unassign from block) | Assignments in the selected blocking scenario and the adjacent deadheads with their minutes and miles. | Blocking, Costing (blocked basis). | W2 (counts; states deadhead removal) | N | Low |
| T10 | **Assign block…** / Block pill → another block | Assignments in source blocks and their adjacent deadheads. | Blocking, Costing. | W2 (states moves and deadhead removal) | N | Low |
| T11 | Runtimes save bar → **Save** | The profile's previous band times and segment runtimes. Every trip using the profile is marked "Run times changed"; restoring the old values does not clear the mark (staleness compares a revision number that only increases). | Trips (stale marks). | Save bar only; no count of trips marked | N | Low |
| T12 | Runtime actions → **Calculation method (whole route)** | Method of every runtime profile of the route. All trips marked "Run times changed"; switching back does not clear the marks. | Trips. | W2 (profile and trip counts) | N | Low |
| T13 | Runtime profile menu → **Delete profile…** | The profile's bands and segment runtimes. Refused while trips use it; an assigned profile needs a replacement. | Trips. | W2 (no +U; subtle-danger button) | N | Low |
| T14 | Runtime actions → **Copy runtimes from another day…** | Target-day runtime assignments of every pattern of the route. Independent mode leaves the old profiles unassigned (recoverable by reassigning); shared mode links the days so later edits change both. | Trips (stale marks). | W3 (counts; shared-mode note) | R (reassign) | Low |
| T15 | **Copy segments to other patterns…** / **Fill from other patterns…** / Compare patterns **Use this value for** | Cells of other profiles (or of this profile). | Trips (stale marks). | W3 | M | Low |
| T16 | Choosing another profile in the Runtime profile menu | The pattern's assignment for the day. | Trips (stale marks, which clear when the original is chosen again). | W0 | R | Low |
| T17 | **Build trips…** / **Add trip** | Nothing; additive. Mistaken trips must be deleted. | Blocking (unassigned trips). | Drawer form | R (delete) | Low |
| T18 | Discard of runtime edits, a new-trip row, a staged shift, or Stop trips edits | Unsaved edits. | None. | Save-bar Discard W0; scope changes ask | D | Low |
| T19 | Stop trips drawer → save timing rules and rounding | Previous rules. | Stop times CSV. | Save bar; leave prompts | N | Low |

### 4.4 Blocking tab

| ID | Action and location | What is lost or replaced | Downstream | Warning | Undo | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Blocking scenario menu → **Delete blocking scenario…** (also on Trips) | Every block of the scenario on every day, with all activities and the `autoBlocking` rules. | Trips (Block column), Costing (that blocked cost basis). | W2 +U | N | **High** |
| B2 | Blocks actions → **Delete all blocks on {Day}…** | Every block of the day. | Costing. | W2 +U (labels and counts) | N | **High** |
| B3 | Blocks selection bar → **Delete blocks…** (two or more) | The checked blocks. | Costing. | W2 +U | N | **High** |
| B4 | Block menu → **Delete block…** (one) | One block and its activities. | Costing. | W2 +U | N | Low |
| B5 | Blocks actions → **Copy blocks from another day…** | Every block of the target day; trips without a match are dropped with their deadheads. Empty source clears the day. | Costing. | W3 +U (match figures; "Copy anyway" checkbox for partial matches; refused below 50%; danger "Clear blocks") | N | **High** |
| B6 | **Auto-blocking…** → "Edit rules of {scenario}" → **Rebuild blocks** | The scenario's blocks on the ticked days, including hand edits. | Trips, Costing. | W3 (preview); warn note only when blocks were edited since the last build; no +U | N | **High** |
| B7 | Edit pull-out or pull-in → **Apply to matching blocks** + **Replace existing activities in other blocks** → **Apply to blocks** | Pull-out or pull-in offsets, nodes, and miles in other blocks of the day. | Costing (platform hours). | W3 (add, replace, keep counts; no +U) | N | **High** |
| B8 | Current block → remove a trip, pull-out, or pull-in (⊗, Remove…) | The activity; for a trip, its connected deadheads. | Costing. | W2 (names the activity) | N | Low |
| B9 | Current block selection bar → **Remove from block…** | Selected trips and connected deadheads. | Costing. | W2 | N | Low |
| B10 | **Move to block…** | Assignments in this block and the adjacent deadheads. | Costing. | W1 (count only; deadhead removal not stated) | N | Low |
| B11 | **Delete deadhead** / **Delete similar deadheads** | The deadhead(s). | Costing. | W1 +U | N | Low |
| B12 | Edit deadhead with **Apply to all similar trips in this block** | Existing deadheads with the same From and To nodes in the block. | Costing. | W0 (no count) | N | Low |
| B13 | Edit a single pull-out, pull-in, or deadhead → **Save activity** | Previous minutes, nodes, miles. | Costing. | W0 | N | Low |
| B14 | Move up / Move down in Current block | Trip order. | — | W0 | R | Low |
| B15 | **Rename block…**, **Edit notes…** | Previous label or notes. | — | W0 | N | Low |
| B16 | Closing the Auto-blocking dialog (Cancel, Escape) before Create | Rules entered for a new scenario. | — | W0 | N | Low |

### 4.5 Costing tab

| ID | Action and location | What is lost or replaced | Downstream | Warning | Undo | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | **Save assumptions** | Previous rate, rate year, source, inflation rate, horizon. | Cost summary, CSV. | Save bar | N (rate, year, and source are in the recent rates list) | Low |
| C2 | **Save factors** (trip-profile or route level) | Previous layover and deadhead factors; a route entry left empty is removed. | Estimated basis. | Save bar | N | Low |
| C3 | **Discard** (assumptions, factors) | Unsaved edits. | None. | W0; tab and basis changes ask | D | Low |
| C4 | Vehicle requirement **Use** / **Reset to schedule** | Unsaved draft value / typed calculator values (screen state). | None. | W0 | D | Low |
| C5 | Costing inputs removed by other tabs | Route factors (R1), trip-profile factors (T3), a blocked cost basis (B1), annual service days (R19). | — | Not shown on the Costing tab. | N | See source item |

## 5. Cross-tab cascade map

| Action | Route | Trips | Blocking | Costing |
| --- | --- | --- | --- | --- |
| S1 Delete project | all | all | all | all |
| S2 Delete scenario | all | all | all | all |
| R1 Delete route | route, nodes, patterns, plans, stops | runtime profiles, trips | revenue and node activities in every blocking scenario | route factors |
| R2 Delete pattern | pattern, stop placements | runtime profiles, trips | revenue activities | quantities change |
| R3 Reset service | — | pattern's profiles and trips | revenue activities | quantities change |
| R4 Point removal | pattern | segments merged; trip times dropped | layovers change | quantities change |
| R6 Node deletion | node occurrences | trip times dropped | pull-out, pull-in, deadhead activities naming the node | quantities change |
| R19 Service day count | count | — | — | annual totals |
| T1 Delete trips | — | trips | revenue activities and adjacent deadheads, every blocking scenario of the day | quantities change |
| T2 Copy trips from another day | — | target-day trips | target-day activities, every blocking scenario | quantities change |
| T3 Delete trip profile | — | trips on every route and day | its blocking scenarios | its factors |
| B1 Delete blocking scenario | — | Block column empties | all its blocks | that blocked basis disappears |

## 6. Risk classification summary

### High risk (17)

| ID | Action | Adverse factors |
| --- | --- | --- |
| S1 | Delete project | Dependencies, rework, scope |
| S2 | Delete scenario | Dependencies, rework, scope; no backup check |
| S3 | Browser data loss | Dependencies, rework, scope, visibility |
| R1 | Delete route | Dependencies, rework, scope, visibility (Costing factors) |
| R2 | Delete pattern | Dependencies, rework |
| R3 | Save and reset service | Dependencies, rework, trigger (one ↑/↓ press) |
| R4 | Rebalance after removing a point | Rework (runtimes per band and profile), trigger, visibility (merge not stated) |
| R6 | Delete nodes and update service | Dependencies, rework, visibility |
| T1 | Delete trips | Dependencies (all blocking scenarios), scope, visibility |
| T2 | Copy trips from another day | Dependencies, rework (manual trips), scope, visibility |
| T3 | Delete trip profile | Dependencies, rework, scope, visibility (Costing factors) |
| B1 | Delete blocking scenario | Rework, scope |
| B2 | Delete all blocks on a day | Rework, scope |
| B3 | Delete selected blocks | Rework, scope |
| B5 | Copy blocks from another day | Rework, scope |
| B6 | Auto-blocking rebuild | Rework (hand edits), scope |
| B7 | Bulk pull-out/pull-in replace | Rework (per-block values), scope |

### Low risk (by area)

- Header: S4, S5.
- Route: R5, R7–R19.
- Trips: T5–T19.
- Blocking: B4, B8–B16.
- Costing: C1–C5.

Low-risk items with an undo (P, M, D, or R): R7, R10, R16, T5, T6, T7, T8, T14, T15, T16, T17, T18, B14, C3, C4.

## 7. Observations on the undo features

1. No High-risk action has an in-place undo. The only recovery is a JSON backup restore, which creates a separate project.
2. The stored one-step undo (P) is shared by Regenerate, Change pattern, and the inline start-time edit. A single start-time edit after a large regeneration replaces that regeneration's undo without notice.
3. The stored undo is listed only while every covered trip is shown. After a change of Day, Direction, or Trip profile the item is hidden even though the undo still exists, and a later change in that other view replaces it.
4. The three in-memory undos (M) are lost on reload, and nothing on screen says so.
5. The Shift undo ends at **Done**.
6. Runtime staleness compares a stored revision number. Restoring a runtime profile's previous values (T11) or switching the calculation method back (T12) leaves every affected trip marked "Run times changed", and clearing the mark requires Regenerate, which overwrites manual shifts (with its one-step undo).

## 8. Warning gaps

These gaps are inputs to the fix step. Each names the items it concerns.

| ID | Gap | Items |
| --- | --- | --- |
| G1 | Only project deletion checks backup age and offers "Back up and delete". | S2, R1, R2, T3, B1, and the bulk replacements T2, B5, B6 |
| G2 | The reset dialog is reached from an ordinary edit (one ↑/↓ press on a saved point). It does not say "cannot be undone", and "N blocks" means activities removed from N blocks. | R3 |
| G3 | The rebalance dialog does not say that removing a point merges segment runtimes in every band and profile and drops trip times at that point. Its button is primary. | R4, R6 |
| G4 | The node deletion dialog has no "cannot be undone". | R6 |
| G5 | Copy trips from another day uses a primary button when it replaces trips, has no "cannot be undone", and does not name the blocking scenarios whose activities it removes. | T2 |
| G6 | Trip deletion does not mention the adjacent deadheads it removes, and counts blocks across every blocking scenario of the day without naming them, while the Trips tab shows only one. | T1 |
| G7 | Route and trip profile deletion dialogs do not name the Costing estimate factors they remove. | R1, T3 |
| G8 | The inline start-time edit writes without a dialog and silently replaces the stored regeneration or pattern-change undo. | T7, and through it T5, T6 |
| G9 | Runtime save and the method change do not state that the "Run times changed" marks stay even if the change is reverted. Runtime save gives no count of trips it marks. | T11, T12 |
| G10 | The Blocking "Move to block" dialog does not state that adjacent deadheads are removed (the Trips-tab dialog does). | B10 |
| G11 | "Apply to all similar trips in this block" overwrites existing deadheads with no count or preview. | B12 |
| G12 | Auto-blocking rebuild warns only when blocks were edited since the last build, and never says "cannot be undone". | B6 |
| G13 | Bulk pull-out/pull-in replace and Copy blocks state counts but the bulk replace has no "cannot be undone". | B7 |
| G14 | Save-bar Discard and "Discard new pattern" act without confirmation. | R8, R9, T18, C3 |
| G15 | Runtime profile deletion has no "cannot be undone" and uses a subtle-danger button. | T13 |
| G16 | Annual service day edits change Costing totals on another tab with no indication; a blank count saves 0. | R19, C5 |
| G17 | Rules typed in a new Auto-blocking dialog are lost on Cancel or Escape. | B16 |
| G18 | The in-memory undos do not indicate that a reload ends them. | R10, R16, T15 |

## 9. Points to confirm during the fix step

1. Whether Route deletion's impact count should include route estimate factors (the deletion prunes them in the same write; the count is not returned).
2. The exact effect of changing a saved point's node. `classifyPatternEdit` classifies it as a rebalance, like a removal; confirm against `describePatternPointChange` and the rebalance code which runtimes and trip times it keeps.
3. Whether the Trip deletion and Trip day copy block counts should be split by blocking scenario (both read every Block of the service day, not only the selected blocking scenario's).
