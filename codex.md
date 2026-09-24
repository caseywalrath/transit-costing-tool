# Codex Project Guide

## User Context

The user is a transit planner with a basic working understanding of GitHub and Codex. Do not assume the user is a software developer or is operating through a traditional terminal workflow.

Codex should perform routine repository inspection, file editing, testing, and other authorized development work directly. Ask the user to perform a manual action only when the action requires their account, judgment, or approval.

When a user action is required, state:

1. what the user must do;
2. why it is required;
3. what result to expect.

## Product Context

This repository will contain a local-first transit service planning application. It will define route patterns, generate scheduled trips, organize trips into vehicle blocks, calculate service quantities, and estimate costs.

The application is intended for planning rather than daily operations. It should use concepts familiar to users of scheduling systems such as Trapeze or Hastus without attempting to reproduce those products.

The initial application:

- works on one route at a time in the interface;
- supports multiple saved projects and scenarios;
- stores data locally in IndexedDB;
- is deployed as a static GitHub Pages site;
- supports weekday, Saturday, Sunday, and holiday service;
- supports service times greater than 24:00;
- uses miles;
- begins with manual blocking and manually entered costing assumptions.

## Communication

- Use direct, structured language.
- Lead with the result or decision.
- Explain implementation consequences when asking the user to choose between alternatives.
- Do not treat the reference workbook as a literal specification.
- Identify assumptions and unresolved decisions explicitly.
- Use transit-planning terms consistently with `docs/domain-glossary.md`.

## Repository Workflow

Before changing the repository:

1. Read `AGENTS.md`.
2. Read `architecture_overview.md`.
3. Read relevant decision records and implementation plans.
4. Inspect Git status if the repository has been initialized.
5. Confirm that the requested work belongs to the current approved phase.

The repository is currently local and may not yet have Git initialized or a remote configured. Do not assume a branch strategy, remote URL, package manager, Node installation, or deployment workflow until it exists and has been inspected.

When Git is initialized, treat `main` as the stable branch. Use one descriptive feature branch per meaningful implementation or revision package unless the user directs otherwise.

## Work Packages and Model Recommendations

Development plans must separate structural work from UI/UX work when both are present.

- Recommend Luna for bounded domain, application, persistence, migration, serialization, and test work after the architecture is settled.
- Luna may implement a simple UI or wire approved behavior when it reuses existing components and patterns. Give Luna precise instructions for placement, states, interactions, keyboard/accessibility behavior, and acceptance criteria; do not rely on Luna to invent a new visual or interaction system.
- Recommend Sol when UI work is novel, interaction-heavy, visually complex, or requires substantial usability/accessibility judgment.
- Keep structural packages from establishing UI conventions through placeholders, and keep UI packages from duplicating business rules that belong in domain commands or selectors.
- Place a user-verification gate between structural work and a separately owned UI/UX package when both are required.
- The primary agent remains responsible for architecture, integration, cross-layer consistency, and final verification.

Older plans may contain Terra assignments from when that model was available. Treat those as historical recommendations; do not use Terra for new work.

Model recommendations are presented to the user between packages. They do not authorize automatic task creation, delegation, or continuation.

## Reference Material

The current reference workbook is:

`Federal Blvd Service Plan 11-20-2024.xlsx`

It illustrates:

- directional trip tables;
- short and full-length patterns;
- runtime bands;
- manual block assignments;
- pull-out and pull-in times;
- block-level revenue and platform hours;
- annual service calculations;
- hourly cost projections;
- vehicle-mile calculations.

Use it to understand terminology, relationships, and expected outputs. Do not copy its formula layout or assume every calculation belongs in the application.

## Documentation Map

- `architecture_overview.md`: stable system architecture and phased roadmap.
- `docs/domain-glossary.md`: canonical domain terminology.
- `docs/data-schema.md`: proposed TypeScript and IndexedDB schema.
- `docs/decisions/`: accepted architectural decisions and consequences.
- `docs/implementation/`: phase-specific scope, work packages, and acceptance criteria.

## Verification and Closeout

Before closing an implementation package:

1. Review the applicable acceptance criteria.
2. Run checks appropriate to the changed layer.
3. Inspect Git status if Git is available.
4. Summarize changed files and verification results.
5. Confirm whether architecture or decision documentation must be updated.
6. Present the next work package and recommended model to the user.

Do not start the next package until the user requests it.

## Current implementation status

Phase 3R is implemented and accepted through Package 3R-C. It is recorded in `docs/implementation/phase-03r-closeout.md`. Phase 4 is implemented and user-accepted through Package 4D; see `docs/implementation/phase-04-closeout.md`. Phase 5 planning is approved in `docs/implementation/phase-05-costing.md`. Packages 5A through 5C are implemented, including the consolidated global/module toolbar revision in Decision 0028; automated Costing UI verification passed on 2026-09-23 and user review remains the 5C stop gate. Package 5D integration remains unstarted.

Phase 1 is implemented through Package 1C. The completed scope includes the React/TypeScript/Vite foundation, route-definition domain behavior, Dexie version 1 persistence, complete Phase 1 JSON backup/restore, CSV serializers, the route-definition interface, and the application-layer integration facade.

Phase 2 is implemented and accepted through Package 2G, but user review approved a replacement Trips workflow before Phase 3. The Phase 2R replacement workflow, including the Route and Trips UI, safe route editing, Trip profiles, and integration acceptance, is complete; its historical package plan is `docs/implementation/phase-02r-trips-workflow-revision.md`. The corrective package in `docs/implementation/phase-02r-safe-route-editing.md` is implemented and user-accepted. It stages Node and Pattern saves, deterministically rebalances runtimes and trips, presents reset impacts for ambiguous Pattern changes, and reconciles Direction timetable columns. Trip-profile implementation in `docs/implementation/phase-02tp-trip-profiles.md` is implemented and user-accepted; it adds scenario-wide timetable alternatives and the source boundary for Blocking Scenarios. Phase 3 service-day workflows are implemented and accepted through Package 3C. The completed scope is recorded in `docs/implementation/phase-03-closeout.md`. Phase 3R is implemented and accepted through Package 3R-C; the closeout is `docs/implementation/phase-03r-closeout.md`. Phase 4 is accepted through Package 4D; its closeout is `docs/implementation/phase-04-closeout.md`. Phase 5 Packages 5A through 5C are implemented; persistence, versioned backup, report export, and automated Costing UI checks pass. User review remains before Package 5D, which is unstarted.
