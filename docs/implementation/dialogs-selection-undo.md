# Pattern change undo, alternating selection, draggable dialogs

- Requested by the user on 2026-11-11. Rules: Decisions 0070, 0069, 0068.
- Branch: `claude/fervent-cannon-rw8mso` (restarted from `main` after PR 56 merged).
- Orchestration: the primary agent writes each brief, delegates the package to a Haiku agent, reviews the diff against this plan, and runs the gate. Each package lists its files; an agent edits no other file. If a code fact below no longer holds, the agent stops and reports.
- Order: P1, P2, P3. The packages share no source file; only `docs/ui-conventions.md` is touched by more than one (different bullets), so run them one after another, not in parallel.
- Do not start a package until the previous gate is reported to the user.
- Closeout: full browser suite after P3 (P3 also needs it because it changes a shared component).

## Code facts (verified 2026-11-11 on `main` at `6485763`)

| Fact | Location |
|---|---|
| `TripRegenerationUndo { id: 'last'; scenarioId; tripProfileId; createdAt; beforeTrips; afterTrips }` | `src/domain/types.ts:107` |
| `persistRegeneration(beforeTrips, afterTrips)` builds the snapshot and calls `saveRegeneratedTripsWithUndo`; falls back to `atomicChanges()` when the repository lacks it or the Trip has no `tripProfileId`. | `src/application/tripGenerationService.ts:218` |
| `undoLastTripRegeneration()` calls `restoreLastTripRegenerationUndo()`. | `src/application/tripGenerationService.ts:231` |
| `changeTripPattern` ends with `await this.atomicChanges()([sourced])`. | `src/application/tripGenerationService.ts:375` |
| `applyBatchPatternChange` ends with `await this.atomicChanges()(updated)`; `context.trips` holds the Trips as read. | `src/application/tripGenerationService.ts:545` |
| `saveRegeneratedTripsWithUndo` checks the before-state and writes Trips and snapshot in one transaction. | `src/persistence/dexieRepository.ts:483` |
| `restoreLastTripRegenerationUndo` throws "The regenerated Trips changed. The undo is no longer available." when stale. | `src/persistence/dexieRepository.ts:492-506` |
| Undo menu item `undo-regeneration`, label `Undo last regeneration (N trips)`. | `src/ui/trips/TripsWorkspace.tsx:717` |
| `regenerationUndoApplies` | `src/application/tripsWorkspaceView.ts:29` |
| Browser helper entry `'trips.undoRegeneration'` matches the item by the prefix "Undo last regeneration". | `tests/ui/support/ui.ts:162` |
| Selection menu first group: all, none, invert. | `src/ui/trips/ScheduleTable.tsx:122-126` |
| `TripSelectionRequest` includes `{ kind: 'all' \| 'none' \| 'invert' }`. | `src/ui/trips/ScheduleTable.tsx:19` |
| `selectTripsBy` handles requests without `mode`; it sets `selectionAnchorId.current = undefined`. | `src/ui/trips/TripsWorkspace.tsx:654` |
| `invertSelection`, `combineSelection` | `src/application/tripSelection.ts` |
| A browser test checks the first three menu labels. | `tests/ui/trip-selection-menus.spec.ts:32` |
| `ModalDialog` renders `.modal-backdrop > section[role=dialog]` with `aria-labelledby={labelledBy}`. | `src/ui/ModalDialog.tsx` |
| `.modal-backdrop` is a fixed grid with `place-items: center`. | `src/ui/styles/dialogs.css:1` |
| The cost summary dialog uses class `cost-summary-dialog` and print rules. | `src/ui/styles/costing.css:79-109` |

## P1 — Undo last pattern change (Decision 0070)

Class: structural (Luna). Delegate: Haiku.

Files: `src/domain/types.ts`, `src/application/tripGenerationService.ts`, `src/application/tripGenerationService.test.ts`, `src/persistence/dexieRepository.ts`, its existing test file for undo (find with `grep -rln restoreLastTripRegenerationUndo src`), `src/ui/trips/TripsWorkspace.tsx` (the undo item only), `tests/ui/pattern-change-undo.spec.ts` (new), `tests/ui/support/ui.ts` (only if needed), `docs/ui-conventions.md` (the Trip actions bullet, line 178), `architecture_overview.md` (the undo sentence in the trips section).

Brief:

1. `types.ts`: add `kind?: 'regeneration' | 'patternChange'` to `TripRegenerationUndo` with a comment "Absent means regeneration (Decision 0070)". Do not rename the type or the Dexie table. Do not change the Dexie version.
2. Service: change `persistRegeneration(beforeTrips, afterTrips)` to `persistWithUndo(beforeTrips, afterTrips, kind)`; existing callers pass `'regeneration'`. Put `kind` in the snapshot.
3. `changeTripPattern`: replace `this.atomicChanges()([sourced])` with `this.persistWithUndo([trip], [sourced], 'patternChange')`. `trip` is the Trip read at the top of the method.
4. `applyBatchPatternChange`: replace `this.atomicChanges()(updated)` with `this.persistWithUndo(befores, updated, 'patternChange')`, where `befores` are the Trips from `currentById` for each id in `updated`, in the same order.
5. Persistence: in `restoreLastTripRegenerationUndo`, choose the stale message by `snapshot.kind`: `patternChange` → "The changed Trips were edited again. The undo is no longer available."; otherwise the current message. The snapshot is read inside the transaction; return the kind with the stale result so the message can be chosen after the transaction.
6. UI: in the Trip actions item, label `Undo last pattern change (N trips)` when `applicableRegenerationUndo.kind === 'patternChange'`, else the current label. Keep id `undo-regeneration`, position, disabled rules, and action. The success notice (if any) names the kind the same way.
7. Unit tests (service, with the in-memory repository the existing tests use):
   - single change, then undo: `patternId`, `stopTimes`, and `provenance` equal the original;
   - batch change of two Trips, then undo restores both;
   - snapshot has `kind: 'patternChange'`;
   - a later edit of a covered Trip makes undo refuse with the pattern-change message;
   - a pattern change replaces a saved regeneration undo;
   - a snapshot with no `kind` still restores (regeneration).
8. Browser spec `pattern-change-undo.spec.ts`: change one Trip to another Pattern with **Change pattern…**; open Trip actions; click **Undo last pattern change (1 trips)**; check the Pattern chip and the first time are the original. Copy setup from `tests/ui/anchored-pattern-change.spec.ts`.
9. Docs: in `docs/ui-conventions.md:178`, after the Undo last regeneration sentence, add: "After a pattern change the same item reads **Undo last pattern change (N trips)**; one undo is kept for the last regeneration or pattern change (Decision 0070)." Update the matching sentence in `architecture_overview.md`.

Gate: `pnpm typecheck`; the service and persistence undo tests; `tests/ui/pattern-change-undo.spec.ts` and `tests/ui/unified-action-layer.spec.ts` (existing undo tests, unchanged behavior); production build; full unit suite. Persistence changes, so the existing persistence and backup tests must pass.

## P2 — Select alternating (Decision 0069)

Class: structural (Luna). Delegate: Haiku.

Files: `src/application/tripSelection.ts`, its test file (`src/application/tripSelection.test.ts`; create if absent), `src/ui/trips/ScheduleTable.tsx`, `src/ui/trips/TripsWorkspace.tsx` (`selectTripsBy` only), `tests/ui/trip-selection-menus.spec.ts`, `docs/ui-conventions.md` (line 93 bullet).

Brief:

1. Helper in `tripSelection.ts`:
   `export function alternatingFrom(allIds: readonly string[], startId: string): string[]` — returns `[]` if `startId` is not in `allIds`; otherwise `allIds[i]` for `i = start, start + 2, start + 4, …`. Doc comment: "Decision 0069".
2. `ScheduleTable.tsx`: add `'alternate'` to the `kind` union at line 19. Add after `invert`:
   `{ id: 'alternate', label: 'Select alternating', disabled: selectedIds.length !== 1 || !trips.some((trip) => trip.id === selectedIds[0]), title: <same condition> ? 'Select one trip to start from.' : undefined, onSelect: () => onSelectBy({ kind: 'alternate' }) }`.
3. `selectTripsBy`: in the no-`mode` branch, for `kind === 'alternate'`, compute from the current selection's single id: `alternatingFrom(allIds, current[0])`, and set `selectionAnchorId.current` to that id (not `undefined`). Leave the other kinds unchanged.
4. Unit tests: start at first, middle, last row; odd and even lengths; unknown id gives `[]`.
5. Browser test in `trip-selection-menus.spec.ts`: update the line-32 expectation to the first four labels (`'Select all (138)', 'Select none', 'Invert selection', 'Select alternating'`); add a test: select the second Trip's checkbox, choose **Select alternating**, check rows 2, 4, 6 … are selected and rows 1, 3 are not; check the item is disabled with zero and with two selected.
6. Docs: in `docs/ui-conventions.md:93`, change "Select all (N), Select none, Invert selection;" to "Select all (N), Select none, Invert selection, Select alternating (enabled with exactly one Trip selected; selects it and every second shown Trip below it, Decision 0069);".

Gate: typecheck; `tripSelection` unit tests; `trip-selection-menus.spec.ts`; production build; full unit suite.

## P3 — Draggable modal dialogs (Decision 0068)

Class: structural (Luna), because Decision 0068 fixes every interaction choice. Delegate: Haiku. If the agent finds a choice the decision does not cover, it stops and reports; the primary agent decides or returns it as a UI-design (Sol) package.

Files: `src/ui/ModalDialog.tsx`, `src/ui/styles/dialogs.css`, the cost summary dialog's call site (find with `grep -rn "cost-summary-dialog" src/ui --include=*.tsx`; add `draggable={false}` only), `tests/ui/draggable-dialogs.spec.ts` (new), `docs/ui-conventions.md` (the `ModalDialog` bullet, line 167).

Brief:

1. Props: add `draggable?: boolean` (default `true`).
2. State: `offset` in a ref plus a state `{ x, y }` for rendering; apply `style={{ transform: x || y ? `translate(${x}px, ${y}px)` : undefined }}` to the section.
3. Handle: in the mount effect, when `draggable` and `labelledBy`, get `document.getElementById(labelledBy)`; if it is inside the container, attach `pointerdown` to it and add class `modal-drag-handle`. Remove listeners on cleanup.
4. `pointerdown`: ignore unless `event.button === 0`, the viewport is wider than 600 px (`window.matchMedia('(max-width: 600px)').matches` is false), and `event.target` is not inside a `FOCUSABLE` element (reuse the existing `FOCUSABLE` selector with `closest`). Record the start point and the start offset; call `setPointerCapture`. Do not `preventDefault` yet.
5. `pointermove`: once the distance from the start exceeds 3 px, mark dragging (add class `modal-dragging` to the section) and set the offset to start offset plus delta, clamped (step 7).
6. `pointerup` / `pointercancel` / `lostpointercapture`: end the drag; remove `modal-dragging`.
7. Clamp: compute with the section's `getBoundingClientRect()` without the current transform (subtract the current offset) and the handle's rect: choose `x, y` so the handle's rect after translation lies within `[0, innerWidth] × [0, innerHeight]`. Apply the clamp on move, on `window` `resize`, and in a `ResizeObserver` on the section. At ≤ 600 px, set the offset to `{ 0, 0 }`.
8. Escape and Tab handling: unchanged. A drag in progress ends when the dialog unmounts.
9. CSS in `dialogs.css`:
   `.modal-drag-handle { cursor: move; touch-action: none; }`
   `.modal-dragging { user-select: none; }`
   `@media (max-width: 600px) { .modal-drag-handle { cursor: auto; } }`
10. Cost summary: pass `draggable={false}`.
11. Browser spec `draggable-dialogs.spec.ts` (viewport 1280 × 800):
    - open a dialog with a heading (for example the project name dialog); drag the heading by (200, 100) with `page.mouse`; check the dialog's box moved by about (200, 100);
    - drag far past the right and bottom edges; check the heading's box is inside the viewport;
    - press on a button in the dialog and move; check the dialog did not move;
    - after a drag, Tab stays inside and Escape closes; reopen and check it is centered;
    - at 500 px width, dragging does not move the dialog;
    - the cost summary dialog does not move.
12. Docs: append to the `ModalDialog` bullet in `docs/ui-conventions.md:167`: "The heading is a drag handle: the dialog can be moved and stays on screen, opens centered each time, and does not move at 600 px or narrower or when it passes `draggable={false}` (the cost summary) (Decision 0068)."

Gate: typecheck; `draggable-dialogs.spec.ts`; `tests/ui/keyboard.spec.ts` (focus and axe, unchanged); production build; screenshot of a dragged dialog; full unit suite; full browser suite (shared component, and plan closeout).

## Out of scope

- Remembered dialog positions, a lighter scrim, keyboard moving.
- Alternation within a Pattern or by a step other than 2.
- Multi-step undo, and undo for Shift or first-time edits.
