# Decision 0050: Minimum Layover by Direction

- Status: Accepted and implemented
- Date: 2026-10-30 (user request after the Blocking review)
- Annotates: Decision 0042

## Context

Decision 0042 made the minimum layover one rule, in minutes or as a percentage of the preceding Trip's revenue runtime, applied to every connection. Planners need a different minimum after outbound Trips than after inbound Trips, or a minimum for one direction only.

## Decision

1. The minimum layover is a rule **per direction**: `MinimumLayoverRules = { outbound?: MinimumLayoverRule; inbound?: MinimumLayoverRule }`. A direction without an entry has no minimum. "Both directions" is the same rule under both keys. "Outbound only" or "inbound only" is one entry.
2. The **direction of the preceding Trip** picks the rule, because the layover is taken at the end of that Trip. A Trip's direction is the schedule group (`RouteDirection.group`) of its Pattern's direction. A loop uses the group it was assigned to. The percentage rule already measures the preceding Trip, so the two agree.
3. When the direction of the preceding Trip is **unknown** (a Pattern with no direction, or a direction with no group, or no Directions supplied to the service), the larger of the two requirements applies, so missing data never waives a requirement.
4. A minimum-layover warning (`block.minimumLayoverShort`) carries the direction in its parameters, and the Blocking screen says "after an outbound trip" or "after an inbound trip".
5. The Minimum layover dialog opens with "Same for both directions" checked, which looks and behaves as before. Clearing it shows one Rule and amount for each direction. A direction set to "No minimum" has no amount. Apply is disabled while a direction that has a rule has a blank or invalid amount; the message names the direction.
6. A preference stored before this decision (a single rule) is read as that rule for both directions. Anything of the wrong shape reads as no minimum. No IndexedDB migration is needed because the preference is not authoritative data.
7. Everything else in Decision 0042 holds. The preference is a browser display preference, it changes candidate classification only, it is not stored in a Block, a Blocking Scenario, or a backup, and it does not change a Block's layover, validity, completeness, or any summary. A rule that rejects or flags layovers already inside a Block would need its own decision record.

## Consequences

- `BlockingContextProvider` gains an optional `listDirections(scenarioId)`. Without it, every direction is unknown and item 3 applies.
- `docs/domain-glossary.md`, `docs/ui-conventions.md`, and `architecture_overview.md` describe the per-direction rule.
