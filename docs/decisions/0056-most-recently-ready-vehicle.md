# Decision 0056: Automatic Blocking Gives Each Trip to the Most Recently Ready Vehicle

- Status: Proposed (2026-11-04); awaiting user acceptance
- Date: 2026-11-04
- Amends: Decision 0055 (Automatic Blocking), item 4 (chaining rule) and item 11 (reading the break from built blocks)
- Plan: `docs/implementation/most-recently-ready.md`

## Context

Decision 0055 item 4 gives each Trip to "the open Block that has been ready longest at the Trip's first node". That rule rotates every vehicle through the whole day. After a peak, the surplus vehicles keep taking an occasional Trip, so none of their Blocks ends early and every Block carries long waits. Costing charges Block hours, not vehicles, so those waits are cost.

On 2026-11-04 the primary agent compared the rule with an exact optimum. The optimum is the fewest Blocks, then the least total Block span, allowing only each Pattern's minimum layover, with no breaks, limits or deadheads. It was computed with a minimum-cost assignment (Hungarian algorithm) per Route and service day. The rules were the ones "Read rules from built blocks" produces for each Blocking Scenario. Results, as blocks / revenue hours per day:

| Project, day | Built by hand | Ready longest (current) | Most recently ready | Exact optimum |
|---|---|---|---|---|
| Golden (Federal BRT), Weekday, 276 Trips | 18 / 311.59 | 18 / 343.27 | 18 / 311.59 | 18 / 311.59 |
| Golden, Saturday, 260 Trips | 17 / 280.95 | 17 / 308.50 | 17 / 280.95 | 17 / 280.95 |
| Golden, Sunday and Holiday, 224 Trips | 17 / 245.89 | 17 / 273.39 | 17 / 245.89 | 17 / 245.89 |
| Jeffco 2025 Baseline, no break, 58 Trips | 7 / 45.92 | 6 / 41.50 | 6 / 41.50 | 6 / 41.50 |

Findings:
- Both rules reach the optimum block count in every case. Neither rule's vehicle count is in question.
- On Golden, the current rule uses about 10% more hours than needed (31.7 h on a weekday). The most-recently-ready rule reaches the optimum exactly, and it reproduces the hand-built Golden Blocks to the hundredth of an hour.
- The extra hours have one cause: which ready vehicle is picked. A look-ahead algorithm is not needed for these projects.

Why the choice does not affect queue order in practice: when two vehicles are ready at the same node, their remaining work for the day can be swapped without changing any time. A swap does not change total hours. Hours change only when a vehicle is never needed again, so its Block ends instead of staying in rotation. The rule decides in advance which vehicle pulls in; it does not mean a vehicle jumps a queue at the curb. Breaks and Block limits make vehicles unequal, which is why the effect with breaks is checked below.

With the measured Jeffco break rule (50 minutes; first break 1 h after the first departure; only for blocks longer than 4.5 to 6 h), checked by trial on 2026-11-04 (blocks / revenue hours):

| Jeffco Blocking Scenario, day | Built by hand | Ready longest | Most recently ready |
|---|---|---|---|
| 2025 Baseline, Saturday and Sunday | 7 / 45.92 | 8 / 51.33 | 8 / 43.83 |
| 8am Start, Saturday and Sunday | 7 / 52.92 | 8 / 59.33 | 8 / 56.83 |
| Friday evening service, Weekday, 34 Trips (no built Blocks) | none | 7 / 25.67 | 8 / 24.33 |

With breaks the new rule uses fewer hours in every case. In one case (Friday evening, Weekday) it uses one more Block. Break placement, not vehicle choice, causes both rules to use one Block more than the hand-built Blocks. That is a separate problem (see Consequences).

The same trial showed a weakness in item 11 that the new rule exposes. "Read rules from built blocks" takes the break length as the shortest of the longest gaps across all Blocks. One short Block with only a turn layover then hides the break: the synthetic reference project built with the new rule produced a 70-minute Block, and the measurement found no break.

## Decision

1. **Vehicle choice (replaces the second and third bullets of Decision 0055 item 4).** For each Trip, among the open Blocks that fit the Block limits:
   1. If any Block is at the Trip's first node and has waited its required layover by the Trip's departure (a **direct** candidate), the Trip goes to the direct candidate with the **latest** ready time.
   2. Otherwise, if any Block can reach the Trip's first node through a deadhead connection and wait its required layover in time (a **deadhead** candidate), the Trip goes to the deadhead candidate with the latest effective ready time (ready time plus the connection's minutes).
   3. Ties go to the earlier-created Block.
   4. Otherwise a new Block starts (unchanged).
2. **Direct before deadhead.** A direct candidate always wins over a deadhead candidate, not only on an equal ready time. This removes the case where a vehicle deadheads away from a node that needs it, while a ready vehicle waits at the Trip's node.
3. **Everything else in Decision 0055 item 4 is unchanged:** Trips in order of first departure, then Trip ID; each Route and service day chained separately; deterministic; a heuristic that is not guaranteed to use the fewest vehicles.
4. **Reading the break from built blocks (amends item 11).** Only Blocks whose longest gap is longer than the largest measured minimum layover plus 5 minutes count as Blocks with a break. The break length is the shortest of those gaps, rounded down to 5 minutes. Blocks with no such gap do not hide the break. The other measured break fields keep their current definitions, computed over the Blocks that count.
5. **No option.** The new rule replaces the old one. The dialog does not offer a choice of rule.
6. **No data change.** `autoBlocking` records and backup schema 8 are unchanged. Existing automatically built Blocking Scenarios keep their Blocks. "Build again…" on one of them uses the new rule, so its result can differ from the stored Blocks.
7. **Dialog text.** The dialog's intro sentence changes from "Each departure takes the vehicle that has waited longest past its minimum layover" to "Each departure takes the vehicle that became ready most recently after its minimum layover, so spare vehicles finish early".

## Consequences

- Automatic Blocks have fewer revenue hours where service has a peak, at the same vehicle count. On Golden they match the hand-built Blocks.
- Waiting gathers on a few vehicles instead of being spread over all of them. More Blocks are short, which is what spare peak vehicles look like in hand-built schedules.
- With a break rule, the new rule can need one more Block than the old rule (one case of the six checked). Break placement remains the largest error against hand-built Blocks on Jeffco. A later decision may change break placement, for example by deferring a break that would force a new Block.
- A spare vehicle that is needed again later (for example at a PM peak) keeps one long midday layover in its Block. Ending a Block when it is idle longer than a set time is out of scope here.
- The reference script `docs/implementation/automatic-blocking/synthetic-check.py` and the tests that reproduce it get new expected numbers.

## Rejected alternatives

### Keep "ready longest"

Rejected. It uses about 10% more hours than necessary on Golden and does not match the hand-built Blocks there.

### A user-selectable rule

Rejected. It adds a setting that most users cannot judge. The Golden evidence favours one rule.

### Look-ahead (rollout) or exact optimisation

Deferred. Without breaks the new rule already reaches the exact optimum on both projects. The remaining error comes from break placement. Look-ahead is reconsidered only if a project with deadheads or Block limits shows a gap.

### Counting a natural long wait as the break

Tried on 2026-11-04 (a wait at a Break-here node at least as long as the break counts as the break). It made no difference on Jeffco, so it is not adopted.
