# Decision 0021: Initial Blocking Workspace Scope and Exports

- Status: Accepted for Phase 4 planning
- Date: 2026-09-18

## Context

Blocks are scenario-wide structures that may support future interlining, while the initial application edits one selected Route at a time. The Blocking and Trips workspaces also need an unambiguous Blocking Scenario context once multiple arrangements can use the same Trip Profile.

Route-scoped CSV cannot safely represent a future multi-route Block without truncating its activities or expanding unrelated dependencies. Phase 4 therefore needs explicit UI and export scope rules.

## Decision

1. The Phase 4 Blocking UI uses one selected Route as the candidate-Trip assignment scope.
2. The Blocking Scenario and Block data model remain scenario-wide and structurally capable of containing Trips from multiple Routes.
3. Phase 4 does not intentionally create multi-route Blocks. A Trip from a different Route cannot be added to a non-empty Block.
4. Existing or imported multi-route Blocks remain fully visible and reviewable. The Route filter never hides or truncates activities in the selected Block.
5. Unassigned Trips and revenue activities display their Route wherever Route identity is needed to avoid ambiguity.
6. Dedicated interlining behavior, shared cross-route location identity, and cross-route compatibility assistance remain deferred.
7. The Trips workspace adds a Blocking Scenario selector filtered to the selected Trip Profile. The read-only Block column reflects only that selected Blocking Scenario.
8. Blocking Scenario selection is non-authoritative UI context. It resets or falls back safely when the Project, Scenario, or Trip Profile changes.
9. The new Trips selector must use the accepted Phase 3R action-layer, menu, focus, discard-guard, and responsive conventions. It must not change Runtime or Trip command scope.
10. Phase 4 CSV output is scoped to a Blocking Scenario rather than to one Route.
11. Provide separate Blocking Scenario, Block, block-activity, and derived block-summary CSV files with stable columns and explicit validity/completeness fields.
12. CSV remains reporting output and cannot restore a complete Blocking Scenario. JSON remains the backup and restore format.

## Consequences

- The first UI preserves the one-Route planning workflow without adding Route ownership to Blocks.
- Imported multi-route data is inspectable but cannot be expanded through Phase 4 assignment commands.
- The Trips Block column has a defined alternative context instead of implying one universal assignment.
- Terra must place and verify the additional Trips context control without undoing the accepted Phase 3R hierarchy.
- Blocking exports preserve complete Blocks and avoid route-filter truncation.

## Rejected alternatives

### Route-owned Blocks

Rejected because it would contradict the established future-interlining boundary and require later ownership migration.

### Hide activities outside the selected Route

Rejected because it would display an incomplete and potentially misleading Block.

### Display one Block label without a Blocking Scenario selector

Rejected because one Trip can have different assignments in different Blocking Scenarios.
