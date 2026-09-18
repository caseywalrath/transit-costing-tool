# UI Conventions

## Phase 3R acceptance

The Runtime and Trip header-action conventions below are implemented and accepted through Phase 3R. They retain separate Runtime and Trip scopes, preserve the existing shared workflow-section system, and do not establish a convention for top-level Scenario/Data menus or Route-tab Node/Pattern menus.

> Phase 2R is replacing the original Phase 2 trip-generation conventions below. Package 2R-B has established the structural direction and runtime contracts; Terra must replace the generation-set/materialized-schedule wording and interaction rules in the Phase 2 sections during Package 2R-D. The Phase 2 text is retained as historical implementation context until that package is accepted.

## Phase 1 route definition

- Dense tables commit text and numeric edits on blur. This avoids local-save writes racing with active keyboard entry. Enter commits numeric values; Escape restores the saved value. Select changes and explicit actions commit immediately.
- Numeric fields retain their last saved value when blank or invalid input is left in the field, show an announced inline error, and treat zero as a valid value.
- Wide tables scroll horizontally on narrow screens. The left identifying column remains frozen on desktop table scroll.
- Node and pattern-point removal always uses a modal confirmation. Node removal states when it also removes references from patterns.
- Pattern point order uses visible up and down controls. Repeated node selections are valid and are described in the empty state. Add-node and add-point actions appear after their respective lists, preserving an uninterrupted entry sequence.
- Validation is calculated by the domain layer, but message keys and rule identifiers are never shown to users. Findings are translated into concise planner-facing text. Route-level findings appear with the affected field. New blank node and pattern drafts use a required-field placeholder rather than immediate validation messages; validation remains available to later workflow checks.
- Future-phase tabs are disabled with an explanatory title; they do not imply unavailable or missing route data.
- New Project is the single, visually prominent project-creation action. The blank-project view provides only concise orientation text.
- Project, scenario, duplicate-scenario, and reverse-pattern names use compact in-app dialogs. Required-name feedback is visible, Enter submits, and Escape cancels. Dialogs without a visible field label retain a screen-reader label. Reverse creation collects a name and completes directly without a separate confirmation.
- Compact destructive actions in tables use a subtle trash icon with an accessible name and tooltip. The destructive confirmation continues to state the effect before the record is removed.
- The selected project, scenario, and route are stored as non-authoritative browser UI preferences. On startup, each identifier is checked against current local records and safely falls back when a saved selection no longer exists.

## Phase 2R safe route editing

- Nodes are edited as a local table draft. **Save nodes** is the only write action. Pending deletion rows state **Will be deleted** and offer **Undo**; **Discard changes** returns the saved collection.
- Patterns are edited one at a time as a local draft. A new, duplicated, or reverse Pattern is marked **Unsaved** and does not change Runtimes or Trips until **Save Pattern** succeeds. **Save Pattern** and **Discard changes** are disabled when the selected Pattern has no unsaved edits. New Nodes are not available in a Pattern selector until their Node draft is saved.
- The **Add pattern** action is placed at the bottom of the Pattern list so the list reads top-to-bottom as existing Patterns followed by the creation action.
- Changing the Route, project, scenario, primary tab, or adding a route while a Node or Pattern draft is dirty opens **Save route changes before leaving?** with **Save**, **Discard**, and **Cancel**. Save follows the ordinary impact review; Pattern work is resolved before Node work.
- Deterministic Pattern structure changes open a **Save and rebalance** decision. New inserted points receive their predecessor's scheduled time and a zero first segment; removing an intermediate point merges the adjacent runtime segments.
- A reordered or broadly replaced Pattern opens the destructive **Save and reset service** decision. It removes only profiles, assignments, trips, historical generation records, and revenue-trip block activities owned by that Pattern. Empty blocks remain.
- A timetable-order conflict appears beside **Save Pattern** and names the conflicting Patterns and timepoints. It is not a global banner and cannot be overridden by deleting service.

## Phase 2 runtime editor

- The Trips tab becomes available after the selected route contains a pattern with at least two points. The page retains the existing project, scenario, and route context controls.
- The shared workspace row always shows Route. On Trips, it also shows Day and Direction. The Route tab shows neither Day nor Direction because Pattern editing owns direction assignment. Future Blocking will use Trip Profile, Blocking Scenario, and Day but not Direction. Runtime Pattern and both Profile controls belong to their respective workflow-section headers.
- Runtime bands are compact table rows. The left band-name column remains frozen; segment columns scroll horizontally as needed. Segment headers show the originating and destination node names rather than identifiers.
- Profile edits are local to the editor until the user selects **Save**. This permits an incomplete new row or temporarily invalid band boundary without persisting unusable data. The Runtimes header keeps **Add** visible. **Discard** and **Save** appear immediately after it only when the editor is dirty. The domain validator supplies planner-facing findings at save time.
- Runtime time and duration fields use 24-plus `H:MM` input. Blur and Enter commit a valid value; Escape restores the previous value. A blank duration states that a runtime is required and that zero remains valid.
- New and copied profiles are explicitly named in a dialog. A copied profile is independent and is assigned to the current service day. Reverse-copy is offered only for a compatible reversed node sequence; it identifies the target pattern and states that segment runtimes will be reversed.
- No generated trips exist at this package. Band-boundary edits therefore do not claim a trip impact. The later trip-generation workflow will surface departures that fall into intentional runtime gaps.
- When there is no usable pattern, the Trips tab explains the prerequisite instead of exposing an incomplete editor.

## Shared workflow and table hierarchy

- A full-page planning workflow uses vertically stacked `workflow-section` panels. Service, Runtimes, Trips, and future Blocking and Costing panels use the same white background, neutral border, compact 12px padding, and thin dark-blue top rule.
- Each workflow section has one compact header area for its title, supporting instruction, and actions. Do not add a second ordinary card inside a workflow section solely to contain the controls or table.
- A dense table is a `data-grid` viewport: it has a neutral one-pixel frame, horizontal scrolling when required, and an 8px separation from the preceding content. The grid frame contains the table header and body; its grey header is not a competing section boundary.
- Notices, prerequisites, and destructive-impact messages use an accent treatment only when they communicate state. They are not substitutes for ordinary workflow sections or data-grid frames.
- New UI elements must use these roles before introducing a new bordered box style. A different container treatment requires a functional reason, such as a modal decision, a nested list/detail editor, or a state-specific notice.
- Runtimes and Trips use one upper-right header action layer. A Profile menu lists saved profiles first, marks the selected Profile, and separates lifecycle commands from selection. Runtime Pattern remains a native labeled selector because it is Pattern-owned. Runtime Day copy is Route-wide and stays in Runtime **Actions**.
- The Trips **Actions** menu order is Build trips, Add trip, Regenerate selected, Shift selected, Change pattern, Copy from day, and Delete selected. Selection-dependent commands remain visible and disabled with an explanation. The row trash icon and bulk Delete use the same impact-aware deletion confirmation.
- When saved trips use earlier runtimes, `Run Times Have Changed` remains visible immediately above the table. A visible `Run times changed` note marks each affected row, and **Regenerate selected** is enabled only when an affected row is selected.
- Shift opens a non-modal drawer docked to the right edge of the application. `Back` and `Forward` create transient signed minute operations; Undo and Redo apply only to that drawer operation sequence. The table shows the staged times and text status before **Done** makes one atomic write. **Discard**, Close, or Escape write nothing. Route, Day, Direction, Trip Profile, tab, and selection changes request discard before changing scope. A stale preview requires discard and reopening Shift.
- Target-first copy dialogs keep the selected Day fixed, name the affected scope once, and require a preview before commit. Destructive empty-source Trip copies require an explicit clear-target acknowledgement and use the destructive confirm treatment.
- Batch actions retain checked rows on cancel and return focus to their trigger. A reviewed batch preview names every selected record as eligible or ineligible; confirmation is unavailable when any selected record is ineligible.

## Phase 2 trip building

- The Trips workspace is vertical: the runtime editor remains first, the generation-set editor follows it, and the combined materialized schedule is last. This keeps the runtime prerequisite visible while making the generated schedule the working surface.
- The generation-set editor names and selects a saved set, then exposes pattern, first departure, headway, and one explicit generation limit. The end-time option is labeled **Inclusive end time** so a departure at that time is expected. Existing sets are loaded into the editor; choosing one prepares its next generation revision locally and does not write until confirmation.
- Generation and regeneration always open a preview dialog. The dialog summarizes additions, changes, removals, overridden shifts or pattern changes, and affected future block references before it offers a confirm action. Escape and Cancel close the dialog without a write.
- The combined schedule selects one service day and interlaces all trips in the selected direction. When patterns share a timetable column, rows sort by the earliest common timepoint; schedules without a common column fall back to initial departure. It uses fixed compact summary columns and reveals scheduled points through a per-trip detail row instead of creating unlimited timepoint columns. This keeps alternating, staggered, short, and full-length patterns visible in one table without doubling long schedules by default.
- Multi-trip selection uses visible checkboxes in the frozen first column. A signed whole-minute shift is applied to all checked trips. Keyboard users can operate each native checkbox and retain table focus after the schedule reloads.
- Pattern changes are individual-trip actions. The user chooses a target pattern, then sees old and recalculated timepoints in a second preview before confirmation. The target pattern must have a runtime profile assigned for the current service day.
- Generated trips show **Generated**. Shifted and pattern-changed trips show an amber status marker with an explanatory label. The otherwise reserved Block column displays only a read-only future label or **Unassigned**; this package provides no blocking controls.
- All trip time fields, summaries, and previews use shared 24-plus service-time formatting. The schedule never converts after-midnight service to a wrapped clock time.
