# Decision 0068: Draggable Modal Dialogs

- Status: Accepted, not implemented
- Date: 2026-11-11 (user request; plan: `docs/implementation/dialogs-selection-undo.md`, package P3)
- Related: `docs/ui-conventions.md` ("Every modal dialog is built by `ModalDialog`"), Decision 0025 item 9 (focus returns to the invoker)

## Context

Modal dialogs open centered over a scrim. A dialog can cover the table rows the planner needs to read while filling it in (for example, the Trips behind **Change pattern…**). Every modal dialog is built by `ModalDialog` (`src/ui/ModalDialog.tsx`), so one change reaches all of them.

## Decision

1. **Scope.** Every dialog built by `ModalDialog` can be moved by dragging, except a dialog that passes `draggable={false}`. The cost summary dialog (`cost-summary-dialog`, a full-page print sheet) passes `draggable={false}`. The anchored popovers (the plan status panel in `PlanStatusChip.tsx` and the Blocking column filter) are not modal dialogs and do not move.
2. **Handle.** The handle is the element whose id is the dialog's `labelledBy` (its heading). `ModalDialog` finds it; call sites do not change. A dialog named only by `label` has no handle and does not move.
3. **Start of a drag.** A primary-button pointer press on the handle starts a drag after the pointer moves 3 px. A press that starts on a focusable element (button, input, select, textarea, link, `[tabindex]`) does not start a drag. Pointer capture keeps the drag going when the pointer leaves the handle or the window.
4. **Position.** The offset from the centered position is applied as `transform: translate(x, y)` on the dialog section. The backdrop's centering is unchanged.
5. **Kept on screen.** The offset is limited so the handle stays fully inside the viewport. The limit is applied during the drag, when the window is resized, and when the dialog's size changes (a `ResizeObserver` on the dialog).
6. **Not remembered.** Every dialog opens centered. The offset is not stored.
7. **Narrow screens.** At a viewport width of 600 px or less, dragging is off and any offset is cleared.
8. **Keyboard and focus.** Focus trapping, Escape, and focus return are unchanged. Escape during a drag ends the drag and closes the dialog, as Escape does today. Dragging is optional; no keyboard move is added (WCAG 2.5.7 is met because no task needs dragging).
9. **Appearance.** The handle shows `cursor: move` where dragging is on. During a drag, `user-select: none` is set on the dialog. The handle has `touch-action: none`. The scrim is unchanged.
10. **Nested dialogs.** Each open dialog has its own offset. Only the innermost receives pointer input, because its backdrop covers the rest.

## Alternatives considered

- **Remember positions per dialog.** Rejected: needs storage and a reset control for little gain.
- **Remove or lighten the scrim.** Out of scope; it is a separate visual decision.
- **Keyboard move (Alt+arrows).** Not needed for conformance; can be added later.

## Consequences

- One shared component and its stylesheet change. The full browser suite runs for this package.
- No persistence, domain, or backup change.
