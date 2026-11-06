# Decision 0059: Scope Toggles and Service Day Abbreviations

- Status: Accepted (package ST1); data and save layers built (package ST2); UI pending (packages ST3 to ST5)
- Date: 2026-11-06 (user design review; plan `docs/implementation/scope-toggles.md`)
- Related: Decisions 0002 (service day time model), 0011 (managed directions), 0017 (service day copy), 0039 (backup import validation), 0041 (service day validation), 0047 (interface revision)

## Context

Planners switch between directions and between service days often while working on Trips. Both are native drop-downs in the scope bar, which take two clicks and hide the other choices. Service day names are user-editable and may be long or custom, so the drop-down labels cannot simply be shortened.

## Decision

### Scope toggles

1. **Replace in place.** On the Trips tab, the Day and Direction drop-downs become segmented toggles in the same position. On the Blocking tab, the Day drop-down becomes the same toggle. No second control is added elsewhere. The Service day menu of the Planned frequencies panel on the Route tab is unchanged.
2. **All options shown.** Every service day of the Scenario is a segment, whether or not it has trips or annual days. Days follow `sortServiceDays` order. Directions follow `sequence`.
3. **No visible label.** Neither the toggle nor its fallback shows the words "Day" or "Direction". Each control has `aria-label` "Day" or "Direction". This is an exception to the convention that a scope selector's `aria-label` equals its visible label.
4. **Semantics.** A toggle is a radio group: `role="radiogroup"`, one `role="radio"` per segment with `aria-checked`. Arrow keys move and select, wrapping at the ends; Home and End go to the first and last segment.
5. **Behavior.** A switch uses the same handlers as the drop-down, including the unsaved-draft prompt. A cancelled switch keeps the previous selection.
6. **Fallback.** Below the scope bar's narrow-layout breakpoint, and for Direction when a route has more than two directions, the current native `<select>` is shown, still without a visible label.
7. **Appearance.** One pill-shaped outline holds the segments, separated by thin dividers, at the height of the current select. The selected segment uses the existing pressed-toggle style (`--color-selection` fill, `--color-accent` border, `--color-accent-strong` bold text).

### Service day abbreviations

8. **Field.** `ServiceDayDefinition` gains an optional `abbreviation`. A Day segment shows the effective abbreviation. Its tooltip and accessible name give the full service day name.
9. **Default.** When no abbreviation is stored, the effective abbreviation is derived: weekday `WKD`, saturday `SAT`, sunday `SUN`, holiday `HOL`; a custom day uses the first three letters or digits of its name, in capitals. The default is not stored, so it follows a renamed day.
10. **Rules.** An entered value is trimmed and stored in capitals. It must be 1 to 3 characters, letters and digits only. No two service days of one Scenario may share an effective abbreviation, entered or default. An invalid or duplicate value is refused at the edit (`serviceDay.abbreviationInvalid`, `serviceDay.abbreviationDuplicate`), as name edits are. Clearing the value removes the stored field.
11. **Editing.** The Route tab's Annual service days table gains an "Abbr." column between Service day and Annual service days. The table keeps its overall width; the Service day column gives up the space.
12. **Persistence.** The field is optional and not indexed, so there is no IndexedDB migration and the backup schema stays at version 10. Import accepts a missing field and refuses a present field that breaks rule 10. Scenario duplication and import as copy carry the field. CSV outputs keep the full service day name and do not include the abbreviation.

## Consequences

- Switching Day or Direction takes one click on Trips, and Day on Blocking.
- A planner who renames a custom service day keeps a sensible default abbreviation without extra work.
- Browser tests that select Day or Direction through a `<select>` must use the radio group at desktop widths. They keep finding the control by its accessible name.
- If ST2 finds that older app versions must reject backups that contain the new field, a backup schema version bump is raised with the user before it is made.
