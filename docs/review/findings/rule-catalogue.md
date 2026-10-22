# Rule Catalogue (Phase 1, task 1.2)

- Status: Published (first complete pass). Append-only: IDs are stable and are never renumbered. Later passes may add rows, refine wording, or change the Status column; they do not reuse or reorder IDs.
- Baseline: `baed9f1` plus review branch `claude/upbeat-ritchie-51mpy5`. Line numbers refer to that tree.
- Orchestrator: Phase 1 orchestrator. The Agent tool was not available in this session, so extraction was performed by the orchestrator directly from the source files (no Haiku delegation). Every row was read against its cited line.
- Scope: `architecture_overview.md` (OV), `docs/data-schema.md` (DS), `docs/decisions/0001`–`0035` (D), `docs/ui-conventions.md` (UI), `docs/implementation/phase-05-costing.md` (PL05), selected normative statements from `docs/domain-glossary.md` (GL). Historical generation-set rules are included only where code still executes them or where a later rule supersedes them.

## ID conventions

| Prefix | Source | Numbering |
| --- | --- | --- |
| `OV-<SEC>-NN` | `architecture_overview.md` | `<SEC>` = section abbreviation (listed at the head of the OV table); `NN` in order of appearance. |
| `DS-NN` | `docs/data-schema.md` | Order of appearance. |
| `D00XX-NN` | Decision 00XX | The decision's own item number where items are numbered. Where a decision has no numbered items, `NN` numbers its normative sentences in order of appearance, and the row says "(unnumbered)". `D00XX-Cn` marks a normative statement in the Consequences section. |
| `UI-NN` | `docs/ui-conventions.md` | Order of appearance. |
| `PL05-NN` | `docs/implementation/phase-05-costing.md` | Order of appearance. |
| `GL-NN` | `docs/domain-glossary.md` | Order of appearance (definitions with a normative consequence only). |

Status values: `active`; `superseded by <ID>`; `partly superseded by <ID>` (the row names the part); `historical` (applies only to legacy data or code that still reads it); `contradicted by <ID>` (two active sources disagree; see the Phase 1 finding named in the row).

Owning phase: the Stage 2 phase whose files implement or verify the rule (2 domain, 3 persistence, 4 application/layering, 5 UI, 6 build/perf, 1 docs/governance).

---

## 1. `architecture_overview.md` (OV)

Section abbreviations: SCOPE (Confirmed Scope Decisions, L24–50), TECH (Technology Direction, L52–81), PRIN (Architectural Principles, L83–111), LAYER (Logical Layers, L113–155), HIER (Domain Hierarchy, L157–175), ROUTE (Route and Pattern Model, L177–198), RT (Runtime Model, L200–214), TRIP (Trip Generation Model, L216–228), SD (Service-Day Model, L230–234), BLK (Blocking Model, L236–259), COST (Summary and Cost Model, L261–271), VAL (Validation, L273–277), PERS (Persistence, Backup, and Export, L279–291), UI (UI Structure, L293–301), SEP (Work Separation, L303–312), CAP (Capacity, L314–324), DEF (Deferred Decisions, L372–385).

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| OV-SCOPE-01 | architecture_overview.md:30 | Persistence is "Browser-local IndexedDB"; backend "None". | active | 3 |
| OV-SCOPE-02 | architecture_overview.md:36-37 | Time representation is "Integer seconds from service-day midnight"; "Times greater than 24:00 are supported". | active | 2 |
| OV-SCOPE-03 | architecture_overview.md:38 | Runtime selection: "Each profile selects one band for the trip or a band at each segment start. Existing continuous-blend profiles remain readable. Single-band anchored regeneration may use a uniquely nearest band within ten minutes or a band explicitly chosen in its preview". | active | 2 |
| OV-SCOPE-04 | architecture_overview.md:40-41 | "Saved trips and scheduled points" are authoritative; "generation requests are transient"; "Existing trips remain fixed until explicit recalculation". | active | 2, 4 |
| OV-SCOPE-05 | architecture_overview.md:42-43 | Trip profiles are scenario-wide; direction view uses "Application-managed Outbound and Inbound groups"; Label is separate and descriptive. | active | 2, 5 |
| OV-SCOPE-06 | architecture_overview.md:45-47 | Layover "Derived from connected trips and deadhead activities"; initial cost multiplier is "Entered USD operating cost per Revenue Hour (VRH); Platform Hours are displayed, not separately costed". | active | 2 |
| OV-SCOPE-07 | architecture_overview.md:50 | Initial export is CSV; "versioned JSON is also required for backup and restore". | active | 3 |
| OV-TECH-01 | architecture_overview.md:60 | Stack includes "a runtime schema validator for imported data and migrations". | active (see Phase 1 finding on Zod; L-08) | 3, 6 |
| OV-TECH-02 | architecture_overview.md:67 | Zod 4 "reserved for import/migration validation"; TanStack Table 8 "headless table capability"; Vite base is relative `./`. | active | 3, 6 |
| OV-TECH-03 | architecture_overview.md:79 | "React does not import Dexie, persistence serializers, or authoritative route commands." | active | 4 |
| OV-TECH-04 | architecture_overview.md:79 | "Runtime selection, trip generation, recalculation, service-day copy, and validation remain outside React." | active | 4 |
| OV-TECH-05 | architecture_overview.md:79 | Costing results "remain derived and are not stored"; `CostingApplicationService` uses "a read-only context query port". | active | 3, 4 |
| OV-TECH-06 | architecture_overview.md:81 | Current exports use JSON schema version 6 and "omit the historical generation-set collection when it is empty"; parser accepts non-empty generation sets in older files. | active | 3 |
| OV-TECH-07 | architecture_overview.md:81 | "Versions 1 through 5 remain readable"; versions 1–3 "normalized to one Default Trip profile per Scenario"; direction data optional pre-2R and "remapped during scenario/import copies". | active | 3 |
| OV-TECH-08 | architecture_overview.md:81 | "Blocking Scenario, Block, activity, Trip, Node, and Costing-assumption Scenario ownership references are remapped during import-as-copy and scenario duplication." | active (A-004 shows scenario duplication does not meet it for Node references) | 3 |
| OV-TECH-09 | architecture_overview.md:81 | "Costing calculations are not backed up because they are derived." | active | 3 |
| OV-PRIN-01 | architecture_overview.md:87 | Domain logic "must be pure TypeScript wherever practical. Domain modules must not import React, browser components, or Dexie." | active | 2, 4 |
| OV-PRIN-02 | architecture_overview.md:91 | "The application layer accesses data through repository interfaces." | active | 4 |
| OV-PRIN-03 | architecture_overview.md:95 | React components "must not contain authoritative trip-generation, time-propagation, block-validation, or costing rules." | active | 4, 5 |
| OV-PRIN-04 | architecture_overview.md:99 | "Recalculate summaries, layovers, costs, and validation findings instead of persisting duplicate totals." | active | 3 |
| OV-PRIN-05 | architecture_overview.md:103 | Recalculation and bulk replacement "must show their expected impact before execution when manual work or block references would be affected. Related writes must occur in one database transaction." | active | 3, 4 |
| OV-PRIN-06 | architecture_overview.md:105 | "All user-defined records require an explicit lifecycle rule before their editing UI is accepted. Deletion must report and safely apply its downstream effects." | active | 1, 4 |
| OV-PRIN-07 | architecture_overview.md:107 | Project deletion removes the Project and all scenario data "in one transaction; no minimum Project count is enforced"; impact counts "supplied by the application layer". | active | 3, 4 |
| OV-PRIN-08 | architecture_overview.md:107 | Route deletion removes Nodes, managed Directions, Patterns, runtime profiles and assignments, historical generation records, and trips "in one scenario transaction"; revenue-trip activities removed; "Block records remain". | active | 3 |
| OV-PRIN-09 | architecture_overview.md:107 | Route duplication copies the Route-owned graph "with remapped identifiers but does not copy Block activities; copied Trips begin unassigned." | active | 3 |
| OV-PRIN-10 | architecture_overview.md:107 | Scenario deletion removes the complete scenario-owned graph in one project transaction; "A project must retain one Scenario". | active | 3, 5 |
| OV-PRIN-11 | architecture_overview.md:111 | "Blocks belong to scenarios and service days rather than to one route." | active | 2, 3 |
| OV-HIER-01 | architecture_overview.md:175 | Day, direction, selected Blocking Scenario, and selected year "are non-authoritative workspace context". | active | 4, 5 |
| OV-HIER-02 | architecture_overview.md:175 | Trips Block pills/Actions "can assign, move, or unassign Trips only within that selected Blocking Scenario and service day". | active | 4 |
| OV-ROUTE-01 | architecture_overview.md:181 | "A route contains two managed direction groups: Outbound and Inbound"; "Every route pattern belongs to one group, and each pattern point maps to one internal column." Column IDs distinguish repeated visits. | active | 2 |
| OV-ROUTE-02 | architecture_overview.md:183 | Sequences "normalized deterministically at the domain/application boundary"; both groups provisioned at route creation; "a usable Phase 2R route is validated against its direction and column references". | active | 2 |
| OV-ROUTE-03 | architecture_overview.md:187 | "Each pattern point stores cumulative miles from the beginning of the pattern. Segment miles are calculated from adjacent cumulative values." | active | 2 |
| OV-ROUTE-04 | architecture_overview.md:198 | Reverse pattern "reverses the pattern points and recalculates cumulative miles from the original segment distances. It does not silently create a runtime profile." | active | 2 |
| OV-RT-01 | architecture_overview.md:202-204 | Runtime profile belongs to one pattern; assignment links one service day to one profile; "Profiles are not shared between patterns". | active | 2, 3 |
| OV-RT-02 | architecture_overview.md:206 | Segment durations parse "decimal minutes, standard `MM:SS`, or the displayed `:MM` / `:MM:SS` forms into integer seconds and formatted as `:MM` or `:MM:SS`". | active | 2 |
| OV-RT-03 | architecture_overview.md:206 | "Band-bound or segment-duration changes increment that revision; a profile rename does not." | partly superseded by D0032-02/D0033-03 (method change also increments) | 2 |
| OV-RT-04 | architecture_overview.md:206 | Legacy trips without source metadata: staleness "inferred by comparing saved timepoints with the current assigned profile's calculated timepoints"; "recalculating an unverified source requires confirmation". | active | 2, 4 |
| OV-RT-05 | architecture_overview.md:208 | Runtime paste/CSV "previewed and validated before they change the editor draft"; replace or append bands; save through existing workflow. | active | 3, 5 |
| OV-RT-06 | architecture_overview.md:210 | "Runtime bands are continuous half-open intervals: start time is inclusive and end time is exclusive." | active | 2 |
| OV-RT-07 | architecture_overview.md:212 | "New profiles default to band-at-segment-start calculation"; profiles "without an explicit method retain legacy single-band behavior". | active | 2, 4 |
| OV-RT-08 | architecture_overview.md:212 | Blend: "gaps use the nearest adjacent band's rate while a trip is in motion; the first and last bands extend beyond their outer bounds for trips that started within a defined band." | historical (legacy `blendSegments` only) | 2 |
| OV-RT-09 | architecture_overview.md:212 | "Changing the method increments the profile's calculation revision and marks existing trips stale until explicit regeneration." | active | 2 |
| OV-RT-10 | architecture_overview.md:212 | Band view "omits shading when those times do not match the profile". | active | 5 |
| OV-TRIP-01 | architecture_overview.md:218 | Generation request contains "a pattern, First Trip, Headway, and inclusive Last Trip"; not retained; no generation-set row created. | contradicted by D0010-02 / UI-36 (Number of Trips limit also exists); see Phase 1 finding 1-003 | 2 |
| OV-TRIP-02 | architecture_overview.md:220 | "Runtime changes do not silently alter trips"; recalculation retains "trip IDs and block references". | active | 2, 3 |
| OV-TRIP-03 | architecture_overview.md:220 | Regeneration review "defaults to each trip's first departure and permits a different saved timepoint anchor per trip"; domain "rejects missing or ambiguous solutions". | active | 2 |
| OV-TRIP-04 | architecture_overview.md:220 | Preview derives layover changes "after assigned deadhead and warns about newly overlapping departures without blocking regeneration"; application "rechecks selected and adjacent Trip data before applying". | active | 2, 4 |
| OV-TRIP-05 | architecture_overview.md:220 | "One successful recalculation can be undone"; undo "survives reload, is replaced by the next recalculation, and expires when an affected Trip changes or is removed"; "not included in project JSON backups". | active | 3 |
| OV-TRIP-06 | architecture_overview.md:220 | "Additive generation and Add Trip use atomic trip-only inserts; pattern changes and recalculation use atomic trip-change writes." | active | 3 |
| OV-TRIP-07 | architecture_overview.md:222 | Trips CSV uses "stable Trip and Pattern IDs plus Pattern-point IDs"; "Import previews validation and change counts before saving"; existing IDs update and "preserve Block references; blank IDs create manually entered Trips; omitted Trips remain unchanged." | active | 3 |
| OV-TRIP-08 | architecture_overview.md:222 | "The schedule table scrolls within a bounded viewport with sticky headers." | contradicted by D0035-05, UI-31 (page-level scroll; no nested vertical scroll); see 1-001 | 5 |
| OV-TRIP-09 | architecture_overview.md:222 | "Committing a staged Trip shift restores both page and table scroll positions." | active (wording "table scroll" refines to horizontal per D0035-05) | 5 |
| OV-TRIP-10 | architecture_overview.md:224 | Interlaced rows "ordered by the earliest shared column ... when no common column exists, the first scheduled time is used"; patterns omitting a column "display an empty marker". | active | 2, 4 |
| OV-TRIP-11 | architecture_overview.md:228 | Trip profile owns Trips, not Runtime profiles; "Copying a Trip profile duplicates its Trips with new IDs and no Blocks"; Blocking scenarios "select exactly one Trip profile". | active | 2, 3 |
| OV-SD-01 | architecture_overview.md:232 | Runtime copy and Trip copy are separate, "target-first and route-scoped"; Runtime copy "defaults to independent profiles"; Trip copy "operates within one Trip profile, includes both Directions, replaces the target Day's Trips, and does not copy Blocks". | active | 2, 4 |
| OV-SD-02 | architecture_overview.md:234 | Spans/headways derived; no duplicate span or generation-rule records retained. | active | 3 |
| OV-BLK-01 | architecture_overview.md:238 | Blocking Scenario arranges "an immutable source Trip Profile across all service days"; a Block belongs to one Blocking Scenario and one service day. | active | 2, 3 |
| OV-BLK-02 | architecture_overview.md:245 | Layover derived "after any manual deadhead"; not stored. "Empty Blocks are valid." Pull-out optional and first; pull-in optional and last; "one manual deadhead is permitted between consecutive revenue Trips". | active | 2 |
| OV-BLK-03 | architecture_overview.md:245 | New/edited pull-out and pull-in "store non-negative whole-minute offsets from the first and last revenue Trips"; resolved times and platform hours update when Trips change; legacy explicit times readable. | active | 2 |
| OV-BLK-04 | architecture_overview.md:247 | "Running Time sums scheduled revenue-Trip durations; Revenue hours add known usable layover between revenue Trips. Deadhead and boundary activities remain excluded from Revenue hours." | active | 2 |
| OV-BLK-05 | architecture_overview.md:249-253 | Reported findings: overlapping trips; negative layover; location discontinuity without deadhead; deadhead that does not fit; missing pull-out/pull-in for platform hours. | active | 2 |
| OV-BLK-06 | architecture_overview.md:255 | "Structural ownership, reference, duplicate-assignment, and malformed-time violations reject writes. Structurally valid but operationally infeasible Blocks remain saved with visible findings." | active | 2, 3 |
| OV-BLK-07 | architecture_overview.md:255 | "Selected-day subtotals include valid Blocks." | active | 2 |
| OV-BLK-08 | architecture_overview.md:257 | Blocking UI filters candidates by one Route; "Route filtering never truncates their activities". | active | 5 |
| OV-BLK-09 | architecture_overview.md:259 | Minimum-layover preference is a UI preference evaluated by the pure classifier and "does not become authoritative Block data"; deadhead hours include pull-out, pull-in, and between-Trip deadhead durations. | active | 2, 5 |
| OV-COST-01 | architecture_overview.md:265-269 | Running time; revenue hours = running + usable layover; platform hours = resolved pull-in time minus resolved pull-out time; revenue miles "when distances are complete"; annual = daily × annual service-day counts. | active | 2 |
| OV-COST-02 | architecture_overview.md:271 | One Scenario-owned Costing assumptions set; "Platform Hours are displayed but are not separately multiplied or added"; escalation "defaulting to 3%"; horizon "base year plus up to ten future years"; "Annual quantities use stored service-day counts capped at 365"; no cross-scenario comparison. | active (see PL05-07 for the exact 365 rule) | 2, 5 |
| OV-VAL-01 | architecture_overview.md:275 | "Each finding includes a rule identifier, severity, entity reference, message parameters, and optional acknowledgment information." | active | 2 |
| OV-VAL-02 | architecture_overview.md:277 | "Errors prevent an operation when the resulting data would be unusable. Warnings allow confirmation or later correction. Acknowledging a warning does not remove the underlying condition." | active | 2, 4 |
| OV-PERS-01 | architecture_overview.md:281 | "Dexie version 6 adds a local one-step Trip-regeneration undo store. Undo state is operational and excluded from project JSON backup and restore." | active | 3 |
| OV-PERS-02 | architecture_overview.md:285-289 | First usable application must include versioned migrations, versioned JSON export/import, "validation before import", CSV exports, and "visible local-save status". | active | 3, 5 |
| OV-PERS-03 | architecture_overview.md:291 | "CSV is not a complete backup format." | active | 3 |
| OV-UI-01 | architecture_overview.md:298 | Primary navigation is "Route \| Trips \| Blocking \| Costing". | active | 5 |
| OV-UI-02 | architecture_overview.md:301 | "Detailed UI decisions belong to a distinct UI/UX work package and must not be established by structural implementation." | active | 1 |
| OV-SEP-01 | architecture_overview.md:312 | "If UI work reveals a needed domain change, document it and return it to a separate structural revision rather than embedding business logic in the UI." | active | 1, 4 |
| OV-CAP-01 | architecture_overview.md:318-322 | Support "500 trips per service day; 30 pattern points per pattern; 100 blocks per service day; four service-day types; smooth local generation, recalculation, ordering, and validation at that scale." | active | 6 |
| OV-DEF-01 | architecture_overview.md:385 | Deferred items (arrival/departure pairs, shared runtimes, automatic blocking, garage matrices, cost allocation, sync, GTFS, Excel import) must be resolved "through a decision record before implementation". | active | 1 |

## 2. `docs/data-schema.md` (DS)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| DS-01 | data-schema.md:9 | "IDs are UUID strings generated by the application." | active | 3 |
| DS-02 | data-schema.md:10-11 | "Times and durations are integer seconds." "Distances are non-negative decimal miles." | active | 2 |
| DS-03 | data-schema.md:13-14 | Timestamps ISO 8601; "Ordered child records use explicit `sequence` values and stable child IDs." | active | 2, 3 |
| DS-04 | data-schema.md:17 | "Derived summaries and current validation results are not persisted as source data." | active | 3 |
| DS-05 | data-schema.md:41 | "Runtime guards must confirm that seconds are integers and that distances are finite, non-negative numbers." | active | 2, 3 |
| DS-06 | data-schema.md:64 | Project deletion "requires explicit confirmation and cascades through its scenarios"; same for scenario deletion. | active | 3, 5 |
| DS-07 | data-schema.md:79 | "The four standard service days are created for a new scenario. Annual service days must be a non-negative integer." The application "must not silently change them". | active | 2, 3 |
| DS-08 | data-schema.md:121 | "Nodes belong to a route in the initial implementation." | active | 3 |
| DS-09 | data-schema.md:169-177 | Pattern validation: at least two points; unique point IDs; contiguous sequences after normalization; existing node references; first cumulative distance zero; non-decreasing distance; repeated node IDs allowed. | active | 2 |
| DS-10 | data-schema.md:179 | Reverse pattern "creates new pattern-point IDs, and reconstructs cumulative miles from reversed segment distances." | active | 2 |
| DS-11 | data-schema.md:215 | "Each runtime band must contain exactly `pattern.points.length - 1` segment values. Runtime assignments must be unique by pattern and service day." | active | 2, 3 |
| DS-12 | data-schema.md:217 | `calculationRevision` "starts at zero for a new or copied profile and increments when runtime bands or segment values change; renaming a profile does not increment it." | active | 2 |
| DS-13 | data-schema.md:219 | Calculation method optional; "Missing values mean `singleBand` for existing backups. Changing the method increments the calculation revision." | active | 2, 3 |
| DS-14 | data-schema.md:304 | "Generation requests are not saved. `generateTrips` inserts all calculated trips in one transaction and never replaces existing trips." | active | 2, 3 |
| DS-15 | data-schema.md:304 | "Possible exact duplicates are warnings." Pattern changes and recalculation retain trip IDs; "A trip is stale when its recorded calculation source differs from the currently assigned profile or revision." | active (legacy inference added by D0030) | 2 |
| DS-16 | data-schema.md:253-262 | `GenerateTripsRequest` has `firstTrip`, `headwaySeconds`, `lastTrip` (no trip-count field). | contradicted by D0010-02 / UI-36; see 1-003 | 2 |
| DS-17 | data-schema.md:383 | Blocks "do not contain a Route ID or duplicate Trip Profile ID"; Trip Profile derived through Blocking Scenario. | active | 3 |
| DS-18 | data-schema.md:383 | Pull-out, pull-in, deadhead "use one timing mode for new and edited records: a non-negative whole-minute offset"; deadhead "must occupy a connection before a successor Trip"; legacy records may retain paired explicit times. | active | 2 |
| DS-19 | data-schema.md:383 | "Resolved activity times, layover, compatibility, summaries, validity, and completeness are derived and are not persisted." "Revenue equals Running Time plus usable Layover." | active | 2, 3 |
| DS-20 | data-schema.md:385 | "Blocking Scenario names are unique within a Scenario after trimming and case normalization. Block labels are unique within one Blocking Scenario and service day. A Trip ID may occur once across that complete Blocking Scenario/day". | active | 2, 3 |
| DS-21 | data-schema.md:389 | No Costing assumptions record until first saved; "upgrading or importing old data never invents a rate or service year". | active | 3 |
| DS-22 | data-schema.md:402-403 | `futureYearCount` "integer from 0 through 10"; `annualEscalation` "must be finite and greater than -1"; `enteredRate` absent until entered, "zero is a real entered value". | active | 2, 3 |
| DS-23 | data-schema.md:407 | Validation requires "one record at most per Scenario, USD currency, a finite nonnegative rate when entered, year values from 1 through 9999, a source year no later than the base service year, and a valid horizon and escalation." | active | 2, 3 |
| DS-24 | data-schema.md:407 | "Scenario duplication assigns a fresh assumptions ID and Scenario ID. Scenario deletion removes the record. Blocking Scenario lifecycle does not change it." | active | 3 |
| DS-25 | data-schema.md:416-424 | `ValidationFinding` has `ruleId`, `severity`, `entityType`, `entityId`, optional `field`, `messageKey`, optional `parameters`. | active | 2 |
| DS-26 | data-schema.md:431-449 | IndexedDB table and index list (projects … appMetadata). Each row is a rule: DS-26a projects; DS-26b scenarios; DS-26c serviceDays; DS-26d routes; DS-26e nodes; DS-26f patterns; DS-26g directions; DS-26h runtimeProfiles; DS-26i runtimeAssignments; DS-26j generationSets; DS-26k tripProfiles; DS-26l trips; DS-26m blockingScenarios; DS-26n blocks; DS-26o costingAssumptions; DS-26p costPlans; DS-26q appMetadata. | partly contradicted by code (Phase 1 finding 1-008) | 3 |
| DS-27 | data-schema.md:451 | "Compound uniqueness that IndexedDB cannot enforce directly must be checked in domain or repository commands." | active | 3 |
| DS-28 | data-schema.md:475 | "Do not create a generic repository abstraction that hides required transaction boundaries." | active | 3, 4 |
| DS-29 | data-schema.md:486 | Costing assumptions save "validates the record and Scenario ownership"; snapshot writes include the record "in their existing transaction". | active | 3 |
| DS-30 | data-schema.md:488 | `insertTripsAtomically`, `saveTripChangesAtomically`, `commitRuntimeCopyAtomically`, `replaceTripsForDayAtomically` "validate the complete affected graph before writing and execute one transaction"; copy previews carry source signatures recalculated "immediately before commit". | active | 3, 4 |
| DS-31 | data-schema.md:492-503 | One transaction for: scenario create with service days; scenario clone; scenario delete; route save; reviewed Node/Pattern edit; regeneration with block updates; Blocking Scenario create/duplicate; Blocking Scenario delete; assign/reassign; project import. | active | 3 |
| DS-32 | data-schema.md:507 | Version history: v2 `runtimeProfileId` index on `runtimeAssignments`; v3 `tripProfiles`; v4 `blockingScenarios` and discard of placeholder Blocks "while preserving Trips, Trip Profiles, and all other scheduling records"; v5 `costingAssumptions` left empty; `costPlans` untouched. | active; v6 missing from this paragraph (see 1-008) | 3 |
| DS-33 | data-schema.md:509-513 | Each later schema change must "increment the database version; define an explicit migration; preserve existing user data or fail without partial writes; include a migration test; update this document". | active | 3, 1 |
| DS-34 | data-schema.md:515 | "`appMetadata` should include the application data-schema version used by JSON exports." | active (implementation status: see 1-008) | 3 |
| DS-35 | data-schema.md:519-525 | Backup contains format identifier, export-schema version, export timestamp, application version when available, one complete project graph. | active | 3 |
| DS-36 | data-schema.md:527 | Export schema version 6; versions 1–5 readable; version 5 imports with no Costing assumptions; schema 6 parser "validates assumptions and their Scenario ownership before any repository write"; service-day totals above 365 "remain intact and make Costing calculations invalid until corrected". | active | 3 |
| DS-37 | data-schema.md:527 | "Empty authoritative exports omit the historical `generationSets` property"; v1–v3 normalized to one Default Trip profile per Scenario. | active | 3 |
| DS-38 | data-schema.md:529 | Costing ZIP contains `costing-assumptions.csv`, `costing-results.csv`, `costing-exclusions.csv`; "USD values use two decimals, hour quantities use four decimals, and applied USD/VRH rates use four decimals". | active | 3 |
| DS-39 | data-schema.md:531 | "Import must validate the complete payload before opening a write transaction." Collision policy explicit: replace after confirmation or import with remapped IDs. | active | 3 |
| DS-40 | data-schema.md:542 | Phase 4 Blocking CSV: Blocking Scenario, Block, block-activity, and derived block-summary files scoped to one Blocking Scenario; summary includes validity and completeness; authoritative Trip CSV "does not include generation-set columns". | active | 3 |
| DS-41 | data-schema.md:5 | "changes to relationships or ownership require an architectural review." | active | 1 |

## 3. Decisions (D)

### Decision 0001 — Local-First Storage (Accepted, 2026-09-10)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0001-01 | 0001:12 | (unnumbered) IndexedDB is the authoritative working store "through a typed persistence layer"; no backend. | active | 3 |
| D0001-02 | 0001:14 | (unnumbered) "Provide versioned JSON export and import for complete backup and restore. Provide CSV separately for tabular exchange." | active | 3 |
| D0001-C1 | 0001:22 | "Database migrations and reliable backup/restore are required before the tool is considered usable for substantive work." | active | 3 |

### Decision 0002 — Service-Day Time Model (Accepted, 2026-09-10)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0002-01 | 0002:12 | (unnumbered) "Store schedule times as non-negative integer seconds from service-day midnight. Store durations as integer seconds." Convert through shared domain utilities. | active | 2 |
| D0002-02 | 0002:17-19 | Examples: `23:45 -> 85,500`, `25:00 -> 90,000`, `27:30 -> 99,000`. | active | 2 |
| D0002-03 | 0002:22 | "Runtime bands use half-open intervals: start is inclusive and end is exclusive." | active | 2 |
| D0002-C1 | 0002:29 | "CSV export must use a 24-plus formatter rather than ordinary locale time formatting." | active | 3 |
| D0002-C2 | 0002:30 | "Parsing must reject invalid minutes and seconds while permitting extended hours." | active | 2 |

### Decision 0003 — Pattern-Specific Runtime Profiles (Accepted for initial build; review required)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0003-01 | 0003:12 | (unnumbered) A runtime profile "belongs to exactly one route pattern and contains a complete runtime for each segment". | active | 2 |
| D0003-02 | 0003:14 | (unnumbered) Several service days may share a profile for one pattern; "Profiles are not linked across patterns." | active | 2 |
| D0003-03 | 0003:16 | (unnumbered) Provide copy and reverse-copy commands creating "a new independent profile". | active | 2, 4 |
| D0003-04 | 0003:18 | (unnumbered) "The trip departure time selects one runtime band. That band applies to the full trip." | superseded by D0032 (blend), D0033-01 and D0035-01 (segmentStart default); retained only for `singleBand` profiles. Status line in 0003 does not say so (finding 1-004) | 2 |

### Decision 0004 — Trip Regeneration and Manual Changes (Superseded for Phase 2R by 0010)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0004-01 | 0004:12-16 | (unnumbered) Generation-set regeneration overwrites manual shifts and pattern changes, previews impact, runs in one transaction, reuses stable logical keys. | superseded by D0010 | — |
| D0004-C1 | 0004:34 | "Undo is not included by this decision". | superseded by D0035-03 (one-step regeneration undo) | 3 |

### Decision 0005 — Structural and UI/UX Work Separation (Accepted, 2026-09-10; model update 2026-09-22)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0005-01 | 0005:18 | "Split each implementation phase into separate structural and UI/UX work packages when both are present." | active | 1 |
| D0005-02 | 0005:20-22 | Luna for bounded structural work and precisely specified simple UI wiring; Sol for novel or complex UI/UX. | active | 1 |
| D0005-03 | 0005:23-24 | "Place a verification and user-review gate between the packages." "Do not continue or delegate automatically." | active | 1 |
| D0005-04 | 0005:32 | UI/UX work "must not duplicate scheduling or validation rules." | active | 4, 5 |
| D0005-05 | 0005:34 | "If it requires a new layout or interaction decision, return it to a Terra package." | superseded by D0005 header update (0005:8) and AGENTS.md (Sol/Luna); text not amended (finding 1-004) | 1 |

### Decision 0006 — Phase 1 Project Backup Graph (Accepted for Phase 1)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0006-01 | 0006:12-19 | (unnumbered) Version 1 backups contain project, scenarios, service days, routes, nodes, patterns with points. | historical (v1 read path) | 3 |
| D0006-02 | 0006:21 | (unnumbered) "The payload is validated completely before a repository write. Import supports explicit `replace`, `copy`, and `reject` collision modes. Copy mode remaps every entity and relationship identifier." | active | 3 |

### Decision 0007 — Runtime Persistence and Copy Rules (Accepted for Phase 2B)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0007-01 | 0007:8 | Runtime profiles and assignments are part of the snapshot and backup graph. | active | 3 |
| D0007-02 | 0007:9 | Backup v2 adds `runtimeProfiles`/`runtimeAssignments`; v1 imports with empty runtime collections. | active | 3 |
| D0007-03 | 0007:10 | Runtime tables in Dexie; `runtimeProfileId` index added in DB v2 (D0012). | active | 3 |
| D0007-04 | 0007:11 | Copy and reverse-copy "require a user-provided nonblank name". | active | 2, 4 |
| D0007-05 | 0007:12 | "Reverse-copy compatibility is based on reversed node sequence." | active | 2 |
| D0007-06 | 0007:13 | "Runtime assignment uniqueness is enforced by the pair `patternId + serviceDayId` before writes." | active | 3 |
| D0007-C1 | 0007:17-19 | Scenario duplication/import-as-copy remap profile, band, assignment, pattern, route, service-day, scenario IDs; "Runtime profile gaps remain valid saved data; a departure in a gap produces a runtime-resolution finding." | active | 2, 3 |

### Decision 0008 — Materialized Trip Override Representation (Superseded for Phase 2R by 0010)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0008-01 | 0008:8-10 | (unnumbered) Manual edits recorded in `provenance.manuallyChangedFields`; shift stored as signed net `manualTimeShiftSeconds`; shifts accumulate. | partly superseded by D0010 (generation-set linkage); the provenance fields remain in the schema (DS lines 280-282) and are still written by shift code — Phase 2 to confirm | 2 |

### Decision 0009 — Trip Persistence and Backup Schema (Superseded where generation sets are required)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0009-01 | 0009:8 | (unnumbered) Backup v3 adds `generationSets`, `trips`, `blocks`. | historical (v3 read path) | 3 |
| D0009-02 | 0009:10 | (unnumbered) v1/v2 importable; "Missing trip-generation collections are normalized to empty arrays. Import validates all cross-record references before a write begins." | active | 3 |

### Decision 0010 — Authoritative Trips and Directional Timetables (Accepted for Phase 2R)

Items are unnumbered paragraphs; numbered here in order.

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0010-01 | 0010:14 | "Trips and their scheduled points are the authoritative saved schedule records." | active | 2, 3 |
| D0010-02 | 0010:16 | Generate request contains "exactly one generation limit: an inclusive Last Trip or a Number of Trips"; additive; not persisted; "A single request is limited to 500 trips." | active (overview and data-schema omit Number of Trips; see 1-003) | 2 |
| D0010-03 | 0010:18 | Recalculation "preserves trip IDs and requires impact confirmation only when it would overwrite manual changes or affect block relationships." | active | 2, 4 |
| D0010-04 | 0010:20 | Managed Outbound/Inbound; every pattern in exactly one group; directional schedule uses an empty marker where a pattern does not serve a column. | active | 2 |
| D0010-05 | 0010:22 | One Default profile available without initial creation; "the interface must make shared use visible." | active | 2, 5 |
| D0010-06 | 0010:24 | Duration formats: decimal minutes, `MM:SS`, `:MM`, `:MM:SS`. | active | 2 |
| D0010-07 | 0010:26 | "The four standard service days always sort as Weekday, Saturday, Sunday, Holiday." | active | 2 |
| D0010-08 | 0010:28 | Phase 2 draft data compatibility not required. | historical | — |

### Decision 0011 — Managed Inbound and Outbound Direction Groups (Accepted for Phase 2R)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0011-01 | 0011:9 | (unnumbered) Exactly two managed groups; Route UI "does not expose direction creation, deletion, renaming, or timetable-column editing." | active | 2, 5 |
| D0011-02 | 0011:11 | (unnumbered) Pattern `Label` is descriptive only; "does not rename the managed group or determine schedule membership." | active | 2 |
| D0011-03 | 0011:13 | (unnumbered) Records created automatically with the route; new and duplicated patterns default to Outbound; reversed pattern goes to the opposite group. | active | 2 |
| D0011-C1 | 0011:21 | "A pattern that conflicts with established timepoint order cannot be silently placed into a timetable. The application reports the order conflict." | active | 2 |

### Decision 0012 — Runtime-Profile Assignment Index (Accepted; no date)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0012-01 | 0012:13 | Add non-unique `runtimeProfileId` index on `runtimeAssignments`. | active | 3 |
| D0012-02 | 0012:14 | Dexie schema v1 → v2. | active | 3 |
| D0012-03 | 0012:15 | Profile deletion preflight stays in the application layer and reports assignments and saved-trip references before a destructive write. | active | 4 |
| D0012-04 | 0012:16 | Dexie errors are technical; the UI "must replace them with the operation-specific fallback message and must not expose key paths, object-store names, or index terminology." | active | 3, 4, 5 |
| D0012-C1 | 0012:23 | "Future lifecycle commands must add indexes for their authoritative lookup paths during the same schema change review." | active | 3 |

### Decision 0013 — Browser Layout Regression Tests (Accepted 2026-09-13)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0013-01 | 0013:13 | (unnumbered) Use Playwright for layout regression where geometry is an acceptance criterion. | active | 5, 6 |
| D0013-02 | 0013:15-20 | (unnumbered) Fixtures isolated from IndexedDB; Pattern column ≤ selector width (+1px); selector ≤ 96px; table uses content width; selector font 0.8rem. | active | 5 |
| D0013-03 | 0013:22 | (unnumbered) Runtime fixture: From/To adjacent; spacing after To; table does not stretch. | active | 5 |
| D0013-C1 | 0013:29-30 | Dense-table UI changes "should add or update a browser layout test"; fixtures "must remain independent of a user's local IndexedDB records." | active | 5 |

### Decision 0014 — Safe Route Editing and Direction Reconciliation (Accepted 2026-09-13)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0014-01 | 0014:12 | Nodes and one Pattern edited in React drafts and saved "only through application-layer preview and commit commands". | active | 4, 5 |
| D0014-02 | 0014:13 | Reviewed route edits use a source signature; commit reloads and "rejects a stale review". | active | 4 |
| D0014-03 | 0014:14 | Columns reconciled "through stable topological ordering"; compatible columns keep IDs; repeated visits separate; orphans removed. | active | 2 |
| D0014-04 | 0014:15 | Cyclic constraint blocks save; message "names the Direction, Patterns, and timepoints. Removing service does not override the conflict." | active | 2, 5 |
| D0014-05 | 0014:16 | Point insertion zero-minute convention; existing trips get predecessor time at new point. | active | 2 |
| D0014-06 | 0014:17 | Point removal merges adjoining segments; retained trip and point IDs stable. | active | 2 |
| D0014-07 | 0014:18 | Reorder or broad replacement requires explicit reset removing only that Pattern's service and revenue-trip activities, "while retaining block records". | active | 2, 3 |
| D0014-08 | 0014:19 | "The complete scenario update is committed in one repository transaction." | active | 3 |

### Decision 0015 — Route and Scenario Deletion (Accepted 2026-09-14)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0015-01 | 0015:12 | Route deletion shows impact, then atomically removes Nodes, Directions, Patterns, profiles, assignments, historical generation records, Trips. | active | 3, 4 |
| D0015-02 | 0015:13 | Revenue-trip activities for deleted Trips removed; "Blocks remain, including empty Blocks". | active | 3 |
| D0015-03 | 0015:14 | Scenario deletion shows impact, then atomically removes Scenario, service days, Routes, route data, Trips, Blocks. | active (later decisions add Trip Profiles, Blocking Scenarios, Costing assumptions to scope; not amended here) | 3 |
| D0015-04 | 0015:15 | "A Project must retain at least one Scenario." | active | 4, 5 |
| D0015-C1 | 0015:20 | "The React interface requests impact information from the application layer; it does not calculate the deletion graph itself." | active | 4 |

### Decision 0016 — Trip Profiles and the Blocking Boundary (Accepted; implemented)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0016-01 | 0016:14 | Scenario-owned `TripProfile` spanning every Route and service day. | active | 2, 3 |
| D0016-02 | 0016:15 | "Every Scenario has at least one Trip profile. New and migrated Scenarios receive one named `Default`". | active | 3 |
| D0016-03 | 0016:16 | Every Trip belongs to exactly one Trip profile; all trip commands scoped to it. | active | 2, 4 |
| D0016-04 | 0016:17 | Runtime profiles independent of Trip profiles; each Trip retains runtime profile ID and revision. | active | 2 |
| D0016-05 | 0016:18 | Trip profile copy: new Trip IDs; preserves times, manual adjustments, provenance; "does not copy Blocks". | active | 3 |
| D0016-06 | 0016:19 | Deleting a Trip profile deletes its Trips after impact review; "The last Trip profile in a Scenario cannot be deleted." | active | 3, 4 |
| D0016-07 | 0016:20 | Block belongs to one Trip profile and references only its Trips. | superseded by D0019-09 (Block → Blocking Scenario → Trip Profile) | 3 |
| D0016-08 | 0016:21 | Blocking scenario references exactly one Trip profile. | active (implemented by D0019-01) | 2, 3 |
| D0016-09 | 0016:22 | Interlining remains possible: Trip profile scenario-wide. | active | 2 |
| D0016-C1 | 0016:30 | Safe-edit and stale-runtime impact reporting "must count affected Trips by profile". | active | 4 |

### Decision 0017 — Separate Service-Day Copy Workflows (Implemented and accepted through Phase 3)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0017-01 | 0017:12 | Separate Runtime and Trip copy commands; no combined copy. | active | 4 |
| D0017-02 | 0017:13 | Target-first; selected Day fixed target; source via `Copy day…`. | active (menu label now `Copy Trips from day…`, UI-30) | 5 |
| D0017-03 | 0017:14 | Runtime copy covers all usable Patterns on the Route, independent of Direction and Trip profile. | active | 2 |
| D0017-04 | 0017:15 | Runtime copy defaults to independent profiles; explicit sharing allowed. | active | 2 |
| D0017-05 | 0017:16 | Runtime copy replaces target assignments after review; "does not alter or recalculate existing Trips". | active | 2, 3 |
| D0017-06 | 0017:17 | Trip copy: one Route and Trip profile, both Directions, replaces target Day's Trips in that scope. | active | 2, 3 |
| D0017-07 | 0017:18 | Trip copy preserves times and provenance; new Trip IDs and target-Day ownership. | active | 2 |
| D0017-08 | 0017:19 | Trip copy does not copy assignments, Blocks, Blocking Scenarios; revenue-trip activities referencing replaced Trips "removed atomically". | active | 3 |
| D0017-09 | 0017:20 | Empty Trip source is an explicit clear-target operation with complete destructive-impact review. | active | 4, 5 |
| D0017-10 | 0017:21 | Each command has separate validation, preview, stale-review protection, transaction. | active | 4 |
| D0017-C1 | 0017:28 | Missing or different target Runtime assignments "are reported". | active | 4 |

### Decision 0018 — Unified Workspace Action Layers (Implemented, 2026-09-14)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0018-01 | 0018:12 | One action layer per section header, right of title. | active | 5 |
| D0018-02 | 0018:13 | Sectioned Profile menu; saved profiles first, current checked; separator before lifecycle commands. | active | 5 |
| D0018-03 | 0018:14 | Runtime Pattern selector separate from Runtime Profile menu. | active | 5 |
| D0018-04 | 0018:15 | `Add` visible in Runtimes; `Discard` and `Save` only while editor dirty. | partly superseded by UI-23 ("Runtime **Actions** contains **Add Time Band**") — Phase 5 to confirm which the code follows | 5 |
| D0018-05 | 0018:16 | Route-wide Runtime Day copy in Runtime `Actions`, not Profile menu. | active | 5 |
| D0018-06 | 0018:17 | Trip schedule commands in one Trips `Actions` menu; Trip-profile selection separate. | active | 5 |
| D0018-07 | 0018:18 | Shift is a non-modal right-docked drawer; timetable shows transient preview. | active | 5 |
| D0018-08 | 0018:19 | Staged Shift: Undo/Redo affect staged sequence only; `Discard` writes nothing; `Done` "commits the net shift atomically after a stale-source check". | active | 2, 4, 5 |
| D0018-09 | 0018:20 | Use established styles; "Do not introduce a second visual system." | active | 5 |
| D0018-10 | 0018:21 | Scenario/Data menus and Route-tab Node/Pattern actions are separate follow-on decisions. | partly superseded by D0028 (Project/Scenario Actions menus) | 1, 5 |

### Decision 0019 — Blocking Scenario Ownership and Lifecycle (Accepted for Phase 4 planning)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0019-01 | 0019:14 | Scenario-owned `BlockingScenario` with immutable `tripProfileId`. | active | 2, 3 |
| D0019-02 | 0019:15 | Blocking Scenario spans every service day; each Block belongs to one service day. | active | 3 |
| D0019-03 | 0019:16 | Zero or more Blocking Scenarios; none auto-provisioned. | active | 3 |
| D0019-04 | 0019:17 | Create empty or duplicate. | active | 4 |
| D0019-05 | 0019:18 | Names non-empty and unique in parent Scenario after trim and case normalization. | active | 2, 3 |
| D0019-06 | 0019:19 | Duplicate copies all Blocks and activities with new IDs, same source profile and Trip refs, "commits atomically". | active | 3 |
| D0019-07 | 0019:20 | Rename is metadata only; source Trip Profile cannot change. | active | 3, 4 |
| D0019-08 | 0019:21 | Delete removes owned Blocks "after an impact review and stale-source check"; zero remaining allowed. | active | 3, 4 |
| D0019-09 | 0019:22 | Block stores `blockingScenarioId` and `serviceDayId`; no authoritative `tripProfileId`. | active | 3 |
| D0019-10 | 0019:23 | Deleting a Trip Profile deletes its Blocking Scenarios and Blocks in the same reviewed transaction; Trip Profile copy copies none. | active | 3 |
| D0019-11 | 0019:24 | Scenario duplication "copies and remaps Blocking Scenarios, Blocks, activities, Trip references, and non-revenue Node references". | active (violated: A-004) | 3 |
| D0019-12 | 0019:25 | v4 migration discards placeholder Blocks; "reports the discarded record count in migration tests and must not remove Trips, Trip Profiles, or other scheduling records". | active (test gap: A-003) | 3 |
| D0019-13 | 0019:26 | JSON v4 backups readable; placeholder Blocks discarded on normalization. | active | 3 |
| D0019-14 | 0019:27 | Archiving deferred. | active | 1 |
| D0019-C1 | 0019:36 | "The approved placeholder-Block discard is destructive and must be documented in release and migration verification results." | active | 1, 3 |

### Decision 0020 — Manual Block Activities, Validation, and Summaries (Accepted for Phase 4 planning)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0020-01 | 0020:12 | Ordered stable-ID activities; sequences normalized after every committed edit. | active | 2, 3 |
| D0020-02 | 0020:13 | Empty Blocks valid. | active | 2 |
| D0020-03 | 0020:14 | Zero or one pull-out (first) and zero or one pull-in (last). | active | 2 |
| D0020-04 | 0020:15 | At most one manual deadhead per connection. | active | 2 |
| D0020-05 | 0020:16 | Pull-out, pull-in, deadhead store explicit start and end; end not before start. | superseded by D0022-01/02 (boundaries) and D0023-02 (deadhead) for new and edited records; historical for legacy records. 0020 status line not annotated (1-004) | 2 |
| D0020-06 | 0020:17 | Pull-out/pull-in optional miles; deadhead optional miles. | active | 2 |
| D0020-07 | 0020:18 | One occurrence of a Trip ID per Blocking Scenario and day; identical-time different IDs distinct. | active | 2, 3 |
| D0020-08 | 0020:19 | Reassignment is an atomic move; "write both or neither". | active | 3 |
| D0020-09 | 0020:20 | Structural invariants reject writes (missing records, wrong Scenario/source profile/day, duplicate assignment, malformed order, invalid times, invalid refs). | active | 2, 3 |
| D0020-10 | 0020:21 | Operationally infeasible Blocks may be saved with derived findings. | active | 2 |
| D0020-11 | 0020:22 | Trip start/end from first/last scheduled points. "Revenue hours are the sum of revenue-trip durations." | partly superseded by D0026-05/06 (Revenue hours formula); start/end rule active | 2 |
| D0020-12 | 0020:23 | Raw gap = next revenue start − previous revenue end. | active | 2 |
| D0020-13 | 0020:24 | Matching terminal Nodes and no deadhead: usable layover = raw gap. | active | 2 |
| D0020-14 | 0020:25 | Differing Nodes: incomplete without deadhead; with deadhead, layover = gap − deadhead duration. | active | 2 |
| D0020-15 | 0020:26 | Deadhead hours = pull-out + pull-in + between-Trip deadhead durations. | active | 2 |
| D0020-16 | 0020:27 | Platform hours = pull-out start through pull-in end; incomplete without both or if structurally invalid. | partly superseded by D0022-05/06 (relative resolution and incomplete conditions) | 2 |
| D0020-17 | 0020:28 | Revenue miles = sum of complete revenue Pattern distances. | active | 2 |
| D0020-18 | 0020:29 | Platform miles = revenue + pull-out + deadhead + pull-in miles; complete only when all present. | active | 2 |
| D0020-19 | 0020:30 | "No minimum-layover policy is applied in Phase 4." | partly superseded by OV-BLK-09 / UI-49 (UI preference for candidate classification only; not applied to summaries) | 2, 5 |
| D0020-20 | 0020:31 | Summaries carry validity and completeness; selected-day totals = known valid subtotal plus invalid/incomplete counts; "missing mileage remains incomplete and is never treated as zero". | partly superseded by D0026-07 (count tiles removed from UI; subtotal rule active) | 2, 5 |
| D0020-21 | 0020:32 | Compatibility is read-only, evaluates both sides; reports compatible, deadhead required, conflict, incomplete. | active | 2 |

### Decision 0021 — Initial Blocking Workspace Scope and Exports (Accepted for Phase 4 planning)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0021-01 | 0021:14 | Blocking UI uses one Route as candidate scope. | active | 5 |
| D0021-02 | 0021:15 | Data model scenario-wide, multi-route capable. | active | 3 |
| D0021-03 | 0021:16 | "A Trip from a different Route cannot be added to a non-empty Block." | active | 2, 4 |
| D0021-04 | 0021:17 | Multi-route Blocks fully visible; Route filter never hides activities. | active | 5 |
| D0021-05 | 0021:18 | Unassigned Trips and activities display Route where needed. | active | 5 |
| D0021-06 | 0021:19 | Interlining assistance deferred. | active | 1 |
| D0021-07 | 0021:20 | Trips adds Blocking Scenario selector filtered to Trip Profile; Block column reflects only that selection. | partly superseded by D0025-01 (column is now an assignment control, not read-only) | 5 |
| D0021-08 | 0021:21 | Selection non-authoritative; "resets or falls back safely when the Project, Scenario, or Trip Profile changes." | active | 4, 5 |
| D0021-09 | 0021:22 | Selector follows Phase 3R conventions; does not change Runtime or Trip command scope. | active | 5 |
| D0021-10 | 0021:23 | Phase 4 CSV scoped to a Blocking Scenario. | active | 3 |
| D0021-11 | 0021:24 | Separate Blocking Scenario, Block, activity, summary CSV files "with stable columns and explicit validity/completeness fields". | active | 3 |
| D0021-12 | 0021:25 | CSV cannot restore; JSON is backup format. | active | 3 |

### Decision 0022 — Relative Pull-Out and Pull-In Timing (Accepted 2026-09-21; supersedes 0020 items 5 and 16 for new/edited boundaries)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0022-01 | 0022:9 | Pull-out stores non-negative whole-minute `minutesBeforeFirstTrip`; ends at first revenue start. | active | 2 |
| D0022-02 | 0022:10 | Pull-in stores non-negative whole-minute `minutesAfterLastTrip`; begins at last revenue end. | active | 2 |
| D0022-03 | 0022:11 | "Deadhead activities continue to store explicit start and end service times." | superseded by D0023-02 | 2 |
| D0022-04 | 0022:12 | Legacy complete explicit times readable; "either a relative offset or complete legacy explicit times, never both." | active | 2, 3 |
| D0022-05 | 0022:13 | Resolved times, platform hours, findings derived in domain; "React only presents those results." | active | 2, 4 |
| D0022-06 | 0022:14 | Relative boundary without adjacent revenue Trip is structurally valid but operationally incomplete; out-of-range or inverted span also incomplete. | active | 2 |
| D0022-07 | 0022:15 | No DB or backup version increase; "JSON backup, restore, duplication, and CSV must preserve them." | active | 3 |
| D0022-C1 | 0022:22 | CSV activity exports include relative-offset and legacy explicit-time columns. | active | 3 |

### Decision 0023 — Relative Deadhead Connections (Accepted 2026-09-21; supersedes 0020 item 5 for new/edited deadheads)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0023-01 | 0023:9 | New/edited deadhead is a connection after one preceding and before one successor revenue Trip. | active | 2 |
| D0023-02 | 0023:10 | Stores non-negative whole-minute `minutesAfterPreviousTrip`, required Nodes, optional miles; start = preceding Trip end. | active | 2 |
| D0023-03 | 0023:11 | Remaining non-negative time is derived layover; not stored. | active | 2 |
| D0023-04 | 0023:12 | Legacy explicit deadheads readable; relative or explicit, "never both". | active | 2, 3 |
| D0023-05 | 0023:13 | Current Block Deadhead column per eligible connection; Add button; dialog may apply to every matching From/To pair; bulk delete by same pair. | active | 5 |
| D0023-06 | 0023:14 | Reordering a revenue Trip moves the directly following deadhead; deadheads not independently reordered. | active | 2 |
| D0023-07 | 0023:15 | Deleting the preceding or successor Trip removes the connection deadhead; stable timetable changes retain it. | active | 2, 3 |
| D0023-C1 | 0023:21 | No version change; CSV adds relative-duration column and retains legacy columns. | active | 3 |

### Decision 0024 — Bulk Pull-Out and Pull-In Editing (Accepted 2026-09-22)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0024-01 | 0024:8 | Boundary activities independent per Block; no shared garage table. | active | 2 |
| D0024-02 | 0024:9 | Apply to matching Blocks in current Blocking Scenario and day; pull-out matches first Trip start Node, pull-in matches last Trip end Node; all Routes in Scenario. | active | 2 |
| D0024-03 | 0024:10 | Selected Block always included when it has a revenue Trip; other Blocks only when endpoint matches. | active | 2 |
| D0024-04 | 0024:11 | Missing activities added with own IDs; existing retained unless replacement selected; replacement preserves IDs; review reports matching, added, replaced, retained, skipped counts. | active | 2, 5 |
| D0024-05 | 0024:12 | Blocks without revenue Trip skipped; source and endpoints rechecked; all affected Blocks written in one transaction. | active | 3, 4 |
| D0024-06 | 0024:13 | Resulting activities independently editable. | active | 5 |

### Decision 0025 — Trip-Table Block Assignment (Status line: "Accepted; implementation in progress")

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0025-01 | 0025:12 | Trips Block pill is an assignment control; choosing a different Block confirms before writing. | active | 5 |
| D0025-02 | 0025:13 | Actions `Assign Block…` requires selection; same Blocking Scenario and day; confirms whole operation. | active | 5 |
| D0025-03 | 0025:14 | Multi-selection across sources moved atomically; no duplicated Trip ID per Blocking Scenario and day. | active | 3, 4 |
| D0025-04 | 0025:15 | Cannot cross Trip Profile or day scope; changing the selector does not transfer Trips. | active | 4 |
| D0025-05 | 0025:16 | Chronological insertion preserved; infeasible results saved with findings. | active | 2 |
| D0025-06 | 0025:17 | One-Route limit; UI makes Blocks with unavailable references or other-Route Trips unavailable as destinations. | active | 5 |
| D0025-07 | 0025:18 | Moving a Trip removes adjacent between-Trip deadheads from source; boundaries stay; confirmation counts affected deadheads. | active | 2, 5 |
| D0025-08 | 0025:19 | Recheck source signature, ownership, day, duplicate rules before one atomic write; reject if Blocks changed. | active | 4 |
| D0025-09 | 0025:20 | Pill menus, Actions, dialogs keyboard-operable and "return focus to their invoking control". | active | 5 |
| D0025-C1 | 0025:29 | Warning icon for Trips in a connection finding; "Both Trips in an overlapping pair are marked"; accessible label states the problem. | active | 5 |

### Decision 0026 — Trips-Table Unassignment and Revenue-Hour Semantics (Accepted for implementation; supersedes 0020 Revenue-hours formula only)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0026-01 | 0026:14 | Pill offers **Unassign from Block** with confirmation. | active | 5 |
| D0026-02 | 0026:15 | Actions **Unassign from Block…** for multi-selection; already-unassigned reported. | active | 5 |
| D0026-03 | 0026:16 | One atomic write removes selected activities from all source Blocks; Blocks remain; adjacent deadheads removed; boundaries stay. | active | 2, 3 |
| D0026-04 | 0026:17 | Same stale-source and scope safeguards as assignment; duplicate or cross-day references "rejected, not silently repaired". | active | 4 |
| D0026-05 | 0026:18 | "Running Time is the sum of scheduled revenue-Trip durations and excludes layover." | active | 2 |
| D0026-06 | 0026:19 | "Revenue hours equal Running Time plus known usable layover between revenue Trips." Deadhead, pull-out, pull-in excluded. "Layover % value is Layover divided by Revenue hours." | active | 2 |
| D0026-07 | 0026:20 | Selected-day totals include only valid Blocks; incomplete valid Blocks contribute known hours; Summary omits complete/incomplete count tiles. | active | 2, 5 |
| D0026-08 | 0026:21 | Summary CSV adds `runningHours`; no schema migration. | active | 3 |

### Decision 0027 — Phase 5 Cost Basis, Assumptions, and Forecast (Accepted for implementation planning)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0027-01 | 0027:12 | Estimate = entered USD rate per VRH × eligible Revenue Hours (Decision 0026 definition). | active | 2 |
| D0027-02 | 0027:13 | Platform Hours displayed, not multiplied or added. | active | 2, 5 |
| D0027-03 | 0027:14 | Rate adjusted from source year to service year by entered escalation; "Show the applied rate." | active | 2, 5 |
| D0027-04 | 0027:15 | Platform-sensitive supplement deferred; applying the VRH rate to Platform Hours "is not allowed". | active | 2 |
| D0027-05 | 0027:16 | One Scenario-owned assumption set shared across Blocking Scenarios. | active | 3 |
| D0027-06 | 0027:17 | Escalation default 3%; horizon base year plus up to ten future years. | active | 2, 5 |
| D0027-07 | 0027:18 | Selector UI shows one Blocking Scenario; no comparison table. | active | 5 |

### Decision 0028 — Workspace Toolbars and Route Duplication (Accepted and implemented, 2026-09-23)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0028-01 | 0028:12 | Permanent Project/Scenario selector row; each has its own accessible Actions menu. | active | 5 |
| D0028-02 | 0028:13 | Project Actions: create, rename, delete, JSON backup/restore. Scenario Actions: create, rename, duplicate, delete. | active | 5 |
| D0028-03 | 0028:14 | Module toolbars: Route (+Actions); Trips Route/Day/Direction; Blocking Route/Trip Profile/Blocking Scenario/Day/Actions; Costing Blocking Scenario/derived Trip Profile/View year/Actions. | active | 5 |
| D0028-04 | 0028:15 | Route stays visible in Blocking. | active | 5 |
| D0028-05 | 0028:16 | CSV exports in owning module's Actions menu. | active | 5 |
| D0028-06 | 0028:17 | Route duplication copies Route, Nodes, Directions, Patterns, Runtime Profiles and assignments, historical generation records, Trips with fresh IDs; no Block activities; copied Trips unassigned. | active | 3 |
| D0028-C1 | 0028:21 | "Route duplication is an atomic Scenario-record write". | active | 3 |

### Decision 0029 — Project Rename and Deletion (Accepted and implemented, 2026-10-20)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0029-01 | 0029:12 | Project Actions has **Rename project** and **Delete project**. | active | 5 |
| D0029-02 | 0029:13 | Rename requires a non-empty name; changes only the Project record. | active | 2, 4 |
| D0029-03 | 0029:14 | Delete shows counts of scenarios, routes, patterns, Trips, Blocks; confirmation names related removed data. | active | 4, 5 |
| D0029-04 | 0029:15 | Deletion removes all Project-owned data "in one database transaction"; no minimum Project count. | active | 3 |
| D0029-05 | 0029:16 | No backup format change. | active | 3 |
| D0029-C1 | 0029:22 | "IndexedDB and in-memory repositories apply the same cascade behavior." | active | 3 |

### Decision 0030 — Legacy Trip Runtime Staleness (Accepted, 2026-10-20)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0030-01 | 0030:12 | Revision comparison authoritative when source profile and revision both recorded. | active | 2 |
| D0030-02 | 0030:13 | Missing/incomplete source: compare saved points with currently assigned profile's points. | active | 2 |
| D0030-03 | 0030:14 | Stale when times differ or profile cannot reproduce valid times. | active | 2 |
| D0030-04 | 0030:15 | Explicit confirmation before recalculating an unverified source. | active | 4, 5 |
| D0030-05 | 0030:16 | "Do not silently rewrite legacy Trips while loading or displaying the schedule." | active | 3, 4 |

### Decision 0031 — Trip Regeneration Anchors (Accepted, 2026-10-20; unnumbered)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0031-01 | 0031:8 | One-time anchor selection; first departure default; all-first / last timepoint / shared served timepoint; per-trip override; anchor time fixed. | active | 2, 5 |
| D0031-02 | 0031:8 | Use band applicable to resulting first departure; else "uniquely nearest band when that band is no more than ten minutes"; multiple applicable, tie, or larger gap require explicit choice. | active (single-band only per D0031-05) | 2 |
| D0031-03 | 0031:8 | Preview labels automatic vs manual band selection; application rechecks trip, pattern, runtime, assignment, block inputs before an atomic update; anchors and band choices not stored on trips. | active | 2, 4 |
| D0031-04 | 0031:10 | Unpreservable or multi-solution later anchor identified with trip, timepoint, reason; offers switch to first-departure anchoring. | active | 2, 5 |
| D0031-05 | 0031:12 | Blended profiles search valid first departures; nearest-band exception and manual override "apply only to single-band profiles". | active; silent on `segmentStart` (see 1-005) | 2 |
| D0031-06 | 0031:14 | Signed changes to first departure, last timepoint, total Run Time; change = regenerated − saved; zero shows `0:00`. | active | 2, 5 |
| D0031-07 | 0031:16 | Layover change to next Block Trip after deadhead; unavailable when deadhead needed but absent; newly negative gap is a warning; adjacent unselected Trips checked and rechecked. | active | 2, 4 |

### Decision 0032 — Blended Runtime Segments (Superseded for new profiles by 0033; retained for legacy)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0032-01 | 0032:8 | Blend: per-band rate; boundary-crossing progress; completion rounded to whole second; nearer band at gaps; edge bands extend once trip started within a band. | historical (legacy `blendSegments` profiles) | 2 |
| D0032-02 | 0032:10 | Method is authoritative and changes revision; times saved until regeneration. | active | 2 |
| D0032-03 | 0032:10 | Single-band shading uses the band containing first departure; blended contributions only when calculations reproduce saved times. | active | 5 |
| D0032-04 | 0032:8 | "Single-band remains the default for existing profiles." | active for profiles without a method; superseded for new profiles by D0035-01 | 2 |

### Decision 0033 — Segment-Start Runtime Bands and Trip Table Time Display (Accepted, 2026-10-21)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0033-01 | 0033:8 | `segmentStart`: "The trip must start within a defined band." Each segment uses the band containing its start time; gaps or beyond outer bands use nearest band; no fractional seconds. | active | 2 |
| D0033-02 | 0033:10 | Keep `blendSegments` for saved data; label as legacy continuous blend. | active | 2, 5 |
| D0033-03 | 0033:10 | Switching to `segmentStart` increments revision; requires explicit regeneration; saved times not rewritten. | active | 2 |
| D0033-04 | 0033:12 | **Round displayed times** off by default; nearest minute; "exactly 30 seconds rounded up"; affects only visible Trips-table clock values, not saved data, calculations, validation, previews, or exports. | active | 2, 5 |
| D0033-05 | 0033:12 | Default view shows seconds when nonzero; segmentStart shading one color per segment when calculations reproduce saved times. | active | 5 |

### Decision 0034 — Trip Table Headway Display (Accepted, 2026-10-21)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0034-01 | 0034:8 | **Show headways** off by default in Trips Actions Display group. | active | 5 |
| D0034-02 | 0034:8 | Per column, order serving Trips by exact saved time; show difference from preceding Trip; skipping Trips do not participate; "Ties have a zero headway and retain table order"; first Trip shows clock time with accent. | active | 2, 5 |
| D0034-03 | 0034:10 | Calculated from exact times including staged shift preview; no effect on Trips, exports, blocking, validation; rounding affects first clock time only; headways exact. | active | 5 |

### Decision 0035 — Trip Interchange, Regeneration Undo, and Display Defaults (no Status or Date line)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| D0035-01 | 0035:9 | New profiles use `segmentStart`; profiles without a saved method retain `singleBand`; Runtime profile CSV includes method and band values. | active | 2, 3 |
| D0035-02 | 0035:10 | Trips CSV exports displayed schedule with stable Trip, Pattern, Pattern-point IDs; import previewed and validated; existing IDs update and retain Block refs; blank ID adds manual Trip; omission does not delete. | active | 3 |
| D0035-03 | 0035:11 | One regeneration snapshot in local IndexedDB; before/after values; survives reload; replaced by next recalculation; invalidated by change or deletion of an affected Trip; undo checks every current Trip exactly matches the after-state; excluded from JSON backups. | active | 3 |
| D0035-04 | 0035:12 | **Undo last regeneration** in Trips Actions "only while the snapshot applies to the visible schedule context". | active | 5 |
| D0035-05 | 0035:13 | Page-level vertical scrolling; fixed duplicate heading row when headings above viewport; widths matched; horizontal sync; "Do not create a nested vertical scroll area"; after staged shift restore page scroll and grid horizontal position. | active (overview L222 contradicts; 1-001) | 5 |
| D0035-C1 | 0035:19 | "The IndexedDB schema advances to version 6 for the undo store. JSON backup schema remains version 6". | active | 3 |

## 4. `docs/ui-conventions.md` (UI)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| UI-01 | ui-conventions.md:9 | Blocking context Trip Profile, Blocking Scenario, Route, Day; Route filters candidates but never hides activities. | active | 5 |
| UI-02 | ui-conventions.md:10 | Blocking Scenario Profile relationship immutable; create/duplicate/rename/delete "must state their complete scope". | active | 5 |
| UI-03 | ui-conventions.md:11 | Trips Blocking Scenario selector filtered to Trip Profile; "read-only Block column". | partly superseded by D0025-01 (pill assigns) | 5 |
| UI-04 | ui-conventions.md:12 | Blocking uses `workflow-section`/`data-grid`; React presents service results "without calculating ownership, compatibility, findings, or summaries". | active | 4, 5 |
| UI-05 | ui-conventions.md:13 | Every Blocks table column sortable; Block activated only by clicking its name; footer subtotals Revenue, Platform, Layover, Layover %, Deadhead; incomplete status findings on hover and focus. | active | 5 |
| UI-06 | ui-conventions.md:14 | Assignment, reassignment, removal, ordering, editing keyboard operable; drag-and-drop never the only method. | active | 5 |
| UI-07 | ui-conventions.md:15 | Infeasible Blocks visible with text and accessible status; color supplemental; structural rejection identifies record and correction. | active | 5 |
| UI-08 | ui-conventions.md:16 | Selected Block shows complete ordered activity list including other Routes. | active | 5 |
| UI-09 | ui-conventions.md:17 | Selected-day summary without complete/incomplete count tiles; incomplete mileage not shown as zero. | active | 5 |
| UI-10 | ui-conventions.md:18 | Dense Blocking tables keep compact controls, horizontal overflow, stable identifying columns, predictable focus. | active | 5 |
| UI-11 | ui-conventions.md:24 | Dense tables commit text/numeric edits on blur; Enter commits; Escape restores; selects commit immediately. | active | 5 |
| UI-12 | ui-conventions.md:25 | Numeric fields retain last saved value on blank/invalid, show announced inline error, zero valid. | active | 5 |
| UI-13 | ui-conventions.md:26 | Wide tables scroll horizontally; left identifying column frozen. | active | 5 |
| UI-14 | ui-conventions.md:27 | Node and pattern-point removal uses modal confirmation. | partly superseded by UI-19 (draft deletion with Undo before Save nodes) — Phase 5 to confirm | 5 |
| UI-15 | ui-conventions.md:29 | "message keys and rule identifiers are never shown to users"; findings translated to planner text. | active | 5 |
| UI-16 | ui-conventions.md:30 | Future-phase tabs disabled with explanatory title. | historical (all four tabs implemented) | 5 |
| UI-17 | ui-conventions.md:32 | Name dialogs: required-name feedback, Enter submits, Escape cancels, screen-reader label. | active | 5 |
| UI-18 | ui-conventions.md:34 | Selected project, scenario, route stored as non-authoritative preferences; "safely falls back when a saved selection no longer exists". | active | 4, 5 |
| UI-19 | ui-conventions.md:38 | Nodes edited as local draft; **Save nodes** only write; pending deletions show **Will be deleted** and **Undo**. | active | 5 |
| UI-20 | ui-conventions.md:39 | Pattern draft; **Save Pattern**/**Discard changes** disabled when no edits; new Nodes unavailable until saved. | active | 5 |
| UI-21 | ui-conventions.md:41 | Dirty Node/Pattern draft on Route/project/scenario/tab change opens **Save route changes before leaving?** (Save/Discard/Cancel). | active | 5 |
| UI-22 | ui-conventions.md:42-44 | **Save and rebalance**; **Save and reset service** removes only that Pattern's service; empty blocks remain; order conflict beside Save Pattern, not a banner. | active | 5 |
| UI-23 | ui-conventions.md:51 | Runtime **Actions** contains **Add Time Band** and day copy; **Discard**/**Save** only when dirty; domain validator supplies findings at save. | active (see D0018-04) | 5 |
| UI-24 | ui-conventions.md:52 | Runtime time/duration fields use 24-plus `H:MM`; blank duration states runtime required and zero valid. | active | 5 |
| UI-25 | ui-conventions.md:53 | New/copied profiles named in a dialog; copied profile independent and assigned to current day; reverse-copy only for compatible reversed sequence. | active | 5 |
| UI-26 | ui-conventions.md:59-63 | Shared `workflow-section` and `data-grid` roles; no second card inside a section; new elements use these roles before a new box style. | active | 5 |
| UI-27 | ui-conventions.md:64 | One header action layer; Profile menu; Runtime Actions groups; CSV in **Actions > Data**; "Runtime profile export is unavailable while its editor has unsaved changes". | active | 5 |
| UI-28 | ui-conventions.md:65 | View menus share label style; lifecycle commands visually distinct. | active | 5 |
| UI-29 | ui-conventions.md:66 | Trips **Actions** groups Display, Schedule, copy, CSV, deletion. | active | 5 |
| UI-30 | ui-conventions.md:66 | Copy action labeled **Copy Trips from day**; selection-dependent commands visible and disabled with explanation; trash icon and bulk Delete share impact confirmation. | active | 5 |
| UI-31 | ui-conventions.md:67 | Trips page-level vertical scrolling; fixed duplicate heading row; measured widths; horizontal sync; "no nested vertical scroll area". | active | 5 |
| UI-32 | ui-conventions.md:68 | Build Trips non-modal right drawer with Pattern, First Trip, Headway, Number of Trips, Last Trip, profile context, Build, Cancel. | active | 5 |
| UI-33 | ui-conventions.md:68 | Number of Trips and Last Trip "mutually exclusive: entering either disables the other". | active | 5 |
| UI-34 | ui-conventions.md:68 | "Last Trip includes a departure that falls exactly on the headway sequence". | active | 2 |
| UI-35 | ui-conventions.md:68 | "Number of Trips is bounded to 500 per request." | active | 2, 5 |
| UI-36 | ui-conventions.md:68 | (Composite of UI-32..35, referenced by OV-TRIP-01/DS-16) Build Trips supports both limit modes. | active | 2, 5 |
| UI-37 | ui-conventions.md:69 | `Run Times Have Changed` above table; per-row `Run times changed`; **Regenerate selected** enabled only with an affected row selected. | active | 5 |
| UI-38 | ui-conventions.md:70 | Shift drawer: Back/Forward signed minute operations; Undo/Redo drawer-only; **Done** one atomic write; Discard/Close/Escape write nothing; scope changes request discard; stale preview requires discard and reopen. | active | 4, 5 |
| UI-39 | ui-conventions.md:71 | Target-first copy dialogs; preview before commit; empty-source Trip copy needs explicit clear-target acknowledgement. | active | 5 |
| UI-40 | ui-conventions.md:72 | Batch actions retain checked rows on cancel and return focus; preview names each record eligible/ineligible; confirmation unavailable if any ineligible. | active | 5 |
| UI-41 | ui-conventions.md:76-78 | Generation-set editor and generation preview dialog. | historical (Phase 2 generation-set UI; L-11 dead code) | 4, 5 |
| UI-42 | ui-conventions.md:79 | Combined schedule "reveals scheduled points through a per-trip detail row instead of creating unlimited timepoint columns". | superseded by D0010-04 (directional timetable columns); historical | 5 |
| UI-43 | ui-conventions.md:80 | Shift-click inclusive range over visible rows; header checkbox selects/clears visible rows; keyboard retains focus after reload. | active | 5 |
| UI-44 | ui-conventions.md:81 | Pattern change preview; target pattern must have a runtime profile for the day. | active | 2, 5 |
| UI-45 | ui-conventions.md:82 | Generated/Shifted/pattern-changed status markers; Block pill same-day choices and confirmed unassign. | active | 5 |
| UI-46 | ui-conventions.md:87 | Unassigned Trips and Current Block side by side; Current Block standard columns fit without horizontal scroll at desktop; summary Trips count revenue Trips only. | active | 5 |
| UI-47 | ui-conventions.md:88 | Empty Blocking Scenarios/Blocks have creation actions and empty-state text; deletions name complete scope. | active | 5 |
| UI-48 | ui-conventions.md:89 | Compatible-only filter; Assign buttons communicate compatible/deadhead-needed/conflict/incomplete. | active | 5 |
| UI-49 | ui-conventions.md:90 | Assign appends before pull-in; Minimum layover dialog is a browser UI preference that "does not modify persisted Blocks"; Current Block column order; relative whole-minute boundary editing. | active | 2, 5 |
| UI-50 | ui-conventions.md:91 | Current Block selector natural numeric/alphabetic order; standalone deadhead rows not repeated. | active | 5 |
| UI-51 | ui-conventions.md:92 | Native buttons for all operations; inclusive shift-click range selection in both tables; disabled actions visible with reason. | active | 5 |
| UI-52 | ui-conventions.md:93 | Multi-file CSV exports delivered as one ZIP; "A single export click must not initiate multiple independent downloads". | active | 3, 5 |
| UI-53 | ui-conventions.md:94 | Findings use text plus color; finding links keyboard-operable return path. | active | 5 |
| UI-54 | ui-conventions.md:95 | Trips **Scenario** selector beside **Profile**; **No Blocking Scenario** only when none exists or selected was removed; does not alter Trip editing scope. | active | 5 |
| UI-55 | ui-conventions.md:96 | **Revenue** = Running + usable Layover; **Running** retained. | active | 2, 5 |
| UI-56 | ui-conventions.md:97 | "All trip time fields, summaries, and previews use shared 24-plus service-time formatting. The schedule never converts after-midnight service to a wrapped clock time." | active | 2, 5 |

## 5. `docs/implementation/phase-05-costing.md` (PL05)

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| PL05-01 | phase-05-costing.md:9 | "Never label a partial estimate as complete." Show excluded Block and unassigned-Trip counts. | active | 2, 5 |
| PL05-02 | phase-05-costing.md:13 | Pure calculation inputs/outputs as listed; "Do not persist outputs." | active | 2, 3 |
| PL05-03 | phase-05-costing.md:15 | Block eligible only when ≥1 revenue-Trip activity, `BlockSummary.valid`, every connection `status === 'valid'`, `platformHours` and `revenueHours` finite nonnegative; platformHours from valid boundaries; missing-time or missing-deadhead connection excludes; mileage findings do not; do not use `BlockSummary.complete` or aggregate `platformHours`; empty Block neither eligible nor excluded. | active | 2 |
| PL05-04 | phase-05-costing.md:17 | Per day count nonempty ineligible Blocks and unassigned source-profile Trips as separate exclusions with reason codes; any exclusion makes the estimate partial "including when the service-day count is zero"; no eligible Block in the Blocking Scenario → no-estimate state, not $0. | active | 2 |
| PL05-05 | phase-05-costing.md:19 | `rate[y] = enteredRate × (1 + annualEscalation)^(y - rateYear)`; `costPerDay = eligibleRevenueHours × rate`; `annualCost = costPerDay × annualDayCount`; sum four days; full precision. | active | 2 |
| PL05-06 | phase-05-costing.md:19 | Export rounding: USD 2 dp, hours 4 dp, applied rate 4 dp, half away from zero; UI shows whole numbers (A-006 closed); totals computed before rounding; row-vs-total differences "must be identified in export metadata"; tie and row-total examples in 5A tests; changed inputs recalculate automatically. | active | 2, 3, 5 |
| PL05-07 | phase-05-costing.md:21 | Annual counts nonnegative integers "totaling at most 365"; below 365 valid and not scaled; zero-count days show daily quantities with zero annual cost; rate year ≤ base service year; escalation finite and > -100%. | active (overview L271 says "capped at 365"; see 1-006) | 2 |
| PL05-08 | phase-05-costing.md:25 | One Scenario-owned assumptions record; zero rate valid; absent rate = not entered; do not store totals, selected year, selected Blocking Scenario, or duplicate Trip Profile ID. | active | 3 |
| PL05-09 | phase-05-costing.md:27 | Scenario duplication copies with new ID; deletion removes; Blocking Scenario lifecycle does not affect; JSON v6 includes inputs; v1–5 import without; DB v5 store empty, lazy creation; import-as-copy remaps; restore validates ownership, ranges, currency, version; >365 totals preserved but block calculations. | active | 3 |
| PL05-10 | phase-05-costing.md:29 | Three fixed CSV files for one Blocking Scenario in one ZIP; header contents listed; exclusions file columns; rounding as PL05-06. | active | 3 |
| PL05-11 | phase-05-costing.md:33 | UI: shared toolbar; one assumptions section; main table columns Day, Days, Revenue h/day, Platform h/day, Cost/day, Annual Revenue h, Annual Platform h, Annual cost; aligned totals; outlook table of all years and rates; exclusions summary; no misleading $0; no comparison table. | active | 5 |
| PL05-12 | phase-05-costing.md:35 | No Costing scenario CRUD, Platform-Hour cost, mileage supplement, charts, NTD downloads, or allocation; accessible labels, keyboard, focus, responsive. | active | 5 |
| PL05-13 | phase-05-costing.md:46 | "No package starts automatically after its gate. If 5C exposes a new domain rule, return it to a structural change". | active | 1 |
| PL05-AC1 … PL05-AC8 | phase-05-costing.md:50-57 | Acceptance criteria 1–8, cited by number (e.g. `PL05-AC3`). | active | 2, 3, 5 |

## 6. `docs/domain-glossary.md` (GL) — normative definitions only

| ID | Source | Rule | Status | Phase |
| --- | --- | --- | --- | --- |
| GL-01 | domain-glossary.md:15 | Scenario clone is independent; "Later changes do not flow between the source and clone." | active (A-004 violates for Node refs) | 3 |
| GL-02 | domain-glossary.md:95 | Runtime band "start is inclusive and the end is exclusive. Disjoint time periods require separate bands." | active | 2 |
| GL-03 | domain-glossary.md:103 | Calculation revision "increments when those calculation inputs change and remains unchanged when only the profile name changes". | active | 2 |
| GL-04 | domain-glossary.md:107 | Generate Trips request contains "Pattern, First Trip, Headway, and Last Trip". | contradicted by D0010-02 (Number of Trips); see 1-003 | 2 |
| GL-05 | domain-glossary.md:139 | Stale runtime source is "a review condition, not an automatic schedule mutation". | active | 2 |
| GL-06 | domain-glossary.md:189 | Revenue hours = Running time + usable layover; pull-out, pull-in, deadhead excluded. | active | 2 |
| GL-07 | domain-glossary.md:197 | Platform hours "from resolved Block pull-out start to resolved Block pull-in end". | active | 2 |
| GL-08 | domain-glossary.md:201 | Platform miles incomplete when any required distance missing. | active | 2 |
| GL-09 | domain-glossary.md:227 | Revenue Hours "the only initial cost basis"; supplement must not double count. | active | 2 |
| GL-10 | domain-glossary.md:245-247 | Acknowledgment "does not remove or alter the underlying validation condition". | active | 2 |

## Change log

- Pass 1 (Phase 1, Wave 1): initial publication.
