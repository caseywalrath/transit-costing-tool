# Decision 0058: Planned Frequencies per Route and Service Day

- Status: Accepted; not yet implemented
- Date: 2026-11-05 (user design review; plan `docs/implementation/planned-frequencies.md`, package PF0)
- Related: Decisions 0036 (writes re-read stored data), 0038 and 0039 (Scenario copy and backup import), 0041 (deletion reviews), 0046 (regenerate and anchors), 0051 (no links between Scenarios)

## Context

A planner usually knows the intended service plan before building trips, for example 6:00–8:00 every 30 minutes, 8:00–19:00 every 15, 19:00–24:00 every 30, and the plan often differs by Service day. Today the plan lives outside the tool. Build trips takes one headway at a time, and nothing shows whether the built trips still follow the plan after shifts and edits.

On the Federal Boulevard test Route, one Pattern's first stop is another Pattern's mid-route stop, so a frequency must be placed and measured at a chosen node, not at each Pattern's first stop.

## Decision

1. **Record.** A new Scenario-owned record:

   ```ts
   interface PlannedPeriod { id: EntityId; startTime: ServiceSeconds; endTime: ServiceSeconds; headwaySeconds: DurationSeconds; }
   interface PlannedFrequency extends EntityMetadata {
     id: EntityId; scenarioId: EntityId; routeId: EntityId; serviceDayId: EntityId;
     periods: PlannedPeriod[];
     /** Direction ID → node ID. A missing entry means the default (item 3). */
     measureNodeIdByDirectionId: Record<EntityId, EntityId>;
   }
   ```

   There is at most one record per Route × Service day. A Route and day with no record has no plan. A record with no periods is not stored: clearing the last period deletes the record.

2. **Ownership.** The plan belongs to one Scenario. It is never shared or linked between Scenarios. It is not per Trip Profile: every Trip Profile of the Scenario is compared with the same plan.

3. **Periods.**
   - Times are service seconds; times past 24:00 are allowed (for example 25:30).
   - Start is inclusive and end is exclusive, as for runtime bands.
   - `endTime > startTime`.
   - Periods of one record must not overlap. Gaps between periods are allowed and mean no planned service.
   - `headwaySeconds` is a whole number of seconds, at least 60 and at most the period length.
   - Periods are stored sorted by `startTime`.
   - Directions share the periods. Periods that differ by direction are deferred.

4. **Measure node.** Each direction has a measure node, where planned times are placed and built times are measured.
   - The node must be served by at least one Pattern of that direction.
   - Default when no node is stored: the node of the direction's first timepoint column.
   - If a stored node is no longer served by any Pattern of the direction (for example after a Pattern edit), the default is used and the result reports `measureNodeFellBack`. The stored value is kept, not deleted silently.
   - A Pattern that visits the measure node more than once uses its first visit, and the result reports the Pattern as ambiguous.

5. **Slots.** The planned times of a period are `startTime + k × headwaySeconds` for every whole k ≥ 0 with the result `< endTime`. A period whose length is not a multiple of the headway ends with its last slot before `endTime`.

6. **Comparison.** Derived on request and never stored. It is computed per Route, Service day, direction and Trip Profile.
   - **Which trips:** every trip of the direction, from every Pattern that serves the measure node, merged in order of their time at the node. Trips whose Pattern does not serve the node are counted as `notMeasured`.
   - **Which period:** a trip's candidate periods are the periods that contain its time at the measure node and the periods whose edge tolerance reaches it (up to half a headway before the first slot or after the last slot). The candidate with the nearest planned slot wins; a tie goes to the containing period, then the earlier period. So a trip at 5:55 belongs to a 6:00 period, and when a whole timetable moves 5 minutes earlier, the 7:55 trip still belongs to the period that starts at 8:00. Trips with no candidate are counted as `outsidePlan`. They are not a difference. (Refined in PF2, 2026-11-05: strict containment would have put a shifted timetable's first trip of each period into the period before it.)
   - **Tolerances** (equality at a limit counts as within):
     - *Edges:* the period's first trip must be within half a headway of `startTime`, and its last trip within half a headway of the last slot.
     - *Gaps:* each gap between consecutive trips of the same period must be within ± max(60 seconds, 10 % of the headway) of the headway. The gap that crosses a period boundary is not judged.
     - *Count:* the number of trips in the period must be within ± 1 of the number of slots.
   - **Result per period:** `matches`, `differs` with one or more reasons (`extraTrips`, `missingTrips`, `gapsOff`, `startEdge`, `endEdge`), or `noTrips`.
   - The comparison never creates a validation finding, never blocks a write, and never changes a trip.

7. **Building trips from the plan.** Build trips gets a second mode, From planned frequencies. It builds one Pattern at a time (alternating Patterns are deferred) for the periods the planner selects. Each slot is the trip's time at the direction's measure node. Earlier and later stops are calculated with the same anchor method as Regenerate (Decision 0046), so a built trip and a regenerated trip with the same anchor have the same times. Building is additive. A slot that equals an existing trip's time at the measure node, for the same Pattern, is skipped and listed in the preview. With no anchor node, generation behaves exactly as before this decision.

8. **Copy from another Service day.** Within one Route, the source day's periods and measure nodes replace the target day's. The preview shows the periods and warns when an existing target plan will be replaced. The write refuses a stale preview.

9. **Copy from another Scenario.** A one-time copy into the open Route, with no stored link.
   - The planner picks the source Scenario of the same Project, then the source Route.
   - **Service days** are matched in this order: by `kind` when exactly one day of that kind exists on each side (`custom` days are never matched by kind); otherwise by name, trimmed and ignoring case. Unmatched source days are listed and skipped. Target days with no match keep their plans.
   - **Measure nodes** are matched by node name, then by short name (trimmed, ignoring case), within the target direction of the same group (`outbound` or `inbound`). An unmatched node is not copied, so the target uses its default, and the preview lists it.
   - The preview lists each matched day as new or replaces, the unmatched days, and the measure nodes that fall back. Applying writes all matched days in one transaction and refuses a stale preview.

10. **Duplication and deletion.**
    - Duplicating a Scenario (`duplicateScenario`) or a Route (`duplicateRouteRecords`) copies its plans with new IDs, remapping Route, Service day, period, direction and node IDs.
    - Deleting a Route deletes its plans, and the Route deletion review (Decision 0041) shows their count.
    - Service days cannot be deleted today. If deletion is added, it must delete that day's plans and list them in its review.
    - Scenario copy recovery (Decision 0038) treats plans like the other Route-owned records.

11. **Formats.**
    - Dexie version 10 adds the table `plannedFrequencies` with indexes `id, scenarioId, routeId, [routeId+serviceDayId]`. No data upgrade.
    - The JSON backup schema becomes version 10 and exports plans. Versions 1 to 9 stay readable and import with no plans. Import-as-copy remaps IDs. Import validation rejects a plan whose Route, Service day, direction or node is missing, or whose periods break item 3.
    - The Trips CSV and the Costing outputs do not change.

## Consequences

- A plan is optional. Routes and Scenarios without one look and behave as before.
- The planner sees whether the trips still follow the plan after shifts, regenerations and edits, without warnings that interrupt work. Small moves such as starting at 5:55 instead of 6:00 still count as matching.
- Copying a Scenario carries its plans, and another Scenario's plans can be pulled in once. Later edits to either Scenario stay separate.
- Generation gains an anchor node. Existing builds are unchanged because the anchor is optional.
- One new table and one backup schema version.

## Rejected alternatives

- **Shared across Scenarios.** Routes and Service days are Scenario records, so a shared plan would point at records that differ between Scenarios, and Decision 0051 already rejected live links between Scenarios.
- **A plan per Trip Profile.** Trip Profiles are alternative timetables that are meant to be compared with one target.
- **Periods per direction.** Deferred. Most Routes share periods across directions; the measure node already differs by direction.
- **Alternating Patterns within one build.** Deferred. Each Pattern is built separately.
- **Storing comparison results.** They would go stale after every trip write; they are derived instead.
- **Measuring at each Pattern's first stop.** It fails when one Pattern's first stop is another's mid-route stop.
