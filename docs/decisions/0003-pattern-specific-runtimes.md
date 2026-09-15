# Decision 0003: Pattern-Specific Runtime Profiles

- Status: Accepted for the initial runtime build; review required after user testing
- Date: 2026-09-10

## Context

Full routes, short turns, loops, and offset patterns may use overlapping segments. Runtime data could be shared by segment, inherited from a base pattern, or entered separately for each pattern.

## Decision

In the first runtime implementation, a runtime profile belongs to exactly one route pattern and contains a complete runtime for each segment in that pattern.

Runtime assignments allow several service days to use the same profile for that pattern. Profiles are not linked across patterns.

Provide copy and reverse-copy commands to create a new independent profile from an existing pattern.

The trip departure time selects one runtime band. That band applies to the full trip.

## Consequences

- Runtime selection is explicit and predictable.
- Short turns and loops do not require inheritance rules.
- Shared corridor segments may contain duplicated runtime values.
- Changing a common segment may require changes in several profiles.
- Copies do not remain synchronized.
- Stable pattern-point identifiers and ordered segment arrays allow a later migration to shared defaults or overrides.

## Review trigger

Revisit this decision after the first runtime table and trip generation workflow have been tested with the Federal Boulevard use case. Specifically evaluate editing duplication, reverse-pattern setup, and the frequency of inconsistent shared-segment values.

## Alternatives retained for review

- Shared directional segment-runtime library.
- Base runtime profile with pattern-level overrides.
- Shared corridor defaults with independent pattern snapshots.
