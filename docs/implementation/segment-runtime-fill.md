# Package S1: Share segment runtimes between patterns of a Route

- Requested by the user on 2026-10-30. Implements the "shared corridor" review that Decision 0003 deferred, without changing how runtimes are stored.
- Model: Sonnet (main session). Class: structural (Luna). The UI part reuses the existing Runtime profile "..." menu and the existing dialog conventions; it must not introduce a new visual or interaction pattern.
- Branch: `claude/segment-based-runtimes-h47wi7`. Never push to another branch. Do not open a pull request.

## Read first

1. `AGENTS.md`, `codex.md`, `architecture_overview.md`, `docs/data-schema.md`, `docs/ui-conventions.md`.
2. Decisions 0003, 0007, 0030, 0033, 0036, 0045, 0046.
3. Code: `src/domain/runtime.ts`, `src/domain/types.ts` (`RuntimeProfile`, `RuntimeBand`, `RuntimeAssignment`, `RoutePattern`, `PatternPoint`), `src/application/routeDefinitionService.ts` (`saveRuntimeProfile`, `setRouteRuntimeCalculationMethod`, `withRouteRuntimeCalculationMethod`, `updateScenarioRecords`), `src/ui/trips/TripsWorkspace.tsx` (`runtimeProfileMenu`), `src/ui/trips/dialogs.tsx`.

## Summary of the feature

Two actions are added to the Runtime profile "..." menu:

| Action | Direction | Overwrites existing values | Purpose |
|---|---|---|---|
| **Copy segments to other patterns…** | From the open profile to matching profiles on other patterns | Yes | Make other patterns agree with this one. |
| **Fill from other patterns…** | From matching profiles on other patterns to the open profile | No; fills only cells that are `0` | Pre-fill a new or partly entered pattern. |

Both actions show a preview dialog and write nothing until the user confirms. Both write in one transaction. The last confirmed action can be undone once.

Runtime storage, the backup schema, and the Dexie schema do not change.

## Rules (record these in Decision 0049)

1. **Scope.** Matching is limited to the profiles of one Route in one Scenario. Profiles on other Routes are never read or written.
2. **Segment identity.** A segment is the ordered node pair `(points[i].nodeId, points[i+1].nodeId)` of a Pattern. Direction matters: `A→B` does not match `B→A`.
3. **Ambiguous segments.** If a node pair occurs more than once in the source Pattern or in a target Pattern (for example, on a loop), that segment is skipped for that Pattern pair and reported as `ambiguous`.
4. **Profile matching by service day.** A target profile qualifies only if it is assigned (`RuntimeAssignment`) to at least one Service day that the source profile is also assigned to. A profile with no assignments matches nothing and is reported as `unassigned`. Profiles on the same Pattern as the open profile are never targets or sources.
5. **Band matching.** A value moves only between bands with the same `startTime` and the same `endTime`. Bands that overlap but are not identical are skipped and reported as `bandMismatch`. Band labels are ignored.
6. **Zero means "not entered" for Fill only.** Runtime cells are stored as numbers and new profiles start with `0` (`createDefaultRuntimeProfile`), so there are no blank cells. "Fill from other patterns" writes only into cells whose value is `0`. "Copy segments to other patterns" overwrites any value, including `0`.
7. **Disagreeing sources (Fill only).** If two or more qualifying source profiles have different non-zero values for the same segment and band, the cell is not filled. It is reported as `conflict` with each value and its source profile and Pattern name. A source value of `0` is not a source. If every qualifying source agrees, the cell is filled.
8. **Identical values.** A cell whose target value already equals the source value is not counted as a change.
9. **Calculation method.** Every profile of a Route uses one method (Decision 0045), so values are copied unchanged. The method is never changed by these actions.
10. **Calculation revision.** Each profile that gets at least one changed cell is saved through `withRuntimeCalculationRevision`, so its revision increases by one and the Trips calculated from it are reported as having changed runtimes (Decision 0030). Saved Trip times are not rewritten. Regeneration remains a separate action (Decision 0046).
11. **No remembered choices.** Excluded profiles and skipped cells are not stored. The next run evaluates everything again.
12. **Undo.** One level, held in memory in the application service for the current browser session. It stores the full previous `RuntimeProfile` records of every profile the action changed. Undo restores them only if each stored profile's `calculationRevision` still equals the revision the action wrote; otherwise undo is refused with the message in the UI section and nothing is written. The undo is cleared when another runtime write happens, when the Route or Scenario changes, and on reload. Restoring a profile through undo increases its revision again (the normal revision rule), so the Trips stay reported as changed until regenerated.

## Work items

### 1. Decision record and documentation (do this first)

- Create `docs/decisions/0049-segment-runtime-copy-and-fill.md` containing the Context (Decision 0003 review trigger: Federal Boulevard patterns that overlap), the Rules above, the Consequences (no schema change; possible overwrite of deliberate per-pattern differences, reduced by the preview and the per-profile exclusion; undo lost on reload), and "Supersedes in part: Decision 0003 (profiles are not linked across patterns)". Add a header line to Decision 0003: "Superseded in part by: Decision 0049 (copy and fill of matching segments between patterns)".
- `architecture_overview.md`: add the two actions to the runtime section, and state that matching is derived and is not stored.
- `docs/domain-glossary.md`: add "Matching segment": the same ordered node pair on two Patterns of one Route.

### 2. Domain: `src/domain/segmentRuntimeMatching.ts` (new, pure; no React, no repository)

Types:

```ts
export type SegmentKey = string; // `${fromNodeId}>${toNodeId}`
export type SegmentSkipReason = 'ambiguous' | 'bandMismatch' | 'noMatchingSegment' | 'unassigned' | 'conflict';

export interface SegmentCellChange {
  profileId: EntityId; patternId: EntityId; bandId: EntityId; segmentIndex: number;
  previousSeconds: DurationSeconds; nextSeconds: DurationSeconds;
  sourceProfileId: EntityId;
}
export interface SegmentSkip {
  profileId: EntityId; patternId: EntityId; reason: SegmentSkipReason;
  bandId?: EntityId; segmentIndex?: number;
  /** For `conflict`: each distinct value and the profiles that hold it. */
  candidates?: { seconds: DurationSeconds; profileIds: EntityId[] }[];
}
export interface SegmentRuntimePlan {
  mode: 'copyToOthers' | 'fillFromOthers';
  sourceProfileId: EntityId; // the open profile in both modes
  changes: SegmentCellChange[];
  skips: SegmentSkip[];
  /** Profiles that would receive at least one change, with change counts, for the dialog. */
  affectedProfiles: { profileId: EntityId; patternId: EntityId; changeCount: number; overwriteCount: number; fillCount: number }[];
}
```

Functions:

- `segmentKeys(pattern: RoutePattern): SegmentKey[]`: one key per segment, in `points` order sorted by `sequence`.
- `qualifyingProfiles(open: RuntimeProfile, profiles: RuntimeProfile[], assignments: RuntimeAssignment[]): RuntimeProfile[]`: rules 1 and 4.
- `planCopyToOthers(input)` and `planFillFromOthers(input)`. `input` has `openProfile`, `patterns` (the Route's), `profiles` (the Route's), `assignments` (the Scenario's), and `excludedProfileIds` (ignored by Fill). They return a `SegmentRuntimePlan` and apply rules 2–8.
- `applySegmentRuntimePlan(profiles: RuntimeProfile[], plan: SegmentRuntimePlan): RuntimeProfile[]`: returns only the changed profiles with new `segmentRuntimeSeconds` arrays. It does not set revisions or timestamps; the application layer does that.

Ordering must be deterministic: sort `changes` and `skips` by Pattern `sequence`, then profile name, then band `startTime`, then `segmentIndex`.

Tests: `src/domain/segmentRuntimeMatching.test.ts`. Use a fixture built from the two Federal Boulevard patterns in the user's screenshots: Pattern A is FRCC→112AVE→104AVE→WSTMNST→CCR-FED→FED-32D→DEC-FED→ALAMED→EVANS; Pattern B is WSTMNST→CCR-FED→FED-32D→DEC-FED→ALAMED→EVANS→YALE→ENGLWD; both have bands 4:00–6:00, 6:00–10:00, 10:00–18:00, 18:00–22:00, 22:00–26:00. Required cases:

1. Copy from A to B changes only the five shared segments, in all five bands. The 22:00–26:00 CCR-FED→FED-32D cell goes from `:08` to `:09`. EVANS→YALE and YALE→ENGLWD are untouched.
2. Fill into a new B profile (all zeros) gives the shared segments A's values, and EVANS→YALE and YALE→ENGLWD stay `0`.
3. Fill does not overwrite a non-zero cell.
4. The reversed direction (`B→A` node order) does not match.
5. A loop Pattern with a repeated node pair reports `ambiguous` and changes nothing for that pair.
6. A band of 6:00–9:00 against 6:00–10:00 reports `bandMismatch`.
7. A profile assigned only to Saturday is not a target for a Weekday-only source; an unassigned profile is reported as `unassigned`.
8. Two Fill sources with different non-zero values give `conflict` with both candidates; with equal values the cell is filled.
9. `excludedProfileIds` removes a profile from Copy.
10. Profiles of another Route and of the same Pattern are never in the plan.
11. Equal values produce no change entry.

### 3. Application: `src/application/routeDefinitionService.ts`

Add:

- `previewSegmentRuntimeCopy(profileId: string, excludedProfileIds: string[] = []): Promise<SegmentRuntimePreview>`
- `previewSegmentRuntimeFill(profileId: string): Promise<SegmentRuntimePreview>`
- `applySegmentRuntimePlan(preview: SegmentRuntimePreview): Promise<void>`
- `getSegmentRuntimeUndo(): { routeId: string; profileCount: number } | undefined`
- `undoSegmentRuntimePlan(): Promise<void>`

`SegmentRuntimePreview` is the domain plan plus, for the dialog: Pattern names, profile names, band time ranges, segment labels (from node `code`/name, in the format the runtime table header uses), and `staleTripCountByProfileId`. Count the Trips the way `withRouteRuntimeCalculationMethod` counts them (`provenance.calculationSource?.runtimeProfileId ?? provenance.runtimeProfileId`).

Apply rules:

- Re-read stored records inside `updateScenarioRecords` and build the plan again from them (Decision 0036). If the rebuilt plan's `changes` differ from the previewed `changes`, throw `Error('Runtimes changed after the preview. Review the changes again.')` and write nothing.
- Save every changed profile in the same `updateScenarioRecords` call, using `normalizeRuntimeProfile`, `withUpdatedAt`, and `withRuntimeCalculationRevision`. Validate each profile with `validateRuntimeProfile` against its Pattern; any error aborts the whole write.
- Store the undo snapshot (rule 12) only after the write succeeds. Clear it at the start of `saveRuntimeProfile`, `setRouteRuntimeCalculationMethod`, `copyRuntimeProfile`, `reverseCopyRuntimeProfile`, `renameRuntimeProfile`, and `deleteRuntimeProfile`.
- Undo uses the same `updateScenarioRecords` path and the revision check from rule 12.

Tests: `src/application/routeDefinitionService.test.ts`, using the in-memory repository:

- Preview → apply writes the expected cells and increases each changed profile's revision by exactly one.
- An edit between preview and apply makes apply throw, and nothing is written.
- One invalid target aborts the whole apply.
- Undo restores the previous values; undo after another runtime save is unavailable; undo after an external revision change is refused.
- `staleTripCountByProfileId` matches the Trips that reference each profile.

Add the new write path to the repository contract tests only if it adds a repository method. It should not: use `updateScenarioRecords`.

### 4. UI wiring: `src/ui/trips/TripsWorkspace.tsx` and `src/ui/trips/dialogs.tsx`

Placement: add a new menu group to `runtimeProfileMenu`, directly after the group that holds New, Rename, Copy, and Reverse-copy:

```
Copy segments to other patterns…
Fill from other patterns…
Undo last segment copy            (only while an undo is available for this Route)
```

- Both actions are disabled when `!selectedProfile || tripProfileBusy`, and when the Route has only one Pattern. Wrap `onSelect` in `requestScopeChange` like the neighboring items, so unsaved runtime edits follow the existing rules.
- Each action opens a dialog built from the existing dialog component and button conventions in `dialogs.tsx`. Do not create a new dialog style.

Dialog content, in this order:

1. Title: "Copy segments to other patterns" / "Fill from other patterns".
2. One sentence:
   - Copy: "Runtimes for segments shared with other patterns will be replaced with this profile's values, for bands with the same start and end times."
   - Fill: "Runtimes of :00 in this profile will be filled from other patterns that share the segment, for bands with the same start and end times."
3. Changes table, one row per affected profile: Pattern, Profile, Cells changed, of which replaced (Copy only), Trips that will need regeneration. For Copy only, each row starts with a checkbox, checked by default. Unchecking it recomputes the preview with `excludedProfileIds`.
4. A "Show cell details" disclosure (use the existing disclosure pattern), listing each change as `Pattern · Profile · band start–end · FROM → TO · old → new`.
5. Skipped items, grouped by reason, using this wording:
   - `ambiguous`: "Segment appears more than once in a pattern"
   - `bandMismatch`: "No band with the same start and end time"
   - `noMatchingSegment`: not listed. This is the normal case for segments a pattern does not share.
   - `unassigned`: "Profile is not assigned to any service day"
   - `conflict`: "Other patterns disagree", followed by each value and its profiles.
6. If there are no changes: the text "No runtimes would change." The confirm button is disabled.
7. Buttons: "Cancel" and a primary "Replace runtimes" (Copy) or "Fill runtimes" (Fill).

After confirmation, reload the runtime table and use the existing save-status message. If apply throws, show its message in the dialog's existing error area and leave the dialog open.

Undo: the menu item runs `undoSegmentRuntimePlan`. If undo is refused, show "These runtimes were changed after the copy, so it can't be undone." in the existing error or status area.

Keyboard and accessibility: use the existing focus management in `dialogs.tsx`. Focus moves to the first checkbox (Copy) or the Cancel button (Fill). Escape cancels. Every checkbox has an accessible name of the form "Include Pattern · Profile".

### 5. Browser tests

Extend `tests/ui/runtime-grid.spec.ts`, or add `tests/ui/segment-runtime-fill.spec.ts`, using the existing fixtures:

- Copy with one target excluded changes only the included target.
- Fill on a new profile fills only the shared segments.
- Undo restores the values.
- The no-changes state disables the confirm button.
- The dialog has no horizontal page scroll at 390 px wide (the existing layout-check helper).

## Verification

Run the repository scripts: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:ui`. Inspect both dialogs visually in light and dark themes at desktop and 390 px widths. Report the results, including any failures and their output.

No migration is needed and the export schema version does not change. Confirm this with a JSON backup round-trip test run before and after the change.

## Out of scope

- Matching across Routes.
- Remembering exclusions or a per-pattern "do not link" flag.
- Indicators on individual table cells for mismatched values (this would need a UI-design package).
- Copying between bands that overlap but are not identical.
- Automatic Trip regeneration.

## Hand-off

At the end, report what was done and what was verified, and stop. Do not start another package.
