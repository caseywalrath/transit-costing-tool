# Phase 2R Package: Trip Table Interchange and Undo

## Scope

- Import and export the selected Runtime profile as CSV, preserving the profile calculation method.
- Import and export the displayed Trips schedule as CSV using stable IDs and schedule-point times.
- Preview and validate Trip CSV changes before save. Existing Trip IDs update; blank IDs add manual Trips; omitted rows remain unchanged.
- Add one-step, persistent undo for recalculation, with stale-data checks and invalidation when an affected Trip changes or is removed.
- Default newly created Runtime profiles to **Band at segment start** while retaining legacy behavior for profiles without a saved method.
- Keep normal page-level vertical scrolling; when the Trips grid headings scroll out of view, pin a duplicate header at the viewport top. Match column widths and synchronize horizontal scrolling without creating a nested vertical scroll area.
- After committing a staged Trip shift, restore the user's page scroll position and horizontal position in the Trips grid.

## Acceptance criteria

- Runtime CSV round-trips band labels, ranges, segment runtimes, and calculation method through the existing review-and-save workflow.
- Trips CSV round-trips schedule IDs, labels, patterns, and whole-second timepoints. Invalid IDs, patterns, timepoint sets, or times are shown before import and cannot be applied.
- Import updates do not detach Blocks; added Trips are manual and unassigned; omitted Trips are not removed.
- Recalculation and undo use atomic writes. Undo survives reload, is available only in its schedule context, and expires after the affected Trip records change or disappear.
- New Runtime profiles use segment-start calculation. Existing profiles with no method retain single-band behavior.
- Trips headers stay visible in a page-scrolling schedule, and committing a staged shift restores the user's prior page and horizontal grid positions.

## Implementation notes

- Dexie schema version 6 adds a dedicated operational undo store. JSON project backup schema does not change.
- Full project and scenario replacement paths invalidate undo only when one of its affected Trips changes or is removed.
- Runtime and Trip CSV imports use review flows; CSV is not a project backup format.
- The current Trips grid uses page-level vertical scrolling. A fixed heading copy is displayed only while the grid intersects the viewport; its horizontal position mirrors the table.

## Verification

- `pnpm typecheck` passed.
- `pnpm test` passed: 29 files, 205 tests.
- Trips browser checks passed, including sticky headers, undo across reload, and shift scroll restoration. A full serial browser run had one unrelated existing Blocking-workflow timeout; that test passed when rerun alone.
- `pnpm build` passed. Vite reports the main JavaScript bundle exceeds its 500 kB advisory threshold.
