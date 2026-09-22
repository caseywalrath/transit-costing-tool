# Schedule Development Roadmap: Trips and Blocking

## Status

Superseded in part by the approved Phase 2R Trips workflow revision. The Phase 2R replacement workflow, safe route-editing package, and Phase 2TP Trip profiles are implemented and user-accepted. Phase 3 service-day workflows are implemented and accepted through Package 3C; see `phase-03-closeout.md`. Phase 3R is implemented and accepted through Package 3R-C; see `phase-03r-closeout.md`. Phase 4 planning is revised and approved under Decisions 0019 through 0023; Packages 4A through 4C are implemented and Package 4D remains the user-verification gate. See `phase-02r-trips-workflow-revision.md`, `phase-02tp-trip-profiles.md`, `phase-03-service-day-workflows.md`, and `phase-04-manual-blocking.md`.

## Objective

Extend the accepted route-definition foundation into a usable scheduling workflow that can:

1. define pattern-specific runtimes by service day and departure-time band;
2. generate and store authoritative trips from transient headway instructions;
3. edit and copy service-day schedules without losing provenance;
4. assemble trips into vehicle blocks with explicit non-revenue activities;
5. identify conflicts and derive daily block summaries.

The work fills the Trips and Blocking tabs. Costing remains a later phase, but the service quantities needed by costing must be derived and tested during blocking.

## Plan set

| Phase | Plan | Primary outcome |
| --- | --- | --- |
| 2 | `phase-02-runtime-trip-generation.md` | Runtime profiles, generation sets, materialized trips, shifts, and regeneration preview |
| 2R | `phase-02r-trips-workflow-revision.md` | Directions, authoritative trips, additive generation, direct trip entry, and directional timetables |
| 2TP | `phase-02tp-trip-profiles.md` | Independent scenario-wide timetable alternatives and blocking source boundary |
| 3 | `phase-03-service-day-workflows.md` | Copy-between-day and batch editing workflows |
| 3R | `phase-03r-unified-action-layers.md` | Unified Runtime/Trip header actions and staged Shift drawer |
| 4 | `phase-04-manual-blocking.md` | Manual block activities, conflicts, deadhead, pull-in/out, and summaries |

These plans form one scheduling-development sequence. Each phase contains smaller work packages and a user verification gate. No package automatically starts the next package.

## Confirmed constraints carried forward

- Service times and durations are integer seconds; the interface uses the shared 24-plus formatter and parser.
- The departure time of each individual trip selects one runtime band for that complete trip.
- Runtime profiles are pattern-specific in the initial build.
- Trips and scheduled points are authoritative; generation requests are transient.
- Generation adds trips without replacing existing service.
- Runtime changes do not alter existing trips until explicit recalculation.
- Scenario-wide Trip profiles own timetable alternatives across all Routes and service days while remaining independent of Runtime profiles.
- Recalculation retains stable trip IDs and therefore retains block references.
- User-defined directions provide ordered timetable columns shared by multiple patterns.
- Blocking Scenarios are named all-service-day arrangements with one immutable source Trip Profile. Blocks belong to one Blocking Scenario and service day and remain ordered activity lists rather than a block-number field on each Trip.
- Layover is derived. No minimum layover rule is included in the first blocking build.
- Pull-out, pull-in, and deadhead values are entered manually in the first build.
- Revenue hours and platform hours are primary summaries. Miles are derived where route data is complete.
- Tables remain compact and reuse accepted Route-tab conventions where applicable. Terra owns new layout and interaction decisions.

## Recommended screen scope

### Trips tab

Use one selected service day and direction at a time.

- The page is organized as Service, Runtimes, and Trips.
- The runtime editor uses one selected pattern at a time.
- Build Trips is the user-facing transient additive action using Pattern, First Trip, Headway, and Last Trip.
- Add Trip creates a draft row requiring one pattern and first time.
- The directional schedule shows all trips for the selected day and direction so alternating or staggered patterns can be reviewed together.
- The schedule uses Pattern as its leftmost visible column and shows direction timepoints across the row.
- Side-by-side inbound/outbound tables are deferred until the single-day combined schedule has been tested.

### Blocking tab

Use one selected Trip Profile, Blocking Scenario, Route candidate filter, and service day at a time. A Blocking Scenario selects one immutable Trip Profile and spans all service days.

- Show a compact unassigned-Trip list filtered to the selected Route.
- Show one selected block as an ordered activity table.
- Allow direct manual assignment and reassignment.
- Display compatibility status without automatically creating blocks.
- Display a block summary table for all blocks on the selected day.
- Keep imported multi-route Block contents fully visible while preventing new cross-route assignments in Phase 4.

Terra may refine these recommendations during the relevant UI package without changing domain behavior.

## Cross-phase data and transaction requirements

Phase 2R must replace the project backup graph with directions, direction columns, runtime profiles, assignments, authoritative trips, and any existing blocks. Generation requests are not backed up because they are not saved records. Later phases must keep the revised graph complete.

The following operations require one repository transaction:

- additive insertion of one generated trip group;
- confirmed recalculation of selected trips when manual changes or block references are affected;
- replacement of a target service-day schedule;
- block assignment or reassignment when two blocks are affected;
- Blocking Scenario duplication or deletion with all owned Blocks;
- complete project import or replacement;
- scenario duplication with all schedule, Blocking Scenario, and Block records.

Derived layovers, summaries, and validation findings are not persisted.

## Deletion and archiving rule

Every future user-defined record type must define both deletion and archiving behavior before its editing interface is accepted.

- A deletion command must identify dependent records, show its effect before confirmation, and update every affected record in one transaction.
- A command must block deletion when preserving references is required and no safe reassignment or cascade rule exists.
- Archiving is a future lifecycle state, not a substitute for an undefined deletion rule. An archive design must define whether archived records remain in calculations, schedules, exports, selectors, and backups.
- Trips are deleted with their revenue-trip activities removed from affected blocks. Empty blocks remain for user review.
- A direction cannot be deleted while patterns use it. Reassign or delete those patterns first.
- Deleting a pattern removes its runtime profiles, runtime assignments, saved trips, historical generation records, and linked revenue-trip block activities after explicit confirmation.
- A runtime profile can be deleted only after all assignments are reassigned and no saved trip retains it as its calculation source. This preserves the auditability of already calculated trip times.

## Decisions to verify during implementation

The following recommendations are included in the plans but should be reviewed at their stated gates:

1. Last Trip is the last allowed first-trip time and is inclusive when it falls on the headway sequence.
2. Runtime bands may contain gaps, but every generated departure must resolve to exactly one band.
3. A manual shift moves every scheduled point on the trip by the same duration and is recorded explicitly.
4. A pattern change preserves the first time and recalculates all scheduled points from the target pattern and applicable runtime profile.
5. Runtime and Trip copying are separate, target-first operations. Runtime copy covers all usable Patterns on the selected Route and defaults to independent profiles. Trip copy covers both Directions for one Route and Trip profile, replaces target Trips, and does not copy Blocks. See Decision 0017.
6. Batch shifting does not create or change generation instructions because no generation instructions are retained.
7. Initial compatibility suggestions classify possible next trips; they do not assign or reorder trips automatically.

Material changes to these rules require a decision record before implementation continues.

## User waypoints

The sequence contains these mandatory pauses:

1. verify Phase 2R direction and runtime foundations after Package 2R-B;
2. verify authoritative trip commands and persistence after Package 2R-C;
3. complete hands-on Route and Trips review after Package 2R-D;
4. accept Phase 2R before rewriting service-day workflows;
5. accept the revised Phase 3 before manual blocking;
6. verify Blocking Scenario ownership, Block calculations, migration, and persistence before blocking UI;
7. complete hands-on blocking review before Phase 4 closeout.

At each waypoint, report completed files, checks, deviations, unresolved decisions, and the recommended next package and model.

## Reference workbook use

Use `Federal Blvd Service Plan 11-20-2024.xlsx` to select representative patterns, runtime bands, headways, staggered departures, and manual block connections. It is evidence for user verification, not a required screen layout or formula specification.
