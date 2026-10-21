# Decision 0030: Legacy Trip Runtime Staleness

- Status: Accepted
- Date: 2026-10-20

## Context

Some imported and duplicated Trips predate runtime-profile calculation-source metadata. Revision-based stale checks previously skipped those Trips, so a changed Runtime profile could leave the Trips workspace without a regeneration indicator.

## Decision

1. Keep revision comparison as the authoritative stale check when a Trip records both its source Runtime profile and calculation revision.
2. When that source is missing or incomplete, compare the Trip's saved scheduled points with the points produced by its currently assigned Runtime profile.
3. Flag the Trip as stale when the saved times differ, or when the current profile cannot reproduce valid times.
4. Require explicit confirmation before recalculating a Trip whose original Runtime source cannot be verified.
5. Do not silently rewrite legacy Trips while loading or displaying the schedule.

## Consequences

- Legacy schedules can surface runtime changes without a backup migration.
- The comparison detects whether current runtimes would produce different timepoints, but cannot distinguish an older Runtime profile from unrecorded manual edits.
- Confirmation protects those unverified times before recalculation replaces them.
- Trips with a complete source continue to use profile ID and calculation revision comparisons.
