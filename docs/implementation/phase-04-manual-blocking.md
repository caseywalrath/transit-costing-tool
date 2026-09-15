# Phase 4 Implementation Plan: Manual Blocking

## Status

Drafted for sequencing only. It must be revised after Phase 2TP defines Trip-profile ownership. Do not begin until Phase 3 is accepted and the user approves Package 4A.

## Objective

Implement a manual blocking workflow using ordered block activities. Each named Blocking scenario selects exactly one Trip profile. Users can assign revenue trips from that timetable, enter pull-out, pull-in, and deadhead activities, review connection feasibility, and derive block and route summaries for one service day.

## User outcome

At completion, a user can:

1. select one service day;
2. create and label blocks;
3. assign, move, and remove trips without duplicating a trip across blocks;
4. see calculated gaps and layovers between consecutive trips;
5. enter a deadhead when consecutive trip locations differ;
6. enter pull-out and pull-in activity times and locations;
7. see overlap, negative-layover, discontinuity, and missing-platform-data findings;
8. review simple compatibility classifications for unassigned trips;
9. view block start/end, revenue hours, platform hours, deadhead, layover, miles where available, and service-day totals;
10. reload, duplicate, export, and restore blocks without losing relationships.

## Confirmed calculation definitions

- Revenue trip start and end come from its first and last scheduled points.
- Raw connection gap equals next trip start minus previous trip end.
- When locations match, usable layover equals the raw gap.
- When locations differ and no deadhead exists, the connection is incomplete and usable layover is not reported as valid.
- When a manual deadhead exists, usable layover equals raw gap minus deadhead duration.
- A negative raw gap or usable layover is an error.
- Revenue hours equal the sum of revenue-trip durations.
- Platform hours equal final pull-in activity end minus initial pull-out activity start.
- A block without both pull-out and pull-in has incomplete platform hours.
- Deadhead hours equal the sum of deadhead durations.
- Layover hours equal the sum of non-negative usable layovers between connected revenue movements after deadhead.
- Revenue miles equal the sum of complete pattern miles for revenue trips.
- Platform miles are reported only when all required pull-out, deadhead, and pull-in miles are supplied; otherwise they are incomplete.
- No minimum layover rule is included.

## Scope

### Included

- ordered pull-out, revenue-trip, deadhead, and pull-in activities;
- named Blocking scenarios, each sourced from exactly one Trip profile;
- manual block creation, labeling, notes, assignment, reassignment, and ordering;
- explicit manual non-revenue times and optional miles;
- centralized block validation;
- derived layover and service summaries;
- simple compatibility classification for possible next trips;
- blocking persistence, complete backup, scenario duplication, and CSV export;
- Blocking-tab assignment and block-oriented interface.

### Excluded

- automatic block building or optimization;
- minimum layover policies;
- automatic garage-time or deadhead matrices;
- crew scheduling;
- interlining UI, while the data model continues to permit future multi-route blocks;
- peak vehicles, spares, and costing implementation.

## Work-package sequence

```text
4A Block domain, validation, compatibility, and summaries — Luna recommended
  -> structural verification and user gate
4B Block persistence, transactions, backup, and CSV — Luna recommended
  -> persistence verification and user gate
4C Blocking UI/UX — Terra recommended
  -> hands-on verification and user gate
4D Primary-agent integration and Phase 4 acceptance
```

## Package 4A: Block domain and summaries

### Recommended model

Luna.

### File ownership

- block-related domain modules and tests;
- block application ports and service modules;
- derived summary selectors;
- schema and decision documentation for approved structural changes.

No page layout, CSS, or interaction decisions.

### Deliverables

- Normalize activity order while retaining stable activity IDs.
- Enforce block ownership by scenario and service day.
- Enforce one source Trip profile per Blocking scenario and reject cross-profile Trip references.
- Prevent one revenue trip from appearing more than once across blocks for the same scenario and day.
- Derive activity and connection times from revenue trips plus explicit non-revenue inputs.
- Validate overlaps, negative layovers, missing trips, time order, and location discontinuities.
- Validate whether an entered deadhead fits the available connection.
- Report missing pull-out or pull-in as incomplete platform data rather than inventing values.
- Derive per-block and selected-day summaries without persisting totals.
- Classify unassigned candidate trips as compatible, requires deadhead, or conflicts based on the selected insertion point.
- Define application commands for block CRUD, assignment, reassignment, activity editing, and ordering.

### Tests

- matching-terminal layover;
- different-terminal incomplete connection;
- fitting and non-fitting deadheads;
- trip overlap and activity time-order errors;
- duplicate trip assignment prevention;
- pull-out and pull-in completeness;
- revenue/platform/deadhead/layover hours;
- complete and incomplete miles;
- extended times above 24:00;
- compatibility classification;
- 100 blocks and 500 trips for one service day.

### Gate

Run focused tests and typechecking. Present worked block timelines and summary calculations for user review. Confirm the calculation definitions before Package 4B.

## Package 4B: Block persistence, transactions, backup, and CSV

### Recommended model

Luna.

### Deliverables

- Add narrow block query and command repository methods.
- Save affected blocks atomically during assignment and reassignment.
- Reject or roll back duplicate assignments and invalid cross-day references.
- Keep scenario duplication and complete JSON backup/restore valid for block activities.
- Export block, block-activity, and block-summary CSV files with stable columns.
- Revalidate blocks after trip changes and load current findings through application queries.

### Gate

Run repository, rollback, backup, copy-mode, CSV, typechecking, and production-build checks. Pause and recommend Terra for Package 4C.

## Package 4C: Blocking UI/UX

### Recommended model

Terra.

### Required interface behavior

- Enable the Blocking tab for a selected Trip profile, Blocking scenario, and service day.
- Select one service day at a time.
- Show compact unassigned trips with start/end nodes and times, pattern, and compatibility status.
- Show the selected block as an ordered activity table.
- Create, rename, and delete blocks with clear consequences.
- Assign, move, remove, and reorder revenue trips.
- Add and edit deadhead, pull-out, and pull-in activities.
- Show raw gap and usable layover at the relevant connection.
- Keep warnings and errors visible with text, not color alone.
- Show a compact all-block summary with a selected-day total row.
- Expose the block label in the Trips schedule through the application layer.

### UX decisions Terra must document

- exact relationship between unassigned trips, block list, activity editor, and summary;
- click, keyboard, or drag behavior for assignment and ordering;
- confirmation behavior for removing an assigned trip or deleting a block;
- display of compatible, deadhead-required, incomplete, and conflicting connections;
- horizontal and narrow-screen behavior;
- how the user returns from a block finding to the responsible activity.

Drag-and-drop must not be the only assignment method.

### Gate

The user manually builds representative Federal Boulevard blocks, including a same-terminal connection, a manual deadhead, an overlap, after-midnight service, pull-out, and pull-in. Run UI tests, typechecking, production build, accessibility checks, and visual inspection.

## Package 4D: Integration and Phase 4 acceptance

### Acceptance criteria

- Blocks persist as ordered activities rather than trip columns.
- A trip cannot be assigned to two blocks.
- Every displayed layover and summary is derived from authoritative records.
- Location discontinuities and impossible deadheads remain visible.
- Platform hours are incomplete without both pull-out and pull-in.
- Regeneration and service-day replacement leave no dangling block references.
- Compatibility results do not mutate blocks.
- The Blocking tab contains no authoritative validation or summary calculations.
- JSON backup, scenario duplication, CSV, tests, build, reload, and visual review pass.

Record a Phase 4 closeout. Present costing as a separate user-approved phase; do not start it.
