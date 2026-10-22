# Acceptance Criteria Inventory (Phase A sweep)

Mechanical inventory of acceptance criteria and normative requirements from the nine implementation documents listed below. Each item is verbatim or a close paraphrase of the source text. Nothing here judges whether the code satisfies an item.

## Method and scope

- Every document was read in full.
- Included: text under headings such as "Accepted decisions", "Accepted behavior", "Accepted workflow direction", "Acceptance criteria", "Acceptance walkthrough", "Outcome", "User outcome", "Required tests", "Required verification", "Verification", "Gate", "Stop gate", "Deliverables", "Required interface behavior", "Interaction and accessibility requirements", "Fixed ...", "Persisted inputs and lifecycle", "UI structure", "Pure calculation contract", and the dated follow-up sections in the 2R workflow revision. Package-specific deliverables, tests, and gates are included.
- Excluded from the inventory (not criteria): Status and history records (except where a status line states an open condition or gate), Background and Objective prose (except where it states a user capability), Terminology, Reference behavior, Included/Excluded scope lists, work-package sequence diagrams, model and owner recommendations, file-ownership lists, and closeout records of completed packages.
- Flags in the last column mark a cross-document conflict, a superseded item, or a recorded open item. Flags are factual pointers only.

ID format: `<doc-short>-AC<n>`. The `AC` token is the required format, and it is used for every item. IDs are sequential in file order within each document; they are not the source item numbers, which appear in the Source heading column. The Kind column gives the source type: AC = acceptance; REQ = requirement; TST = test/verification; GATE = gate; IMPL = implementation note; VER = recorded verification.

## Documents

| Doc short | Path | Title |
| --- | --- | --- |
| 02R | `docs/implementation/phase-02r-trips-workflow-revision.md` | Phase 2R Trips workflow revision |
| 02RS | `docs/implementation/phase-02r-safe-route-editing.md` | Phase 2R corrective: safe Node and Pattern editing |
| 02TP | `docs/implementation/phase-02tp-trip-profiles.md` | Phase 2TP Trip profiles |
| 03 | `docs/implementation/phase-03-service-day-workflows.md` | Phase 3 service-day editing workflows |
| 03R | `docs/implementation/phase-03r-unified-action-layers.md` | Phase 3R unified action layers |
| 04 | `docs/implementation/phase-04-manual-blocking.md` | Phase 4 manual blocking |
| 05 | `docs/implementation/phase-05-costing.md` | Phase 5 costing |
| RTP | `docs/implementation/runtime-table-paste.md` | Runtime table paste revision |
| TTI | `docs/implementation/phase-02r-trip-table-interchange-undo.md` | Phase 2R Trip table interchange and undo |

## Counts per document

| Doc short | Criteria |
| --- | ---: |
| 02R | 314 |
| 02RS | 198 |
| 02TP | 142 |
| 03 | 137 |
| 03R | 129 |
| 04 | 178 |
| 05 | 74 |
| RTP | 25 |
| TTI | 21 |
| **Total** | **1218** |

Counts by kind: REQ 816, AC 194, TST 165, GATE 35, IMPL 4, VER 4.

## Criteria

### 02R: `docs/implementation/phase-02r-trips-workflow-revision.md`

Criteria in this document: 314.

| ID | Kind | Source heading | Criterion | Flag |
| --- | --- | --- | --- | --- |
| 02R-AC1 | REQ | Status | Route and Trips tabs retain the user's selected pattern when switching tabs or reloading workspace data. |  |
| 02R-AC2 | REQ | Status | Trips retains a pattern per scenario, route, and direction. A missing pattern falls back to the first available pattern. |  |
| 02R-AC3 | REQ | Status | The 2026-10-21 follow-up adds a profile-owned blended-segment calculation method and an optional Trips band-contribution view, defined by Decision 0032. | Decision 0032 is not in the inventory scope; the item is recorded from the Status text only. |
| 02R-AC4 | REQ | Objective | The workflow must prevent missing prerequisites through visible context, disabled actions, direct next-step guidance, and automatic defaults. |  |
| 02R-AC5 | REQ | Objective | Routine setup problems must not first appear as global errors after submission. |  |
| 02R-AC6 | AC | Accepted decisions (item 1) | Trips are the authoritative saved schedule records. |  |
| 02R-AC7 | AC | Accepted decisions (item 2) | A Generate Trips request is transient. First Trip, Headway, and Last Trip are not saved as a generation set after the trips are created. |  |
| 02R-AC8 | AC | Accepted decisions (item 3) | Generation is additive. It never replaces existing trips and may interlace new trips with existing trips. |  |
| 02R-AC9 | AC | Accepted decisions (item 4) | Existing trips remain unchanged when a runtime profile changes. The user must explicitly recalculate selected trips. |  |
| 02R-AC10 | AC | Accepted decisions (item 4) | Regeneration review defaults to first departure, permits bulk first/last/shared timepoint choices and per-trip overrides, and previews first/last results before applying. |  |
| 02R-AC11 | AC | Accepted decisions (item 5) | Initial generation does not require a trip preview. |  |
| 02R-AC12 | AC | Accepted decisions (item 5) | Destructive recalculation and future service-day replacement require an impact confirmation when manual changes or block references are affected. |  |
| 02R-AC13 | AC | Accepted decisions (item 6) | Each route has application-managed Outbound and Inbound groups. Every pattern belongs to exactly one group. |  |
| 02R-AC14 | AC | Accepted decisions (item 7) | Each group has an authoritative internal ordered set of timetable columns. Patterns map their pattern points to those columns. A pattern may omit columns. | The revision note under accepted decision item 7 says the Route screen does not expose direction or column setup (Decision 0011); the Route-screen direction controls item below requires that setup on the Route screen. Literal conflict within this doc. |
| 02R-AC15 | AC | Accepted decisions (item 8) | The schedule shows one selected service day and direction, and interlaces trips from every pattern in that direction. |  |
| 02R-AC16 | AC | Accepted decisions (item 9) | A runtime profile remains pattern-specific. The selected service day and pattern resolve one assigned runtime profile. |  |
| 02R-AC17 | AC | Accepted decisions (item 10) | A pattern receives a Default runtime profile without requiring the user to create or name a profile first. The initial Default may be shared by multiple service days. |  |
| 02R-AC18 | AC | Accepted decisions (item 11) | The interface visibly identifies which service days use a selected shared profile. |  |
| 02R-AC19 | AC | Accepted decisions (item 12) | Service days always appear in this order: Weekday, Saturday, Sunday, Holiday. This order is centralized and reused by every interface and export that compares the four standard days. |  |
| 02R-AC20 | AC | Accepted decisions (item 13) | Runtime segment-duration fields accept decimal minutes (7, 07, or 7.5), standard MM:SS (7:30), and the displayed :MM / :MM:SS forms (:07 or :07:30). |  |
| 02R-AC21 | AC | Accepted decisions (item 14) | Runtime segment durations remain integer seconds internally. |  |
| 02R-AC22 | AC | Accepted decisions (item 15) | An Add Trip row requires a pattern and one initial time. The application resolves the applicable runtime profile and calculates the remaining timepoints. |  |
| 02R-AC23 | AC | Accepted decisions (item 16) | The Pattern control is the leftmost visible schedule column. A pattern change preserves the trip's first time, resolves the new pattern's assigned profile, and recalculates the row. |  |
| 02R-AC24 | AC | Accepted decisions (item 17) | Exact duplicate trips (same service day, pattern, and first time) are allowed and produce a nonblocking possible-duplicate indication. |  |
| 02R-AC25 | AC | Accepted decisions (item 17) | Trips on different patterns may begin at the same time without a duplicate indication. |  |
| 02R-AC26 | AC | Accepted decisions (item 18) | Phase 2 draft data and backups do not require backward compatibility. Schema work may remove generation-set records and obsolete provenance fields without migrating current draft schedule data. |  |
| 02R-AC27 | REQ | Reference behavior (illustrative) | Trips are interlaced in chronological order at the first common timetable point, falling back to initial departure when patterns have no common point. | From the Reference behavior section, which the doc says is evidence and not a literal visual specification. |
| 02R-AC28 | REQ | Target domain behavior > Directions and timetable columns | Add a route-owned direction model (RouteDirection with id, scenarioId, routeId, name, sequence, columns; DirectionTimepointColumn with id, nodeId, sequence, labelOverride). Labelled a recommended structural shape. |  |
| 02R-AC29 | REQ | Target domain behavior > Directions and timetable columns | RoutePattern must reference one directionId. |  |
| 02R-AC30 | REQ | Target domain behavior > Directions and timetable columns | Each PatternPoint must map to a direction column using a stable direction-column identifier. This explicit mapping is required because a loop may visit the same node more than once. |  |
| 02R-AC31 | REQ | Target domain behavior > Directions and timetable columns | Direction-column order is authoritative for schedule presentation. Pattern-point order remains authoritative for runtime propagation. |  |
| 02R-AC32 | REQ | Target domain behavior > Directions and timetable columns | Validation must report incompatible or duplicate mappings without embedding user-facing prose in domain code. |  |
| 02R-AC33 | REQ | Target domain behavior > Runtime profiles | Retain complete pattern-specific runtime profiles. Do not introduce shared segment inheritance in this revision. |  |
| 02R-AC34 | REQ | Target domain behavior > Runtime profiles | Provide an application command that ensures a usable pattern has a Default profile and runtime assignments. It must be idempotent. The UI must not create persistence records directly. |  |
| 02R-AC35 | REQ | Target domain behavior > Runtime profiles | The initial Default profile may be assigned to Weekday, Saturday, Sunday, and Holiday. Editing a shared profile intentionally affects every assigned day. The UI must show those assignments before the user edits the table. |  |
| 02R-AC36 | REQ | Target domain behavior > Runtime profiles | Deleting a profile must not leave a service day and pattern without an assigned profile. The application layer must either reject deletion with structured replacement requirements or apply an explicitly selected replacement in the same transaction. |  |
| 02R-AC37 | REQ | Target domain behavior > Runtime duration parsing and formatting | Create pure duration utilities separate from service-clock parsing. |  |
| 02R-AC38 | REQ | Target domain behavior > Runtime duration parsing and formatting | Example: entry 5 stores 300 seconds and displays :05. |  |
| 02R-AC39 | REQ | Target domain behavior > Runtime duration parsing and formatting | Example: entry 5.5 stores 330 seconds and displays :05:30. |  |
| 02R-AC40 | REQ | Target domain behavior > Runtime duration parsing and formatting | Example: entry 5:30 stores 330 seconds and displays :05:30. |  |
| 02R-AC41 | REQ | Target domain behavior > Runtime duration parsing and formatting | Example: entry 12 stores 720 seconds and displays :12. |  |
| 02R-AC42 | REQ | Target domain behavior > Runtime duration parsing and formatting | Example: entry 75:15 stores 4515 seconds and displays :75:15. |  |
| 02R-AC43 | REQ | Target domain behavior > Runtime duration parsing and formatting | Trim surrounding whitespace. |  |
| 02R-AC44 | REQ | Target domain behavior > Runtime duration parsing and formatting | A value without a colon is decimal minutes. |  |
| 02R-AC45 | REQ | Target domain behavior > Runtime duration parsing and formatting | Standard MM:SS notation is accepted. The display notation :MM / :MM:SS is accepted as the same stored duration. |  |
| 02R-AC46 | REQ | Target domain behavior > Runtime duration parsing and formatting | Seconds in colon notation must be from 00 through 59. |  |
| 02R-AC47 | REQ | Target domain behavior > Runtime duration parsing and formatting | Decimal-minute results are rounded to the nearest integer second. |  |
| 02R-AC48 | REQ | Target domain behavior > Runtime duration parsing and formatting | Negative values, nonnumeric values, nonfinite values, and values with more than one colon are invalid. |  |
| 02R-AC49 | REQ | Target domain behavior > Runtime duration parsing and formatting | Blank and zero remain distinct. |  |
| 02R-AC50 | REQ | Target domain behavior > Runtime duration parsing and formatting | Omit the seconds component when it is zero. |  |
| 02R-AC51 | REQ | Target domain behavior > Runtime duration parsing and formatting | Use at least two minute digits in display, but do not cap minutes at 59. |  |
| 02R-AC52 | REQ | Target domain behavior > Runtime duration parsing and formatting | Runtime-band From and To fields continue to use the 24-plus service-clock parser rather than the duration parser. |  |
| 02R-AC53 | REQ | Target domain behavior > Transient generation | Replace saved TripGenerationSet behavior with a transient command. GenerateTripsRequest has scenarioId, routeId, serviceDayId, patternId, firstTrip, headwaySeconds, optional lastTrip, optional tripCount. |  |
| 02R-AC54 | REQ | Target domain behavior > Transient generation | Application service step 1: validate the request. |  |
| 02R-AC55 | REQ | Target domain behavior > Transient generation | Application service step 2: resolve the pattern's runtime profile for the selected service day. |  |
| 02R-AC56 | REQ | Target domain behavior > Transient generation | Application service step 3: validate that every proposed departure has an applicable runtime band. |  |
| 02R-AC57 | REQ | Target domain behavior > Transient generation | Application service step 4: materialize every trip and scheduled point. |  |
| 02R-AC58 | REQ | Target domain behavior > Transient generation | Application service step 5: detect possible exact duplicates without preventing creation. |  |
| 02R-AC59 | REQ | Target domain behavior > Transient generation | Application service step 6: insert the complete generated group atomically. |  |
| 02R-AC60 | REQ | Target domain behavior > Transient generation | Application service step 7: leave all existing trips and blocks unchanged. |  |
| 02R-AC61 | REQ | Target domain behavior > Transient generation | No partial trip group may be written when one proposed departure cannot be calculated. |  |
| 02R-AC62 | REQ | Target domain behavior > Transient generation | Exactly one of Last Trip and Number of Trips is required. Last Trip is inclusive when it falls exactly on the headway sequence. |  |
| 02R-AC63 | REQ | Target domain behavior > Transient generation | A request is invalid when Last Trip is earlier than First Trip, when Number of Trips is not a positive whole number or exceeds 500, or when the headway is not positive. |  |
| 02R-AC64 | REQ | Target domain behavior > Authoritative trips and calculation source | Each trip stores its pattern, scheduled points, creation method, and the runtime-profile calculation source needed to determine whether its displayed times were calculated from the current runtime data. |  |
| 02R-AC65 | REQ | Target domain behavior > Authoritative trips and calculation source | A calculation revision changes when runtime bands or segment durations change and does not change for a profile rename. A trip records the profile ID and calculation revision used for its current scheduled points. |  |
| 02R-AC66 | REQ | Target domain behavior > Authoritative trips and calculation source | A runtime edit does not alter trips. A query may identify trips calculated with an earlier runtime revision so the interface can offer Recalculate without treating the state as invalid. |  |
| 02R-AC67 | REQ | Target domain behavior > Authoritative trips and calculation source | Legacy or imported trips without a complete runtime-profile source: compare saved timepoints with the current assigned profile's calculated output and flag trips whose times differ. |  |
| 02R-AC68 | REQ | Target domain behavior > Authoritative trips and calculation source | Recalculation of trips with an unverified source requires explicit confirmation. |  |
| 02R-AC69 | REQ | Target domain behavior > Add Trip | Add command accepts scenario, route, service day, and direction context, a pattern belonging to the selected direction, and one first-trip time. |  |
| 02R-AC70 | REQ | Target domain behavior > Add Trip | The Add command resolves the assigned runtime profile, propagates all pattern times, creates one trip, and returns any possible-duplicate finding. It must not require a generation set. |  |
| 02R-AC71 | REQ | Target domain behavior > Pattern changes | Changing the Pattern on an existing trip preserves the trip's first scheduled time. |  |
| 02R-AC72 | REQ | Target domain behavior > Pattern changes | Changing the Pattern requires the target pattern to belong to the currently displayed direction. |  |
| 02R-AC73 | REQ | Target domain behavior > Pattern changes | Changing the Pattern resolves the target pattern's assigned runtime profile for the trip's service day. |  |
| 02R-AC74 | REQ | Target domain behavior > Pattern changes | Changing the Pattern recalculates the complete row and retains the trip ID. |  |
| 02R-AC75 | REQ | Target domain behavior > Pattern changes | Changing the Pattern returns structured impact information for future block validation. The operation must not be partially applied. |  |
| 02R-AC76 | REQ | Target domain behavior > Recalculation | Recalculate operates on explicitly selected trips. It preserves each trip's ID, service day, pattern, and first time, then replaces its remaining scheduled times using the currently assigned runtime profile. |  |
| 02R-AC77 | REQ | Target domain behavior > Recalculation | The application must produce an impact result before a destructive write when selected trips contain manual shifts or block references. A simple no-impact recalculation may proceed directly. |  |
| 02R-AC78 | REQ | Target domain behavior > Recalculation | The domain and application layers, not React, determine whether confirmation is required. |  |
| 02R-AC79 | REQ | Target domain behavior > Schedule ordering | The combined schedule query returns trips ordered by first scheduled time, then pattern sequence within the direction, then stable trip creation order or ID as the final tie-breaker. |  |
| 02R-AC80 | REQ | Target domain behavior > Schedule ordering | Overlapping trips and identical first times are valid schedule data. |  |
| 02R-AC81 | REQ | Package 2R-B > Deliverables | Add stable route directions and ordered direction columns. |  |
| 02R-AC82 | REQ | Package 2R-B > Deliverables | Require every usable pattern to reference one direction. |  |
| 02R-AC83 | REQ | Package 2R-B > Deliverables | Map each pattern point to one direction column. |  |
| 02R-AC84 | REQ | Package 2R-B > Deliverables | Validate route, direction, column, pattern, node, and pattern-point references. |  |
| 02R-AC85 | REQ | Package 2R-B > Deliverables | Support repeated visits to the same node through distinct direction-column IDs. |  |
| 02R-AC86 | REQ | Package 2R-B > Deliverables | Add deterministic direction and pattern sequencing. |  |
| 02R-AC87 | REQ | Package 2R-B > Deliverables | Centralize Weekday, Saturday, Sunday, Holiday ordering. |  |
| 02R-AC88 | REQ | Package 2R-B > Deliverables | Implement flexible runtime-duration parse and format utilities exactly as specified. |  |
| 02R-AC89 | REQ | Package 2R-B > Deliverables | Add runtime-profile calculation revisions. |  |
| 02R-AC90 | REQ | Package 2R-B > Deliverables | Add idempotent Default-profile provisioning and initial assignments. |  |
| 02R-AC91 | REQ | Package 2R-B > Deliverables | Add profile rename and safe-delete/replacement commands. |  |
| 02R-AC92 | REQ | Package 2R-B > Deliverables | Permit a clean persistence-schema replacement because Phase 2 draft compatibility is not required. |  |
| 02R-AC93 | REQ | Package 2R-B > Deliverables | Remove backup and CSV assumptions that require generation sets where necessary to keep this package compiling. |  |
| 02R-AC94 | TST | Package 2R-B > Tests | Custom direction names and deterministic ordering. |  |
| 02R-AC95 | TST | Package 2R-B > Tests | Two patterns assigned to one direction. |  |
| 02R-AC96 | TST | Package 2R-B > Tests | One pattern omitting direction columns. |  |
| 02R-AC97 | TST | Package 2R-B > Tests | Loop pattern mapping two visits to the same node to distinct columns. |  |
| 02R-AC98 | TST | Package 2R-B > Tests | Invalid cross-route and missing-column references. |  |
| 02R-AC99 | TST | Package 2R-B > Tests | All duration examples and invalid boundaries. |  |
| 02R-AC100 | TST | Package 2R-B > Tests | Blank versus zero duration. |  |
| 02R-AC101 | TST | Package 2R-B > Tests | Profile rename without calculation-revision change. |  |
| 02R-AC102 | TST | Package 2R-B > Tests | Runtime-band or segment change with calculation-revision increment. |  |
| 02R-AC103 | TST | Package 2R-B > Tests | Idempotent Default provisioning. |  |
| 02R-AC104 | TST | Package 2R-B > Tests | Shared Default assignments across all four standard days. |  |
| 02R-AC105 | TST | Package 2R-B > Tests | Safe profile deletion with assigned-day replacement requirements. |  |
| 02R-AC106 | TST | Package 2R-B > Tests | Service-day sorting from arbitrarily ordered records. |  |
| 02R-AC107 | GATE | Package 2R-B > Gate | Run focused tests and TypeScript typechecking. |  |
| 02R-AC108 | GATE | Package 2R-B > Gate | Demonstrate the Federal Boulevard-style relationship with two Southbound patterns mapped to one direction-column set. |  |
| 02R-AC109 | GATE | Package 2R-B > Gate | Pause before Package 2R-C. |  |
| 02R-AC110 | REQ | Package 2R-C > Required model | This package is structural. It must expose complete behavior-oriented ports for Terra and must not implement table layout or interaction design. |  |
| 02R-AC111 | REQ | Package 2R-C > File ownership | Do not change visual styling or make interaction decisions. |  |
| 02R-AC112 | REQ | Package 2R-C > Deliverables | Remove TripGenerationSet as an authoritative entity and repository table. |  |
| 02R-AC113 | REQ | Package 2R-C > Deliverables | Replace generation-set provenance with trip creation and calculation-source data. |  |
| 02R-AC114 | REQ | Package 2R-C > Deliverables | Implement validation-only preflight for transient Generate Trips requests. |  |
| 02R-AC115 | REQ | Package 2R-C > Deliverables | Insert generated trip groups atomically without replacing existing trips. |  |
| 02R-AC116 | REQ | Package 2R-C > Deliverables | Implement Add Trip. |  |
| 02R-AC117 | REQ | Package 2R-C > Deliverables | Implement exact-duplicate findings as warnings. |  |
| 02R-AC118 | REQ | Package 2R-C > Deliverables | Implement same-direction pattern change with stable trip IDs. |  |
| 02R-AC119 | REQ | Package 2R-C > Deliverables | Implement selected-trip recalculation and impact reporting. |  |
| 02R-AC120 | REQ | Package 2R-C > Deliverables | Preserve block references when a surviving trip ID is recalculated. |  |
| 02R-AC121 | REQ | Package 2R-C > Deliverables | Keep generation and recalculation rules outside React and Dexie. |  |
| 02R-AC122 | REQ | Package 2R-C > Deliverables | Replace the backup schema without requiring readers for Phase 2 draft backups. |  |
| 02R-AC123 | REQ | Package 2R-C > Deliverables | Update scenario duplication and import validation for directions, direction columns, runtime revisions, and authoritative trips. |  |
| 02R-AC124 | REQ | Package 2R-C > Deliverables | Remove generation-set CSV output and retain trips and scheduled-point outputs. |  |
| 02R-AC125 | REQ | Package 2R-C > Deliverables | Support at least 500 trips for one service day. |  |
| 02R-AC126 | TST | Package 2R-C > Tests | Inclusive First Trip through Last Trip generation. |  |
| 02R-AC127 | TST | Package 2R-C > Tests | Decimal and MM:SS headway conversion through the shared duration utility. |  |
| 02R-AC128 | TST | Package 2R-C > Tests | Additive interlacing of two patterns. |  |
| 02R-AC129 | TST | Package 2R-C > Tests | Two different patterns with the same first time. |  |
| 02R-AC130 | TST | Package 2R-C > Tests | Exact same-pattern/same-time duplicate warning without rejection. |  |
| 02R-AC131 | TST | Package 2R-C > Tests | All-or-nothing rejection when one departure falls in a runtime gap. |  |
| 02R-AC132 | TST | Package 2R-C > Tests | Add Trip runtime resolution and propagation. |  |
| 02R-AC133 | TST | Package 2R-C > Tests | Pattern change using the target pattern's assigned profile. |  |
| 02R-AC134 | TST | Package 2R-C > Tests | Preservation of trip ID during pattern change and recalculation. |  |
| 02R-AC135 | TST | Package 2R-C > Tests | Stale runtime revision identification without automatic trip mutation. |  |
| 02R-AC136 | TST | Package 2R-C > Tests | Recalculation impacts for manual shifts and block references. |  |
| 02R-AC137 | TST | Package 2R-C > Tests | Atomic persistence failure behavior. |  |
| 02R-AC138 | TST | Package 2R-C > Tests | Backup, import-as-copy, and scenario duplication round trips. |  |
| 02R-AC139 | TST | Package 2R-C > Tests | Deterministic CSV output with 24-plus times. |  |
| 02R-AC140 | TST | Package 2R-C > Tests | 500-trip query and ordering exercise. |  |
| 02R-AC141 | GATE | Package 2R-C > Gate | Run all automated tests, TypeScript typechecking, and a production build. Present the application ports and representative command results in plain language. Pause and recommend Terra for Package 2R-D. |  |
| 02R-AC142 | REQ | Package 2R-D > Required model | Terra. Terra must not recreate duration parsing, runtime selection, propagation, duplicate detection, recalculation-impact logic, or persistence behavior in React. |  |
| 02R-AC143 | REQ | Package 2R-D > Application ports | Application ports from Packages 2R-B and 2R-C are authoritative. If a required behavior is missing, stop and return it as a structural correction instead of adding domain logic to a component. |  |
| 02R-AC144 | REQ | Package 2R-D > Overall Trips-page structure | Use three full-width, vertically stacked, clearly bounded sections in this order: Service, Runtimes, Trips. |  |
| 02R-AC145 | REQ | Package 2R-D > Overall Trips-page structure | Each section requires a visible heading, a restrained border or background boundary, and consistent compact spacing. Do not use excessive card padding. |  |
| 02R-AC146 | REQ | Package 2R-D > Overall Trips-page structure | The sections must read as one A-to-B-to-C workflow rather than three unrelated tools. |  |
| 02R-AC147 | REQ | Package 2R-D > Overall Trips-page structure | Do not repeat the page title inside each section. |  |
| 02R-AC148 | REQ | Package 2R-D > Overall Trips-page structure | Do not use the terms assignment, materialized, generation set, provenance, revision, entity, or similar implementation terminology in user-facing text. |  |
| 02R-AC149 | REQ | Package 2R-D > Service section | Service section is a compact context row containing, in order: Day, Direction, Pattern, Runtime profile, profile-management actions. |  |
| 02R-AC150 | REQ | Package 2R-D > Service section | Day options always appear as Weekday, Saturday, Sunday, Holiday. |  |
| 02R-AC151 | REQ | Package 2R-D > Service section | Direction options follow the direction sequence defined on the Route screen. |  |
| 02R-AC152 | REQ | Package 2R-D > Service section | Pattern options are limited to the selected direction. |  |
| 02R-AC153 | REQ | Package 2R-D > Service section | Selecting a direction selects its previous pattern when possible, otherwise its first pattern. |  |
| 02R-AC154 | REQ | Package 2R-D > Service section | Selecting a pattern updates the Direction value automatically if the pattern was selected from another application context. |  |
| 02R-AC155 | REQ | Package 2R-D > Service section | Runtime profile resolves from the selected Day and Pattern. |  |
| 02R-AC156 | REQ | Package 2R-D > Service section | The label is Runtime profile, not Assigned runtime profile. |  |
| 02R-AC157 | REQ | Package 2R-D > Service section | A usable pattern must show Default without first asking the user to create a profile. |  |
| 02R-AC158 | REQ | Package 2R-D > Service section | Show compact secondary text listing the days that use the selected profile, for example: Used by Weekday, Saturday, Sunday, and Holiday. |  |
| 02R-AC159 | REQ | Package 2R-D > Service section | New Profile is a secondary action and must not visually compete with the Day, Direction, Pattern, and Runtime profile sequence. |  |
| 02R-AC160 | REQ | Package 2R-D > Service section | Rename and Delete are available beside the profile selector, as restrained text buttons or a clearly labeled overflow menu. |  |
| 02R-AC161 | REQ | Package 2R-D > Service section | Copy and Reverse remain secondary profile operations. |  |
| 02R-AC162 | REQ | Package 2R-D > Service section | Do not repeat a Runtime profile name field in the Runtimes section. |  |
| 02R-AC163 | REQ | Package 2R-D > Service section | If Delete is unavailable because the profile is assigned, show the replacement requirement before the user activates Delete. Do not allow deletion and then report a missing-profile error. |  |
| 02R-AC164 | REQ | Package 2R-D > Prerequisite behavior | With no direction, the Service section must provide a direct Add direction on Route action or navigation link. Runtimes and Trips remain visible but unavailable. |  |
| 02R-AC165 | REQ | Package 2R-D > Prerequisite behavior | With a direction but no usable pattern, provide Add a pattern on Route. |  |
| 02R-AC166 | REQ | Package 2R-D > Prerequisite behavior | With a usable pattern, automatically ensure the Default profile instead of showing a missing-profile error. |  |
| 02R-AC167 | REQ | Package 2R-D > Prerequisite behavior | With no valid runtime time period for the requested departure, identify the uncovered time before enabling Generate or saving an Add Trip row. |  |
| 02R-AC168 | REQ | Package 2R-D > Prerequisite behavior | Disabled controls require nearby plain-language explanation. Do not rely on tooltips alone. |  |
| 02R-AC169 | REQ | Package 2R-D > Prerequisite behavior | Use local inline guidance. Do not use a global error banner for ordinary incomplete setup. |  |
| 02R-AC170 | REQ | Package 2R-D > Runtimes section | Use a compact spreadsheet-style table with columns: From, To, Segment 1, Segment 2, ..., Remove. |  |
| 02R-AC171 | REQ | Package 2R-D > Runtimes section | Remove the visible Band name field and Band column. |  |
| 02R-AC172 | REQ | Package 2R-D > Runtimes section | Remove the Runtime profile name field from this section. |  |
| 02R-AC173 | REQ | Package 2R-D > Runtimes section | From and To remain 24-plus service-clock fields. |  |
| 02R-AC174 | REQ | Package 2R-D > Runtimes section | Segment cells use the duration parser supplied by the application/domain layer. |  |
| 02R-AC175 | REQ | Package 2R-D > Runtimes section | Show a calculated Total column after the final segment and before row actions. It sums the band's segment durations and is not an independently editable value. |  |
| 02R-AC176 | REQ | Package 2R-D > Runtimes section | While editing, accept decimal minutes, standard MM:SS, and displayed :MM / :MM:SS forms. |  |
| 02R-AC177 | REQ | Package 2R-D > Runtimes section | On commit, display whole minutes as :05, :12, or :75 and nonzero seconds as :05:30 or :75:15. |  |
| 02R-AC178 | REQ | Package 2R-D > Runtimes section | Empty is visually distinct from zero. |  |
| 02R-AC179 | REQ | Package 2R-D > Runtimes section | Invalid cells remain editable and receive cell-level guidance. Do not replace the entered value before the user can correct it. |  |
| 02R-AC180 | REQ | Package 2R-D > Runtimes section | Do not show internal field names or rule keys. |  |
| 02R-AC181 | REQ | Package 2R-D > Runtimes section | Place Add Time Period beneath the running list. |  |
| 02R-AC182 | REQ | Package 2R-D > Runtimes section | Retain a compact remove icon rather than a prominent red text button. |  |
| 02R-AC183 | REQ | Package 2R-D > Runtimes section | Keep segment headers readable during horizontal scrolling. Freeze From and To if this improves use without consuming excessive width. |  |
| 02R-AC184 | REQ | Package 2R-D > Runtimes section | Make the current profile and its shared-day use visible in the Service section while this table is being edited. |  |
| 02R-AC185 | REQ | Package 2R-D > Runtimes section | Terra must decide and document keyboard movement, commit, cancel, and row-add behavior. Enter commits, Escape cancels the current edit, and Tab moves to the next editable cell. |  |
| 02R-AC186 | REQ | Package 2R-D > Trips section actions | Primary actions are Build Trips and Add Trip. |  |
| 02R-AC187 | REQ | Package 2R-D > Trips section actions | Build Trips is an action inside the Trips section. It must not be a separate permanently expanded section and must not expose a generation-set selector or name. |  |
| 02R-AC188 | REQ | Package 2R-D > Trips section actions | Build Trips uses a non-modal drawer docked to the right edge, consistent with Shift Trips. |  |
| 02R-AC189 | REQ | Package 2R-D > Trips section actions | The Build Trips control contains only: Pattern, First Trip, Headway, Number of Trips, Last Trip, the resolved runtime-profile name as read-only context, and Build and Cancel. |  |
| 02R-AC190 | REQ | Package 2R-D > Trips section actions | Pattern options are limited to the selected direction. |  |
| 02R-AC191 | REQ | Package 2R-D > Trips section actions | First Trip and Last Trip use the shared 24-plus time control. |  |
| 02R-AC192 | REQ | Package 2R-D > Trips section actions | Headway accepts the same decimal-minute, standard MM:SS, and displayed :MM / :MM:SS input behavior as runtime durations. |  |
| 02R-AC193 | REQ | Package 2R-D > Trips section actions | Number of Trips is blank by default and accepts a whole number from 1 through 500. Entering Number of Trips disables Last Trip; entering Last Trip disables Number of Trips. |  |
| 02R-AC194 | REQ | Package 2R-D > Trips section actions | Last Trip is inclusive: a departure exactly matching that time and the headway sequence is created. |  |
| 02R-AC195 | REQ | Package 2R-D > Trips section actions | Validate the complete proposed departure sequence before enabling Build. |  |
| 02R-AC196 | REQ | Package 2R-D > Trips section actions | If a departure falls in a runtime gap, show No run time defined for [time] beside the form and leave Build unavailable. |  |
| 02R-AC197 | REQ | Package 2R-D > Trips section actions | Do not show a generated-trip preview. |  |
| 02R-AC198 | REQ | Package 2R-D > Trips section actions | Build adds trips, closes the modal or panel, and places the new rows into chronological order. |  |
| 02R-AC199 | REQ | Package 2R-D > Trips section actions | Keep the selected day and direction after generation. Do not replace or clear existing trips. |  |
| 02R-AC200 | REQ | Package 2R-D > Add Trip draft-row interaction | Add Trip places one temporary draft row at the top of the visible schedule until it is saved and sorted by first-trip time. The draft row is not persisted until it has a valid pattern and first time. |  |
| 02R-AC201 | REQ | Package 2R-D > Add Trip draft-row interaction | Sequence step 1: the user activates Add Trip. |  |
| 02R-AC202 | REQ | Package 2R-D > Add Trip draft-row interaction | Sequence step 2: a draft row appears with a clear non-color status indicator and a restrained background or border change. |  |
| 02R-AC203 | REQ | Package 2R-D > Add Trip draft-row interaction | Sequence step 3: focus moves to the Pattern selector in the leftmost visible column. The selector initially reads Select pattern. |  |
| 02R-AC204 | REQ | Package 2R-D > Add Trip draft-row interaction | Sequence step 5: after the user chooses a pattern, only that pattern's served timepoint cells become active. |  |
| 02R-AC205 | REQ | Package 2R-D > Add Trip draft-row interaction | Sequence step 6: focus moves to the first served timepoint cell. |  |
| 02R-AC206 | REQ | Package 2R-D > Add Trip draft-row interaction | Sequence step 7: that one cell accepts a 24-plus first-trip time. |  |
| 02R-AC207 | REQ | Package 2R-D > Add Trip draft-row interaction | Sequence step 8: when the time is valid and has an applicable runtime, the application fills the remaining served timepoints. |  |
| 02R-AC208 | REQ | Package 2R-D > Add Trip draft-row interaction | Sequence step 9: the user commits with Enter or an explicit compact Save action. The row is then persisted and moved into chronological order. |  |
| 02R-AC209 | REQ | Package 2R-D > Add Trip draft-row interaction | Sequence step 10: Escape or Cancel removes the uncommitted draft row. |  |
| 02R-AC210 | REQ | Package 2R-D > Add Trip draft-row interaction | The row must never depend on color alone. Include a visible New trip label, draft icon, or equivalent accessible text. |  |
| 02R-AC211 | REQ | Package 2R-D > Add Trip draft-row interaction | If the selected pattern has no assigned profile or the entered time falls in a runtime gap, keep the row in draft state and explain the required correction directly in or below the row. Do not discard the user's pattern or first-time entry. |  |
| 02R-AC212 | REQ | Package 2R-D > Add Trip draft-row interaction | Only one Add Trip draft row may be active. If the user activates Add Trip again, return focus to the existing draft row. |  |
| 02R-AC213 | REQ | Package 2R-D > Directional schedule table | The table shows the selected Day and Direction and all trips belonging to patterns in that direction. Required column structure: Pattern, Direction timepoint 1, Direction timepoint 2, ..., compact secondary actions. |  |
| 02R-AC214 | REQ | Package 2R-D > Directional schedule table | Pattern is the leftmost visible column. Do not put a separate checkbox column to the left of Pattern; row selection control goes inside the Pattern cell or after Pattern. |  |
| 02R-AC215 | REQ | Package 2R-D > Directional schedule table | The Pattern cell is a compact dropdown on every persisted trip row, limited to patterns in the displayed direction. |  |
| 02R-AC216 | REQ | Package 2R-D > Directional schedule table | Changing Pattern preserves the trip's first time and recalculates all served cells through the application port. |  |
| 02R-AC217 | REQ | Package 2R-D > Directional schedule table | Use an em dash for a direction column the selected pattern does not serve. |  |
| 02R-AC218 | REQ | Package 2R-D > Directional schedule table | Show all served scheduled points directly in the row. Do not require expanding a summary row. |  |
| 02R-AC219 | REQ | Package 2R-D > Directional schedule table | Sort rows by first trip time, pattern sequence, and a stable tie-breaker. Allow two rows to have the same first time. |  |
| 02R-AC220 | REQ | Package 2R-D > Directional schedule table | Mark only same-pattern/same-time duplicates, using a subtle icon or row note. Do not block them. |  |
| 02R-AC221 | REQ | Package 2R-D > Directional schedule table | Display 24-plus times without wrapping to a new service day. |  |
| 02R-AC222 | REQ | Package 2R-D > Directional schedule table | Keep the table compact enough for at least 100 visible trip rows to be scanned efficiently. |  |
| 02R-AC223 | REQ | Package 2R-D > Directional schedule table | Use a sticky header and sticky Pattern column when horizontal scrolling is required. |  |
| 02R-AC224 | REQ | Package 2R-D > Directional schedule table | Do not include Generation set, Materialized status, or provenance columns. |  |
| 02R-AC225 | REQ | Package 2R-D > Directional schedule table | Block information may remain a compact right-side placeholder until the Blocking phase, but it must not displace schedule timepoints. |  |
| 02R-AC226 | REQ | Package 2R-D > Directional schedule table | Retain selected-trip shift and Regenerate actions as secondary schedule tools. A compact Shift button, disabled until one or more trips are selected, opens a lightly tinted inline shift tool. |  |
| 02R-AC227 | REQ | Package 2R-D > Directional schedule table | Inline shift tool states Shift selected trips, uses an integer minute field between a minus button (earlier) and plus button (later), shows compact graphical Undo and Redo, and includes Done to hide the tool. |  |
| 02R-AC228 | REQ | Package 2R-D > Directional schedule table | Show a non-blocking result message after every shift, undo, or redo. Undo and Redo apply only to the most recent shift in the active page session; clear this history after a context switch or any non-shift schedule edit. | Superseded by Phase 3R inline-shift-to-drawer change (03R Shift selected Trips drawer; 03R-B-4 removes the inline Shift tool). Undo scope also changed in 03R. |
| 02R-AC229 | REQ | Package 2R-D > Runtime-change state | When saved trips were calculated with an older runtime revision, do not change their displayed times automatically. |  |
| 02R-AC230 | REQ | Package 2R-D > Runtime-change state | Show a restrained Run Times Have Changed status box immediately left of the Trips actions. | 03R Trips action layer says existing stale-Runtime indicators remain visible in the section header or immediately above the table. |
| 02R-AC231 | REQ | Package 2R-D > Runtime-change state | Identify each affected row with visible Run times changed text in its Pattern cell. |  |
| 02R-AC232 | REQ | Package 2R-D > Runtime-change state | Provide Regenerate only when at least one affected trip is selected. |  |
| 02R-AC233 | REQ | Package 2R-D > Runtime-change state | Do not describe trips as stale, materialized, or revision-mismatched. |  |
| 02R-AC234 | REQ | Package 2R-D > Runtime-change state | Show an impact confirmation only when the application reports manual changes or block effects. |  |
| 02R-AC235 | REQ | Package 2R-D > Route-screen direction controls | Terra must design a clearly labeled Directions area on the Route screen. | Conflicts with Decision 0011 note in Accepted decisions item 7 (Route screen does not expose direction or column setup). |
| 02R-AC236 | REQ | Package 2R-D > Route-screen direction controls | Add, rename, reorder, and safely delete a direction. | Reorder commands are recorded as missing in the 2R-D implementation note (open item). |
| 02R-AC237 | REQ | Package 2R-D > Route-screen direction controls | Assign each pattern to one direction. |  |
| 02R-AC238 | REQ | Package 2R-D > Route-screen direction controls | Edit the direction's ordered timetable columns. | Recorded as missing in the 2R-D implementation note (open item). |
| 02R-AC239 | REQ | Package 2R-D > Route-screen direction controls | Map pattern points to direction columns without showing internal IDs. | Explicit point-to-column mapping controls are recorded as missing in the 2R-D implementation note (open item). |
| 02R-AC240 | REQ | Package 2R-D > Route-screen direction controls | Make repeated visits to the same named node distinguishable by position or optional label. |  |
| 02R-AC241 | REQ | Package 2R-D > Route-screen direction controls | Prevent deletion of a direction that still owns patterns unless the user explicitly reassigns them. |  |
| 02R-AC242 | REQ | Package 2R-D > Route-screen direction controls | Direction setup must remain part of Route definition. Do not move direction-column editing into the Trips schedule. |  |
| 02R-AC243 | REQ | Package 2R-D > Accessibility and visual verification | Verify keyboard-only creation of a runtime period. |  |
| 02R-AC244 | REQ | Package 2R-D > Accessibility and visual verification | Verify keyboard-only Generate Trips completion. |  |
| 02R-AC245 | REQ | Package 2R-D > Accessibility and visual verification | Verify keyboard-only Add Trip completion and cancellation. |  |
| 02R-AC246 | REQ | Package 2R-D > Accessibility and visual verification | Verify focus restoration after the Generate Trips modal closes. |  |
| 02R-AC247 | REQ | Package 2R-D > Accessibility and visual verification | Verify accessible names for profile actions, draft-row state, duplicate indicators, and remove icons. |  |
| 02R-AC248 | REQ | Package 2R-D > Accessibility and visual verification | Verify that no state is communicated only by color. |  |
| 02R-AC249 | REQ | Package 2R-D > Accessibility and visual verification | Verify horizontal scrolling with Pattern and headers remaining understandable. |  |
| 02R-AC250 | REQ | Package 2R-D > Accessibility and visual verification | Verify compact rendering at common desktop widths. |  |
| 02R-AC251 | REQ | Package 2R-D > Accessibility and visual verification | Verify a Federal Boulevard-style example with two Southbound patterns interlaced in one table. |  |
| 02R-AC252 | REQ | Package 2R-D > Accessibility and visual verification | Verify Weekday, Saturday, Sunday, Holiday order in every visible selector. |  |
| 02R-AC253 | AC | Package 2R-D > Terra acceptance checklist | Step 1: select Weekday. |  |
| 02R-AC254 | AC | Package 2R-D > Terra acceptance checklist | Step 2: select Southbound. |  |
| 02R-AC255 | AC | Package 2R-D > Terra acceptance checklist | Step 3: select Southbound 1 and use its Default profile. |  |
| 02R-AC256 | AC | Package 2R-D > Terra acceptance checklist | Step 4: enter runtime periods using both 5.5 and 5:30 forms and see :05:30 after commit. |  |
| 02R-AC257 | AC | Package 2R-D > Terra acceptance checklist | Step 5: generate Southbound 1 trips every 15 minutes. |  |
| 02R-AC258 | AC | Package 2R-D > Terra acceptance checklist | Step 6: generate Southbound 2 trips every 15 minutes with an offset first time. |  |
| 02R-AC259 | AC | Package 2R-D > Terra acceptance checklist | Step 7: see both patterns interlaced in one schedule. |  |
| 02R-AC260 | AC | Package 2R-D > Terra acceptance checklist | Step 8: add one trip through the draft-row workflow. |  |
| 02R-AC261 | AC | Package 2R-D > Terra acceptance checklist | Step 9: change that row's pattern and see its served timepoints recalculate. |  |
| 02R-AC262 | AC | Package 2R-D > Terra acceptance checklist | Step 10: edit a runtime period and see existing trips remain fixed with a Recalculate action. |  |
| 02R-AC263 | AC | Package 2R-D > Terra acceptance checklist | Step 11: view an after-midnight trip such as 25:07 without date conversion. |  |
| 02R-AC264 | GATE | Package 2R-D > Gate | Run relevant UI tests, TypeScript typechecking, the production build, accessibility checks, and browser visual inspection. Pause for the user's hands-on verification before Package 2R-E. |  |
| 02R-AC265 | REQ | Package 2R-D implementation note (2026-09-11) | A direction cannot be deleted while patterns use it. | Recorded behavior in the implementation note. |
| 02R-AC266 | REQ | Package 2R-D implementation note (2026-09-11) | Pattern deletion removes dependent profiles, assignments, trips, historical generation records, and linked block activities after confirmation. | Recorded behavior in the implementation note. |
| 02R-AC267 | REQ | Package 2R-D implementation note (2026-09-11) | Trip deletion removes linked revenue activities while retaining empty blocks. | Recorded behavior in the implementation note. |
| 02R-AC268 | REQ | Package 2R-D implementation note (2026-09-11) | Runtime profiles cannot be deleted while saved trips retain them as a calculation source. | Recorded behavior in the implementation note. |
| 02R-AC269 | AC | Package 2R-E > Acceptance criteria | The Service, Runtimes, and Trips sections form a visible A-to-B-to-C workflow. |  |
| 02R-AC270 | AC | Package 2R-E > Acceptance criteria | Every usable pattern can begin with a Default runtime profile. |  |
| 02R-AC271 | AC | Package 2R-E > Acceptance criteria | Shared-profile day usage is visible before editing. |  |
| 02R-AC272 | AC | Package 2R-E > Acceptance criteria | Runtime durations accept decimal minutes, standard MM:SS, and displayed :MM / :MM:SS forms and display correctly. |  |
| 02R-AC273 | AC | Package 2R-E > Acceptance criteria | Generate Trips is additive and persists no generation instruction. |  |
| 02R-AC274 | AC | Package 2R-E > Acceptance criteria | Add Trip requires only a pattern and first time. |  |
| 02R-AC275 | AC | Package 2R-E > Acceptance criteria | The combined timetable shows all patterns in the selected direction. |  |
| 02R-AC276 | AC | Package 2R-E > Acceptance criteria | Missing pattern points display as em dashes. |  |
| 02R-AC277 | AC | Package 2R-E > Acceptance criteria | Pattern changes and recalculation retain trip IDs. |  |
| 02R-AC278 | AC | Package 2R-E > Acceptance criteria | Runtime changes do not silently alter trips. |  |
| 02R-AC279 | AC | Package 2R-E > Acceptance criteria | Exact duplicates are allowed and identified without blocking. |  |
| 02R-AC280 | AC | Package 2R-E > Acceptance criteria | Weekday, Saturday, Sunday, Holiday ordering is universal. |  |
| 02R-AC281 | AC | Package 2R-E > Acceptance criteria | 24-plus times remain intact. |  |
| 02R-AC282 | AC | Package 2R-E > Acceptance criteria | At least 500 trips can be queried, ordered, displayed, backed up, and restored. |  |
| 02R-AC283 | AC | Package 2R-E > Acceptance criteria | Automated tests, typechecking, production build, reload, and visual review pass. |  |
| 02R-AC284 | REQ | Package 2R-E > Deliverables | Review domain, application, persistence, and UI boundaries. |  |
| 02R-AC285 | REQ | Package 2R-E > Deliverables | Confirm that React contains no authoritative runtime or trip calculations. |  |
| 02R-AC286 | REQ | Package 2R-E > Deliverables | Confirm that the old generation-set workflow and terminology are removed. |  |
| 02R-AC287 | REQ | Package 2R-E > Deliverables | Confirm that JSON backup, import-as-copy, scenario duplication, and CSV operate on the revised graph. |  |
| 02R-AC288 | REQ | Package 2R-E > Deliverables | Confirm that the draft Phase 3 service-day copy plan is rewritten to copy runtime assignments and authoritative trips without generation sets. |  |
| 02R-AC289 | REQ | Package 2R-E > Deliverables | Update architecture, schema, glossary, decisions, UI conventions, and project status. |  |
| 02R-AC290 | REQ | Package 2R-E > Deliverables | Record a Phase 2R closeout. |  |
| 02R-AC291 | GATE | Package 2R-E > Closeout gate | Present the revised Phase 3 service-day workflow plan and recommended model. Do not begin Phase 3 automatically. |  |
| 02R-AC292 | REQ | Anchored regeneration follow-up (2026-10-20) | For a later fixed timepoint, calculate the implied first departure under each runtime band. |  |
| 02R-AC293 | REQ | Anchored regeneration follow-up (2026-10-20) | Use an applicable band when exactly one exists. |  |
| 02R-AC294 | REQ | Anchored regeneration follow-up (2026-10-20) | If no applicable band exists, use the uniquely nearest band only when its implied departure is within ten minutes of that band's boundary. |  |
| 02R-AC295 | REQ | Anchored regeneration follow-up (2026-10-20) | Keep the fixed timepoint unchanged, label the exception in the preview, and require the normal preview application. |  |
| 02R-AC296 | REQ | Anchored regeneration follow-up (2026-10-20) | Multiple applicable bands, nearest-band ties, and larger gaps require an explicit band or anchor choice. |  |
| 02R-AC297 | REQ | Anchored regeneration follow-up (2026-10-20) | First-departure anchoring retains normal departure-based band selection. |  |
| 02R-AC298 | TST | Anchored regeneration follow-up (2026-10-20) | Test the boundary, tie, threshold, manual selection, and preview behavior. |  |
| 02R-AC299 | REQ | Regeneration preview changes (2026-10-21) | For each selected Trip, show signed changes to its first departure, last timepoint, and total Run Time beside the existing current-to-new comparisons. |  |
| 02R-AC300 | REQ | Regeneration preview changes (2026-10-21) | Derive those values from the current Trip and recalculation preview. Show an em dash until a valid preview is available. Keep second-level precision when needed. |  |
| 02R-AC301 | REQ | Regeneration preview changes (2026-10-21) | Show the current and regenerated layover to the next Block Trip, after assigned deadhead, plus its signed change. Leave layover undefined where a connection lacks required deadhead. | Depends on Phase 4 Block data; 04 defines the Block layover model. |
| 02R-AC302 | REQ | Regeneration preview changes (2026-10-21) | Warn on any selected Trip whose regeneration creates an overlap with its adjacent Block Trip, but allow the user to proceed. |  |
| 02R-AC303 | REQ | Regeneration preview changes (2026-10-21) | Include adjacent unselected Trip times in stale-preview review. |  |
| 02R-AC304 | REQ | Regeneration preview changes (2026-10-21) | In the Trips table, mark both Trips in any connection with a Blocking finding in the active Blocking Scenario. Place a compact warning icon beside each affected Block pill and expose the specific reason on hover and to assistive technology. | Phase 4 (Blocking) dependency; criterion appears in a 2026-10-21 follow-up inside a Phase 2R doc. |
| 02R-AC305 | REQ | Segment-start and display follow-up (2026-10-21) | Add the segment-start runtime method under Runtimes Actions while preserving legacy continuous-blend profiles. |  |
| 02R-AC306 | REQ | Segment-start and display follow-up (2026-10-21) | Each segment selects its band at its start and adds its entered duration exactly. |  |
| 02R-AC307 | REQ | Segment-start and display follow-up (2026-10-21) | A method switch changes the calculation revision and requires explicit regeneration. Saved Trips stay fixed. |  |
| 02R-AC308 | REQ | Segment-start and display follow-up (2026-10-21) | Show one band color per segment when the current calculation reproduces its saved times. |  |
| 02R-AC309 | REQ | Segment-start and display follow-up (2026-10-21) | In Trips Actions, add an off-by-default Round displayed times option that rounds table clock times to the nearest minute, with 30 seconds rounded up. |  |
| 02R-AC310 | REQ | Segment-start and display follow-up (2026-10-21) | The default table view shows nonzero seconds. Neither display mode changes calculations or exports. |  |
| 02R-AC311 | REQ | Headway display follow-up (2026-10-21) | Add Show headways to Trips Actions Display. |  |
| 02R-AC312 | REQ | Headway display follow-up (2026-10-21) | Each timepoint column uses the chronological predecessor among Trips that serve that same column, regardless of pattern or table row order. Skipped timepoints do not affect the sequence. |  |
| 02R-AC313 | REQ | Headway display follow-up (2026-10-21) | Show the first Trip's scheduled clock time with a subtle accent; show subsequent exact headway durations. |  |
| 02R-AC314 | REQ | Headway display follow-up (2026-10-21) | The setting changes only the Trips table view and works with staged shifts and the existing rounding option. |  |

### 02RS: `docs/implementation/phase-02r-safe-route-editing.md`

Criteria in this document: 198.

| ID | Kind | Source heading | Criterion | Flag |
| --- | --- | --- | --- | --- |
| 02RS-AC1 | REQ | Status (post-implementation refinement, 2026-09-14) | Route and Scenario deletion reports downstream counts before an atomic irreversible delete. |  |
| 02RS-AC2 | REQ | Status (post-implementation refinement, 2026-09-14) | Route deletion retains Blocks but removes affected revenue-trip activities. |  |
| 02RS-AC3 | REQ | Status (post-implementation refinement, 2026-09-14) | Scenario deletion removes its complete owned graph and is blocked when it is the Project's only Scenario. | See Decision 0015 per the Status text. |
| 02RS-AC4 | AC | Confirmed implementation decisions (item 1) | Predecessor-to-new point runtime is zero; new-to-successor retains the former runtime. | Also stated in Status and Insertion convention. |
| 02RS-AC5 | AC | Confirmed implementation decisions (item 2) | Contradictory Direction order blocks Save Pattern and has no destructive override. |  |
| 02RS-AC6 | AC | Confirmed implementation decisions (item 3) | Ambiguous but valid Pattern changes require resetting the service owned by that Pattern. |  |
| 02RS-AC7 | AC | Confirmed implementation decisions (item 4) | New Nodes must be saved before a Pattern draft can use them. |  |
| 02RS-AC8 | REQ | Required model and ownership | Terra owns the complete package: domain behavior, application ports, persistence wiring, React UI, styling, and verification. This is an explicit exception to the normal Luna/Terra split. |  |
| 02RS-AC9 | REQ | Required model and ownership | React owns drafts and presentation only. |  |
| 02RS-AC10 | REQ | Required model and ownership | Pure TypeScript domain functions calculate changes, rebalancing, conflicts, and impacts. |  |
| 02RS-AC11 | REQ | Required model and ownership | Application services coordinate previews and commits. |  |
| 02RS-AC12 | REQ | Required model and ownership | IndexedDB applies related writes atomically. |  |
| 02RS-AC13 | AC | Objective (user capabilities) | Users must be able to edit Nodes without committing each field. |  |
| 02RS-AC14 | AC | Objective (user capabilities) | Users must be able to edit one Pattern without committing each point change. |  |
| 02RS-AC15 | AC | Objective (user capabilities) | Users must be able to review downstream impacts before saving. |  |
| 02RS-AC16 | AC | Objective (user capabilities) | Users must be able to preserve service when reconciliation is deterministic. |  |
| 02RS-AC17 | AC | Objective (user capabilities) | Users must be able to explicitly reset dependent service when meaning cannot be preserved. |  |
| 02RS-AC18 | AC | Objective (user capabilities) | Users must be able to understand and correct timetable-order conflicts before saving. |  |
| 02RS-AC19 | AC | Objective (user capabilities) | Users must be able to discard drafts without changing saved data. |  |
| 02RS-AC20 | REQ | Governing policy | The application must not save a knowingly inconsistent state. |  |
| 02RS-AC21 | REQ | Governing policy | Save deterministic changes with automatic rebalancing. |  |
| 02RS-AC22 | REQ | Governing policy | Require an explicit reset for valid changes whose downstream meaning is ambiguous. |  |
| 02RS-AC23 | REQ | Governing policy | Block contradictory Direction orders. Deleting runtimes or trips cannot make contradictory Patterns compatible. |  |
| 02RS-AC24 | REQ | Governing policy | Recalculate impacts at commit time so an old preview cannot overwrite newer data. |  |
| 02RS-AC25 | REQ | Governing policy | Canceling a preview performs no writes. |  |
| 02RS-AC26 | REQ | Runtime insertion convention | When B is inserted between A and C: A-to-B begins at zero seconds in every runtime band. |  |
| 02RS-AC27 | REQ | Runtime insertion convention | The former A-to-C runtime becomes B-to-C. |  |
| 02RS-AC28 | REQ | Runtime insertion convention | B receives A's scheduled time on existing trips. C and every later scheduled time remain unchanged. |  |
| 02RS-AC29 | REQ | Runtime insertion convention | Adding a new first point gives it the former first point's time and creates a zero first segment. Adding a final point creates a zero final segment and gives it the former final time. |  |
| 02RS-AC30 | REQ | Draft behavior > Nodes | The Nodes table edits a local draft collection. Text, type, additions, and pending deletions remain unsaved until Save Nodes. |  |
| 02RS-AC31 | REQ | Draft behavior > Nodes | New Nodes receive IDs in the draft but are not persisted immediately. |  |
| 02RS-AC32 | REQ | Draft behavior > Nodes | Pending deletions remain visible as Will be deleted and provide Undo. |  |
| 02RS-AC33 | REQ | Draft behavior > Nodes | Pattern selectors use saved Nodes. A new Node must be saved before use in a Pattern. |  |
| 02RS-AC34 | REQ | Draft behavior > Nodes | Save Nodes is enabled only for a changed, valid draft. |  |
| 02RS-AC35 | REQ | Draft behavior > Nodes | Discard Changes restores the saved collection. |  |
| 02RS-AC36 | REQ | Draft behavior > Patterns | Name, Direction, Label, points, Node choices, order, and miles edit one local draft. |  |
| 02RS-AC37 | REQ | Draft behavior > Patterns | Add Pattern creates an unsaved draft and does not create columns, runtimes, or trips. |  |
| 02RS-AC38 | REQ | Draft behavior > Patterns | Duplicate and Duplicate Reverse also create unsaved drafts. |  |
| 02RS-AC39 | REQ | Draft behavior > Patterns | Only one Pattern draft is active. |  |
| 02RS-AC40 | REQ | Draft behavior > Patterns | Save Pattern is enabled only for a changed, basically valid draft. |  |
| 02RS-AC41 | REQ | Draft behavior > Patterns | Discard restores the saved Pattern or removes an unsaved new Pattern. |  |
| 02RS-AC42 | REQ | Navigation with unsaved work | Changing Pattern, route, scenario, project, or primary tab while a draft is dirty opens Save, Discard, and Cancel choices. |  |
| 02RS-AC43 | REQ | Navigation with unsaved work | Save uses the normal preview and impact flow. Discard completes navigation without writing. Cancel returns focus to the editor. |  |
| 02RS-AC44 | REQ | Navigation with unsaved work | Browser reload or close uses a final before-unload safeguard. |  |
| 02RS-AC45 | REQ | Navigation with unsaved work | If Nodes and Pattern are both dirty, resolve the Pattern draft first. |  |
| 02RS-AC46 | REQ | Change classification | The domain layer compares saved and proposed records. React must not infer these classes. |  |
| 02RS-AC47 | REQ | Change classification > Node changes | Rename, short name, type, or notes: save metadata; headers reload automatically. |  |
| 02RS-AC48 | REQ | Change classification > Node changes | Add Node: save with no downstream effect until used by a Pattern. |  |
| 02RS-AC49 | REQ | Change classification > Node changes | Delete unused Node: delete after a no-impact confirmation. |  |
| 02RS-AC50 | REQ | Change classification > Node changes | Delete used Node: preview affected Pattern occurrences, profiles, trips, and blocks; apply point-removal rules atomically after confirmation. |  |
| 02RS-AC51 | REQ | Change classification > Node changes | Deleting a route Node removes every occurrence from every affected Pattern. Removing a Node from one Pattern remains a separate Pattern-point action. |  |
| 02RS-AC52 | REQ | Change classification > Pattern changes | Name or Label: metadata-only; no downstream change. |  |
| 02RS-AC53 | REQ | Change classification > Pattern changes | Cumulative miles only: distance-only; times unchanged. |  |
| 02RS-AC54 | REQ | Change classification > Pattern changes | Add point without reordering retained points: deterministic; insert zero runtime and one scheduled point. |  |
| 02RS-AC55 | REQ | Change classification > Pattern changes | Remove point without reordering retained points: deterministic; merge runtimes and remove one scheduled point. |  |
| 02RS-AC56 | REQ | Change classification > Pattern changes | Change a point's Node without reordering: deterministic if timetable reconciliation succeeds; preserve segment values and scheduled time. |  |
| 02RS-AC57 | REQ | Change classification > Pattern changes | Change Direction: deterministic if target reconciliation succeeds; preserve profiles and trips; move table context. |  |
| 02RS-AC58 | REQ | Change classification > Pattern changes | Reorder retained points: ambiguous; reset service required. |  |
| 02RS-AC59 | REQ | Change classification > Pattern changes | Broad point replacement without retained anchors: ambiguous; reset service required. |  |
| 02RS-AC60 | REQ | Change classification > Pattern changes | Contradict another Pattern's Direction order: invalid; block save; no override. |  |
| 02RS-AC61 | REQ | Runtime rebalancing | Apply transformations to every band in every profile owned by the Pattern. |  |
| 02RS-AC62 | REQ | Runtime rebalancing > Insert | Insert zero before the new point. Move the former predecessor-to-successor duration after the new point. Preserve all other segment durations. |  |
| 02RS-AC63 | REQ | Runtime rebalancing > Remove | For a middle removal, sum both adjoining durations into the new direct segment. For a first or final removal, remove the boundary segment. Preserve all other durations. |  |
| 02RS-AC64 | REQ | Runtime rebalancing > Multiple edits | Compare stable Pattern-point IDs, not array positions alone. |  |
| 02RS-AC65 | REQ | Runtime rebalancing > Multiple edits | Preserve total runtime between every pair of retained anchor points. |  |
| 02RS-AC66 | REQ | Runtime rebalancing > Multiple edits | If retained anchor order changes, require reset rather than guessing. |  |
| 02RS-AC67 | REQ | Runtime rebalancing > Multiple edits | Increment each changed profile revision once per save. |  |
| 02RS-AC68 | REQ | Trip reconciliation | For every existing trip using the Pattern, insert a new scheduled point at its predecessor's time; use the former first time when inserting a new first point. |  |
| 02RS-AC69 | REQ | Trip reconciliation | Remove deleted scheduled points. Retain all surviving Pattern-point IDs and scheduled times. |  |
| 02RS-AC70 | REQ | Trip reconciliation | Preserve trip ID, creation method, manual shift, and manually changed fields. |  |
| 02RS-AC71 | REQ | Trip reconciliation | Update the recorded source revision when its profile was rebalanced. |  |
| 02RS-AC72 | REQ | Trip reconciliation | Do not create a Run Times Have Changed state solely from completed deterministic reconciliation. |  |
| 02RS-AC73 | REQ | Trip reconciliation | Trips already using a different or missing runtime source retain their existing changed-runtime status. |  |
| 02RS-AC74 | REQ | Direction timetable reconciliation | Use every proposed saved Pattern in the Direction, including the draft being previewed. |  |
| 02RS-AC75 | REQ | Direction timetable reconciliation > Algorithm | Step 1: preserve point-to-column mappings whose Node still matches. |  |
| 02RS-AC76 | REQ | Direction timetable reconciliation > Algorithm | Step 2: treat each adjacent Pattern-point pair as a before/after constraint. |  |
| 02RS-AC77 | REQ | Direction timetable reconciliation > Algorithm | Step 3: give repeated visits to one Node distinct columns. |  |
| 02RS-AC78 | REQ | Direction timetable reconciliation > Algorithm | Step 4: allocate a new column for an added occurrence unless one unambiguous unused same-Node column satisfies every constraint. |  |
| 02RS-AC79 | REQ | Direction timetable reconciliation > Algorithm | Step 5: perform a stable topological sort, using existing column order as the tie-breaker. |  |
| 02RS-AC80 | REQ | Direction timetable reconciliation > Algorithm | Step 6: if acyclic, assign contiguous sequences and remap affected points. |  |
| 02RS-AC81 | REQ | Direction timetable reconciliation > Algorithm | Step 7: remove columns no saved Pattern uses. |  |
| 02RS-AC82 | REQ | Direction timetable reconciliation > Algorithm | Step 8: if cyclic, return a conflict and perform no writes. |  |
| 02RS-AC83 | REQ | Direction timetable reconciliation > Conflict result | The conflict result must name the Direction. |  |
| 02RS-AC84 | REQ | Direction timetable reconciliation > Conflict result | The conflict result must name all directly conflicting Patterns. |  |
| 02RS-AC85 | REQ | Direction timetable reconciliation > Conflict result | The conflict result must name the smallest identifiable timepoint pair with reversed order. |  |
| 02RS-AC86 | REQ | Direction timetable reconciliation > Conflict result | The conflict result states whether choosing the opposite Direction would resolve it, when determinable without a write. |  |
| 02RS-AC87 | REQ | Direction timetable reconciliation > Conflict result | Example message: Southbound 1 places Alameda before Evans, while Southbound 2 places Evans before Alameda. Change one Pattern's Node order or Direction before saving. |  |
| 02RS-AC88 | REQ | Direction timetable reconciliation | After a successful save, reload the authoritative aggregate. The Trips table immediately uses the reconciled columns. No Rebuild action is required. |  |
| 02RS-AC89 | REQ | Impact preview > Pattern preview result | The application result includes classification, added/removed/moved/Node-changed points, and affected timetable columns. |  |
| 02RS-AC90 | REQ | Impact preview > Pattern preview result | The application result includes profile and runtime-band counts, trip counts by service day, and affected block IDs and labels. |  |
| 02RS-AC91 | REQ | Impact preview > Pattern preview result | The application result includes whether rebalance is available, whether reset is required, conflict details, and records proposed for update or deletion. |  |
| 02RS-AC92 | REQ | Impact preview > Pattern preview UI behavior | Deterministic: Save Pattern dialog with Save and rebalance. |  |
| 02RS-AC93 | REQ | Impact preview > Pattern preview UI behavior | Ambiguous but valid: Reset service for this Pattern? with destructive Save and reset service. |  |
| 02RS-AC94 | REQ | Impact preview > Pattern preview UI behavior | Direction conflict: local blocked-save message; no destructive override. |  |
| 02RS-AC95 | REQ | Impact preview > Pattern preview UI behavior | Metadata-only or distance-only: save directly when no future block or costing impact exists. |  |
| 02RS-AC96 | REQ | Impact preview > Node preview | Metadata and additions may save directly. Any pending deletion opens one combined preview listing deleted Nodes, Pattern occurrences, profiles, trips, block references, and Patterns that would fall below two points. |  |
| 02RS-AC97 | REQ | Impact preview > Node preview | Use Delete Nodes and update service when every impact is deterministic. |  |
| 02RS-AC98 | REQ | Impact preview > Node preview | Use Delete Nodes and reset affected service when any affected Pattern requires reset. |  |
| 02RS-AC99 | REQ | Reset behavior | Reset only the affected Pattern's dependent service. |  |
| 02RS-AC100 | REQ | Reset behavior > Delete | Delete runtime profiles owned by the Pattern, assignments referencing those profiles, and trips using the Pattern. |  |
| 02RS-AC101 | REQ | Reset behavior > Delete | Delete revenue-trip block activities referencing those trips and the historical generation records for the Pattern while retained. |  |
| 02RS-AC102 | REQ | Reset behavior > Retain | Retain the valid saved Pattern and reconciled mappings, unaffected Patterns and service, and Nodes not explicitly deleted. |  |
| 02RS-AC103 | REQ | Reset behavior > Retain | Retain block records after affected activities are removed, including empty blocks. |  |
| 02RS-AC104 | REQ | Reset behavior | The structural save and reset occur in one transaction. |  |
| 02RS-AC105 | REQ | Application contracts | Application layer exposes equivalent previewNodeChanges(aggregate, proposedNodes) and commitNodeChanges(previewToken, mode). | Exact names may vary per the doc. |
| 02RS-AC106 | REQ | Application contracts | Application layer exposes equivalent previewPatternChange(aggregate, savedPatternId, proposedPattern) and commitPatternChange(previewToken, mode). |  |
| 02RS-AC107 | REQ | Application contracts | Commit modes are rebalance or reset. |  |
| 02RS-AC108 | REQ | Application contracts | The preview token represents the source record versions. Commit reloads authoritative records and rejects a mismatch with: Route or service data changed after this review. Review the impacts again. |  |
| 02RS-AC109 | REQ | Application contracts | React must not send an authoritative deletion list back to the commit command. |  |
| 02RS-AC110 | REQ | Persistence | Add one atomic repository operation capable of writing the route aggregate, Nodes, Patterns, Directions, and columns, runtime profiles and assignments, trips, blocks, and historical generation records while retained. |  |
| 02RS-AC111 | REQ | Persistence | Every write succeeds or none does. |  |
| 02RS-AC112 | REQ | Persistence | No schema change is expected. If an index or entity is required, stop, document a migration, add migration tests, and update the data schema before proceeding. |  |
| 02RS-AC113 | REQ | UI requirements > Nodes section | Add Save Nodes and Discard Changes beneath the table. Keep New Node in the table-action area. |  |
| 02RS-AC114 | REQ | UI requirements > Nodes section | Disable Save until the draft is changed and valid. |  |
| 02RS-AC115 | REQ | UI requirements > Nodes section | Mark new and pending-deletion rows with text or an icon plus color. |  |
| 02RS-AC116 | REQ | UI requirements > Nodes section | Replace immediate deletion with pending deletion and Undo. Reload the authoritative aggregate after save. |  |
| 02RS-AC117 | REQ | UI requirements > Patterns section | Add Save Pattern and Discard Changes in the Pattern action area. |  |
| 02RS-AC118 | REQ | UI requirements > Patterns section | Keep Duplicate, Duplicate Reverse, Delete, and Add Node visually secondary. |  |
| 02RS-AC119 | REQ | UI requirements > Patterns section | Mark an unsaved new Pattern in the Pattern list and show an unsaved indicator beside the selected Pattern. |  |
| 02RS-AC120 | REQ | UI requirements > Patterns section | Do not update Runtimes or Trips while the Pattern is a draft. |  |
| 02RS-AC121 | REQ | UI requirements > Patterns section | Put specific timetable conflicts beside Save Pattern. |  |
| 02RS-AC122 | REQ | UI requirements > Patterns section | Preserve the draft after a failed preview or canceled dialog. |  |
| 02RS-AC123 | REQ | UI requirements > Patterns section | Reload Route and Trips after save and repair invalid selections. |  |
| 02RS-AC124 | REQ | UI requirements > Feedback and accessibility | Use local validation for incomplete drafts. |  |
| 02RS-AC125 | REQ | UI requirements > Feedback and accessibility | Use modals only for rebalance, reset, discard, or cancel decisions. |  |
| 02RS-AC126 | REQ | UI requirements > Feedback and accessibility | Do not use a global banner for an ordinary order conflict. |  |
| 02RS-AC127 | REQ | UI requirements > Feedback and accessibility | Focus the first unresolved field after a blocked save. |  |
| 02RS-AC128 | REQ | UI requirements > Feedback and accessibility | Do not communicate draft, deletion, warning, or conflict by color alone. |  |
| 02RS-AC129 | REQ | Terra implementation sequence | Step 1: characterize existing Node, Pattern, direction, runtime, trip, and block behavior with tests. |  |
| 02RS-AC130 | REQ | Terra implementation sequence | Step 2: add stable-ID diffs, classifiers, runtime transforms, trip transforms, and direction reconciliation as pure domain functions. |  |
| 02RS-AC131 | REQ | Terra implementation sequence | Step 3: add application previews, stale-preview protection, rebalance commits, reset commits, and planner-facing errors. |  |
| 02RS-AC132 | REQ | Terra implementation sequence | Step 4: add and failure-test the atomic repository transaction. |  |
| 02RS-AC133 | REQ | Terra implementation sequence | Step 5: convert Nodes and Pattern editors to drafts and wire all save, discard, impact, reset, and navigation interactions. |  |
| 02RS-AC134 | REQ | Terra implementation sequence | Step 6: remove active immediate Node/Pattern writes and the generic timetable-order error path. |  |
| 02RS-AC135 | REQ | Terra implementation sequence | Step 7: update architecture, schema, glossary, UI conventions, decision records, and Phase 2R status. |  |
| 02RS-AC136 | TST | Required domain tests | Metadata edits do not affect runtimes or trips. |  |
| 02RS-AC137 | TST | Required domain tests | Added unused Nodes have no downstream effect. |  |
| 02RS-AC138 | TST | Required domain tests | Deleting used Nodes reports every Pattern occurrence. |  |
| 02RS-AC139 | TST | Required domain tests | Middle, first, and final insertion use the defined zero convention in every band. |  |
| 02RS-AC140 | TST | Required domain tests | Middle removal sums adjoining runtimes in every band. |  |
| 02RS-AC141 | TST | Required domain tests | Boundary removal removes the correct segment. |  |
| 02RS-AC142 | TST | Required domain tests | Multiple edits preserve runtime between retained anchors. |  |
| 02RS-AC143 | TST | Required domain tests | Retained point IDs, trip IDs, and retained scheduled times remain stable. |  |
| 02RS-AC144 | TST | Required domain tests | Added points receive new IDs and predecessor times. |  |
| 02RS-AC145 | TST | Required domain tests | Manual shifts and changed fields survive reconciliation. |  |
| 02RS-AC146 | TST | Required domain tests | Profile revision increments once. |  |
| 02RS-AC147 | TST | Required domain tests | Compatible full and short Patterns produce one stable order. |  |
| 02RS-AC148 | TST | Required domain tests | Prefixes and suffixes insert correctly. |  |
| 02RS-AC149 | TST | Required domain tests | Loop visits receive distinct columns. |  |
| 02RS-AC150 | TST | Required domain tests | Stable ordering preserves previous order when constraints do not decide. |  |
| 02RS-AC151 | TST | Required domain tests | Orphan columns are removed. |  |
| 02RS-AC152 | TST | Required domain tests | Contradictions return named conflict details and no commit. |  |
| 02RS-AC153 | TST | Required domain tests | Compatible Direction changes preserve service. |  |
| 02RS-AC154 | TST | Required domain tests | Reordering retained points requires reset. |  |
| 02RS-AC155 | TST | Required domain tests | Reset impact includes profiles, assignments, trips, historical records, and block references. |  |
| 02RS-AC156 | TST | Required domain tests | A stale preview cannot commit. |  |
| 02RS-AC157 | TST | Required persistence tests | Deterministic Pattern save round trip. |  |
| 02RS-AC158 | TST | Required persistence tests | Node cascade round trip. |  |
| 02RS-AC159 | TST | Required persistence tests | Pattern reset round trip. |  |
| 02RS-AC160 | TST | Required persistence tests | Block cleanup retains block records. |  |
| 02RS-AC161 | TST | Required persistence tests | Forced failure leaves every record group unchanged. |  |
| 02RS-AC162 | TST | Required persistence tests | Backup/restore and scenario duplication preserve reconciled mappings. |  |
| 02RS-AC163 | TST | Required persistence tests | No migration occurs unless explicitly documented. |  |
| 02RS-AC164 | TST | Required UI tests | Node and Pattern edits do not persist before Save. |  |
| 02RS-AC165 | TST | Required UI tests | Both Discard actions restore saved data. |  |
| 02RS-AC166 | TST | Required UI tests | Pending Node deletion can be undone. |  |
| 02RS-AC167 | TST | Required UI tests | Add Pattern remains unsaved until Save Pattern. |  |
| 02RS-AC168 | TST | Required UI tests | Dirty navigation offers Save, Discard, and Cancel. |  |
| 02RS-AC169 | TST | Required UI tests | Deterministic and destructive dialogs use the correct actions. |  |
| 02RS-AC170 | TST | Required UI tests | A Direction conflict names Patterns and timepoints, remains local, and blocks save. |  |
| 02RS-AC171 | TST | Required UI tests | Canceling preserves the draft. |  |
| 02RS-AC172 | TST | Required UI tests | Successful save updates Trips headers without Rebuild. |  |
| 02RS-AC173 | TST | Required UI tests | Reconciled trips remain under the correct columns. |  |
| 02RS-AC174 | TST | Required UI tests | Keyboard-only editing and dialog operation work. |  |
| 02RS-AC175 | TST | Required UI tests | Focus returns appropriately. |  |
| 02RS-AC176 | TST | Required UI tests | No state is color-only. |  |
| 02RS-AC177 | TST | Required UI tests | Dense Route layout remains usable at supported desktop widths. |  |
| 02RS-AC178 | REQ | Performance targets | Preview 20 Patterns, 100 columns, 20 profiles, and 2,000 trips within one second on a typical desktop. |  |
| 02RS-AC179 | REQ | Performance targets | Commit 2,000 reconciled trips atomically. |  |
| 02RS-AC180 | REQ | Performance targets | Do not regress the current 500-trip display requirement. |  |
| 02RS-AC181 | AC | Acceptance walkthrough | Step 1: save route Nodes. |  |
| 02RS-AC182 | AC | Acceptance walkthrough | Step 2: create an Outbound Pattern and verify Trips does not change before Save Pattern. |  |
| 02RS-AC183 | AC | Acceptance walkthrough | Step 3: save and see correct columns. |  |
| 02RS-AC184 | AC | Acceptance walkthrough | Step 4: save a compatible short-turn Pattern into the same table. |  |
| 02RS-AC185 | AC | Acceptance walkthrough | Step 5: attempt a contradictory Pattern and receive a specific blocked-save explanation. |  |
| 02RS-AC186 | AC | Acceptance walkthrough | Step 6: correct and save it. |  |
| 02RS-AC187 | AC | Acceptance walkthrough | Step 7: add a point to a Pattern with several bands and trips. |  |
| 02RS-AC188 | AC | Acceptance walkthrough | Step 8: save and rebalance; verify zero insertion and unchanged later trip times. |  |
| 02RS-AC189 | AC | Acceptance walkthrough | Step 9: remove it; verify merged runtimes and retained trip times. |  |
| 02RS-AC190 | AC | Acceptance walkthrough | Step 10: reorder points; inspect reset impact and cancel without writes. |  |
| 02RS-AC191 | AC | Acceptance walkthrough | Step 11: repeat and reset; verify only that Pattern's dependent service is removed. |  |
| 02RS-AC192 | AC | Acceptance walkthrough | Step 12: rename a Node and verify headers change only after Save Nodes. |  |
| 02RS-AC193 | AC | Acceptance walkthrough | Step 13: delete a used Node and inspect the complete impact. |  |
| 02RS-AC194 | AC | Acceptance walkthrough | Step 14: reload and verify consistency across Route, Runtimes, Trips, and blocks. |  |
| 02RS-AC195 | GATE | Verification gate | Run all Vitest and Playwright tests; run focused persistence and migration tests; run TypeScript typechecking and production build. |  |
| 02RS-AC196 | GATE | Verification gate | Inspect all draft, dialog, conflict, and corrected timetable states visually; confirm React contains no reconciliation calculations. |  |
| 02RS-AC197 | GATE | Verification gate | Inspect IndexedDB after deterministic and destructive cases; verify backup/restore and scenario duplication. |  |
| 02RS-AC198 | GATE | Verification gate | Hands-on user verification was accepted on 2026-09-14. Proceed only through the separately approved Package 2R-E or Phase 3 planning gate. |  |

### 02TP: `docs/implementation/phase-02tp-trip-profiles.md`

Criteria in this document: 142.

| ID | Kind | Source heading | Criterion | Flag |
| --- | --- | --- | --- | --- |
| 02TP-AC1 | REQ | Model and ownership | Luna is recommended for Packages 2TP-A through 2TP-C. Luna must reuse existing controls, spacing, dialogs, and accessibility conventions without making independent visual-design decisions. |  |
| 02TP-AC2 | REQ | Model and ownership | The primary agent owns Package 2TP-D integration review and final acceptance. |  |
| 02TP-AC3 | AC | Objective | Users can maintain a Default Trip profile, rename it, copy it, and delete eligible alternatives. |  |
| 02TP-AC4 | AC | Objective | Every trip command and schedule query operates within the selected Trip profile. |  |
| 02TP-AC5 | AC | Objective | Future blocking receives one explicit source Trip profile and cannot mix competing timetable alternatives. |  |
| 02TP-AC6 | REQ | User workflow | Trip Profile and its lifecycle actions appear inside the Trips panel, directly below the Trips header and above the schedule table. Route, Day, and Direction stay in the shared workspace row. |  |
| 02TP-AC7 | REQ | User workflow | Default is selected automatically in a new or migrated Scenario. |  |
| 02TP-AC8 | REQ | User workflow | Rename changes only the Trip profile name. |  |
| 02TP-AC9 | REQ | User workflow | Copy requests a new name and duplicates the entire profile's Trips across all Routes and service days. |  |
| 02TP-AC10 | REQ | User workflow | Delete opens an impact dialog. It removes the profile and its complete trip branch only after confirmation. |  |
| 02TP-AC11 | REQ | User workflow | The last Trip profile cannot be deleted. The dialog states that another profile must be created by copying the current profile first. |  |
| 02TP-AC12 | REQ | User workflow | Switching Trip profile reloads the schedule for the selected Route, Day, and Direction and clears selected rows plus Trip shift undo/redo history. |  |
| 02TP-AC13 | REQ | User workflow | Runtime Pattern and Runtime Profile controls remain inside Runtimes. They are not filtered or changed by Trip profile selection. |  |
| 02TP-AC14 | REQ | Scenario-owned Trip profile | One Trip profile spans the full Scenario, even though the first UI edits one Route at a time. |  |
| 02TP-AC15 | REQ | Scenario-owned Trip profile | Trip profile names must be non-empty and unique within a Scenario after trimming and case normalization. |  |
| 02TP-AC16 | REQ | Trip ownership | Every Trip has a required tripProfileId. |  |
| 02TP-AC17 | REQ | Trip ownership | Every generation and direct-add request carries tripProfileId. |  |
| 02TP-AC18 | REQ | Trip ownership | Trip queries must require tripProfileId or explicitly document a cross-profile administrative use. UI queries must never return Trips from another profile. |  |
| 02TP-AC19 | REQ | Runtime independence | Do not add runtimeProfileId or runtime-assignment ownership to TripProfile. |  |
| 02TP-AC20 | REQ | Runtime independence | Build and Add resolve the current Runtime assignment for Pattern and service day. Recalculate resolves the current assignment at execution time. |  |
| 02TP-AC21 | REQ | Runtime independence | Existing Trips remain fixed and retain calculation provenance. |  |
| 02TP-AC22 | REQ | Runtime independence | Copy preserves each Trip's recorded calculation source without creating or selecting Runtime profiles. |  |
| 02TP-AC23 | REQ | Runtime independence | Runtime profile deletion checks Trips across every Trip profile. |  |
| 02TP-AC24 | REQ | Blocking boundary | Block has required tripProfileId ownership. A Block may reference only Trips with the same scenarioId, serviceDayId, and tripProfileId. |  |
| 02TP-AC25 | REQ | Blocking boundary | This is not the future Blocking-scenario feature. Phase 4 introduces named Blocking scenarios that each reference one Trip profile; multiple Blocking scenarios may use the same Trip profile. |  |
| 02TP-AC26 | REQ | Blocking boundary | The Blocking workspace selects Trip Profile, Blocking Scenario, and Day. |  |
| 02TP-AC27 | REQ | Blocking boundary | Direction is not a Blocking filter. Route may be an optional trip-list filter but cannot constrain Block ownership. | Phase 4 (04) states Blocks store blockingScenarioId and do not store a second authoritative Trip Profile reference. Check 04 for the Block ownership model that supersedes this item. |
| 02TP-AC28 | REQ | Lifecycle > Default provisioning | Creating a Scenario also creates one Trip profile named Default. |  |
| 02TP-AC29 | REQ | Lifecycle > Default provisioning | Loading a legacy Scenario after migration always finds at least one profile. |  |
| 02TP-AC30 | REQ | Lifecycle > Default provisioning | There is no separate New action in the first interface. Copy is the mechanism for creating an alternative. |  |
| 02TP-AC31 | REQ | Lifecycle > Rename | Rename updates metadata only. Trips and Blocks retain their identifiers and ownership. |  |
| 02TP-AC32 | REQ | Lifecycle > Rename | Duplicate names are rejected with the message: A Trip profile with this name already exists. |  |
| 02TP-AC33 | REQ | Lifecycle > Copy | Copy every Trip in the source profile across all Routes and service days. |  |
| 02TP-AC34 | REQ | Lifecycle > Copy | Allocate new Trip IDs. Copy each ordered scheduled-time value while retaining its shared Pattern-point reference. |  |
| 02TP-AC35 | REQ | Lifecycle > Copy | Preserve Pattern, service day, scheduled times, public label, creation method, manual shift, manually changed fields, and calculation-source values. |  |
| 02TP-AC36 | REQ | Lifecycle > Copy | Set sourceTripProfileId on the new profile. |  |
| 02TP-AC37 | REQ | Lifecycle > Copy | Do not copy Blocks or future Blocking scenarios. |  |
| 02TP-AC38 | REQ | Lifecycle > Copy | Commit the new profile and all copied Trips atomically. Select the new profile after success. |  |
| 02TP-AC39 | REQ | Lifecycle > Delete (impact preview) | The impact preview reports Trip count by Route and service day, count of manually adjusted Trips, and count of Trips whose Runtime source is currently stale. |  |
| 02TP-AC40 | REQ | Lifecycle > Delete (impact preview) | The impact preview reports Block count and Block-activity count, and whether this is the last Trip profile. |  |
| 02TP-AC41 | REQ | Lifecycle > Delete (policy) | Block deletion of the last Trip profile. |  |
| 02TP-AC42 | REQ | Lifecycle > Delete (policy) | Otherwise delete the profile and its Trips, and delete the Blocks owned by that profile. |  |
| 02TP-AC43 | REQ | Lifecycle > Delete (policy) | Later, also delete its Blocking scenarios and their Blocks. |  |
| 02TP-AC44 | REQ | Lifecycle > Delete (policy) | Retain Route, Pattern, Runtime profile, Runtime assignment, and service-day records. |  |
| 02TP-AC45 | REQ | Lifecycle > Delete (policy) | Recalculate the impact at commit time and reject a stale preview. Perform all removals in one transaction. |  |
| 02TP-AC46 | REQ | Lifecycle > Delete (policy) | The destructive action is labeled Delete Trip Profile. Cancel performs no writes. |  |
| 02TP-AC47 | REQ | Persistence and migration > IndexedDB version 3 | Add a tripProfiles table with indexes: id, scenarioId, [scenarioId+name], updatedAt. |  |
| 02TP-AC48 | REQ | Persistence and migration > IndexedDB version 3 | Update trips indexes to: id, scenarioId, tripProfileId, routeId, serviceDayId, patternId, [tripProfileId+routeId], [tripProfileId+serviceDayId], provenance.generationSetId, provenance.runtimeProfileId. |  |
| 02TP-AC49 | REQ | Persistence and migration > IndexedDB version 3 | Update blocks indexes to: id, scenarioId, tripProfileId, serviceDayId, [tripProfileId+serviceDayId], [serviceDayId+label]. |  |
| 02TP-AC50 | REQ | Persistence and migration > IndexedDB version 3 | Upgrade step 1: create one Default Trip profile for every existing Scenario. |  |
| 02TP-AC51 | REQ | Persistence and migration > IndexedDB version 3 | Upgrade step 2: assign every existing Trip and Block in that Scenario to its Default profile. |  |
| 02TP-AC52 | REQ | Persistence and migration > IndexedDB version 3 | Upgrade step 3: validate that every revenue-trip Block activity still references a Trip in the same profile and service day. |  |
| 02TP-AC53 | REQ | Persistence and migration > IndexedDB version 3 | Upgrade step 4: complete the migration atomically or leave version 2 data unchanged. |  |
| 02TP-AC54 | TST | Persistence and migration > IndexedDB version 3 | Add a focused migration test using a populated version 2 database. |  |
| 02TP-AC55 | REQ | Snapshots, backup, and CSV | Add tripProfiles to ScenarioRecords, ProjectSnapshot, and DatabaseRecordMap. |  |
| 02TP-AC56 | REQ | Snapshots, backup, and CSV | Increment the JSON backup schema from version 3 to version 4. |  |
| 02TP-AC57 | REQ | Snapshots, backup, and CSV | Version 1-3 imports create one Default profile per imported Scenario and assign legacy Trips and Blocks to it. |  |
| 02TP-AC58 | REQ | Snapshots, backup, and CSV | Export and import-as-copy preserve and remap profile, Trip, Block, and revenue-trip references. |  |
| 02TP-AC59 | REQ | Snapshots, backup, and CSV | Scenario duplication copies and remaps all Trip profiles, Trips, and Blocks. |  |
| 02TP-AC60 | REQ | Snapshots, backup, and CSV | Trip CSV adds tripProfileId and tripProfileName. Block CSV adds the same two columns. |  |
| 02TP-AC61 | REQ | Snapshots, backup, and CSV | No runtime CSV structure changes. |  |
| 02TP-AC62 | REQ | Application contracts | Application layer exposes listTripProfiles, ensureDefaultTripProfile, renameTripProfile, copyTripProfile, previewTripProfileDeletion, and deleteTripProfile (exact names may vary). |  |
| 02TP-AC63 | REQ | Application contracts | previewTripProfileDeletion returns a deterministic review token. The commit rechecks the branch and rejects a stale token before deleting anything. |  |
| 02TP-AC64 | REQ | Application contracts | All authoritative Trip commands and queries add tripProfileId explicitly. React must not infer profile ownership from the currently visible Trips. |  |
| 02TP-AC65 | REQ | Package 2TP-A > Deliverables | Add TripProfile and required Trip/Block ownership. |  |
| 02TP-AC66 | REQ | Package 2TP-A > Deliverables | Add profile-name normalization and validation. |  |
| 02TP-AC67 | REQ | Package 2TP-A > Deliverables | Add pure copy and deletion-impact calculations. |  |
| 02TP-AC68 | REQ | Package 2TP-A > Deliverables | Reject cross-profile Block activities. |  |
| 02TP-AC69 | REQ | Package 2TP-A > Deliverables | Add Dexie version 3 migration and legacy default provisioning. |  |
| 02TP-AC70 | REQ | Package 2TP-A > Deliverables | Update existing fixtures without changing scheduling calculations. |  |
| 02TP-AC71 | TST | Package 2TP-A > Required tests | One Default profile per new and migrated Scenario. |  |
| 02TP-AC72 | TST | Package 2TP-A > Required tests | Unique trimmed profile names. |  |
| 02TP-AC73 | TST | Package 2TP-A > Required tests | Copied Trips receive new IDs and preserve schedule and provenance values. |  |
| 02TP-AC74 | TST | Package 2TP-A > Required tests | Copied profiles include every Route and service day. |  |
| 02TP-AC75 | TST | Package 2TP-A > Required tests | Blocks cannot reference Trips from another profile. |  |
| 02TP-AC76 | TST | Package 2TP-A > Required tests | Migration assigns existing Trips and Blocks to Default. |  |
| 02TP-AC77 | TST | Package 2TP-A > Required tests | Forced migration failure leaves version 2 data intact. |  |
| 02TP-AC78 | TST | Package 2TP-A > Required tests | 2,000-Trip copy remains within a practical local-browser duration. |  |
| 02TP-AC79 | GATE | Package 2TP-A > Gate | Run focused domain and migration tests plus TypeScript typechecking. Stop for user verification before 2TP-B. |  |
| 02TP-AC80 | REQ | Package 2TP-B > File ownership and deliverables | Provision Default during Scenario creation. |  |
| 02TP-AC81 | REQ | Package 2TP-B > File ownership and deliverables | Implement list, rename, copy preview and commit, and delete preview and commit. |  |
| 02TP-AC82 | REQ | Package 2TP-B > File ownership and deliverables | Scope every Trip command and UI-facing query to one Trip profile. |  |
| 02TP-AC83 | REQ | Package 2TP-B > File ownership and deliverables | Clearly reject missing, wrong-Scenario, or stale profile references. |  |
| 02TP-AC84 | REQ | Package 2TP-B > File ownership and deliverables | Make copy and delete atomic. |  |
| 02TP-AC85 | REQ | Package 2TP-B > File ownership and deliverables | Count safe Route/Pattern edits and Runtime staleness across profiles. |  |
| 02TP-AC86 | REQ | Package 2TP-B > File ownership and deliverables | Keep Route deletion and Scenario deletion complete. |  |
| 02TP-AC87 | REQ | Package 2TP-B > File ownership and deliverables | Add export schema version 4 and legacy import normalization. |  |
| 02TP-AC88 | TST | Package 2TP-B > Required tests | Build, Add, shift, pattern change, regenerate, and delete affect only the selected profile. |  |
| 02TP-AC89 | TST | Package 2TP-B > Required tests | Two profiles may contain Trips at identical times without duplicate warnings across profiles. |  |
| 02TP-AC90 | TST | Package 2TP-B > Required tests | Copy preserves source data but has independent IDs. |  |
| 02TP-AC91 | TST | Package 2TP-B > Required tests | Copy creates no Blocks. |  |
| 02TP-AC92 | TST | Package 2TP-B > Required tests | Delete preview reports all dependent records. |  |
| 02TP-AC93 | TST | Package 2TP-B > Required tests | Last-profile deletion is blocked. |  |
| 02TP-AC94 | TST | Package 2TP-B > Required tests | Confirmed deletion removes the complete selected branch only. |  |
| 02TP-AC95 | TST | Package 2TP-B > Required tests | Stale preview cannot commit. |  |
| 02TP-AC96 | TST | Package 2TP-B > Required tests | Route deletion removes its Trips from every profile. |  |
| 02TP-AC97 | TST | Package 2TP-B > Required tests | Pattern reset affects matching Trips across every profile. |  |
| 02TP-AC98 | TST | Package 2TP-B > Required tests | Runtime deletion finds calculation references across every profile. |  |
| 02TP-AC99 | TST | Package 2TP-B > Required tests | Scenario duplication and backup round trips remap all references. |  |
| 02TP-AC100 | TST | Package 2TP-B > Required tests | Legacy backup imports create Default profiles. |  |
| 02TP-AC101 | TST | Package 2TP-B > Required tests | Forced transaction failures leave every profile branch unchanged. |  |
| 02TP-AC102 | GATE | Package 2TP-B > Gate | Run all domain, application, repository, backup, CSV, migration, and typechecking checks. Stop before UI wiring. |  |
| 02TP-AC103 | REQ | Package 2TP-C > File ownership and required behavior | On Trips only, place Trip Profile and Rename, Copy, and Delete in a compact row directly below the Trips section header and above the schedule table. |  |
| 02TP-AC104 | REQ | Package 2TP-C > File ownership and required behavior | Keep Route, Day, and Direction in the existing shared workspace row. |  |
| 02TP-AC105 | REQ | Package 2TP-C > File ownership and required behavior | Reuse the existing compact select and secondary button styles. |  |
| 02TP-AC106 | REQ | Package 2TP-C > File ownership and required behavior | Copy and Rename reuse the established name dialog. Delete uses the established destructive impact dialog with an explicit Delete Trip Profile action. |  |
| 02TP-AC107 | REQ | Package 2TP-C > File ownership and required behavior | Do not add a Trip-profile panel, card, descriptive paragraph, badge, or color system. |  |
| 02TP-AC108 | REQ | Package 2TP-C > File ownership and required behavior | Preserve the selected profile while changing Route, Day, or Direction within the same Scenario. |  |
| 02TP-AC109 | REQ | Package 2TP-C > File ownership and required behavior | Reset to that Scenario's Default or first profile when changing Scenario or Project. |  |
| 02TP-AC110 | REQ | Package 2TP-C > File ownership and required behavior | Clear selected Trips, draft Add row, open Shift controls, and shift undo/redo when changing profile. |  |
| 02TP-AC111 | REQ | Package 2TP-C > File ownership and required behavior | Empty profiles show the existing empty schedule message; no Trips are pre-generated. |  |
| 02TP-AC112 | REQ | Package 2TP-C > File ownership and required behavior | Runtimes remain visible and unchanged when profiles switch. |  |
| 02TP-AC113 | REQ | Package 2TP-C > File ownership and required behavior | Buttons and schedule are disabled while a copy or delete transaction is running. |  |
| 02TP-AC114 | REQ | Package 2TP-C > File ownership and required behavior | Controls have accessible names and full keyboard operation. |  |
| 02TP-AC115 | TST | Package 2TP-C > Required tests | Trip Profile and its actions appear below the Trips header and above the schedule table, while Route, Day, and Direction remain in the shared workspace row. |  |
| 02TP-AC116 | TST | Package 2TP-C > Required tests | Controls appear only where specified. |  |
| 02TP-AC117 | TST | Package 2TP-C > Required tests | Switching profile shows only its Trips. |  |
| 02TP-AC118 | TST | Package 2TP-C > Required tests | Switching profile clears temporary selection and shift history. |  |
| 02TP-AC119 | TST | Package 2TP-C > Required tests | Rename does not alter Trips. |  |
| 02TP-AC120 | TST | Package 2TP-C > Required tests | Copy selects an independent complete schedule. |  |
| 02TP-AC121 | TST | Package 2TP-C > Required tests | Delete cancel performs no writes. |  |
| 02TP-AC122 | TST | Package 2TP-C > Required tests | Last-profile deletion shows the required explanation. |  |
| 02TP-AC123 | TST | Package 2TP-C > Required tests | Deletion confirmation reports Trip and Block impacts. |  |
| 02TP-AC124 | TST | Package 2TP-C > Required tests | No profile switch changes Runtime controls. |  |
| 02TP-AC125 | TST | Package 2TP-C > Required tests | Compact workspace row remains usable at supported desktop widths. |  |
| 02TP-AC126 | GATE | Package 2TP-C > Gate | Run TypeScript typechecking, relevant Vitest and Playwright tests, production build, keyboard review, and visual inspection. Pause for hands-on user verification. |  |
| 02TP-AC127 | AC | Package 2TP-D > Acceptance criteria | One Scenario contains one or more independently selectable Trip profiles. |  |
| 02TP-AC128 | AC | Package 2TP-D > Acceptance criteria | Runtime profiles remain independent calculation inputs. |  |
| 02TP-AC129 | AC | Package 2TP-D > Acceptance criteria | Every Trip and Block has valid Trip-profile ownership. |  |
| 02TP-AC130 | AC | Package 2TP-D > Acceptance criteria | No Trip command or schedule query can leak across profiles. |  |
| 02TP-AC131 | AC | Package 2TP-D > Acceptance criteria | Copy duplicates all Route/day Trips with independent IDs and no Blocks. |  |
| 02TP-AC132 | AC | Package 2TP-D > Acceptance criteria | Delete is impact-reviewed, atomic, and cannot remove the last profile. |  |
| 02TP-AC133 | AC | Package 2TP-D > Acceptance criteria | Future Blocking scenarios are constrained to one Trip profile. |  |
| 02TP-AC134 | AC | Package 2TP-D > Acceptance criteria | Route, Pattern, and runtime lifecycle behavior remains complete across profiles. |  |
| 02TP-AC135 | AC | Package 2TP-D > Acceptance criteria | Database version 3, export schema version 4, legacy import, scenario duplication, CSV, reload, and visual verification pass. |  |
| 02TP-AC136 | AC | Package 2TP-D > Closeout | Do not start the service-day or Blocking phase automatically from this historical plan. |  |
| 02TP-AC137 | AC | Decisions to confirm at the review gate (default 1) | Trip profiles are Scenario-owned and span all Routes and service days. |  |
| 02TP-AC138 | AC | Decisions to confirm at the review gate (default 2) | Copy duplicates Trips but no Blocks. |  |
| 02TP-AC139 | AC | Decisions to confirm at the review gate (default 3) | Existing Runtime assignments remain shared and independent. |  |
| 02TP-AC140 | AC | Decisions to confirm at the review gate (default 4) | The last Trip profile cannot be deleted. |  |
| 02TP-AC141 | AC | Decisions to confirm at the review gate (default 5) | Deleting a non-final Trip profile removes its owned Blocks as one complete branch. |  |
| 02TP-AC142 | AC | Decisions to confirm at the review gate (default 6) | Future Blocking scenarios each select one Trip profile and cannot mix profiles. |  |

### 03: `docs/implementation/phase-03-service-day-workflows.md`

Criteria in this document: 137.

| ID | Kind | Source heading | Criterion | Flag |
| --- | --- | --- | --- | --- |
| 03-AC1 | AC | Accepted workflow direction (item 1) | Runtime copying and Trip copying are separate commands. The first Phase 3 release does not provide one combined Copy Service Day command. |  |
| 03-AC2 | AC | Accepted workflow direction (item 2) | Both workflows are target-first. The selected Day is the target; the dialog asks which other Day to copy from. |  |
| 03-AC3 | AC | Accepted workflow direction (item 3) | Runtime copying applies to every usable Pattern on the selected Route. Direction is not part of its scope. |  |
| 03-AC4 | AC | Accepted workflow direction (item 4) | Runtime copying defaults to independent Runtime-profile copies. The user may explicitly choose to share the source Runtime profiles instead. |  |
| 03-AC5 | AC | Accepted workflow direction (item 5) | Trip copying applies to the selected Route and Trip profile, includes both Outbound and Inbound, and replaces the target Day's Trips in that scope. |  |
| 03-AC6 | AC | Accepted workflow direction (item 6) | Trip copying does not copy Runtime assignments, Blocks, or future Blocking scenarios. |  |
| 03-AC7 | AC | Accepted workflow direction (item 7) | Each copy command has its own impact review and transaction. Running one command never implies running the other. |  |
| 03-AC8 | AC | Accepted workflow direction (item 8) | Source-day records remain unchanged. |  |
| 03-AC9 | REQ | Domain behavior > Copy Runtime assignments | Request identifies Scenario, Route, source Day, target Day, and copy mode. |  |
| 03-AC10 | REQ | Domain behavior > Copy Runtime assignments (independent mode, default) | Copy the source assignment for every usable Pattern on the Route. |  |
| 03-AC11 | REQ | Domain behavior > Copy Runtime assignments (independent mode, default) | Create a new Runtime profile for each copied source profile with fresh profile and band identifiers. |  |
| 03-AC12 | REQ | Domain behavior > Copy Runtime assignments (independent mode, default) | Assign each new profile only to the target Day. |  |
| 03-AC13 | REQ | Domain behavior > Copy Runtime assignments (independent mode, default) | Generate a unique name based on the source profile and target Day. |  |
| 03-AC14 | REQ | Domain behavior > Copy Runtime assignments (independent mode, default) | Preserve band bounds and segment runtimes. Retain the source profile's calculation revision as copied data. |  |
| 03-AC15 | REQ | Domain behavior > Copy Runtime assignments (independent mode, default) | Replace existing target assignments only after impact confirmation. |  |
| 03-AC16 | REQ | Domain behavior > Copy Runtime assignments (shared mode) | Assign the source Day's existing Runtime profiles to the target Day. Do not create profiles. |  |
| 03-AC17 | REQ | Domain behavior > Copy Runtime assignments (shared mode) | State that later edits to a shared profile affect every assigned Day. |  |
| 03-AC18 | REQ | Domain behavior > Copy Runtime assignments (shared mode) | Replace existing target assignments only after impact confirmation. |  |
| 03-AC19 | REQ | Domain behavior > Copy Runtime assignments | Runtime copying does not alter, recalculate, or delete Trips. |  |
| 03-AC20 | REQ | Domain behavior > Copy Runtime assignments | The preview reports target assignments replaced, profiles created or shared, source gaps, and target Trips whose recorded calculation source will differ from the new target assignment. |  |
| 03-AC21 | REQ | Domain behavior > Copy Runtime assignments | If a source Pattern has no Runtime assignment, the preview reports it by Pattern and the operation does not silently skip it. The command applies only when every usable Pattern is resolved or the user returns to correct the source data. |  |
| 03-AC22 | REQ | Domain behavior > Copy Trips | Request identifies Scenario, Route, Trip profile, source Day, and target Day. Direction is deliberately absent. |  |
| 03-AC23 | REQ | Domain behavior > Copy Trips | Read source Trips for the selected Route, Trip profile, and source Day across both Directions. |  |
| 03-AC24 | REQ | Domain behavior > Copy Trips | Preview all target Trips that will be replaced. |  |
| 03-AC25 | REQ | Domain behavior > Copy Trips | Create fresh Trip IDs and target-Day ownership. |  |
| 03-AC26 | REQ | Domain behavior > Copy Trips | Preserve Pattern, scheduled times, public label, creation method, manual shift, manually changed fields, and Runtime calculation provenance. |  |
| 03-AC27 | REQ | Domain behavior > Copy Trips | Replace all target Trips in the same Route, Trip profile, and target Day. |  |
| 03-AC28 | REQ | Domain behavior > Copy Trips | Remove revenue-trip activities that reference replaced target Trips while retaining affected Block records, including empty Blocks. |  |
| 03-AC29 | REQ | Domain behavior > Copy Trips | Do not copy source Blocks or Block activities. |  |
| 03-AC30 | REQ | Domain behavior > Copy Trips | Leave Trips for other Routes, Trip profiles, and Days unchanged. |  |
| 03-AC31 | REQ | Domain behavior > Copy Trips (preview) | The preview reports source and target Trip counts by Direction and Pattern, manually adjusted target Trips, and stale Runtime sources. |  |
| 03-AC32 | REQ | Domain behavior > Copy Trips (preview) | The preview reports affected Blocks and activities, and missing target Runtime assignments that could prevent later recalculation. |  |
| 03-AC33 | REQ | Domain behavior > Copy Trips (preview) | Missing target Runtime assignments do not invalidate copied authoritative times, but the warning must remain visible before confirmation. |  |
| 03-AC34 | REQ | Domain behavior > Copy Trips (empty source) | An empty source is valid only as an explicit clear-target operation. |  |
| 03-AC35 | REQ | Domain behavior > Copy Trips (empty source) | The impact dialog must say that zero Trips will be copied and identify every target Trip and Block activity that will be removed. |  |
| 03-AC36 | REQ | Domain behavior > Batch Trip editing | Signed batch shift continues to move every scheduled point on each selected Trip by the same duration and records the explicit manual shift. |  |
| 03-AC37 | REQ | Domain behavior > Batch Trip editing | Batch Pattern change preserves each Trip's first time, requires one target Pattern in the same Direction, and recalculates through the target Day's assigned Runtime profile. |  |
| 03-AC38 | REQ | Domain behavior > Batch Trip editing | Preview returns per-Trip eligibility and failures. |  |
| 03-AC39 | REQ | Domain behavior > Batch Trip editing | A batch command is atomic. It does not silently skip ineligible selected Trips. |  |
| 03-AC40 | REQ | Domain behavior > Batch Trip editing | Surviving Trip IDs remain stable so existing Block references remain valid. |  |
| 03-AC41 | REQ | Package 3A > File ownership | Do not modify layout, styling, dialog composition, focus behavior, or planner-facing presentation beyond exposing structured result data. |  |
| 03-AC42 | REQ | Package 3A > Ordered subtasks 3A-1 (characterize) | Confirm authoritative Trip, Trip-profile, Runtime-assignment, Runtime-profile, and Block ownership in tests. |  |
| 03-AC43 | REQ | Package 3A > Ordered subtasks 3A-1 (characterize) | Confirm that no generation-set record participates in the new commands. |  |
| 03-AC44 | REQ | Package 3A > Ordered subtasks 3A-1 (characterize) | Record whether a schema migration is required before implementing persistence changes. |  |
| 03-AC45 | REQ | Package 3A > Ordered subtasks 3A-2 (requests and previews) | Add typed Runtime-copy and Trip-copy requests. |  |
| 03-AC46 | REQ | Package 3A > Ordered subtasks 3A-2 (requests and previews) | Add structured preview results with source signatures for stale-review protection. |  |
| 03-AC47 | REQ | Package 3A > Ordered subtasks 3A-2 (requests and previews) | Centralize source/target validation, canonical Day ordering, impact counts, and planner-message parameters outside React. |  |
| 03-AC48 | REQ | Package 3A > Ordered subtasks 3A-3 (Runtime copy) | Implement independent-profile copy and explicit shared-profile assignment modes. |  |
| 03-AC49 | REQ | Package 3A > Ordered subtasks 3A-3 (Runtime copy) | Generate deterministic unique profile names for independent batch copies. |  |
| 03-AC50 | REQ | Package 3A > Ordered subtasks 3A-3 (Runtime copy) | Reject unresolved source Patterns without partial copying. |  |
| 03-AC51 | REQ | Package 3A > Ordered subtasks 3A-3 (Runtime copy) | Report changed assignments and affected Trip calculation-source status without recalculating Trips. |  |
| 03-AC52 | REQ | Package 3A > Ordered subtasks 3A-4 (Trip copy) | Copy one Route and Trip profile across both Directions. |  |
| 03-AC53 | REQ | Package 3A > Ordered subtasks 3A-4 (Trip copy) | Replace only the selected target-Day scope. |  |
| 03-AC54 | REQ | Package 3A > Ordered subtasks 3A-4 (Trip copy) | Allocate new Trip IDs and preserve authoritative times and provenance. |  |
| 03-AC55 | REQ | Package 3A > Ordered subtasks 3A-4 (Trip copy) | Calculate target Trip and Block-activity impacts, including explicit empty-source clearing. |  |
| 03-AC56 | REQ | Package 3A > Ordered subtasks 3A-5 (batch editing) | Retain signed batch shifts as explicit overrides. |  |
| 03-AC57 | REQ | Package 3A > Ordered subtasks 3A-5 (batch editing) | Add all-or-nothing batch Pattern-change previews and commits. |  |
| 03-AC58 | REQ | Package 3A > Ordered subtasks 3A-5 (batch editing) | Preserve Trip IDs and return per-Trip eligibility findings. |  |
| 03-AC59 | REQ | Package 3A > Ordered subtasks 3A-6 (atomic persistence) | Commit each approved Runtime copy in one transaction. |  |
| 03-AC60 | REQ | Package 3A > Ordered subtasks 3A-6 (atomic persistence) | Commit each approved Trip replacement and Block-activity cleanup in one transaction. |  |
| 03-AC61 | REQ | Package 3A > Ordered subtasks 3A-6 (atomic persistence) | Recalculate the source signature at commit time and reject stale previews. |  |
| 03-AC62 | REQ | Package 3A > Ordered subtasks 3A-6 (atomic persistence) | Prove that cancellation, validation failure, or forced persistence failure performs no writes. |  |
| 03-AC63 | REQ | Package 3A > Ordered subtasks 3A-7 (exchange and capacity) | Verify JSON backup and restore, import-as-copy, and Scenario duplication with copied records. |  |
| 03-AC64 | REQ | Package 3A > Ordered subtasks 3A-7 (exchange and capacity) | Verify CSV output reflects target-Day ownership and preserved Trip provenance. |  |
| 03-AC65 | REQ | Package 3A > Ordered subtasks 3A-7 (exchange and capacity) | Exercise Runtime copies across at least 20 Patterns and Trip replacement at the 500-Trip-per-Day target. |  |
| 03-AC66 | REQ | Package 3A > Ordered subtasks 3A-7 (exchange and capacity) | Update structural documentation for any actual schema or contract changes. |  |
| 03-AC67 | TST | Package 3A > Required tests | Source and target Day cannot match. |  |
| 03-AC68 | TST | Package 3A > Required tests | Source remains unchanged in every mode. |  |
| 03-AC69 | TST | Package 3A > Required tests | Independent Runtime copy creates independent IDs and assignments. |  |
| 03-AC70 | TST | Package 3A > Required tests | Shared Runtime copy creates no profiles and visibly shares assignments. |  |
| 03-AC71 | TST | Package 3A > Required tests | Unresolved source Runtime assignment prevents partial copy. |  |
| 03-AC72 | TST | Package 3A > Required tests | Runtime copy never recalculates or deletes Trips. |  |
| 03-AC73 | TST | Package 3A > Required tests | Trip copy includes both Directions but only the selected Route and Trip profile. |  |
| 03-AC74 | TST | Package 3A > Required tests | Target Trips are replaced rather than merged. |  |
| 03-AC75 | TST | Package 3A > Required tests | Copied Trips receive new IDs and preserve times and provenance. |  |
| 03-AC76 | TST | Package 3A > Required tests | Source Blocks are not copied. |  |
| 03-AC77 | TST | Package 3A > Required tests | Affected target Block activities are removed while Block records remain. |  |
| 03-AC78 | TST | Package 3A > Required tests | Empty-source clearing requires explicit reviewed impact. |  |
| 03-AC79 | TST | Package 3A > Required tests | Stale previews cannot commit. |  |
| 03-AC80 | TST | Package 3A > Required tests | Forced transaction failures leave all source and target records unchanged. |  |
| 03-AC81 | TST | Package 3A > Required tests | Batch shifts and Pattern changes are atomic and preserve Trip IDs. |  |
| 03-AC82 | TST | Package 3A > Required tests | Backup, duplication, CSV, and capacity checks pass. |  |
| 03-AC83 | GATE | Package 3A > Verification gate and mandatory stop | Run focused and full Vitest suites, TypeScript typechecking, persistence rollback tests, JSON round trips, representative CSV checks, and a production build. Report the exact structural contracts available to the UI. |  |
| 03-AC84 | GATE | Package 3A > Verification gate and mandatory stop | Stop. Recommend Terra for Package 3B. Do not modify UI files or begin Package 3B until the user approves the model shift. |  |
| 03-AC85 | REQ | Package 3B > Required model | Terra owns placement, interaction, concise wording, accessibility, responsive behavior, and visual verification. It consumes the approved Package 3A ports and must not implement copy, impact, or batch-calculation rules in React. |  |
| 03-AC86 | REQ | Package 3B > Communication and interface restraint | Use short labels and direct planner-facing messages. |  |
| 03-AC87 | REQ | Package 3B > Communication and interface restraint | Avoid explanatory paragraphs, instructional cards, redundant headings, badges, and decorative callouts. |  |
| 03-AC88 | REQ | Package 3B > Communication and interface restraint | Do not add a new container or visual system. Reuse existing compact controls, workflow headers, dialogs, tables, spacing, and destructive-action patterns. |  |
| 03-AC89 | REQ | Package 3B > Communication and interface restraint | Add helper text only when the consequence cannot be made clear through the control label or impact summary. |  |
| 03-AC90 | REQ | Package 3B > Communication and interface restraint | Do not repeat the same source, target, scope, or warning text in multiple places. |  |
| 03-AC91 | REQ | Package 3B > Ordered subtasks 3B-1 (verify accepted surfaces) | Inspect the current Service, Runtimes, and Trips layouts at supported desktop widths. |  |
| 03-AC92 | REQ | Package 3B > Ordered subtasks 3B-1 (verify accepted surfaces) | Preserve the accepted Day and Direction behavior, Runtime editor actions, Trip-profile controls, and Trips action order unless this plan explicitly changes them. |  |
| 03-AC93 | REQ | Package 3B > Ordered subtasks 3B-1 (verify accepted surfaces) | Add focused layout fixtures before changing placement. |  |
| 03-AC94 | REQ | Package 3B > Ordered subtasks 3B-2 (Runtime Day copy) | Place Copy day… with the Runtime Pattern/Profile context controls, not with Add, Discard, Save. | Superseded by 03R: Runtime Day copy moves to the Runtimes Actions menu as Copy from day… (03R Runtimes action layer). |
| 03-AC95 | REQ | Package 3B > Ordered subtasks 3B-2 (Runtime Day copy) | Treat the currently selected Day as the target and ask for one source Day. |  |
| 03-AC96 | REQ | Package 3B > Ordered subtasks 3B-2 (Runtime Day copy) | Offer Independent copies as the default and Share profiles as the explicit alternative. |  |
| 03-AC97 | REQ | Package 3B > Ordered subtasks 3B-2 (Runtime Day copy) | State the selected Route scope once. |  |
| 03-AC98 | REQ | Package 3B > Ordered subtasks 3B-2 (Runtime Day copy) | Present replaced assignments, created or shared profiles, unresolved Patterns, and affected Trip-source counts compactly. |  |
| 03-AC99 | REQ | Package 3B > Ordered subtasks 3B-2 (Runtime Day copy) | Keep the target Day selected after success and reload Runtime controls. |  |
| 03-AC100 | REQ | Package 3B > Ordered subtasks 3B-3 (Trip Day copy) | Add Copy trips from another day inside one compact More menu in the Trips action area. | Superseded by 03R: the More menu is removed; Copy from day… is a Trips Actions menu item (03R-B-4). |
| 03-AC101 | REQ | Package 3B > Ordered subtasks 3B-3 (Trip Day copy) | Keep the visible Build, Add, Regenerate, Shift, and Delete order unchanged. | Superseded by 03R Trips Actions menu order (Build trips…, Add trip…, Regenerate selected…, Shift selected…, Change pattern…, Copy from day…, Delete selected…). |
| 03-AC102 | REQ | Package 3B > Ordered subtasks 3B-3 (Trip Day copy) | Treat the selected Day as target and the selected Trip profile and Route as fixed scope. |  |
| 03-AC103 | REQ | Package 3B > Ordered subtasks 3B-3 (Trip Day copy) | State once that both Directions are included. |  |
| 03-AC104 | REQ | Package 3B > Ordered subtasks 3B-3 (Trip Day copy) | Present replacement, manual-adjustment, stale-source, and Block-activity impacts before confirmation. |  |
| 03-AC105 | REQ | Package 3B > Ordered subtasks 3B-3 (Trip Day copy) | Keep the target Day and Trip profile selected after success, clear selected rows and shift history, and reload the current Direction view. |  |
| 03-AC106 | REQ | Package 3B > Ordered subtasks 3B-4 (batch Pattern change) | Reuse current row selection. |  |
| 03-AC107 | REQ | Package 3B > Ordered subtasks 3B-4 (batch Pattern change) | Show one compact target-Pattern control and a preview of eligible and ineligible selected Trips. |  |
| 03-AC108 | REQ | Package 3B > Ordered subtasks 3B-4 (batch Pattern change) | Never silently omit an ineligible Trip. |  |
| 03-AC109 | REQ | Package 3B > Ordered subtasks 3B-4 (batch Pattern change) | Preserve focus and selection after cancel; clear temporary selection after successful application. |  |
| 03-AC110 | REQ | Package 3B > Ordered subtasks 3B-5 (UI verification) | Cover keyboard operation, focus return, announced validation, destructive confirmation, and color-independent status. |  |
| 03-AC111 | REQ | Package 3B > Ordered subtasks 3B-5 (UI verification) | Verify empty source, empty target, populated target, shared Runtime, independent Runtime, missing Runtime assignment, both-Direction Trip copy, and Block-impact states. |  |
| 03-AC112 | REQ | Package 3B > Ordered subtasks 3B-5 (UI verification) | Verify compact layout without adding unnecessary text or controls. |  |
| 03-AC113 | REQ | Package 3B > Ordered subtasks 3B-5 (UI verification) | Update docs/ui-conventions.md with only reusable conventions established by the implementation. |  |
| 03-AC114 | GATE | Package 3B > Verification gate and mandatory stop | Run TypeScript typechecking, relevant Vitest and Playwright tests, the production build, keyboard and accessibility review, and browser visual inspection. |  |
| 03-AC115 | GATE | Package 3B > Verification gate and mandatory stop | The user verifies Runtime copy in both modes, Trip overwrite cancellation and confirmation, both-Direction results, batch Pattern change, and reload. |  |
| 03-AC116 | GATE | Package 3B > Verification gate and mandatory stop | Stop. Do not begin Package 3C or make structural corrections that alter accepted behavior. Report any required structural change as a separate Luna correction for user approval. |  |
| 03-AC117 | REQ | Package 3C > Ordered subtasks | Review domain, application, persistence, and UI boundaries. |  |
| 03-AC118 | REQ | Package 3C > Ordered subtasks | Confirm React contains no authoritative copy, impact, or batch-edit calculations. |  |
| 03-AC119 | REQ | Package 3C > Ordered subtasks | Confirm no generation-set terminology or records participate in Phase 3. |  |
| 03-AC120 | REQ | Package 3C > Ordered subtasks | Verify each copy operation is separately atomic and source-preserving. |  |
| 03-AC121 | REQ | Package 3C > Ordered subtasks | Verify Trip Profile, Route, Day, Direction, Runtime-profile, and Block scopes are consistent across queries, writes, backup, duplication, and CSV. |  |
| 03-AC122 | REQ | Package 3C > Ordered subtasks | Run the complete automated suite, typechecking, production build, reload, and final visual review. |  |
| 03-AC123 | REQ | Package 3C > Ordered subtasks | Update architecture, schema, glossary, decisions, UI conventions, and status documents. |  |
| 03-AC124 | REQ | Package 3C > Ordered subtasks | Record a Phase 3 closeout and present the revised Phase 4 plan and model recommendation. |  |
| 03-AC125 | AC | Package 3C > Acceptance criteria | Runtime and Trip copying are independent operations. |  |
| 03-AC126 | AC | Package 3C > Acceptance criteria | The selected Day is always the initial target and the source is explicit. |  |
| 03-AC127 | AC | Package 3C > Acceptance criteria | Runtime copy covers every usable Pattern on the selected Route and never mutates Trips. |  |
| 03-AC128 | AC | Package 3C > Acceptance criteria | Independent Runtime copy is the default; shared assignments require explicit selection. |  |
| 03-AC129 | AC | Package 3C > Acceptance criteria | Trip copy covers both Directions for one Route and Trip profile. |  |
| 03-AC130 | AC | Package 3C > Acceptance criteria | Target Trips are replaced only after impact review; source Trips remain unchanged. |  |
| 03-AC131 | AC | Package 3C > Acceptance criteria | Copied Trips have fresh IDs, target-Day ownership, and preserved times and provenance. |  |
| 03-AC132 | AC | Package 3C > Acceptance criteria | Blocks are not copied; affected target revenue-trip activities are removed without dangling references. |  |
| 03-AC133 | AC | Package 3C > Acceptance criteria | Empty-source clearing is explicit and impact-reviewed. |  |
| 03-AC134 | AC | Package 3C > Acceptance criteria | Batch changes are atomic and do not silently skip selected Trips. |  |
| 03-AC135 | AC | Package 3C > Acceptance criteria | UI wording and controls remain compact and non-redundant. |  |
| 03-AC136 | AC | Package 3C > Acceptance criteria | JSON backup/restore, Scenario duplication, CSV, tests, build, reload, accessibility, and visual review pass. |  |
| 03-AC137 | GATE | Package 3C > Closeout | At closeout, present Phase 4 as a separate user-approved effort. Do not begin it automatically. |  |

### 03R: `docs/implementation/phase-03r-unified-action-layers.md`

Criteria in this document: 129.

| ID | Kind | Source heading | Criterion | Flag |
| --- | --- | --- | --- | --- |
| 03R-AC1 | REQ | Fixed interaction design > Shared section-header grammar | Each workflow-section retains one section-title row. The heading remains at the upper-left. |  |
| 03R-AC2 | REQ | Fixed interaction design > Shared section-header grammar | The complete action layer is placed at the upper-right in the same row and vertically centered with the heading. Do not place an additional profile row below the heading. |  |
| 03R-AC3 | REQ | Fixed interaction design > Shared section-header grammar | Runtimes desktop order: Pattern selector, Profile trigger, separator, Add, conditional Discard and Save, separator, Actions trigger. |  |
| 03R-AC4 | REQ | Fixed interaction design > Shared section-header grammar | Trips desktop order: Profile trigger, separator, Actions trigger. |  |
| 03R-AC5 | REQ | Fixed interaction design > Shared section-header grammar | Discard and Save are absent when no Runtime draft exists. They appear immediately after Add when the editor becomes dirty. |  |
| 03R-AC6 | REQ | Fixed interaction design > Shared section-header grammar | Separators are visual spacing or a one-pixel neutral rule. They are not text glyphs and are not focusable. |  |
| 03R-AC7 | REQ | Fixed interaction design > Shared section-header grammar | The action layer may wrap below the title only when the complete row cannot fit. On wrap it occupies the section width, stays left-to-right in the same control order, and has an 8px gap from the title block. |  |
| 03R-AC8 | REQ | Fixed interaction design > Shared section-header grammar | The wrapped action layer must not overlap the heading, table, status indicator, or section edge. Horizontal scrolling is permitted only as the last fallback below 680px. |  |
| 03R-AC9 | REQ | Dimensional and visual requirements | Typeface: Inter, ui-sans-serif, system-ui, sans-serif. Base type size 14px. Section title 1rem using existing weight and color. |  |
| 03R-AC10 | REQ | Dimensional and visual requirements | Button and field minimum height 30px. Ordinary button padding 4px 9px. Ordinary button radius 3px. Field radius 2px. |  |
| 03R-AC11 | REQ | Dimensional and visual requirements | Adjacent action-button gap 5px. Context-control gap 8px. Gap between logical groups 8px plus the optional neutral separator. |  |
| 03R-AC12 | REQ | Dimensional and visual requirements | Section padding 12px on every side. Section-title-to-content spacing 8px. |  |
| 03R-AC13 | REQ | Dimensional and visual requirements | Focus ring: existing 3px blue outline with 1px offset. Menu offset from trigger 3px. Menu padding 4px. |  |
| 03R-AC14 | REQ | Dimensional and visual requirements | Minimum menu width 210px; widen only enough to prevent command-label wrapping. |  |
| 03R-AC15 | REQ | Dimensional and visual requirements | Menu shadow, border, colors, primary treatment, subtle-danger treatment, and disabled treatment reuse existing styles without new variants. |  |
| 03R-AC16 | REQ | Dimensional and visual requirements | Do not reduce controls below 30px high to force one-line placement. Do not use icon-only buttons for Profile or Actions triggers. |  |
| 03R-AC17 | REQ | Dimensional and visual requirements | Profile and Actions triggers use the same height, border, padding, type size, caret, hover treatment, and focus treatment. |  |
| 03R-AC18 | REQ | Menu construction and behavior | Use accessible custom menu-button popovers rather than native select elements for mixed record selection and commands. |  |
| 03R-AC19 | REQ | Menu construction and behavior | Each trigger exposes expanded state and menu ownership. |  |
| 03R-AC20 | REQ | Menu construction and behavior | Menus support Up/Down, Home/End, Enter/Space, Escape, and outside-click dismissal. Escape and selection return focus to the trigger. |  |
| 03R-AC21 | REQ | Menu construction and behavior (Profile menu) | Show a non-interactive Profiles group label, then list saved profiles first. |  |
| 03R-AC22 | REQ | Menu construction and behavior (Profile menu) | Mark the selected profile with a checkmark and aria-checked or equivalent menu-radio semantics. |  |
| 03R-AC23 | REQ | Menu construction and behavior (Profile menu) | Insert a separator, then list lifecycle commands in the specified order. |  |
| 03R-AC24 | REQ | Menu construction and behavior | Profile names truncate with an ellipsis only after the menu reaches a practical desktop maximum width. A tooltip or accessible name exposes the complete value. |  |
| 03R-AC25 | REQ | Menu construction and behavior | Selection and commands must be distinguishable without relying on color. |  |
| 03R-AC26 | REQ | Menu construction and behavior | Disabled commands remain visible when their absence would make the menu unstable or hide why an operation is unavailable. Provide a concise accessible explanation through the existing tooltip/title convention. |  |
| 03R-AC27 | REQ | Menu construction and behavior | Destructive commands remain last and use the existing confirmation behavior. |  |
| 03R-AC28 | REQ | Runtimes action layer | Order: Pattern selector (retaining the current selected Pattern and accessible Pattern label), then Profile trigger, group separation, visible Add, conditional Discard and primary Save, group separation, Actions trigger. |  |
| 03R-AC29 | REQ | Runtimes action layer > Runtime Profile menu | Menu content, in order: Profiles group label; checkmark on selected profile; other profiles; separator; New profile…; Rename profile…; Copy profile…; Delete profile…. |  |
| 03R-AC30 | REQ | Runtimes action layer > Runtime Actions menu | Menu content: Copy from day…. |  |
| 03R-AC31 | REQ | Runtimes action layer > Runtime Actions menu | Copy from day… retains the accepted target-first, all-usable-Patterns-on-the-Route behavior and the existing impact dialog. Do not describe it as copying only the selected Pattern or profile. |  |
| 03R-AC32 | REQ | Runtimes action layer | Add continues to add a Runtime time band. It does not open the Actions menu. |  |
| 03R-AC33 | REQ | Runtimes action layer | Discard and Save retain current local-draft behavior. If conditional controls cause wrapping, preserve the documented order. |  |
| 03R-AC34 | REQ | Trips action layer | Order: Profile trigger, group separation, Actions trigger. |  |
| 03R-AC35 | REQ | Trips action layer > Trip Profile menu | Menu content, in order: Profiles group label; checkmark on selected profile; other profiles; separator; New profile…; Rename profile…; Copy profile…; Delete profile…. |  |
| 03R-AC36 | REQ | Trips action layer > Trip Profile menu | If Trip-profile creation is not exposed in the accepted application contract, omit New profile… rather than inventing behavior. Record the deviation at the Package 3R-B gate. |  |
| 03R-AC37 | REQ | Trips action layer > Trips Actions menu | Menu content, in order: Build trips…; Add trip…; Regenerate selected…; Shift selected…; Change pattern…; Copy from day…; separator; Delete selected…. |  |
| 03R-AC38 | REQ | Trips action layer | Selection-dependent commands remain visible and disabled when no Trips are selected. |  |
| 03R-AC39 | REQ | Trips action layer | Existing stale-Runtime indicators remain visible in the section header or immediately above the table. They must not become menu items. |  |
| 03R-AC40 | REQ | Trips action layer | Existing dialogs and previews retain their accepted scope and warning content. |  |
| 03R-AC41 | REQ | Shift selected Trips drawer | Selecting Shift selected… closes the Actions menu and opens a non-modal drawer fixed to the right edge of the application viewport. Do not use a centered modal or a full-screen backdrop. |  |
| 03R-AC42 | REQ | Shift selected Trips drawer > Desktop geometry | Width 380px; maximum width 40vw. |  |
| 03R-AC43 | REQ | Shift selected Trips drawer > Desktop geometry | Top edge below the persistent application top bar and tabs, without covering their navigation controls. Right and bottom edges flush with the application viewport. |  |
| 03R-AC44 | REQ | Shift selected Trips drawer > Desktop geometry | Internal padding 16px. One-pixel neutral left border. Shadow equivalent in strength to the existing menu/dialog shadow. Background white. |  |
| 03R-AC45 | REQ | Shift selected Trips drawer > Desktop geometry | Stacking: above workflow content and below blocking confirmation dialogs. |  |
| 03R-AC46 | REQ | Shift selected Trips drawer > Below 680px | Use width min(100vw, 380px). The drawer may cover the timetable. The drawer body scrolls vertically if needed. Keep its title and footer actions visible while the body scrolls. |  |
| 03R-AC47 | REQ | Shift selected Trips drawer > Content order | Order: title Shift selected Trips with Close; Back and Forward buttons with Minutes field; Undo and Redo; selected count and net staged shift; Discard and Done. |  |
| 03R-AC48 | REQ | Shift selected Trips drawer | Back and Forward are text-and-symbol buttons, not unexplained icon buttons. |  |
| 03R-AC49 | REQ | Shift selected Trips drawer | Minutes is a positive whole-number field using the existing 30px field height and tabular numerals. The field defaults to 1 and retains its valid value while the drawer remains open. |  |
| 03R-AC50 | REQ | Shift selected Trips drawer | Each Back or Forward action appends one staged operation and updates the timetable preview without persistence. |  |
| 03R-AC51 | REQ | Shift selected Trips drawer | Preview rows use the existing selected-row treatment plus a concise staged-shift status that does not rely on color. |  |
| 03R-AC52 | REQ | Shift selected Trips drawer | Undo and Redo operate only on the staged operation sequence in the open drawer. |  |
| 03R-AC53 | REQ | Shift selected Trips drawer | The summary states the number of selected Trips and the net earlier/later shift. Mixed net results must be reported explicitly rather than collapsed into a misleading single value. |  |
| 03R-AC54 | REQ | Shift selected Trips drawer | Discard abandons the complete staged sequence and closes the drawer without writes. |  |
| 03R-AC55 | REQ | Shift selected Trips drawer | Done commits the net result once, atomically, then clears selection and temporary history according to the accepted Trips workflow. |  |
| 03R-AC56 | REQ | Shift selected Trips drawer | The top-right Close control behaves like Discard when no staged changes exist. With staged changes, it opens the concise existing-style discard confirmation. Escape follows the same rule as Close. |  |
| 03R-AC57 | REQ | Shift selected Trips drawer | Route, Day, Direction, Trip Profile, tab, or selected-row changes are blocked while staged changes exist and invoke the same discard decision. They must not silently alter drawer scope. |  |
| 03R-AC58 | REQ | Shift selected Trips drawer | After Discard, focus returns to the Trips Actions trigger. After Done, focus returns to the schedule region or the Actions trigger according to the existing successful batch-action convention. |  |
| 03R-AC59 | REQ | Shift selected Trips drawer | A stale preview prevents Done and asks the user to discard and reopen against current Trips. Do not silently recalculate against changed source records. |  |
| 03R-AC60 | REQ | Package 3R-A > Communication constraint | Be parsimonious. Report contracts, changed files, tests, and blockers. |  |
| 03R-AC61 | REQ | Package 3R-A > Ordered subtasks 3R-A-1 (characterize) | Confirm signed shift calculations, Trip ID preservation, manual-shift provenance, selection scope, and current Undo/Redo ownership. |  |
| 03R-AC62 | REQ | Package 3R-A > Ordered subtasks 3R-A-1 (characterize) | Identify the minimum reusable domain command for previewing and committing one net staged shift. Confirm no schema migration is required. |  |
| 03R-AC63 | REQ | Package 3R-A > Ordered subtasks 3R-A-2 (contracts) | Define a request scoped to Scenario, Route, Trip profile, Day, Direction, and selected Trip IDs. |  |
| 03R-AC64 | REQ | Package 3R-A > Ordered subtasks 3R-A-2 (contracts) | Return original and preview scheduled points, selected count, signed net seconds, validation findings, and a source signature. |  |
| 03R-AC65 | REQ | Package 3R-A > Ordered subtasks 3R-A-2 (contracts) | Keep operation-stack Undo/Redo state in the UI. Keep authoritative time propagation, eligibility, and source signatures outside React. |  |
| 03R-AC66 | REQ | Package 3R-A > Ordered subtasks 3R-A-3 (atomic commit) | Commit one reviewed net shift across every selected Trip. Preserve Trip IDs and accepted manual-shift provenance. |  |
| 03R-AC67 | REQ | Package 3R-A > Ordered subtasks 3R-A-3 (atomic commit) | Recheck the source signature immediately before writing. Reject mixed missing/stale selections without partial writes. |  |
| 03R-AC68 | REQ | Package 3R-A > Ordered subtasks 3R-A-3 (atomic commit) | Prove that cancellation and forced transaction failure perform no writes. |  |
| 03R-AC69 | REQ | Package 3R-A > Ordered subtasks 3R-A-4 (boundaries) | Confirm existing immediate-shift callers remain compatible until Package 3R-B replaces them, or provide an explicit migration note. |  |
| 03R-AC70 | REQ | Package 3R-A > Ordered subtasks 3R-A-4 (boundaries) | Confirm no UI wording or presentation logic enters domain/application modules. |  |
| 03R-AC71 | REQ | Package 3R-A > Required model | Luna must not modify React layout, CSS, fixtures, menu behavior, drawer behavior, wording, focus, or responsive design. |  |
| 03R-AC72 | TST | Package 3R-A > Required verification | Focused staged-shift tests. |  |
| 03R-AC73 | TST | Package 3R-A > Required verification | All-or-nothing multi-Trip commit tests. |  |
| 03R-AC74 | TST | Package 3R-A > Required verification | Stale-preview rejection. |  |
| 03R-AC75 | TST | Package 3R-A > Required verification | Forced transaction rollback. |  |
| 03R-AC76 | TST | Package 3R-A > Required verification | Signed earlier/later preview values. |  |
| 03R-AC77 | TST | Package 3R-A > Required verification | Trip ID and provenance preservation. |  |
| 03R-AC78 | TST | Package 3R-A > Required verification | TypeScript typechecking, complete Vitest suite, and production build. |  |
| 03R-AC79 | GATE | Package 3R-A > Gate | Stop. The available UI contract is TripShiftRequest, TripShiftPreview, previewStagedTripShift, and applyStagedTripShift. Recommend Terra for Package 3R-B. Do not modify UI files or begin 3R-B until the user approves the model shift. |  |
| 03R-AC80 | REQ | Package 3R-B > Required model | Terra owns component composition, placement, measurements, styling, menu behavior, drawer behavior, focus, accessibility, responsive behavior, fixtures, visual review, and planner-facing wording. |  |
| 03R-AC81 | REQ | Package 3R-B > Required model | Package 3R-B must consume 3R-A contracts and must not recreate authoritative Shift, copy, regeneration, or impact calculations in React. |  |
| 03R-AC82 | REQ | Package 3R-B > Communication constraint | Be parsimonious. Report visible decisions, changed files, verification evidence, and blockers. Do not add unnecessary explanatory text to the interface or the handoff. |  |
| 03R-AC83 | REQ | Package 3R-B > Ordered subtasks 3R-B-1 (record geometry) | Capture the Runtimes and Trips sections at representative wide desktop, 1100px, and 680px viewport widths. |  |
| 03R-AC84 | REQ | Package 3R-B > Ordered subtasks 3R-B-1 (record geometry) | Add focused fixtures for both header action layers, open Profile menus, open Actions menus, dirty Runtime state, and the open Shift drawer. |  |
| 03R-AC85 | REQ | Package 3R-B > Ordered subtasks 3R-B-1 (record geometry) | Preserve the accepted data-grid widths and section treatment. |  |
| 03R-AC86 | REQ | Package 3R-B > Ordered subtasks 3R-B-2 (menu primitive) | Implement the menu keyboard, focus, dismissal, group-label, separator, checked-selection, disabled, and destructive-item rules. |  |
| 03R-AC87 | REQ | Package 3R-B > Ordered subtasks 3R-B-2 (menu primitive) | Reuse the primitive for both Profile menus and both Actions menus. Do not use separate visual implementations for Runtimes and Trips. |  |
| 03R-AC88 | REQ | Package 3R-B > Ordered subtasks 3R-B-3 (Runtimes) | Move Pattern, Profile, Add, conditional Discard and Save, and Actions into the upper-right header action layer in the exact documented order. |  |
| 03R-AC89 | REQ | Package 3R-B > Ordered subtasks 3R-B-3 (Runtimes) | Remove the former profile-action row and absolute Runtime toolbar. |  |
| 03R-AC90 | REQ | Package 3R-B > Ordered subtasks 3R-B-3 (Runtimes) | Wire every existing lifecycle and Day-copy operation without changing scope or confirmation behavior. Verify clean, dirty, missing-profile, long-name, and narrow-width states. |  |
| 03R-AC91 | REQ | Package 3R-B > Ordered subtasks 3R-B-4 (Trips) | Move Trip Profile selection and lifecycle and all schedule commands into the upper-right header action layer. |  |
| 03R-AC92 | REQ | Package 3R-B > Ordered subtasks 3R-B-4 (Trips) | Remove the former Trip-profile row, visible five-button command row, More menu, and inline Shift tool. |  |
| 03R-AC93 | REQ | Package 3R-B > Ordered subtasks 3R-B-4 (Trips) | Preserve selection-dependent enablement, stale-Runtime status, destructive confirmations, copy previews, and batch Pattern-change previews. |  |
| 03R-AC94 | REQ | Package 3R-B > Ordered subtasks 3R-B-4 (Trips) | Verify empty timetable, populated timetable, selected rows, long profile names, and narrow-width states. |  |
| 03R-AC95 | REQ | Package 3R-B > Ordered subtasks 3R-B-5 (Shift drawer) | Implement the fixed geometry, control order, staged operation history, table preview, status, discard guard, stale response, and focus behavior specified above. |  |
| 03R-AC96 | REQ | Package 3R-B > Ordered subtasks 3R-B-5 (Shift drawer) | Keep timetable scrolling and row inspection usable while the drawer is open. Do not persist until Done. |  |
| 03R-AC97 | REQ | Package 3R-B > Ordered subtasks 3R-B-6 (accessibility and visual) | Verify complete keyboard operation without pointer input. |  |
| 03R-AC98 | REQ | Package 3R-B > Ordered subtasks 3R-B-6 (accessibility and visual) | Verify menu and drawer trigger names, expanded state, checked profile, disabled explanations, focus return, live preview status, and discard confirmation. |  |
| 03R-AC99 | REQ | Package 3R-B > Ordered subtasks 3R-B-6 (accessibility and visual) | Verify all controls meet the 30px minimum height and spacing requirements. |  |
| 03R-AC100 | REQ | Package 3R-B > Ordered subtasks 3R-B-6 (accessibility and visual) | Verify the two section headers use the same typography, Profile trigger, Actions trigger, separators, menu rows, and edge buffers. |  |
| 03R-AC101 | REQ | Package 3R-B > Ordered subtasks 3R-B-6 (accessibility and visual) | Verify no control is closer than 12px to a workflow-section edge and no wrapped row overlaps content. |  |
| 03R-AC102 | REQ | Package 3R-B > Ordered subtasks 3R-B-6 (accessibility and visual) | Visually inspect wide desktop, 1100px, 680px, long-profile-name, dirty Runtime, open-menu, and open-drawer states. |  |
| 03R-AC103 | TST | Package 3R-B > Required verification | TypeScript typechecking. |  |
| 03R-AC104 | TST | Package 3R-B > Required verification | Complete Vitest suite. |  |
| 03R-AC105 | TST | Package 3R-B > Required verification | Focused Playwright menu, geometry, responsive, and Shift-drawer tests. |  |
| 03R-AC106 | TST | Package 3R-B > Required verification | Production build, keyboard and accessibility review, and browser visual inspection. |  |
| 03R-AC107 | TST | Package 3R-B > Required verification | User verification of Runtime menus, Trip menus, staged Shift preview, Undo/Redo, Discard, Done, and the scope-change guard. |  |
| 03R-AC108 | GATE | Package 3R-B > Gate | Package 3R-B is complete. Stop here. Do not begin 3R-C or make structural corrections that change accepted behavior. If integration exposes a structural deficiency, recommend a bounded Luna correction for user approval. | Record shows TypeScript, 119 Vitest tests, 7 Playwright tests, production build, keyboard review, and 1280px/680px visual review passed; user verification of menus and Shift flow still required. |
| 03R-AC109 | REQ | Package 3R-C > Ordered subtasks | Confirm profile selection, profile lifecycle, editing commands, schedule commands, and Route-wide commands remain correctly scoped. |  |
| 03R-AC110 | REQ | Package 3R-C > Ordered subtasks | Confirm React owns only menu/drawer state and staged operation history, not authoritative time propagation or stale-source calculations. |  |
| 03R-AC111 | REQ | Package 3R-C > Ordered subtasks | Confirm every former visible command remains reachable, named consistently, and covered by keyboard navigation. |  |
| 03R-AC112 | REQ | Package 3R-C > Ordered subtasks | Confirm Runtimes and Trips share visual primitives and measurable geometry without duplicating domain behavior. |  |
| 03R-AC113 | REQ | Package 3R-C > Ordered subtasks | Run the complete automated suite, typechecking, production build, reload, accessibility review, and final visual review. |  |
| 03R-AC114 | REQ | Package 3R-C > Ordered subtasks | Update architecture, UI conventions, decisions, roadmap, and status documents. Record the Phase 3R closeout and stop before any Phase 4 or follow-on consolidation work. |  |
| 03R-AC115 | AC | Package 3R-C > Acceptance criteria | Both workflow sections have one upper-right header action layer and no redundant profile/action row. |  |
| 03R-AC116 | AC | Package 3R-C > Acceptance criteria | Profile menus list profiles before clearly separated lifecycle commands and expose the selected profile without relying on color. |  |
| 03R-AC117 | AC | Package 3R-C > Acceptance criteria | Runtime Pattern remains a separate selector. |  |
| 03R-AC118 | AC | Package 3R-C > Acceptance criteria | Runtime Add remains visible; Discard and Save appear only for a dirty Runtime draft. |  |
| 03R-AC119 | AC | Package 3R-C > Acceptance criteria | Runtime Day copy remains Route-wide and separate from the Pattern-owned Profile menu. |  |
| 03R-AC120 | AC | Package 3R-C > Acceptance criteria | Trips Actions contains every accepted schedule command in the documented order. |  |
| 03R-AC121 | AC | Package 3R-C > Acceptance criteria | Shift opens a right-docked non-modal drawer while the timetable remains inspectable. |  |
| 03R-AC122 | AC | Package 3R-C > Acceptance criteria | Shift changes are previewed but not persisted before Done. |  |
| 03R-AC123 | AC | Package 3R-C > Acceptance criteria | Undo, Redo, Discard, Done, stale-source rejection, and navigation guards behave as specified. |  |
| 03R-AC124 | AC | Package 3R-C > Acceptance criteria | Existing copy, regeneration, Pattern-change, deletion, profile, and Runtime-editing behavior is unchanged. |  |
| 03R-AC125 | AC | Package 3R-C > Acceptance criteria | Header alignment, 12px section buffers, 30px control heights, 5px action gaps, 8px group gaps, typography, menus, focus rings, and responsive behavior are consistent across like elements. |  |
| 03R-AC126 | AC | Package 3R-C > Acceptance criteria | Automated tests, production build, keyboard review, accessibility review, reload, and visual inspection pass. |  |
| 03R-AC127 | GATE | Package 3R-C > Gate | Package 3R-C is complete. Record the final result in phase-03r-closeout.md; stop before Phase 4 or the deferred follow-on candidates. | Record shows 119 Vitest tests and 8 Playwright tests passed at 3R-C; the Playwright count differs from 3R-B's 7. |
| 03R-AC128 | REQ | Deferred follow-on candidates | Candidates (top-level Scenario menu, top-level Data menu, Node and Pattern action menus) are evaluated only after Phase 3R is accepted. Do not include these candidates in Phase 3R implementation. |  |
| 03R-AC129 | GATE | Package 3R-C > Gate | Runtime reverse-copy remains available in the Profile menu. New profile… remains intentionally absent from the Trip Profile menu. | Conflicts with the fixed Runtime Profile menu content in the Runtimes action layer section, which lists no reverse-copy item. |

### 04: `docs/implementation/phase-04-manual-blocking.md`

Criteria in this document: 178.

| ID | Kind | Source heading | Criterion | Flag |
| --- | --- | --- | --- | --- |
| 04-AC1 | AC | Objective | Implement a manual blocking workflow using named Blocking Scenarios and ordered Block activities. |  |
| 04-AC2 | AC | Objective | Each Blocking Scenario selects one immutable Trip Profile and spans all service days. |  |
| 04-AC3 | AC | Objective | Users can create alternative blocking arrangements, assign and move revenue Trips, enter pull-out, pull-in, and deadhead activities, review connection feasibility, and derive complete or explicitly incomplete Block and service-day summaries. |  |
| 04-AC4 | AC | User outcome (item 1) | A user can create an empty Blocking Scenario or duplicate an existing one. |  |
| 04-AC5 | AC | User outcome (item 2) | A user can select one Trip Profile, Blocking Scenario, Route, and service day as workspace context. |  |
| 04-AC6 | AC | User outcome (item 3) | A user can create, label, rename, annotate, and delete Blocks. |  |
| 04-AC7 | AC | User outcome (item 4) | A user can assign, move, unassign, remove, and reorder Trips without duplicating one Trip ID within a Blocking Scenario and day. |  |
| 04-AC8 | AC | User outcome (item 5) | A user can see raw gaps, deadhead requirements, usable layovers, and connection findings. |  |
| 04-AC9 | AC | User outcome (item 6) | A user can enter pull-out, pull-in, and connection-deadhead durations relative to adjacent revenue Trips, Nodes, and optional miles; apply pull-outs or pull-ins to matching Blocks with an explicit preview and optional replacement of existing values. |  |
| 04-AC10 | AC | User outcome (item 7) | A user can retain structurally valid incomplete or infeasible work with visible findings. |  |
| 04-AC11 | AC | User outcome (item 8) | A user can review compatibility at a proposed chronological revenue-Trip insertion point without mutating Blocks. |  |
| 04-AC12 | AC | User outcome (item 9) | A user can view Block and selected-day revenue hours (running time plus layover), running time, platform hours, deadhead hours, layover hours, revenue miles, platform miles, and Block completeness status. |  |
| 04-AC13 | AC | User outcome (item 10) | A user can reload, duplicate, back up, restore, and export Blocking Scenarios without losing accepted relationships. |  |
| 04-AC14 | AC | User outcome (item 11) | A user can select a Blocking Scenario in Trips and assign, move, or unassign one or more Trips from its Block column without duplicating Trip assignments. |  |
| 04-AC15 | REQ | Fixed ownership and lifecycle | BlockingScenario belongs to one Scenario and selects one immutable Trip Profile. |  |
| 04-AC16 | REQ | Fixed ownership and lifecycle | One Blocking Scenario spans every service day. Each Block belongs to one Blocking Scenario and one service day. |  |
| 04-AC17 | REQ | Fixed ownership and lifecycle | A Scenario may contain zero Blocking Scenarios. |  |
| 04-AC18 | REQ | Fixed ownership and lifecycle | Users may create an empty Blocking Scenario or duplicate an existing one. |  |
| 04-AC19 | REQ | Fixed ownership and lifecycle | Blocking Scenario names are unique within the parent Scenario after trimming and case normalization. |  |
| 04-AC20 | REQ | Fixed ownership and lifecycle | Duplicating a Blocking Scenario copies all days, Blocks, and activities with new Blocking Scenario, Block, and activity IDs while retaining the same Trip references. |  |
| 04-AC21 | REQ | Fixed ownership and lifecycle | Deleting a Blocking Scenario deletes its Blocks after impact review and stale-source validation. |  |
| 04-AC22 | REQ | Fixed ownership and lifecycle | Blocks store blockingScenarioId; they do not store a second authoritative Trip Profile reference. | Phase 02TP (Blocking boundary) requires required tripProfileId on Block; this item says Blocks must not store a second authoritative Trip Profile reference. Treat as the superseding Block ownership rule for Phase 4 (flag for reviewer). |
| 04-AC23 | REQ | Fixed ownership and lifecycle | Copying a Trip Profile copies no Blocking Scenarios or Blocks. |  |
| 04-AC24 | REQ | Fixed ownership and lifecycle | Deleting a Trip Profile deletes its Blocking Scenarios and Blocks in the same reviewed transaction. |  |
| 04-AC25 | REQ | Fixed ownership and lifecycle | Project Scenario duplication copies and remaps the complete Blocking graph. |  |
| 04-AC26 | REQ | Fixed ownership and lifecycle | Archiving is excluded until its behavior is separately decided. |  |
| 04-AC27 | REQ | Fixed activity and assignment rules | Blocks are ordered activity lists with stable activity IDs and normalized sequences. |  |
| 04-AC28 | REQ | Fixed activity and assignment rules | Empty Blocks are valid. |  |
| 04-AC29 | REQ | Fixed activity and assignment rules | A Block has at most one pull-out, which is first, and at most one pull-in, which is last. |  |
| 04-AC30 | REQ | Fixed activity and assignment rules | At most one deadhead may appear between consecutive revenue Trips. |  |
| 04-AC31 | REQ | Fixed activity and assignment rules | New and edited pull-out and pull-in activities store whole-minute offsets from the first and last revenue Trips. New and edited deadheads store a whole-minute duration from their preceding revenue Trip; the remaining connection time is derived layover. |  |
| 04-AC32 | REQ | Fixed activity and assignment rules | Legacy explicit boundary and deadhead times remain readable. Pull-out, pull-in, and deadhead add optional miles. |  |
| 04-AC33 | REQ | Fixed activity and assignment rules | The same Trip ID may appear only once across all Blocks in one Blocking Scenario and service day. |  |
| 04-AC34 | REQ | Fixed activity and assignment rules | Different Trip IDs with identical schedules remain distinct and assignable. |  |
| 04-AC35 | REQ | Fixed activity and assignment rules | The same Trip may have a different assignment in another Blocking Scenario. |  |
| 04-AC36 | REQ | Fixed activity and assignment rules | Reassignment is one atomic move between Blocks and insertion positions. |  |
| 04-AC37 | REQ | Fixed activity and assignment rules | Structural corruption rejects a write. Operational infeasibility remains saved and visible as derived findings. |  |
| 04-AC38 | REQ | Fixed calculations | Revenue Trip start and end come from its first and last scheduled points. |  |
| 04-AC39 | REQ | Fixed calculations | Raw connection gap equals next revenue Trip start minus previous revenue Trip end. |  |
| 04-AC40 | REQ | Fixed calculations | When terminal Nodes match and no deadhead exists, usable layover equals the raw connection gap. |  |
| 04-AC41 | REQ | Fixed calculations | When terminal Nodes differ, the connection is incomplete without a deadhead. |  |
| 04-AC42 | REQ | Fixed calculations | With a deadhead, usable layover equals raw connection gap minus its resolved duration, subject to connection placement and Node-continuity validation. |  |
| 04-AC43 | REQ | Fixed calculations | Running time equals the sum of revenue-trip durations. |  |
| 04-AC44 | REQ | Fixed calculations | Revenue hours equal running time plus known usable layover between revenue Trips. |  |
| 04-AC45 | REQ | Fixed calculations | Deadhead hours equal the sum of pull-out, pull-in, and manual between-Trip deadhead durations. |  |
| 04-AC46 | REQ | Fixed calculations | Layover hours equal the sum of non-negative valid usable layovers between revenue movements. |  |
| 04-AC47 | REQ | Fixed calculations | Platform hours equal resolved pull-out start through resolved pull-in end and are incomplete without valid boundary activities and adjacent revenue Trips. |  |
| 04-AC48 | REQ | Fixed calculations | Revenue miles equal the sum of complete revenue Pattern distances. |  |
| 04-AC49 | REQ | Fixed calculations | Platform miles equal revenue, pull-out, deadhead, and pull-in miles and are incomplete when any required distance is missing. |  |
| 04-AC50 | REQ | Fixed calculations | Selected-day totals report a known valid subtotal. Block-level status and findings identify incomplete or infeasible work. |  |
| 04-AC51 | REQ | Fixed calculations | No minimum-layover policy is included. |  |
| 04-AC52 | REQ | Fixed UI and Route scope | The initial Blocking UI uses the selected Route to filter assignable and unassigned Trips. |  |
| 04-AC53 | REQ | Fixed UI and Route scope | Phase 4 does not intentionally create multi-route Blocks. |  |
| 04-AC54 | REQ | Fixed UI and Route scope | A Trip from another Route cannot be added to a non-empty Block. |  |
| 04-AC55 | REQ | Fixed UI and Route scope | Existing or imported multi-route Blocks remain completely visible. Route filtering cannot truncate Block activities. |  |
| 04-AC56 | REQ | Fixed UI and Route scope | The data model remains scenario-wide and does not add Route ownership to Blocks. |  |
| 04-AC57 | REQ | Fixed UI and Route scope | The Trips workspace adds a Blocking Scenario selector filtered to its selected Trip Profile. Its Block pill and Assign Block… action write only to Blocks in that selected context. |  |
| 04-AC58 | REQ | Fixed UI and Route scope | Blocking Scenario selection is a non-authoritative UI preference and must follow accepted Phase 3R menu, focus, responsive, and discard-guard conventions. |  |
| 04-AC59 | REQ | Package 4A > Required model and file ownership | Package 4A must not modify React layout, CSS, focus behavior, responsive behavior, or planner-facing interaction design. |  |
| 04-AC60 | REQ | Package 4A > Deliverables | Add BlockingScenario and normalized Block ownership types. |  |
| 04-AC61 | REQ | Package 4A > Deliverables | Make normalized Trip and Blocking ownership required inside current domain commands while retaining legacy handling at import and migration boundaries. |  |
| 04-AC62 | REQ | Package 4A > Deliverables | Define pure Blocking Scenario create, rename, duplication, deletion-impact, and stale-signature calculations. |  |
| 04-AC63 | REQ | Package 4A > Deliverables | Normalize activity order while retaining stable activity IDs. |  |
| 04-AC64 | REQ | Package 4A > Deliverables | Enforce activity cardinality and placement rules. |  |
| 04-AC65 | REQ | Package 4A > Deliverables | Enforce Blocking Scenario, Trip Profile, service-day, and Route-assignment boundaries. |  |
| 04-AC66 | REQ | Package 4A > Deliverables | Detect duplicate Trip assignment across the complete Blocking Scenario/day. |  |
| 04-AC67 | REQ | Package 4A > Deliverables | Define atomic assignment and reassignment command contracts. |  |
| 04-AC68 | REQ | Package 4A > Deliverables | Derive activity timing, raw gaps, layovers, summaries, completeness, and validity. |  |
| 04-AC69 | REQ | Package 4A > Deliverables | Return structured findings for overlap, negative connection time, location discontinuity, missing or non-fitting deadhead, missing boundaries, incomplete miles, and missing references. |  |
| 04-AC70 | REQ | Package 4A > Deliverables | Classify candidate Trips at the implicit appended revenue position by evaluating predecessor and successor connections. |  |
| 04-AC71 | REQ | Package 4A > Deliverables | Define UI-facing queries without embedding visual layout decisions. |  |
| 04-AC72 | TST | Package 4A > Required tests | Blocking Scenario naming, ownership, and immutable Trip Profile source. |  |
| 04-AC73 | TST | Package 4A > Required tests | Empty and populated Blocking Scenario duplication across all service days. |  |
| 04-AC74 | TST | Package 4A > Required tests | Activity normalization and stable IDs. |  |
| 04-AC75 | TST | Package 4A > Required tests | Pull-out and pull-in cardinality and position. |  |
| 04-AC76 | TST | Package 4A > Required tests | Matching-terminal layover. |  |
| 04-AC77 | TST | Package 4A > Required tests | Different-terminal incomplete connection. |  |
| 04-AC78 | TST | Package 4A > Required tests | Fitting, misplaced, and non-fitting deadhead. |  |
| 04-AC79 | TST | Package 4A > Required tests | Overlap and extended times above 24:00. |  |
| 04-AC80 | TST | Package 4A > Required tests | Duplicate Trip prevention across Blocks. |  |
| 04-AC81 | TST | Package 4A > Required tests | Identical schedules with distinct Trip IDs. |  |
| 04-AC82 | TST | Package 4A > Required tests | Atomic reassignment request behavior. |  |
| 04-AC83 | TST | Package 4A > Required tests | Revenue, platform, deadhead, and layover hours. |  |
| 04-AC84 | TST | Package 4A > Required tests | Complete and incomplete revenue and platform miles. |  |
| 04-AC85 | TST | Package 4A > Required tests | Known subtotal and invalid/incomplete counts. |  |
| 04-AC86 | TST | Package 4A > Required tests | Two-sided insertion compatibility. |  |
| 04-AC87 | TST | Package 4A > Required tests | 100 Blocks and 500 Trips for one service day. |  |
| 04-AC88 | GATE | Package 4A > Gate | Run focused domain and application-contract tests plus TypeScript typechecking. |  |
| 04-AC89 | GATE | Package 4A > Gate | Present worked timelines covering same-terminal service, manual deadhead, overlap, after-midnight service, incomplete platform data, and insertion between two Trips. |  |
| 04-AC90 | GATE | Package 4A > Gate | Confirm results with the user before Package 4B. |  |
| 04-AC91 | REQ | Package 4B > Required model and file ownership | No page layout, CSS, interaction, accessibility, or visual-design decisions. |  |
| 04-AC92 | REQ | Package 4B > Deliverables | Add narrow Blocking Scenario and Block repository methods. |  |
| 04-AC93 | REQ | Package 4B > Deliverables | Create, rename, duplicate, and delete Blocking Scenarios atomically where required. |  |
| 04-AC94 | REQ | Package 4B > Deliverables | Save assignment, reassignment, removal, activity editing, and ordering through explicit transactions. |  |
| 04-AC95 | REQ | Package 4B > Deliverables | Recheck stale signatures and complete-scope duplicate rules immediately before writes. |  |
| 04-AC96 | REQ | Package 4B > Deliverables | Add the next Dexie version with a blockingScenarios table and blockingScenarioId Block indexes. |  |
| 04-AC97 | REQ | Package 4B > Deliverables | Discard existing pre-Phase-4 placeholder Blocks during migration as approved by Decision 0019; retain all Trips and Trip Profiles. |  |
| 04-AC98 | REQ | Package 4B > Deliverables | Increment the JSON backup schema and keep versions 1 through 4 readable under the approved placeholder-Block discard rule. |  |
| 04-AC99 | REQ | Package 4B > Deliverables | Remap Blocking Scenario, Block, activity, Trip, and non-revenue Node references during Project Scenario duplication and import-as-copy. |  |
| 04-AC100 | REQ | Package 4B > Deliverables | Duplicate a Blocking Scenario across all days with new structural IDs and retained Trip references. |  |
| 04-AC101 | REQ | Package 4B > Deliverables | Delete a Trip Profile with all of its Blocking Scenarios and Blocks. |  |
| 04-AC102 | REQ | Package 4B > Deliverables | Revalidate Blocks after stable Trip shift, recalculation, or Pattern change without changing their references. |  |
| 04-AC103 | REQ | Package 4B > Deliverables | Remove affected revenue activities after Trip deletion, service-day replacement, Pattern reset, or Route deletion while retaining Blocks. |  |
| 04-AC104 | REQ | Package 4B > Deliverables | Include non-revenue activity impacts in Node and Route deletion previews; remove reviewed affected activities while retaining Blocks. |  |
| 04-AC105 | REQ | Package 4B > Deliverables | Export Blocking Scenario, Block, activity, and derived summary CSV files with stable columns and completeness fields. The UI packages multi-file CSV exports into one ZIP download. |  |
| 04-AC106 | REQ | Package 4B > Deliverables | Keep visible local-save status behavior intact. |  |
| 04-AC107 | TST | Package 4B > Required verification | Repository and transaction tests. |  |
| 04-AC108 | TST | Package 4B > Required verification | Duplicate-assignment race and stale-preview rejection. |  |
| 04-AC109 | TST | Package 4B > Required verification | Forced rollback for create, duplicate, delete, assignment, and reassignment. |  |
| 04-AC110 | TST | Package 4B > Required verification | Dexie migration tests with zero and populated placeholder Blocks. |  |
| 04-AC111 | TST | Package 4B > Required verification | Proof that placeholder-Block removal does not remove Trips or Trip Profiles. |  |
| 04-AC112 | TST | Package 4B > Required verification | Backup versions 1 through current, and a complete current-version round trip. |  |
| 04-AC113 | TST | Package 4B > Required verification | Import-as-copy and Project Scenario duplication reference remapping. |  |
| 04-AC114 | TST | Package 4B > Required verification | Blocking Scenario duplication across all days. |  |
| 04-AC115 | TST | Package 4B > Required verification | Trip Profile copy and deletion behavior. |  |
| 04-AC116 | TST | Package 4B > Required verification | Trip, service-day, Pattern, Route, and Node cleanup behavior. |  |
| 04-AC117 | TST | Package 4B > Required verification | CSV headers, escaping, ordering, summaries, and incomplete values. |  |
| 04-AC118 | TST | Package 4B > Required verification | TypeScript typechecking, complete Vitest suite, and production build. |  |
| 04-AC119 | GATE | Package 4B > Gate | The Package 4B data-integrity gate was completed before Package 4C. |  |
| 04-AC120 | REQ | Package 4C > Required interface behavior | Enable Blocking for a selected Trip Profile, Blocking Scenario, Route, and service day. |  |
| 04-AC121 | REQ | Package 4C > Required interface behavior | Provide empty-create, duplicate, rename, and delete workflows with explicit scope and consequences. |  |
| 04-AC122 | REQ | Package 4C > Required interface behavior | Select one service day at a time while retaining a Blocking Scenario that spans all days. |  |
| 04-AC123 | REQ | Package 4C > Required interface behavior | Show compact unassigned Trips with Route, Pattern, start and end Nodes, start and end times, header-level filtering and sorting, and compatibility at the proposed chronological insertion position. |  |
| 04-AC124 | REQ | Package 4C > Required interface behavior | New assignments insert before the first later-starting displayed Trip. Equal From Times retain their existing order. Explicit arrow-based reordering remains preserved. |  |
| 04-AC125 | REQ | Package 4C > Required interface behavior | Show a selected Block as a complete ordered activity table even when it contains imported activities from another Route. |  |
| 04-AC126 | REQ | Package 4C > Required interface behavior | Create, rename, annotate, and delete Blocks. |  |
| 04-AC127 | REQ | Package 4C > Required interface behavior | Assign, atomically reassign, remove, and reorder revenue Trips. |  |
| 04-AC128 | REQ | Package 4C > Required interface behavior | Add and edit pull-out, pull-in, and connection-deadhead relative durations. Pull-out To and pull-in From default to the selected Block's first and last Trip Nodes, but users may choose any Node. |  |
| 04-AC129 | REQ | Package 4C > Required interface behavior | Bulk review always includes the selected Block when it has Trips. It includes other Blocks whose first or last Trip Node matches the chosen Node across all Routes in the current Blocking Scenario and day. |  |
| 04-AC130 | REQ | Package 4C > Required interface behavior | Bulk review shows add, replace, keep, and skip counts before one atomic save, preserving other Block-specific overrides by default. |  |
| 04-AC131 | REQ | Package 4C > Required interface behavior | Show raw gap, deadhead duration, usable layover, validity, and completeness at the relevant connection. |  |
| 04-AC132 | REQ | Package 4C > Required interface behavior | Keep findings visible through text and accessible status, not color alone. |  |
| 04-AC133 | REQ | Package 4C > Required interface behavior | Show Block-level status and findings plus a known valid selected-day subtotal. Do not repeat aggregate complete/incomplete counts as summary tiles. |  |
| 04-AC134 | REQ | Package 4C > Required interface behavior | In the Blocks table, mark each Block with operational or structural findings beside its name. Distinguish conflicts from incomplete information, and expose issue descriptions on hover and keyboard focus. |  |
| 04-AC135 | REQ | Package 4C > Required interface behavior | Mileage-only incompleteness does not produce an issue icon. Show missing mileage separately from Issues in Current Block while leaving mileage totals incomplete. |  |
| 04-AC136 | REQ | Package 4C > Required interface behavior | Selecting the Block name opens its Current Block activity and findings view. |  |
| 04-AC137 | REQ | Package 4C > Required interface behavior | Make every Blocks table column sortable. Only the Block name opens the block in Current Block. |  |
| 04-AC138 | REQ | Package 4C > Required interface behavior | Place a known-subtotal table below Blocks with Revenue, Platform, Layover, Layover %, and Deadhead totals. Use a blue selected-item highlight in the Current Block menu. |  |
| 04-AC139 | REQ | Package 4C > Required interface behavior | Add a Blocking Scenario selector to Trips, filtered to the selected Trip Profile. Its Block pill opens same-scenario/day Block choices and requires confirmation before assigning, moving, or unassigning one Trip. |  |
| 04-AC140 | REQ | Package 4C > Required interface behavior | The Trips Actions menu provides Assign Block… and Unassign from Block… for selected Trips, including Trips in different Blocks or unassigned. |  |
| 04-AC141 | REQ | Package 4C > Required interface behavior | Bulk assignment and unassignment are atomic. Adjacent deadheads removed from source Blocks are disclosed in confirmation; pull-outs and pull-ins remain. The Block label reflects only the selected Blocking Scenario. |  |
| 04-AC142 | REQ | Package 4C > Required interface behavior | Treat the selected Route as the candidate filter without hiding complete Block contents. |  |
| 04-AC143 | REQ | Package 4C > Interaction and accessibility requirements | Drag-and-drop may be provided but cannot be the only assignment or ordering method. |  |
| 04-AC144 | REQ | Package 4C > Interaction and accessibility requirements | Keyboard users must be able to assign, reassign, remove, reorder, edit, confirm, cancel, and return focus predictably. |  |
| 04-AC145 | REQ | Package 4C > Interaction and accessibility requirements | Selection-dependent actions remain visible when disabled and expose a concise explanation. |  |
| 04-AC146 | REQ | Package 4C > Interaction and accessibility requirements | Dialogs identify Blocking Scenario, day, source and destination Blocks, and destructive consequences. |  |
| 04-AC147 | REQ | Package 4C > Interaction and accessibility requirements | Findings provide a keyboard-operable path to the responsible activity. |  |
| 04-AC148 | REQ | Package 4C > Interaction and accessibility requirements | Dense tables use the accepted data-grid frame, horizontal overflow, stable identifying columns, compact control sizes, and text status. |  |
| 04-AC149 | REQ | Package 4C > Interaction and accessibility requirements | Menus and selectors follow Phase 3R keyboard, focus-return, checked-item, separator, dismissal, and responsive conventions. |  |
| 04-AC150 | REQ | Package 4C > Interaction and accessibility requirements | Narrow layouts cannot overlap or truncate the active editor. Multi-route imported activities remain visible. |  |
| 04-AC151 | REQ | Package 4C > Interaction and accessibility requirements | Status changes and validation results are announced without excessive repetition. |  |
| 04-AC152 | REQ | Package 4C > Required behavior (boundary) | The UI implementation consumes the Package 4A and 4B contracts and does not recreate authoritative validation, compatibility, summary, ownership, or duplicate-assignment logic in React. |  |
| 04-AC153 | GATE | Package 4C > Gate | The user manually builds representative Federal Boulevard Blocks including empty-create, duplication, same-terminal connection, manual deadhead, atomic reassignment, overlap, after-midnight service, pull-out and pull-in relative offsets, dynamic boundary updates after a Trip change, incomplete miles, and Trips Block-column context. |  |
| 04-AC154 | GATE | Package 4C > Gate | Run TypeScript typechecking, complete Vitest and Playwright suites, production build, reload, keyboard review, accessibility review, and desktop/narrow visual inspection. |  |
| 04-AC155 | REQ | Package 4D > Ordered review | Confirm the ownership chain has one authority and no Block-level Trip Profile duplication. | Same tension as the Blocks-store-blockingScenarioId item in Fixed ownership and lifecycle; 02TP required Block tripProfileId. |
| 04-AC156 | REQ | Package 4D > Ordered review | Confirm every lifecycle and destructive command reports and applies complete impacts. |  |
| 04-AC157 | REQ | Package 4D > Ordered review | Confirm stable Trip edits retain references and destructive schedule changes leave no dangling Trip or Node references. |  |
| 04-AC158 | REQ | Package 4D > Ordered review | Confirm React owns only presentation, selection, and draft interaction state. |  |
| 04-AC159 | REQ | Package 4D > Ordered review | Confirm Trips and Blocking contexts remain correctly filtered and do not change accepted Runtime or Trip command scope. |  |
| 04-AC160 | REQ | Package 4D > Ordered review | Confirm backup, migration, duplication, CSV, reload, capacity, accessibility, and visual evidence. |  |
| 04-AC161 | REQ | Package 4D > Ordered review | Update architecture, schema, glossary, UI conventions, roadmap, and status documentation. |  |
| 04-AC162 | REQ | Package 4D > Ordered review | Record the Phase 4 closeout and stop before Costing. |  |
| 04-AC163 | AC | Package 4D > Acceptance criteria | Every Blocking Scenario belongs to one Scenario and one immutable Trip Profile and spans all service days. |  |
| 04-AC164 | AC | Package 4D > Acceptance criteria | Every Block belongs to one Blocking Scenario and one service day. |  |
| 04-AC165 | AC | Package 4D > Acceptance criteria | A Trip cannot be duplicated within a Blocking Scenario/day but may be arranged differently in another Blocking Scenario. |  |
| 04-AC166 | AC | Package 4D > Acceptance criteria | Reassignment writes both affected Blocks atomically. |  |
| 04-AC167 | AC | Package 4D > Acceptance criteria | Blocks persist ordered activities rather than copied Trip data or summary totals. |  |
| 04-AC168 | AC | Package 4D > Acceptance criteria | Structural corruption is rejected; operational infeasibility remains visible and reviewable. |  |
| 04-AC169 | AC | Package 4D > Acceptance criteria | Every displayed gap, layover, compatibility result, hour, mile, subtotal, and completeness status is derived from authoritative records. Revenue hours equal running time plus layover; Running Time remains separately available. |  |
| 04-AC170 | AC | Package 4D > Acceptance criteria | Platform hours and miles are never presented as complete without required inputs. |  |
| 04-AC171 | AC | Package 4D > Acceptance criteria | Route filtering does not truncate selected Block contents or create unintended multi-route assignments. |  |
| 04-AC172 | AC | Package 4D > Acceptance criteria | The Trips Block column is explicitly scoped by a Blocking Scenario selector. Pill and bulk Actions assignments or unassignments cannot cross service-day or Trip Profile scope; multi-select operations are atomic and duplicate-safe. |  |
| 04-AC173 | AC | Package 4D > Acceptance criteria | Trip, Trip Profile, Route, Pattern, Node, and service-day changes follow the approved cleanup and revalidation rules. |  |
| 04-AC174 | AC | Package 4D > Acceptance criteria | Dexie migration applies the documented placeholder-Block discard and preserves all non-Block schedule records. |  |
| 04-AC175 | AC | Package 4D > Acceptance criteria | JSON backup, restore, import-as-copy, Project Scenario duplication, Blocking Scenario duplication, and CSV pass complete reference checks. |  |
| 04-AC176 | AC | Package 4D > Acceptance criteria | The Blocking and Trips interfaces contain no authoritative validation, ownership, compatibility, or summary calculations. |  |
| 04-AC177 | AC | Package 4D > Acceptance criteria | Automated tests, production build, reload, capacity checks, keyboard review, accessibility review, and visual inspection pass. |  |
| 04-AC178 | GATE | Package 4D > Closeout | Record a Phase 4 closeout. Present Costing as a separate user-approved phase; do not start it. |  |

### 05: `docs/implementation/phase-05-costing.md`

Criteria in this document: 74.

| ID | Kind | Source heading | Criterion | Flag |
| --- | --- | --- | --- | --- |
| 05-AC1 | GATE | Status and gate | Package 5C stop gate: user verification with representative local project data remains the 5C stop gate before Package 5D. | Status says 5C implemented and automated checks pass; user verification still pending per status text. |
| 05-AC2 | AC | Outcome | For one selected Blocking Scenario at a time, show eligible daily Revenue and Platform Hours, cost per service day, annualized quantities and USD cost, plus a base service year and up to ten future years. |  |
| 05-AC3 | AC | Outcome | An NTD-style entered USD/VRH rate is the only initial multiplier. |  |
| 05-AC4 | AC | Outcome | Apply the same Scenario-owned assumptions when switching Blocking Scenarios. |  |
| 05-AC5 | AC | Outcome | Show excluded Block and unassigned-Trip counts. Never label a partial estimate as complete. Do not add a cross-scenario comparison table. |  |
| 05-AC6 | REQ | Pure calculation contract | Input: one Scenario's service-day definitions and Costing assumptions, the selected Blocking Scenario, its source Trip Profile, saved Trips and Blocks, and pure Blocking summaries. Output: per-day eligibility and exclusions, annual quantities, adjusted rates by year, daily and annual cost rows, and plain-language finding codes. Do not persist outputs. |  |
| 05-AC7 | REQ | Pure calculation contract (eligibility) | A Block is eligible only when it contains at least one revenue-Trip activity, its BlockSummary.valid is true, every resolved connection has status valid, and its platformHours and revenueHours are finite, nonnegative numbers. |  |
| 05-AC8 | REQ | Pure calculation contract (eligibility) | platformHours must be defined by valid pull-out and pull-in boundaries. |  |
| 05-AC9 | REQ | Pure calculation contract (eligibility) | A connection with missing times or a missing required deadhead is incomplete and excludes the Block even if BlockSummary.valid remains true. Structural errors and connection conflicts also exclude it. |  |
| 05-AC10 | REQ | Pure calculation contract (eligibility) | Mileage findings alone do not affect eligibility. Do not use BlockSummary.complete or the scenario-wide aggregate platformHours as shortcuts. |  |
| 05-AC11 | REQ | Pure calculation contract (eligibility) | Sum individual eligible Block summaries. An empty Block contributes no quantities and is neither eligible nor counted as excluded work. |  |
| 05-AC12 | REQ | Pure calculation contract (exclusions) | For each service day, count nonempty ineligible Blocks and source Trip Profile Trips not assigned to any Block in the selected Blocking Scenario as separate exclusions. |  |
| 05-AC13 | REQ | Pure calculation contract (exclusions) | Keep reason codes for affected Blocks so missing boundaries, incomplete connections, and conflicts can be reported without guessing from a scenario-level status. |  |
| 05-AC14 | REQ | Pure calculation contract (exclusions) | Any such exclusion makes the estimate partial, including when the service-day count is zero. |  |
| 05-AC15 | REQ | Pure calculation contract (exclusions) | If no eligible Block exists across the selected Blocking Scenario, return a no-estimate state rather than a numeric zero-cost estimate. |  |
| 05-AC16 | REQ | Pure calculation contract (formulas) | For year y, rate[y] = enteredRate x (1 + annualEscalation)^(y - rateYear). |  |
| 05-AC17 | REQ | Pure calculation contract (formulas) | For day d, costPerDay[d,y] = eligibleRevenueHours[d] x rate[y]; annualCost[d,y] = costPerDay[d,y] x annualDayCount[d]. Sum across four days. |  |
| 05-AC18 | REQ | Pure calculation contract (rounding) | Keep full numeric precision through all calculations and totals. |  |
| 05-AC19 | REQ | Pure calculation contract (rounding) | At the presentation/export boundary, round USD amounts independently to two decimal places and hours independently to four decimal places, with exact half-unit ties rounded away from zero. |  |
| 05-AC20 | REQ | Pure calculation contract (rounding) | Show the applied USD/VRH rate to four decimal places so escalation is visible. |  |
| 05-AC21 | REQ | Pure calculation contract (rounding) | Do not add already rounded rows to obtain totals. Minor displayed row-versus-total differences from rounding are acceptable and must be identified in export metadata. |  |
| 05-AC22 | TST | Pure calculation contract (rounding) | Include tie and row-total rounding examples in 5A tests. |  |
| 05-AC23 | REQ | Pure calculation contract (recalculation) | Future schedule, counts, and quantities are held constant. |  |
| 05-AC24 | REQ | Pure calculation contract (recalculation) | A changed source Trip, Block, service-day count, or assumption recalculates results automatically. |  |
| 05-AC25 | REQ | Pure calculation contract (counts and dates) | Require annual counts as nonnegative integers totaling at most 365. A total below 365 is valid and is not scaled up. |  |
| 05-AC26 | REQ | Pure calculation contract (counts and dates) | Zero-count days show daily quantities but add zero annual cost. |  |
| 05-AC27 | REQ | Pure calculation contract (counts and dates) | Block eligibility affects both Revenue and Platform quantities consistently. |  |
| 05-AC28 | REQ | Pure calculation contract (counts and dates) | Require the source rate year to be no later than the base service year. |  |
| 05-AC29 | REQ | Pure calculation contract (counts and dates) | Default annual escalation to 3%. Permit a finite negative value above -100% for sensitivity testing, and reject -100% or below. |  |
| 05-AC30 | REQ | Persisted inputs and lifecycle | Replace the unused draft CostPlan and CostEstimate shapes with one Scenario-owned Costing assumptions record. |  |
| 05-AC31 | REQ | Persisted inputs and lifecycle | Assumptions fields: stable ID, Scenario ID, fixed USD currency, optional entered USD/VRH rate, rate year, source type and note, base service year, future-year count 0-10, annual escalation (3% editor default), and metadata. |  |
| 05-AC32 | REQ | Persisted inputs and lifecycle | Zero is a valid entered rate. An absent rate means the user has not entered one. |  |
| 05-AC33 | REQ | Persisted inputs and lifecycle | Do not store totals, selected year, selected Blocking Scenario, or a duplicate Trip Profile ID as authoritative cost data. |  |
| 05-AC34 | REQ | Persisted inputs and lifecycle | The selected Blocking Scenario and year are workspace UI state. Change of selection does not create a new Costing scenario. |  |
| 05-AC35 | REQ | Persisted inputs and lifecycle | Scenario duplication copies assumptions with a new ID. Scenario deletion removes them. |  |
| 05-AC36 | REQ | Persisted inputs and lifecycle | Blocking Scenario duplication or deletion does not clone or delete assumptions. |  |
| 05-AC37 | REQ | Persisted inputs and lifecycle | JSON project backup/restore includes the inputs and uses schema version 6. Versions 1-5 remain readable and import without assumptions. |  |
| 05-AC38 | REQ | Persisted inputs and lifecycle | Database version 5 adds the assumptions store and leaves it empty for existing Scenarios. New records are created lazily, without inventing a rate or service year. |  |
| 05-AC39 | REQ | Persisted inputs and lifecycle | Import-as-copy remaps Scenario ownership. |  |
| 05-AC40 | REQ | Persisted inputs and lifecycle | Restore validates ownership, rate/year range, USD currency, and version. Historical service-day totals above 365 remain preserved but block calculations pending correction. |  |
| 05-AC41 | REQ | Persisted inputs and lifecycle (CSV export) | CSV export returns three fixed files for one selected Blocking Scenario: costing-assumptions.csv, costing-results.csv, and costing-exclusions.csv. The UI packages them into one ZIP download. |  |
| 05-AC42 | REQ | Persisted inputs and lifecycle (CSV export) | Assumptions headers include selected Blocking Scenario and Trip Profile, cost basis, currency, rate unit, source, rate year, base service year, horizon, escalation fraction, and rounding note. |  |
| 05-AC43 | REQ | Persisted inputs and lifecycle (CSV export) | Results headers identify row type, selected source, estimate state and reason, service day or year, service-day count, eligible/excluded/unassigned counts, Revenue and Platform Hours, applied USD/VRH rate, daily and annual USD, and rounding note. |  |
| 05-AC44 | REQ | Persisted inputs and lifecycle (CSV export) | Exclusions include service day, excluded Block ID and label, reason codes, and unassigned Trip count. |  |
| 05-AC45 | REQ | Persisted inputs and lifecycle (CSV export) | USD amounts use two decimals, hours four decimals, and applied rates four decimals. Totals are calculated before rounding and rounded independently. CSV remains reporting, not backup. |  |
| 05-AC46 | REQ | UI structure | Use the shared module toolbar for Blocking Scenario, derived read-only Trip Profile, View year, and Costing Actions. |  |
| 05-AC47 | REQ | UI structure | Keep assumptions in one full-width workspace section. Do not repeat an Estimate Context card. |  |
| 05-AC48 | REQ | UI structure | Main results table columns: Day, Days, Revenue h/day, Platform h/day, Cost/day, Annual Revenue h, Annual Platform h, Annual cost. Totals align under the same columns. |  |
| 05-AC49 | REQ | UI structure | The year selector changes the table. An outlook table lists all years and applied rates. |  |
| 05-AC50 | REQ | UI structure | Exclusions are a visible summary near the table, with details for affected Blocks. Zero eligibility produces a no-estimate state, not a misleading $0. There is no cross-scenario comparison table. |  |
| 05-AC51 | REQ | UI structure | No independent Costing scenario CRUD. No Platform-Hour cost, mileage supplement, charts, inferred NTD downloads, or cost-category allocation. |  |
| 05-AC52 | REQ | UI structure | Use accessible labels, keyboard operable controls, coherent focus after selection, and responsive table review. |  |
| 05-AC53 | GATE | Packages and ownership > 5A stop gate | User proceeded to Package 5B after implementation. Calculation examples remain documented in the 5A tests and earlier review. |  |
| 05-AC54 | GATE | Packages and ownership > 5B stop gate | Passed on 2026-09-23: browser migration preserved a version 4 project; backup round-trip and version 5 compatibility passed; malformed assumptions were rejected; CSV rounding/reconciliation and one ZIP archive passed. | Recorded result, not a future gate. |
| 05-AC55 | GATE | Packages and ownership > 5C stop gate | Automated checks pass. User verifies representative scenarios in browser before Package 5D. |  |
| 05-AC56 | GATE | Packages and ownership > 5D stop gate | Report results and ask before any follow-on scope. Cross-layer audit, docs, regression verification, user acceptance. |  |
| 05-AC57 | REQ | Packages and ownership | No package starts automatically after its gate. If 5C exposes a new domain rule, return it to a structural change rather than implementing that rule in the UI. |  |
| 05-AC58 | REQ | Packages and ownership > 5C | Use existing workflow sections, tables, and the shared module toolbar. No business math in React. |  |
| 05-AC59 | REQ | Packages and ownership > 5C | No cross-scenario comparison table. |  |
| 05-AC60 | AC | Acceptance criteria (1) | A selected Blocking Scenario's eligible Blocks alone determine costed Revenue Hours. Platform Hours are displayed and not multiplied into a second cost. |  |
| 05-AC61 | AC | Acceptance criteria (2) | Missing mileage does not suppress otherwise eligible hour-based estimates. |  |
| 05-AC62 | AC | Acceptance criteria (2) | Missing Platform boundaries, invalid connections, and unassigned Trips are reported as exclusions. Empty or partially eligible data cannot masquerade as complete service. |  |
| 05-AC63 | AC | Acceptance criteria (3) | Per-day and annual totals reconcile before presentation rounding to eligible quantities and service-day counts. Independently rounded displayed rows may differ from a displayed total by the rounding amount. |  |
| 05-AC64 | AC | Acceptance criteria (3) | The count sum never exceeds 365 in new edits. Less than 365 remains valid. |  |
| 05-AC65 | AC | Acceptance criteria (4) | The entered source rate, source year, applied year rate, and escalation are visible and calculate correctly for the base year and each selected future year. |  |
| 05-AC66 | AC | Acceptance criteria (5) | Switching Blocking Scenarios changes quantities while retaining the one Scenario-owned assumptions set. Trip Profile derivation remains unambiguous. |  |
| 05-AC67 | AC | Acceptance criteria (6) | Backup/restore, scenario copy, migration, and export preserve inputs and reproduce derived results without persisting totals. |  |
| 05-AC68 | AC | Acceptance criteria (7) | The UI is keyboard accessible, table columns and totals align, and a standard desktop width needs no unintended horizontal scrolling. |  |
| 05-AC69 | AC | Acceptance criteria (8) | One editable assumption set applies across Blocking Scenarios. Escalation defaults to 3%, and the maximum horizon is the base year plus ten future years. |  |
| 05-AC70 | AC | Acceptance criteria (8) | The UI shows one selected Blocking Scenario at a time without a cross-scenario comparison table. |  |
| 05-AC71 | TST | Verification | Focused Vitest coverage for pure math, eligibility, edge cases, and life cycles. |  |
| 05-AC72 | TST | Verification | TypeScript check; migration and JSON round-trip tests; CSV reconciliation. |  |
| 05-AC73 | TST | Verification | Relevant Playwright UI and keyboard checks; production build; browser visual inspection with small and dense data. |  |
| 05-AC74 | REQ | Verification | Documentation-only changes to this plan require proofreading and cross-file consistency rather than a code test suite. |  |

### RTP: `docs/implementation/runtime-table-paste.md`

Criteria in this document: 25.

| ID | Kind | Source heading | Criterion | Flag |
| --- | --- | --- | --- | --- |
| RTP-AC1 | REQ | Status | This workflow does not import scheduled Trips or full Excel workbooks. | Scope statement from the Status section. |
| RTP-AC2 | AC | Objective | Allow users to enter several runtime bands from spreadsheet clipboard data or CSV text without editing every cell individually. |  |
| RTP-AC3 | REQ | Objective | Keep runtime-profile ownership, validation, persistence, and Trip recalculation behavior unchanged. |  |
| RTP-AC4 | AC | Accepted behavior | Paste rows… is available in the Runtimes Actions menu. |  |
| RTP-AC5 | AC | Accepted behavior | The dialog accepts tab-separated spreadsheet clipboard data and comma-separated CSV, including quoted CSV fields and CRLF line endings. |  |
| RTP-AC6 | AC | Accepted behavior | Data rows contain From, To, and one segment runtime for each segment in the selected Pattern, in displayed order. |  |
| RTP-AC7 | AC | Accepted behavior | A header row is optional. When present, it may include a leading Band column and a trailing Total column. Imported Band labels are retained. Total is ignored and recalculated by the application. |  |
| RTP-AC8 | AC | Accepted behavior | Full Runtime profile CSV may also include a Calculation Method column containing the same supported method on every row. When present, applying the rows updates the draft method along with its bands. |  |
| RTP-AC9 | AC | Accepted behavior | Headerless rows must contain only From, To, and segment runtimes. |  |
| RTP-AC10 | AC | Accepted behavior | From and To use the existing service-time parser, including times after 24:00. Segment runtimes use the existing duration parser. |  |
| RTP-AC11 | AC | Accepted behavior | Users choose to replace all current time bands or append the pasted rows. Replace is the initial selection. |  |
| RTP-AC12 | AC | Accepted behavior | The dialog previews parsed times, segment runtimes, and calculated Total values. It validates the complete candidate profile before allowing Apply. |  |
| RTP-AC13 | AC | Accepted behavior | Parse errors and validation errors prevent any draft changes. Validation findings that are not errors remain visible and follow the existing save behavior. |  |
| RTP-AC14 | AC | Accepted behavior | Apply updates the unsaved Runtime editor draft. The existing Runtimes Save action persists the profile. |  |
| RTP-AC15 | AC | Accepted behavior | Runtime profiles may be assigned to multiple service days. Saving changes to a shared profile affects each assignment. Existing Trips remain unchanged until users explicitly recalculate them. |  |
| RTP-AC16 | AC | Accepted behavior | No domain schema, IndexedDB, backup, or scheduled-Trip import changes are required. |  |
| RTP-AC17 | AC | Acceptance criteria | Users can paste a complete row or multiple rows from a spreadsheet or CSV text. |  |
| RTP-AC18 | AC | Acceptance criteria | Input column count must match the selected Pattern's segment count and any recognized optional Band or Total columns. |  |
| RTP-AC19 | AC | Acceptance criteria | Invalid times, durations, malformed quoting, blank required cells, and profile-level errors are shown before Apply. |  |
| RTP-AC20 | AC | Acceptance criteria | Applying a valid batch changes only the editor draft. Cancel leaves it unchanged. |  |
| RTP-AC21 | AC | Acceptance criteria | Replace removes existing bands from the draft. Append preserves them and sequences new bands after them. |  |
| RTP-AC22 | AC | Acceptance criteria | Save continues to use the existing runtime-profile validation and persistence path. |  |
| RTP-AC23 | AC | Acceptance criteria | The Runtime table's calculated Total remains derived and cannot be imported as authoritative data. |  |
| RTP-AC24 | REQ | Later profile CSV exchange | The subsequent profile export adds a Calculation Method column to preserve the selected profile's calculation behavior. |  |
| RTP-AC25 | REQ | Later profile CSV exchange | Runtime profile import continues through this preview-and-save workflow. Trips CSV interchange is documented separately in phase-02r-trip-table-interchange-undo.md. |  |

### TTI: `docs/implementation/phase-02r-trip-table-interchange-undo.md`

Criteria in this document: 21.

| ID | Kind | Source heading | Criterion | Flag |
| --- | --- | --- | --- | --- |
| TTI-AC1 | REQ | Scope | Import and export the selected Runtime profile as CSV, preserving the profile calculation method. | No separate Accepted behavior heading exists in this doc; Scope bullets are treated as its requirements. |
| TTI-AC2 | REQ | Scope | Import and export the displayed Trips schedule as CSV using stable IDs and schedule-point times. |  |
| TTI-AC3 | REQ | Scope | Preview and validate Trip CSV changes before save. Existing Trip IDs update; blank IDs add manual Trips; omitted rows remain unchanged. |  |
| TTI-AC4 | REQ | Scope | Add one-step, persistent undo for recalculation, with stale-data checks and invalidation when an affected Trip changes or is removed. |  |
| TTI-AC5 | REQ | Scope | Default newly created Runtime profiles to Band at segment start while retaining legacy behavior for profiles without a saved method. |  |
| TTI-AC6 | REQ | Scope | Keep normal page-level vertical scrolling; when the Trips grid headings scroll out of view, pin a duplicate header at the viewport top. Match column widths and synchronize horizontal scrolling without creating a nested vertical scroll area. |  |
| TTI-AC7 | REQ | Scope | After committing a staged Trip shift, restore the user's page scroll position and horizontal position in the Trips grid. |  |
| TTI-AC8 | AC | Acceptance criteria | Runtime CSV round-trips band labels, ranges, segment runtimes, and calculation method through the existing review-and-save workflow. |  |
| TTI-AC9 | AC | Acceptance criteria | Trips CSV round-trips schedule IDs, labels, patterns, and whole-second timepoints. Invalid IDs, patterns, timepoint sets, or times are shown before import and cannot be applied. |  |
| TTI-AC10 | AC | Acceptance criteria | Import updates do not detach Blocks. Added Trips are manual and unassigned. Omitted Trips are not removed. |  |
| TTI-AC11 | AC | Acceptance criteria | Recalculation and undo use atomic writes. Undo survives reload, is available only in its schedule context, and expires after the affected Trip records change or disappear. |  |
| TTI-AC12 | AC | Acceptance criteria | New Runtime profiles use segment-start calculation. Existing profiles with no method retain single-band behavior. |  |
| TTI-AC13 | AC | Acceptance criteria | Trips headers stay visible in a page-scrolling schedule, and committing a staged shift restores the user's prior page and horizontal grid positions. |  |
| TTI-AC14 | IMPL | Implementation notes | Dexie schema version 6 adds a dedicated operational undo store. JSON project backup schema does not change. |  |
| TTI-AC15 | IMPL | Implementation notes | Full project and scenario replacement paths invalidate undo only when one of its affected Trips changes or is removed. |  |
| TTI-AC16 | IMPL | Implementation notes | Runtime and Trip CSV imports use review flows. CSV is not a project backup format. |  |
| TTI-AC17 | IMPL | Implementation notes | The Trips grid uses page-level vertical scrolling. A fixed heading copy is displayed only while the grid intersects the viewport; its horizontal position mirrors the table. |  |
| TTI-AC18 | VER | Verification (recorded result) | pnpm typecheck passed. | Recorded result. |
| TTI-AC19 | VER | Verification (recorded result) | pnpm test passed: 29 files, 205 tests. | Sweep check: current repo has 29 unit test files and 205 vitest cases (vitest list), consistent with this record. |
| TTI-AC20 | VER | Verification (recorded result) | Trips browser checks passed, including sticky headers, undo across reload, and shift scroll restoration. One unrelated existing Blocking-workflow timeout occurred in a full serial run and passed when rerun alone. | Recorded result. |
| TTI-AC21 | VER | Verification (recorded result) | pnpm build passed. Vite reports the main JavaScript bundle exceeds its 500 kB advisory threshold. | Recorded result. |
