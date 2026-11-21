# Decision 0088: Direction Names per Route

- Status: Accepted and implemented (plan: `docs/implementation/direction-names.md`; closeout: `docs/implementation/direction-names-closeout.md`). Item 9 as built: the automatic blocking dialog groups its patterns by Route, so each Route's headings use that Route's own name ("Outbound (Southbound)"); the minimum layover dialog adds a name only when every Route shares it.
- Date: 2026-11-20 (user request, Federal BRT: Inbound is Northbound)
- Supersedes: the last consequence of Decision 0011 ("Route-level aliases for displayed group names are deferred")
- Related: Decision 0011 (managed Outbound and Inbound groups), Decision 0059 (scope toggles), Decision 0060 (side-by-side trips), Decision 0084 (stop schedule export uses direction names), Decision 0087 (Split all shared stops)

## Context

Every Route has exactly two direction records (Decision 0011). Each record has a fixed `group` (`outbound` or `inbound`) and a `name`. Commands, validation, blocking, planned frequencies and backup matching use the `group` or the record ID, never the name. Most screens already show `name`: the Direction toggle in the scope bar, the side-by-side panes, Compare runtimes, the Pattern Direction picker, the stop schedule export, the stop split dialogs and the planned frequencies panel.

No screen edits `name`, and `ensureManagedDirections` (`src/domain/directions.ts`) resets it to "Outbound" or "Inbound" on every save. Planners use other words: Federal BRT runs Southbound (Outbound) and Northbound (Inbound); other routes use Eastbound and Westbound, or Clockwise and Counterclockwise.

## Decision

1. **The name is editable; the group is not.** The planner can rename each of a Route's two directions. The `group` and the record ID never change. Every rule that now matches by group or ID keeps doing so.
2. **Storage.** The name is stored in the existing `RouteDirection.name` field. There is no new field, no schema version change and no migration. Old projects and backups keep "Outbound" and "Inbound".
3. **Normalisation keeps the name.** `ensureManagedDirections` keeps a stored record's name when the record already has its `group` and the name is not blank. It writes the default name only for a new record, a legacy record without a group, or a blank name.
4. **Rules for a name.**
   - Leading and trailing spaces are trimmed.
   - A blank name restores the default ("Outbound" or "Inbound").
   - At most 40 characters.
   - The two names of a Route must differ, ignoring case. A rename that matches the other direction's name is refused with "Each direction needs its own name."
5. **Where it is edited.** In **Route details** on the Route tab, as two fields: **Outbound name** and **Inbound name**. Each field shows its default as a placeholder. Each suggests a short list of common names: Northbound, Southbound, Eastbound, Westbound, Clockwise, Counterclockwise. A field commits on blur or Enter, like the other Route details fields.
6. **Route details layout.** Route details must not be taller than Annual service days next to it. The panel becomes a two-column field grid:
   - Row 1: Route name (wider) and Short name.
   - Row 2: Description (full width).
   - Row 3: Outbound name and Inbound name.

   It keeps three rows of fields, as today. Below 1100 px, where the panels stack, the same grid is used.
7. **No restore point.** A rename is a single field edit, like Route name, and is undone by typing the old name. It is saved through the same path as the other Route details fields.
8. **What changes on screen after a rename.**
   - Every place that already shows `direction.name` shows the new name, with no further change.
   - Generated pattern short names use the direction abbreviation (`directionAbbreviation`, for example "Northbound" → "NB"), so generated chips change from the old abbreviation to the new one. A planner-entered short name does not change.
   - Pattern names are not rewritten. A pattern named "Outbound: Main" keeps that name. The "Outbound:" prefix is no longer removed from it in lists grouped by direction.
9. **Screens that span several Routes keep the group words.** The automatic blocking dialog and the minimum layover dialog apply to every Route of a blocking scenario, and Routes may name their directions differently. These screens keep "Outbound" and "Inbound". When every Route in scope uses the same name for a group, they add it in brackets, for example "Outbound (Southbound)".
10. **Exports.** Exports that already write `direction.name` (stop times CSV, stop schedule export) write the new name. Exports that write the group, or a GTFS `direction_id`, are unchanged.

## Alternatives considered

- **A separate alias field next to a fixed name.** Rejected: `name` is already display-only, and a second field would make every screen choose between two.
- **Renaming the groups themselves.** Rejected: the group is the identity that blocking, planned frequencies and backup matching rely on (Decision 0011).
- **A Project-wide naming setting.** Rejected: names differ by Route.
- **A restore point per rename.** Rejected as heavier than the edit (item 7).

## Consequences

- Decision 0011's deferral is resolved without changing group identity.
- Tests that create routes still see "Outbound" and "Inbound", because those remain the defaults.
