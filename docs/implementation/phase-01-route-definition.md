# Phase 1 Implementation Plan: Route Definition Foundation

## Status

Packages 1A, 1B, and 1C are implemented. Phase 1 acceptance verification passed on 2026-09-10. The project is paused for user closeout discussion before any next-phase outline is drafted. See `phase-01-closeout.md`.

## Objective

Create the local application foundation and allow a user to create, save, reopen, export, and restore a project containing scenarios, service-day definitions, routes, nodes, and route patterns.

Phase 1 must establish domain and persistence boundaries that later runtime, trip, blocking, and costing phases can use without restructuring route data.

## User outcome

At completion, a user can:

1. create and name a project;
2. create, rename, duplicate, and select scenarios;
3. edit the four initial service-day definitions and annual service-day counts;
4. create and edit a route;
5. create scheduling nodes;
6. create full, short, staggered, or loop patterns from those nodes;
7. repeat the same node within a loop pattern;
8. enter cumulative pattern miles;
9. create an independently editable reverse pattern;
10. close and reopen the application without losing locally saved data;
11. export and restore a complete project through versioned JSON;
12. export route-definition tables as CSV.

## Scope

### Included

- application and test scaffolding;
- domain value types and route-definition entities;
- time parsing and formatting utilities needed by later phases;
- validation result structure;
- route and pattern validation;
- reverse-pattern domain command;
- in-memory repository implementation for tests and UI development;
- Dexie database version 1;
- project, scenario, service-day, route, node, and pattern repositories;
- transactional scenario creation and duplication;
- local save state and error reporting ports;
- versioned JSON backup and restore;
- CSV exports for routes, nodes, patterns, and pattern points;
- Route page and required project/scenario controls;
- compact table and form interactions;
- domain, persistence, UI, and integration verification.

### Excluded

- runtime profiles and runtime tables;
- authoritative operating spans and headways, which are entered once as trip-generation inputs in Phase 2 rather than duplicated as Phase 1 route metadata;
- trip generation;
- trip editing;
- block assignment;
- layover calculations;
- costing;
- NTD retrieval;
- Excel import or export;
- GTFS import or export;
- authentication or synchronization;
- mapping and geographic shapes;
- every passenger stop;
- automatic GitHub Pages deployment unless separately authorized.

## Required architecture references

- `architecture_overview.md`
- `docs/data-schema.md`
- `docs/domain-glossary.md`
- `docs/decisions/0001-local-first-storage.md`
- `docs/decisions/0002-service-day-time-model.md`
- `docs/decisions/0003-pattern-specific-runtimes.md`
- `docs/decisions/0004-trip-regeneration.md`
- `docs/decisions/0005-structural-ui-work-separation.md`
- `docs/decisions/0006-phase1-backup-graph.md`

## Work-package sequence

Phase 1 is deliberately separated into structural and UI/UX packages. Do not combine them into one implementation task.

```text
1A Structural foundation, Luna recommended
  -> structural verification gate
  -> user review and Terra recommendation
1B Route-definition UI/UX, Terra recommended
  -> UI verification gate
1C Integration and phase acceptance
```

Model recommendations are presented to the user at each gate. They do not create or delegate a task automatically.

## Package 1A: Structural foundation

### Recommended model

Luna. The package is bounded and mechanical after this plan and the schema are accepted.

### Restrictions

- Do not design the final page layout.
- Do not choose visual styling, spacing, colors, or typography.
- Do not establish spreadsheet interaction behavior.
- Do not place domain calculations in React components.
- If a required behavior involves user interaction judgment, record the question for Package 1B.

### Deliverables

#### Project tooling

- Scaffold React, TypeScript, and Vite.
- Add test and typecheck scripts.
- Add the selected IndexedDB, schema-validation, and table dependencies only when required.
- Configure a GitHub Pages-compatible base path without publishing.
- Add a minimal non-designed application entry point sufficient for compilation.

#### Domain layer

Create proposed modules under locations such as:

```text
src/domain/common/
src/domain/time/
src/domain/project/
src/domain/service-day/
src/domain/route/
src/application/
```

Implement:

- entity and value types;
- service-time parser and 24-plus formatter;
- project and scenario creation;
- standard service-day creation;
- scenario duplication as an independent deep copy;
- route, node, pattern, and pattern-point validation;
- normalization of pattern sequence values;
- reverse-pattern creation;
- structured validation findings.

#### Persistence layer

Create proposed modules under locations such as:

```text
src/data/db/
src/data/repositories/
src/data/import-export/
```

Implement:

- repository interfaces;
- in-memory repository implementations;
- Dexie database version 1;
- IndexedDB repository implementations;
- required transaction boundaries;
- versioned project backup export;
- backup validation before import;
- explicit replace or import-as-copy behavior for ID collisions;
- CSV serializers for Phase 1 entities.

#### UI ports

Define behavior-oriented interfaces that the UI will consume. These may include:

- project and scenario commands;
- route-definition load and save commands;
- reverse-pattern command;
- import and export commands;
- save-status events;
- validation-query results.

Do not define ports in terms of a particular visual layout.

### Structural tests

At minimum, test:

- parsing `00:00`, `23:59`, `24:00`, `25:00`, and a larger extended time;
- rejecting invalid minutes, seconds, negative values, and malformed input;
- formatting service seconds without wrapping at 24 hours;
- patterns with two points;
- short patterns using a node subset;
- repeated nodes in loop patterns;
- invalid or decreasing cumulative miles;
- reverse-pattern point order and reconstructed cumulative miles;
- creation of four standard service days;
- independent scenario duplication with remapped IDs and references;
- repository round trips;
- database version 1 creation;
- JSON export and import round trip;
- rejection of invalid or unsupported backup versions;
- CSV escaping, column order, repeated nodes, and decimal miles.

### Structural verification gate

Before Package 1B:

1. run TypeScript typechecking;
2. run domain and persistence tests;
3. run a production build;
4. verify a complete JSON round trip;
5. verify representative CSV output;
6. compare implemented entities with `docs/data-schema.md`;
7. report deviations and unresolved UI questions;
8. update architecture or decision records if structure changed.

### Gate response to user

The completion response should include:

- structural files created;
- tests and build results;
- schema deviations, if any;
- unresolved interaction questions;
- a recommendation to begin Package 1B with Terra.

Do not begin Package 1B automatically.

## Package 1B: Route-definition UI/UX

### Recommended model

Terra. This package requires interaction design, dense-table design, accessibility, and visual judgment.

### Inputs

- approved Package 1A domain and application ports;
- structural verification result;
- this implementation plan;
- reference workbook as an illustrative example only.

### File ownership

Terra should own the initial design work in locations such as:

```text
src/ui/
src/components/
src/features/route/ui/
src/styles/
```

The exact structure may be refined during scaffolding. Terra should not modify domain rules or persistence schemas without stopping and identifying the required structural change.

### Required interface areas

#### Application shell

- primary tabs labeled Route, Trips, Blocking, and Costing;
- Route enabled in Phase 1;
- future tabs clearly inactive without suggesting that data is missing;
- project and scenario selection;
- visible local-save status;
- access to backup, restore, and CSV export.

#### Route details

- route name;
- optional short name;
- optional description;
- concise validation messages associated with affected fields.

#### Service days

- compact table for weekday, Saturday, Sunday, and holiday;
- editable names and annual service-day counts;
- clear distinction between a blank value and zero service days.

#### Nodes

- compact editable table;
- name, short name, node type, and notes;
- add, delete, and reorder behavior where applicable;
- warning before removing a node referenced by a pattern;
- keyboard behavior suitable for repeated entry.

#### Patterns

- pattern list and selected-pattern editor;
- editable pattern name and direction label;
- ordered node selection;
- repeated node support;
- cumulative miles entry;
- derived segment-mile display;
- add, remove, and reorder pattern points;
- reverse-pattern action with name entry and result preview or confirmation;
- clear representation of short patterns without placeholder dashes.

### Required UX decisions

Terra must document and implement decisions for:

- whether nodes and patterns appear side by side or in separate subviews;
- pattern-point reordering method;
- keyboard navigation and commit behavior in editable grids;
- how unsaved in-cell edits interact with automatic IndexedDB saving;
- delete and reverse confirmations;
- validation placement and severity display;
- narrow-screen behavior for wide tables;
- density, minimum row height, and frozen identifying columns;
- empty states for new projects, routes, nodes, and patterns.

These decisions should be summarized in the Package 1B closeout. Material reusable UI conventions should be added to architecture documentation or a UI conventions document.

### UI constraints

- Keep tables compact and functional.
- Avoid unnecessary card containers and large padding.
- Do not hide important fields behind hover-only controls.
- Support keyboard and mouse input.
- Do not use color as the only validation indicator.
- Keep destructive actions visually distinct and confirm their exact effect.
- Display extended times through shared domain formatting when time examples appear.
- Use domain commands rather than editing IndexedDB directly.

### UI verification gate

Before integration acceptance:

1. run typechecking and UI tests;
2. run a production build;
3. visually inspect the complete Route workflow;
4. test keyboard entry in node and pattern tables;
5. test a loop with a repeated node;
6. test a short pattern;
7. test reverse-pattern creation;
8. test validation and destructive confirmations;
9. inspect compact layout at representative desktop widths;
10. verify that UI components contain no duplicated domain calculations.

### Gate response to user

The completion response should include:

- implemented screens and interactions;
- visual and keyboard checks performed;
- any requested structural changes;
- screenshots or a local preview when available;
- a recommendation for Package 1C integration and phase acceptance.

Do not proceed to Phase 2 automatically.

## Package 1C: Integration and phase acceptance

### Responsibility

The primary agent performs cross-layer review and final verification. Luna may perform bounded mechanical corrections. Terra handles any correction affecting design or user experience.

### Integration checks

- UI uses application commands and repository interfaces.
- React components do not import the Dexie database directly.
- Domain modules do not import React or Dexie.
- All accepted UI changes persist and reload correctly.
- Scenario duplication produces independent records and valid references.
- JSON backup restores all Phase 1 entities.
- CSV files contain stable headers and correct pattern-point sequences.
- Errors are visible and do not become plausible saved values.
- The application meets the Phase 1 acceptance criteria below.

## Acceptance criteria

### Projects and scenarios

- A new project can be created with a required name.
- A project can contain multiple scenarios.
- A scenario can be duplicated.
- Editing a duplicated scenario does not alter its source.
- Project and scenario selections persist locally.

### Service days

- New scenarios contain weekday, Saturday, Sunday, and holiday definitions.
- Annual service days accept non-negative integers.
- A zero value remains distinct from blank or invalid input.

### Routes and nodes

- A route requires a name.
- Nodes can be created, edited, and used in more than one pattern.
- Referenced nodes cannot be silently deleted.
- Node identifiers remain stable when names change.

### Patterns

- A pattern requires a name and at least two points.
- A pattern may use only a subset of route nodes.
- A loop may contain the same node more than once.
- Pattern-point sequence remains deterministic after reordering.
- Cumulative miles begin at zero and do not decrease.
- Segment miles are derived correctly.
- Reverse-pattern creation preserves reversed segment distances and creates independent records.

### Persistence and exchange

- Data survives a browser reload.
- Save state and failures are visible.
- JSON export contains a format identifier and schema version.
- A valid export can be restored without losing relationships.
- Unsupported or invalid exports are rejected before writes occur.
- CSV export correctly represents routes, nodes, patterns, and pattern points.

### Architecture

- Domain logic has no React or Dexie dependency.
- UI code does not contain authoritative route validation or reverse-pattern calculations.
- IndexedDB writes that span related entities use transactions.
- Typechecking, automated tests, production build, and visual review pass.

## User verification scenario

Use a small representative Federal Boulevard example rather than importing the entire workbook:

1. create a Federal Boulevard project;
2. create an initial scenario;
3. retain four service days;
4. add several representative nodes, including both terminals and intermediate timepoints;
5. create a full-length pattern;
6. create a short pattern using a node subset;
7. create a loop test pattern containing a repeated node;
8. reverse the full-length pattern;
9. verify cumulative and segment miles;
10. reload the application;
11. export JSON and CSV;
12. restore the JSON as a separate project and verify independence.

Do not treat the example values as production defaults.

## Phase closeout

At Phase 1 completion:

1. update `architecture_overview.md` with the implemented file structure and selected dependency versions;
2. update `docs/data-schema.md` for approved schema deviations;
3. record new architectural decisions;
4. summarize the final UI conventions;
5. record all verification results;
6. present Phase 2 as a new user-approved effort;
7. recommend Luna for the structural runtime and trip-generation engine package, followed by Terra for runtime-table and trip-building UX.
