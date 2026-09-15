# Decision 0015: Route and Scenario Deletion

- Status: Accepted
- Date: 2026-09-14

## Context

Route and Scenario records are user-defined planning inputs with dependent service data. Deleting only a parent record would leave orphaned Nodes, Patterns, runtime data, Trips, or Block references. Deletion must be understandable before it is committed and must not leave the local project unusable.

## Decision

1. Route deletion displays the dependent-record impact before confirmation, then atomically removes that Route's Nodes, managed Directions, Patterns, runtime profiles, runtime assignments, historical generation records, and Trips.
2. Revenue-trip activities for deleted Route Trips are removed from affected Blocks. Blocks remain, including empty Blocks, because they may contain manual or future interline planning context.
3. Scenario deletion displays its complete scenario-owned impact before confirmation, then atomically removes the Scenario, its service days, Routes, route-owned data, Trips, and Blocks from the Project snapshot.
4. A Project must retain at least one Scenario. Deleting the only Scenario is blocked with an instruction to create another Scenario first.

## Consequences

- Route and Scenario deletion are explicit irreversible actions with a named Delete confirmation button.
- The React interface requests impact information from the application layer; it does not calculate the deletion graph itself.
- No schema change is required because the existing scenario-wide and project-wide transactions own every affected record collection.
