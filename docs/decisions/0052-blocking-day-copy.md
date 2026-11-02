# Decision 0052: Copy Blocks from Another Service Day

- Status: Accepted (user decisions of 2026-11-02); implemented, awaiting user acceptance
- Date: 2026-11-02
- Extends: Decision 0017 (service-day copy workflows), which copied Runtimes and Trips but not Blocks

## Context

Decision 0017 lets the planner copy Runtime assignments and Trips from one service day to another. A Blocking Scenario covers every service day of its Scenario (Decision 0019 item 2), but each day's Blocks must be built by hand. Planners who block Saturday after Weekday usually start from the same arrangement.

A Block names its Trips by Trip ID. Trip IDs belong to one service day, Trip copy allocates new IDs (Decision 0017 item 7), and a copied Trip keeps no link to its source. So a Block cannot be copied by reusing its Trip IDs. Each source-day Trip has to be paired with a target-day Trip. The two days' timetables may be identical (Trips copied, then Blocks copied), slightly different, or very different, and the planner may not know which.

## Decision

1. **Command.** "Copy blocks from day" copies the Blocks of one Blocking Scenario on a source service day into the same Blocking Scenario on the target service day. The target is the selected Day (target-first, as Decision 0017 item 2). Copying into another Blocking Scenario or another Trip Profile is not supported (Decision 0019 item 7).
2. **Scope.** The whole service day of the Blocking Scenario, all Routes. The preview reports each Route separately.
3. **Replace.** The copy replaces every target-day Block of the Blocking Scenario. Blocks of other days and other Blocking Scenarios are not touched. There is no merge.
4. **Trip matching is derived from content.** No lineage field is stored, and the schema does not change. Only Trips of the Blocking Scenario's Trip Profile and Scenario take part. Matching runs per Route and Pattern in two tiers:
   - Tier 1, **exact**: same Route, same Pattern, same stop times (every pattern point and time).
   - Tier 2, **same first departure**: among the Trips left after tier 1, same Route, same Pattern, same first-point time. The other times differ. The match is reported as "times differ".
   - Within a tier, Trips with the same key are paired one-to-one in a fixed order. When a key has more than one Trip on either side, the pairing is reported as ambiguous. Duplicate Trips are allowed (Decision 0017), so this can happen.
   - A Trip that matches in neither tier is unmatched.
5. **Match rate and gates.** The match rate is the number of matched (tier 1 or tier 2) source Trips that the source Blocks hold, divided by the number of source Trips those Blocks hold.
   - Below 50%: the copy is refused. Exactly 50% is allowed.
   - Between 50% and 100%, or any tier-2 or ambiguous match: the copy needs an explicit acknowledgment in the review.
   - 100% exact, with no ambiguous match: normal confirmation.
   - Source Blocks that hold no Trips: no rate and no gate.
6. **Empty source.** A source day with no Blocks in the Blocking Scenario is an explicit clear-target operation. It needs a destructive-impact review (Decision 0017 item 9).
7. **Unmatched source Trips** are removed from the copied Block, with the deadheads next to them. This is the same rule as removing a Trip from a Block (`removeSelectedTripsFromBlock`). They are never kept as dangling references, because a missing Trip is a structural error that excludes the Block from Costing.
8. **Blocks left without Trips are kept.** They keep their label, notes, and remaining boundary activities, so the planner's block numbering survives.
9. **Copied content.** Each copied Block and activity gets a new ID and the target service day. Labels, notes, Nodes, miles, and pull-out, pull-in, and deadhead timing are copied unchanged. Relative timing (Decisions 0022, 0023) follows the matched Trips. Absolute times are kept as entered, and validation flags them if they no longer fit.
10. **Target Trips that no Block holds after the copy** stay unassigned. They appear in Unassigned trips.
11. **Review.** The preview validates every proposed Block with the existing Blocking rules (`validateBlockingBlock`, which does not apply the minimum-layover preference) and reports the findings. It also reports per-Route match counts, the removed Trips and deadheads, the Blocks left without Trips, the target Blocks replaced, and the unassigned target Trips.
12. **Stale protection and transaction.** The review token covers the request, both days' Blocks, and both days' in-scope Trips. Applying the copy previews again and refuses if the token changed (Decision 0036). The write replaces the target-day Blocks in one transaction, which checks the Blocking Scenario signature again. There is no undo.
13. **Trip copy is unchanged.** Copying Trips still removes the revenue activities of replaced target Trips (Decision 0017 item 8). Copying Trips first and Blocks second gives a 100% exact match.

## Consequences

- No database, backup, or CSV schema change. Copying a Scenario or importing a backup is unaffected.
- A copy between very different timetables is stopped (below 50%) or must be acknowledged with its counts in view.
- Tier-2 matches can leave layover, deadhead, and boundary timing that validation flags. The review shows these findings before the write.
- Ambiguous pairing among identical Trips is arbitrary but has no effect, because the paired Trips have the same times. Among tier-2 candidates with the same first departure it may pair the "wrong" Trip. The review reports it.
- A pull-out or pull-in whose first or last Trip was removed now attaches to another Trip, and its Node may no longer match. Validation reports it.
- Undo is not provided. The destructive review is the safeguard, as for Trip copy.

## Rejected alternatives

### Require identical Trip tables

Rejected. Weekday and Saturday tables rarely match exactly, and requiring identity would block the most common use.

### Copy Trip IDs and let validation report the gaps

Rejected. Every Block would fail with `block.missingTrip`, drop out of Costing, and give no explanation of the cause.

### Store a source-Trip link on copied Trips

Rejected for now. It needs a schema change, does not cover Trips that were built separately on each day, and becomes misleading once the copied Trip is edited.
