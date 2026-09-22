# Phase 4 Implementation Plan: Manual Blocking

## Status

Revised for approved Phase 4 planning decisions on 2026-09-21. Phase 3 and Phase 3R are accepted. Trip-profile ownership is implemented. Decisions 0019 through 0023 define Blocking ownership, lifecycle, activity, validation, migration, export, and relative timing. Decision 0026 adds Trips-table unassignment and updates revenue-hour semantics.

Packages 4A through 4C are implemented in the current working tree. Package 4D primary-agent integration and the hands-on user-verification gate remain; do not begin the next phase automatically.

## Objective

Implement a manual blocking workflow using named Blocking Scenarios and ordered Block activities. Each Blocking Scenario selects one immutable Trip Profile and spans all service days. Users can create alternative blocking arrangements, assign and move revenue Trips, enter pull-out, pull-in, and deadhead activities, review connection feasibility, and derive complete or explicitly incomplete Block and service-day summaries.

## User outcome

At completion, a user can:

1. create an empty Blocking Scenario or duplicate an existing one;
2. select one Trip Profile, Blocking Scenario, Route, and service day as workspace context;
3. create, label, rename, annotate, and delete Blocks;
4. assign, move, unassign, remove, and reorder Trips without duplicating one Trip ID within a Blocking Scenario and day;
5. see raw gaps, deadhead requirements, usable layovers, and connection findings;
6. enter pull-out, pull-in, and connection-deadhead durations relative to their adjacent revenue Trips, Nodes, and optional miles; apply pull-outs or pull-ins to matching Blocks with an explicit preview and optional replacement of existing values;
7. retain structurally valid incomplete or infeasible work with visible findings;
8. review compatibility at a proposed chronological revenue-Trip insertion point without mutating Blocks;
9. view Block and selected-day revenue hours (running time plus layover), running time, platform hours, deadhead hours, layover hours, revenue miles, platform miles, and Block completeness status;
10. reload, duplicate, back up, restore, and export Blocking Scenarios without losing accepted relationships; and
11. select a Blocking Scenario in Trips and assign, move, or unassign one or more Trips from its Block column without duplicating Trip assignments.

## Fixed ownership and lifecycle

- `BlockingScenario` belongs to one Scenario and selects one immutable Trip Profile.
- One Blocking Scenario spans every service day; each Block belongs to one Blocking Scenario and one service day.
- A Scenario may contain zero Blocking Scenarios.
- Users may create an empty Blocking Scenario or duplicate an existing one.
- Blocking Scenario names are unique within the parent Scenario after trimming and case normalization.
- Duplicating a Blocking Scenario copies all days, Blocks, and activities with new Blocking Scenario, Block, and activity IDs while retaining the same Trip references.
- Deleting a Blocking Scenario deletes its Blocks after impact review and stale-source validation.
- Blocks store `blockingScenarioId`; they do not store a second authoritative Trip Profile reference.
- Copying a Trip Profile copies no Blocking Scenarios or Blocks.
- Deleting a Trip Profile deletes its Blocking Scenarios and Blocks in the same reviewed transaction.
- Project Scenario duplication copies and remaps the complete Blocking graph.
- Archiving is excluded until its behavior is separately decided.

## Fixed activity and assignment rules

- Blocks are ordered activity lists with stable activity IDs and normalized sequences.
- Empty Blocks are valid.
- A Block has at most one pull-out, which is first, and at most one pull-in, which is last.
- At most one deadhead may appear between consecutive revenue Trips.
- New and edited pull-out and pull-in activities store whole-minute offsets from the first and last revenue Trips. New and edited deadheads store a whole-minute duration from their preceding revenue Trip; the remaining connection time is derived layover. Legacy explicit boundary and deadhead times remain readable. Pull-out, pull-in, and deadhead add optional miles.
- The same Trip ID may appear only once across all Blocks in one Blocking Scenario and service day.
- Different Trip IDs with identical schedules remain distinct and assignable.
- The same Trip may have a different assignment in another Blocking Scenario.
- Reassignment is one atomic move between Blocks and insertion positions.
- Structural corruption rejects a write. Operational infeasibility remains saved and visible as derived findings.

## Fixed calculations

- Revenue Trip start and end come from its first and last scheduled points.
- Raw connection gap equals next revenue Trip start minus previous revenue Trip end.
- When terminal Nodes match and no deadhead exists, usable layover equals the raw connection gap.
- When terminal Nodes differ, the connection is incomplete without a deadhead.
- With a deadhead, usable layover equals raw connection gap minus its resolved duration, subject to connection placement and Node-continuity validation.
- Running time equals the sum of revenue-trip durations.
- Revenue hours equal running time plus known usable layover between revenue Trips.
- Deadhead hours equal the sum of pull-out, pull-in, and manual between-Trip deadhead durations.
- Layover hours equal the sum of non-negative valid usable layovers between revenue movements.
- Platform hours equal resolved pull-out start through resolved pull-in end and are incomplete without valid boundary activities and adjacent revenue Trips.
- Revenue miles equal the sum of complete revenue Pattern distances.
- Platform miles equal revenue, pull-out, deadhead, and pull-in miles and are incomplete when any required distance is missing.
- Selected-day totals report a known valid subtotal; Block-level status and findings identify incomplete or infeasible work.
- No minimum-layover policy is included.

## Fixed UI and Route scope

- The initial Blocking UI uses the selected Route to filter assignable and unassigned Trips.
- Phase 4 does not intentionally create multi-route Blocks.
- A Trip from another Route cannot be added to a non-empty Block.
- Existing or imported multi-route Blocks remain completely visible; Route filtering cannot truncate Block activities.
- The data model remains scenario-wide and does not add Route ownership to Blocks.
- The Trips workspace adds a Blocking Scenario selector filtered to its selected Trip Profile. Its Block pill and `Assign Block…` action write only to Blocks in that selected context.
- Blocking Scenario selection is a non-authoritative UI preference and must follow accepted Phase 3R menu, focus, responsive, and discard-guard conventions.

## Included scope

- Blocking Scenario create, rename, duplicate, select, and delete workflows;
- ordered pull-out, revenue-trip, deadhead, and pull-in activities;
- Block create, label, notes, delete, assignment, reassignment, removal, and ordering;
- structured validation, completeness, compatibility, and summary results;
- revalidation after stable Trip changes;
- cleanup after Trip, Pattern, Route, Node, service-day schedule, and Trip Profile changes;
- IndexedDB migration and transactional repositories;
- complete JSON backup and restore;
- Project Scenario and Blocking Scenario duplication;
- Blocking Scenario, Block, activity, and summary CSV exports;
- accessible Blocking and Trips context interfaces.

## Excluded scope

- automatic Block building or optimization;
- minimum-layover policies;
- automatic garage-time or deadhead matrices;
- intentional multi-route assignment and interlining assistance;
- shared cross-route Node identity;
- crew scheduling;
- peak vehicles, spares, and costing implementation;
- Blocking Scenario archiving;
- CSV import.

## Work-package sequence

```text
4A Blocking domain, application contracts, validation, compatibility, and summaries — Luna
  -> structural calculation and user-verification gate
4B Lifecycle integration, persistence, migration, backup, duplication, and CSV — Luna
  -> data-integrity and user-verification gate
  -> mandatory stop before model shift
4C Blocking and Trips-context UI/UX — Terra
  -> hands-on accessibility and visual-verification gate
  -> mandatory stop before model shift
4D Primary-agent integration and Phase 4 acceptance
```

## Package 4A: Domain and application contracts

### Recommended model

Luna.

### File ownership

- Blocking Scenario and Block domain modules and tests;
- activity normalization, validation, compatibility, and summary modules;
- application ports and behavior-oriented request/result types;
- structural documentation only when an approved contract requires correction.

Package 4A must not modify React layout, CSS, focus behavior, responsive behavior, or planner-facing interaction design.

### Deliverables

- Add `BlockingScenario` and normalized Block ownership types.
- Make normalized Trip and Blocking ownership required inside current domain commands while retaining legacy handling at import and migration boundaries.
- Define pure Blocking Scenario create, rename, duplication, deletion-impact, and stale-signature calculations.
- Normalize activity order while retaining stable activity IDs.
- Enforce activity cardinality and placement rules.
- Enforce Blocking Scenario, Trip Profile, service-day, and Route-assignment boundaries.
- Detect duplicate Trip assignment across the complete Blocking Scenario/day.
- Define atomic assignment and reassignment command contracts.
- Derive activity timing, raw gaps, layovers, summaries, completeness, and validity.
- Return structured findings for overlap, negative connection time, location discontinuity, missing or non-fitting deadhead, missing boundaries, incomplete miles, and missing references.
- Classify candidate Trips at the implicit appended revenue position by evaluating predecessor and successor connections.
- Define UI-facing queries without embedding visual layout decisions.

### Required tests

- Blocking Scenario naming, ownership, and immutable Trip Profile source;
- empty and populated Blocking Scenario duplication across all service days;
- activity normalization and stable IDs;
- pull-out/pull-in cardinality and position;
- matching-terminal layover;
- different-terminal incomplete connection;
- fitting, misplaced, and non-fitting deadhead;
- overlap and extended times above 24:00;
- duplicate Trip prevention across Blocks;
- identical schedules with distinct Trip IDs;
- atomic reassignment request behavior;
- revenue, platform, deadhead, and layover hours;
- complete and incomplete revenue/platform miles;
- known subtotal and invalid/incomplete counts;
- two-sided insertion compatibility;
- 100 Blocks and 500 Trips for one service day.

### Gate

Run focused domain and application-contract tests plus TypeScript typechecking. Present worked timelines covering same-terminal service, manual deadhead, overlap, after-midnight service, incomplete platform data, and insertion between two Trips. Confirm results with the user before Package 4B.

## Package 4B: Lifecycle integration, persistence, migration, backup, duplication, and CSV

Package 4B is implemented in the current working tree. Its data-integrity gate was completed through explicit user approval before Package 4C began.

### Recommended model

Luna.

### File ownership

- Blocking application services and repository implementations;
- integration with Trip, Trip Profile, Route, Pattern, Node, and service-day commands;
- Dexie schema and migration;
- JSON backup, restore, import-as-copy, and duplication;
- Blocking CSV serializers;
- deterministic application, repository, migration, backup, and CSV tests.

No page layout, CSS, interaction, accessibility, or visual-design decisions.

### Deliverables

- Add narrow Blocking Scenario and Block repository methods.
- Create, rename, duplicate, and delete Blocking Scenarios atomically where required.
- Save assignment, reassignment, removal, activity editing, and ordering through explicit transactions.
- Recheck stale signatures and complete-scope duplicate rules immediately before writes.
- Add the next Dexie version with a `blockingScenarios` table and `blockingScenarioId` Block indexes. **Implemented in database version 4.**
- Discard existing pre-Phase-4 placeholder Blocks during migration as approved by Decision 0019; retain all Trips and Trip Profiles.
- Increment the JSON backup schema and keep versions 1 through 4 readable under the approved placeholder-Block discard rule. **Implemented as export schema version 5.**
- Remap Blocking Scenario, Block, activity, Trip, and non-revenue Node references during Project Scenario duplication and import-as-copy.
- Duplicate a Blocking Scenario across all days with new structural IDs and retained Trip references.
- Delete a Trip Profile with all of its Blocking Scenarios and Blocks.
- Revalidate Blocks after stable Trip shift, recalculation, or Pattern change without changing their references.
- Remove affected revenue activities after Trip deletion, service-day replacement, Pattern reset, or Route deletion while retaining Blocks.
- Include non-revenue activity impacts in Node and Route deletion previews; remove reviewed affected activities while retaining Blocks.
- Export Blocking Scenario, Block, activity, and derived summary CSV files with stable columns and completeness fields. The UI packages multi-file CSV exports into one ZIP download so desktop file associations cannot open multiple spreadsheet windows from one click.
- Keep visible local-save status behavior intact.

### Required verification

- repository and transaction tests;
- duplicate-assignment race and stale-preview rejection;
- forced rollback for create, duplicate, delete, assignment, and reassignment;
- Dexie migration tests with zero and populated placeholder Blocks;
- proof that placeholder-Block removal does not remove Trips or Trip Profiles;
- backup versions 1 through current and complete current-version round trip;
- import-as-copy and Project Scenario duplication reference remapping;
- Blocking Scenario duplication across all days;
- Trip Profile copy and deletion behavior;
- Trip, service-day, Pattern, Route, and Node cleanup behavior;
- CSV headers, escaping, ordering, summaries, and incomplete values;
- TypeScript typechecking, complete Vitest suite, and production build.

### Gate

Report changed files, migration behavior, transaction boundaries, rollback evidence, backup/duplication results, and CSV samples. Stop and recommend Terra for Package 4C. Do not begin UI work without explicit user approval.

## Package 4C: Blocking and Trips-context UI/UX

Package 4C is implemented in the current working tree. It adds the Blocking workspace, context-scoped Trips Block labels, keyboard-operable table actions, explicit lifecycle dialogs, narrow-layout table overflow, header-level Unassigned Trip filters and sorting, chronological assignment insertion, compatibility filtering, problem treatment, and relative boundary-time entry. The user has since approved direct single-Trip and multi-Trip assignment from the Trips table; Package 4D must validate this integration and obtain the required hands-on user review.

### Required model

Terra.

### File ownership

- Blocking workspace React components and UI-only state;
- Trips Blocking Scenario selector, editable Block pills, and multi-select assignment action;
- shared UI primitives where justified;
- stylesheet changes;
- Playwright fixtures and UI tests;
- reusable UI-convention documentation.

Terra must consume Package 4A and 4B contracts and must not recreate authoritative validation, compatibility, summary, ownership, or duplicate-assignment logic in React.

### Required interface behavior

- Enable Blocking for a selected Trip Profile, Blocking Scenario, Route, and service day.
- Provide empty-create, duplicate, rename, and delete workflows with explicit scope and consequences.
- Select one service day at a time while retaining a Blocking Scenario that spans all days.
- Show compact unassigned Trips with Route, Pattern, start/end Nodes, start/end times, header-level filtering and sorting, and compatibility at the proposed chronological insertion position. New assignments insert before the first later-starting displayed Trip; equal From Times retain their existing order. Explicit arrow-based reordering remains preserved.
- Show a selected Block as a complete ordered activity table even when it contains imported activities from another Route.
- Create, rename, annotate, and delete Blocks.
- Assign, atomically reassign, remove, and reorder revenue Trips.
- Add and edit pull-out, pull-in, and connection-deadhead relative durations. Pull-out To and pull-in From default to the selected Block's first and last Trip Nodes, but users may choose any Node. Bulk review always includes the selected Block when it has Trips and includes other Blocks whose first or last Trip Node matches the chosen Node across all Routes in the current Blocking Scenario and day; show add, replace, keep, and skip counts before one atomic save, preserving other Block-specific overrides by default.
- Show raw gap, deadhead duration, usable layover, validity, and completeness at the relevant connection.
- Keep findings visible through text and accessible status, not color alone.
- Show Block-level status and findings plus a known valid selected-day subtotal; do not repeat aggregate complete/incomplete counts as summary tiles.
- Make every Blocks table column sortable; only the Block name opens it in Current Block. Place a known-subtotal table below Blocks with Revenue, Platform, Layover, Layover %, and Deadhead totals, and use a blue selected-item highlight in the Current Block menu.
- Add a Blocking Scenario selector to Trips, filtered to the selected Trip Profile. Its Block pill opens same-scenario/day Block choices and requires confirmation before assigning, moving, or unassigning one Trip. The Trips Actions menu provides `Assign Block…` and `Unassign from Block…` for selected Trips, including Trips currently in different Blocks or unassigned. Bulk assignment and unassignment are atomic; adjacent deadheads removed from source Blocks are disclosed in confirmation, while pull-outs and pull-ins remain. The Block label reflects only the selected Blocking Scenario.
- Treat the selected Route as the candidate filter without hiding complete Block contents.

### Interaction and accessibility requirements

- Drag-and-drop may be provided but cannot be the only assignment or ordering method.
- Keyboard users must be able to assign, reassign, remove, reorder, edit, confirm, cancel, and return focus predictably.
- Selection-dependent actions remain visible when disabled and expose a concise explanation.
- Dialogs identify Blocking Scenario, day, source and destination Blocks, and destructive consequences.
- Findings provide a keyboard-operable path to the responsible activity.
- Dense tables use the accepted `data-grid` frame, horizontal overflow, stable identifying columns, compact control sizes, and text status.
- Menus and selectors follow Phase 3R keyboard, focus-return, checked-item, separator, dismissal, and responsive conventions.
- Narrow layouts cannot overlap or truncate the active editor. Multi-route imported activities remain visible.
- Status changes and validation results are announced without excessive repetition.

### Gate

The user manually builds representative Federal Boulevard Blocks including empty-create, duplication, same-terminal connection, manual deadhead, atomic reassignment, overlap, after-midnight service, pull-out and pull-in relative offsets, dynamic boundary updates after a Trip change, incomplete miles, and Trips Block-column context. Run TypeScript typechecking, complete Vitest and Playwright suites, production build, reload, keyboard review, accessibility review, and desktop/narrow visual inspection.

## Package 4D: Integration and Phase 4 acceptance

### Responsibility

Primary agent. Do not delegate automatically.

### Ordered review

1. Confirm the ownership chain has one authority and no Block-level Trip Profile duplication.
2. Confirm every lifecycle and destructive command reports and applies complete impacts.
3. Confirm stable Trip edits retain references and destructive schedule changes leave no dangling Trip or Node references.
4. Confirm React owns only presentation, selection, and draft interaction state.
5. Confirm Trips and Blocking contexts remain correctly filtered and do not change accepted Runtime or Trip command scope.
6. Confirm backup, migration, duplication, CSV, reload, capacity, accessibility, and visual evidence.
7. Update architecture, schema, glossary, UI conventions, roadmap, and status documentation.
8. Record Phase 4 closeout and stop before Costing.

### Acceptance criteria

- Every Blocking Scenario belongs to one Scenario and one immutable Trip Profile and spans all service days.
- Every Block belongs to one Blocking Scenario and one service day.
- A Trip cannot be duplicated within a Blocking Scenario/day but may be arranged differently in another Blocking Scenario.
- Reassignment writes both affected Blocks atomically.
- Blocks persist ordered activities rather than copied Trip data or summary totals.
- Structural corruption is rejected; operational infeasibility remains visible and reviewable.
- Every displayed gap, layover, compatibility result, hour, mile, subtotal, and completeness status is derived from authoritative records. Revenue hours equal running time plus layover; Running Time remains separately available.
- Platform hours and miles are never presented as complete without required inputs.
- Route filtering does not truncate selected Block contents or create unintended multi-route assignments.
- The Trips Block column is explicitly scoped by a Blocking Scenario selector. Pill and bulk Actions assignments or unassignments cannot cross service-day or Trip Profile scope; multi-select operations are atomic and duplicate-safe.
- Trip, Trip Profile, Route, Pattern, Node, and service-day changes follow the approved cleanup and revalidation rules.
- Dexie migration applies the documented placeholder-Block discard and preserves all non-Block schedule records.
- JSON backup, restore, import-as-copy, Project Scenario duplication, Blocking Scenario duplication, and CSV pass complete reference checks.
- The Blocking and Trips interfaces contain no authoritative validation, ownership, compatibility, or summary calculations.
- Automated tests, production build, reload, capacity checks, keyboard review, accessibility review, and visual inspection pass.

Record a Phase 4 closeout. Present Costing as a separate user-approved phase; do not start it.
