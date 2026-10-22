# Phase 5 Findings: UI, UX, and Accessibility

- Status: Complete. Gate report pending user review.
- Baseline: `main` at `baed9f1`; review branch `claude/upbeat-ritchie-51mpy5`.
- Operating model: plan Section 4.6 (amended). The review lead orchestrated directly.
  - Haiku H2 produced the destructive-action, message, and dialog inventories.
  - Sonnet browser analysts:
    - B2: test integrity and Trips table behaviors.
    - B3: walkthroughs, Costing presentation, and destructive actions.
    - B4: keyboard, focus, axe, and discard guards.
    - B1: the 2-002 crash check.
  - Sonnet code readers R1–R5 answered the Phase 5 questions (5.5 code map, 5.9 messages) in the same pass as Phase 4.
- Verification by the review lead:
  - The lead re-ran all 17 Phase 5 browser reproductions (`p5-*.spec.ts`) and the Vitest reproduction. Each one fails at its asserted behavior; B4 also ran each without `test.fail` to confirm.
  - The lead confirmed these by reading code: `index.html` (5-013), R2-03 (5-006), B3-13 (5-008), B2-05 (5-018), and R3-02 (5-004).
- Evidence:
  - Browser: `docs/review/golden/p5-*.spec.ts`, run with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p5-playwright.config.ts` (port 4185).
  - Vitest: `p5-blocking-costing-rounding.golden.test.ts`.
  - Screenshots at 1024 px, plus 1440 and 768 px where a width-specific defect was suspected: `docs/review/findings/screenshots/phase-5/`.
  - Defect tests use `test.fail()`/`it.fails`, so they report as passing while the defect exists.
- UX class: every UI finding below is labeled **Luna-class** (fixable within established patterns) or **Sol-class** (needs design judgment), per `AGENTS.md`.

## 1. Task results

| Task | Verdict |
| --- | --- |
| 5.1 Browser test integrity | Every one of the 21 tests has a verdict (Section 3): 11 sound, 3 weak, 5 wrong-reason or fixture-based, 2 stale.<br>A-001 label experiment (the stale `Copy from day…` label changed to `Copy Trips from day…`): 4 of the 6 `unified-action-layer` failures then pass (`:83, :112, :140, :226`).<br>`:186` passes but has a helper race.<br>`:169` and `trip-table-layout.spec.ts:40` can never pass, because they assert the nested scroller that D0035-05 forbids (5-001).<br>The L-16 flakiness root cause is the `createShiftReadySchedule` helper race (`Add node` not yet rendered). |
| 5.2 Walkthroughs (1024 px) | Route, Trips, Blocking, and Costing were walked with the golden dataset. Deviations: 5-005, 5-007, 5-009, 5-015, 5-016, 5-019, 5-021, 5-022. The A-004 display effects were not redone (Phase 3 finding 3-006). |
| 5.3 Keyboard and focus | The 40-row interaction matrix is in the B4 report.<br>**Every modal dialog fails the focus-trap check** (5-010).<br>Dialogs opened from a menu lose their initial focus (5-010).<br>10 dialogs have no Escape (5-010).<br>Focus drops to `BODY` after Shift drawer steps and after confirms (5-012).<br>Costing dialogs, Block-assignment dialogs, and the Copy and Change-pattern dialogs return focus correctly. |
| 5.4 Accessible names and roles | axe-core 4.10.2 ran on 4 workspaces and 7 dialog or drawer states. After triage:<br>dialogs with no name (5-010);<br>`index.html` with no doctype, lang, or title, so the page renders in quirks mode (5-013);<br>an unlabelled file input, missing `h1`, a nested `main`, the `aria-allowed-role` rule, tables without `scope`/`caption`, and no `aria-invalid` (5-023).<br>Table header associations and `aria-invalid` were checked manually. |
| 5.5 Discard guards | Node and Pattern drafts are fully guarded, and so is Costing.<br>The staged Shift is guarded except on a Runtime Profile change, a Runtime save, and reload.<br>The Runtime editor draft, the Build Trips drawer, the Add-trip row, and Blocking dialog drafts are unguarded (5-004).<br>Saving Nodes discards an unsaved Pattern draft, and saving a Pattern discards unsaved Node edits (5-006). |
| 5.6 Trips table behaviors | **No defects found** in behavior, checked in the browser on the golden dataset:<br>the sticky duplicate header matches D0035-05 (19 column widths within 1 px, horizontal scroll synced, no nested vertical scroller);<br>scroll restoration after Done;<br>Round displayed times (472 cells at :30 all round up);<br>Show headways (1,193 cells match an independent computation; tie and skip rules hold);<br>band shading (60 of 65 reproducing Trips shaded, 5 not);<br>overlap warnings on both Trips;<br>signed change values;<br>staged-Shift undo/redo and net-zero discard.<br>None of these behaviors has a test (5-003). |
| 5.7 Destructive-action UX | 21 actions verified (table in the B3 report). One-click removals in Blocking (5-008). Missing impact counts and a generic "Confirm" label (5-009). |
| 5.8 Costing presentation | No-estimate versus $0: pass. Exclusions with reasons: pass. Column alignment: pass. AC2 and AC4: pass. 768 px: the table scrolls inside its frame, which passes.<br>**AC7 fails at 1024 px** (5-007).<br>When the estimate is invalid, the alert lists nothing (5-005).<br>The Total row is not the sum of the displayed rows, and nothing says so (5-019).<br>A-006 is not re-raised. |
| 5.9 Message quality | Rewrite categories only (5-029). The raw-text paths are Phase 4 finding 4-017 and Phase 3 finding 3-015. |

## 2. Findings

### 5-001: Two browser tests assert the nested schedule scroller that Decision 0035 forbids and can never pass

- Severity: S2
- Category: test-gap
- Location: `tests/ui/trip-table-layout.spec.ts:40`; `tests/ui/unified-action-layer.spec.ts:169`
- Governing source: D0035-05 "Do not create a nested vertical scroll area"; UI-31.
- Evidence:
  - `:169` sets `scrollTop` on `.schedule-table`. That element has no vertical scroll (`styles.css:97`), so the value is always 0.
  - `:40` asserts `position: sticky` inside a bounded region of the fixture.
  - Both fail in every run (A-001). The scratch label-fix run confirms that the label is not their cause.
  - Phase 1 finding 1-001 covers the overview side of the same contradiction.
- Confidence: Confirmed
- Verified by: Sonnet analyst B2; the lead re-checked against A-001 runs
- Fix scope: test-only. Rewrite both tests to assert the page-level duplicate header and page scroll restoration. Luna-class; 2 files.
- User decision required: no (plan Section 8.4 item 3 is already recommended: Decision 0035 governs)

### 5-002: Three layout tests assert hand-written fixture HTML instead of the app, and the fixtures no longer match the app

- Severity: S2
- Category: test-gap
- Location: `tests/ui/service-day-copy-layout.spec.ts:3`, `tests/ui/workflow-section-layout.spec.ts:3`, `tests/ui/trip-table-layout.spec.ts:30`, and the fixtures under `tests/fixtures/`
- Governing source: D0013 allows fixtures for geometry only. UI-23, UI-27, and D0018-04 define the header action layers.
- Evidence: `docs/review/golden/p5-fixture-drift.spec.ts`.
  - The fixture Runtimes header lists `Profile: Weekday ▾, Add, Discard, Save`, but the app renders `Weekday workbook runtimes ▾` only.
  - The fixture Trips header reads `Profile: Default ▾`, but the app renders `Default ▾, Workbook Blocks ▾`.
  - The draft-row test asserts classes that are written into the fixture, so it cannot fail.
- Confidence: Confirmed
- Verified by: Sonnet analyst B2; the lead re-ran the spec
- Fix scope: test-only. Luna-class; 3–4 files.
- User decision required: no

### 5-003: No test covers rounding, headways, band shading, the duplicate header, overlap warnings, scroll restoration, or net-zero Shift discard

- Severity: S2
- Category: test-gap
- Location: `src/ui/App.tsx:1402-1481` (ScheduleTable); `src/domain/trips.ts:114` (`calculateTimepointHeadways`, no unit test)
- Governing source: D0033, D0034, D0035; plan Section 4.3 ("report omissions as findings").
- Evidence: B2's test inventory. These behaviors pass in the browser today (Section 1, 5.6), but a regression would go undetected.
- Confidence: Confirmed
- Verified by: Sonnet analyst B2
- Fix scope: test-only; 2–3 files.
- User decision required: no

### 5-004: Runtime editor drafts, Build Trips input, the Add-trip row, and Blocking dialog drafts are discarded silently; a staged Shift is discarded silently on a Runtime Profile change or Runtime save

- Severity: S2
- Category: ux
- Location:
  - `src/ui/App.tsx:1241-1245` (`RuntimeEditor2` resets its draft whenever the profile changes) and `:1695`.
  - `:971-975` (the single `tripNavigationGuard` slot holds only the staged Shift).
  - `:809` (the effect that clears the staged Shift, selection, and Build drawer when `runtimeVersion`, the service day, the Direction, or the profile changes).
  - `:1177` (Pattern select), `:1146-1160` (profile menus), `:1179` (Runtime Save is not disabled while a Shift is staged).
  - `:405-412` (`beforeunload` covers only Node and Pattern drafts).
  - `src/ui/BlockingWorkspace.tsx` (no navigation guard).
- Governing source: `docs/ui-conventions.md:70` (a staged Shift is guarded on scope change); the discard-dialog convention used for Route drafts and Costing; D0018.
- Evidence:
  - `p5-b4-discard.spec.ts` (B4-10 to B4-13): a Runtime editor draft and Build Trips values are lost on all 9 switches tried; a Runtime Profile change discards a staged Shift without a dialog; reloading with a dirty Runtime editor raises no leave prompt.
  - R2-01, R2-02, R3-02, and R5-09 trace the same gaps in code.
  - No saved data is lost; only unsaved input is lost.
- Confidence: Confirmed
- Verified by: Sonnet analysts B4, R2, R3, R5; the lead re-ran the spec and read `:1241-1245`
- Fix scope: UI. Luna-class, reusing `ShiftDiscardDialog` and the Route discard pattern; 2 files.
- User decision required: yes. Should the Runtime editor and Build Trips drafts be guarded with Save/Discard/Cancel, as Route and Costing drafts are, or should their loss be accepted and documented? Recommendation: guard the Runtime editor draft and the staged Shift. Let Build Trips close without a prompt, but keep its values until the drawer is reopened.

### 5-005: The Service days editor accepts a total above 365 with no message, and Costing then shows an invalid state without listing the problem

- Severity: S2
- Category: ux
- Location: `src/ui/App.tsx:508`; `src/ui/CostingWorkspace.tsx:165,172,186-193`
- Governing source: PL05-AC3 "The count sum never exceeds 365 in new edits."
- Evidence: `p5-servicedays-365.spec.ts` (B3). Screenshot: `screenshots/phase-5/1024-costing-365exceeded.png`. After a total of 410 is saved, Costing shows:
  - "Total 410 / 365" and an "Invalid inputs" badge;
  - an alert that refers to "listed problems" without listing any (`result.findings` is never rendered; R1-03);
  - the "Enter a rate" subtitle and "No excluded Blocks".

  Phase A finding A-005 and Phase 4 finding 4-005 cover the missing validation. This finding is the UI side.
- Confidence: Confirmed
- Verified by: Sonnet analysts B3, R1; the lead re-ran the spec
- Fix scope: UI, Luna-class (field error pattern; render the findings list), together with the 4-005 structural fix; 2 files.
- User decision required: no

### 5-006: Saving Nodes discards an unsaved Pattern draft, and saving a Pattern discards unsaved Node edits

- Severity: S2
- Category: ux
- Location: `src/ui/App.tsx:375` (resets the Node draft on `aggregate.nodes`), `:378-384` (resets the Pattern draft on `aggregate.patterns`); `routeDefinitionService.ts:236,260` (`aggregateFromRecords` returns new arrays after every commit)
- Governing source: UI-19 to UI-22 (Node and Pattern drafts stay local until saved; they are discarded only through the discard dialog).
- Evidence: code trace (R2-03), confirmed by the lead.
  - The Pattern effect returns early only for a Pattern that does not exist yet (`:381`).
  - Edits to an existing Pattern are replaced by the saved copy when the aggregate reloads after a Node save.
  - Saved data is not affected.
- Confidence: Probable (traced, not driven in the browser)
- Verified by: review lead (code read), Sonnet analyst R2
- Fix scope: UI, Luna-class; 1 file.
- User decision required: no

### 5-007: The Costing results table overflows at 1024 px and hides the Annual Cost column

- Severity: S2
- Category: ux
- Location: `src/ui/CostingWorkspace.tsx:195`
- Governing source: `phase-05-costing.md` acceptance criterion 7 (usable at narrow widths).
- Evidence: B3 measured the table at 1,120 px inside a 960 px frame (`1024-costing.png`). It fits at 1440 px, and at 768 px it scrolls inside its frame. The existing test checks overflow only at 1440 px (5-017).
- Confidence: Confirmed
- Verified by: Sonnet analyst B3
- Fix scope: UI, Luna-class; 1–2 files.
- User decision required: no

### 5-008: Removing a Trip, Pull-out, or Pull-in from a Block is one click, with no confirmation and no undo

- Severity: S2
- Category: ux
- Location: `src/ui/BlockingWorkspace.tsx:209` (`removeActivity`), `:381`
- Governing source: plan task 5.7 ("no destructive action is one click"); UI conventions for destructive actions.
- Evidence: B3 in the browser (`1024-blocking-remove-trip.png`); the lead confirmed in code that `removeActivity` commits immediately.
- Confidence: Confirmed
- Verified by: Sonnet analyst B3; review lead (code)
- Fix scope: UI, Luna-class (`ConfirmDialog`); 1 file.
- User decision required: no

### 5-009: Delete Block and Delete Blocking Scenario show no impact counts; Delete Pattern's button reads "Confirm"

- Severity: S2
- Category: ux
- Location: `src/ui/BlockingWorkspace.tsx:316-317`; `src/ui/App.tsx:283`
- Governing source: plan task 5.7 (impact counts come from the application layer, and the button text names the action).
- Evidence: B3, browser and code. The impact of deleting a Blocking Scenario is returned only after the deletion, so there is no application-layer preview. Showing the counts first needs a small structural port.
- Confidence: Confirmed
- Verified by: Sonnet analyst B3
- Fix scope: UI, Luna-class, plus a structural preview method; 2–3 files.
- User decision required: no

### 5-010: Dialogs fail keyboard rules: no focus trap in any modal, menu-opened dialogs lose initial focus, 10 dialogs ignore Escape, and two Runtime dialogs have no accessible name

- Severity: S2
- Category: a11y
- Location:
  - `src/ui/MenuButton.tsx:45` (refocuses the trigger after a menu item opens a dialog, overriding `autoFocus`).
  - All 28 `aria-modal` dialogs (no focus trap).
  - No Escape: `App.tsx:1609, 1610, 1611, 1745, 1749, 1753` and `BlockingWorkspace.tsx:398, 404, 406, 409, 423`.
  - `App.tsx:1609-1610` (no `aria-labelledby`).
- Governing source: D0025-09 (focus returns to the invoker); the `phase-03r` and `phase-04` accessibility requirements; WAI-ARIA dialog pattern.
- Evidence: `p5-b4-keyboard.spec.ts` tests B4-01 to B4-04.
  - 10 to 16 of 16 Tab presses leave the open dialog.
  - Name dialogs opened from a menu leave focus on `BODY`, and Escape does nothing until the user tabs in.
  - axe reports `aria-dialog-name`.
- Confidence: Confirmed
- Verified by: Sonnet analyst B4; the lead re-ran the spec
- Fix scope: UI, Luna-class with a written spec (one shared dialog wrapper that handles focus, Escape, and the trap); about 3 files.
- User decision required: no

### 5-011: Staging a Shift earlier than 0:00 crashes the whole app

- Severity: S2
- Category: correctness
- Location: `src/ui/App.tsx:1481` (`formatTripTableClock` → `formatServiceTime`, `src/domain/time.ts:3`, which throws on a negative value); there is no React error boundary
- Governing source: D0002 (service times are non-negative); Phase 2 finding 2-002 (the domain-side root cause).
- Evidence: `p5-trip-shift-negative.spec.ts` (B1). A net −6-minute staged Shift on a Trip at 0:05 unmounts the React tree with "Service time must be a non-negative integer".
  - Nothing is committed: IndexedDB keeps 300 s, and a reload restores the app.
  - Only the staged Shift and any unsaved drafts are lost.
  - The service layer itself stores negative times if called directly (`applyTripShift([id], -600)`), but no UI path reaches it.
  - The severity stays S2 (Phase 4, Section 4).
- Confidence: Confirmed
- Verified by: Sonnet analyst B1; the lead re-ran the spec
- Fix scope: structural (reject a negative result in the shift preview, fixing 2-002) plus UI (an error boundary). Luna-class; 2–3 files.
- User decision required: no

### 5-012: Keyboard focus drops to the page body after Shift drawer steps and after confirming common actions

- Severity: S2
- Category: a11y
- Location:
  - `src/ui/App.tsx:1221` (Shift drawer Back, Forward, Undo, and Redo).
  - `:1799` (`ShiftDiscardDialog` opens without focus, and a second Escape does not close it).
  - Block pill move, Unassign, Delete trips, Runtime Discard, and Node Discard.
- Governing source: D0025-09 "focus returns to the invoker."
- Evidence: `p5-b4-keyboard.spec.ts` tests B4-05 to B4-07.
- Confidence: Confirmed
- Verified by: Sonnet analyst B4; the lead re-ran the spec
- Fix scope: UI, Luna-class; 1–2 files.
- User decision required: no

### 5-013: `index.html` has no doctype, `lang`, `title`, `charset`, or viewport, so the app renders in quirks mode

- Severity: S2
- Category: a11y
- Location: `index.html` (73 bytes: `<div id="root"></div><script …>`)
- Governing source: WCAG 3.1.1 (language of page) and 2.4.2 (page titled); OV technology direction (standards-mode static site).
- Evidence: `p5-b4-keyboard.spec.ts` test B4-08; `document.compatMode` is `BackCompat`; the lead read the file.
  - Quirks mode changes the CSS box model and table layout.
  - All layout measurements so far, including the failing sticky-header test, were taken in quirks mode.
  - After this fix, re-run the layout tests and the B3 width checks.
- Confidence: Confirmed
- Verified by: review lead (file read), Sonnet analyst B4
- Fix scope: UI/build, Luna-class; 1 file. `index.html` is a Phase 6 file; cross-referenced there.
- User decision required: no

### 5-014: After a stale-source rejection, Blocking keeps the old data and rejects every later edit until the user switches day or reloads

- Severity: S2
- Category: ux
- Location: `src/ui/BlockingWorkspace.tsx:205-213, 316-321` (no reload in the catch blocks; no Reload control)
- Governing source: D0025 and D0026 stale-source handling. The message itself tells the user to reload.
- Evidence: code trace (R5-02). This happens only after another tab or path has changed the data (Phase 4 finding 4-002). The workaround is to switch the day or Scenario.
- Confidence: Probable
- Verified by: Sonnet analyst R5
- Fix scope: UI, Luna-class; 1 file.
- User decision required: no

### 5-015: Blocks that contain Trips from another Route show "Missing pattern" and "—"

- Severity: S2
- Category: ux
- Location: `src/ui/BlockingWorkspace.tsx:116-117, 309` (`ActivityRow` receives the Patterns and Nodes of the selected Route only; no table has a Route column)
- Governing source: D0021 items 4–5; `phase-04-manual-blocking.md:253` (Blocks may span Routes).
- Evidence: code trace (R5-05).
- Confidence: Probable
- Verified by: Sonnet analyst R5
- Fix scope: UI. Luna-class once the presentation is decided, otherwise Sol-class; 1–2 files.
- User decision required: yes. Add a Route column, or show the Route in the Pattern pill? Recommendation: show the Route short name in the Pattern pill only for activities from another Route (no new column).

### 5-016: The shared Runtime-profile display names only the selected day, not every day that shares the profile

- Severity: S2
- Category: contract
- Location: `src/ui/App.tsx:1200` ("Used by {selectedDay} for {pattern}"); `routeDefinitionService.ts:765` returns only counts
- Governing source: 02R-AC18 (the display lists every service day that shares the profile).
- Evidence: code trace (R3), Phase A lead.
- Confidence: Confirmed (code)
- Verified by: Sonnet analyst R3
- Fix scope: UI plus a small query, Luna-class; 2 files.
- User decision required: no

### 5-017: Weak browser assertions

- Severity: S3
- Category: test-gap
- Location:
  - `tests/ui/route-editing.spec.ts:3` never reloads or reads IndexedDB.
  - `costing-workspace.spec.ts:3` claims narrow-width usability, but it checks only two headings at 760 px and checks overflow only at 1440 px.
  - The screenshots in the Blocking and Costing tests are not asserted.
  - The conditional `Discard` branches in `blocking-workspace.spec.ts:40` can hide a stray dirty-route banner.
  - No test covers focus trap, Escape, or focus return (B4-19), and nothing tests the Runtime paste dialog (R3).
- Confidence: Confirmed
- Verified by: Sonnet analysts B2, B4, R3
- Fix scope: test-only, Luna-class.
- User decision required: no

### 5-018: Menu semantics: Display toggles use `menuitemradio`, open menus stay open on Tab, and there is no typeahead

- Severity: S3
- Category: a11y
- Location: `src/ui/MenuButton.tsx:45` (role is `menuitemradio` whenever `checked` is defined; the independent Display toggles should be `menuitemcheckbox`)
- Evidence: the lead read line 45; B2 and B4 observed this in the browser.
- Confidence: Confirmed
- Verified by: review lead (code), Sonnet analysts B2, B4
- Fix scope: UI, Luna-class; 1 file.
- User decision required: no

### 5-019: Costing presentation: the Total row is not the sum of the displayed rows; there is a cross-day-type hour total, two View year selectors, and weak partial-estimate labelling

- Severity: S3
- Category: ux
- Location: `src/ui/CostingWorkspace.tsx:181,192,195,14-27`; `src/styles.css:438-442` (dead CSS)
- Evidence: B3.
  - At $150/h, the annual cost rows sum to 15,685,181 against a displayed total of 15,685,180. Revenue hours sum to 104,567 against a displayed 104,568. Nothing says that totals are rounded independently.
  - The Total row sums hours across day types, which has no planning meaning.
  - D0028 places View year in the toolbar only, but it also appears in the table header.
  - "1 excluded Blocks" is mis-pluralized.
  - The inflation input shows float noise (Phase 4 finding 4-014).
- Confidence: Confirmed
- Verified by: Sonnet analyst B3
- Fix scope: UI, Luna-class; 1–2 files.
- User decision required: no

### 5-020: Blocking and Costing round the same hours differently

- Severity: S3
- Category: ux
- Location: `src/ui/BlockingWorkspace.tsx:79-81` (`toFixed(2)`); `roundCostingDisplay` (rounds half away from zero)
- Evidence: `p5-blocking-costing-rounding.golden.test.ts`. 14 of 345 golden Block quantities differ; for example, Block 22's 14.575 Revenue hours displays as 14.57 in Blocking and 14.58 in Costing. Related to Phase 2 finding 2-013.
- Confidence: Confirmed
- Verified by: Sonnet analyst B3; the lead re-ran the test
- Fix scope: UI, Luna-class; 1 file.
- User decision required: no

### 5-021: Labels and names

- Severity: S3
- Category: ux
- Location:
  - Pattern names are truncated in Blocking pills (`BlockingWorkspace.tsx:86`, `styles.css:292`) and in the 94 px Trips row select.
  - "No current issues." uses the amber warning style (`BlockingWorkspace.tsx:389`).
  - The "Delete Pattern" button's accessible name differs from its visible label (`App.tsx:1732`).
  - "Move Trip N" counts from the row index, so it is off by one when a Pull-out row exists (`BlockingWorkspace.tsx:378-379`).
  - "Trip profile" and "Trip Profile" are capitalized inconsistently.
  - The Trips "Scenario" label is Phase 1 finding 1-013 (the user decided on "Blocking Scenario"), not re-reported.
- Confidence: Confirmed
- Verified by: Sonnet analysts B3, R5, R1
- Fix scope: UI, Luna-class.
- User decision required: no

### 5-022: `ui-conventions.md` says removing a Node or Pattern point uses a modal confirmation; the code removes it inline as a draft change

- Severity: S3
- Category: docs
- Location: `docs/ui-conventions.md:27`; `src/ui/App.tsx:454` (inline draft removal; the modal version at `:264` is dead, see 4-015)
- Evidence: a contradiction between the convention text and the code (B3, B4).
- Confidence: Confirmed
- Verified by: Sonnet analysts B3, B4
- Fix scope: docs; 1 file. The draft behavior is reversible through Discard, so the convention is the stale side.
- User decision required: no

### 5-023: Accessibility polish: missing `aria-invalid`, headings, landmarks, labelled file inputs, and table header scope

- Severity: S3
- Category: a11y
- Location:
  - No `aria-invalid` or `aria-describedby` on `Field` (`App.tsx:1772`), the Build Trips drawer, the Runtime dialog, or Costing inputs (B4-09).
  - No `h1` on Trips, Blocking, or Costing; a nested `main` (`CostingWorkspace.tsx:175` inside `App.tsx:348`); `aria-allowed-role` on a `form` with `role=dialog`.
  - Three visually hidden file inputs (`App.tsx:350, 1201, 1206`) are Tab stops with no visible focus; the JSON input is unlabelled (axe "label", critical).
  - Tables have no `scope`, caption, or row headers.
- Confidence: Confirmed
- Verified by: Sonnet analyst B4 (axe and manual checks); the lead re-ran the B4-09 test
- Fix scope: UI, Luna-class. Row headers on the frozen columns are Sol-class if they change the layout.
- User decision required: no

### 5-024: Escape in numeric and runtime time inputs commits the typed value instead of cancelling

- Severity: S3
- Category: ux
- Location: `src/ui/App.tsx:1784` (`NumericCommit`), `:1714-1718` (`RuntimeTimeInput`)
- Evidence: code trace (R4-01). The handler calls `setDraft(value)` and then `blur()`, and `onBlur` commits synchronously with the typed draft still in its closure.
- Confidence: Probable
- Verified by: Sonnet analyst R4
- Fix scope: UI, Luna-class; 1 file.
- User decision required: no

### 5-025: The remembered Blocking Scenario is overwritten after a Trip Profile change and never restored in Blocking

- Severity: S3
- Category: ux
- Location: `src/ui/App.tsx:821, 879` (R2-04); `src/ui/BlockingWorkspace.tsx` first-commit `savePreference` (R5-10)
- Governing source: D0021-08.
- Confidence: Probable
- Verified by: Sonnet analysts R2, R5
- Fix scope: UI, Luna-class; 2 files.
- User decision required: no

### 5-026: Shift drawer Undo and Redo update history before the preview resolves

- Severity: S3
- Category: correctness
- Location: `src/ui/App.tsx:1221`
- Evidence: a code trace (R3-06; B2 also noticed it). A failed preview leaves the history out of step with the preview.
- Confidence: Suspected
- Verified by: Sonnet analysts R3, B2
- Fix scope: UI; 1 file.
- User decision required: no

### 5-027: The Trips CSV import preview shows raw Trip and Pattern UUIDs

- Severity: S3
- Category: ux
- Location: `src/ui/App.tsx:1396`, `:1393` (finding-list keys may collide)
- Confidence: Confirmed (code)
- Verified by: Sonnet analyst R3
- Fix scope: UI, Luna-class; 1 file.
- User decision required: no

### 5-028: Runtime band totals of 60 minutes or more display as ":61" or ":65"

- Severity: S3
- Category: ux
- Location: Runtime editor band totals (B3 observed this in the walkthrough)
- Evidence: B3 raised it as a question and did not check it against Decision 0033.
- Confidence: Suspected
- Verified by: Sonnet analyst B3 (observation only)
- Fix scope: UI; 1 file.
- User decision required: no

### 5-029: Message quality (5.9)

- Severity: S3
- Category: ux
- Location and categories (from H2's inventory, reviewed by R1–R4):
  - **Add a next step:** `node.referencedBeforeDelete`, `pattern.sequenceNormalized`, `block.missingTrip`, and `runtime.noApplicableBand`; the fallback "Review this item."; "Unable to save the staged shift."; "Unable to read the pasted runtime rows."; "Unable to import the Trips CSV."; and every "Unable to …" fallback in the copy and batch dialogs.
  - **Replace a technical term:** "The Trip shift request is invalid."; the Headway error "Invalid runtime duration: abc".
  - **Terminology:** inconsistent Trip/Block capitalization (`App.tsx:1611` vs. `1514-1560`); "Run Time" is not a glossary term (1-013).
  - **Wrong text:** `RuntimeProfileDialog2` says "Enter a name and select a pattern." when only the name is missing.
  - Raw-text leaks are Phase 4 finding 4-017 and Phase 3 finding 3-015.
- Confidence: Confirmed (inventory)
- Verified by: Sonnet analysts R1–R4
- Fix scope: UI, Luna-class.
- User decision required: no

## 3. Per-test integrity verdicts (task 5.1, by analyst B2)

| file:line | title (abbrev.) | verdict | rule | reason |
|---|---|---|---|---|
| blocking-workspace:27 | assigns/reassigns/unassigns by pill and bulk | sound | D0025-01, UI-45, UI-40 | Real app; asserts block labels, confirm dialogs, counts. Conditional `if (isVisible()) Discard` (:40) can mask a stray dirty-route banner. |
| blocking-workspace:116 | creates empty scenario/Block, exposes Trips context | weak | UI-47, UI-52, UI-54 | Real app, many assertions, but two `page.screenshot` calls assert nothing; "exposes Trips context" is only a scenario button visible. |
| blocking-workspace:180 | shift-click ranges both tables | sound | UI-43, UI-51 | Checks all three boxes in both tables; bulk pull-out preview status text. |
| blocking-workspace:251 | filter/sort Unassigned; insert by From Time | sound | UI-48, UI-49 | Asserts row counts, order, deadhead label. |
| costing-workspace:3 | partial estimate, year select, narrow width | weak | PL05-01, PL05-05/11 | `$40,170` is correct (150 x 1.03 x 1 h x 260 d). The "usable at a narrow width" claim only checks two headings at 760 px; overflow check is at 1440 px. Screenshots unasserted. |
| database-migration:3 | DB v6 preserves v4 project | sound | D0035-C1 | Real app opens a hand-built v4 DB; version `60` is Dexie's x10. Settled by Phase 3. |
| route-editing:3 | Node/Pattern drafts local until saved | weak | UI-19..22 | Asserts UI states only; never reloads or reads IndexedDB to show nothing persisted before Save. |
| route-editing:41 | rename and duplicate Route | sound | D0028 | Asserts selected option text and count. |
| runtime-table-layout:3 | From/To adjacent | wrong-reason | D0013 | Static fixture. Real runtime table has extra `Total`, 10 segments; fixture has none. CSS-only claims (10px border, widths) do hold in the real app (measured). Permitted by D0013 for geometry; detects only stylesheet changes. |
| service-day-copy-layout:3 | unified Runtime/Trips header layers | wrong-reason / stale | UI-23, UI-27, UI-54, D0018-04 | Static fixture. Asserts Runtime header buttons `['Profile: Weekday ▾','Add','Discard','Save','']`; real app renders `['Weekday workbook runtimes ▾','']` (Add moved to Actions per UI-23) and Trips `['Default ▾','Workbook Blocks ▾','']`. Passes while the app differs (golden p5-fixture-drift). |
| trip-profile:5 | Profile selection/lifecycle in Trips header menu | sound | D0016, UI-27 | Real app; keyboard open/Escape, copy flow, delete confirm cancel. Delete itself is not exercised. |
| trip-table-layout:3 | Pattern column no wider than selector | wrong-reason (CSS-only) | D0013 | Fixture (line 3/`goto` fixture). Real app measured: column 96, selector 96, font 11.2px (passes there too). `table < region` assertion is false in the real app (1449 vs 1218), true only for the 6-column fixture. |
| trip-table-layout:30 | unsaved new trip before saved rows | wrong-reason | none cited | Asserts classes of static HTML written in the fixture; tautological. Real app order checked by me (draft row first; `draft-trip-row`), but the test cannot detect a regression. |
| trip-table-layout:40 | schedule headers sticky while scrolling viewport | stale / failing | D0035-05, UI-31, OV-TRIP-08 | Fixture + injected rows, requires `position: sticky` on th inside a bounded scroll region. D0035-05 forbids that; app uses a fixed duplicate row (1-001). Fails in suite. |
| unified-action-layer:83 | Build Trips drawer, last-trip/count limits | failing (label) -> sound | UI-32..34 | Passes after label fix; count 6 and 9 and `7:20` hand-verified. Non-modal drawer and the 500 cap (UI-35) not asserted. |
| unified-action-layer:112 | regeneration preview signed changes | failing (label) -> sound | D0031-06, UI-37 | After fix passes; `0:00`, `+0:03:30`, `−0:03:30` match regenerated minus saved. |
| unified-action-layer:140 | one regeneration undo through reload | failing (label) -> sound | D0035-03, D0035-04 | After fix passes; `toContainText('6:07')` is a substring match (weak but adequate). |
| unified-action-layer:169 | restores scroll after committing a shift | failing, stale | D0035-05, OV-TRIP-09 | See above; would pass vacuously (0 == 0) if preconditions were dropped. Never tests page scroll or horizontal position. |
| unified-action-layer:186 | stages Shift, guards, persists on Done | failing (label) -> sound; one flake | UI-38 | Covers Undo/Redo, scope guard, Discard, Done, reload. Net-zero Done and redo truncation not covered. |
| unified-action-layer:226 | shift-click range in Trips table | failing (label) -> sound | UI-43 | After fix passes. |
| workflow-section-layout:3 | one header action layer + right-docked Shift drawer | wrong-reason / stale | UI-27, UI-38 | Static fixture. Asserts `['Profile: Weekday ▾','Add','']` and Trips `['Profile: Default ▾','']`; real app differs (see above). Drawer geometry (380 px, flush right) does hold in the real app (measured x=900, w=380) but the test never opens the real drawer. |

## 4. Areas examined with no defects found

- Trips table behaviors (5.6): every behavior listed in Section 1 conforms in the browser.
- Costing: no-estimate versus $0, exclusions and reasons, column alignment, and the 768 px layout.
- Runtime paste Replace/Append logic and its validation gate (R3, code): no defect, but no test (5-017).
- `MenuButton` open and close by keyboard (apart from 5-018).
- Focus return in the Costing dialogs, the Block-assignment dialogs, and the Copy and Change-pattern dialogs.

## 5. Delegated claims rejected on verification

| Claim | Source | Reason rejected |
| --- | --- | --- |
| H2 `dialogs.md`: dialogs opened from menu items have effective `autoFocus`. | Haiku H2 | The attribute exists, but `MenuButton.tsx:45` refocuses the trigger (B4, browser). This is an inventory error and was not used as a finding. |
| B3: "the H2 destructive inventory did not exist". | Analyst B3 | Timing only: B3 started before H2 finished. B3 built its own list, so its result is unaffected. |

Phase 4's Section 5 also covers R3-01 (`formatTripTableClock` was not dead).

## 6. Leads handed to other phases

| Lead | Owner |
| --- | --- |
| 5-013 `index.html` quirks mode: re-measure every layout and width check after the fix | Phase 6, Stage 4 |
| 5-007 and 5-019: Costing table width and totals | Stage 3 (merge with A-006 history) |
| Every Phase 5 screenshot was taken in quirks mode | Stage 4 re-capture after 5-013 |

## 7. User decisions required

1. **5-004:** guard the Runtime editor draft and the staged Shift (recommended), or accept the loss of unsaved input and document it.
2. **5-015:** how to show Trips from another Route in a Block. Recommendation: the Route short name in the Pattern pill, only for activities from another Route.

## 8. Gate

Exit criteria are met:
- **Browser tests:** every browser test has an integrity verdict (Section 3).
- **Workspaces:** each workspace has screenshots at 1024 px and a deviation list (Section 1, 5.2).
- **UX findings:** each is labeled Luna-class or Sol-class. Every UX finding is Luna-class except two conditional Sol-class cases: 5-015, if the presentation is left to design judgment, and the 5-023 row headers, if they change the frozen-column layout.
