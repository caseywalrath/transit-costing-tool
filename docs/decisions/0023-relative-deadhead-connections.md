# Decision 0023: Relative Deadhead Connections

- Status: Accepted
- Date: 2026-09-21
- Supersedes: Decision 0020 item 5 for new and edited deadhead activities

## Decision

1. A new or edited deadhead is a connection activity after one preceding revenue Trip and before one successor revenue Trip.
2. It stores a non-negative whole-minute `minutesAfterPreviousTrip` duration, required Nodes, and optional miles. Its resolved start is the preceding Trip end and its resolved end is that start plus the entered duration.
3. Remaining non-negative time before the successor Trip is derived layover. Layover is not stored.
4. Existing or imported deadheads with complete explicit start and end times remain readable. A deadhead uses either the relative duration or paired legacy explicit times, never both.
5. The Current Block table exposes a **Deadhead** column for each eligible revenue-Trip connection. An **Add** button opens the deadhead dialog; a saved value replaces that button and leaves Layover as the separate derived remainder. The dialog may apply its duration, Nodes, and miles to every matching consecutive From/To Node pair in the current Block. Editing a saved deadhead offers confirmed deletion; its selected bulk scope deletes every stored deadhead with the same From/To Node pair in the current Block.
6. Reordering a revenue Trip moves a directly following deadhead with that Trip. Deadheads are not independently reordered.
7. Deleting the preceding or successor Trip removes its connection deadhead as part of the reviewed cleanup. Stable timetable changes retain the activity and recalculate its timing and feasibility.

## Consequences

- A deadhead no longer needs manually maintained absolute start and end times after a Trip shift.
- A duration greater than the available gap remains an operational finding rather than corrupt data.
- The additive optional field preserves IndexedDB and JSON backup compatibility; no version change is required. CSV exports add the relative-duration column and retain legacy time columns.
