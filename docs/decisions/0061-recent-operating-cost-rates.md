# Decision 0061: Recent Operating Cost Rates

- Status: Accepted and implemented (2026-11-06)
- Date: 2026-11-06 (user request)
- Related: Decisions 0027 (cost basis and rate year), 0060 (per-viewer preferences)

## Context

Planners compare several operating cost per revenue hour figures and retype them. The Costing assumptions hold one rate, its rate year, and its source.

## Decision

1. **Combobox.** The rate box is an editable combobox: a text box (digits and one decimal point) with a ▾ button. The button opens a list of recent rates, newest first. Typing does not filter the list. The button is disabled, with a title, while the list is empty.
2. **Entries are triples.** Each entry holds the rate, its rate year, and its source. The list shows "$185.00 · 2024 · User entered". Picking an entry sets all three fields as unsaved changes; nothing is saved until **Save assumptions**.
3. **When recorded.** An entry is recorded when the assumptions are saved with a rate. An identical entry moves to the top instead of repeating. The list keeps the newest 10.
4. **Stored in the browser.** The list is in `localStorage` under `transit-costing-tool.costing-rate-history.v1`, shared by all projects in that browser. It is not Scenario data and is not in backups. Malformed stored entries are dropped when read.
5. **Keyboard.** ArrowDown (or Alt+ArrowDown) opens the list, ArrowUp and ArrowDown move, Enter picks, Escape closes. The input is named "Operating cost per revenue hour in USD".

## Consequences

- No new action, panel, or stored project field is added.
- A different browser or a cleared browser has an empty list.
- The input is text rather than a number field, so negative values cannot be typed; the "0 or more" validation message remains for values from other paths.
