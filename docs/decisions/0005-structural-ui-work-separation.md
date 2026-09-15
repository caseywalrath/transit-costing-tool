# Decision 0005: Structural and UI/UX Work Separation

- Status: Accepted
- Date: 2026-09-10

## Context

The application contains calculation-heavy structural work and interaction-heavy tabular interface work. Combining them in one implementation package makes it easier for temporary UI choices to become architectural constraints and for business rules to be duplicated in components.

The user requires work involving design or user experience to be handled by Terra. Bounded mechanical and structural implementation can be handled by Luna after the architecture is settled.

## Decision

Split each implementation phase into separate structural and UI/UX work packages when both are present.

- Recommend Luna for bounded structural implementation with explicit acceptance criteria.
- Recommend Terra for layout, styling, interaction, usability, accessibility, and visual verification.
- Place a verification and user-review gate between the packages.
- Present the next package and model as a recommendation. Do not continue or delegate automatically.
- Keep file ownership and allowed change scope explicit in each package.
- Use the primary agent for architecture, cross-layer review, and final integration.

## Boundary rule

Structural work defines domain behavior, application commands, repository interfaces, persistence, migrations, serializers, and deterministic tests.

UI/UX work defines presentation and interaction while consuming the approved structural ports. It must not duplicate scheduling or validation rules.

A structural integration change may wire approved ports without altering the accepted design. If it requires a new layout or interaction decision, return it to a Terra package.

## Consequences

- Implementation has additional handoff and review steps.
- Interface decisions are made with explicit UX attention.
- Structural code can be tested before visual work begins.
- File boundaries and application ports must be clear enough for separate packages.
- A UI discovery may require a later structural revision rather than an immediate cross-layer shortcut.
- Model recommendations depend on availability in the active environment and do not themselves authorize delegation.

## Application to Phase 1

- Package 1A: structural foundation, Luna recommended.
- Package 1B: route-definition UI/UX, Terra recommended.
- Package 1C: primary-agent integration and phase acceptance.
