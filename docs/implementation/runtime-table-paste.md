# Runtime Table Paste Revision

## Status

Implemented on 2026-10-20 as a scoped revision to the Trips Runtimes editor. This workflow does not import scheduled Trips or full Excel workbooks.

## Objective

Allow users to enter several runtime bands from spreadsheet clipboard data or CSV text without editing every cell individually. Keep runtime-profile ownership, validation, persistence, and Trip recalculation behavior unchanged.

## Accepted behavior

- `Paste rows…` is available in the Runtimes Actions menu.
- The dialog accepts tab-separated spreadsheet clipboard data and comma-separated CSV, including quoted CSV fields and CRLF line endings.
- Data rows contain `From`, `To`, and one segment runtime for each segment in the selected Pattern, in displayed order.
- A header row is optional. When present, it may include a leading `Band` column and a trailing `Total` column. Imported Band labels are retained. Total is ignored and recalculated by the application.
- Headerless rows must contain only `From`, `To`, and segment runtimes.
- From and To use the existing service-time parser, including times after 24:00. Segment runtimes use the existing duration parser.
- Users choose to replace all current time bands or append the pasted rows. Replace is the initial selection.
- The dialog previews parsed times, segment runtimes, and calculated Total values. It validates the complete candidate profile before allowing Apply.
- Parse errors and validation errors prevent any draft changes. Validation findings that are not errors remain visible and follow the existing save behavior.
- Apply updates the unsaved Runtime editor draft. The existing Runtimes Save action persists the profile.
- Runtime profiles may be assigned to multiple service days. Saving changes to a shared profile affects each assignment. Existing Trips remain unchanged until users explicitly recalculate them.
- No domain schema, IndexedDB, backup, or scheduled-Trip import changes are required.

## Acceptance criteria

- Users can paste a complete row or multiple rows from a spreadsheet or CSV text.
- Input column count must match the selected Pattern's segment count and any recognized optional Band or Total columns.
- Invalid times, durations, malformed quoting, blank required cells, and profile-level errors are shown before Apply.
- Applying a valid batch changes only the editor draft; Cancel leaves it unchanged.
- Replace removes existing bands from the draft; Append preserves them and sequences new bands after them.
- Save continues to use the existing runtime-profile validation and persistence path.
- The Runtime table's calculated Total remains derived and cannot be imported as authoritative data.
