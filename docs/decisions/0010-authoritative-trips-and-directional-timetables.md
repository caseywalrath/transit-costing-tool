# Decision 0010: Authoritative Trips and Directional Timetables

- Status: Accepted for Phase 2R
- Date: 2026-09-11

## Context

The first Phase 2 implementation saved generation sets and presented them as a separate user workflow. User review found that this introduced unnecessary concepts between runtime definition and the schedule. The required planning workflow is to generate or add trips directly into a conventional directional timetable.

The Federal Boulevard reference also demonstrates that multiple patterns in the same direction must share one ordered set of timetable columns and appear interlaced in departure order.

## Decision

Trips and their scheduled points are the authoritative saved schedule records.

A Generate Trips request is transient and contains a pattern, First Trip, Headway, and Last Trip. It creates trips additively and is not persisted as a generation set. Existing trips do not change when runtime data changes.

Users may explicitly recalculate selected trips. Recalculation preserves trip IDs and requires impact confirmation only when it would overwrite manual changes or affect block relationships.

Routes contain application-managed Outbound and Inbound direction groups. Every pattern belongs to exactly one group. Each group owns stable internal ordered timetable columns, and each pattern point maps to one column. A directional schedule contains trips from all of its patterns and uses an empty marker where a pattern does not serve a column. Decision 0011 replaces user-managed direction setup.

Runtime profiles remain complete and pattern-specific. One Default profile is available without requiring initial profile creation. It may be assigned to multiple service days, and the interface must make shared use visible.

Runtime segment durations accept decimal minutes or `MM:SS`, convert to integer seconds, and display as `:MM` or `:MM:SS` as required.

The four standard service days always sort as Weekday, Saturday, Sunday, Holiday.

Phase 2 draft data and backup compatibility are not required. The implementation may remove generation-set storage and obsolete provenance structures without a migration for draft schedule data.

## Consequences

- The UI no longer exposes generation sets, materialized schedules, or regeneration revisions.
- Initial generation is additive and needs no schedule preview.
- Runtime edits cannot silently change scheduled or blocked trips.
- Direct Add Trip and pattern changes use the same runtime-resolution behavior as bulk generation.
- Direction and direction-column records become part of persistence, backup, duplication, import validation, and CSV where applicable.
- Timetable layout becomes deterministic across several patterns in one direction.
- Decision 0004 is superseded for regeneration authority.
- Decision 0008 is superseded for generation-set-based override provenance.
- Decision 0009 is superseded where it requires generation sets in the saved graph.
- The draft Phase 3 plan must be rewritten before implementation.

## Deferred items

- runtime inheritance across patterns;
- arbitrary downstream scheduled-point editing;
- cross-direction pattern changes within a timetable row;
- arrival and departure pairs at one timepoint;
- Excel schedule import;
- automatic blocking.
