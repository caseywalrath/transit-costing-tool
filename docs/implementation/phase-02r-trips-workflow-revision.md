# Phase 2R Implementation Plan: Trips Workflow Revision

## Status

Approved for implementation planning on 2026-09-11. The Phase 2R replacement workflow is implemented and accepted through the subsequent safe-route-editing, Trip-profile, Phase 3, and Phase 3R integration records. The package-level 2R-D and 2R-E gates are closed by that later acceptance work.

This revision supersedes the generation-set-centered portions of the accepted Phase 2 implementation. The existing Phase 2 code remains the running implementation until the packages below replace it.

The package descriptions below are retained as the historical implementation record. Their original package gates and recommendations are superseded by the completed safe-route-editing, Trip-profile, Phase 3, and Phase 3R records.

## Objective

Replace the current Trips-tab workflow with a direct transit-scheduling workflow organized as:

```text
Service
  Day -> Direction -> Pattern -> Runtime profile

Runtimes
  Time periods x pattern segments

Trips
  Build Trips | Add Trip
  Directional timetable containing all patterns in departure order
```

The workflow must prevent missing prerequisites through visible context, disabled actions, direct next-step guidance, and automatic defaults. Routine setup problems must not first appear as global errors after submission.

## Accepted decisions

1. Trips are the authoritative saved schedule records.
2. A Generate Trips request is transient. First Trip, Headway, and Last Trip are not saved as a generation set after the trips are created.
3. Generation is additive. It never replaces existing trips and may interlace new trips with existing trips.
4. Existing trips remain unchanged when a runtime profile changes. The user must explicitly recalculate selected trips.
5. Initial generation does not require a trip preview. Destructive recalculation and future service-day replacement still require an impact confirmation when manual changes or block references are affected.
6. Each route has application-managed Outbound and Inbound groups. Every pattern belongs to exactly one group.
7. Each group has an authoritative internal ordered set of timetable columns. Patterns map their pattern points to those columns. A pattern may omit columns.

> Revision: the Route screen assigns a pattern to Outbound or Inbound and exposes its optional `Label`; it does not expose direction or column setup. See Decision 0011.
8. The schedule shows one selected service day and direction. It interlaces trips from every pattern in that direction.
9. A runtime profile remains pattern-specific. The selected service day and pattern resolve one assigned runtime profile.
10. A pattern receives a `Default` runtime profile without requiring the user to create or name a profile first. The initial Default may be shared by multiple service days.
11. The interface visibly identifies which service days use a selected shared profile.
12. Service days always appear in this order: Weekday, Saturday, Sunday, Holiday. This order is centralized and reused by every interface and export where the four standard days are compared.
13. Runtime segment-duration fields accept decimal minutes (`7`, `07`, or `7.5`), standard `MM:SS` (`7:30`), and the displayed `:MM` / `:MM:SS` forms (`:07` or `:07:30`).
14. Runtime segment durations remain integer seconds internally.
15. An Add Trip row requires a pattern and one initial time. The application resolves the applicable runtime profile and calculates the remaining timepoints.
16. The Pattern control is the leftmost visible schedule column. A pattern change preserves the trip's first time, resolves the new pattern's assigned profile, and recalculates the row.
17. Exact duplicate trips are allowed. An exact duplicate means the same service day, pattern, and first time. It produces a nonblocking possible-duplicate indication. Trips on different patterns may begin at the same time without a duplicate indication.
18. Phase 2 draft data and backups do not require backward compatibility. Schema work may remove generation-set records and obsolete provenance fields without migrating current draft schedule data.

## Reference behavior

The `WK Times` sheet in `Federal Blvd Service Plan 11-20-2024.xlsx`, especially cells `C4:M142`, illustrates the target schedule relationship:

- one direction-level set of ordered timepoint columns;
- multiple trip patterns in the same direction;
- trips interlaced in chronological order at the first common timetable point (falling back to initial departure when patterns have no common point);
- an empty marker where a pattern does not serve a timepoint;
- a compact grid intended for schedule review rather than record-by-record expansion.

The workbook is evidence for the relationship and terminology. It is not a literal visual specification.

## Target domain behavior

### Directions and timetable columns

Add a route-owned direction model. A recommended structural shape is:

```typescript
interface RouteDirection extends EntityMetadata {
  id: EntityId;
  scenarioId: EntityId;
  routeId: EntityId;
  name: string;
  sequence: number;
  columns: DirectionTimepointColumn[];
}

interface DirectionTimepointColumn {
  id: EntityId;
  nodeId: EntityId;
  sequence: number;
  labelOverride?: string;
}
```

`RoutePattern` must reference one `directionId`. Each `PatternPoint` must map to a direction column using a stable direction-column identifier. This explicit mapping is required because a loop may visit the same node more than once.

Direction-column order is authoritative for schedule presentation. Pattern-point order remains authoritative for runtime propagation. Validation must report incompatible or duplicate mappings without embedding user-facing prose in domain code.

### Runtime profiles

Retain complete pattern-specific runtime profiles. Do not introduce shared segment inheritance in this revision.

Provide an application command that ensures a usable pattern has a Default profile and runtime assignments. It must be idempotent. The UI must not create persistence records directly.

The initial Default profile may be assigned to Weekday, Saturday, Sunday, and Holiday. Editing a shared profile intentionally affects every assigned day. The UI must show those assignments before the user edits the table.

Deleting a profile must not leave a service day and pattern without an assigned profile. The application layer must either reject deletion with structured replacement requirements or apply an explicitly selected replacement in the same transaction.

### Runtime duration parsing and formatting

Create pure duration utilities separate from service-clock parsing.

Accepted examples:

| Entry | Stored seconds | Display |
| --- | ---: | --- |
| `5` | 300 | `:05` |
| `5.5` | 330 | `:05:30` |
| `5:30` | 330 | `:05:30` |
| `12` | 720 | `:12` |
| `75:15` | 4,515 | `:75:15` |

Rules:

- trim surrounding whitespace;
- a value without a colon is decimal minutes;
- standard `MM:SS` notation is accepted, and the display notation `:MM` / `:MM:SS` is accepted as the same stored duration;
- seconds in colon notation must be from `00` through `59`;
- decimal-minute results are rounded to the nearest integer second;
- negative values, nonnumeric values, nonfinite values, and more than one colon are invalid;
- blank and zero remain distinct;
- omit the seconds component when it is zero;
- use at least two minute digits in display, but do not cap minutes at 59;
- runtime-band From and To fields continue to use the 24-plus service-clock parser rather than the duration parser.

### Transient generation

Replace saved `TripGenerationSet` behavior with a transient command:

```typescript
interface GenerateTripsRequest {
  scenarioId: EntityId;
  routeId: EntityId;
  serviceDayId: EntityId;
  patternId: EntityId;
  firstTrip: ServiceSeconds;
  headwaySeconds: DurationSeconds;
  lastTrip?: ServiceSeconds;
  tripCount?: number;
}
```

The application service must:

1. validate the request;
2. resolve the pattern's runtime profile for the selected service day;
3. validate that every proposed departure has an applicable runtime band;
4. materialize every trip and scheduled point;
5. detect possible exact duplicates without preventing creation;
6. insert the complete generated group atomically;
7. leave all existing trips and blocks unchanged.

No partial trip group may be written when one proposed departure cannot be calculated.

Exactly one of Last Trip and Number of Trips is required. Last Trip is inclusive when it falls exactly on the headway sequence. A request is invalid when Last Trip is earlier than First Trip, Number of Trips is not a positive whole number or exceeds 500, or the headway is not positive.

### Authoritative trips and calculation source

Each trip stores its pattern, scheduled points, creation method, and the runtime-profile calculation source required to determine whether its displayed times were calculated from the current runtime data.

The structural package must define a calculation revision that changes when runtime bands or segment durations change but does not change for a profile rename. A trip records the profile ID and calculation revision used for its current scheduled points.

A runtime edit does not alter trips. A query may identify trips calculated with an earlier runtime revision so the interface can offer Recalculate without treating the state as invalid.

### Add Trip

Add an application command that accepts:

- scenario, route, service day, and direction context;
- a pattern belonging to the selected direction;
- one first-trip time.

The command resolves the assigned runtime profile, propagates all pattern times, creates one trip, and returns any possible-duplicate finding. It must not require a generation set.

### Pattern changes

Changing the Pattern value on an existing trip must:

1. preserve the trip's first scheduled time;
2. require the target pattern to belong to the currently displayed direction;
3. resolve the target pattern's assigned runtime profile for the trip's service day;
4. recalculate the complete row;
5. retain the trip ID;
6. return structured impact information for future block validation.

The operation must not be partially applied.

### Recalculation

Recalculate operates on explicitly selected trips. It preserves each trip's ID, service day, pattern, and first time, then replaces its remaining scheduled times using the currently assigned runtime profile.

The application must produce an impact result before a destructive write when selected trips contain manual shifts or block references. A simple no-impact recalculation may proceed directly. The domain and application layers, not React, determine whether confirmation is required.

### Schedule ordering

The combined schedule query returns trips ordered by:

1. first scheduled time;
2. pattern sequence within the direction;
3. stable trip creation order or ID as the final deterministic tie-breaker.

Overlapping trips and identical first times are valid schedule data.

## Scope

### Included

- direction entities and ordered timetable columns;
- pattern-to-direction and pattern-point-to-column relationships;
- centralized service-day ordering;
- Default runtime-profile provisioning and safe profile lifecycle commands;
- flexible runtime-duration parsing and formatting;
- transient additive trip generation;
- direct Add Trip behavior;
- authoritative trip records without generation-set ownership;
- explicit selected-trip recalculation;
- same-direction pattern changes;
- exact-duplicate findings;
- revised persistence, JSON backup, scenario duplication, and CSV output;
- Route and Trips UI required to support the target workflow;
- removal of generation-set and materialized-schedule terminology from the interface.

### Excluded

- automatic blocking;
- minimum-layover rules;
- arbitrary editing of downstream timepoint cells;
- arrival and departure pairs at one timepoint;
- drag-and-drop trip ordering;
- cross-direction pattern changes within a timetable row;
- runtime inheritance between patterns;
- import of existing Excel schedules;
- support for Phase 2 draft backups or preservation of Phase 2 draft trip data.

## Work-package sequence

```text
2R-A Decisions and implementation plan — Primary agent — complete
  -> user approval recorded
2R-B Direction, runtime, and ordering foundations — Luna recommended — complete
  -> structural verification and user gate recorded
2R-C Authoritative trip commands and persistence replacement — Luna recommended — complete
  -> structural verification and user gate recorded
2R-D Route and Trips workflow UI/UX — Terra required
  -> hands-on verification and user gate
2R-E Integration and Phase 2 revision acceptance — Primary agent
```

No package automatically begins the next package.

## Package 2R-A: Decisions and implementation plan

### Responsibility

Primary agent.

### Result

Completed on 2026-09-11. The user accepted the recommended direction, trip-authority, runtime-profile, service-day ordering, Add Trip, and duplicate policies and specified the flexible duration-entry and draft-row interactions recorded above.

## Package 2R-B: Direction, runtime, and ordering foundations

### Recommended model

Luna.

This package is structural. It must not choose layout, styling, focus behavior, color, component placement, or other UX behavior.

### File ownership

- direction and pattern types and pure commands under `src/domain/`;
- runtime-duration utilities and tests;
- service-day ordering utility and tests;
- route/runtime application ports and services;
- direction/runtime repository methods and persistence schema;
- backup, duplication, and CSV changes directly required by these entities;
- relevant schema, glossary, and decision documentation.

Do not modify `src/styles.css` or establish Route/Trips layouts in React.

### Deliverables

- Add stable route directions and ordered direction columns.
- Require every usable pattern to reference one direction.
- Map each pattern point to one direction column.
- Validate route, direction, column, pattern, node, and pattern-point references.
- Support repeated visits to the same node through distinct direction-column IDs.
- Add deterministic direction and pattern sequencing.
- Centralize Weekday, Saturday, Sunday, Holiday ordering.
- Implement flexible runtime-duration parse and format utilities exactly as specified.
- Add runtime-profile calculation revisions.
- Add idempotent Default-profile provisioning and initial assignments.
- Add profile rename and safe-delete/replacement commands.
- Permit a clean persistence-schema replacement because Phase 2 draft compatibility is not required.
- Remove backup and CSV assumptions that require generation sets where necessary to keep this package compiling.

### Tests

- custom direction names and deterministic ordering;
- two patterns assigned to one direction;
- one pattern omitting direction columns;
- loop pattern mapping two visits to the same node to distinct columns;
- invalid cross-route and missing-column references;
- all duration examples and invalid boundaries;
- blank versus zero duration;
- profile rename without calculation-revision change;
- runtime-band or segment change with calculation-revision increment;
- idempotent Default provisioning;
- shared Default assignments across all four standard days;
- safe profile deletion with assigned-day replacement requirements;
- service-day sorting from arbitrarily ordered records.

### Gate

Run focused tests and TypeScript typechecking. Demonstrate the Federal Boulevard-style relationship with two Southbound patterns mapped to one direction-column set. Pause before Package 2R-C.

### Package 2R-B closeout (2026-09-11)

Implemented in the structural layer:

- route directions, ordered timetable columns, pattern direction ownership, and stable pattern-point column mappings;
- repeated-node mapping by occurrence so loop visits remain distinct;
- direction-aware validation, persistence, backup cloning/validation, and CSV serializers;
- canonical service-day sorting;
- decimal-minute and `MM:SS` runtime-duration parsing/formatting with blank-versus-zero semantics;
- runtime calculation revisions and trip runtime-source fields;
- idempotent Default-profile provisioning for the four standard service days;
- explicit profile rename and safe-delete/replacement commands.

Verification: TypeScript typechecking passed; Vitest passed 75 tests across 14 files. No React layout, CSS, focus, keyboard, accessibility, or other UX decisions were made. Package 2R-C followed this historical structural gate; Package 2R-D was the subsequent Terra UI package.

## Package 2R-C: Authoritative trip commands and persistence replacement

### Recommended model

Luna.

This package is structural. It must expose complete behavior-oriented ports for Terra and must not implement table layout or interaction design.

### File ownership

- trip types and pure commands under `src/domain/`;
- trip application ports and services;
- trip and block repository transactions;
- Dexie schema replacement;
- backup, duplication, import validation, and CSV serializers;
- deterministic domain, application, and persistence tests;
- removal of obsolete generation-set code after references are replaced.

Do not change visual styling or make interaction decisions.

### Deliverables

- Remove `TripGenerationSet` as an authoritative entity and repository table.
- Replace generation-set provenance with trip creation and calculation-source data.
- Implement validation-only preflight for transient Generate Trips requests.
- Insert generated trip groups atomically without replacing existing trips.
- Implement Add Trip.
- Implement exact-duplicate findings as warnings.
- Implement same-direction pattern change with stable trip IDs.
- Implement selected-trip recalculation and impact reporting.
- Preserve block references when a surviving trip ID is recalculated.
- Keep generation and recalculation rules outside React and Dexie.
- Replace the backup schema without requiring readers for Phase 2 draft backups.
- Update scenario duplication and import validation for directions, direction columns, runtime revisions, and authoritative trips.
- Remove generation-set CSV output and retain trips and scheduled-point outputs.
- Support at least 500 trips for one service day.

### Tests

- inclusive First Trip through Last Trip generation;
- decimal and `MM:SS` headway conversion through the shared duration utility;
- additive interlacing of two patterns;
- two different patterns with the same first time;
- exact same-pattern/same-time duplicate warning without rejection;
- all-or-nothing rejection when one departure falls in a runtime gap;
- Add Trip runtime resolution and propagation;
- pattern change using the target pattern's assigned profile;
- preservation of trip ID during pattern change and recalculation;
- stale runtime revision identification without automatic trip mutation;
- recalculation impacts for manual shifts and block references;
- atomic persistence failure behavior;
- backup, import-as-copy, and scenario duplication round trips;
- deterministic CSV output with 24-plus times;
- 500-trip query and ordering exercise.

### Package 2R-C closeout (2026-09-11)

Implemented in the structural layer:

- transient `GenerateTripsRequest` validation and inclusive First Trip through Last Trip generation;
- additive, atomic authoritative trip insertion with exact-duplicate warnings and no partial writes when a runtime gap is encountered;
- direct Add Trip using the selected pattern's service-day runtime assignment;
- authoritative trip creation method and runtime calculation-source fields;
- same-direction pattern changes that resolve the target pattern's assigned profile and retain the trip ID;
- selected-trip recalculation previews, impact reporting for manual changes and block references, confirmation enforcement, and stable-ID writes;
- stale-runtime-source queries without automatic trip mutation;
- deterministic service-day schedule ordering and a 500-trip exercise;
- authoritative trip CSV output and backup parsing that omits an empty historical generation-set collection while accepting older populated records;
- scenario-copy remapping for calculation-source profile references.

The existing generation-set table and legacy application methods remain isolated for the running pre-2R UI. They are not read or written by the authoritative commands and remain scheduled for removal when Package 2R-D replaces the UI and Package 2R-E completes integration. No visual styling, layout, or interaction decisions were made.

Verification: TypeScript typechecking passed, the full Vitest suite passed 82 tests across 15 files, and the Vite production build completed successfully. The next gate is user verification of the structural ports and representative command behavior. After approval, recommend Terra for Package 2R-D (Route and Trips workflow UI/UX).

### Gate

Run all automated tests, TypeScript typechecking, and a production build. Present the application ports and representative command results in plain language. Pause and recommend Terra for Package 2R-D.

## Package 2R-D: Route and Trips workflow UI/UX

### Required model

Terra.

This package contains layout, interaction, focus, validation presentation, accessibility, visual hierarchy, table density, and responsive behavior. Terra must not recreate duration parsing, runtime selection, propagation, duplicate detection, recalculation-impact logic, or persistence behavior in React.

### File ownership

- Route and Trips components under `src/ui/`;
- related CSS;
- UI-only state and UI tests;
- `docs/ui-conventions.md` updates;
- visual fixtures or development-only sample builders if approved by the primary agent.

Application ports from Packages 2R-B and 2R-C are authoritative. If a required behavior is missing, stop and return it as a structural correction instead of adding domain logic to a component.

### Overall Trips-page structure

Use three full-width, vertically stacked, clearly bounded sections in this order:

1. Service
2. Runtimes
3. Trips

Each section requires a visible heading, a restrained border or background boundary, and consistent compact spacing. Do not use excessive card padding. The sections must read as one A-to-B-to-C workflow rather than three unrelated tools.

Do not repeat the page title inside each section. Do not use the terms assignment, materialized, generation set, provenance, revision, entity, or similar implementation terminology in user-facing text.

### Service section

The Service section is a compact context row containing, in this order:

1. Day
2. Direction
3. Pattern
4. Runtime profile
5. profile-management actions

Behavior:

- Day options always appear as Weekday, Saturday, Sunday, Holiday.
- Direction options follow the direction sequence defined on the Route screen.
- Pattern options are limited to the selected direction.
- Selecting a direction selects its previous pattern when possible, otherwise its first pattern.
- Selecting a pattern updates the Direction value automatically if the pattern was selected from another application context.
- Runtime profile resolves from the selected Day and Pattern.
- The label is `Runtime profile`, not `Assigned runtime profile`.
- A usable pattern must show `Default` without first asking the user to create a profile.
- Show compact secondary text listing the days that use the selected profile, for example `Used by Weekday, Saturday, Sunday, and Holiday`.
- New Profile is a secondary action. It must not visually compete with the normal Day, Direction, Pattern, and Runtime profile sequence.
- Rename and Delete are available beside the profile selector, either as restrained text buttons or a clearly labeled overflow menu.
- Copy and Reverse remain secondary profile operations.
- Do not repeat a Runtime profile name field in the Runtimes section.
- If Delete is unavailable because the profile is assigned, show the replacement requirement before the user activates Delete. Do not allow deletion and then report a missing-profile error.

### Prerequisite behavior

Prevent dead ends through visible setup states:

- With no direction, the Service section must provide a direct `Add direction on Route` action or navigation link. Runtimes and Trips remain visible but unavailable.
- With a direction but no usable pattern, provide `Add a pattern on Route`.
- With a usable pattern, automatically ensure the Default profile instead of showing a missing-profile error.
- With no valid runtime time period for the requested departure, identify the uncovered time before enabling Generate or saving an Add Trip row.
- Disabled controls require nearby plain-language explanation. Do not rely on tooltips alone.
- Use local inline guidance. Do not use a global error banner for ordinary incomplete setup.

### Runtimes section

Use a compact spreadsheet-style table:

```text
From | To | Segment 1 | Segment 2 | ... | Remove
```

Requirements:

- Remove the visible Band name field and Band column.
- Remove the Runtime profile name field from this section.
- From and To remain 24-plus service-clock fields.
- Segment cells use the duration parser supplied by the application/domain layer.
- Show a calculated Total column after the final segment and before row actions; it sums the band’s segment durations and is not an independently editable value.
- While editing, accept decimal minutes, standard `MM:SS`, and displayed `:MM` / `:MM:SS` forms.
- On commit, display whole minutes as `:05`, `:12`, or `:75` and nonzero seconds as `:05:30` or `:75:15`.
- Empty is visually distinct from zero.
- Invalid cells remain editable and receive cell-level guidance. Do not replace the entered value before the user can correct it.
- Do not show internal field names or rule keys.
- Place Add Time Period beneath the running list.
- Retain a compact remove icon rather than a prominent red text button.
- Keep segment headers readable during horizontal scrolling. Freeze From and To if this improves use without consuming excessive width.
- Make the current profile and its shared-day use visible in the Service section while this table is being edited.

Terra must decide and document keyboard movement, commit, cancel, and row-add behavior, but must preserve ordinary spreadsheet expectations: Enter commits, Escape cancels the current edit, and Tab moves to the next editable cell.

### Trips section actions

The primary actions are:

- Build Trips
- Add Trip

Build Trips is an action inside the Trips section. It must not be a separate permanently expanded section and must not expose a generation-set selector or name.

Build Trips uses a non-modal drawer docked to the right edge of the application, consistent with Shift Trips. The control must contain only:

- Pattern
- First Trip
- Headway
- Number of Trips
- Last Trip
- the resolved runtime-profile name as read-only context
- Build and Cancel

Requirements:

- Pattern options are limited to the selected direction.
- First Trip and Last Trip use the shared 24-plus time control.
- Headway accepts the same decimal-minute, standard `MM:SS`, and displayed `:MM` / `:MM:SS` input behavior as runtime durations.
- Number of Trips is blank by default and accepts a whole number from 1 through 500. Entering Number of Trips disables Last Trip; entering Last Trip disables Number of Trips.
- Last Trip is inclusive: a departure exactly matching that time and the headway sequence is created.
- Validate the complete proposed departure sequence before enabling Build.
- If a departure falls in a runtime gap, show `No run time defined for [time]` beside the form and leave Build unavailable.
- Do not show a generated-trip preview.
- Build adds trips, closes the modal or panel, and places the new rows into chronological order.
- Keep the selected day and direction after generation.
- Do not replace or clear existing trips.

### Add Trip draft-row interaction

Add Trip places one temporary draft row at the top of the visible schedule until it is saved and sorted by first-trip time. The draft row is not persisted until it has a valid pattern and first time.

Required sequence:

1. The user activates Add Trip.
2. A draft row appears with a clear non-color status indicator and a restrained background or border change.
3. Focus moves to the Pattern selector in the leftmost visible column.
4. The selector initially reads `Select pattern`.
5. After the user chooses a pattern, only that pattern's served timepoint cells become active.
6. Focus moves to the first served timepoint cell.
7. That one cell accepts a 24-plus first-trip time.
8. When the time is valid and has an applicable runtime, the application fills the remaining served timepoints.
9. The user commits with Enter or an explicit compact Save action. The row is then persisted and moved into chronological order.
10. Escape or Cancel removes the uncommitted draft row.

The row must never depend on color alone. Include a visible `New trip` label, draft icon, or equivalent accessible text.

If the selected pattern has no assigned profile or the entered time falls in a runtime gap, keep the row in draft state and explain the required correction directly in or below the row. Do not discard the user's pattern or first-time entry.

Only one Add Trip draft row may be active initially. If the user activates Add Trip again, return focus to the existing draft row.

### Directional schedule table

The table shows the selected Day and Direction and all trips belonging to patterns in that direction.

Required column structure:

```text
Pattern | Direction timepoint 1 | Direction timepoint 2 | ... | compact secondary actions
```

Requirements:

- Pattern is the leftmost visible column.
- If row selection is needed, place its control inside the Pattern cell or after Pattern. Do not put a separate checkbox column to the left of Pattern.
- The Pattern cell is a compact dropdown on every persisted trip row.
- Limit the dropdown to patterns in the displayed direction.
- Changing Pattern preserves the trip's first time and recalculates all served cells through the application port.
- Use an em dash for a direction column the selected pattern does not serve.
- Show all served scheduled points directly in the row. Do not require expanding a summary row to see timepoints.
- Sort rows by first trip time, pattern sequence, and a stable tie-breaker.
- Allow two rows to have the same first time.
- Mark only same-pattern/same-time duplicates, using a subtle icon or row note. Do not block them.
- Display 24-plus times without wrapping to a new service day.
- Keep the table compact enough for at least 100 visible trip rows to be scanned efficiently.
- Use a sticky header and sticky Pattern column when horizontal scrolling is required.
- Do not include Generation set, Materialized status, or provenance columns.
- Block information may remain a compact right-side placeholder until the Blocking phase, but it must not displace schedule timepoints.
- Retain selected-trip shift and Regenerate actions as secondary schedule tools. Their controls must not dominate Build Trips and Add Trip. A compact Shift button, disabled until one or more trips are selected, opens a lightly tinted inline shift tool. The tool states `Shift selected trips`, uses an integer minute field between a minus button (shift selected trips earlier) and plus button (shift selected trips later), shows compact graphical Undo and Redo buttons, and includes Done to hide the tool. Show a non-blocking result message after every shift, undo, or redo. Undo and Redo apply only to the most recent shift in the active page session; clear this temporary history after a context switch or any non-shift schedule edit.

### Runtime-change state

When saved trips were calculated with an older runtime revision:

- do not change their displayed times automatically;
- show a restrained `Run Times Have Changed` status box immediately left of the Trips actions;
- identify each affected row with visible `Run times changed` text in its Pattern cell;
- provide Regenerate only when at least one affected trip is selected;
- do not describe trips as stale, materialized, or revision-mismatched;
- show an impact confirmation only when the application reports manual changes or block effects.

### Route-screen direction controls

Terra must also design the Route-screen controls required by the structural direction model:

- a clearly labeled Directions area;
- add, rename, reorder, and safely delete a direction;
- assign each pattern to one direction;
- edit the direction's ordered timetable columns;
- map pattern points to direction columns without showing internal IDs;
- make repeated visits to the same named node distinguishable by position or optional label;
- prevent deletion of a direction that still owns patterns unless the user explicitly reassigns them.

Direction setup must remain part of Route definition. Do not move direction-column editing into the Trips schedule.

### Accessibility and visual verification

Terra must verify:

- keyboard-only creation of a runtime period;
- keyboard-only Generate Trips completion;
- keyboard-only Add Trip completion and cancellation;
- focus restoration after the Generate Trips modal closes;
- accessible names for profile actions, draft-row state, duplicate indicators, and remove icons;
- no state communicated only by color;
- horizontal scrolling with Pattern and headers remaining understandable;
- compact rendering at common desktop widths;
- a Federal Boulevard-style example with two Southbound patterns interlaced in one table;
- Weekday, Saturday, Sunday, Holiday order in every visible selector.

### Terra acceptance checklist

The user must be able to complete this sequence without encountering a preventable global error:

1. Select Weekday.
2. Select Southbound.
3. Select Southbound 1 and use its Default profile.
4. Enter runtime periods using both `5.5` and `5:30` forms and see `:05:30` after commit.
5. Generate Southbound 1 trips every 15 minutes.
6. Generate Southbound 2 trips every 15 minutes with an offset first time.
7. See both patterns interlaced in one schedule.
8. Add one trip through the draft-row workflow.
9. Change that row's pattern and see its served timepoints recalculate.
10. Edit a runtime period and see existing trips remain fixed with a Recalculate action.
11. View an after-midnight trip such as `25:07` without date conversion.

### Gate

Run relevant UI tests, TypeScript typechecking, the production build, accessibility checks, and browser visual inspection. Pause for the user's hands-on verification before Package 2R-E.

### Package 2R-D implementation note (2026-09-11)

The Route tab now provides direction creation, naming, timepoint-column creation, pattern-to-direction assignment, safe direction deletion, and confirmed pattern deletion. The Trips tab is rendered as the visible Service, Runtimes, Trips workflow and uses only the authoritative runtime and trip commands from Packages 2R-B and 2R-C. It provides Default profile provisioning, profile lifecycle controls, flexible runtime-duration entry, additive Generate Trips, a directly added draft row, direction-level schedules, duplicate-departure labels, selected-trip recalculation, and individual or bulk trip deletion.

Deletion behavior is explicit: a direction cannot be deleted while patterns use it; pattern deletion removes dependent profiles, assignments, trips, historical generation records, and linked block activities after confirmation; trip deletion removes linked revenue activities while retaining empty blocks; runtime profiles cannot be deleted while saved trips retain them as a calculation source. The application layer still lacks direction/column reorder commands and explicit point-to-column mapping controls that preserve repeated-node occurrences. Those remain a bounded structural correction before phase acceptance.

Verification: TypeScript typechecking passed; Vitest passed 86 tests across 15 files; Vite production build passed; the local application was opened for browser inspection. Focused Playwright regression tests now verify the compact Trips Pattern selector/column geometry and the adjacent Runtime From/To field geometry with isolated fixtures. The 2R-D refinement applies shared workflow-section, section-header, and data-grid viewport conventions to the Trips page; it removes the redundant Runtimes inner-card treatment and gives the schedule table the same framed separation as the runtime table. The user-facing Build Trips terminology, runtime-change action indicator, and per-row changed-runtime marker are now implemented. Hands-on workflow and accessibility verification remain at the user gate.

## Package 2R-E: Integration and Phase 2 revision acceptance

Hands-on verification of the corrective package in
`docs/implementation/phase-02r-safe-route-editing.md` and the Trip-profile package in
`docs/implementation/phase-02tp-trip-profiles.md` was accepted on 2026-09-14. These protect
shared Route inputs and separate timetable alternatives before final Phase 2R integration.

### Responsibility

Primary agent.

### Deliverables

- Review domain, application, persistence, and UI boundaries.
- Confirm that React contains no authoritative runtime or trip calculations.
- Confirm that the old generation-set workflow and terminology are removed.
- Confirm that JSON backup, import-as-copy, scenario duplication, and CSV operate on the revised graph.
- Confirm that the draft Phase 3 service-day copy plan is rewritten to copy runtime assignments and authoritative trips without generation sets.
- Update architecture, schema, glossary, decisions, UI conventions, and project status.
- Record a Phase 2R closeout.

### Acceptance criteria

- The Service, Runtimes, and Trips sections form a visible A-to-B-to-C workflow.
- Every usable pattern can begin with a Default runtime profile.
- Shared-profile day usage is visible before editing.
- Runtime durations accept decimal minutes, standard `MM:SS`, and displayed `:MM` / `:MM:SS` forms and display correctly.
- Generate Trips is additive and persists no generation instruction.
- Add Trip requires only a pattern and first time.
- The combined timetable shows all patterns in the selected direction.
- Missing pattern points display as em dashes.
- Pattern changes and recalculation retain trip IDs.
- Runtime changes do not silently alter trips.
- Exact duplicates are allowed and identified without blocking.
- Weekday, Saturday, Sunday, Holiday ordering is universal.
- 24-plus times remain intact.
- At least 500 trips can be queried, ordered, displayed, backed up, and restored.
- Automated tests, typechecking, production build, reload, and visual review pass.

### Closeout gate

Present the revised Phase 3 service-day workflow plan and recommended model. Do not begin Phase 3 automatically.
