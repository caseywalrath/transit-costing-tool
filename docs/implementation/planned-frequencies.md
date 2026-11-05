# Planned Frequencies: Work Order Plan

- Requested by the user on 2026-11-05. Source proposal: `docs/backlog.md`, "Planned frequencies".
- Status: PF0 complete (Decision 0058, 2026-11-05). PF1 has not started. Each package begins only when the user asks for it, and each ends at a verification gate where the agent reports and recommends the next package (`AGENTS.md`).
- Branch: the branch the user names for each session. Never push to another branch. Do not open a pull request unless asked.
- Staffing: one agent per package. Most packages are Sonnet. Packages marked **Opus** hold rules, data migrations or calculations where a mistake is hard to see or hard to undo.

## Feature summary

A Route can carry an optional **plan** of service frequencies per Service day: periods with a start, an end and a headway (for example 6:00–8:00 every 30, 8:00–19:00 every 15, 19:00–24:00 every 30). The plan:

1. is edited in a new **Planned frequencies** panel on the Route screen, to the right of Annual service days;
2. can be copied from another Service day of the same Route, or from a Route in another Scenario;
3. can build trips from the Build trips drawer, as an alternative to the single-headway build;
4. is compared with the built trips, quietly, on the Route and Trips screens.

The plan is a target, never a constraint. Nothing is refused or blocked because trips differ from it.

## Settled decisions (user, 2026-11-05)

| # | Decision |
| --- | --- |
| D1 | The plan is owned by the Scenario. There are no links between Scenarios. Duplicating a Scenario or a Route copies the plan. |
| D2 | One plan per Route × Service day. It is not per Trip Profile; every Trip Profile is compared with the same plan. |
| D3 | Directions share the periods. Each direction has its own **measure node**, where the frequency is placed and measured. Periods that differ by direction are out of scope. |
| D4 | One pattern per build. Alternating patterns within a period are out of scope. |
| D5 | Tolerance: a period's first and last trips may fall within ± half the headway of the period edges; each gap matches within ± 1 minute or 10 % of the headway, whichever is larger; the period's trip count matches within ± 1. |
| D6 | "Copy planned frequencies from another Scenario…" is included. It is a one-time copy and keeps no link. |
| D7 | The plan is stored. The comparison is derived and never stored. |

## Out of scope

- Periods that differ by direction (later option).
- Alternating patterns within one build (later option).
- Auto-shift (separate backlog entry; it will use this plan as its periods).
- Costing or vehicle estimates from the plan (backlog notes only).

## Package overview

| Package | Title | Model | Depends on | Owns |
| --- | --- | --- | --- | --- |
| PF0 | Decision record | **Opus** | none | `docs/decisions/0058-planned-frequencies.md` |
| PF1 | Domain: types, validation, slots | Sonnet | PF0 | `src/domain/plannedFrequencies.ts` (+ test), `src/domain/types.ts` |
| PF2 | Domain: planned vs built comparison | **Opus** | PF1 | `src/domain/plannedFrequencyComparison.ts` (+ test) |
| PF3 | Persistence, backup, Scenario and Route copies | **Opus** | PF1 | `src/persistence/*`, `src/domain/project.ts`, `src/domain/scenarioCopyRecovery.ts` |
| PF4 | Application service | Sonnet | PF2, PF3 | `src/application/plannedFrequencyService.ts` (+ test) |
| PF5 | Route screen panel and copy dialogs | Sonnet | PF4 | `src/ui/route/PlannedFrequenciesPanel.tsx`, `src/ui/route/RouteWorkspace.tsx`, `src/ui/styles/route.css`, UI tests |
| PF6 | Trip generation at a measure node | **Opus** | PF1 | `src/domain/trips.ts`, `src/application/tripGenerationService.ts` |
| PF7 | Build trips: From planned frequencies | Sonnet | PF4, PF6 | `src/ui/trips/dialogs.tsx` (`BuildTripsDrawer`), Build trips UI tests |
| PF8 | Planned vs built indicators | Sonnet | PF4, PF5 | `src/ui/trips/PlanStatusChip.tsx`, `src/ui/trips/ScheduleTable.tsx`, `src/ui/trips/TripsWorkspace.tsx`, `src/ui/styles/trips-workflow.css` |
| PF9 | Documentation, closeout, full verification | Sonnet | all | `architecture_overview.md`, `docs/data-schema.md`, `docs/domain-glossary.md`, `docs/backlog.md`, closeout file |

Order: PF0 → PF1 → (PF2, PF3, PF6 can run in any order) → PF4 → PF5 → PF7 → PF8 → PF9. PF6 depends only on PF1 and can be done early.

## Instructions that apply to every package

- Read first: `AGENTS.md`, `codex.md`, `architecture_overview.md`, `docs/data-schema.md`, `docs/ui-conventions.md`, Decision 0058 (after PF0), and this plan.
- Keep domain code free of React and IndexedDB. Store inputs; derive everything else.
- Edit files with the file-edit tool, not shell scripts.
- Do not change files another package owns, except where this plan says so. If a package needs a change outside its files, stop and report it.
- Every package ends with: typecheck, the unit tests (`vitest`), the Playwright tests named in the package, and for UI packages a production build and screenshots that the agent inspects. Record the results in the commit message as `Verified:` lines.
- At the gate, report what changed, what was verified, and what the user should check, then recommend the next package. Do not start it.

---

## PF0: Decision record (Opus)

**Why Opus:** it fixes the rules every later package follows, including data ownership, the tolerance definitions and the copy-matching rules.

**Task:** write `docs/decisions/0058-planned-frequencies.md` (use the next free number if 0058 is taken) in the format of Decisions 0049 and 0051. It must state:

1. **Record.** `PlannedFrequency { id, scenarioId, routeId, serviceDayId, periods: PlannedPeriod[], measureNodeIdByDirectionId: Record<EntityId, EntityId> }` with `PlannedPeriod { id, startTime, endTime, headwaySeconds }`, plus the standard metadata. At most one record per Route × Service day.
2. **Periods.** Service seconds, 24-plus allowed. Start inclusive, end exclusive. `endTime > startTime`. Periods must not overlap; gaps are allowed and mean no planned service. Headway is whole seconds, at least 60, at most the period length. Periods are stored sorted by start.
3. **Measure node.** Per direction. Must be a node served by at least one pattern of that direction. Default when absent: the node of the direction's first timepoint column. If the stored node is no longer served (pattern edited), fall back to the default and report it; never delete it silently.
4. **Slots.** For each period, slots are `startTime + k × headway` for every k with the slot `< endTime`.
5. **Comparison (D5).** Per Route, Service day, direction and Trip Profile, at the measure node, merging every trip of every pattern that serves the node. A trip belongs to the period that contains its time at the measure node. Results per period: `matches`, `differs` (reasons: `extraTrips`, `missingTrips`, `gapsOff`, `startEdge`, `endEdge`), or `noTrips`. Trips outside every period are counted as `outsidePlan`, not as a difference. Trips that do not serve the measure node are counted as `notMeasured`.
6. **Copy from another Service day.** Replaces the target day's periods with the source day's. Measure nodes are copied (same Route).
7. **Copy from another Scenario (D6).** The user picks the source Scenario and source Route; the target is the open Route. Service days are matched by `kind`, then by name; unmatched days are listed and skipped. Measure nodes are matched by node name (then short name) within the target Route's direction of the same group (`outbound`/`inbound`); unmatched ones fall back to the default and are listed. Preview first; replaces only the matched days; one write.
8. **Duplication.** `duplicateScenario` and `duplicateRouteRecords` copy plans with remapped IDs. Route deletion deletes its plans and the deletion review lists them.
9. **Formats.** Dexie version 10 (new table `plannedFrequencies`), JSON backup schema 10, versions 1 to 9 still readable (no plans). The Trips CSV does not change.
10. **Rejected alternatives:** shared across Scenarios (D1), per Trip Profile (D2), per-direction periods and alternating patterns (deferred), storing comparison results.

**Acceptance:** the record covers items 1–10 and is consistent with `docs/backlog.md`. Update the backlog entry to link to it and to this plan.

**Verification:** documentation only; proofread and cross-check names against `src/domain/types.ts`.

---

## PF1: Domain types, validation and slots (Sonnet)

**Read:** Decision 0058; `src/domain/types.ts`, `src/domain/runtime.ts` (band validation pattern), `src/domain/time.ts`, `src/domain/durations.ts`.

**Tasks:**

1. Add `PlannedFrequency` and `PlannedPeriod` to `src/domain/types.ts`.
2. Create `src/domain/plannedFrequencies.ts` with pure functions:
   - `validatePlannedFrequency(record, context)` → `ValidationFinding[]`. Findings: `periodEndNotAfterStart`, `periodsOverlap`, `headwayTooShort`, `headwayLongerThanPeriod`, `measureNodeNotServed`. Use the same finding shape as runtime band validation.
   - `normalizePeriods(periods)`: sort by start, keep IDs.
   - `plannedSlots(period)` → `ServiceSeconds[]` (Decision 0058 item 4).
   - `defaultMeasureNodeId(direction, patterns)` and `resolveMeasureNodeId(record, direction, patterns)` → `{ nodeId, fellBack: boolean }`.
   - `tripsPerHour(period)` for the panel's derived column.
3. Unit tests in `src/domain/plannedFrequencies.test.ts`: every finding; 24-plus times; a 7:30 headway; a period whose length is not a multiple of the headway; the fallback of a measure node no longer served.

**Acceptance:** no React or persistence imports; all tests pass; typecheck clean.

---

## PF2: Planned vs built comparison (Opus)

**Why Opus:** the comparison merges patterns at a mid-route node, applies three tolerances and decides which trips belong to which period. Errors here show up only as quietly wrong status chips.

**Read:** Decision 0058 items 3 and 5; `src/domain/trips.ts`; `src/application/tripsWorkspaceView.ts` (headway column logic and `trip-headway-changed`).

**Tasks:**

1. Create `src/domain/plannedFrequencyComparison.ts`:
   - `compareWithPlan({ plan, direction, patterns, trips })` → `{ periods: PeriodComparison[], outsidePlan: number, notMeasured: number, measureNodeId, measureNodeFellBack }`.
   - `PeriodComparison { periodId, status, reasons, plannedTrips, builtTrips, firstTime?, lastTime?, gaps: { fromTripId, toTripId, seconds, withinTolerance }[] }`.
   - Time at the measure node: the trip's stop time at the pattern point whose node is the measure node. A pattern that visits the node twice uses the first visit and is noted as ambiguous in the result.
   - Gaps are measured between consecutive trips in time order, both inside the same period. The gap that crosses a period boundary is not judged.
   - Tolerances exactly as D5. Equality at a tolerance boundary counts as within.
2. Unit tests, including:
   - all trips on plan → `matches`;
   - 15-minute service planned from 6:00, built from 5:55 → `matches` (start edge within half a headway);
   - built from 5:50 on 15-minute service → `differs: startEdge`;
   - one extra and one missing trip;
   - a gap 61 seconds off on a 7:30 headway (outside) and one 59 seconds off (inside);
   - the Federal case: two patterns, one starting at the measure node and one passing it mid-route, merged into one 15-minute series;
   - trips outside every period; trips not serving the node;
   - an empty period → `noTrips`.

**Acceptance:** all listed cases are tests; the function is pure; typecheck clean.

---

## PF3: Persistence, backup, Scenario and Route copies (Opus)

**Why Opus:** a database version bump and a backup schema bump are hard to undo once users have saved data; duplication and import-as-copy must remap every ID.

**Read:** Decisions 0036, 0038, 0039, 0040, 0041, 0043, 0058; `src/persistence/database.ts`, `dexieRepository.ts`, `inMemoryRepository.ts`, `backup.ts`, `backupRepository.ts`, `repositoryContract.test.ts`; `src/domain/project.ts` (`ScenarioRecords`, `duplicateScenario`, `duplicateRouteRecords`); `src/domain/scenarioCopyRecovery.ts`.

**Tasks:**

1. Dexie version 10: table `plannedFrequencies: 'id,scenarioId,routeId,[routeId+serviceDayId]'`. No data upgrade needed.
2. Repository port and both implementations: list by Scenario, get by Route × Service day, save, delete. Extend the repository contract tests.
3. Add `plannedFrequencies` to `ScenarioRecords`; include it in Scenario load, save and delete.
4. `duplicateScenario` and `duplicateRouteRecords`: copy plans with new IDs, remapping `routeId`, `serviceDayId`, period IDs, direction IDs and node IDs.
5. Route deletion: delete plans; add their count to the Route deletion review.
6. Scenario copy recovery: handle plans like the other route-owned records.
7. Backup: schema 10 exports plans; import of versions 1–9 gives none; import-as-copy remaps IDs; import validation rejects a plan whose route, service day, direction or node is missing.
8. Tests: Dexie upgrade from version 9 keeps all existing data; backup round trip of a Scenario with plans is identical after re-export; import-as-copy remaps; duplication of a Scenario and of a Route copies plans; Route deletion removes them.

**Acceptance:** all existing persistence and backup tests still pass; the new tests pass; the backup round trip is exact.

---

## PF4: Application service (Sonnet)

**Read:** Decision 0058; `src/application/routeDefinitionService.ts` (save and review-token patterns), `src/application/reviewToken.ts`, `src/application/ports.ts`.

**Tasks:** create `src/application/plannedFrequencyService.ts` and wire it where the other services are built:

1. `getPlan(routeId, serviceDayId)`, `savePlan(record)` (validates with PF1, refuses on findings, re-reads stored data inside the write as Decision 0036 requires).
2. `clearPlan(routeId, serviceDayId)`.
3. `previewCopyFromDay(routeId, sourceServiceDayId, targetServiceDayId)` / `applyCopyFromDay(preview)`: preview shows the periods to be written and whether the target has a plan that will be replaced; apply refuses a stale preview.
4. `listScenarioRouteSources(currentScenarioId)`: other Scenarios of the Project with their Routes, for the copy dialog.
5. `previewCopyFromScenario({ sourceScenarioId, sourceRouteId, targetRouteId })` / `applyCopyFromScenario(preview)`: matching rules of Decision 0058 item 7; the preview lists matched days (with replace/new), unmatched days and fallen-back measure nodes; one write; stale preview refused.
6. `comparePlan({ routeId, serviceDayId, tripProfileId })`: loads plan, directions, patterns and trips, and returns the PF2 result for each direction. Read only.
7. Tests for each method with the in-memory repository, including a copy from a Scenario whose service day names differ but kinds match, and a stale-preview refusal.

**Acceptance:** tests pass; no UI changes; typecheck clean.

---

## PF5: Route screen panel and copy dialogs (Sonnet)

**Read:** `docs/ui-conventions.md`; Decision 0047; `src/ui/route/RouteWorkspace.tsx` (the `route-top-grid`, the Annual service days panel); `src/ui/trips/RuntimeEditor.tsx` and the Runtimes toolbar in `TripsWorkspace.tsx` (the layout to copy); `src/ui/shared/` components (`SupportPanel`, `MenuButton`, `ModalDialog`, fields). Reuse these; do not invent new controls.

**Specification:**

1. **Placement.** `.route-top-grid` (`src/ui/styles/route.css`) becomes three columns at widths above 1100 px: Route details, Annual service days, Planned frequencies. At 1100 px and below it stays one column (`responsive.css`). Check 1280 and 1440 px: no horizontal page scroll; the Planned frequencies table may scroll inside its panel.
2. **Panel header.** `SupportPanel` titled "Planned frequencies". Toolbar: a `MenuButton` with field label "Service day" listing the Scenario's service days (sorted with `sortServiceDays`), and an Actions `MenuButton` with: **Copy from another day…**, **Copy from another scenario…**, **Clear plan…** (disabled when there is no plan).
3. **Table.** Columns: From | To | Headway | Trips/hr | Built | (delete). From and To use the existing service-time input; Headway accepts `15` or `7:30` (reuse the Build trips parser). Trips/hr is derived, one decimal. **+ Add period** adds a row starting at the previous row's end (or 6:00 when empty) with that row's headway.
4. **Measure nodes.** Under the table, one line per direction: "Measured at" with a select of the nodes the direction serves. Shows "(default)" when none is stored.
5. **Saving.** The same draft-and-save behaviour as the Runtimes editor (save bar, Discard, dirty guard when leaving). Validation messages appear inline on the row, in plain language.
6. **Built column.** From `comparePlan` for the current Trip Profile (the device-local Trips profile choice; first profile if none). Shows ✓ when every direction matches; otherwise a short note, for example "14 of 16 trips" or "Gaps off"; "—" for `noTrips`. Tooltip lists each direction. Empty state: "No plan for Weekday. Add a period or copy one."
7. **Copy from another day…** dialog: source day select, preview of the periods, warning when the target plan will be replaced, **Copy** button.
8. **Copy from another scenario…** dialog: Scenario select, Route select, then the PF4 preview: matched days (new or replaces), unmatched days, fallen-back measure nodes. **Copy plans** button.
9. **Clear plan…** confirm dialog.
10. Keyboard and accessibility as the Runtimes editor: labelled inputs, Escape closes dialogs, focus returns to the menu button.

**Tests:** Playwright spec `tests/ui/planned-frequencies.spec.ts`: add three periods and save; overlap error; copy Weekday to Saturday; copy from another Scenario with one unmatched day; clear; three-column layout at 1280 px and one column at 1000 px; no page scroll at 390 px. Screenshots at 1280 and 1440 px, light and dark, inspected.

**Acceptance:** the specification items above; existing Route screen tests pass.

---

## PF6: Trip generation at a measure node (Opus)

**Why Opus:** it changes trip generation, the core of the Trips workflow, and must give exactly today's results when no measure node is used. Back-calculating earlier stops uses runtime bands, where a trip near a band boundary can change band.

**Read:** Decisions 0030, 0033, 0035, 0045, 0046; `src/domain/trips.ts` (generation and `recalculateTripWithAnchor`), `src/domain/runtime.ts`, `src/application/tripGenerationService.ts` (`previewGenerateTrips`, `generateTrips`, `GenerateTripsRequest`).

**Tasks:**

1. Add an optional `anchorNodeId` to `GenerateTripsRequest`. When absent, behaviour is unchanged (existing tests must pass untouched).
2. When present, each slot time is the trip's time at the anchor node; earlier and later stops are calculated with the same anchor method Regenerate uses, so a generated trip and a regenerated trip with the same anchor give the same times.
3. Add an optional `slots: ServiceSeconds[]` alternative to `firstTrip`/`headway`/`lastTrip`/`tripCount`, so a plan can pass its exact slot list. Exactly one of the two forms is allowed.
4. Refuse with a finding when the pattern does not serve the anchor node.
5. Tests: no-anchor results identical to today (golden comparison); anchor at the first stop equals no anchor; anchor mid-route matches `recalculateTripWithAnchor`; a slot near a band boundary under `segmentStart`; a pattern that does not serve the node.

**Acceptance:** all existing trip tests pass unchanged; new tests pass.

---

## PF7: Build trips "From planned frequencies" (Sonnet)

**Read:** `BuildTripsDrawer` in `src/ui/trips/dialogs.tsx`; `BUILD_TRIPS_FORM_MESSAGES`; Decision 0058; PF4 and PF6 APIs.

**Specification:**

1. A two-option segmented control at the top of the drawer: **One headway** (default, today's form, unchanged) | **From planned frequencies**. The choice is remembered with the drawer's other values.
2. When the Route and Service day have no plan, the second option is disabled with the hint "No planned frequencies for this day. Add them on the Route screen."
3. From planned frequencies form: Pattern select; a checklist of the plan's periods ("6:00–8:00 · every 30 · 4 trips"), all checked; a read-only line "Times at: <measure node>" for the selected pattern's direction.
4. Preview area before building: trips per period, total, and slots that duplicate an existing trip of the same pattern at the measure node (listed; they are skipped).
5. **Build trips** sends one PF6 request with the slot list and the measure node. On success, the drawer closes as today.
6. A pattern that does not serve the measure node shows the PF6 refusal in plain language.

**Tests:** extend the Build trips Playwright tests: build from a three-period plan; duplicate slots skipped; mode disabled with no plan; a mid-route measure node gives first-stop times earlier than the slot.

**Acceptance:** the One headway mode behaves exactly as before (existing tests unchanged).

---

## PF8: Planned vs built indicators (Sonnet)

**Read:** `src/ui/trips/TripsWorkspace.tsx` (Trips header), `src/ui/trips/ScheduleTable.tsx` (headway column, `trip-headway-changed`), `src/ui/shared/chips.tsx`; PF4 `comparePlan`.

**Specification:**

1. **Chip** in the Trips header, after the Trip Profile selector: "Plan: matches", "Plan: 2 periods differ", or hidden when the Route and day have no plan. Neutral styling for matches, the existing warning tone for differs. No banner and no validation finding.
2. **Popover** from the chip: one table per direction: Period | Planned | Built | Status, with reasons in plain words ("1 extra trip", "starts 10 min late", "3 gaps off"), "Measured at <node>", and counts of trips outside the plan or not measured.
3. **Headway markers:** when the headway column is shown and the visible direction has a plan, a gap outside tolerance gets a dotted underline and a tooltip ("Planned every 15; this gap is 22"). It must not change row height.
4. The comparison refreshes after any trip write (build, shift, regenerate, delete, import).

**Tests:** Playwright: chip states; the 5:55 case shows matches; a shifted trip turns the chip to differs and back on undo; markers do not change row height. Screenshots inspected.

**Acceptance:** specification items; Trips table tests pass.

---

## PF9: Documentation, closeout, full verification (Sonnet)

**Tasks:**

1. Update `architecture_overview.md` (new record, service and data flow), `docs/data-schema.md` (record, Dexie 10, backup 10), `docs/domain-glossary.md` (Planned frequency, Period, Measure node), `docs/ui-conventions.md` if a convention was added.
2. Mark the backlog entry as implemented and link the closeout.
3. Write `docs/implementation/planned-frequencies-closeout.md`: what shipped, verification results, known limits (per-direction periods and alternating patterns deferred), and user checks.
4. Run the full verification: typecheck, all unit tests, all Playwright tests, production build, backup round trip.

**User acceptance checks (for the closeout):**

1. Enter the Federal Weekday plan (6:00–8:00 / 30, 8:00–19:00 / 15, 19:00–24:00 / 30) and copy it to Saturday.
2. Copy the plan into an alternative Scenario.
3. Build trips from the plan for FRCC to Evans; the chip shows matches.
4. Shift all trips 5 minutes earlier; the chip still shows matches.
5. Delete one mid-day trip; the chip shows the period that differs and why.
