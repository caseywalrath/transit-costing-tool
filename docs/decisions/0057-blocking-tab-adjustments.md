# Decision 0057: Auto-blocking Rebuild in Place, Breaks Toggle, Default Blocking Scenario, and Day per Scenario

- Status: Implemented at the user's request of 2026-11-04; awaiting user review
- Date: 2026-11-04
- Amends: Decision 0055 (Automatic Blocking), item 1 (where), the "Build again…" provenance note, and the Breaks section of the dialog

## Context

The user asked for these Blocking tab changes on 2026-11-04:

1. Replace the "Built automatically" note bar and its **Build again…** link with one Actions menu entry, renamed from "Build blocks automatically…" to **Auto-blocking…**. The dialog offers two choices: create a new auto-blocking scenario (the default), or edit the rules of the existing one. A checkbox next to the scenario name makes the choice.
2. Name new automatic Blocking Scenarios Auto 1, Auto 2, and so on.
3. Make breaks easy to switch off. Before this change, the planner had to clear every break value. Remove the explanatory note about meal and relief breaks and run cutting.
4. When a Trip Profile has no Blocking Scenario, provide a "Default" one that shows the unblocked Trips, so the planner does not have to create one first.
5. When the planner switches Scenarios, return to the Day last viewed in that Scenario instead of resetting to Weekday.

## Decision

1. **Menu.** The Blocking actions menu entry is **Auto-blocking…**. The dialog and its heading are titled "Auto-blocking". The note bar above the Blocking surfaces is removed.
2. **New or edit.** Below the Blocking scenario name, a checkbox reads "Edit rules of {selected Blocking Scenario}". It is unticked by default.
   - It is enabled only when the selected Blocking Scenario has an `autoBlocking` record.
   - **Ticked:** the dialog loads that scenario's stored rules and name. The submit button reads **Rebuild blocks**. If the scenario's Blocks were edited, added or deleted since the last build, a warning note says that a rebuild replaces those edits.
   - **Unticked:** the name returns to the proposed new name. The submit button reads **Create blocking scenario**.
3. **Rebuild in place.** `AutoBlockingRequest.replaceBlockingScenarioId` names the Blocking Scenario to rebuild. The service refuses a Blocking Scenario that belongs to another Trip Profile or has no `autoBlocking` record.
   - The rebuilt scenario keeps its id.
   - It takes the name in the dialog. Name uniqueness ignores the scenario itself.
   - Its Blocks on the ticked service days are replaced. Its Blocks on other days are kept.
   - The `autoBlocking` record is replaced. Its `builtAt` is the rebuild time, `blockCount` counts all Blocks, and `tripCount` adds the Trips in the kept Blocks.
   - The Blocks are written in one transaction, guarded by the scenario's source signature. The Blocking Scenario record is written after them. If the second write fails, the new Blocks remain with the old record. That record then shows them as edited, which the planner can correct by rebuilding again.
4. **Names.** The proposed name is "Auto n", where n is the lowest number of 1 or more whose name is not taken in the Scenario. The comparison ignores case.
5. **Breaks.** The Breaks section starts with an **Add breaks** checkbox.
   - **Unticked:** the four break fields are disabled and keep their values. The rules carry no `break`, and the summary line reads "No breaks". The worked-example line is hidden.
   - **Ticked:** the fields are enabled and the typed values apply again.
   - The meal and relief note is removed.
6. **Default Blocking Scenario.** `BlockingCommands.ensureDefaultBlockingScenario(scenarioId, tripProfileId)` returns the Trip Profile's first Blocking Scenario. When there is none, it creates an empty one named "Default" ("Default 2", and so on, if the name is taken).
   - The Blocking tab calls it whenever the selected Trip Profile has no Blocking Scenario, including after the last one is deleted.
   - The Blocking scenario selector no longer offers "No blocking scenario".
7. **Day per Scenario.** Two places remember the Day per Scenario:
   - The Blocking tab stores the Day last viewed in each Scenario, as `serviceDayByScenario` in its local selection preference.
   - The shared scope of the other tabs keeps, for the session, the Day and Trip Profile last viewed in each Scenario and the direction last viewed on each Route.

   A Scenario switch restores the remembered value when it still exists, and otherwise falls back to the first entry.

8. **Blank Default is filled, not kept beside (user request of 2026-11-04).** When Auto-blocking creates a new scenario and the Trip Profile has a Blocking Scenario named "Default" (or "Default n") with no Blocks and no `autoBlocking` record, the result is written into that scenario: it keeps its id, takes the dialog's name, and receives the Blocks and the record in one `saveBlockingScenarioGraphAtomically` write. The write is refused if the Default gained Blocks since it was read. Otherwise a new Blocking Scenario is created.
9. **Blocked Cost breakdown shows trips and running hours (user request of 2026-11-04).** `CostingDailyResult` gains optional `tripCount` (revenue Trips in the day's eligible Blocks) and `runningHoursPerDay` (their running hours). The Cost breakdown shows them on the blocked basis, and the Total row adds the trips. They are information only and do not enter the cost.

## Consequences

- Opening the Blocking tab can write: it creates the Default Blocking Scenario when one is needed. This shows in the save status like any other write.
- Rebuild in place discards hand edits on the rebuilt days. The warning note states this before the planner confirms.
- No schema change. `replaceBlockingScenarioId` is a request field only, and `serviceDayByScenario` is a UI preference.
