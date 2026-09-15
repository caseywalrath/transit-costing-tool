# Phase 2 Implementation Plan: Runtime and Trip Generation

## Status

Accepted historical implementation through Package 2G. Its generation-set-centered trip workflow is superseded as the target architecture by `phase-02r-trips-workflow-revision.md`. Do not extend the Phase 2 generation-set workflow.

Package 2G was accepted on 2026-09-11. See `phase-02-closeout.md` for the historical closeout and the Phase 2R plan for the approved replacement workflow.

## Objective

Implement the runtime and trip-generation foundation and the first complete Trips-tab workflow. A user can define pattern runtimes, generate materialized trips for one service day, make individual shifts or pattern changes, preview regeneration impact, and confirm an atomic replacement.

## User outcome

At completion, a user can:

1. select a service day and pattern;
2. define named runtime bands with start and end times;
3. enter a runtime for every adjacent pattern segment;
4. assign a runtime profile to the selected pattern and service day;
5. define a generation set using first departure and headway plus either an inclusive end departure or a trip count;
6. preview and create trips whose point times use the runtime band applicable to each trip's departure;
7. view all trips for the selected service day in one compact schedule;
8. shift one or more trips by a specified number of minutes;
9. change an individual trip's pattern through a recalculation preview;
10. preview regeneration impacts and confirm or cancel the replacement;
11. reload, duplicate a scenario, export, and restore all Phase 2 records without broken references;
12. export runtime, generation-set, trip, and scheduled-point CSV files.

## Scope

### Included

- runtime-profile, runtime-band, and runtime-assignment domain behavior;
- runtime copy and reverse-copy commands required by Decision 0003;
- generation-set validation for headway, end-time, and count modes;
- materialized trip generation with stable logical positions;
- explicit uniform manual time shifts;
- controlled individual pattern changes with full stop-time recalculation;
- regeneration impact calculation and atomic apply;
- minimal block-reference handling required by regeneration;
- IndexedDB repository operations and any required schema migration;
- complete versioned JSON backup and scenario duplication for Phase 2 records;
- Phase 2 CSV serializers;
- Trips-tab runtime and schedule interfaces;
- centralized runtime, trip, and regeneration validation.

### Excluded

- copy between service days and mature batch editing beyond multi-row time shifts;
- separate arrival and departure times at a point;
- arbitrary manual editing of individual scheduled points;
- blocking-page layout and ordinary block construction;
- minimum layover policy;
- automatic blocking;
- costing;
- Excel or GTFS import/export.

## Required references

- `architecture_overview.md`
- `docs/data-schema.md`
- `docs/domain-glossary.md`
- `docs/ui-conventions.md`
- `docs/decisions/0002-service-day-time-model.md`
- `docs/decisions/0003-pattern-specific-runtimes.md`
- `docs/decisions/0004-trip-regeneration.md`
- `docs/decisions/0005-structural-ui-work-separation.md`
- `docs/implementation/schedule-development-roadmap.md`

## Work-package sequence

```text
2A Runtime domain and application ports — Luna recommended
  -> structural verification and user gate
2B Runtime persistence, migration, backup, and duplication — Luna recommended
  -> persistence verification and user gate
2C Runtime-table UI/UX — Terra recommended
  -> hands-on runtime verification and user gate
2D Trip generation, overrides, and regeneration domain — Luna recommended
  -> structural verification and user gate
2E Trip persistence, transactions, backup, and CSV — Luna recommended
  -> persistence verification and user gate
2F Trip-building UI/UX — Terra recommended
  -> hands-on Trips-tab verification and user gate
2G Primary-agent integration and Phase 2 acceptance
```

Packages must remain separate. A gate response recommends the next package and model but does not start it.

## Package 2A: Runtime domain and application ports

### Recommended model

Luna. This package is pure structural work with explicit behavior and tests.

### File ownership

- `src/domain/runtime*`
- runtime-related additions to `src/domain/types.ts`
- runtime-related application ports and service modules
- focused domain and application tests
- schema or decision documentation only when an approved structural change requires it

Do not change page layout, CSS, interaction behavior, or user-facing table design.

### Deliverables

- Validate profile ownership and pattern references.
- Validate unique runtime assignment per pattern and service day.
- Normalize band sequence without changing stable band IDs.
- Require `startTime < endTime` and non-overlapping half-open bands.
- Permit intentional gaps; report an error when a requested departure has no applicable band.
- Require exactly one non-negative integer duration for each pattern segment.
- Select the runtime band independently for each trip departure.
- Propagate a departure through all pattern points.
- Copy a profile as an independent profile with new IDs.
- Reverse-copy a compatible profile by reversing segment runtime order in every band.
- Return structured findings with no interface text embedded in domain code.
- Define behavior-oriented runtime commands and queries for the later UI.

### Tests

- boundary selection at inclusive start and exclusive end;
- extended-time bands above 24:00;
- overlap, invalid bounds, negative duration, missing duration, and excess duration;
- gap detection for a requested departure;
- different trips in one generation set selecting different bands;
- runtime propagation across two-point, full, short, and loop patterns;
- independent profile copy;
- correct reversed segment runtimes and rejection of an incompatible reverse target.

### Gate

Completed on 2026-09-11. See `phase-02-package-2a-closeout.md`.

## Package 2B: Runtime persistence, migration, backup, and duplication

### Recommended model

Luna.

### File ownership

- runtime repository interfaces and implementations;
- Dexie schema and migrations;
- JSON backup validation, cloning, and restore;
- scenario-duplication structural code;
- persistence tests.

No UI or CSS changes.

### Deliverables

- Add narrow repository methods for runtime profiles and assignments.
- Add or verify indexes used by scenario, route, pattern, and service-day queries.
- Create a Dexie migration only if the stored schema or indexes change.
- Extend `ProjectSnapshot` and the versioned JSON backup graph to include runtime data.
- Validate all runtime references before import writes begin.
- Remap profile, band, pattern, service-day, and assignment IDs during import-as-copy and scenario duplication.
- Preserve the previous backup reader only if a documented migration can safely supply empty runtime collections.
- Save related profile and assignment changes transactionally.

### Tests

- repository round trips;
- assignment uniqueness enforcement;
- migration from a populated Phase 1 database;
- old supported backup import to the new empty-runtime graph;
- new backup round trip;
- invalid runtime reference rejection before writes;
- independent scenario duplication with remapped runtime records.

### Gate

Completed on 2026-09-11. See `phase-02-package-2b-closeout.md`. The user proceeded to Package 2C; the current verification gate is recorded in `phase-02-package-2c-closeout.md`.

## Package 2C: Runtime-table UI/UX

### Recommended model

Terra. This package owns all layout, density, table interaction, accessibility, and visual decisions.

### File ownership

- Trips-tab runtime components under `src/ui/` or an approved feature UI directory;
- related CSS;
- UI-only state and UI tests;
- reusable UI convention documentation.

Terra must use approved application ports and must not implement runtime selection or propagation rules in React.

### Required interface behavior

- Enable the Trips tab when a project, scenario, route, and usable pattern exist.
- Use the accepted project/scenario context controls.
- Select one service day and one pattern at a time.
- Present compact runtime bands as rows and pattern segments as columns.
- Display node or segment labels without exposing internal IDs.
- Add and remove custom time bands.
- Parse and format all times through shared domain utilities.
- Distinguish an empty duration from zero.
- Show row-level or cell-level validation without displaying message keys.
- Provide profile copy and reverse-copy actions with clear consequences.
- Preserve horizontal usability for patterns with many points.
- Reuse Route-tab styling where appropriate while documenting any new grid conventions.

### UX decisions Terra must document

- placement of service-day and pattern selectors;
- whether runtime profile selection is always visible or shown as secondary configuration;
- frozen columns and horizontal scrolling;
- keyboard movement, commit, cancel, and row-add behavior;
- how band boundary changes communicate affected generated trips before trips exist;
- empty states when a route has no usable patterns.

### Gate

Implemented on 2026-09-11. Typechecking, automated tests, and a production build pass. The user proceeded to Package 2D; the prior runtime-editor verification record is `phase-02-package-2c-closeout.md`.

## Package 2D: Trip generation, overrides, and regeneration domain

### Recommended model

Luna.

### Required schema review

Before coding, record the exact explicit override representation. The recommended revision is to retain current materialized `patternId` and `stopTimes`, retain `manuallyChangedFields`, and add a uniform `manualTimeShiftSeconds` value when a generated trip is shifted. A manual pattern change remains explicit through the current pattern differing from the generation set plus the provenance flag.

If a different representation is selected, update `docs/data-schema.md` and record the decision before implementation.

### Deliverables

- Validate positive integer headway and positive integer trip count.
- Treat end-time mode as inclusive of a departure exactly at the end time.
- Reject an end time before the first departure.
- Select and apply a runtime band separately for each generated trip.
- Reject generation when any departure lacks a valid runtime band.
- Produce deterministic generation sequences and stable logical keys.
- Shift all scheduled points on one or more trips by one signed duration.
- Recalculate a trip from a manually selected pattern after previewing the resulting times.
- Validate monotonic scheduled points and pattern-point correspondence.
- Calculate a regeneration preview containing every item required by Decision 0004.
- Apply regeneration in memory while reusing surviving trip IDs.
- Define a block-reference adjustment result for removed and surviving trips.
- Define commands and queries for generation preview, generation apply, shift preview/apply, pattern-change preview/apply, and service-day trip listing.

### Tests

- count and inclusive end-time generation;
- seven-minute all-day headways across multiple runtime bands;
- extended service above 24:00;
- missing-band rejection;
- stable IDs by generation sequence;
- additions, removals, changed times, and unchanged trips in previews;
- overwritten time and pattern overrides;
- signed single and multi-trip shifts;
- complete pattern-change recalculation;
- monotonic time validation;
- affected and removed block references.

### Gate

Implemented on 2026-09-11. Run focused domain/application tests and typechecking. Present example regeneration previews in plain language. Override semantics were accepted and carried into Package 2E. See `phase-02-package-2d-closeout.md`.

## Package 2E: Trip persistence, transactions, backup, and CSV

### Recommended model

Luna.

### Deliverables

- Add narrow generation-set and trip repository operations.
- Apply one confirmed regeneration transaction across generation sets, trips, and affected blocks.
- Preserve surviving trip IDs and block references.
- Remove deleted trip activities from blocks and normalize remaining activity sequence.
- Add new trips without block assignments.
- Extend complete project backup, restore, import-as-copy, and scenario duplication to all Phase 2 data and existing blocks.
- Validate generation provenance and all cross-record references before import.
- Export runtime bands, generation sets, trips, and scheduled points to stable CSV schemas.
- Support the capacity target of at least 500 trips per service day.

### Tests

- confirmed regeneration transaction commits all related changes;
- failed regeneration leaves generation set, trips, and blocks unchanged;
- surviving and removed block references;
- backup and import-as-copy round trips with manual overrides;
- scenario duplication with remapped trips and block references;
- deterministic CSV headers, ordering, extended times, and escaping;
- 500-trip generation, save, load, and validation exercise.

### Gate

Implemented on 2026-09-11. Run persistence tests, JSON round trips, CSV checks, typechecking, and production build. Pause and recommend Terra for Package 2F. See `phase-02-package-2e-closeout.md`.

## Package 2F: Trip-building UI/UX

### Recommended model

Terra.

### Required interface behavior

- Build generation sets for the selected service day and pattern.
- Support both headway plus inclusive end time and headway plus trip count.
- Preview the trips before initial creation.
- Show one combined materialized schedule for the selected service day.
- Include trip pattern, first departure, final arrival, duration, generation set, override status, and future block label location.
- Allow selection of one or more trips and a signed minute shift.
- Allow an individual pattern change through a recalculation preview.
- Present regeneration impacts before confirmation.
- Use row-level warnings and status markers for ordinary findings.
- Do not show a blocking UI in this package; block labels may be read-only if block data already exists.
- Retain service times above 24:00 without wrapping.

### UX decisions Terra must document

- vertical relationship among runtime editor, generation-set editor, and trip schedule;
- selection model for multi-trip shifts;
- compact representation of many scheduled points;
- whether scheduled-point columns scroll or use an expandable row;
- treatment of alternating and staggered pattern trips in the combined schedule;
- warning hierarchy for regeneration effects;
- keyboard editing and focus restoration after preview dialogs.

### Gate

Run typechecking, UI tests, production build, accessibility checks, and visual inspection. The user verifies an all-day seven-minute schedule, a staggered or short trip, an after-midnight trip, a manual shift, a pattern change, and regeneration cancellation/confirmation.

Implemented on 2026-09-11. The package also required a narrow structural correction: initial generation now persists its generation set with related trips and blocks atomically, and the Trips UI receives behavior ports for generation-set listing and assigned-runtime resolution. Typechecking, automated tests, production build, and an initial browser review pass. Pause for the hands-on verification checklist in `phase-02-package-2f-closeout.md`.

## Package 2G: Integration and Phase 2 acceptance

### Responsibility

The primary agent reviews cross-layer consistency. Luna may handle bounded structural corrections; Terra handles corrections involving layout or interaction judgment. Neither is delegated automatically.

### Acceptance criteria

- Every generated departure uses its own applicable runtime band.
- Runtime and trip rules remain outside React and Dexie.
- Generation instructions and materialized trips both persist.
- Manual shifts and pattern changes remain visible as overrides.
- Regeneration never writes before impact confirmation.
- Surviving logical positions retain IDs and block references.
- Removed trips leave no dangling block activities.
- Scenario duplication and JSON import produce independent, valid graphs.
- CSV exports use stable columns and 24-plus formatted times.
- The Trips tab remains usable with 500 trips on one service day.
- All tests, typechecking, production build, reload, and visual review pass.

### Phase closeout

Update architecture, schema, glossary, decisions, backup-version documentation, and UI conventions for material changes. Record verification results in a Phase 2 closeout document. Present Phase 3 and Luna as the next recommendation; do not start it.

### Result

Implemented and accepted on 2026-09-11. The primary-agent review confirmed that scheduling rules remain in the domain and application layers, confirmed transaction and graph behavior through the automated suite, and connected the existing Phase 2 CSV serializers to the visible **Export CSV** action. See `phase-02-closeout.md`.
