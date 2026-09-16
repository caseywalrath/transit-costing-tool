# Phase 3R Closeout: Unified Action Layers

## Status

Phase 3R is implemented and accepted through Package 3R-C on 2026-09-16. Phase 4 remains deferred.

## Delivered behavior

- Runtimes and Trips each use one upper-right section-header action layer.
- Runtime Pattern remains a separate selector. Runtime Profile and Trip Profile menus list saved profiles first, mark the selected profile, and separate lifecycle commands.
- Runtime Add remains visible. Runtime Discard and Save appear only for a local dirty draft. Runtime Day copy remains Route-wide in Runtime Actions.
- Trips Actions retains Build, Add, Regenerate, Shift, Change Pattern, Day copy, and Delete in one ordered menu. Selection-dependent commands remain visible when unavailable.
- Shift uses a right-docked non-modal drawer. Back/Forward, Undo/Redo, Discard, and Done operate on a transient staged sequence. The application layer performs preview, stale-source validation, and one atomic final write.
- Route, Day, Direction, Trip Profile, tab, and selected-row scope changes request staged-shift discard before changing context.

## Integration findings

- React owns menu state, drawer state, and staged operation history only. Authoritative time propagation, selected-Trip validation, source signatures, and atomic persistence remain outside React.
- The Runtime and Trip sections reuse the same header-action, menu, separator, button, field, focus, and responsive primitives. No Runtime/Trip copy behavior was combined or re-scoped.
- `New profile…` is intentionally absent from the Trip Profile menu because no accepted Trip-profile creation command exists. Runtime reverse-copy remains available for compatible reverse Patterns.

## Verification

- `pnpm typecheck` passed.
- `pnpm test` passed: 19 files and 119 tests.
- `pnpm test:ui` passed: 8 browser tests.
- `pnpm build` passed. The existing Vite warning reports a JavaScript bundle above 500 kB; it does not block the build.
- Browser integration coverage verifies Runtime edit, Build Trips, keyboard Actions access, staged Shift preview, scope-change discard confirmation, Undo, Redo, Discard, Done, and reload persistence.
- Visual review passed at 1280px with the open right-docked drawer and at 680px with wrapped header actions. The 12px section buffers and 30px controls remain intact.

## Deferred work

- Phase 4 manual blocking.
- Separate decisions for top-level Scenario/Data menu consolidation.
- Separate decisions for Route-tab Node and Pattern action menus.
