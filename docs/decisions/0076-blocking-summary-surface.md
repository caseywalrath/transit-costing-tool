# Decision 0076: Blocking Summary Surface and Blocking Scenario Field Menus

- Status: Accepted (user decision of 2026-11-12); implemented (BSS1 to BSS5, 2026-11-12), awaiting user acceptance
- Date: 2026-11-12
- Plan: `docs/implementation/blocking-summary-surface.md` (packages BSS1 to BSS5)
- Supersedes: Decision 0053 item 4 for the Blocking tab (the scope-bar Actions menu holds Blocking Scenario commands)
- Related: Decision 0047 (interface revision), Decision 0053 (Blocks surface Actions), Decision 0055 and 0057 (Auto-blocking, Default Blocking Scenario), Decision 0066 (context menus; Category E listed "Blocking scenario switcher" as Consider)

## Context

On the Route and Trips tabs, the scope-bar Actions menu acts on the Route. On the Blocking tab, the same menu ("Blocking actions") holds Blocking Scenario commands: New, Auto-blocking, Duplicate, Rename, Delete, and Export blocking CSV (ZIP). The same button therefore means different things on different tabs.

The Blocking tab also shows its overview last. The order is Unassigned trips beside Current block, then the "[Day] summary" support panel, then the Blocks table. The planner sees the details before the totals.

The Trips tab already has the pattern this decision adopts. Its Trip profile is a field menu (`MenuButton` with `fieldLabel`) on the Trips surface. The menu lists the profiles and holds their lifecycle commands (Rename, Copy, Delete). The Trips Blocking scenario field menu beside it lists Blocking Scenarios only, so the two menus in one header behave differently.

## Decision

1. **One surface.** The Blocking tab gains a level 1 work surface, **Blocking summary**, placed above the `.blocking-top` grid (Unassigned trips and Current block). It replaces both the "[Day] summary" support panel (`SummaryPanel`) and the separate Blocks work surface. Its body holds, in order: the all-day factors line ("All days, weighted by annual service days: layover X% · deadhead Y%"), the ten-cell stat strip, the Blocks selection bar (while Blocks are checked), and the Blocks table.
2. **Title.** The title is "Blocking summary · {Service day name}", for example "Blocking summary · Weekday". The count beside the title is the number of Blocks on that day. The region's accessible name stays "Blocking summary".
3. **Blocking scenario field menu.** The header context holds a field menu labeled "Blocking scenario". It replaces the native `<select>` in the scope bar. Its trigger shows the selected scenario's name, or "Select blocking scenario" when none is selected, and its accessible name is "Blocking scenario: {name}". The menu (`menuLabel` "Blocking scenario") holds:
   - group "Blocking scenarios": every Blocking Scenario of the selected Trip Profile, the selected one checked;
   - New blocking scenario…, Auto-blocking…, Duplicate blocking scenario…, Rename blocking scenario…, Delete blocking scenario… (destructive);
   - group "Data": Export blocking CSV (ZIP).
   The item labels, order, enablement, and dialogs stay as they are today.
4. **Blocks actions.** The header's Actions menu is the existing "Blocks actions" menu, unchanged (Copy blocks from another day…, Delete all blocks on {Day}…). Commands on the scenario sit in the field menu (all service days); commands on the day's Blocks sit in Actions (one service day).
5. **Scope bar.** On the Blocking tab, the scope bar holds Route, Trip profile, and Day only. It has no Actions menu. Trip profile and Day stay there because they also scope Unassigned trips and Current block.
6. **Placement rule (replaces Decision 0053 item 4).** The scope bar holds page-wide scope selectors and the commands on an object chosen in the scope bar. An object chosen inside a surface is chosen through a field menu that also holds that object's lifecycle commands. A surface's Actions menu holds commands on that surface's rows.
7. **Collapse.** Blocking summary is a disclosure surface (`WorkSurface` `collapse`, as Runtimes and Vehicle requirement use). It is open by default. The open state is stored per device as `{"open": boolean}` under `transit-costing-tool.blocking-summary-open.v1`. A missing or malformed value reads as open. Collapsed, the header stays visible with the title, count, Blocking scenario field menu, and Actions, and the subtitle shows one line of the day's figures: Revenue, Platform, Layover %, Deadhead %, Peak pullout. Open, the subtitle reads "Select a block name to open it".
8. **Table height.** The Blocks table scrolls inside the surface after about ten rows. Its header row and totals row stay visible while it scrolls. The page never scrolls sideways because of it.
9. **No selected scenario.** After a delete, the remembered or first remaining Blocking Scenario of the Trip Profile is selected, as on Trips; when none remains, the "Default" one that Decision 0057 creates is selected. (The former `<select>` only displayed its first option after a delete while nothing was selected.) When no Blocking Scenario is selected, the surface still shows its header, so the field menu with New and Auto-blocking is reachable. The body shows the current prerequisite text ("A blocking scenario is a named vehicle-blocking alternative…"). Unassigned trips and Current block are not shown, as today.
10. **Trips consistency.** The Trips Blocking scenario field menu gains New blocking scenario…, Duplicate blocking scenario…, Rename blocking scenario…, and Delete blocking scenario…, in the same order and with the same dialogs as Blocking. Its trigger's accessible name becomes "Blocking scenario: {name}". Auto-blocking… and Export blocking CSV (ZIP) stay on the Blocking tab only, because Auto-blocking reads the Blocking tab's minimum layover and both act on Blocks that the Trips tab does not show. Both tabs build the shared items and dialogs from one module, so they cannot drift.
11. **Unchanged.** No domain, application-service, persistence, schema, backup, or CSV change. Remembered Blocking Scenario choices (per Trip Profile, in Trips and in Blocking) keep their keys and meaning.

## Consequences

- The scope-bar Actions button means "actions on the Route" wherever it appears.
- The Blocking tab reads from overview to detail. Collapsing the surface returns the space to editing while keeping the key figures and the scenario choice visible.
- Browser specs that used the scope-bar `combobox` "Blocking scenario" or the "Blocking actions" button change to the field menu. They reach it through `tests/ui/support/ui.ts`.
- A Blocking Scenario can be created, copied, renamed, or deleted from Trips without visiting Blocking.
- Decision 0066 Category E "Blocking scenario switcher" is done by this decision. Per-item context menus on the scenario list are not included.
