# Transit Costing Tool Architecture Overview

## Status

Phase 3R is implemented and accepted through Package 3R-C. It adds scoped staged Trip Shift preview/commit contracts with stale-source protection, unified Runtime and Trip header action layers, and a right-docked staged Shift drawer. The closeout is recorded in `docs/implementation/phase-03r-closeout.md`.

This document defines the initial architecture. Phase 1 route definition is implemented and accepted through Package 1C. The original Phase 2 runtime and trip generation implementation is accepted through Package 2G. User review then approved Phase 2R as a replacement Trips workflow. Packages 2R-B and 2R-C are implemented. Package 2R-D now renders the revised workflow and awaits user verification. The corrective safe-route-editing package in `docs/implementation/phase-02r-safe-route-editing.md` and the Trip-profile implementation from `docs/implementation/phase-02tp-trip-profiles.md` and Decision 0016 are implemented and user-accepted. Phase 3 service-day workflows are implemented and accepted through Package 3C; Runtime and Trip copies remain separate operations. Phase 3R is implemented and accepted through Package 3R-C under Decision 0018; it consolidates Runtime and Trip section-header action layers and stages Trip shifts in a right-docked preview drawer without changing authoritative scheduling rules. The Dexie schema is version 3 and the JSON backup schema is version 4. Phase-specific implementation must follow the decision records and implementation plans under `docs/`.

## Product Objective

Build a browser-based tool that allows a transit planner to:

1. define a route and its scheduling timepoints;
2. define full-length, short-turn, offset, loop, and reverse route patterns;
3. define segment runtimes by departure-time band;
4. generate and adjust scheduled trips for multiple service-day types;
5. assign trips to vehicle blocks and identify invalid connections;
6. summarize revenue hours, platform hours, miles, and vehicle requirements;
7. estimate annual route costs using user-entered or manually transcribed NTD rates;
8. export useful tabular data.

The product is a planning tool. It is not intended to dispatch service, manage operators, publish real-time information, or replace a full operations scheduling suite.

## Confirmed Scope Decisions

| Area | Initial decision |
| --- | --- |
| Deployment | Static GitHub Pages site |
| Backend | None |
| Persistence | Browser-local IndexedDB |
| User model | Single local user |
| Project organization | Multiple projects and scenarios |
| Initial route scope | One route at a time in the interface |
| Distance unit | Miles |
| Service-day types | Weekday, Saturday, Sunday, and holiday |
| Time representation | Integer seconds from service-day midnight |
| Extended time | Times greater than 24:00 are supported |
| Runtime selection | The trip departure time selects one runtime band for the full trip |
| Runtime ownership | Complete pattern-specific profiles in the first build |
| Trip authority | Saved trips and scheduled points; generation requests are transient |
| Runtime changes | Existing trips remain fixed until explicit recalculation |
| Timetable alternatives | Scenario-wide Trip profiles; Runtime profiles remain independent |
| Direction view | Application-managed Outbound and Inbound groups; patterns may carry a separate descriptive Label |
| Blocking | Manual assignment first; automated suggestions later |
| Layover | Derived from connected trips and deadhead activities |
| Deadhead | Manually entered first |
| Primary cost measures | Revenue hours and platform hours |
| Secondary measure | Miles when supplied |
| NTD input | Manual entry first |
| Initial export | CSV; versioned JSON is also required for backup and restore |

## Technology Direction

The expected application stack is:

- React and TypeScript for the application;
- Vite for development and static builds;
- Dexie as the IndexedDB access layer;
- a headless table library for dense tabular behavior;
- a runtime schema validator for imported data and migrations;
- Vitest for domain and persistence tests, with Playwright for browser-rendered layout regression tests;
- plain CSS or CSS Modules for a compact interface;
- GitHub Actions for GitHub Pages deployment.

Exact dependencies and versions must be selected during scaffolding and recorded in the Phase 1 implementation result.

Phase 1A selected dependencies: React 19, TypeScript 5.9, Vite 7, Dexie 4, Zod 4 (reserved for import/migration validation), TanStack Table 8 (headless table capability), and Vitest 3. The package manifest is authoritative for exact ranges. Vite is configured with a relative (`./`) base for GitHub Pages project hosting.

The implemented file boundaries are:

```text
src/domain/         entities, time utilities, validation, and pure commands
src/application/    behavior-oriented ports and the RouteDefinitionService use-case facade
src/persistence/    Dexie database, repositories, backup, and CSV serializers
src/ui/             Route page, compact tables, dialogs, and UI-only preferences
src/main.tsx        composition root for repository, backup, application service, and React UI
```

The Route UI depends on `RouteDefinitionApplication`; the Trips UI depends on `TripGenerationApplication`. The application services coordinate domain commands, repository transactions, backup and CSV operations, validation queries, derived segment miles, and save-status events. React does not import Dexie, persistence serializers, or authoritative route commands. Packages 2A through 2G provide the historical runtime and generation implementation. Phase 2R-B adds route-managed Outbound and Inbound records, internally ordered timetable columns, pattern mappings, canonical service-day ordering, flexible runtime-duration utilities, runtime calculation revisions, Default-profile provisioning, safe profile lifecycle commands, and direction-aware persistence/backup serializers. Phase 2R-C adds transient validation-only generation requests, additive atomic trip insertion, direct Add Trip, same-direction pattern changes, explicit recalculation impact reporting, stale-source queries, and authoritative trip CSV output. Package 3A adds typed target-first Runtime-copy and Trip-copy commands, source-signature stale protection, independent/shared Runtime modes, target-Day Trip replacement with Block-activity cleanup, and atomic all-or-nothing batch Pattern changes. Runtime selection, trip generation, recalculation, service-day copy, and validation remain outside React.

The JSON backup graph includes the project, scenarios, service days, routes, nodes, directions, patterns, pattern points, runtime profiles, runtime assignments, scenario-wide Trip profiles, authoritative trips, and blocks. Current exports use JSON schema version 4 and omit the historical generation-set collection when it is empty; the parser continues to accept non-empty generation sets in older Phase 2 files. Version 1 through version 3 backups are normalized to one Default Trip profile per Scenario. Direction data is optional when reading pre-2R backups and is remapped during scenario/import copies. Costing records remain owned by their later phase.

## Architectural Principles

### Domain logic is independent

Scheduling, trip generation, blocking validation, summaries, and costing must be pure TypeScript wherever practical. Domain modules must not import React, browser components, or Dexie.

### Persistence is replaceable

The application layer accesses data through repository interfaces. IndexedDB implements those interfaces. This permits in-memory tests and leaves open a future server-backed implementation.

### The interface does not own calculations

React components collect commands and display results. They must not contain authoritative trip-generation, time-propagation, block-validation, or costing rules.

### Store inputs and relationships

Store user inputs, generated records, manual overrides, and stable identifiers. Recalculate summaries, layovers, costs, and validation findings instead of persisting duplicate totals.

### Destructive changes report impact

Additive initial generation does not require a schedule preview. Recalculation and future bulk replacement operations must show their expected impact before execution when manual work or block references would be affected. Related writes must occur in one database transaction.

All user-defined records require an explicit lifecycle rule before their editing UI is accepted. Deletion must report and safely apply its downstream effects. Archiving is a later lifecycle state and must define its effect on calculations, schedules, exports, selectors, and backups before it is introduced.

Route deletion removes that Route's Nodes, managed Directions, Patterns, runtime profiles and assignments, historical generation records, and trips in one scenario transaction. Revenue-trip activities for those trips are removed from affected Blocks, while the Block records remain for later review. Scenario deletion removes the complete scenario-owned graph in one project transaction. A project must retain one Scenario, so the interface requires another Scenario before the final one may be deleted.

### Future interlining must remain possible

Routes belong to scenarios. Blocks belong to scenarios and service days rather than to one route. A block can therefore reference trips from multiple routes in a later release.

## Logical Layers

```text
React UI
  -> application commands and queries
    -> pure domain services
    -> repository interfaces
      -> Dexie / IndexedDB
```

### Domain layer

Contains entities, value types, validators, and pure calculations.

Examples:

- service-time parsing and formatting;
- route-pattern validation;
- runtime-band selection;
- trip generation and time propagation;
- block compatibility and layover calculation;
- service summaries and cost projection.

### Application layer

Coordinates use cases and transactions.

Examples:

- create a scenario;
- reverse a pattern;
- regenerate a trip set;
- copy service from Saturday to Sunday;
- assign trips to a block;
- export a scenario.

### Persistence layer

Implements repositories, database migrations, backup, restore, and CSV serialization.

### UI layer

Implements pages, forms, grids, table interactions, selection, warnings, accessibility, and visual styling.

## Domain Hierarchy

```text
Project
└── Scenario
    ├── Service day definitions
    ├── Routes
    │   ├── Nodes
    │   ├── Managed direction groups and internal timetable columns
    │   ├── Route patterns
    │   └── Runtime profiles and assignments
    ├── Trip profiles
    │   ├── Trips across Routes and service days
    │   └── Blocks sourced from that timetable
    └── Cost plans
```

The interface initially selects one project, scenario, route, and service day. Day and direction are non-authoritative workspace context selections: Trips uses both, future Blocking uses day only, and Route does not require either. The storage model supports more than one of each. Trips also selects one scenario-wide Trip profile; future Blocking will select one Trip profile through a named Blocking scenario.

## Route and Pattern Model

A node represents a scheduling timepoint, terminal, or other location required for planning. The first release does not model every passenger stop.

A route contains two managed direction groups: Outbound and Inbound. Each group contains stable internal timetable columns. Every route pattern belongs to one group, and each pattern point maps to one internal column. A pattern may omit columns. Column identifiers distinguish repeated visits to the same node.

Direction and pattern sequences are normalized deterministically at the domain/application boundary. The structural implementation provisions both groups when a route is created and maps points by node occurrence; a loop therefore receives distinct columns for each visit. A pattern's descriptive Label is independent of group ownership. Legacy fixtures may omit direction data, but a usable Phase 2R route is validated against its direction and column references.

A route pattern contains ordered pattern points. A pattern point refers to a node but has its own identifier and sequence. Separate pattern-point identifiers allow a loop to visit the same node more than once.

Each pattern point stores cumulative miles from the beginning of the pattern. Segment miles are calculated from adjacent cumulative values.

Examples of patterns include:

- full outbound;
- full inbound;
- short outbound;
- staggered inbound;
- clockwise loop;
- counterclockwise loop.

Creating a reverse pattern reverses the pattern points and recalculates cumulative miles from the original segment distances. It does not silently create a runtime profile.

## Runtime Model

A runtime profile belongs to one route pattern. It contains ordered runtime bands and segment runtimes.

A runtime assignment links one service day to one runtime profile for a pattern. Multiple service days may reference the same profile. Profiles are not shared between patterns in the initial implementation.

Runtime segment durations are parsed from decimal minutes or `MM:SS` into integer seconds and formatted as `:MM` or `:MM:SS`. A runtime profile carries a calculation revision. Band-bound or segment-duration changes increment that revision; a profile rename does not. Existing trips record the profile and revision used for their current times, and Package 2R-C provides explicit recalculation against that source.

Runtime bands are continuous half-open intervals: start time is inclusive and end time is exclusive. A label covering disjoint periods must use separate bands. For example, off-peak service from 04:00-06:00 and 22:00-26:00 uses two bands.

The trip's initial departure time selects the runtime band. The selected band applies for the entire trip even if the trip crosses into another band.

Pattern-specific profiles are an initial simplification. The application should provide copy and reverse-copy operations. Shared segment defaults or pattern overrides may be considered after the first runtime implementation is evaluated.

## Trip Generation Model

Phase 2R replaces saved generation sets with transient additive generation requests. A request contains a pattern, First Trip, Headway, and inclusive Last Trip. It validates and creates ordinary trips but is not retained as authoritative data. Package 2R-C exposes this through `previewGenerateTrips` and `generateTrips`; no generation-set row is created by either command.

Each trip stores its ordered scheduled times, creation method, and runtime-profile calculation source used to produce them. Runtime changes do not silently alter trips. Users explicitly recalculate selected trips while retaining their trip IDs and block references. Recalculation requires impact confirmation when it would overwrite manual changes or affect blocks. Additive generation and Add Trip use atomic trip-only inserts; pattern changes and recalculation use atomic trip-change writes.

The schedule selects one service day and direction and interlaces trips from every pattern in that direction. When multiple patterns share a direction timetable column, rows are ordered by the earliest shared column (the first common timepoint in the direction); when no common column exists, the first scheduled time is used. Direction columns provide the stable timetable layout, and patterns that omit a column display an empty marker.

### Trip-profile boundary

A Trip profile is one scenario-wide timetable alternative spanning all Routes and service days. It owns Trips but does not own Runtime profiles or assignments. Each Trip retains its runtime calculation source as provenance. Copying a Trip profile duplicates its Trips with new IDs and no Blocks. Future Blocking scenarios select exactly one Trip profile, preventing competing timetable alternatives from being combined while preserving multi-route interlining. See Decision 0016 and the Phase 2TP plan.

## Service-Day Model

Weekday, Saturday, Sunday, and holiday are separate service-day definitions. Each contains an editable annual service-day count. Phase 3 separates Runtime copying from Trip copying. Both are target-first and route-scoped. Runtime copy covers every usable Pattern and defaults to independent profiles, with explicit sharing available. Trip copy operates within one Trip profile, includes both Directions, replaces the target Day's Trips, and does not copy Blocks. See Decision 0017.

Operating spans and observed headways are derived from authoritative trips. The application does not retain duplicate operating-span or generation-rule records after additive generation.

## Blocking Model

A block is an ordered collection of activities for one scenario and service day. Initial activity types are:

- pull-out;
- revenue trip;
- manual deadhead;
- pull-in.

Layover is derived from the available time between consecutive activities. It is not stored as an independent authoritative activity.

The first blocking release supports manual trip assignment, manual deadhead, and manual pull-out and pull-in. It reports:

- overlapping trips;
- negative layover;
- location discontinuity without deadhead;
- deadhead that does not fit in the available gap;
- missing pull-out or pull-in data required for platform hours.

## Summary and Cost Model

Initial service quantities are:

- revenue hours: sum of scheduled revenue-trip durations;
- platform hours: block pull-in time minus block pull-out time;
- revenue miles: sum of pattern miles for revenue trips when distances are complete;
- annual quantities: daily quantities multiplied by annual service-day counts.

A cost plan includes one or more estimates. Each estimate selects a basis such as revenue hours or platform hours, a rate, a base year, source metadata, and inflation assumptions.

Revenue-hour and platform-hour estimates may be compared but are not automatically added. Combined line-item costing, cost per mile, peak vehicles, and spare ratios are later capabilities.

## Validation

Validation returns structured findings rather than formatted strings. Each finding includes a rule identifier, severity, entity reference, message parameters, and optional acknowledgment information.

Errors prevent an operation when the resulting data would be unusable. Warnings allow confirmation or later correction. Acknowledging a warning does not remove the underlying condition.

## Persistence, Backup, and Export

IndexedDB is the working store. It is local to a browser profile and device and does not provide synchronization or automatic cloud backup.

The first usable application must include:

- versioned database migrations;
- versioned JSON project export and import for complete backup and restore;
- validation before import;
- CSV exports for user-facing tabular data;
- visible local-save status.

CSV is not a complete backup format because it cannot reliably preserve every relationship and setting.

## UI Structure

Primary navigation is:

```text
Route | Trips | Blocking | Costing
```

Tables must be compact, functional, and suitable for repeated editing. Detailed UI decisions are deferred to Terra work packages and must not be established by structural implementation.

## Structural and UI/UX Work Separation

Each implementation phase should be divided when both types of work are present:

1. a structural package recommended for Luna;
2. a verification gate and user review;
3. a UI/UX package recommended for Terra;
4. integration and final phase verification.

Structural packages define typed ports, domain behavior, persistence, and tests. UI/UX packages consume those ports and define presentation and interaction. If UI work reveals a needed domain change, document it and return it to a separate structural revision rather than embedding business logic in the UI.

## Initial Capacity Target

The initial design and tests should support at least:

- 500 trips per service day;
- 30 pattern points per pattern;
- 100 blocks per service day;
- four service-day types;
- smooth local generation, recalculation, ordering, and validation at that scale.

These are acceptance targets, not database limits.

## Phased Roadmap

### Phase 1: Route definition foundation

Create the application foundation, projects, scenarios, routes, service days, nodes, patterns, reverse-pattern behavior, persistence, backup, and initial CSV export.

### Phase 2: Runtime and trip generation (historical implementation)

Create runtime profiles, service-day assignments, runtime bands, generation sets, materialized trips, manual shifts, and regeneration previews.

Accepted historical implementation plan: `docs/implementation/phase-02-runtime-trip-generation.md`.

### Phase 2R: Trips workflow revision

Replace saved generation sets with authoritative trips and transient additive generation. Add route directions, ordered direction-level timetable columns, flexible runtime-duration entry, direct Add Trip behavior, explicit recalculation, and the Service, Runtimes, Trips workflow.

Approved implementation plan: `docs/implementation/phase-02r-trips-workflow-revision.md`.

Packages 2R-B and 2R-C structural work are complete. Package 2R-D renders the revised workflow and is at its user-verification gate. The safe route-editing corrective package is implemented and user-accepted. It stages Node and Pattern changes, reconciles direction columns from all Patterns, preserves deterministic runtime and trip changes, and resets only a changed Pattern's dependent service when required. Phase 2TP Trip profiles are implemented and user-accepted. Package 2R-E remains the final integration and acceptance gate.

### Phase 2TP: Trip profiles (implemented and accepted)

Add scenario-wide timetable alternatives, scope every Trip and Block to one alternative, and establish the input boundary for future Blocking scenarios. Runtime profiles and assignments remain shared calculation inputs rather than timetable ownership.

Implementation plan: `docs/implementation/phase-02tp-trip-profiles.md`.

### Phase 3: Service-day editing workflows

The plan was rewritten on 2026-09-14 for separate route-scoped Runtime and Trip copy operations plus authoritative batch Trip editing. Phase 3 is implemented and accepted through Package 3C. Historical generation sets remain supported only for legacy backup compatibility and do not participate in Phase 3 commands. Phase 4 is deferred to a later user-approved session.

Rewritten implementation plan: `docs/implementation/phase-03-service-day-workflows.md`.

### Phase 4: Manual blocking

Add block activities, manual assignment, deadhead, pull-out and pull-in, conflict validation, layover display, and block summaries.

Draft implementation plan: `docs/implementation/phase-04-manual-blocking.md`.

### Phase 5: Costing

Add annual service quantities, revenue-hour and platform-hour estimates, user and NTD source metadata, inflation, and scenario comparisons.

### Phase 6: Advanced capabilities

Consider suggested blocking, peak vehicles and spares, mile-based costing, Excel interoperability, GTFS interoperability, and multi-route interlining.

## Deferred Decisions

The following decisions are deliberately deferred:

- separate arrival and departure timestamps at a pattern point;
- shared segment runtimes or inherited runtime defaults;
- automatic blocking algorithms;
- detailed garage and deadhead matrices;
- cost-category allocation and combined cost models;
- multi-user synchronization;
- GTFS import and export;
- Excel import.

Resolve each item through a decision record before implementation.
