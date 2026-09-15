# Decision 0006: Phase 1 Project Backup Graph

- Status: Accepted for Phase 1
- Date: 2026-09-10

## Context

The route-definition editor spans project, scenario, service-day, route, node, pattern, and pattern-point records. Exporting only the project header would lose the relationships needed to restore a working plan.

## Decision

Version 1 JSON backups contain the complete Phase 1 project graph as explicit top-level arrays:

- project;
- scenarios;
- service days;
- routes;
- nodes;
- patterns, including pattern points.

The payload is validated completely before a repository write. Import supports explicit `replace`, `copy`, and `reject` collision modes. Copy mode remaps every entity and relationship identifier.

Runtime records were added in export-schema version 2 under Decision 0007. Trip, block, and costing records remain deferred to their later phases.

## Consequences

- A restored Phase 1 project remains independently editable.
- Backup tests can verify relationships without a browser UI.
- Import validation must check cross-entity references and pattern rules.
- The backup service requires snapshot-capable repository ports and a transaction for restore.
