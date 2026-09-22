# Decision 0022: Relative Pull-Out and Pull-In Timing

- Status: Accepted
- Date: 2026-09-21
- Supersedes: Decision 0020 items 5 and 16 for new and edited boundary activities

## Decision

1. New and edited pull-out activities store a non-negative whole-minute minutesBeforeFirstTrip offset. The resolved pull-out ends at the first revenue Trip start and begins by that offset before it.
2. New and edited pull-in activities store a non-negative whole-minute minutesAfterLastTrip offset. The resolved pull-in begins at the last revenue Trip end and ends by that offset after it.
3. Deadhead activities continue to store explicit start and end service times.
4. Existing and imported pull-out or pull-in records with complete explicit times remain readable. A boundary activity uses either a relative offset or complete legacy explicit times, never both.
5. Resolved boundary times, platform hours, and findings are derived in the domain layer. React only presents those results.
6. A relative boundary with no adjacent revenue Trip is structurally valid but operationally incomplete. A resolved boundary outside valid service time or an inverted platform span is also reported as operationally incomplete.
7. The additive optional fields require no IndexedDB version increase or backup-schema version increase. JSON backup, restore, duplication, and CSV must preserve them.

## Consequences

- Moving or changing the first or last Trip automatically updates the displayed boundary time and platform duration.
- New user input avoids stale absolute boundary times after a timetable change.
- Legacy records remain available without destructive conversion.
- CSV activity exports include both relative-offset columns and legacy explicit-time columns where applicable.
