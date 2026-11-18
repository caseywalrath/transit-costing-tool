# Decision 0082: Chooser Styles

- Status: Accepted (user, 2026-11-18)
- Date: 2026-11-18
- Related: Decision 0059 (scope toggles), Decision 0076 (field menus), Decision 0081 (context line), `docs/ui-conventions.md` ("Choosers")

## Context

Controls that pick one item from a list used three styles without a stated rule. The header switchers (Project, Scenario) are menu buttons; Route is a native select; the Planned frequencies Service day was a menu button holding only choices, while the Trips Day, which picks the same kind of item, is a segmented toggle. The user asked whether the differences were intended.

## Decision

1. **The content decides the style, not the location.** A chooser whose menu also holds commands on the chosen item is a menu-button switcher. A chooser with only choices is a segmented toggle when it has two to four short options, otherwise a native select in `ContextField`.
2. **No workarounds.** A chooser does not hold commands as fake options ("+ New route"), and a separate Actions button does not carry the commands of the item a chooser picks.
3. **Planned frequencies Service day** becomes a segmented toggle of the day abbreviations (a select beyond four days), with no visible label. Implemented 2026-11-18.
4. **Route** becomes a switcher in the switcher style, as the first scope field after the breadcrumb's divider, not a breadcrumb level (Route and Trip profile are both parts of the Scenario; neither contains the other). Its menu has type-ahead. It holds the Route commands (New, Rename, Duplicate, Export CSV, Delete) on the Route tab only: Routes are created, edited, and deleted only there; on Trips and Blocking the menu lists the Routes alone. The Route actions button and the "+ New route" option are removed. Implemented 2026-11-18 at the user's instruction; type-ahead is in the shared menu keyboard handling (`moveMenuFocus`), so every menu has it.

5. **Review of the other choosers (2026-11-18).** Runtime profile holds its commands (New, Rename, Copy, Reverse-copy, Delete) and complies; the Runtime actions menu holds route-wide settings, not profile commands, and stays. The Blocking **Current block** menu lists only Blocks while Rename block, Edit notes, and Delete block sit in the "Current block actions" menu; it did not comply. Implemented 2026-11-18: the Current block menu lists the Blocks, then New block…, Rename block…, Edit notes…, and Delete block…, as Runtime profile does; the separate actions menu is removed and the visible New block button stays as a frequent action.

## Consequences

- `docs/ui-conventions.md` gains a "Choosers" rule that later panels follow.
- Item 4 replaces about 30 browser-spec `selectOption` calls on the Route field with a shared helper.
- A menu-button chooser that holds no commands (found in review) is converted under item 1.
