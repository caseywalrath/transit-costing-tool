# Packages ST1 to ST5: Direction and service day toggles

- Requested by the user on 2026-11-06.
- Branch: `claude/costing-empty-blocking-scenario-6sbnrj` (the branch assigned to this session). Do not push to another branch. Do not open a pull request unless the user asks.
- Status: ST1 to ST4 complete (2026-11-06). ST5 not started.

## Goal

Switching direction or service day takes one click instead of opening a drop-down.

1. **Direction.** The Direction drop-down in the top bar of the Trips tab becomes a segmented toggle with one segment per direction (normally Outbound | Inbound).
2. **Service day.** The Day drop-down becomes a segmented toggle with one segment per service day, labeled with a three-letter abbreviation (WKD | SAT | SUN | HOL by default).
3. **Abbreviations.** Each service day gets an editable abbreviation. It is set in a new column of the Annual service days table on the Route tab. The table keeps its current overall width.

## User decisions (2026-11-06)

| # | Decision |
|---|---|
| U1 | Replace the drop-downs in place (Option A). Do not add a second control above the Trips table. |
| U2 | Show every service day of the Scenario. Do not hide days with no trips or zero annual days. |
| U3 | Service day labels come from a user-editable abbreviation of up to three characters, entered on the Route tab. |
| U4 | The Annual service days table keeps its overall size. The Service day (name) column gives up the width the new column needs. |
| U5 | No visible "Day" or "Direction" label, on the toggles or on their `<select>` fallbacks. The function is clear from the options. Each control keeps an accessible name ("Day", "Direction") through `aria-label`. |

## Decisions the primary agent makes in ST1 (recorded in the new decision record)

These are recommendations. ST1 records them, and the user may revise them at the ST1 verification gate.

| # | Recommendation | Reason |
|---|---|---|
| R1 | The abbreviation field is optional. A blank abbreviation uses a derived default and is not stored. | Existing data and older backups need no rewrite. The default stays correct if the name changes. |
| R2 | Defaults: weekday WKD, saturday SAT, sunday SUN, holiday HOL. A custom day uses the first three letters or digits of its name, in capitals. | Matches the user's labels. A custom day still gets a readable default. |
| R3 | An entered abbreviation is trimmed and stored in capitals. It must be 1 to 3 characters, letters and digits only. Two service days of one Scenario may not share an effective abbreviation (entered or default). | Prevents two identical segments. |
| R4 | Duplicate or invalid abbreviations are refused at the edit, as name edits are now. The top bar never has to resolve a conflict. | One place to fix it. |
| R5 | The abbreviation is copied with the service day wherever a service day is copied (Scenario duplication, import as copy). It is not added to CSV outputs. | CSVs keep the full name, which is clearer outside the app. |
| R6 | The Blocking tab's Day selector uses the same toggle. The Planned frequencies Service day menu on the Route tab is unchanged. | Trips and Blocking both carry Day in the scope bar, and `docs/ui-conventions.md` keeps the scope selectors consistent. The Planned frequencies menu is inside a panel, not the scope bar. |
| R7 | A toggle falls back to the current native `<select>` when the bar is too narrow, and Direction falls back when a route has more than two directions. | Keeps the bar usable on small screens and on unusual routes. |

## Packages

| Package | Content | Class / model | Depends on |
|---|---|---|---|
| ST1 | Decision record, documentation, this plan's acceptance criteria confirmed | Primary agent | None |
| ST2 | Domain and persistence: the abbreviation field | Structural (Luna) | ST1 |
| ST3 | UI: abbreviation column on the Route tab | Structural (Luna), precisely specified below | ST2 |
| ST4 | UI: Direction and Day toggles in the scope bar | UI design (Sol) | ST2 |
| ST5 | Closeout: full browser suite, documentation check | Primary agent | ST3, ST4 |

ST3 and ST4 own separate files and may run in either order. Each package ends at a verification gate. Do not start the next package automatically.

## Read first (every package)

`AGENTS.md`, `codex.md`, `architecture_overview.md`, `docs/ui-conventions.md`, `docs/data-schema.md` (ServiceDayDefinition), Decisions 0002, 0011, 0017, 0039, 0041, 0047, and the decision record written in ST1.

---

## ST1: Decision record and documentation

**File ownership:** `docs/decisions/0059-scope-toggles-and-service-day-abbreviations.md` (new), `docs/data-schema.md`, `docs/ui-conventions.md`, `docs/domain-glossary.md`, this plan.

**Work:**

1. Write Decision 0059 recording U1 to U4 and R1 to R7.
2. In `docs/data-schema.md`, add `abbreviation?: string` to ServiceDayDefinition, with the rules of R1 to R3.
3. In `docs/ui-conventions.md`, change the scope selector paragraph: Day and Direction on Trips, and Day on Blocking, are segmented toggles with a `<select>` fallback (R7). They have no visible label; their `aria-label` is "Day" or "Direction" (U5). This is an exception to the rule that the `aria-label` equals the visible label.
4. In `docs/domain-glossary.md`, add "Service day abbreviation".

**Acceptance:** documents agree with each other and with this plan. Verification: proofread only.

---

## ST2: Domain and persistence (structural)

**File ownership:** `src/domain/types.ts`, `src/domain/serviceDays.ts` and its test, `src/application/routeDefinitionService.ts` (service day update and validation only) and its test, `src/persistence/backup.ts` and its test, and the scenario-copy code in persistence and its tests. No UI files.

**Work:**

1. `ServiceDayDefinition` gains `abbreviation?: string`.
2. In `src/domain/serviceDays.ts`, add pure functions:
   - `defaultServiceDayAbbreviation(day): string` (R2).
   - `serviceDayAbbreviation(day): string`: the entered value, or the default.
   - `normalizeServiceDayAbbreviation(value: string): string | undefined`: trims and capitalizes. An empty result returns `undefined`, meaning "use the default".
   - `validateServiceDayAbbreviations(days): ValidationFinding[]`: rule ids `serviceDay.abbreviationInvalid` and `serviceDay.abbreviationDuplicate`.
3. The existing service day update in `routeDefinitionService.ts` accepts `abbreviation`. It normalizes the value and refuses an invalid or duplicate value with the existing `ServiceDayValidationError`, as name edits are refused now. Clearing the value removes the stored field.
4. Backups: the schema version stays 10, because the field is optional. Export writes the field when present. Import validation accepts a missing field, and refuses a present field that fails R3 with a path in the message. If the reviewer finds a version bump is required for older app versions to reject new files, raise it at the gate rather than deciding it here.
5. Scenario duplication and import as copy carry the field (R5).
6. No IndexedDB migration. The field is not indexed.

**Tests:**

- Defaults for each standard type and for custom names, including names shorter than three characters and names with spaces or punctuation.
- Normalization, invalid values, and duplicates, including an entered value that clashes with another day's default.
- Service update round trip, clear-to-default, and refusal messages.
- Backup round trip with and without the field, and import of a version-10 backup written before this change.
- Scenario copy keeps the abbreviation.

**Verification:** focused tests while working, then `pnpm typecheck` and the full `pnpm test`. Existing backup and migration tests must still pass unchanged.

---

## ST3: Route tab abbreviation column (structural, precisely specified)

**File ownership:** `src/ui/route/RouteWorkspace.tsx` (Annual service days panel only), the route stylesheet rules for `.service-days-table`, and the related browser test.

**Requirements:**

1. **Column order:** Service day | Abbr. | Annual service days. The header reads "Abbr." with `title` and an accessible name of "Abbreviation".
2. **Width:** the panel and table keep their current outer width. The Abbr. column is wide enough for three capital letters plus padding. The Service day column takes the width given up.
3. **Input:** a text input with `maxLength={3}`, the same input style and commit behavior as the existing name input (commit on blur and on Enter; Escape restores the saved value). The placeholder shows the derived default in the existing placeholder color. `aria-label` is "Abbreviation for <service day name>".
4. **Errors:** a refused value shows the service's message in the same field-error position as name errors, and the input returns to the saved value.
5. **No new components** beyond reusing the existing service day name input pattern.

**Acceptance:** a planner can enter, change, and clear an abbreviation. A duplicate is refused with a message. The table width is unchanged at the desktop and 1100 px layouts.

**Verification:** typecheck, the full unit suite, a production build, the Route browser specs that cover this panel (`annual-days-blank.spec.ts`, `route-editing.spec.ts`), one new browser test for entering and refusing an abbreviation, and a visual check at desktop and 1100 px widths.

---

## ST4: Scope bar toggles (UI design)

**File ownership:** a new shared component `src/ui/shared/SegmentedControl.tsx` and its styles, `src/ui/App.tsx` (the Trips Day and Direction fields), `src/ui/blocking/BlockingWorkspace.tsx` (the Day field only), and the related browser tests.

**Requirements:**

1. **Component:** a segmented control with radio-group semantics: `role="radiogroup"` with `aria-label` "Day" or "Direction" and no visible label (U5). Each segment has `role="radio"` and `aria-checked`. Exactly one segment is selected.
2. **Keyboard:** Tab enters the group on the selected segment. Left/Right and Up/Down move and select, wrapping at the ends. Home and End go to the first and last segment.
3. **Labels:** a Day segment shows the abbreviation, and its tooltip and accessible name give the full service day name. A Direction segment shows the direction name.
4. **Order:** Day segments follow the existing `sortServiceDays` order. Direction segments follow direction `sequence`, as the current drop-down does.
5. **Behavior:** a switch goes through the same handlers as the current `<select>`, including `requestRouteNavigation` and its unsaved-draft prompt. A switch that the prompt cancels leaves the previous segment selected.
6. **Fallback (R7):** below the narrow-layout breakpoint already used by the scope bar, and for Direction when there are more than two directions, render the current `<select>` with its `aria-label` and without the visible `ContextField` label (U5).
7. **Visual (proposed; the design agent may refine within these tokens):**
   - One pill-shaped outline (`--radius-pill`) containing all segments, joined by 1 px dividers. Same height as the current `<select>`.
   - Selected segment: the existing `.toggle-button[aria-pressed="true"]` look (`--color-selection` fill, `--color-accent` border, `--color-accent-strong` bold text). Unselected: the normal button surface and text color.
   - Day segments have equal widths sized for three capital letters. Direction segments size to the longer direction name.
   - No visible label (U5). The two controls are separated by the scope bar's normal field gap. Hover, focus ring, and disabled states use the existing button tokens, in light and dark themes.

   ```text
   ( WKD | SAT | SUN | HOL )     ( Outbound | Inbound )
          ^^^ selected: tinted fill, accent border, bold
   ```

**Acceptance:** one click switches Day or Direction on Trips and Day on Blocking. The unsaved-draft prompt still appears. Keyboard and screen-reader behavior match item 2. The scope bar does not wrap at the desktop widths in the current layout tests.

**Verification:** typecheck, the full unit suite, a production build, visual inspection at desktop, 1100 px, and narrow widths in both themes, and the browser specs that use the Day and Direction selectors. Update selectors in existing tests from `getByLabel('Day')` on a `<select>` to the radio group where needed, without changing what those tests prove. Add tests for one-click switching, keyboard movement, the draft prompt, and the fallback.

---

## ST5: Closeout

**Owner:** primary agent.

1. Review ST2 to ST4 together for consistency with Decision 0059.
2. Update `architecture_overview.md` if the shared component or the service day data flow is worth noting there.
3. Run `pnpm typecheck`, the full `pnpm test`, `pnpm build`, and the full browser suite (`pnpm test:ui`). The full suite is required because ST4 changes a shared scope-bar component.
4. Report results and mark this plan complete.
