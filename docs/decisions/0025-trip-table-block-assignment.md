# Decision 0025: Trip-Table Block Assignment

- Status: Accepted; implementation in progress
- Date: 2026-09-22

## Context

Decision 0021 established a Blocking Scenario selector in Trips so the displayed Block label has one unambiguous context. The user requested that the Trips table also support direct assignment and reassignment, both for one Trip and for a multi-selection.

## Decision

1. The Trips Block pill is an assignment control. It lists Blocks in the selected Blocking Scenario and current service day. Choosing a different Block opens a confirmation dialog before writing.
2. The Trips `Actions` menu includes `Assign Block…`. It requires selected Trips, lets the user choose a destination Block in the same Blocking Scenario and service day, and confirms the whole operation before writing.
3. Multi-selection may include unassigned Trips and Trips from more than one source Block. One application command moves all selected Trips atomically into the destination; no Trip ID may be duplicated within a Blocking Scenario and service day.
4. Assignment uses the selected Trip Profile indirectly through the immutable source profile of the Blocking Scenario. It cannot cross Trip Profile or service-day scope. Changing the Blocking Scenario selector changes the assignment context; it does not transfer Trips between scenarios.
5. Assignment preserves the existing Phase 4 chronological insertion behavior. Operationally infeasible but structurally valid results remain saved with derived findings, as they do when assigned in Blocking.
6. The Phase 4 one-Route assignment limit remains in effect. The UI makes Blocks containing unavailable references or Trips from another Route unavailable as destinations. Existing multi-route Blocks remain inspectable in Blocking.
7. Moving a Trip removes adjacent between-Trip deadhead activities from its source Block so they do not become detached from the revenue connection they describe. Existing pull-out and pull-in activities remain in their original Blocks. The confirmation identifies the number of affected deadheads.
8. The application rechecks the Blocking Scenario source signature, selected Trip ownership, day, and duplicate-assignment rules before a single atomic repository write. If Blocks changed since the dialog opened, the write is rejected and must be reviewed again.
9. Pill menus, the Actions command, and confirmation dialogs remain keyboard-operable and return focus to their invoking control.

## Consequences

- Trip assignment is available without switching to Blocking, while the selected Blocking Scenario remains explicit.
- Trips can be moved directly from any number of source Blocks without exposing source Block identifiers or performing partial writes.
- The feature uses the existing Blocking persistence graph. No database migration, JSON backup-version change, CSV-format change, or new authoritative Trip field is required.
- The confirmation dialog must disclose source deadheads removed by reassignment. Operational feasibility remains the responsibility of existing Blocking findings.

## Rejected alternatives

### Choose one source Block before a multi-Trip assignment

Rejected because Trips selection can span Blocks and unassigned service; requiring one source would make the action fail for a common multi-selection.

### Store Block ID directly on each Trip

Rejected because the selected Blocking Scenario is one of potentially several alternative blocking arrangements for the same Trip Profile. Trip-owned Block IDs would introduce competing assignment authority.
