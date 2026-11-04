# Packages MR1 to MR4: Most recently ready vehicle, peak vehicles and a vehicle limit

- Status: Decision 0056 accepted (2026-11-04). MR1 implemented on 2026-11-04; awaiting user review. MR2 to MR4 planned.
- Rules: Decision 0056 (`docs/decisions/0056-most-recently-ready-vehicle.md`). Read it in full first. This plan does not repeat its reasoning.
- Branch: `claude/admiring-sagan-4lfwzp`. Commit each package separately with a clear message. Never push to another branch. Do not open a pull request.
- Implementer: a Sonnet-class model starting each package with fresh context. Each package is self-contained: read "Read first", then your package section, and touch only the files your package owns.
- Gate: after each package, run that package's acceptance checks and report the results to the user. The primary agent reviews before the next package starts. Do not start the next package on your own (AGENTS.md).

| Package | Content | Class / model |
|---|---|---|
| MR0 | Decision 0056, this plan | Done (primary agent) |
| MR1 | Engine choice rule, break measurement fix, reference script, unit tests, Golden regression test | Done 2026-11-04 (primary agent) |
| MR2 | Peak vehicles and the maximum-vehicles limit in the domain; rule validation; backup schema 9 | Structural (Luna) / Sonnet |
| MR3 | Dialog: intro sentence, Maximum vehicles field, Peak vehicles column, check note, finding and summary text | Structural (Luna) / Sonnet. Every text and placement is fixed below and reuses existing fields and columns, so no design judgment is needed. |
| MR4 | Documentation, full verification, closeout | Structural (Luna) / Sonnet |

## Read first (every package)

1. `AGENTS.md` and `codex.md`. `codex.md` has the commands, and the browser-test setup with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`.
2. Decision 0055 items 4, 7, 8, 11, 12 and 14, and Decision 0056.
3. `src/domain/autoBlocking.ts`:
   - `AutoBlockingRules` (about line 40) and `AutoBlockingDaySummary` (about line 199);
   - `validateAutoBlockingRules` (about line 70; the limit checks are at about lines 112 and 113);
   - `chainPass` (about lines 300 to 348; the candidate loop is at about lines 313 to 326);
   - `buildAutoBlocks` (about lines 350 to 465), including the break rebuilding passes and the day summaries;
   - `summarizeAutoBlockingRules` (about line 485; the limits are at about lines 498 and 499);
   - `measureBuiltBlocks` (about lines 547 to 620; the break block is at about lines 558 to 579);
   - `AutoBlockingCheck` and `checkAgainstBuiltBlocks` (about lines 624 to 685).
4. `src/domain/autoBlocking.test.ts`: the `outAndBack` fixture (about line 142), the "reference results from synthetic-check.py" tests (about line 198), and "measureBuiltBlocks and checkAgainstBuiltBlocks" (about line 395).
5. `src/application/autoBlocking.test.ts`: "previews the reference numbers without writing" (about line 100) and the creation test (about line 126).
6. `docs/implementation/automatic-blocking/synthetic-check.py`.
7. `src/testSupport/goldenBackup.ts`: `goldenRaw()` returns the Golden (Federal BRT) backup.
8. `src/persistence/backup.ts`:
   - `PROJECT_BACKUP_SCHEMA_VERSION` (line 34);
   - `validateAutoBlockingRecord` (about line 37);
   - `validateBlockingScenarios` (about line 58);
   - the version lists in `parseProjectBackupWithReport` (about lines 583 to 626).
9. `src/ui/blocking/AutoBlockingDialog.tsx`:
   - the form conversion (about lines 55 to 90);
   - `limitsSummary` (about line 177);
   - the intro (about line 192);
   - the Block limits section (about line 248);
   - the preview table and check notes (about lines 309 to 322);
   - `findingSentences` (about line 340).

Repository rules for every package:
- Use the file-edit tool for source and documentation edits. Do not use shell redirection or `sed` on files.
- Keep domain code free of React and IndexedDB.
- Do not change any other behaviour of automatic blocking or of hand blocking.

## Package MR1: engine choice, measurement, reference script and tests

### Files owned

- `src/domain/autoBlocking.ts`
- `src/domain/autoBlocking.test.ts`
- `src/domain/autoBlocking.golden.test.ts` (new)
- `src/application/autoBlocking.test.ts` (expected numbers only)
- `docs/implementation/automatic-blocking/synthetic-check.py`

### Steps

1. **Vehicle choice in `chainPass`** (Decision 0056 items 1 and 2).
   - Give `chainPass` a parameter `choice: 'mostRecentlyReady' | 'readyLongest'`. MR2 uses `'readyLongest'` for the vehicle limit. In MR1 every call passes `'mostRecentlyReady'`.
   - Keep the loop over `vehicles` in creation order. `chosen` is replaced by `candidate` when any of these is true:
     - there is no `chosen` yet;
     - `candidate.direct` is true and `chosen.direct` is false;
     - `candidate.direct === chosen.direct`, and `candidate.effectiveReady > chosen.effectiveReady` for `'mostRecentlyReady'` or `candidate.effectiveReady < chosen.effectiveReady` for `'readyLongest'`.
   - Use strict comparisons, so an equal ready time keeps the earlier-created Block.
   - Do not change how candidates are found, the limits check (`fits`), breaks, deadhead writing, or new-Block creation.
   - Update the function's doc comment to describe both choices and "direct before deadhead".
2. **Break measurement in `measureBuiltBlocks`** (Decision 0056 item 4).
   - After `longest` is computed, keep only the entries whose gap length in whole minutes (`Math.floor((gap.end - gap.start) / 60)`) is greater than `largestMinimumMinutes + 5`. Call the result `breakGaps`.
   - If `breakGaps` is empty, there is no break rule. This is the current "no break" result.
   - Otherwise:
     - `lengthMinutes = floorTo(Math.min(...breakGaps gap lengths) / 60, 5)`;
     - mark `breakHere` from `breakGaps`, not from `longest`;
     - compute `first` from `breakGaps`.
   - Leave `withBreak`, `shortestSpan`, `intervals` and the rest of the break rule as they are.
   - Remove the old `lengthMinutes > largestMinimumMinutes + 5` test, which the filter replaces.
3. **Reference script.** In `synthetic-check.py`:
   - Replace `_, i = min(ready)` with `_, i = max(ready, key=lambda r: (r[0], -r[1]))`, and update the comment on line 35 to "the most recently ready open block; ties go to the earlier-created block (Decision 0056)".
   - Run `python3 docs/implementation/automatic-blocking/synthetic-check.py` and replace the "Expected output" lines in the docstring with the printed results. The primary agent's trial on 2026-11-04 printed:

     ```
     35-min trips, breaks:    (7, 2560, [70, 355, 355, 445, 445, 445, 445], 6)
     46-min trips, breaks:    (9, 3348, [92, 347, 347, 347, 347, 467, 467, 467, 467], 8)
     35-min trips, no breaks: (6, 2490, [340, 430, 430, 430, 430, 430], 0)
     35-min trips, min 7 h:   (7, 2530, [70, 340, 340, 445, 445, 445, 445], 4)
     ```

     If your output differs, stop and report.
4. **Domain tests (`autoBlocking.test.ts`).**
   - Change the reference tests to the step 3 numbers: block count, total minutes, sorted spans, and blocks with a break. Rename each test so its title states the new numbers.
   - Do not change a test's fixture or rules to make it pass.
   - The test "reads minimum layovers, can start/end, and a break from built blocks (matching by name)" must pass unchanged after step 2. If it does not, stop and report. Do not edit it.
   - Add these tests:
     - **Most recently ready wins.** Two vehicles are ready at the same node at different times before a departure. The Trip goes to the vehicle that became ready later, and the other Block ends at its last Trip.
     - **Equal ready time.** The earlier-created Block wins.
     - **Direct before deadhead.** A deadhead candidate with an earlier effective ready time loses to a direct candidate. Build it on `outAndBack` with an extra node and a deadhead connection.
     - **Deadhead only when no direct candidate.** With no direct candidate, the deadhead candidate takes the Trip and gets a deadhead activity.
     - **Measurement ignores a short Block.** A source with one two-Trip Block whose only gap is the minimum layover, plus Blocks with a 50-minute gap, still measures `lengthMinutes` 50.
5. **Golden regression test (`src/domain/autoBlocking.golden.test.ts`, new).** Using `goldenRaw()`:
   - Take the Blocking Scenario that has Blocks ("Workbook Blocks"), its Scenario's Trips on its Trip Profile, and the context records (routes, patterns, nodes, directions, service days).
   - Rules: `measureBuiltBlocks({ source: { ...context, blocks }, target: context, targetRules: defaultAutoBlockingRules(context, tripProfileId) }).rules`.
   - Run `buildAutoBlocks` with those rules.
   - For each service day, assert:
     - the block count equals the number of built Blocks of that day (18 on Weekday; 17 on Saturday, Sunday and Holiday);
     - `revenueSeconds` equals the sum over that day's built Blocks of (last revenue Trip's last stop time minus first revenue Trip's first stop time).
   - Compute the expected values in the test from the backup; do not hard-code hours. They are about 311.59 h on Weekday, 280.95 h on Saturday, and 245.89 h on Sunday and Holiday.
6. **Application tests (`src/application/autoBlocking.test.ts`).** Change only the expected numbers that come from the 35-minute reference (`blockCount`, `revenueSeconds`, `blocksWithOneBreak`, and the stored `blockCount`) to the step 3 values. Do not change the test logic.

### Acceptance

- `pnpm typecheck` passes.
- `pnpm test` passes. Report the file and test counts.
- The Python script's printed output and the TypeScript reference tests agree, number for number.
- The Golden regression test passes on all four service days.
- `git diff --stat` lists only the files this package owns.

## Package MR2: peak vehicles, maximum vehicles, backup schema 9

### Files owned

- `src/domain/autoBlocking.ts`
- `src/domain/autoBlocking.test.ts`
- `src/domain/autoBlocking.golden.test.ts`
- `src/persistence/backup.ts`
- `src/persistence/backup.test.ts`
- `src/persistence/database.test.ts` and `src/persistence/dexieRepository.ts`: only where they state 8 as the current backup version. Find those lines with `grep -n "PROJECT_BACKUP_SCHEMA_VERSION\|exportSchemaVersion" src/persistence/database.test.ts src/persistence/dexieRepository.ts`, and do not change anything else in these files.
- `src/application/autoBlocking.test.ts` (new test cases only)

### Steps

1. **Types.**
   - Add `maxVehicles?: number; // whole number >= 1 when present (Decision 0056 item 9)` to `AutoBlockingRules`, after `maxRevenueMiles`.
   - Add `peakVehicles: number` to `AutoBlockingDaySummary`, after `blockCount`.
   - Add `builtPeakVehicles: number` and `autoPeakVehicles: number` to the day entries of `AutoBlockingCheck`.
2. **Peak vehicles function.** Add an exported pure function:

   ```ts
   peakVehicles(intervals: Array<{ start: number; end: number }>): number
   ```

   - It returns the largest number of intervals open at one time, with intervals treated as [start, end). An interval that ends at t does not overlap one that starts at t.
   - Sort the events by time, with end events before start events at the same time.
   - It returns 0 for an empty list.
3. **Block intervals.**
   - **Generated Blocks:** start = first departure minus the Block's pull-out minutes; end = last arrival plus the Block's pull-in minutes. Use the minutes that `buildAutoBlocks` writes on the pull-out and pull-in activities.
   - **Built Blocks (the check):** read the same values from the Block's `pullOut` and `pullIn` activities. A missing minutes value counts as 0. Use the revenue Trips' first departure and last arrival.
   - Count across all Routes of the day.
4. **Day summaries.**
   - Set `peakVehicles` on every `AutoBlockingDaySummary`.
   - In `checkAgainstBuiltBlocks`, set `builtPeakVehicles` and `autoPeakVehicles` for each day.
5. **Vehicle limit in `buildAutoBlocks`** (Decision 0056 item 9).
   - For each ticked service day, build the whole day (all Routes, including the break rebuilding passes) with `'mostRecentlyReady'`.
   - If `rules.maxVehicles` is set and the day's peak is above it, build the whole day again with `'readyLongest'`. The same choice applies to every Route of that day.
   - Keep the "ready longest" build if its peak is at most the limit. Otherwise keep whichever build has the lower peak, and the most-recently-ready build wins a tie.
   - Findings, with `serviceDayId` in their parameters:
     - When the "ready longest" build is kept, add `autoBlocking.vehicleLimitAlternateRule` (information level, stored as a warning like the other information findings). Parameters: `revenueDifferenceSeconds` (kept build minus most-recently-ready build).
     - When the kept build's peak is above the limit, add `autoBlocking.vehicleLimitExceeded` (warning). Parameters: `peakVehicles` and `maxVehicles`.
   - Only the kept build's Blocks, findings and day summary go into the result.
   - If the current code chains Routes before days, restructure only as far as needed so that a day can be built as a unit. Keep Block ordering and numbering the same as before for a day built once.
6. **Validation.** In `validateAutoBlockingRules`, `maxVehicles`, when present, must be a whole number of at least 1. Otherwise add a finding with rule ID `autoBlocking.limitVehicles` and field `maxVehicles`, using the same `problem(...)` helper as `limitRunningHours`.
7. **Summary.** In `summarizeAutoBlockingRules`, after the revenue-miles limit, add `max {n} vehicles` when `maxVehicles` is set.
8. **Backup schema 9.**
   - Set `PROJECT_BACKUP_SCHEMA_VERSION` to 9.
   - Add 8 to every version list in `parseProjectBackupWithReport` that now lists `7, PROJECT_BACKUP_SCHEMA_VERSION`.
   - The `autoBlocking` record must be validated for both version 8 and version 9 files. The condition that passes `autoBlockingContext` (about line 620) must accept 8 and 9. A version 8 file has no `maxVehicles`, and the validator must accept that.
   - In `validateAutoBlockingRecord`, `maxVehicles` is validated through `validateAutoBlockingRules`, so there is no extra shape check. Update the doc comment to "backup version 8 and later".
   - Scenario copy and backup import copy `maxVehicles` unchanged. Confirm that `remapAutoBlockingRecord` keeps it, and that the existing remap tests still pass.
9. **Tests.**
   - `peakVehicles`: an empty list; touching intervals (end = start gives 1); nested intervals; three that overlap.
   - Day summary `peakVehicles` on the 35-minute reference, with and without terminal pull-out and pull-in minutes.
   - **Vehicle limit:** a fixture where the most-recently-ready build has a higher peak than the "ready longest" build. The primary agent found this case in Jeffco "Friday evening service" Weekday (8 against 7) with a 50-minute break rule.
     - Build a synthetic equivalent, or derive one by trying small variants of `outAndBack` with a break rule until the peaks differ.
     - Record the fixture's numbers in the test title.
     - With `maxVehicles` equal to the lower peak, the result uses the "ready longest" build and has the alternate-rule finding.
     - With `maxVehicles` below both peaks, the result uses the lower-peak build and has the exceeded finding.
     - Without `maxVehicles`, the result is unchanged from MR1.
   - **Validation:** 0, 1.5 and -1 are refused; 1 and 12 are accepted.
   - **Backup:**
     - a version 9 round trip keeps `maxVehicles`;
     - a version 8 file with an `autoBlocking` record imports;
     - a version 9 file with `maxVehicles: 0` is refused with a message that names the field;
     - the exported `exportSchemaVersion` is 9.
   - **Golden regression test:** also assert that `peakVehicles` equals the block count on each day (18, 17, 17, 17).
   - **Application test:** the preview of a rule set with `maxVehicles` returns the day summary with `peakVehicles`, and creation stores `maxVehicles` in the `autoBlocking` record.

### Acceptance

- `pnpm typecheck` and `pnpm test` pass. Report the counts.
- The fixture in step 9 shows different peaks for the two rules, and its numbers are in the report.
- `git diff --stat` lists only the files this package owns.

## Package MR3: dialog

### Files owned

- `src/ui/blocking/AutoBlockingDialog.tsx`
- `src/ui/blocking/AutoBlockingDialog.css` or the stylesheet that holds `.auto-blocking-*` rules: only if a new column needs a width rule. Find it with `grep -rln "auto-blocking-preview-table" src`.
- Tests that match the old intro sentence or the preview table columns. Search `src` and `tests` for "waited longest" and "2+ breaks".

### Steps

1. **Intro.** Replace "Each departure takes the vehicle that has waited longest past its minimum layover; if none is ready, a new block starts." with "Each departure takes the vehicle that became ready most recently after its minimum layover, so spare vehicles finish early; if none is ready, a new block starts." The rest of the paragraph and all markup are unchanged.
2. **Maximum vehicles field.**
   - Place it in the Block limits section, after the revenue-miles field.
   - Copy the markup, classes and error display of the running-hours field exactly.
   - Label: "Maximum vehicles per day". Hint text, in the same element the other limit fields use for hints: "Leave blank for no limit."
   - Add `maxVehicles: text(rules.maxVehicles)` to the form conversion, and convert it back the same way as `maxRunning`.
   - Show the `autoBlocking.limitVehicles` finding under the field, with the text "Enter a whole number of 1 or more, or leave it blank." Add it to the same field-text map as the other limit findings.
3. **Block limits summary** (`limitsSummary`). Add `max {n} vehicles` after the revenue-miles part when set, joined with " · " like the others.
4. **Preview column.**
   - Insert `<th scope="col">Peak vehicles</th>` after "Blocks", and `<td>{day.peakVehicles}</td>` after the block count cell.
   - Check that the table still fits the preview aside at the dialog's default width. If it does not, reduce only the new column's width, using the existing column rules.
5. **Finding sentences** (`findingSentences`). Add one sentence per day finding. `{day}` is the service day name and `{h}` is the absolute difference in hours, with the same `hours()` formatting the preview uses.
   - `autoBlocking.vehicleLimitAlternateRule`: "{day}: built by giving each trip to the vehicle that has waited longest, to meet the vehicle limit. Revenue time is {h} h more than without the limit." Use "less" in place of "more" when `revenueDifferenceSeconds` is negative.
   - `autoBlocking.vehicleLimitExceeded`: "{day} needs {peakVehicles} vehicles at peak; the limit is {maxVehicles}."
   - Both use the existing `InlineNote kind="warn"` rendering. Do not add a new note style.
6. **Check note.** In the "Same rules on …" note, add the peak figures:
   - after "{n} blocks", add ", {autoPeakVehicles} at peak";
   - after "Its built blocks: {n} blocks", add ", {builtPeakVehicles} at peak".
   - Leave the rest of the sentence unchanged.
7. **Tests.** Update any UI test that matched the old intro sentence or the old column list. Add or extend a dialog test to check:
   - the Maximum vehicles field appears in Block limits;
   - a value of 0 shows the field error and disables "Create blocking scenario", the same way as an invalid running-hours limit;
   - the preview has a "Peak vehicles" column.

### Acceptance

- `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- Run `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test tests/ui/automatic-blocking.spec.ts tests/ui/keyboard.spec.ts`. Both must pass, including the axe check with the dialog open.
- Visual check:
  - Start `pnpm dev`, load the Golden project, and open Blocking → Actions → "Build blocks automatically…".
  - Save screenshots in the scratchpad directory: the dialog with Block limits open, and the preview.
  - Confirm that the Weekday row shows 18 blocks and 18 peak vehicles, and that no column wraps or overflows.
- `git diff --stat` lists only the files this package owns.

## Package MR4: documentation, verification, closeout

### Files owned

- `docs/decisions/0055-automatic-blocking.md`
- `docs/decisions/0056-most-recently-ready-vehicle.md` (status line)
- `docs/implementation/automatic-blocking.md` (the intro text line, about line 490)
- `docs/implementation/most-recently-ready.md` (status lines)
- `architecture_overview.md`
- `docs/domain-glossary.md`
- `docs/ui-conventions.md`
- `codex.md` (status paragraph)

### Steps

1. **Decision 0055.**
   - Add to the header: `- Amended by: Decision 0056 (vehicle choice in item 4; maximum vehicles in item 8; break measurement in item 11; peak vehicles in item 12; backup schema 9 in item 14)`.
   - Add a short note "Amended by Decision 0056: …" at the end of each of those items, describing what changed. Do not delete the original text.
2. **Decision 0056.** Set the status to "Accepted (user acceptance of <date>); implemented". Use the date the user accepted it. Leave the date as `<date>` and say so in the report if the user did not give one.
3. **`architecture_overview.md`** (the automatic-blocking paragraph, about line 272).
   - Replace "each Trip goes to the open Block that has been ready longest at its first node (arrived and waited its required layover, directly or through a deadhead connection)" with "each Trip goes to the open Block that became ready most recently at its first node (arrived and waited its required layover); a Block already at the node wins over one that needs a deadhead connection (Decision 0056)".
   - Add "optional maximum vehicles per day (met by rebuilding the day with the ready-longest choice; never a hard constraint)" to the list of rules.
   - Add "The preview shows peak vehicles per day."
   - Change "backup schema version 8" to 9 wherever the paragraph or the backup section states the current version.
4. **`docs/domain-glossary.md`.**
   - About line 173: replace "gives each Trip to the open Block that has been ready longest at the Trip's first node" with "gives each Trip to the open Block that became ready most recently at the Trip's first node, preferring a Block already there over a deadhead (Decision 0056)".
   - Add a "Peak vehicles" entry with the definition from Decision 0056 item 8.
5. **`docs/ui-conventions.md`.** In the automatic-blocking dialog entry, add the Maximum vehicles field and the Peak vehicles column.
6. **`docs/implementation/automatic-blocking.md`** (about line 490). Update the quoted intro text to the MR3 step 1 text, and add "(changed by Decision 0056)".
7. **`codex.md`.**
   - Add one sentence to the current-status paragraph: "Decision 0056 (packages MR1 to MR4) changed automatic blocking to give each Trip to the most recently ready vehicle, direct before deadhead, and added peak vehicles to the preview and an optional maximum-vehicles limit; on Golden the automatic Blocks now match the hand-built Blocks' hours. Backup files are schema version 9."
   - Add the unit-test and browser-test counts from step 8.
   - Change any statement of the current backup schema version from 8 to 9.
8. **Verification.**
   - Run `pnpm typecheck`, `pnpm test` and `pnpm build`.
   - Run `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`.
   - Do a backup round trip in the running app:
     1. Create an automatic Blocking Scenario with Maximum vehicles 17 on Golden.
     2. Export the project and confirm that the file says `"exportSchemaVersion": 9` and holds `"maxVehicles": 17`.
     3. Import it and confirm that the dialog's "Build again…" shows 17 in the field.
9. **Status lines.** Set this plan's status to "MR1 to MR4 implemented on <date>; awaiting user acceptance". Mark the packages done in the table.

### Acceptance

- Every check in step 8 passes. Report the counts.
- `grep -rn "waited longest\|ready longest" src tests docs architecture_overview.md` returns only:
  - the original Decision 0055 text and its amendment notes;
  - Decision 0056;
  - this plan;
  - the `'readyLongest'` choice in `autoBlocking.ts` and its tests;
  - the alternate-rule finding sentence.
- `grep -rn "schema 8\|version 8" architecture_overview.md codex.md` returns no statement that 8 is the current version.
- `git diff --stat` lists only the files this package owns.

## Out of scope

- Break placement, such as deferring a break that would force a new Block. Decision 0056 notes this as the remaining error on Jeffco.
- Ending a Block when it is idle longer than a set time.
- Look-ahead or exact optimisation, including a hard vehicle constraint inside the chaining step.
- A per-vehicle cost in Costing, and peak vehicles on the Blocking tab or in Costing outside the dialog.
