# Decision 0055: Automatic Blocking

- Status: Accepted (user decisions of 2026-11-03); not implemented
- Date: 2026-11-03
- Extends: Decision 0019 (Blocking Scenarios), Decision 0050 (minimum layover by direction), Decision 0051 (estimated cost basis)
- Plan: `docs/implementation/automatic-blocking.md`
- Design reference: `docs/implementation/automatic-blocking/` (mock-ups, screenshots, reference check script)

## Context

Blocks are built by hand on the Blocking tab. Costing an alternative Scenario then needs either hand-built blocks (slow, guess-and-check to imitate the baseline's layover pattern) or the estimated cost basis (Decision 0051). The estimated basis applies one layover percentage to running time. That percentage cannot show the step changes in vehicles that real blocking produces. For example, a 4-minute extension may fit inside existing layover or may need another vehicle.

Analysis of the Jeffco Westracks project (2025 Baseline, 7 built blocks) showed that its layover has two parts:
- turn recovery: a 20-minute minimum after each inbound trip and none after outbound trips;
- one long layover per block, which looks like a meal or relief break.

A simple chaining rule with those two inputs reproduced the built blocks within 1.6% of revenue hours: 7 blocks, 46.67 h a day against 45.92 h. A second scenario that was not used to set the rules (8am Start) matched within 1.4%.

The user first reviewed this as a separate "chained" cost basis on the Costing tab, then chose to put it on the Blocking tab as a generator of ordinary Blocking Scenarios.

## Decision

1. **Where.** The Blocking tab's scope-bar Actions menu gets "Build blocks automatically…" in the Blocking scenario group, after "New blocking scenario…". It opens a dialog. The dialog always creates a **new** Blocking Scenario on the selected Trip Profile. It never changes an existing one.
2. **Ordinary result.** The generated Blocks are ordinary `BlockingBlock` records with pull-out, revenue-trip, deadhead and pull-in activities. They can be edited, renamed and deleted like hand-built blocks. Costing is unchanged: the new Blocking Scenario appears in the Cost basis list under Blocked hours. No new cost basis is added, and the costing assumptions are not changed.
3. **Scope.**
   - **Days:** the service days ticked in the dialog. Days without Trips in the Trip Profile are disabled.
   - **Routes:** every Route of the Trip Profile, each chained separately. A Block never holds Trips of two Routes. Nodes belong to a Route, so a cross-Route connection would be interlining, which is out of scope.
   - **Days are independent:** Blocks never cross service days.
4. **Chaining rule.**
   - **Order:** Trips of one Route and day are taken in order of first departure, then Trip ID.
   - **Which vehicle takes a Trip:** the open Block that has been ready longest at the Trip's first node. "Ready" means it arrived and has waited its required layover.
   - **Deadhead:** a vehicle at another node can also take the Trip through a deadhead connection, if it arrives at the Trip's first node, after the deadhead and the required layover, in time. When two vehicles are ready at the same time, a direct connection wins over a deadhead, then the earlier-created Block wins.
   - **New block:** if no vehicle can take the Trip, a new Block starts.
   - **Determinism:** the rule is deterministic. It is a heuristic and is not guaranteed to use the fewest vehicles.
5. **Rules per Pattern,** grouped by Route and then by direction group (Outbound, Inbound). One row per Pattern used by the Trip Profile, with:
   - **Minimum layover after a Trip on this Pattern:** none, whole minutes, or a percentage of that Trip's running time. This is the same rule shape as Decision 0050, applied per Pattern instead of per direction.
   - **Break here:** whether a break layover may be taken after a Trip on this Pattern.
   - **Block can start:** whether a Block may begin with a Trip on this Pattern, at the Pattern's first node.
   - **Block can end:** whether a Block may end after a Trip on this Pattern, at the Pattern's last node.
6. **Defaults (user decision 1).**
   - **Can start / can end:** "Block can start" is ticked when the Pattern's first node is of kind `terminal` or `garage`. "Block can end" is ticked when its last node is.
   - **Break here** defaults to the same value as "Block can end".
   - **Minimum layover** defaults to the Blocking tab's current minimum-layover preference for the Pattern's direction group (Decision 0050). With no preference, it defaults to none.
7. **One break rule (user decision 2).** All fields are optional; a blank break length means no breaks. The fields are:
   - break length in minutes, which includes the minimum layover;
   - only for blocks longer than (hours);
   - first break no earlier than (hours after the Block's first departure);
   - another break after (hours since the previous break ended), optional.

   How breaks are applied:
   - A break is taken at the first Break-here arrival that meets the timing.
   - "Only for blocks longer than" depends on a Block's final length, so it is enforced by rebuilding. Blocks that ended shorter than the minimum have their break suppressed and the day is rebuilt. This repeats until the result is stable, at most 5 passes.
   - Meal and relief rules properly belong to run cutting, which the app does not have. Putting breaks in the blocks is a stated approximation.
8. **Block limits.**
   - **Limits:** optional maximum running hours per Block and maximum revenue miles per Block. A vehicle cannot take a Trip that would put its Block over a limit.
   - **Revenue miles** is unavailable while any Pattern used by the Trip Profile has incomplete miles.
9. **Pull-out and pull-in (user decision 3: per terminal).**
   - **Garage:** an optional garage node (kind `garage`) of the Route. With none, blocks start and end at their terminal.
   - **Terminal rows:** one row for each node where some Pattern can start or end a Block, with:
     - pull-out minutes before the first Trip;
     - pull-in minutes after the last Trip;
     - miles each way (optional).
   - **What each Block gets:** a pull-out from the garage (or its first node) to its first node, and a pull-in from its last node to the garage (or with no destination).
10. **Deadhead connections.**
    - **Rules:** any number of "From node → To node, X minutes, optional miles, one way or both ways". Both nodes must belong to the same Route.
    - **Use:** a connection is used only when it lets a Block take a later Trip. It is written as an ordinary deadhead activity, whose duration is the connection's minutes.
11. **Read rules from built blocks.**
    - **Source:** the dialog can measure any Blocking Scenario with Blocks in the same Project, including one in another Scenario. This is a read-only prefill and nothing is stored as a link.
    - **What is measured:**
      - the shortest layover after each Pattern;
      - the longest layover in each Block and when it happens;
      - Block lengths;
      - which Patterns start and end Blocks.
    - **Matching to this Scenario's Patterns:** first by the same Route name and Pattern name (case-insensitive, trimmed), otherwise by the same direction group. Every row it would fill is listed, and "Use these rules" fills the fields as an unsaved draft.
12. **Preview and check.**
    - **Preview:** updates as the rules change. For each day it shows blocks, revenue hours, layover %, longest block, and the number of blocks with one break and with two or more, plus findings.
    - **Check:** when a source is chosen, the same rules are run on the source Blocking Scenario's Trips (with Patterns mapped back) and compared with its built Blocks.
13. **Findings.** Warnings in the preview; none block creation:
    - a Trip that had to start a Block on a Pattern that cannot start one;
    - a Block whose last Trip's Pattern cannot end one;
    - a Trip ending at a node where no later Trip of the Route departs and no deadhead connection leaves (a broken chain);
    - a limit tighter than a single Trip;
    - revenue miles unavailable.
14. **Stored record.** The new Blocking Scenario stores `autoBlocking`: the rules used, the time they were applied (`builtAt`), the number of Trips and Blocks at build time, and the source Blocking Scenario ID if one was measured. Any operation that re-stamps the Blocks' `updatedAt` without changing them (duplicate, Scenario copy, backup import) sets `builtAt` to the same time. This is the only schema change. It is an optional field on `BlockingScenario`, so the IndexedDB stores and indexes do not change and there is no database version bump. The backup schema goes from 7 to 8 so that the field is validated on import.
15. **Provenance note and building again.**
    - **Note:** a Blocking Scenario with `autoBlocking` shows a note on the Blocking tab with the rules, the build date, and whether any Block was edited since. A Block counts as edited when its `updatedAt` is later than `builtAt`, or when the Block count differs from the count at build time.
    - **"Build again…":** opens the dialog with those rules and creates another new Blocking Scenario. Replacing the Blocks in place is not provided in this decision.
16. **Copy, duplicate, import, export.**
    - **Scenario copy and backup import** remap the Pattern and Node IDs inside `autoBlocking` with the same maps used for Blocks. A reference that cannot be remapped drops that rule row.
    - **Duplicating a Blocking Scenario** keeps `autoBlocking`, because the copied Blocks are the same.
    - **CSV export** does not include the rules.

## Consequences

- Alternatives can be costed on vehicle-step behaviour without hand blocking. Results jump when a rule crosses a step; for example, a 40-minute break adds a vehicle to the baseline. That is intended.
- The heuristic can use one block more than a planner would. The blocks are editable, and the check against built blocks shows the gap.
- Breaks inside blocks are an approximation of run cutting.
- Backup files written after this change are version 8. Older app versions cannot import them. Version 1 to 7 files still import.
- The estimated cost basis (Decision 0051) stays as the quick, high-level option.

## Rejected alternatives

### A separate "chained" or "automatic" cost basis on the Costing tab

Rejected by the user. It duplicated blocking logic inside Costing and needed a break-allowance figure that cannot be calculated inside the app. It also added Costing panels that left white space, and its results could not be inspected or edited as blocks.

### A per-vehicle break allowance in hours

Rejected. The figure was revenue hours above the most efficient chaining. It mixed breaks with other slack, depended on the chosen minimum layover, and could not be derived from anything the user can see.

### Minimum layover per direction or per terminal

Rejected by the user in favour of per-Pattern rules, grouped by direction. That handles routes with several patterns per direction.

### Tiered break rules by block length

Deferred (user decision 2: one rule for now). One rule with a minimum block length and a repeat interval covers short blocks and blocks of 16 h or more. Tiers would be needed only for break lengths that differ.

### Replacing a Blocking Scenario's Blocks in place ("Rebuild")

Deferred. Building again into a new Blocking Scenario is non-destructive and needs no review token.
