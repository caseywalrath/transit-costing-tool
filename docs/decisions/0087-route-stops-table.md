# Decision 0087: Route Stops Table

- Status: Accepted and implemented (plan: `docs/implementation/route-stops-table.md`; closeout: `docs/implementation/route-stops-table-closeout.md`). Item 1 as built: the section sits full width below Nodes and Patterns rather than between them, so its columns fit; the section order on the page is unchanged.
- Date: 2026-11-20 (user design discussion, Federal BRT stop cleanup)
- Related: Decision 0079 (Route stops; a stop is one Route-wide record shared by every pattern that places it), Decision 0080 (timepoint stop IDs per pattern), Decision 0081 (restore points), Decision 0085 (stop locations and the location import)

## Context

A Route stop is one record per Route (Decision 0079 item 2). Every pattern that places it shares its name, stop ID, and location. The Stops drawer shows one pattern at a time, and the record behind a row is visible only as a link icon and a count.

The user entered the Federal BRT stops by intersection name before they had stop IDs. A stop without a stop ID is offered in the name suggestions by name alone, so the second direction's "Bates Ave" linked to the first direction's record. Most stops ended up shared by six patterns, three in each direction, although each direction has its own stop ID and position.

To start over, the user created "… NB" stops and typed their stop IDs. Where the shared record already carried that stop ID, the drawer's ID link rule linked the new row back to the shared record without any notice, and the "NB" name was lost. Nothing in the application lists the Route's stop records, shows which directions use a record, or separates one record into two.

## Decision

1. **Stops section.** The Route tab gains a third section, **Stops**, between Nodes and Patterns.
   - It lists every stop record of the selected Route.
   - It is collapsible, and its open state is remembered on the device.
   - The Stops drawer stays the place to place, order, and time stops on one pattern. The section manages the records themselves.
2. **Columns.**
   - Stop name, Stop ID, Latitude, Longitude, Speed (mph). All are editable and saved together with one save bar.
   - **Used by**: counts per direction, for example "Northbound 3 · Southbound 3".
   - A **shared across directions** mark when patterns of two or more directions use the record.
   - A spreadsheet block pasted into a location or ID cell fills across and down, as in the drawer.
3. **Filters.** All; Shared across directions; Missing stop ID; Missing location; and a text filter on name and stop ID. There is no "Unused" filter: every Scenario write already removes stops no pattern uses (Decision 0079 item 11).
4. **Split by direction** (one stop).
   - The planner chooses the direction that moves to a new record, and gives the new record a name and an optional stop ID, latitude, longitude, and speed.
   - That direction's placements of the stop point to the new record. They keep their order and timing rules.
   - Patterns of the other directions keep the original record, and so does a pattern with no direction.
   - A split of a stop that only one direction uses is refused.
5. **Split all shared stops.**
   - One review splits every stop that is shared across directions.
   - The planner chooses the direction that keeps the existing records, with their stop IDs and locations.
   - The planner gives a name suffix for each direction, for example "NB" and "SB". The kept records may also take their direction's suffix.
   - Each other direction gets a new record named with its suffix, with no stop ID and no location, to be entered or imported afterwards.
6. **Delete.** One or more ticked stops can be deleted. A review lists every pattern each stop is removed from.
7. **Merge.**
   - Two or more ticked stops can be merged into one record that the planner chooses.
   - The others' placements point to it, and the others are removed. The kept record's fields stay as they are.
   - A merge that would place one stop twice in one pattern segment is refused, naming the patterns.
8. **Restore points.** Split, Split all, Delete, and Merge each store a restore point (Decision 0081) and can be undone from their notice and from Undo history. Saving field edits stores none, as for the Stops drawer.
9. **Route-wide location import.**
   - The section's Actions menu has **Import stop locations…**, with the matching rules and review of Decision 0085 item 7.
   - The targets are every stop record of the Route.
   - Timepoint locations stay per pattern and are imported in the Stops drawer.
   - Apply writes into the table's unsaved edits; Save writes them.
10. **Link notice in the Stops drawer.**
    - When a typed name or stop ID links a drawer row to an existing stop, the row shows "Linked to existing stop {name} ({stop ID})" with **Undo link**.
    - Undo link returns the row to the stop and values it had before the link.
    - The link rules are unchanged.
11. **Stale protection.** Every write from the section is checked against the stop set it loaded and refused with the existing "Stops changed after this editor opened" message when the set changed since (Decision 0036).
12. **Formats.** No stored-data change: the section edits the existing `RouteStopSet`. The Dexie schema stays 15 and the backup schema stays 16.

## Alternatives considered

- **Separate stop records per direction automatically.** Rejected: patterns of one direction should share a stop, and some Routes serve one curbside stop in both directions. The planner decides.
- **Stop the drawer from linking by name or stop ID.** Rejected: linking is how patterns of one direction share a stop, and stop IDs must stay unique within a Route (Decision 0079 item 2). A visible notice with an undo keeps the rule and removes the surprise.
- **Manage stops in a dialog from the Stops drawer.** Rejected: a dialog over a drawer is cramped for 40 or more rows, and a stop record belongs to the Route, not to the open pattern.
- **A Route-level stop list stored apart from placements.** Not needed: `RouteStopSet.stops` already is that list.

## Consequences

- Shared records are visible and can be separated in one step per stop, or in one review for a Route.
- The location import can fill a whole Route's stops from one file.
- The Route tab grows by one section. It starts collapsed when the Route has no stops.
