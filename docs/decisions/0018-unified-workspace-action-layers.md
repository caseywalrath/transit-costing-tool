# Decision 0018: Unified Workspace Action Layers

- Status: Implemented
- Date: 2026-09-14

## Context

The Runtimes and Trips workflow sections currently divide related controls between profile rows, section-header actions, an inline Shift tool, and a More menu. This consumes vertical space and makes the action hierarchy inconsistent. Profile selection, profile lifecycle, direct editing, schedule commands, and Route-wide commands remain different concepts even when they share one visual action layer.

## Decision

1. Consolidate each section's context and commands into one action layer in the section header, aligned to the right of the section title.
2. Use a sectioned Profile menu for profile selection and profile lifecycle commands. Saved profiles appear first with the current profile checked; a separator precedes lifecycle commands.
3. Keep the Runtime Pattern selector separate from the Runtime Profile menu because Runtime profiles are Pattern-owned.
4. Keep `Add` visible in Runtimes. Show `Discard` and `Save` immediately after `Add` only while the Runtime editor has unsaved changes.
5. Place Route-wide Runtime Day copy in a Runtime `Actions` menu. Do not place it in the Pattern-owned Profile menu.
6. Place Trip schedule commands in one Trips `Actions` menu. Keep Trip-profile selection and lifecycle commands in a separate Profile menu.
7. Replace the inline Trip Shift tool with a non-modal drawer docked to the right side of the application window. The timetable remains visible and displays a transient preview.
8. Stage Shift changes while the drawer is open. `Undo` and `Redo` affect only the staged sequence, `Discard` performs no write, and `Done` commits the net shift atomically after a stale-source check.
9. Use the established workflow-section, button, field, focus, warning, confirmation, and data-grid styles. Do not introduce a second visual system.
10. Treat top-level Scenario/Data menu consolidation and Route-tab Node/Pattern action consolidation as separate follow-on decisions.

## Consequences

- Runtimes and Trips use the same header and menu grammar without pretending that their scopes are identical.
- Low-frequency commands no longer occupy permanent horizontal space.
- Profile records remain visually distinct from commands.
- The Shift drawer can show timetable effects before persistence and can reliably discard all changes made since opening.
- Staged Shift requires an application-layer preview/commit contract even though the underlying signed shift calculation already exists.
- Layout and interaction changes require updated Playwright fixtures, keyboard checks, and desktop visual verification.

## Rejected alternatives

### Runtime Day copy inside the Profile menu

Rejected because the command covers every usable Pattern on the selected Route, while the selected Runtime profile belongs to one Pattern.

### Immediate writes from the Shift drawer

Rejected because `Discard` would need compensating writes and could overwrite intervening schedule changes.

### One menu containing profile selection and every section command

Rejected because it would mix current context, profile lifecycle, editing, and destructive schedule actions without a stable hierarchy.
