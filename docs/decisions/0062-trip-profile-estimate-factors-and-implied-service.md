# Decision 0062: Trip-Profile-Owned Estimate Factors and the Implied Service Check

- Status: Accepted and implemented (2026-11-09). Closeout: `docs/implementation/trip-profile-estimate-factors.md`.
- Date: 2026-11-09 (user request, after the Westracks costing review)
- Supersedes in part: Decision 0051 item 5 (the factors are part of the one Scenario-owned assumptions record, shared by every Trip Profile)
- Related: Decisions 0027 (cost basis), 0051 (estimated cost basis), 0058 (planned frequencies)
- Superseded in part by: Decision 0063, for the Implied service panel of item 6 (replaced by the Cycle calculator; the derivation stays)

## Context

The Westracks review compared a spreadsheet with the app's estimated cost basis. Two problems came from the app.

1. **One layover % per Scenario.** A Scenario with several Trip Profiles (the CW/CCW Loops at 30 and 20 minutes, Deer Creek at 15 and 20 minutes) needs a different layover % for each Profile. The planner retyped the value for each Profile before reading its cost, so the saved backup reproduced only the last Profile's cost.
2. **No check that a layover % fits the timetable.** The planner chose each layover % from a cycle time in the spreadsheet. In four Scenarios that cycle time differed from the Trips built in the app. Example: Dinosaur Lot ran 38 + 41 = 79 minutes in the app, but the spreadsheet used 76. A layover % of 15.6% therefore produced a 93.6-minute cycle (6.24 vehicles) instead of the planned 90 minutes (6 vehicles), and the cost was about 4% too high. Nothing on the Costing screen showed the cycle or the vehicle count that a layover % implies.

## Decision

1. **Ownership.** Estimate factors belong to a Trip Profile. `CostingAssumptions.tripProfileEstimateFactors` holds at most one entry `{ tripProfileId, factors }` per Trip Profile of the Scenario. `factors` has the Decision 0051 shape: All days and per-service-day layover and deadhead fractions.
2. **Fallback.** A Trip Profile with no entry uses the Scenario's `estimateFactors` as before. Once a Profile has an entry it uses only that entry, even when the entry is empty, so clearing a Profile's cells does not bring the shared values back. The Scenario's `estimateFactors` are no longer written, so data saved before this decision keeps working without a migration.
3. **Saving.** `saveEstimateFactors(scenarioId, tripProfileId, factors, assumptionsIfNew)` writes only that Profile's entry. Blank rows and rows of days outside the Scenario are dropped, and all-blank factors are saved as an empty set. Entries of Trip Profiles that no longer exist are dropped on every save. A Trip Profile outside the Scenario is refused.
4. **Trip Profile lifecycle.**
   - Copying a Trip Profile copies the source's entry to the copy, in the same transaction as the copy.
   - Deleting a Trip Profile removes its entry, in the same transaction as the deletion.
   - Scenario duplication and backup import-as-copy remap the Trip Profile and service-day IDs in each entry.
5. **Costing screen.**
   - The Estimate factors panel edits the factors of the selected cost basis's Trip Profile. A blocked basis edits the factors of its Blocking Scenario's Trip Profile.
   - The panel subtitle names the Trip Profile and says whether the values are its own ("blank days use All days") or the Scenario's shared factors ("shared scenario factors"). Shared factors also show a note that saving stores factors for this Trip Profile only.
   - Changing to a cost basis of another Trip Profile while factors are unsaved opens the existing leave dialog. Its title is "Save estimate factors before changing the cost basis?". In this case Save saves the factors only, and Discard discards the factors only; unsaved assumptions are kept.
   - A save that finishes after the planner chose another Trip Profile's basis does not overwrite the new Profile's grid.
6. **Implied service.** With an estimated basis, an Implied service panel follows the Yearly outlook. It has one row per service day with Trips (and per Route when the Scenario has more than one), with these columns:
   - **Cycle running (min):** the mean run time of each direction, added together. A direction is the Patterns' Direction, or the Pattern itself for a legacy Pattern with no Direction.
   - **Cycle with layover (min):** cycle running ÷ (1 − layover %).
   - **Headway (min):** the median gap between consecutive first departures of each direction, with the Patterns of a direction merged. Directions with different headways are shown as "a / b".
   - **Implied vehicles:** Σ over directions of (mean run ÷ (1 − layover %)) ÷ headway, not rounded.

   The values are derived (`deriveImpliedService` in `src/domain/estimatedCosting.ts`) and are never stored or exported. A value without a layover factor, or without two distinct departures in every direction, shows "—". The headway is measured from the Trips, not read from Planned frequencies, so the check also works when no plan is entered.
7. **Formats.** The JSON backup schema becomes version 11. A version 11 file validates each entry: an array; each Trip Profile of the same Scenario; at most once; factors valid as in Decision 0051. A version 1 to 10 file's `tripProfileEstimateFactors` field is dropped rather than failing the import. Versions 1 to 10 stay readable. The Dexie schema does not change (version 10). Costing CSV files are unchanged; their factor columns report the factors of the exported basis's Trip Profile.

## Consequences

- Each Trip Profile of a Scenario can be costed and saved with its own layover %, and the backup reproduces every Profile's cost.
- The planner can see on the Costing screen whether a layover % fits the planned cycle and fleet before relying on the cost.
- A Scenario with shared factors keeps them as the default for any Trip Profile that has not saved its own. Two places can hold factors, and the subtitle says which one applies.
- The implied vehicle count assumes a uniform headway and every direction repeated in each cycle. For timetables whose headway changes during the day it describes the most common headway only.

## Rejected alternatives

- **Move the shared factors into every Trip Profile with a migration.** This needs a database upgrade, and a Trip Profile created later would start with no factors at all.
- **Read the headway from Planned frequencies.** Most alternatives in the Westracks project have no plan. A measured headway covers every case. A plan-based check can be added later.
- **Round implied vehicles up to whole buses.** The decimal value shows how far the layover % is from a whole-vehicle cycle, which is the point of the check.
