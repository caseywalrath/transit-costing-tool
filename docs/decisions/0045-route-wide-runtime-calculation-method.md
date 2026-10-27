# Decision 0045: One Runtime Calculation Method per Route, and Runtime Paste Removed

- Status: Accepted and implemented
- Date: 2026-10-27 (user request: Option A, setting kept in Runtimes)
- Annotates: Decision 0032 (the method is a profile input), Decision 0033 (the `segmentStart` method), Decision 0035 item 1 (Runtime profile CSV and the default method)
- Supersedes: the Runtime table paste and Runtime profile CSV import workflow (`docs/implementation/runtime-table-paste.md`)

## Context

The calculation method ("Single band for trip", "Band at segment start", or the legacy continuous blend) was stored on each Runtime profile, and each profile belongs to one Pattern. One Trips table holds the Trips of several Patterns, so a trunk Pattern could be calculated with one method and its branch with another. A planner never wants that, but nothing prevented it, and older profiles without a stored method read as single band while new profiles default to segment start.

## Decision

1. Every Runtime profile of a Route uses the same calculation method. The method therefore applies to every Pattern, Direction, service day, and Trip Profile of the Route.
2. The method stays stored on each Runtime profile (`calculationMethod`), and the application keeps the profiles of a Route in agreement. No Route field is added, so the record shapes and the JSON backup schema (6) do not change, and the calculation, staleness, and shading code keeps reading the profile it already reads. The Route's method is derived: `routeRuntimeCalculationMethod` in `src/domain/runtime.ts`.
3. Writes keep the rule:
   - `setRouteRuntimeCalculationMethod(routeId, method)` changes every profile of the Route in one write. `getRouteRuntimeCalculationMethodImpact` reports the profiles that change and the Trips calculated from them.
   - `saveRuntimeProfile` that changes a profile's method changes every profile of the Route in the same write. Any other save keeps the method the Route's other profiles use.
   - A new Default profile takes the Route's method. Profile copies and reverse copies keep their source's method, which is the Route's.
4. A profile whose method changes gets the next calculation revision, so its Trips show **Run Times Have Changed**. Saved Trip times are not rewritten; the planner regenerates them (Decisions 0032 and 0033).
5. Existing data with mixed methods on a Route is unified to the method most of the Route's profiles use. A profile without a stored method counts as single band. A tie goes to segment start, then single band, then the legacy blend. A Route with no profiles uses segment start (Decision 0035 item 1).
   - Dexie version 9 changes no store; its upgrade applies this rule and writes only the profiles that change. A failure logs a warning and leaves the data as it was (the version 7 pattern).
   - JSON backup import applies the same rule. The import report counts the changed profiles (`unifiedRuntimeProfiles`).
6. The setting stays in the Runtimes section: **Actions > Method (all Patterns on this Route)**. The checked item is the Route's method, whichever Pattern is selected. Choosing the other method opens a confirmation that names the Route and states how many Runtime profiles change and how many Trips will be marked as having changed run times. The choice is unavailable while the Runtime editor has unsaved edits.
7. Runtime table paste (**Actions > Paste rows…**) and Runtime profile CSV import (**Actions > Import profile CSV…**, which opened the same dialog) are removed, with their parser. Runtime profile CSV export remains; it is output only.

## Consequences

- One Trips table can no longer mix calculation methods.
- Changing the method on one Route can mark Trips on every service day and Trip Profile of that Route as having changed run times.
- A planner whose Route held mixed methods sees the minority profiles' Trips marked as having changed run times after the first open of the new version or after importing such a backup.
- Runtime bands are entered in the editor or copied from another profile or day; they can no longer be pasted from a spreadsheet.
- `restoreFormulaText` has no production caller; it stays with its tests in `src/persistence/csv.ts` for a future importer.
