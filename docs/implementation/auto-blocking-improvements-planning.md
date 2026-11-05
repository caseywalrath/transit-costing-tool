# Auto-blocking Improvements: Planning Notes

- Status: Planning. Not yet a decision record or an implementation plan. Open decisions are listed per element with a recommendation.
- Date: 2026-11-05
- Builds on: Decision 0042 (minimum-layover display preference), Decision 0050 (minimum layover by direction), Decision 0055 (automatic blocking), Decision 0056 (most recently ready vehicle, peak vehicles, maximum vehicles), Decision 0057 (rebuild in place, breaks toggle)
- Next step: settle the open decisions, then write the implementation plan (work packages, acceptance criteria, model recommendations) and the decision records.

## Purpose

These notes record a planning discussion about making automatic blocking more intelligent. They give a new session enough context to understand what was agreed, why, and what is still open. They are not implementation instructions.

The user agreed to plan seven elements:

1. Break windows
2. Target + floor layover, in manual blocking and in auto-blocking
3. Round-trip recovery
4. Sensitivity sweep
5. Balance Layovers (the user-facing name for a "tail swap" post-pass)
6. Maximum layover / idle split, with separate counts of blocks and peak vehicles
7. Small trip time shifts, shown as reviewable suggestions

## Background: how blocking works today

### Automatic blocking (Decisions 0055, 0056, 0057)

- **Code:** the pure engine is in `src/domain/autoBlocking.ts`, the dialog in `src/ui/blocking/AutoBlockingDialog.tsx`, and the application service in `src/application/blockingService.ts`. The Blocking tab opens the dialog from Actions → **Auto-blocking…**.
- **Chaining (`chainPass`):**
  - Trips of one Route and service day are taken in order of first departure.
  - Each Trip goes to the open Block that became ready **most recently** after its minimum layover.
  - A Block already at the Trip's first node always wins over one that needs a deadhead connection.
  - If no Block can take the Trip, a new Block starts.
  - The rule is deterministic and greedy: it never looks ahead and never optimizes.
- **Rules per Pattern:** minimum layover after the Pattern (none, minutes, or % of trip running time), Break here, Block can start, Block can end.
- **One break rule:** length (which includes the minimum layover), "only for blocks longer than", "first break no earlier than (h after start)", and an optional "another break after (h)".
  - A break is taken at the **first** Break-here arrival that meets the timing.
  - Blocks that end shorter than the minimum are rebuilt without a break, up to 5 passes.
- **Limits:** maximum running hours and maximum revenue miles per Block.
- **Maximum vehicles per day:** if peak vehicles exceeds it, the day is rebuilt with the older "ready longest" choice, and the better of the two builds is kept. It is not a hard constraint.
- **Other inputs:** pull-out and pull-in minutes and miles per terminal, an optional garage per Route, and deadhead connections between nodes of the same Route.
- **Stored rules:** the rules are saved on the Blocking Scenario as `autoBlocking` (`AutoBlockingRecord`). The JSON backup schema is version 9. Each new stored rule field has so far meant a backup schema bump, with older versions still importing.
- **Preview:** per day, it shows blocks, peak vehicles, revenue hours, layover %, longest block, and the number of blocks with one break and with two or more breaks.
- **Peak vehicles:** the most Blocks in service at the same moment. It is derived by `peakVehicles()` and never stored.
- **Evidence from Decision 0056:**
  - Without breaks, "most recently ready" matches the exact optimum and the hand-built Golden blocks.
  - The largest remaining error against hand-built blocks is **break placement** (Jeffco).
  - 0056 explicitly listed both "deferring a break that would force a new Block" and "ending a Block when it is idle longer than a set time" as later work.

### Manual blocking minimum layover (Decisions 0042, 0050)

- The Blocking tab's minimum layover is a **browser display preference**, set per direction (outbound and inbound). It is stored in local preferences, not in Blocks, Blocking Scenarios or backups.
- It only changes how Unassigned trips are classified for the selected Block: Assign, Layover (insufficient), Deadhead, Conflict or Review (`classifyBlockingInsertion` in `src/domain/blocking.ts`).
- It does not change a Block's layover, validity, completeness or summaries.
- Decision 0042 states that any rule that flags or rejects layovers **already inside a Block** needs its own decision record.
- The auto-blocking dialog takes its default per-Pattern minimum layover from this preference, matched by direction.

### A key observation about "most recently ready"

Choosing the most recently ready vehicle means every Trip gets the vehicle with the **least extra layover**. That is what saves hours, because surplus vehicles finish early, but it concentrates short recovery on the vehicles in rotation.

When two Blocks wait at the same terminal at overlapping times, swapping the rest of their day changes:

- no Block count;
- no total hours (the set of start and end times is unchanged);
- no peak vehicles (the same start and end times give the same concurrency).

It only changes how layover is distributed. This is the basis of Balance Layovers (element 5).

## Element 1: Break windows

**User decision:** do this.

**Concept.** The break gets a window: "first break no earlier than X h and no later than Y h after the Block starts".

- Inside the window, the vehicle takes the break when it is not needed.
- At the window's end, it takes the break regardless.

This targets the measured largest error: breaks taken at the first eligible arrival force extra Blocks.

**Proposed behavior.**

- Before the window opens: unchanged, no break.
- Inside the window, the vehicle is "break due":
  - It is the **last choice** among candidates for a Trip. It is chosen only if no other vehicle can take the Trip without a new Block starting.
  - A wait at a Break-here node at least as long as the break length counts as the break.
- At the window's end, the break is mandatory, as today: ready time = arrival + break length.
- "Another break after" gets the same treatment, with its window measured from the end of the previous break.
- The "only for blocks longer than" rebuild passes are unchanged.

**UI.** In the Breaks section, a new field "…and no later than (h after start)" next to "First break no earlier than". Blank means no deadline, which is today's behavior.

**Data.** An optional latest-break field (and the equivalent for the repeat break) in `AutoBlockingRules`. This needs a backup schema bump.

**Verification intent.** Rerun the Jeffco comparisons recorded in Decision 0056 and the Golden test (`src/domain/autoBlocking.golden.test.ts`), and record the new numbers.

**Open decisions:**

- **D1.1.** Does a natural long wait inside the window count as the break? Recommended: yes. Decision 0056 found it made no difference on its own, but combined with deferral it is what lets deferral work.
- **D1.2.** Does the repeat break get a deferral window too? Recommended: yes, with the same "no later than" offset.

## Element 2: Target + floor layover (manual and auto-blocking)

**User decision:** apply target + floor in both manual blocking rules and auto-blocking.

**Concept.** Each minimum layover becomes:

- a **target**, the normal minimum (for example 12 minutes);
- an optional **floor**, the lowest acceptable layover (for example 5 minutes).

The floor can be limited by conditions that are combinable:

- **Not on consecutive trips**, which covers "every other trip".
- **Only during peak periods.**

A floor without conditions means "allowed whenever it avoids a new Block".

**Auto-blocking engine.** Candidates are tried in tiers, so the floor is used only when it saves a Block:

1. Direct candidate that has met its **target**.
2. Direct candidate that has met its **floor**, where the conditions allow it.
3. Deadhead candidate at target, then deadhead candidate at floor.
4. New Block.

The existing "most recently ready" ordering applies within each tier. Each vehicle remembers whether its last layover used the floor, so "not on consecutive trips" can be checked.

**Auto-blocking dialog.**

- The "Minimum layover after" column becomes **Target layover after**, with the current none / minutes / % control, and **Floor**, which is blank (no floor) or an amount in the same unit.
- The floor conditions are set once per rule set, not per Pattern.

**Manual blocking.**

- The per-direction Minimum layover dialog gains the same target, floor and conditions.
- Unassigned trips get a new classification between Assign and Layover:

| Gap | Today | Proposed |
|---|---|---|
| At or above target | Assign | Assign |
| At or above floor, below target, conditions allow | Layover | **Short** (amber, still assignable) |
| Below floor, or floor not allowed | Layover | Layover |

- The Layover column of a Block's trip list marks connections below target and below floor. This flags layovers inside a Block, which Decision 0042 says needs its own decision. The flag is display-only: no change to Block status, validity or summaries.

**Data.**

- `MinimumLayoverRule` gains an optional floor.
- Auto-blocking rules gain the floor conditions, stored (backup schema bump).
- Manual blocking remains a browser preference, so no stored data changes.

**Open decisions:**

- **D2.1.** Should below-target and below-floor connections inside Blocks be flagged, display-only, under a new decision record? Recommended: yes.
- **D2.2.** Where are peak periods defined? Recommended: one "Peak periods" list of time ranges per rule set (for example 06:00–09:00 and 15:00–18:30), in both the auto-blocking rules and the manual preference, judged by the arrival time of the Trip being laid over. Runtime bands exist but describe running time, not peaks.
- **D2.3.** Should "Read rules from built blocks" measure a floor? Recommended: yes. The floor is the shortest observed layover after the Pattern. The target is a representative typical layover (for example the most common layover rounded down to 5 minutes). The readout says which method was used.

## Element 3: Round-trip recovery

**User decision:** implement. How it sits alongside "minimum layover after" was to be worked out.

**Proposed relationship.** It sits alongside the per-Pattern minimum and does not replace it.

- The per-Pattern minimum layover (target and floor) remains the requirement **at each end** of a trip.
- Round-trip recovery, optional and per Route, requires the layover over an outbound + inbound pair to total at least X% of the pair's running time, or X minutes.

This matches agencies that take most recovery at one terminal and only a short turn at the other.

**Engine.** Each vehicle carries the recovery it still owes:

- After the first Trip of a pair, the required layover is the per-Pattern minimum.
- After the second Trip, it is the larger of the per-Pattern minimum and the round-trip requirement minus the layover already taken after the first Trip.
- A loop Pattern, or one without a direction, is its own round trip.

**UI.**

- Auto-blocking: a "Round-trip recovery" field per Route, above that Route's Pattern table. The options are none, minutes, or % of round-trip running time.
- Manual blocking: the same field in the Minimum layover dialog. A connection that leaves a round trip short is flagged display-only, as in D2.1.

**Data.** An optional round-trip recovery per Route in the rules (backup schema bump). For manual blocking, a browser preference.

**Open decisions:**

- **D3.1.** What defines a round trip? Recommended: two consecutive Trips in the same Block in opposite direction groups, starting from the Trip that leaves the Block's start terminal. The alternative is a planner-chosen "home terminal" per Route, which is more explicit but adds a field.
- **D3.2.** Interaction with the floor. Recommended: the floor still applies at each end. Round-trip recovery only ever adds required layover at the closing end of the pair.

## Element 4: Sensitivity sweep

**User decision:** agreed.

**Concept.** Rerun the engine across a range of values for one setting and show where the results step up or down (the "vehicle steps" Decision 0055 describes).

**UI.** A collapsible **Sensitivity** section in the dialog's right column, under Preview.

- Controls: setting, range and step.
- Results: a table with one row per value and the columns Value, Blocks, Peak vehicles, Revenue (h) and Layover %.
- Rows where peak vehicles changes are highlighted.
- Each row has "Use this value", which writes the value into the draft rules.

**Settings that can be swept:**

- an offset to every layover target (± minutes);
- break length;
- round-trip recovery %;
- maximum running hours.

**Engine.** A pure sweep function that calls `buildAutoBlocks` once per value and returns the day summaries. Nothing is stored. The sweep is capped at about 15 values. Golden (276 trips) builds quickly enough that no background worker is expected.

**Open decisions:**

- **D4.1.** Table only, or also a step chart? Recommended: the table first, and the chart later.
- **D4.2.** Which days? Recommended: all ticked days, with per-day columns when more than one is ticked.

## Element 5: Balance Layovers (tail swap)

**User decision:** agreed. The user-facing name is **Balance Layovers**. "Tail swap" is the internal term only.

**Concept.** A post-pass that swaps "the rest of the day" between two Blocks waiting at the same node, so layover is spread more evenly. Block count, total hours and peak vehicles never change (see "A key observation" above).

**Engine.** A bounded local search after the build.

- **When a swap is allowed:** the two Blocks are at the same node with overlapping wait windows, and each meets its required layover (target and floor conditions, round-trip recovery) before the other's next departure.
- **Objective:** raise the smallest layover above target across the day, then the next smallest, and so on.
- **Re-checks:** limits (running hours, miles) and the break rules are re-checked on both resulting Blocks. A swap that loses or duplicates a break, or breaks a limit, is rejected.
- **Stopping:** the search stops when no swap improves, with a fixed cap on the number of swaps.

**UI.**

- Auto-blocking: a "Balance layovers" checkbox in the dialog. The preview adds "Layovers below target" (a count) and "Shortest layover".
- Manual blocking, as a later package: a Blocking actions item "Balance layovers…". It runs the same pass on the selected day's Blocks of any Blocking Scenario, including hand-built ones, and shows a before/after summary before applying. Because it works on finished Blocks, it doesn't need auto-blocking rules. It can use the manual preference's target and floor.

**Data.** A stored true/false flag in the rules (backup schema bump). The manual action writes ordinary Blocks.

**Open decisions:**

- **D5.1.** Is the checkbox ticked by default for new builds? Recommended: yes, because it costs no hours or vehicles. Existing automatic scenarios keep "off" when rebuilt.
- **D5.2.** Should Balance Layovers be offered on the Blocking tab for any Blocks? Recommended: yes, as a separate, later package.

## Element 6: Maximum layover / idle split

**User decision:** agreed. Blocks and peak vehicles must be counted separately, and where those numbers appear has to be decided.

**Concept.** When a vehicle would sit idle longer than a set time, the Block ends (pull-in) and a new Block starts later (pull-out). This removes revenue hours and adds pull-out and pull-in time. It addresses the case Decision 0056 noted: a spare peak vehicle keeps one long midday layover in its Block.

**Engine.**

- A split happens only when:
  - the idle point is a node where a Block can end (the Pattern arriving there has "Block can end" ticked) and can start (the next Trip's Pattern has "Block can start" ticked);
  - the idle time minus pull-in and pull-out exceeds a minimum saving.
- **Garage:** with a garage, the split pulls in to it and out from it, with that terminal's minutes and miles. Without one, both happen at the terminal.
- **Order:** the split runs after the main build and before Balance Layovers.

**Counts.** These numbers mean different things:

| Count | Meaning | Effect of a split |
|---|---|---|
| Blocks (= pull-outs) | Each Block is one pull-out/pull-in pair | +1 per split |
| Peak vehicles | Most Blocks in service at the same moment | Unchanged, because the two pieces never overlap |
| Split blocks | Blocks created by an idle split | New figure |

**Where the numbers go:**

- **Auto-blocking preview:** add a "Split" column. Blocks and Peak vehicles already exist.
- **Blocking tab day summary** (the stat strip in `BlockingWorkspace.tsx`): add **Blocks** and **Peak vehicles** tiles. Peak vehicles is derived with the existing `peakVehicles()` and not stored, as in Decision 0056.
- **Costing:** show Peak vehicles per day, display only. It isn't priced today. This prepares for a possible per-vehicle cost.

**UI.** In Block limits, a new field "End a block when idle longer than (h)". Blank means never.

**Data.** A stored idle-split threshold in the rules (backup schema bump). No link between the two pieces is stored, because peak vehicles is derived from times alone.

**Open decisions:**

- **D6.1.** How are split pieces labeled? Recommended: ordinary sequential labels. Suffixes like "3A/3B" would imply a stored link that doesn't exist.
- **D6.2.** Should manual blocking flag long idle gaps? Recommended: yes, as a display-only note when a connection exceeds an idle threshold in the manual preference, using the same mechanism as D2.1.
- **D6.3.** Should Peak vehicles appear on the Costing tab now? Recommended: yes, display only.

## Element 7: Small trip time shifts

**User decision:** useful for showing where small shifts bridge layover floors.

- The user sets a tolerance.
- The user reviews each suggested shift individually.
- Where the feature lives and what its UI looks like were to be worked out.

**Concept.** Given a tolerance (for example ±3 minutes), list the Trips whose departure, moved within it, would:

- **(a)** join an existing Block instead of starting a new one (saves a Block, sometimes a peak vehicle); or
- **(b)** lift a connection from below floor to at least floor, or from below target to at least target.

**How suggestions are found.**

- Candidates come from the finished build:
  - Trips that start a new Block while a vehicle at their first node becomes ready within the tolerance after their departure;
  - connections that miss floor or target by no more than the tolerance.
- Each candidate is tested by an actual rebuild with that one shift, so the benefit shown is measured, not estimated. Candidates are capped (about 30).
- Each suggestion shows its headway impact: the headway to the previous and next Trip in the same direction, before and after (for example "15/15 → 17/13").
- An optional "Max headway change" setting filters suggestions out.

**UI, auto-blocking first.** A "Shift suggestions" section in the dialog's right column.

- Controls: tolerance and max headway change.
- A review table:

| Select | Trip | Shift | Benefit | Headway before → after |
|---|---|---|---|---|
| ☐ | 7:42 Outbound | +2 min | −1 block, −1 peak | 15/15 → 17/13 |

- "Apply selected shifts" moves the Trips through the existing trip-shift logic (`src/domain/tripShift.ts`), then the preview reruns.
- A warning states that this changes Trips in the Trip Profile, which affects every Blocking Scenario on that profile.

**UI, manual blocking later.** In Unassigned trips, a Layover or Short classification can carry a hint such as "fits if shifted +2 min", with a "Shift…" action that opens the same review for that one Trip.

**Data.** None new. Applying a shift edits Trips, which are already authoritative data. Suggestions are derived.

**Open decisions:**

- **D7.1.** Single-Trip or multi-Trip shifts? Recommended: single-Trip only. Multi-Trip combinations multiply the candidates and are harder to review.
- **D7.2.** Apply in the dialog, or send the planner to the Trips tab? Recommended: apply in the dialog, with a note pointing to the Trips tab's existing undo.
- **D7.3.** Can the suggested shift move either the joining Trip or the Trip before it? Recommended: both, each listed as its own row.

## Points that affect every element

- **Backup schema.** Elements 1, 2, 3, 5 and 6 add stored rule fields. The choice is one bump to version 10 that collects all of them before release, or one bump per package if they ship separately. This is to be decided in the implementation plan.
- **Decision records.** Recommended grouping:
  1. Layover rules: target + floor, round-trip recovery, and the display-only flags inside Blocks.
  2. Break windows.
  3. Balance Layovers, idle split, and the block and vehicle counts.
  4. Sensitivity sweep and shift suggestions.
- **Suggested order.**
  1. Break windows.
  2. Target + floor (engine, then manual).
  3. Round-trip recovery.
  4. Idle split and counts.
  5. Balance Layovers.
  6. Sensitivity sweep.
  7. Shift suggestions.

  The sweep comes after the new settings exist so it can sweep them. Shift suggestions depend on floors.
- **Work-package classes** (per `AGENTS.md` and `codex.md`):
  - Engine and rule work is structural (Luna class) and is verified with the golden and synthetic checks (`docs/implementation/automatic-blocking/synthetic-check.py`).
  - The new dialog sections, the manual-blocking classification states and the shift review table need UI-design (Sol class) packages, with mock-ups in `docs/implementation/automatic-blocking/` as in the earlier auto-blocking work.
- **Unchanged principles from Decisions 0055 and 0056.**
  - The engine stays deterministic, pure (no React, no IndexedDB) and explainable.
  - Generated Blocks stay ordinary, editable Blocks.
  - Limits produce findings, not refusals.
  - Peak vehicles stays derived, not stored.

## Ideas discussed but not in scope

These were raised in the brainstorm and not selected for this round. They remain candidates:

- a per-vehicle cost in Costing, plus scoring several candidate builds;
- locked Blocks;
- vehicle types;
- battery-electric range and charging;
- terminal capacity;
- restroom and relief-point node tags;
- preferred Block lengths for run cutting;
- multiple garages;
- interlining across Routes (needs a data-model change, because nodes belong to one Route);
- exact optimization.
