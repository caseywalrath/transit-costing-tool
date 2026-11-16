# Decision 0080: Timepoint Stop IDs per Pattern

- Status: Accepted and implemented
- Date: 2026-11-16 (user review of Decision 0079)
- Supersedes: Decision 0079 item 12 (`Node.stopCode`)
- Related: Decision 0079 (Route stops and derived stop times), Decision 0065 (copy and fill between patterns), Decision 0036 (writes re-read stored data)

## Context

Decision 0079 gave each Node one optional stop ID (`Node.stopCode`), edited in the Nodes table. The user reported that this is wrong: two directions often serve the same Node at different stops, one on each side of the street, so one Node can have one stop ID inbound and another outbound. The stop ID therefore belongs to a timepoint on a pattern, not to the Node.

## Decision

1. **Storage.** A timepoint's stop ID is stored per pattern point in the Route's stop set: `RouteStopSet.timepointStopCodesByPatternId: Record<patternId, Record<patternPointId, string>>`. Values are trimmed and non-blank; a pattern with none has no entry. The field is optional, so sets written before this decision read as having none. `Node.stopCode` is removed.
2. **Set lifetime.** A stop set is kept when it has stops or timepoint stop IDs, and removed when it has neither. Pruning (on every Scenario write) drops stop IDs of a missing pattern or point.
3. **Pattern edits.** A timepoint stop ID stays only while its point remains on the pattern and stands on the same Node. Removing the point, or changing the point's Node, removes it in the same write. The save review does not count these.
4. **No uniqueness rule.** The same stop ID may appear on several patterns (that is the purpose of copy and fill) and may equal a Route stop's stop ID. Route stop IDs stay unique within the Route (Decision 0079 item 2).
5. **Editing.** The Stops drawer shows a Stop ID field on each timepoint row, in the column used by the stops' Stop ID fields. It is saved with the drawer's other edits, in the same write.
6. **Copy and fill.** "Fill from other patterns" and "Copy to other patterns" also carry timepoint stop IDs, matched by Node, between patterns of the **same direction** only (both patterns have a direction and it is the same one). A Node that occurs more than once in a pattern is skipped as ambiguous.
   - **Fill** writes into the draft's timepoints that have no stop ID, when the same-direction patterns that have one for that Node agree. Disagreement is reported as a conflict.
   - **Copy** writes the saved open pattern's stop IDs onto the same Node of same-direction patterns, except excluded ones. A different value is replaced and counted as replaced. A timepoint with no stop ID on the open pattern is not copied, so Copy never clears one.
   - Same-direction patterns that share a Node are copy candidates even when they share no segment. Undo, the stale check, and the preview work as for stops (Decision 0079 item 9).
7. **Export.** Timepoint rows of "Export trips with stops CSV" and of the Stop trips drawer show the stop ID of that point on that pattern.
8. **Formats.** Dexie version 12 changes no store. Its upgrade moves each Node's `stopCode` onto every point of its Route's patterns that stands on that Node, creating a stop set when the Route had none, keeps a point stop ID that is already set, and removes `stopCode` from every Node. JSON backup schema 14 carries the new field. Import of a version 13 file applies the same move; versions 1 to 13 still import.

## Alternatives considered

- **A stop ID per Node and direction.** Rejected: two patterns of one direction can still stop on different sides at a Node (for example a short-turn that loops), and a direction has no record of its own Nodes' stops.
- **Store the stop ID on the pattern point.** Rejected for the reason of Decision 0079: the pattern editor and `updateRoute` write whole records from the screen's copy, and would overwrite stop edits made in the drawer.
- **Store the Node ID with each stop ID** to detect a point moved to another Node. Not needed: pattern reconciliation compares the saved and the next pattern in the same write.

## Consequences

- The Nodes table has Name, Short, and Type only.
- A Route can have a stop set with timepoint stop IDs and no stops.
- One more field in every Route and Scenario copy path, remapped with the pattern and point IDs.
