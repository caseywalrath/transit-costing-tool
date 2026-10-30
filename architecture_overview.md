# Transit Costing Tool Architecture Overview

## Status

Phases 1 through 4 are implemented and user-accepted: route definition (Package 1C), runtime and trip generation (Package 2G) with its Phase 2R replacement of the Trips workflow (direct Trips, safe route editing, Trip profiles), service-day workflows (Package 3C), the unified action layers and staged Shift drawer (Package 3R-C, Decision 0018), and manual blocking (Package 4D, `docs/implementation/phase-04-closeout.md`). Phase 4 uses relative connection deadheads: new and edited deadheads begin at their preceding revenue Trip end and derive the remaining layover before the successor Trip; legacy explicit deadhead times remain readable. Pull-out and pull-in values remain Block-owned; Decision 0024 adds a previewed, atomic bulk edit across matching Blocks. The Trip table interchange and undo package adds CSV exchange, one-step regeneration undo, a segment-start default for new Runtime profiles, sticky Trips headings, and scroll retention after shifts (`docs/implementation/phase-02r-trip-table-interchange-undo.md`). Decision 0026 records Trips-table unassignment and Revenue hours inclusive of layover.

Phase 5 Packages 5A through 5C (Costing) are implemented and the user accepted the Costing workspace on 2026-10-22. The October 2026 code review replaces Package 5D except user acceptance (`docs/implementation/phase-05-costing.md`). The Dexie schema is version 7 and the JSON backup schema is version 6. Code review Stage 4 (issue resolution) is recorded package by package in `docs/implementation/review-fixes.md`; the current status paragraph is in `codex.md`.

Phase UR (interface revision, Decision 0047) is implemented and was accepted by the user on 2026-10-27; `docs/implementation/ui-revision-closeout.md` records the integration review. It changes no domain, persistence, or CSV behaviour.

Phase-specific implementation must follow the decision records and implementation plans under `docs/`. Each decision record carries a Status and a Date, and states which earlier decisions or items it supersedes.

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
| Runtime selection | Each profile selects one band for the trip or a band at each segment start. Existing continuous-blend profiles remain readable. Single-band anchored regeneration may use a uniquely nearest band within ten minutes or a band explicitly chosen in its preview |
| Runtime ownership | Complete pattern-specific profiles; matching segments are copied or filled between the profiles of a Route on request (Decision 0049) |
| Trip authority | Saved trips and scheduled points; generation requests are transient |
| Runtime changes | Existing trips remain fixed until explicit recalculation |
| Timetable alternatives | Scenario-wide Trip profiles; Runtime profiles remain independent |
| Direction view | Application-managed Outbound and Inbound groups; patterns may carry a separate descriptive Label |
| Blocking | Manual assignment first; automated suggestions later |
| Layover | Derived from connected trips and deadhead activities |
| Deadhead | Manually entered first |
| Initial cost multiplier | Entered USD operating cost per Revenue Hour (VRH); Platform Hours are displayed, not separately costed |
| Secondary measure | Miles when supplied |
| NTD input | Manual entry first |
| Initial export | CSV; versioned JSON is also required for backup and restore |

## Technology Direction

The expected application stack is:

- React and TypeScript for the application;
- Vite for development and static builds;
- Dexie as the IndexedDB access layer;
- hand-written table components for dense tabular behavior, with no table library (decision 18 of the code review);
- hand-written validation of imported data and migrations, with no schema library (decision 18);
- Vitest for domain and persistence tests, run on `fake-indexeddb` so the Dexie repository and database upgrades are tested in `pnpm test` (Decision 0040), with Playwright for browser-rendered layout regression tests;
- plain CSS or CSS Modules for a compact interface;
- GitHub Actions: a CI workflow (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`: typecheck (which covers `src`, `tests`, and the tool configs), unit tests, the production build, and the Playwright browser suite. The Pages deployment (`deploy-pages.yml`) starts only after the CI run for a push to `main` has succeeded and builds the commit that CI checked;
- Node 22 LTS, pinned in `.nvmrc`, `engines`, and CI, and pnpm 10, pinned by the `packageManager` field.

Exact dependencies and versions must be selected during scaffolding and recorded in the Phase 1 implementation result.

Phase 1A selected dependencies: React 19, TypeScript 5.9, Vite 7, Dexie 4, and Vitest 3. Zod and TanStack Table were selected at scaffolding and removed in the code review (Package B01) because nothing imported them. The package manifest is authoritative for exact ranges. A major upgrade of Vitest (the remaining `pnpm audit` findings are all in its chain) is follow-up work, not done. Vite is configured with a relative (`./`) base for GitHub Pages project hosting.

The implemented file boundaries are:

```text
src/domain/         entities, time utilities, validation, pure commands, and costing calculations
src/application/    behavior-oriented ports and Route, Trip, Blocking, and Costing services
src/persistence/    Dexie database, repositories, backup, and CSV serializers
src/ui/             Route page, compact tables, dialogs, and UI-only preferences
src/main.tsx        composition root for repository, backup, application service, and React UI
```

The Route UI depends on `RouteDefinitionApplication`; the Trips UI depends on `TripGenerationApplication`. The application services coordinate domain commands, repository transactions, backup and CSV operations, validation queries, derived segment miles, and save-status events. `CostingApplicationService` selects one Blocking Scenario and assembles its pure calculation through a read-only context query port, then delegates report serialization. The context is built in `src/application/costingContext.ts` from narrow read sources (`CostingContextSources`): it reads the Trips and the Patterns once per build and summarizes every Block from that one read with `summarizeBlockingScenario`, so a build costs a fixed number of reads however many Blocks there are. The Blocking screen reviews all unassigned Trips against a Block with one `classifyInsertions` call, which reads the Trips and Patterns once. The Costing screen takes the assumption findings, the annual service-day total and its 365-day limit, the list of service years, and the limit on future years from `CostingQueries`; it holds none of those rules. Scenario-owned assumptions persist through a narrow repository; costing results remain derived and are not stored. React does not import Dexie, persistence serializers, or authoritative route commands. Packages 2A through 2G provide the historical runtime and generation implementation. Phase 2R-B adds route-managed Outbound and Inbound records, internally ordered timetable columns, pattern mappings, canonical service-day ordering, flexible runtime-duration utilities, runtime calculation revisions, Default-profile provisioning, safe profile lifecycle commands, and direction-aware persistence/backup serializers. Phase 2R-C adds transient validation-only generation requests, additive atomic trip insertion, direct Add Trip, same-direction pattern changes, explicit recalculation impact reporting, stale-source queries, and authoritative trip CSV output. Package 3A adds typed target-first Runtime-copy and Trip-copy commands, source-signature stale protection, independent/shared Runtime modes, target-Day Trip replacement with Block-activity cleanup, and atomic all-or-nothing batch Pattern changes. Runtime selection, trip generation, recalculation, service-day copy, and validation remain outside React.

The implemented JSON backup graph includes the project, scenarios, service days, routes, nodes, directions, patterns, pattern points, runtime profiles, runtime assignments, scenario-wide Trip profiles, Blocking Scenarios, optional Scenario-owned Costing assumptions, authoritative trips, and normalized Blocks. Current exports use JSON schema version 6 and omit the historical generation-set collection when it is empty; the parser continues to accept non-empty generation sets in older Phase 2 files. Versions 1 through 5 remain readable; pre-version-5 Blocking Scenario handling retains its earlier normalization. Version 1 through version 3 backups are normalized to one Default Trip profile per Scenario. Blocks without a Blocking Scenario (the placeholder Blocks of version 3 and 4 files) are discarded on import and counted in the import report (Decision 0019 item 13), and normalized Blocks keep no Trip Profile of their own. Import validates Block and Trip ownership, activity shape, Node ownership, label and Trip uniqueness, and the structural Blocking rules before any write, and rejects with a readable message (Decision 0039). Direction data is optional when reading pre-2R backups and is remapped during scenario/import copies. Blocking Scenario, Block, activity, Trip, Node, and Costing-assumption Scenario ownership references are remapped during import-as-copy and scenario duplication. A normalized Block stores no Trip Profile of its own in a copy. Scenarios duplicated before pull-out, deadhead, and pull-in Node references were remapped are repaired once by the Dexie version 7 upgrade and again when such a backup file is parsed (Decision 0038). Costing calculations are not backed up because they are derived.

## Architectural Principles

### Domain logic is independent

Scheduling, trip generation, blocking validation, summaries, and costing must be pure TypeScript wherever practical. Domain modules must not import React, browser components, or Dexie.

### Persistence is replaceable

The application layer accesses data through repository interfaces. IndexedDB implements those interfaces. This permits in-memory tests and leaves open a future server-backed implementation. The in-memory and Dexie repositories share one contract test suite and the same observable behavior, including primary-key result order, stale-source rejection, and Scenario cascades (Decision 0040).

### The interface does not own calculations

React components collect commands and display results. They must not contain authoritative trip-generation, time-propagation, block-validation, or costing rules.

### Store inputs and relationships

Store user inputs, generated records, manual overrides, and stable identifiers. Recalculate summaries, layovers, costs, and validation findings instead of persisting duplicate totals.

### Destructive changes report impact

Additive initial generation does not require a schedule preview. Recalculation and future bulk replacement operations must show their expected impact before execution when manual work or block references would be affected. Related writes must occur in one database transaction.

All user-defined records require an explicit lifecycle rule before their editing UI is accepted. Deletion must report and safely apply its downstream effects. Archiving is a later lifecycle state and must define its effect on calculations, schedules, exports, selectors, and backups before it is introduced.

Project deletion removes the Project and all data in its scenarios in one transaction; no minimum Project count is enforced. The Project Actions menu provides rename and confirmed deletion, with deletion impact counts supplied by the application layer. Route deletion removes that Route's Nodes, managed Directions, Patterns, runtime profiles and assignments, historical generation records, and trips in one scenario transaction. Revenue-trip activities for those trips are removed from affected Blocks, while the Block records remain for later review. Route duplication copies the same Route-owned planning graph with remapped identifiers but does not copy Block activities; copied Trips begin unassigned. Scenario deletion removes the complete scenario-owned graph in one project transaction. Every deletion (Project, Scenario, Route, Pattern, Runtime profile, Trip profile, and Trips) takes the review token of the impact review the planner saw; the token fingerprints every record the deletion removes or changes, and a deletion whose token no longer matches the stored data is refused without changing anything (Decision 0041). Deleting a Node removes the pull-out, pull-in, and deadhead activities that name it and keeps their Blocks. Scenario-wide writes that originate from an interface copy of the Scenario (Service day edits, Scenario rename, New route, Duplicate route) re-read the stored records inside the write transaction and change only their own records; Duplicate scenario copies the stored Scenario, not the caller's copy (Decision 0036). Whole-Scenario replacement through `saveScenarioRecords` is reserved for operations whose caller has just read the records. A project must retain one Scenario, so the interface requires another Scenario before the final one may be deleted. See Decision 0029 for Project lifecycle behavior.

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

Two rules keep the screens predictable (review package U07). A render error inside a screen is caught by one error boundary below the header and tabs, which shows a recoverable message instead of an empty page and resets when the tab, Scenario, or Route changes. The Trips workspace loads its Runtime data one read at a time (`src/ui/singleFlight.ts`): every Runtime change bumps one version number and reloads once, and the Trips table shades from what that read returned, not from the records the page loaded at the start.

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
    │   └── Blocking scenarios sourced from that timetable
    │       └── Blocks by service day
    └── Costing assumptions (Phase 5; one set shared by Blocking Scenarios)
```

The interface keeps Project and Scenario selectors in a permanent global row with separate lifecycle Actions menus. A second module toolbar contains the governing context for the active tab: Route plus Actions; Trips Route/Day/Direction; Blocking Route/Trip Profile/Blocking Scenario/Day plus Actions; or Costing Blocking Scenario/derived Trip Profile/View year plus Actions. Day, direction, selected Blocking Scenario, and selected year are non-authoritative workspace context. The storage model supports more than one of each. Trips selects one scenario-wide Trip Profile and one Blocking Scenario; its Block pills and multi-select Actions can assign, move, or unassign Trips only within that selected Blocking Scenario and service day. Blocking keeps Route visible as candidate scope while Blocks remain Scenario-owned for future interlining. Decision 0028 records the toolbar and Route-duplication rules.

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

Runtime segment durations are parsed from decimal minutes, standard `MM:SS`, or the displayed `:MM` / `:MM:SS` forms into integer seconds and formatted as `:MM` or `:MM:SS`. A runtime profile carries a calculation revision. Band-bound or segment-duration changes increment that revision; a profile rename or a band label change does not. Existing trips record the profile and revision used for their current times, and Package 2R-C provides explicit recalculation against that source. A deterministic route edit moves a Trip to the rebalanced profile's revision only when the Trip was current and the rebalanced profile calculates its times; otherwise the Trip stays stale (Decision 0014 addendum). For legacy or imported trips without runtime-source metadata, staleness is inferred by comparing saved timepoints with the current assigned profile's calculated timepoints. Trips whose times differ are flagged; recalculating an unverified source requires confirmation. See Decision 0030.

Every Runtime profile of a Route uses one calculation method (Decision 0045), so one Trips table never mixes methods. The method stays stored on each profile; the application keeps a Route's profiles in agreement (`setRouteRuntimeCalculationMethod`, and `saveRuntimeProfile` applies a method change to the whole Route), and the Route's method is derived by `routeRuntimeCalculationMethod`. Runtime **Actions > Method (all Patterns on this Route)** changes it after a confirmation that states how many profiles change and how many Trips will be marked as having changed run times. Dexie version 9 and JSON backup import unify Routes whose profiles disagree to the method most of them use. Runtime paste and Runtime profile CSV import were removed; Runtime Actions export the selected profile as CSV (output only).

Two Runtime profile actions share segment values between the Patterns of one Route (Decision 0049, `src/domain/segmentRuntimeMatching.ts`). **Copy segments to other patterns…** replaces the matching cells of other Patterns' profiles with the open profile's values. **Fill from other patterns…** writes only the open profile's `:00` cells. A segment matches by its ordered node pair, a profile qualifies by sharing a Service day assignment, and a band matches only with the same start and end time. Matching is derived from stored profiles and is never stored, so Runtime storage, the backup schema, and the Dexie schema do not change. Each action previews its cell changes, writes in one transaction, raises each changed profile's calculation revision (saved Trip times are not rewritten), and keeps one in-memory undo.

Runtime bands are continuous half-open intervals: start time is inclusive and end time is exclusive. A label covering disjoint periods must use separate bands. For example, off-peak service from 04:00-06:00 and 22:00-26:00 uses two bands.

New profiles default to band-at-segment-start calculation: each segment uses the runtime band containing its departure time. Existing profiles without an explicit method retain legacy single-band behavior, where the trip's initial departure selects the band for the full trip. Profiles may also retain the legacy continuous blend method, which integrates progress at each band's segment runtime rate. For blending, gaps use the nearest adjacent band's rate while a trip is in motion; the first and last bands extend beyond their outer bounds for trips that started within a defined band. Changing the method increments the profile's calculation revision and marks existing trips stale until explicit regeneration. The optional Trips band view derives segment contributions from saved times and the current profile; it omits shading when those times do not match the profile. See Decision 0035.

Pattern-specific profiles are an initial simplification. The application should provide copy and reverse-copy operations. Shared segment defaults or pattern overrides may be considered after the first runtime implementation is evaluated.

## Trip Generation Model

Phase 2R replaces saved generation sets with transient additive generation requests. A request contains a pattern, First Trip, Headway, and exactly one generation limit: a Number of Trips or an inclusive Last Trip (Decision 0010). It validates and creates ordinary trips but is not retained as authoritative data. Package 2R-C exposes this through `previewGenerateTrips` and `generateTrips`; no generation-set row is created by either command.

A request is limited to 500 Trips, whether it ends by Number of Trips or by Last Trip. Each trip stores its ordered scheduled times, creation method, and runtime-profile calculation source used to produce them. Runtime changes do not silently alter trips. Users explicitly recalculate selected trips while retaining their trip IDs and block references. The regeneration review defaults to each trip's first departure and permits a different saved timepoint anchor per trip. Each anchor list holds only its chosen point until the planner opens it, and the review reads each Pattern's runtime source once, so a 500-Trip review stays under one second. The domain resolves a runtime band consistent with the resulting first departure and rejects missing or ambiguous solutions; under segment-start and blended profiles, an anchor that more than one first departure satisfies is rejected and the candidates are listed (Decision 0031 addendum). The preview derives layover changes to adjacent Block Trips after assigned deadhead and warns about newly overlapping departures without blocking regeneration. The application rechecks selected and adjacent Trip data before applying the review. Recalculation requires impact confirmation when it would overwrite manual changes or affect blocks. A single-Trip Pattern change review is signed over the Trip, the target Pattern, and the target profile and is rejected at commit when any of them changed. One successful recalculation can be undone from Trips Actions, through an **Undo last regeneration** item that is separate from **Regenerate selected…** and listed only while the saved undo applies to the visible schedule (`regenerationUndoApplies`, Decision 0046). The one-step undo survives reload, is replaced by the next recalculation, and expires when an affected Trip changes or is removed. It is local operational data and is not included in project JSON backups. Additive generation and Add Trip use atomic trip-only inserts; pattern changes and recalculation use atomic trip-change writes. A staged Shift that would move any scheduled time before 0:00 is refused in the preview, and a Shift of zero seconds changes no Trip.

The Trips table shows only the Direction timepoint columns where at least one displayed Trip has a time (`columnsWithTimes` in `src/application/tripsWorkspaceView.ts`); with no Trips, or while a draft Trip row is open, every column is shown (Decision 0048). Trips Actions export the currently displayed schedule as CSV (output only; Decision 0044). The file mirrors the Trips table: Direction, Pattern name, one column per Direction timepoint named as the table names it (so overlaid Patterns share columns; a timepoint no Trip has a time at is left out, Decision 0048), Run Time, Layover, Deadhead, Next Trip, and Block. It contains no Trip, Pattern, or Pattern-point IDs, and the Trips CSV import was removed. CSV is not a full project backup. The Trips page scrolls vertically as a normal page; there is no nested vertical scroll area. While the grid is in view and its real column headings have scrolled above the viewport, a fixed duplicate heading row is shown at the top of the page, with column widths and horizontal scroll position matching the grid (Decision 0035 item 5). Committing a staged Trip shift restores both page and table scroll positions. See Decision 0035.

The schedule selects one service day and direction and interlaces trips from every pattern in that direction. When multiple patterns share a direction timetable column, rows are ordered by the earliest shared column (the first common timepoint in the direction); when no common column exists, the first scheduled time is used. Direction columns provide the stable timetable layout, and patterns that omit a column display an empty marker.

### Trip-profile boundary

A Trip profile is one scenario-wide timetable alternative spanning all Routes and service days. It owns Trips but does not own Runtime profiles or assignments. Each Trip retains its runtime calculation source as provenance. Copying a Trip profile duplicates its Trips with new IDs and no Blocks. Future Blocking scenarios select exactly one Trip profile, preventing competing timetable alternatives from being combined while preserving multi-route interlining. See Decision 0016 and the Phase 2TP plan.

## Service-Day Model

Weekday, Saturday, Sunday, and holiday are separate service-day definitions. Each contains an editable annual service-day count. Phase 3 separates Runtime copying from Trip copying. Both are target-first and route-scoped. Runtime copy covers every usable Pattern and defaults to independent profiles, with explicit sharing available. Trip copy operates within one Trip profile, includes both Directions, replaces the target Day's Trips, and does not copy Blocks. See Decision 0017.

Operating spans and observed headways are derived from authoritative trips. The application does not retain duplicate operating-span or generation-rule records after additive generation.

## Blocking Model

A Blocking Scenario is one named arrangement of an immutable source Trip Profile across all service days. A Block belongs to one Blocking Scenario and one service day and is an ordered collection of activities. Initial activity types are:

- pull-out;
- revenue trip;
- manual deadhead;
- pull-in.

Layover is derived from the available time between consecutive revenue movements after any manual deadhead. It is not stored as an independent authoritative activity. Empty Blocks are valid. Pull-out is optional and first; pull-in is optional and last; one manual deadhead is permitted between consecutive revenue Trips. New and edited pull-out and pull-in activities store non-negative whole-minute offsets from the first and last revenue Trips; their resolved boundary times and platform hours update when those Trips change. Legacy explicit boundary times remain readable.

The first blocking release supports manual trip assignment and unassignment, manual deadhead, and manual pull-out and pull-in. Running Time sums scheduled revenue-Trip durations; Revenue hours add known usable layover between revenue Trips. Deadhead and boundary activities remain excluded from Revenue hours. It reports:

- overlapping trips;
- negative layover;
- location discontinuity without deadhead;
- deadhead that does not fit in the available gap;
- a deadhead with explicit clock times (a legacy or imported shape) that lies outside the gap between its two Trips, which is reported as misplaced and leaves that connection's layover uncounted;
- an explicit pull-out that ends after the first Trip starts, or an explicit pull-in that starts before the last Trip ends (boundary overlap);
- missing pull-out or pull-in data required for platform hours.

Structural ownership, reference, duplicate-assignment, and malformed-time violations reject writes. Structurally valid but operationally infeasible Blocks remain saved with visible findings. Selected-day subtotals include valid Blocks; Block-level status and findings identify incomplete or infeasible work.

The Blocking rules sit in `src/domain/blocking.ts` and are reached through `BlockingApplicationService`; `BlockingWorkspace.tsx` presents their results. The service lists the unassigned Trips of the Route and service day, adds an activity in its place (pull-out first, pull-in last, deadhead after its Trip), moves a Trip with its deadhead, applies a deadhead to every matching connection, reads typed minutes and miles (a blank minutes field or a blank minimum-layover amount is refused, never read as 0), proposes the first free "Block <n>", and previews the impact of deleting a Block or a Blocking Scenario (the preview's `sourceSignature` is the review token the deletion takes). Block summaries carry Layover %. A Block label must be unique within its Blocking Scenario and service day (Decision 0039).

The initial Blocking UI filters candidate Trips by one selected Route and does not intentionally create multi-route Blocks. The data model remains scenario-wide. Existing or imported multi-route Blocks remain fully visible, and Route filtering never truncates their activities.

Candidate compatibility may apply a UI preference for minimum layover (Decision 0042): either fixed minutes per connection or a percentage of the preceding Trip's revenue runtime. The pure Blocking classifier evaluates the preference; it does not become authoritative Block data. Persisted Block summaries continue to derive actual layover and deadhead hours from activities and Trip times. Deadhead hours include pull-out, pull-in, and between-Trip deadhead durations; layover remains separate.

## Summary and Cost Model

Initial service quantities are:

- running time: sum of scheduled revenue-trip durations, excluding layover;
- revenue hours: running time plus usable layover time between revenue Trips;
- platform hours: resolved block pull-in time minus resolved block pull-out time;
- revenue miles: sum of pattern miles for revenue trips when distances are complete. A Pattern whose total distance is 0 has no distance entered, so its miles are incomplete and are never counted as 0;
- annual quantities: daily quantities multiplied by annual service-day counts.

Phase 5 uses one Scenario-owned set of Costing assumptions, not multiple named Costing scenarios. A selected Blocking Scenario supplies eligible Revenue and Platform Hours; the initial cost multiplier is manually entered USD operating cost per Revenue Hour. Platform Hours are displayed but are not separately multiplied or added. The source rate year is adjusted automatically to the service year using an editable annual escalation assumption, defaulting to 3%. The horizon is the base year plus up to ten future years. Annual quantities use stored service-day counts. A count is a whole number of 0 or more, and the counts of all service days must total at most 365: an edit that would raise the total above 365 is refused with a field finding, not clamped, and a total above 365 saved earlier makes the estimate invalid until it is corrected (Decision 0041). The UI shows one Blocking Scenario at a time through a selector, without a cross-scenario comparison table. Detailed eligibility, lifecycle, and export rules are in `docs/implementation/phase-05-costing.md`.

## Validation

Validation returns structured findings rather than formatted strings. Every module reports the one `ValidationFinding` shape: a rule identifier (`ruleId`), severity, an optional category (`structural` or `operational`), an entity type and id, an optional field, a message key, and message parameters. Route, Pattern, Blocking, and Costing findings all use it. A Costing finding names the Scenario, the assumptions, the Service day, the Trip, or the Block that it is about; a finding about assumptions names the field. A Blocking operation that a structural rule refuses (for example an invalid Block, a Trip outside the Blocking Scenario's service context, or a taken Blocking Scenario name) throws a `BlockingValidationError` whose `findings` carry the rule and entity, and whose `message` is the text screens show.

Acknowledgment of a warning is still planned and is not part of the finding: no code reads or stores an acknowledgment, and no table has a field for one. When acknowledgments are built, they will be stored separately and keyed by `ruleId` and entity, so a finding stays a derived value (`docs/data-schema.md`, "Validation result").

Errors prevent an operation when the resulting data would be unusable. Warnings allow confirmation or later correction. Acknowledging a warning does not remove the underlying condition.

## Persistence, Backup, and Export

IndexedDB is the working store. Writes that touch several records run in one transaction and read the data they depend on inside that transaction, so an older in-memory copy cannot overwrite newer stored work (Decision 0036). The first-visit provisioning of a Pattern's Default Runtime profile and its Service day assignments is one such transaction, so two overlapping calls store one profile (Decision 0041). It is local to a browser profile and device and does not provide synchronization or automatic cloud backup. Dexie version 6 adds a local one-step Trip-regeneration undo store. Undo state is operational and excluded from project JSON backup and restore. Dexie version 7 changes no store; it repairs the Node references of Scenario copies made by earlier versions (Decision 0038). Dexie version 8 adds the `[scenarioId+tripProfileId]` index on `trips` (the Trips of one Trip Profile are read through `listTripsForScenarioProfile` without loading the Scenario's other Trips) and deletes the placeholder Blocks that have no Blocking Scenario, which imports of version 3 and 4 backup files stored before package P04; the JSON export schema stays 6. Dexie version 9 changes no store; it gives every Runtime profile of a Route the Route's one calculation method (Decision 0045).

The first usable application must include:

- versioned database migrations;
- versioned JSON project export and import for complete backup and restore;
- validation before import;
- CSV exports for user-facing tabular data;
- visible local-save status.

CSV is not a complete backup format because it cannot reliably preserve every relationship and setting.

CSV rules (`src/persistence/csv.ts`, one set for every writer):

- A field with a comma, a double quote, LF, CR, or CRLF is quoted; header cells follow the same rule, so a Pattern or Node name with a comma or a quote cannot break the Trips CSV. The Runtime profile CSV uses the same escaper.
- A free-text cell (a name, label, or note) that begins with `=`, `+`, `-`, or `@` is written with an apostrophe in front, so a spreadsheet shows text instead of running a formula. A value that already begins with apostrophes before such a character gets one more, so `restoreFormulaText` can recover every value exactly; no importer currently calls it, because the Trips and Runtime profile CSV files are output only (Decisions 0044 and 0045). Identifiers, times, and numbers are never changed. Each serializer names its free-text columns, and a test exercises every serializer to confirm that only those columns are protected (decision 5). A new CSV importer must remove the leading apostrophe with `restoreFormulaText` from the same columns that the matching writer protects, or its values will not round trip.
- The Trips CSV (`src/application/tripTableCsv.ts`) and the ZIP writer (`src/application/csvDownload.ts`) live in the application layer. `src/ui` imports nothing from `src/persistence`; the interface reads the escaping rules through `src/application/csvText.ts`, and a test fails on any import of `src/persistence` from `src/ui` (decision 12; OV-TECH-03 is unchanged).

The visible save status covers every write: the Route, Trips, Blocking, and Costing services publish saving, saved, and failed through one `SaveStatusPublisher`. A write that fails because the browser store is full is reported as "Browser storage is full. Export a backup, then free space." After the first successful save the application asks the browser once to keep the store (`navigator.storage.persist()`) and records the answer, and it records the time of the last JSON backup export. Both are device-local facts kept beside the selection preferences, never in a backup, and available to the screen through the `LocalDataProtectionQueries` port. GitHub Pages shares one origin, and therefore one browser store, among every site of the account (Decision 0001, amendment of 2026-10-23).

Only one browser tab at a time may write the database. The first tab holds a Web Locks lock (with a `BroadcastChannel` election as fallback); later tabs are read-only and every write they attempt is rejected with a plain message. The check is a Dexie middleware in `TransitDatabase`, so it covers every repository. A tab whose database was upgraded by another tab closes its connection and becomes read-only. The read-only status is available through `SessionStatusQueries`; the screen shows it in the notice banner ("This project is open in another tab. This tab is read-only.") and in the header, and it shows the time of the last JSON backup under the Project menu's "Backup project JSON" item, from `LocalDataProtectionQueries`. Every failure the screen reports goes through one filter (`src/ui/errorMessages.ts`): application wording is shown as written, and browser, Dexie, or runtime wording and raw message keys are replaced by a plain sentence with a next step. Because there is one writer, stale-source checks that run before a write transaction are acceptable. See Decision 0037.

## UI Structure

Primary navigation is:

```text
Route | Trips | Blocking | Costing
```

The interface revision (Phase UR, Decision 0047) sets the structure every screen follows. `docs/ui-conventions.md`, section "Interface revision", holds the details.

- **Header (H-B).** Row 1 holds the application name, the four tabs, and the local-save status with the backup age. Row 2 (the scope bar) holds the Project and Scenario switchers, which are menus that also hold each level's lifecycle actions, then the active tab's scope selectors. Row 2 never wraps at 1024 px or wider: the switcher captions drop first, then the names truncate.
- **Surface levels.** A level 1 work surface is the panel the planner works in, with its actions in its header and at most one primary button. A level 2 supporting panel holds context and summaries. A level 3 inline note is one line of status. The components are in `src/ui/shared/`.
- **Save rule.** A standalone field saves when it is committed. A table or grouped form (Nodes, Pattern, Runtimes, Costing assumptions) collects edits and shows a save bar at the bottom of its panel while it has unsaved edits. Impact reviews and navigation guards are unchanged.
- **Grid.** Editable tables (Runtimes, Nodes, Pattern points) are spreadsheet grids driven by `useGridNavigation`: arrow keys move, Enter commits and moves down, Tab commits and moves right, and edited cells are marked until saved. Parsing stays in the domain parsers.
- **Selection.** Actions on selected rows are in a selection bar. Selection criteria (by Pattern, by status, invert) are pure functions in `src/application/tripSelection.ts`; headway change markers are computed in `src/application/tripsWorkspaceView.ts`; save-bar change counts in `src/application/draftChangeCounts.ts`.
- **Short names.** The Trips and Blocking tables show Pattern and Node short names: the planner's entry when there is one, otherwise a name generated by `src/application/shortNames.ts`. Generated names are display-only and never stored.
- **Styling.** `src/ui/styles/tokens.css` defines every colour and the type, spacing, and radius scales; the other stylesheets in `src/ui/styles/` use the tokens. Source Sans 3 is bundled. Screens format numbers through `src/ui/format.ts`; CSV and backup formats do not use it and are unchanged.
- **Minimum width.** Every layout works at 1024 px and wider. Below 1100 px the Route panels and the Blocking panels stack.
- **Files.** `src/ui/App.tsx` holds the shell state and composes `src/ui/shell/` (header), `src/ui/route/`, `src/ui/trips/`, `src/ui/blocking/`, and `src/ui/costing/`.

Tables must be compact, functional, and suitable for repeated editing. Detailed UI decisions belong to a distinct UI/UX work package and must not be established by structural implementation. Select Luna for tightly specified UI wiring that reuses established components; select Sol for novel or complex UX judgment, as described in `codex.md`.

## Structural and UI/UX Work Separation

Each implementation phase should be divided when both types of work are present:

1. a structural package recommended for Luna;
2. a verification gate and user review;
3. a UI/UX package recommended for Luna only when the solution is simple, established, and precisely specified, or for Sol when it requires novel or complex UX judgment;
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

The Phase 2R replacement workflow is complete and accepted through its later corrective, Trip-profile, service-day, and unified-action-layer integration records. The safe route-editing corrective package is implemented and user-accepted. It stages Node and Pattern changes, reconciles direction columns from all Patterns, preserves deterministic runtime and trip changes, and resets only a changed Pattern's dependent service when required. Phase 2TP Trip profiles are implemented and user-accepted. The historical 2R-D and 2R-E gates are closed by that subsequent integration work.

### Phase 2TP: Trip profiles (implemented and accepted)

Add scenario-wide timetable alternatives, scope every Trip and Block to one alternative, and establish the input boundary for future Blocking scenarios. Runtime profiles and assignments remain shared calculation inputs rather than timetable ownership.

Implementation plan: `docs/implementation/phase-02tp-trip-profiles.md`.

### Phase 3: Service-day editing workflows

The plan was rewritten on 2026-09-14 for separate route-scoped Runtime and Trip copy operations plus authoritative batch Trip editing. Phase 3 is implemented and accepted through Package 3C. Historical generation sets remain supported only for legacy backup compatibility and do not participate in Phase 3 commands. Phase 4 has since been implemented and accepted; see its closeout.

Rewritten implementation plan: `docs/implementation/phase-03-service-day-workflows.md`.

### Phase 4: Manual blocking

Add named Blocking Scenarios, ordered Block activities, manual assignment and atomic reassignment, deadhead, pull-out and pull-in, conflict validation, completeness-aware summaries, persistence, backup, CSV, and accessible Blocking and Trips-context interfaces.

Approved revised implementation plan: `docs/implementation/phase-04-manual-blocking.md`. Decisions 0019 through 0026 define ownership, lifecycle, calculations, Route scope, migration, exports, timing, Trips-table assignment, and Revenue-hour semantics. Phase 4 was accepted through Package 4D on 2026-09-22; see `docs/implementation/phase-04-closeout.md`.

### Phase 5: Costing

Add annual service quantities, a Revenue-Hour-based cost estimate, user and NTD source metadata, rate-year adjustment, future-year escalation, and a Blocking-Scenario selector. Platform Hours are shown but are not a second cost basis. Packages 5A through 5C implement pure calculations, Scenario-owned assumptions persistence, versioned backup, CSV/ZIP report files, and the Costing workspace. The review replaces integration Package 5D; user acceptance remains. Decision 0027 records the accepted basis, assumption ownership, forecast defaults, and selector-only UI. The preliminary `CostPlan` shape has been replaced in the domain contract; its unused database table remains inert for data preservation.

### Phase UR: Interface revision (implemented and accepted)

Replace the visual system and the screen layouts without changing domain, persistence, or CSV behaviour: design tokens and a bundled Source Sans 3, a two-row header, three surface levels, a unified save bar, spreadsheet-style grids, collapsible Runtimes, headway trip identification, selection by Pattern, and a Blocking layout whose Unassigned panel collapses to a rail. Decision 0047 records the design; `docs/implementation/ui-revision-plan.md` holds the packages, and `docs/implementation/ui-revision-closeout.md` records the integration review. The "UI Structure" section above describes the result.

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
- Full Excel schedule and workbook import, and spreadsheet paste or CSV import of Runtime bands (removed by Decision 0045).

Resolve each item through a decision record before implementation.
