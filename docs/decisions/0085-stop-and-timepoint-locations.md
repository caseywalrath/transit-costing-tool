# Decision 0085: Stop and Timepoint Locations

- Status: Accepted and implemented (2026-11-20; plan: `docs/implementation/stop-schedule-and-locations.md`; closeout: `docs/implementation/stop-schedule-and-locations-closeout.md`)
- Date: 2026-11-19 (user design discussion)
- Extended by: Decision 0092 (timepoint stop names, stored the same way; item 7's name matching uses the timepoint stop name)
- Related: Decision 0036 (writes re-read stored data), Decision 0079 (route stops), Decision 0080 (timepoint stop IDs per pattern; this decision stores locations the same way), Decision 0084 (stop schedule export), Decision 0086 (distance-weighted stop times use these locations)

## Context

The stop schedule export (Decision 0084) has Latitude, Longitude, Distance, and Speed Limit columns, and distance-weighted stop times (Decision 0086) need stop positions. The application stores no coordinates.

The user asked for both a CSV import and a table in the application where coordinates can be typed, as an expansion of the existing Stops drawer. The user noted that one Node often has a different stop position inbound and outbound, and that locations must copy between patterns.

## Decision

1. **Stop fields.** `RouteStop` gains optional `latitude`, `longitude` (decimal degrees, WGS 84), and `speedLimitMph`. A stop is one Route record shared by the patterns that use it (Decision 0079 item 2), so its location is entered once and every pattern sees it.
2. **Timepoint locations per pattern point.** A timepoint's location is stored per pattern point in the stop set, like its stop ID (Decision 0080): `RouteStopSet.timepointLocationsByPatternId: Record<patternId, Record<patternPointId, StopLocation>>`, with `StopLocation = { latitude?, longitude?, speedLimitMph? }`. One Node can therefore have one position on the southbound patterns and another on the northbound ones.
3. **Validity.** Latitude and longitude are both present or both absent; latitude is between −90 and 90 and longitude between −180 and 180; a speed limit is greater than 0 and at most 100. Violations are errors that block the save. An empty location is not stored.
4. **Lifetime.** A stop set is kept when it has stops, timepoint stop IDs, or timepoint locations. Pattern edits, pruning, copies, and deletions treat timepoint locations exactly as Decision 0080 treats timepoint stop IDs: a location stays while its point remains on the pattern and stands on the same Node.
5. **Drawer expansion.** The Stops drawer gets a **Show locations** switch. When on, the table gains Latitude, Longitude, and Speed limit columns on stop rows and timepoint rows, and the drawer widens. It is off by default and the choice is a per-device preference. A coordinate pair pasted into the Latitude field ("39.912274, -104.99353", the format copied from web maps) fills both fields. Values save with the drawer's other edits, in the same write. A stop used by more than one pattern says so, because editing it changes every pattern.
6. **Copy and fill.** "Fill from other patterns" and "Copy to other patterns" carry timepoint locations with the same rules as timepoint stop IDs (Decision 0080 item 6): matched by Node, **same direction only**, ambiguous Nodes skipped, conflicting sources reported, Copy never clears a location. Stop locations need no copy because the stop record is shared.
7. **CSV import.** The drawer's Actions menu gets **Import stop locations…**. It reads a CSV with a stop ID column and latitude and longitude columns, and optionally stop name and speed limit, recognizing common header names, including those of GTFS `stops.txt` and of the STOPS workbook saved as CSV. Rows whose latitude or longitude is not a number are skipped, so title and repeated header rows are ignored.
   - It fills the open pattern's draft: its stops and its timepoints. Nothing is saved until **Save stops**.
   - Rows match by stop ID (trimmed, case-insensitive). A drawer row without an ID match may match by name only when exactly one file row and exactly one drawer row have that name. Name matches are listed for review and are not applied unless chosen, because two physical stops often share a name (Decision 0079 item 16).
   - A stop ID that appears twice in the file with different values is a conflict and is not applied.
   - An empty speed limit in the file leaves the stored one unchanged.
   - Locations of other patterns' timepoints are filled afterwards with Copy or Fill.
8. **Distance in the stop schedule export.** The distance between two consecutive rows of a pattern is:
   1. when every stop and both timepoints of their segment have a location and the segment's entered miles are above 0: the straight-line distance between the two rows, scaled so that the segment's straight-line pieces add up to its entered miles;
   2. otherwise, when both rows have a location: the straight-line distance;
   3. otherwise, when the segment has no stops and its miles are above 0: the segment miles;
   4. otherwise: no distance.
   The distance to the next exported row is the sum of the pieces between them, and is empty if any piece is missing. Straight-line distance uses the haversine formula with an Earth radius of 3,958.8 miles.
9. **Formats.** JSON backup schema 16 carries the new fields; versions 1 to 15 import with no locations. The Dexie database version does not change: no index or store changes, and existing records need no upgrade.

## Alternatives considered

- **Location per Node.** Rejected for the reason of Decision 0080: two directions stop on different sides of the street.
- **A timepoint linked to a Route stop record**, which would supply its name, ID, and location. Deferred: it would replace Decision 0080's storage and change every copy and reconciliation path. Per-point storage covers the direction case with existing machinery. Revisit if timepoint stop names are needed in exports.
- **Locations in a separate Scenario table.** Rejected: they follow stops and pattern points, which already live in the stop set.
- **Automatic name matching on import.** Rejected (Decision 0079 item 16).
- **Along-route distances from the Transit Analysis Tool.** Deferred: a later Analysis Tool "Export stops" can write a CSV this import reads.

## Consequences

- One backup schema version; no database version.
- The Stops drawer has a wider mode with more fields; the default layout is unchanged.
- Coordinates entered once per stop serve every pattern; timepoint coordinates are entered once per direction and copied.
