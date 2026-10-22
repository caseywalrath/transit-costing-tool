# Decision 0035: Trip Interchange, Regeneration Undo, and Display Defaults

## Context

Users need spreadsheet interchange for runtime profiles and scheduled Trips, a way to reverse an accidental runtime recalculation, and a clear default for runtime bands. Trips also needs to keep its headings visible in long schedules and preserve the user's position after a staged shift.

## Decision

1. New runtime profiles use `segmentStart`: each segment uses the band containing its start time. Existing profiles without a saved method retain `singleBand` behavior for compatibility. Runtime profile CSV includes the calculation method and band values.
2. Trips CSV exports the currently displayed schedule with stable Trip IDs, Pattern IDs, and Pattern-point IDs. Import is previewed and validated. Existing IDs update the matching Trip and retain its Block references; a blank ID adds a manually entered Trip; rows omitted from the file do not delete Trips.
3. Keep one last regeneration snapshot in local IndexedDB. It stores before and after values for recalculated Trips, survives reload, and is replaced by the next recalculation. Any change or deletion of an affected Trip invalidates it. Undo also checks that every current Trip still exactly matches the saved after-state before restoring the before-state. Undo state is operational and is excluded from JSON project backups.
4. Put **Undo last regeneration** in Trips Actions only while the snapshot applies to the visible schedule context.
5. Keep Trips on normal page-level vertical scrolling. While the Trips grid is in view and its real column headings have scrolled above the viewport, show a fixed duplicate heading row at the top of the page. Match its column widths to the source grid and synchronize horizontal scrolling. Do not create a nested vertical scroll area. After committing a staged Trip shift, restore the page scroll position and the grid's horizontal position.

## Consequences

- CSV is schedule interchange, not a complete backup. Import cannot remove Trips by omission.
- Stable IDs allow updates to preserve Block assignments. New rows have no Block assignment.
- The IndexedDB schema advances to version 6 for the undo store. JSON backup schema remains version 6 because undo is not backed up and other CSV fields are transient.
- Legacy runtime profiles keep their current calculation behavior until a user explicitly changes the method.
- The duplicate heading row is shown only while the Trips grid intersects the viewport. Its horizontal position stays synchronized with the grid so wide schedules remain aligned.
