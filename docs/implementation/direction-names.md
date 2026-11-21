# Direction names: work order plan

- Requested by the user on 2026-11-20: Federal BRT's Inbound direction is Northbound, and other routes use Eastbound/Westbound or Clockwise/Counterclockwise.
- Rules: Decision 0088 (`docs/decisions/0088-direction-names.md`). Where this plan and the decision differ, the decision governs and the difference is reported to Opus.
- Branch: `claude/sweet-allen-m3vw3x`, unless the user names another. Do not push to any other branch. Do not open a pull request unless the user asks.
- **Orchestration: Opus** (primary agent). Opus briefs the Haiku package from this plan, reviews its diff, resolves its questions, does the UI package, and runs the final verification.
- **Structural package: Haiku** (structural class, Luna): DN1. Haiku follows this plan literally. Where this plan does not say what to do, or a fact in section 3 no longer holds, Haiku stops and reports the question to Opus.
- Do not start the next package automatically. At each gate, report the result to the user and recommend the next package and model.

## 1. Summary

Each Route's two directions get editable display names, entered in Route details. The fixed `outbound`/`inbound` group stays the identity. There is no stored-data change: the existing `RouteDirection.name` field holds the name. Route details is rearranged into a two-column grid so it is no taller than Annual service days.

## 2. Settled decisions (user, 2026-11-20)

| Question | Answer |
|---|---|
| Rename or alias | Display name only; the group never changes |
| Placement | Route details on the Route tab |
| Height | Route details no taller than Annual service days |

## 3. Code facts this plan depends on (verified 2026-11-20 at `615a970`)

| Fact | Location |
|---|---|
| `RouteDirection { id; scenarioId; routeId; name; group?: 'outbound' \| 'inbound'; sequence; columns }` | `src/domain/types.ts:17-26` |
| `directionGroupName(group)` returns "Outbound" or "Inbound". | `src/domain/directions.ts:8` |
| `createManagedDirections` (line 90) and `ensureManagedDirections` (line 101). `ensureManagedDirections` sets `name: directionGroupName(group)` on a matched record (line 110). | `src/domain/directions.ts` |
| `ensureManagedDirections` callers: draft helpers (520, 533) and `managedAggregate` (1608). `updateRoute(aggregate, patch)` saves through `saveAggregate` (1821). `RouteDefinitionApplication` union at 1830. | `src/application/routeDefinitionService.ts` |
| Backup import requires `direction.name` to be a string; no schema change is needed. | `src/persistence/backup.ts:472` |
| `directionAbbreviation(name)` maps "Northbound" → "NB" and is used by generated pattern short names. | `src/application/shortNames.ts:24` |
| Route details: one `field-grid route-details-fields` with Route name, Short name, Description, each committing on blur through `onRoute`. Annual service days is the next `SupportPanel`. | `src/ui/route/RouteWorkspace.tsx:281-282` |
| `.route-details-fields { grid-template-columns: minmax(0, 1fr) }`; `.route-top-grid` columns `.8fr .8fr 1.4fr` above 1100 px. | `src/ui/styles/route.css:15-17`, `:59` |
| Measured at 1440 px with a new route: Route details 367 × 239 px (including a "Enter a route name." error line), Annual service days 367 × 261 px, Planned frequencies 642 × 163 px. At 1200 px both narrow panels are 303 px wide. At 1024 px the panels stack. | Playwright measurement, 2026-11-20 |
| Fixed group words in UI: `groupTitles` in the auto-blocking dialog (line 248); the minimum layover dialog's `directionGroupName(group)` labels (line 712) and "After {group} trips" (line 714). | `src/ui/blocking/AutoBlockingDialog.tsx`, `src/ui/blocking/BlockingWorkspace.tsx` |
| Scripts: `pnpm typecheck`, `pnpm test`, `pnpm build`. Browser: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test <spec> --trace off`. | `codex.md` |

## 4. DN1: Domain and service (Haiku)

Files: `src/domain/directions.ts`, `src/application/routeDefinitionService.ts`, `src/domain/directions.test.ts`, `src/application/routeDefinitionService.test.ts`.

1. **`src/domain/directions.ts`.**
   - Add `export const MAX_DIRECTION_NAME_LENGTH = 40;`.
   - Add:
     ```ts
     /** The name to store for a group: the trimmed name, or the group's default when blank. */
     export function directionDisplayName(group: DirectionGroup, name: string | undefined): string
     export type DirectionNameProblem = 'tooLong' | 'sameAsOther';
     /** Checks a proposed name against the Route's other direction. Returns undefined when it may be saved. */
     export function directionNameProblem(group: DirectionGroup, name: string, directions: readonly RouteDirection[]): DirectionNameProblem | undefined
     ```
     - `directionDisplayName`: trim; blank → `directionGroupName(group)`.
     - `directionNameProblem`: compute `directionDisplayName(group, name)`. Longer than `MAX_DIRECTION_NAME_LENGTH` → `'tooLong'`. Equal, ignoring case, to the display name of the record with the other group → `'sameAsOther'`.
   - In `ensureManagedDirections`, line 110: when `matched.group === group` and `matched.name.trim()` is not blank, keep `matched.name`; otherwise use `directionGroupName(group)`. Nothing else in the function changes.
2. **`RouteDefinitionService.renameDirection`.**
   ```ts
   async renameDirection(aggregate: RouteDefinitionAggregate, group: DirectionGroup, name: string): Promise<RouteDefinitionAggregate>
   ```
   - Normalise directions with `ensureManagedDirections` (as `managedAggregate` does).
   - Call `directionNameProblem`. On a problem, throw `Error` with:
     - `tooLong`: "A direction name can have at most 40 characters."
     - `sameAsOther`: "Each direction needs its own name."
   - Otherwise set the record's `name` to `directionDisplayName(group, name)` and `updatedAt` to `this.now()`, and save through `saveAggregate`. When the stored name is already equal, return the aggregate without writing.
   - Not covered by a restore point. Add `'renameDirection'` to the `RouteDefinitionApplication` union.
3. **Tests.**
   - `directions.test.ts`:
     - `ensureManagedDirections` keeps "Northbound" on an `inbound` record;
     - it writes "Inbound" for a blank name and for a legacy record without a group;
     - `directionDisplayName` trims and falls back;
     - `directionNameProblem` reports `tooLong` at 41 characters, `sameAsOther` for "northbound" against "Northbound", and `undefined` for a blank name.
   - `routeDefinitionService.test.ts`:
     - renaming Inbound to "Northbound" is stored and survives a reload of the aggregate, and a later `updateRoute` keeps it;
     - the record's `id` and `group` are unchanged;
     - a blank name stores "Inbound";
     - a name equal to the other direction's is refused and nothing is written.

### Commit and gate

`DN1: Direction names kept and renamed by group (Decision 0088)`. Run `pnpm typecheck`, the two test files, then `pnpm test`. Opus reviews and starts DN2.

## 5. DN2: Route details and the blocking dialogs (Opus, UI)

Files: `src/ui/route/RouteWorkspace.tsx`, `src/ui/App.tsx` (wiring only, if the rename handler lives there), `src/ui/styles/route.css`, `src/ui/blocking/AutoBlockingDialog.tsx`, `src/ui/blocking/BlockingWorkspace.tsx`, a new spec `tests/ui/direction-names.spec.ts`.

1. **Route details layout** (`.route-details-fields`): two columns, `minmax(0, 1.6fr) minmax(0, 1fr)`.
   - Row 1: Route name, Short name.
   - Row 2: Description, `grid-column: 1 / -1`.
   - Row 3: a sub-grid of two equal columns with **Outbound name** and **Inbound name**, spanning both columns.
   - Acceptance: at 1440 px and 1200 px, Route details is no taller than Annual service days, with and without the route name error. At 1024 px the stacked panel keeps the same grid.
2. **The two name fields.**
   - `defaultValue` is the stored name. The placeholder is the default ("Outbound" or "Inbound"). One shared `<datalist>` offers Northbound, Southbound, Eastbound, Westbound, Clockwise, Counterclockwise.
   - Commit on blur and on Enter through `renameDirection`. A refusal shows under the field (the Route details error style) and restores the stored name.
   - Title text: "Shown on the Trips tab, in tables and in exports. The direction's role in schedules and blocking does not change."
3. **Blocking dialogs** (Decision 0088 item 9).
   - A helper in `src/domain/directions.ts` (Opus may add it): `sharedDirectionName(group, directions)` returns the one display name used by every Route in scope for that group, or undefined when Routes differ or all use the default.
   - Auto-blocking group headings and the minimum layover labels show "Outbound (Southbound)" when that helper returns a name, else "Outbound".
4. **Spec** (`tests/ui/direction-names.spec.ts`):
   - rename Inbound to "Northbound" in Route details, reload, and see it in the field, in the Direction toggle, and in the Pattern Direction picker;
   - a generated pattern chip on the Trips tab changes to the "NB" abbreviation;
   - typing the Outbound name into Inbound is refused with the message and the field reverts;
   - clearing the field restores "Inbound".
5. **Checks.** Screenshots of the Route tab top row at 1440, 1200 and 1024 px, and measured heights in the commit message. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, the new spec, and `route-editing.spec.ts` and `route-grid.spec.ts`.

## 6. Gate C (user)

On Federal BRT, set Outbound name to "Southbound" and Inbound name to "Northbound". Check the Trips tab Direction toggle, side-by-side view, pattern chips, and the stop schedule export.

## 7. DX: Documentation and closeout (Opus)

- `architecture_overview.md` (direction groups paragraph), `docs/ui-conventions.md` (Route details layout), `docs/domain-glossary.md` (Direction name vs. direction group).
- Decision 0011: add "Superseded in part by Decision 0088" to its status line. Decision 0088 status "Accepted and implemented".
- `codex.md` dated status line; closeout file `docs/implementation/direction-names-closeout.md`.
- Full browser suite; push; report and stop.

## 8. Out of scope

- More than two directions per Route.
- Renaming pattern names that start with the old direction name.
- Writing the name into a GTFS export's `trip_headsign`.
