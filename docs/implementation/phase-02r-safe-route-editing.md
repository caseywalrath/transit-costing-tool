# Phase 2R Corrective Package: Safe Node and Pattern Editing

## Status

Implemented on 2026-09-13 and user-accepted on 2026-09-14.

Post-implementation lifecycle refinement on 2026-09-14: Route and Scenario deletion now reports downstream counts before an atomic irreversible delete. Route deletion retains Blocks but removes affected revenue-trip activities; Scenario deletion removes its complete owned graph and is blocked when it is the Project's only Scenario. See Decision 0015.

The confirmed implementation decisions are: zero minutes from a predecessor to an inserted point; contradictory Direction orders block the save; ambiguous Pattern edits require reset of that Pattern's dependent service; and a new Node must be saved before a Pattern draft can use it.

This corrective package is complete and accepted. Its later integration dependencies were closed through the accepted Trip-profile, Phase 3, and Phase 3R records.

## Required model and ownership

Terra owns the complete package: domain behavior, application ports, persistence wiring, React UI, styling, and verification. This is an explicit exception to the normal Luna/Terra work split.

Layer boundaries remain mandatory:

- React owns drafts and presentation only.
- Pure TypeScript domain functions calculate changes, rebalancing, conflicts, and impacts.
- Application services coordinate previews and commits.
- IndexedDB applies related writes atomically.

## Objective

Prevent Node and Pattern edits from silently making direction columns, runtime profiles, trips, or future block references inconsistent.

Users must be able to:

1. edit Nodes without committing each field;
2. edit one Pattern without committing each point change;
3. review downstream impacts before saving;
4. preserve service when reconciliation is deterministic;
5. explicitly reset dependent service when meaning cannot be preserved;
6. understand and correct timetable-order conflicts before saving;
7. discard drafts without changing saved data.

## Terminology

- Node: a route-wide named location reusable by Patterns.
- Pattern point: one ordered visit to a Node in one Pattern.
- Direction timetable column: one stable displayed timepoint column for Outbound or Inbound.
- Rebalance: transform runtime segments and scheduled points while preserving known totals and retained times.
- Reconcile timetable: calculate one column order satisfying all saved Patterns in a Direction.
- Reset dependent service: remove runtime profiles, assignments, trips, and linked block activities owned by one Pattern.

Do not expose IDs, mappings, graph terminology, revision numbers, or database terminology in the UI.

## Governing policy

The application must not save a knowingly inconsistent state.

- Save deterministic changes with automatic rebalancing.
- Require an explicit reset for valid changes whose downstream meaning is ambiguous.
- Block contradictory Direction orders. Deleting runtimes or trips cannot make contradictory Patterns compatible.
- Recalculate impacts at commit time so an old preview cannot overwrite newer data.
- Canceling a preview performs no writes.

## Runtime insertion convention

When B is inserted between A and C:

    Before: A --10--> C
    After:  A --0--> B --10--> C

- A-to-B begins at zero seconds in every runtime band.
- The former A-to-C runtime becomes B-to-C.
- B receives A's scheduled time on existing trips.
- C and every later scheduled time remain unchanged.

Adding a new first point gives it the former first point's time and creates a zero first segment. Adding a final point creates a zero final segment and gives it the former final time.

This convention is confirmed for implementation.

## Scope

### Included

- staged Node editing with Save Nodes and Discard Changes;
- staged Pattern editing with Save Pattern and Discard Changes;
- unsaved-navigation protection;
- Node-deletion and Pattern-change previews;
- deterministic runtime and trip rebalancing;
- Direction timetable reconciliation across all saved Patterns;
- specific conflict explanations;
- explicit destructive reset for ambiguous changes;
- atomic route, runtime, trip, and block persistence;
- domain, persistence, UI, accessibility, and browser tests;
- closeout documentation.

### Excluded

- arbitrary manual Direction-column editing;
- a Trips-page Rebuild command;
- automatic selection between contradictory Pattern orders;
- runtime interpolation or geographic allocation for new points;
- application-wide undo and redo;
- restoring a committed destructive reset;
- block recalculation beyond removing references to deleted trips;
- interlining.

## Draft behavior

### Nodes

- The Nodes table edits a local draft collection.
- Text, type, additions, and pending deletions remain unsaved until Save Nodes.
- New Nodes receive IDs in the draft but are not persisted immediately.
- Pending deletions remain visible as Will be deleted and provide Undo.
- Pattern selectors use saved Nodes. A new Node must be saved before use in a Pattern.
- Save Nodes is enabled only for a changed, valid draft.
- Discard Changes restores the saved collection.

### Patterns

- Name, Direction, Label, points, Node choices, order, and miles edit one local draft.
- Add Pattern creates an unsaved draft and does not create columns, runtimes, or trips.
- Duplicate and Duplicate Reverse also create unsaved drafts.
- Only one Pattern draft is active.
- Save Pattern is enabled only for a changed, basically valid draft.
- Discard restores the saved Pattern or removes an unsaved new Pattern.

## Navigation with unsaved work

Changing Pattern, route, scenario, project, or primary tab while a draft is dirty opens Save, Discard, and Cancel choices.

- Save uses the normal preview and impact flow.
- Discard completes navigation without writing.
- Cancel returns focus to the editor.
- Browser reload or close uses a final before-unload safeguard.
- If Nodes and Pattern are both dirty, resolve the Pattern draft first.

## Change classification

The domain layer compares saved and proposed records. React must not infer these classes.

### Node changes

| Change | Result |
| --- | --- |
| Rename, short name, type, notes | Save metadata; headers reload automatically. |
| Add Node | Save with no downstream effect until used by a Pattern. |
| Delete unused Node | Delete after a no-impact confirmation. |
| Delete used Node | Preview affected Pattern occurrences, profiles, trips, and blocks; apply point-removal rules atomically after confirmation. |

Deleting a route Node removes every occurrence from every affected Pattern. Removing a Node from one Pattern remains a separate Pattern-point action.

### Pattern changes

| Change | Classification | Runtime and trip result |
| --- | --- | --- |
| Name or Label | Metadata-only | No downstream change |
| Cumulative miles only | Distance-only | Times unchanged |
| Add point without reordering retained points | Deterministic | Insert zero runtime and one scheduled point |
| Remove point without reordering retained points | Deterministic | Merge runtimes and remove one scheduled point |
| Change a point's Node without reordering | Deterministic if timetable reconciliation succeeds | Preserve segment values and scheduled time |
| Change Direction | Deterministic if target reconciliation succeeds | Preserve profiles and trips; move table context |
| Reorder retained points | Ambiguous | Reset service required |
| Broad point replacement without retained anchors | Ambiguous | Reset service required |
| Contradict another Pattern's Direction order | Invalid | Block save; no override |

## Runtime rebalancing

Apply transformations to every band in every profile owned by the Pattern.

### Insert

- Insert zero before the new point.
- Move the former predecessor-to-successor duration after the new point.
- Preserve all other segment durations.

### Remove

- For a middle removal, sum both adjoining durations into the new direct segment.
- For a first or final removal, remove the boundary segment.
- Preserve all other durations.

### Multiple edits

- Compare stable Pattern-point IDs, not array positions alone.
- Preserve total runtime between every pair of retained anchor points.
- If retained anchor order changes, require reset rather than guessing.
- Increment each changed profile revision once per save.

## Trip reconciliation

For every existing trip using the Pattern:

- insert a new scheduled point at its predecessor's time;
- use the former first time when inserting a new first point;
- remove deleted scheduled points;
- retain all surviving Pattern-point IDs and scheduled times;
- preserve trip ID, creation method, manual shift, and manually changed fields;
- update the recorded source revision when its profile was rebalanced;
- do not create a Run Times Have Changed state solely from completed deterministic reconciliation.

Trips already using a different or missing runtime source retain their existing changed-runtime status.

## Direction timetable reconciliation

Use every proposed saved Pattern in the Direction, including the draft being previewed.

### Algorithm

1. Preserve point-to-column mappings whose Node still matches.
2. Treat each adjacent Pattern-point pair as a before/after constraint.
3. Give repeated visits to one Node distinct columns.
4. Allocate a new column for an added occurrence unless one unambiguous unused same-Node column satisfies every constraint.
5. Perform a stable topological sort, using existing column order as the tie-breaker.
6. If acyclic, assign contiguous sequences and remap affected points.
7. Remove columns no saved Pattern uses.
8. If cyclic, return a conflict and perform no writes.

The conflict result must name:

- the Direction;
- all directly conflicting Patterns;
- the smallest identifiable timepoint pair with reversed order;
- whether choosing the opposite Direction would resolve it, when determinable without a write.

Example:

> Southbound 1 places Alameda before Evans, while Southbound 2 places Evans before Alameda. Change one Pattern's Node order or Direction before saving.

After a successful save, reload the authoritative aggregate. The Trips table immediately uses the reconciled columns. No Rebuild action is required.

## Impact preview

### Pattern preview result

The application result includes:

- classification;
- added, removed, moved, and Node-changed points;
- affected timetable columns;
- profile and runtime-band counts;
- trip counts by service day;
- affected block IDs and labels;
- whether rebalance is available;
- whether reset is required;
- conflict details;
- records proposed for update or deletion.

UI behavior:

- Deterministic: Save Pattern dialog with Save and rebalance.
- Ambiguous but valid: Reset service for this Pattern? with destructive Save and reset service.
- Direction conflict: local blocked-save message; no destructive override.
- Metadata-only or distance-only: save directly when no future block or costing impact exists.

### Node preview

Metadata and additions may save directly. Any pending deletion opens one combined preview listing deleted Nodes, Pattern occurrences, profiles, trips, block references, and Patterns that would fall below two points.

- Use Delete Nodes and update service when every impact is deterministic.
- Use Delete Nodes and reset affected service when any affected Pattern requires reset.

## Reset behavior

Reset only the affected Pattern's dependent service.

Delete:

- runtime profiles owned by the Pattern;
- assignments referencing those profiles;
- trips using the Pattern;
- revenue-trip block activities referencing those trips;
- historical generation records for the Pattern while retained.

Retain:

- the valid saved Pattern and reconciled mappings;
- unaffected Patterns and service;
- block records after affected activities are removed, including empty blocks;
- Nodes not explicitly deleted.

The structural save and reset occur in one transaction.

## Application contracts

Exact names may vary, but the application layer must expose equivalent preview and commit operations:

    previewNodeChanges(aggregate, proposedNodes): NodeChangePreview
    commitNodeChanges(previewToken, mode): RouteEditCommitResult
    previewPatternChange(aggregate, savedPatternId, proposedPattern): PatternChangePreview
    commitPatternChange(previewToken, mode): RouteEditCommitResult

Commit modes are rebalance or reset.

The preview token represents the source record versions. Commit reloads authoritative records and rejects a mismatch with:

> Route or service data changed after this review. Review the impacts again.

React must not send an authoritative deletion list back to the commit command.

## Persistence

Add one atomic repository operation capable of writing:

- route aggregate, Nodes, Patterns, Directions, and columns;
- runtime profiles and assignments;
- trips;
- blocks;
- historical generation records while retained.

Every write succeeds or none does.

No schema change is expected. If an index or entity is required, stop, document a migration, add migration tests, and update the data schema before proceeding.

## UI requirements

### Nodes section

- Add Save Nodes and Discard Changes beneath the table.
- Keep New Node in the table-action area.
- Disable Save until the draft is changed and valid.
- Mark new and pending-deletion rows with text or an icon plus color.
- Replace immediate deletion with pending deletion and Undo.
- Reload the authoritative aggregate after save.

### Patterns section

- Add Save Pattern and Discard Changes in the Pattern action area.
- Keep Duplicate, Duplicate Reverse, Delete, and Add Node visually secondary.
- Mark an unsaved new Pattern in the Pattern list.
- Show an unsaved indicator beside the selected Pattern.
- Do not update Runtimes or Trips while the Pattern is a draft.
- Put specific timetable conflicts beside Save Pattern.
- Preserve the draft after failed preview or canceled dialog.
- Reload Route and Trips after save and repair invalid selections.

### Feedback and accessibility

- Use local validation for incomplete drafts.
- Use modals only for rebalance, reset, discard, or cancel decisions.
- Do not use a global banner for an ordinary order conflict.
- Focus the first unresolved field after blocked save.
- Do not communicate draft, deletion, warning, or conflict by color alone.

## Terra implementation sequence

Terra owns one package but must work in this order:

1. Characterize existing Node, Pattern, direction, runtime, trip, and block behavior with tests.
2. Add stable-ID diffs, classifiers, runtime transforms, trip transforms, and direction reconciliation as pure domain functions.
3. Add application previews, stale-preview protection, rebalance commits, reset commits, and planner-facing errors.
4. Add and failure-test the atomic repository transaction.
5. Convert Nodes and Pattern editors to drafts and wire all save, discard, impact, reset, and navigation interactions.
6. Remove active immediate Node/Pattern writes and the generic timetable-order error path.
7. Update architecture, schema, glossary, UI conventions, decision records, and Phase 2R status.

## Required domain tests

- Metadata edits do not affect runtimes or trips.
- Added unused Nodes have no downstream effect.
- Deleting used Nodes reports every Pattern occurrence.
- Middle, first, and final insertion use the defined zero convention in every band.
- Middle removal sums adjoining runtimes in every band.
- Boundary removal removes the correct segment.
- Multiple edits preserve runtime between retained anchors.
- Retained point IDs, trip IDs, and retained scheduled times remain stable.
- Added points receive new IDs and predecessor times.
- Manual shifts and changed fields survive reconciliation.
- Profile revision increments once.
- Compatible full and short Patterns produce one stable order.
- Prefixes and suffixes insert correctly.
- Loop visits receive distinct columns.
- Stable ordering preserves previous order when constraints do not decide.
- Orphan columns are removed.
- Contradictions return named conflict details and no commit.
- Compatible Direction changes preserve service.
- Reordering retained points requires reset.
- Reset impact includes profiles, assignments, trips, historical records, and block references.
- A stale preview cannot commit.

## Required persistence tests

- Deterministic Pattern save round trip.
- Node cascade round trip.
- Pattern reset round trip.
- Block cleanup retains block records.
- Forced failure leaves every record group unchanged.
- Backup/restore and scenario duplication preserve reconciled mappings.
- No migration occurs unless explicitly documented.

## Required UI tests

- Node and Pattern edits do not persist before Save.
- Both Discard actions restore saved data.
- Pending Node deletion can be undone.
- Add Pattern remains unsaved until Save Pattern.
- Dirty navigation offers Save, Discard, and Cancel.
- Deterministic and destructive dialogs use the correct actions.
- A Direction conflict names Patterns and timepoints, remains local, and blocks save.
- Canceling preserves the draft.
- Successful save updates Trips headers without Rebuild.
- Reconciled trips remain under the correct columns.
- Keyboard-only editing and dialog operation work.
- Focus returns appropriately.
- No state is color-only.
- Dense Route layout remains usable at supported desktop widths.

## Performance targets

- Preview 20 Patterns, 100 columns, 20 profiles, and 2,000 trips within one second on a typical desktop.
- Commit 2,000 reconciled trips atomically.
- Do not regress the current 500-trip display requirement.

## Acceptance walkthrough

1. Save route Nodes.
2. Create an Outbound Pattern and verify Trips does not change before Save Pattern.
3. Save and see correct columns.
4. Save a compatible short-turn Pattern into the same table.
5. Attempt a contradictory Pattern and receive a specific blocked-save explanation.
6. Correct and save it.
7. Add a point to a Pattern with several bands and trips.
8. Save and rebalance; verify zero insertion and unchanged later trip times.
9. Remove it; verify merged runtimes and retained trip times.
10. Reorder points; inspect reset impact and cancel without writes.
11. Repeat and reset; verify only that Pattern's dependent service is removed.
12. Rename a Node and verify headers change only after Save Nodes.
13. Delete a used Node and inspect the complete impact.
14. Reload and verify consistency across Route, Runtimes, Trips, and blocks.

## Verification gate

Before closeout:

- run all Vitest and Playwright tests;
- run focused persistence and migration tests;
- run TypeScript typechecking and production build;
- inspect all draft, dialog, conflict, and corrected timetable states visually;
- confirm React contains no reconciliation calculations;
- inspect IndexedDB after deterministic and destructive cases;
- verify backup/restore and scenario duplication.

Hands-on user verification was accepted on 2026-09-14. Proceed only through the separately approved Package 2R-E or Phase 3 planning gate.

## Confirmed implementation decisions

1. New point runtime: predecessor-to-new is zero; new-to-successor retains the former runtime.
2. Contradictory Direction order blocks Save Pattern and has no destructive override.
3. Ambiguous but valid Pattern changes require resetting service owned by that Pattern.
4. New Nodes must be saved before a Pattern draft can use them.
