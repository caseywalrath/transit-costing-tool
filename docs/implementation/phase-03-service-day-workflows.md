# Phase 3 Implementation Plan: Service-Day Editing Workflows

## Status

Rewritten on 2026-09-14 for authoritative Trips, Trip profiles, and the accepted Phase 2R workflow. Implemented and accepted through Package 3C on 2026-09-14. See `phase-03-closeout.md`. Phase 4 is deferred to a later user-approved session.

## Objective

Add separate, controlled workflows for copying Runtime assignments and Trips between Weekday, Saturday, Sunday, and Holiday. Retain batch Trip editing without coupling Runtime and Trip copying or weakening provenance, Trip-profile ownership, and Block references.

## Accepted workflow direction

1. Runtime copying and Trip copying are separate commands. The first Phase 3 release does not provide one combined Copy Service Day command.
2. Both workflows are target-first. The selected Day is the target; the dialog asks which other Day to copy from.
3. Runtime copying applies to every usable Pattern on the selected Route. Direction is not part of its scope.
4. Runtime copying defaults to independent Runtime-profile copies. The user may explicitly choose to share the source Runtime profiles instead.
5. Trip copying applies to the selected Route and Trip profile, includes both Outbound and Inbound, and replaces the target Day's Trips in that scope.
6. Trip copying does not copy Runtime assignments, Blocks, or future Blocking scenarios.
7. Each copy command has its own impact review and transaction. Running one command never implies running the other.
8. Source-day records remain unchanged.

Decision 0017 records these rules and their consequences.

## Domain behavior

### Copy Runtime assignments

The request identifies Scenario, Route, source Day, target Day, and copy mode.

Independent mode, which is the default:

- copy the source assignment for every usable Pattern on the Route;
- create a new Runtime profile for each copied source profile with fresh profile and band identifiers;
- assign each new profile only to the target Day;
- generate a unique name based on the source profile and target Day;
- preserve band bounds and segment runtimes;
- retain the source profile's calculation revision as copied data;
- replace existing target assignments only after impact confirmation.

Shared mode:

- assign the source Day's existing Runtime profiles to the target Day;
- do not create profiles;
- state that later edits to a shared profile affect every assigned Day;
- replace existing target assignments only after impact confirmation.

Runtime copying does not alter, recalculate, or delete Trips. The preview reports target assignments replaced, profiles created or shared, source gaps, and target Trips whose recorded calculation source will differ from the new target assignment.

If a source Pattern has no Runtime assignment, the preview reports it by Pattern and the operation does not silently skip it. The command applies only when every usable Pattern is resolved or the user returns to correct the source data.

### Copy Trips

The request identifies Scenario, Route, Trip profile, source Day, and target Day. Direction is deliberately absent.

The command:

- reads source Trips for the selected Route, Trip profile, and source Day across both Directions;
- previews all target Trips that will be replaced;
- creates fresh Trip IDs and target-Day ownership;
- preserves Pattern, scheduled times, public label, creation method, manual shift, manually changed fields, and Runtime calculation provenance;
- replaces all target Trips in the same Route, Trip profile, and target Day;
- removes revenue-trip activities that reference replaced target Trips while retaining affected Block records, including empty Blocks;
- does not copy source Blocks or Block activities;
- leaves Trips for other Routes, Trip profiles, and Days unchanged.

The preview reports source and target Trip counts by Direction and Pattern, manually adjusted target Trips, stale Runtime sources, affected Blocks and activities, and missing target Runtime assignments that could prevent later recalculation. Missing target Runtime assignments do not invalidate copied authoritative times, but the warning must remain visible before confirmation.

An empty source is valid only as an explicit clear-target operation. The impact dialog must say that zero Trips will be copied and identify every target Trip and Block activity that will be removed.

### Batch Trip editing

- Signed batch shift continues to move every scheduled point on each selected Trip by the same duration and records the explicit manual shift.
- Batch Pattern change preserves each Trip's first time, requires one target Pattern in the same Direction, and recalculates through the target Day's assigned Runtime profile.
- Preview returns per-Trip eligibility and failures.
- A batch command is atomic. It does not silently skip ineligible selected Trips.
- Surviving Trip IDs remain stable so existing Block references remain valid.

## Scope

### Included

- independent or shared Runtime-assignment copy between Days for one Route;
- authoritative Trip replacement between Days for one Route and Trip profile;
- both-Direction Trip copy regardless of the current Direction view;
- target-impact previews and stale-review protection;
- atomic copy transactions and Block-activity cleanup;
- signed multi-Trip shifts;
- eligible batch Pattern changes;
- concise source/target comparison counts;
- backup, scenario duplication, CSV, capacity, UI, accessibility, and visual verification.

### Excluded

- one combined Runtime-and-Trip copy action;
- copying an entire Scenario or Trip profile through a Day-copy command;
- copying or synthesizing Blocks or Blocking scenarios;
- merging source and target Trips;
- copying only the currently viewed Direction;
- selective per-Pattern Trip copy;
- side-by-side timetable editing;
- arbitrary scheduled-point editing;
- automatic blocking or minimum-layover rules.

## Work-package sequence and model boundaries

```text
3A Structural service-day copy and batch commands — Luna
  -> structural verification gate
  -> mandatory stop before model shift
3B Service-day workflow UI/UX — Terra
  -> hands-on UI verification gate
  -> mandatory stop before model shift
3C Integration and Phase 3 acceptance — Primary agent
```

Do not delegate or start a later package automatically. Report the completed package, checks, deviations, and unresolved decisions at each gate. A model shift requires explicit user approval after the preceding gate.

## Package 3A: Structural service-day copy and batch commands

### Recommended model

Luna. This package is bounded domain, application, persistence, and deterministic test work after Decision 0017 is accepted.

### File ownership

- service-day copy and batch-edit domain modules;
- application ports and service coordination;
- repository interfaces and in-memory/Dexie transactions;
- backup, duplication, CSV, and validation changes required by the commands;
- deterministic domain, application, persistence, and capacity tests;
- schema, glossary, architecture, and decision documentation for structural changes.

Do not modify layout, styling, dialog composition, focus behavior, or planner-facing presentation beyond exposing structured result data.

### Ordered subtasks

#### 3A-1: Characterize current boundaries

- Confirm authoritative Trip, Trip-profile, Runtime-assignment, Runtime-profile, and Block ownership in tests.
- Confirm that no generation-set record participates in the new commands.
- Record whether a schema migration is required before implementing persistence changes.

#### 3A-2: Define copy requests and previews

- Add typed Runtime-copy and Trip-copy requests.
- Add structured preview results with source signatures for stale-review protection.
- Centralize source/target validation, canonical Day ordering, impact counts, and planner-message parameters outside React.

#### 3A-3: Implement Runtime-copy behavior

- Implement independent-profile copy and explicit shared-profile assignment modes.
- Generate deterministic unique profile names for independent batch copies.
- Reject unresolved source Patterns without partial copying.
- Report changed assignments and affected Trip calculation-source status without recalculating Trips.

#### 3A-4: Implement Trip-copy behavior

- Copy one Route and Trip profile across both Directions.
- Replace only the selected target-Day scope.
- Allocate new Trip IDs and preserve authoritative times and provenance.
- Calculate target Trip and Block-activity impacts, including explicit empty-source clearing.

#### 3A-5: Implement batch editing behavior

- Retain signed batch shifts as explicit overrides.
- Add all-or-nothing batch Pattern-change previews and commits.
- Preserve Trip IDs and return per-Trip eligibility findings.

#### 3A-6: Add atomic persistence

- Commit each approved Runtime copy in one transaction.
- Commit each approved Trip replacement and Block-activity cleanup in one transaction.
- Recalculate the source signature at commit time and reject stale previews.
- Prove that cancellation, validation failure, or forced persistence failure performs no writes.

#### 3A-7: Complete exchange and capacity coverage

- Verify JSON backup and restore, import-as-copy, and Scenario duplication with copied records.
- Verify CSV output reflects target-Day ownership and preserved Trip provenance.
- Exercise Runtime copies across at least 20 Patterns and Trip replacement at the 500-Trip-per-Day target.
- Update structural documentation for any actual schema or contract changes.

### Required tests

- source and target Day cannot match;
- source remains unchanged in every mode;
- independent Runtime copy creates independent IDs and assignments;
- shared Runtime copy creates no profiles and visibly shares assignments;
- unresolved source Runtime assignment prevents partial copy;
- Runtime copy never recalculates or deletes Trips;
- Trip copy includes both Directions but only the selected Route and Trip profile;
- target Trips are replaced rather than merged;
- copied Trips receive new IDs and preserve times and provenance;
- source Blocks are not copied;
- affected target Block activities are removed while Block records remain;
- empty-source clearing requires explicit reviewed impact;
- stale previews cannot commit;
- forced transaction failures leave all source and target records unchanged;
- batch shifts and Pattern changes are atomic and preserve Trip IDs;
- backup, duplication, CSV, and capacity checks pass.

### Verification gate and mandatory stop

Run focused and full Vitest suites, TypeScript typechecking, persistence rollback tests, JSON round trips, representative CSV checks, and a production build. Report the exact structural contracts available to the UI.

Stop. Recommend Terra for Package 3B. Do not modify UI files or begin Package 3B until the user approves the model shift.

## Package 3B: Service-day workflow UI/UX

### Required model

Terra. This package owns placement, interaction, concise wording, accessibility, responsive behavior, and visual verification. It consumes the approved Package 3A ports and must not implement copy, impact, or batch-calculation rules in React.

### Communication and interface restraint

Terra must be parsimonious.

- Use short labels and direct planner-facing messages.
- Avoid explanatory paragraphs, instructional cards, redundant headings, badges, and decorative callouts.
- Do not add a new container or visual system.
- Reuse the existing compact controls, workflow headers, dialogs, tables, spacing, and destructive-action patterns.
- Add helper text only when the consequence cannot be made clear through the control label or impact summary.
- Do not repeat the same source, target, scope, or warning text in multiple places.

### Ordered subtasks

#### 3B-1: Verify the accepted surfaces

- Inspect the current Service, Runtimes, and Trips layouts at supported desktop widths.
- Preserve the accepted Day and Direction behavior, Runtime editor actions, Trip-profile controls, and Trips action order unless this plan explicitly changes them.
- Add focused layout fixtures before changing placement.

#### 3B-2: Add Runtime Day copy

- Place `Copy day…` with the Runtime Pattern/Profile context controls, not with `Add | Discard | Save`.
- Treat the currently selected Day as the target and ask for one source Day.
- Offer `Independent copies` as the default and `Share profiles` as the explicit alternative.
- State the selected Route scope once.
- Present replaced assignments, created/shared profiles, unresolved Patterns, and affected Trip-source counts compactly.
- Keep the target Day selected after success and reload Runtime controls.

#### 3B-3: Add Trip Day copy

- Add `Copy trips from another day` inside one compact `More` menu in the Trips action area.
- Keep the visible Build, Add, Regenerate, Shift, and Delete order unchanged.
- Treat the selected Day as target and selected Trip profile and Route as fixed scope.
- State once that both Directions are included.
- Present replacement, manual-adjustment, stale-source, and Block-activity impacts before confirmation.
- Keep the target Day and Trip profile selected after success, clear selected rows and shift history, and reload the current Direction view.

#### 3B-4: Add batch Pattern change presentation

- Reuse current row selection.
- Show one compact target-Pattern control and a preview of eligible and ineligible selected Trips.
- Never silently omit an ineligible Trip.
- Preserve focus and selection after cancel; clear temporary selection after successful application.

#### 3B-5: Complete UI verification

- Cover keyboard operation, focus return, announced validation, destructive confirmation, and color-independent status.
- Verify empty source, empty target, populated target, shared Runtime, independent Runtime, missing Runtime assignment, both-Direction Trip copy, and Block-impact states.
- Verify compact layout without adding unnecessary text or controls.
- Update `docs/ui-conventions.md` with only reusable conventions established by the implementation.

### Verification gate and mandatory stop

Run TypeScript typechecking, relevant Vitest and Playwright tests, the production build, keyboard and accessibility review, and browser visual inspection. The user verifies Runtime copy in both modes, Trip overwrite cancellation and confirmation, both-Direction results, batch Pattern change, and reload.

Stop. Do not begin Package 3C or make structural corrections that alter accepted behavior. Report any required structural change as a separate Luna correction for user approval.

## Package 3C: Integration and Phase 3 acceptance

### Responsibility

Primary agent. Do not delegate this package automatically.

### Ordered subtasks

1. Review domain, application, persistence, and UI boundaries.
2. Confirm React contains no authoritative copy, impact, or batch-edit calculations.
3. Confirm no generation-set terminology or records participate in Phase 3.
4. Verify each copy operation is separately atomic and source-preserving.
5. Verify Trip Profile, Route, Day, Direction, Runtime-profile, and Block scopes are consistent across queries, writes, backup, duplication, and CSV.
6. Run the complete automated suite, typechecking, production build, reload, and final visual review.
7. Update architecture, schema, glossary, decisions, UI conventions, and status documents.
8. Record a Phase 3 closeout and present the revised Phase 4 plan and model recommendation.

### Acceptance criteria

- Runtime and Trip copying are independent operations.
- The selected Day is always the initial target and the source is explicit.
- Runtime copy covers every usable Pattern on the selected Route and never mutates Trips.
- Independent Runtime copy is the default; shared assignments require explicit selection.
- Trip copy covers both Directions for one Route and Trip profile.
- Target Trips are replaced only after impact review; source Trips remain unchanged.
- Copied Trips have fresh IDs, target-Day ownership, and preserved times and provenance.
- Blocks are not copied; affected target revenue-trip activities are removed without dangling references.
- Empty-source clearing is explicit and impact-reviewed.
- Batch changes are atomic and do not silently skip selected Trips.
- UI wording and controls remain compact and non-redundant.
- JSON backup/restore, Scenario duplication, CSV, tests, build, reload, accessibility, and visual review pass.

At closeout, present Phase 4 as a separate user-approved effort. Do not begin it automatically.
