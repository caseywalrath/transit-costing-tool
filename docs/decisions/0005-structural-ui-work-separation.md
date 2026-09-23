# Decision 0005: Structural and UI/UX Work Separation

- Status: Accepted
- Date: 2026-09-10

### Model recommendation update — 2026-09-22

The separation and user-verification gates below remain in force. Model assignments that name Terra are historical and are superseded for future work: recommend Luna for structural work and precisely specified, low-novelty UI wiring that reuses established patterns; recommend Sol for novel or complex UI/UX work. See `codex.md` for the current work-package guidance.

## Context

The application contains calculation-heavy structural work and interaction-heavy tabular interface work. Combining them in one implementation package makes it easier for temporary UI choices to become architectural constraints and for business rules to be duplicated in components.

The original work-package guidance assigned UI/UX work to Terra; that model is now deprecated. Bounded structural implementation remains assigned to Luna after the architecture is settled.

## Decision

Split each implementation phase into separate structural and UI/UX work packages when both are present.

- Recommend Luna for bounded structural implementation with explicit acceptance criteria.
- Recommend Luna for simple UI wiring only when it reuses established UI patterns and has precise layout, interaction, keyboard/accessibility, and acceptance instructions.
- Recommend Sol for novel or complex layout, styling, interaction, usability, accessibility, and visual design.
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
- Package 1B: route-definition UI/UX, Terra recommended at the time (historical assignment).
- Package 1C: primary-agent integration and phase acceptance.
