# Decision 0092: Timepoint Stop Names

- Status: Accepted (user approval 2026-11-23); not yet implemented. Plan: `docs/implementation/timepoint-stop-names.md`.
- Date: 2026-11-23 (user design discussion)
- Related: Decision 0080 (timepoint stop IDs per pattern), Decision 0085 (timepoint locations; its "Alternatives considered" deferred timepoint stop names), Decision 0084 (stop schedule export), Decision 0089 (GTFS import), Decision 0090 (GTFS export)

## Context

A timepoint's stop ID and location are stored per pattern point (Decisions 0080 and 0085). This lets one Node be a different physical stop in each direction or pattern. The stop name is still taken from the Node, so every stop-level output names the stop after the Node.

The user wants to give a timepoint a stop name of its own (for example, the Node "Downtown TC" is "Union Station Gate B" southbound and "Union Station Gate D" northbound). The Node name stays the scheduling label.

## Decision

1. **Storage.** `RouteStopSet.timepointStopNamesByPatternId?: Record<patternId, Record<patternPointId, string>>`. Each value is trimmed and non-blank. A pattern with no names has no entry. The field is optional, so sets written before this decision have no names.
2. **Rules shared with timepoint stop IDs.** Set lifetime, pruning, pattern-edit reconciliation, Route and Scenario copy, and remapping follow Decision 0080 items 2 and 3 exactly. A name stays only while its point remains on the pattern and stands on the same Node. A stop set is kept when it has stops, timepoint stop IDs, timepoint locations, or timepoint stop names.
3. **No uniqueness rule.** Names may repeat, and a name may equal its Node's name. A name equal to the Node name is stored as entered.
4. **Displayed name.** A timepoint's displayed stop name is its stored stop name, otherwise its Node's name. One domain helper, `timepointStopName`, gives it.
5. **Where the Node name stays.** The Trips table, timetable headers, runtimes, blocking, costing, and the Fill and Copy preview's "Timepoint" column show the Node name.
6. **Where the stop name is used.** The displayed stop name is used in:
   - the stop rows that `stopTimeRows` returns: the Stop trips drawer, "Export trips with stops CSV", and the stop schedule export;
   - the GTFS export `stop_name` of a timepoint (this amends Decision 0090 item 8);
   - the name matching of "Import stop locations…" in the Stops drawer (Decision 0085 item 7).
7. **Stop schedule export.** A merged row takes the name of the first pattern that has the row, as it already takes its other details (Decision 0084). No warning.
8. **GTFS export warning.** When records merged under one `stop_id` have different stop names, the export gives the warning `gtfsExport.stopNameDiffers`, once per stop ID. The stop keeps the first record's name. This is a warning, not a refusal.
9. **GTFS import.** Every imported timepoint stores the feed's `stop_name` (trimmed) as its stop name when that name is not blank (this amends Decision 0089 item 27). A later rename of the Node does not change the exported stop name.
10. **Editing.** The Stops drawer's timepoint rows get a stop name field. Its placeholder is the Node name. The value saves with the drawer's other edits, in the same write. `RouteStopsEdit.timepointStopNames` is optional: when absent, the stored names are kept (as `timepointLocations` is in Decision 0085), so callers that do not edit names cannot erase them.
11. **Copy and fill.** "Fill from other patterns" and "Copy to other patterns" carry timepoint stop names with the rules of Decision 0080 item 6: matched by Node, same direction only, ambiguous Nodes skipped, conflicts reported, and Copy never clears a name.
12. **Route Stops section.** Unchanged (Decision 0087). It lists Route stop records, not timepoints.
13. **Formats.** JSON backup schema 19 carries the field. Versions 1 to 18 import with no names. The Dexie database version does not change: no store or index changes, and existing records need no upgrade.

## Alternatives considered

- **One per-point record holding stop ID, location, and name.** Rejected for now. It would rewrite about 43 call sites and need a migration to change only the layout. It can be done later as a separate mechanical refactor.
- **Link a timepoint to a Route stop record.** Rejected for the reason given in Decision 0085. It replaces Decision 0080 storage and every reconciliation path.
- **Store a name on import only when it differs from the Node name.** Rejected. A later Node rename would then silently change the exported GTFS names.
- **Show timepoints in the Route Stops section.** Deferred. It needs a new row type and a layout decision.

## Consequences

- One more optional field in every stop-set path, handled the same way as the timepoint stop IDs.
- A stop-level output can name a timepoint differently from the scheduling label.
- GTFS import followed by export keeps the feed's stop names.
