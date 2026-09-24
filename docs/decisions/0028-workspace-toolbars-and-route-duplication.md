# Decision 0028: Workspace Toolbars and Route Duplication

- Status: Accepted and implemented
- Date: 2026-09-23

## Context

Project, Scenario, Route, Blocking, and Costing controls had accumulated in separate page sections and repeated workspace cards. Frequent selectors and infrequent lifecycle commands did not have a consistent location. Route also lacked rename and duplication commands outside direct field editing.

## Decision

1. Keep Project and Scenario selectors in a permanent row on every tab. Each entity has its own accessible Actions menu.
2. Project Actions contains new-project and JSON backup/restore commands. Scenario Actions contains create, rename, duplicate, and delete commands.
3. Put each module's governing selectors in a second toolbar. Route uses Route plus Actions; Trips uses Route, Day, and Direction; Blocking uses Route, Trip Profile, Blocking Scenario, Day, and Actions; Costing uses Blocking Scenario, derived read-only Trip Profile, View year, and Actions.
4. Keep Route visible in Blocking because candidate Trips remain filtered to one Route. Future interlining may replace it with a broader Route-scope control without changing Block ownership.
5. Keep CSV exports in their owning module's Actions menu.
6. Route duplication copies the Route, Nodes, Directions, Patterns, Runtime Profiles and assignments, historical generation records, and Trips with fresh identifiers and remapped references. It does not copy Block activities; copied Trips begin unassigned.

## Consequences

Workspace cards contain editing tasks and results rather than repeated governing selectors. Action menus reuse the established keyboard-operable menu component. Route duplication is an atomic Scenario-record write and does not silently create duplicate vehicle work.
