# Decision 0051: Estimated Cost Basis from Running Hours and Typed Factors

- Status: Accepted and implemented (2026-10-31). Implementation plan: `docs/implementation/estimated-cost-basis.md`.
- Date: 2026-10-30 (user design review of the mockups)
- Supersedes in part: Decision 0027 item 1 (Revenue Hours come only from Blocks) and item 7 (the Costing selector lists only Blocking Scenarios)

## Context

A baseline Scenario has complete Trips and Blocks, so Costing can use its blocked Revenue Hours. Alternative Scenarios (other routings and start times) have complete Trips but no Blocks, and building Blocks for each one by the baseline's rules takes too long. Running hours can be calculated from Trip times without Blocks. If the layover share is similar between Scenarios, Revenue Hours can be estimated from running hours, and Platform Hours from Revenue Hours.

The user reviewed three layouts on 2026-10-30 and chose the Cost basis selector of layout A with the Estimate factors panel of layout B. The user accepted a simple percentage: the step-up of layover when cycle times round to the headway, and a minimum-layover floor, are not modelled.

## Decision

1. **Cost basis.** Costing has two kinds of cost basis. A *blocked* basis is a Blocking Scenario, as today. An *estimated* basis is a Trip Profile: its Revenue and Platform Hours are estimated from running hours. Both use the same Costing assumptions, rate-year adjustment, horizon, and annual service days.
2. **Running hours.** The running time of a Trip is its last scheduled time minus its first (`tripRunTimeSeconds`). An estimated basis adds the running time of every Trip of the Trip Profile on each service day, across every Route of the Scenario. A Trip without a usable run time is counted and reported, and it makes the estimate partial.
3. **Factors.** Two factors are typed per service day, with an All days row that applies to a day left blank:
   - Layover % is a share of Revenue Hours: Revenue = Running ÷ (1 − layover). It is the Layover % that Blocking already shows (layover ÷ revenue hours).
   - Deadhead % is a share of Platform Hours: Platform = Revenue ÷ (1 − deadhead). For a Block whose connections are all valid it equals (pull-out + pull-in + deadhead) ÷ platform hours, which is (platform − revenue) ÷ platform.
   Each factor falls back to All days on its own. A factor is a fraction from 0 up to but not including 1, stored as a fraction and shown as a percentage.
4. **Missing factors.** A day with running time and no layover factor (own or All days) gives no estimate (`layoverFactorMissing`), and the running hours are still shown. A day with no deadhead factor has no Platform Hours, shown as "—", and the cost is unaffected, because cost uses Revenue Hours only (Decision 0027 item 2 stands).
5. **Ownership.** The factors are part of the one Scenario-owned Costing assumptions record (`estimateFactors`), keyed by service-day ID. They are inputs; estimated hours and costs are derived and are not stored. Scenario duplication and backup import-as-copy remap the service-day IDs.
6. **Source of factors.** The planner types the factors. The Blocking summary shows Layover % and Deadhead % for the selected day, and the All days values weighted by annual service days, so they can be copied from a baseline. There is no stored link to another Scenario.
7. **Selector.** The Costing scope bar's "Blocking scenario" selector becomes "Cost basis": a select with an "Estimated from running time" group (one option per Trip Profile) and a "Blocked hours" group (one option per Blocking Scenario). The last choice per Scenario is a device-local preference.
8. **Trips and Blocking.** The Trips table gets a totals row (trip count, Run time, Layover, Deadhead), and a line under it with the same values for the service day's Trips in both directions. The Blocking summary gets Layover % and Deadhead % tiles and the All days values. These are derived and are not stored.
9. **Formats.** The JSON backup schema becomes version 7, and versions 1 to 6 stay readable. The Dexie schema does not change (version 9). The Costing CSV files gain cost-basis and factor columns.

## Consequences

- An alternative Scenario can be costed as soon as its Trips exist.
- The estimate is only as good as the assumption that layover and deadhead shares carry over. It is smooth, while real layover steps with headway and cycle time, so a single Route with a small runtime change can be off by several percent.
- An estimate of a fully blocked Trip Profile, using that profile's own unrounded factors, gives back its blocked Revenue and Platform Hours. This is the acceptance check of the method.
- A copied Scenario carries the baseline's Blocking Scenario as well. The planner chooses the estimated basis from the selector, and the choice is remembered.

## Rejected alternatives

- A live link to a baseline Blocking Scenario in another Scenario: it creates the first reference between Scenarios, and every baseline edit would silently change every alternative's cost.
- A captured snapshot of the baseline's factors with its source: more storage and screen elements than the user wants now.
- A headway-based cycle estimate: close to automatic blocking, which is deferred.
- Factors typed in the Cost breakdown table (layout C): the table would need 12 columns, which does not fit 1024 px.
