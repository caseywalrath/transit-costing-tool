# Packages MR1 and MR2: Most-recently-ready vehicle choice

- Status: Planned (2026-11-04); waiting for the user to accept Decision 0056 and say "Proceed with MR1".
- Rules: Decision 0056 (`docs/decisions/0056-most-recently-ready-vehicle.md`). Read it in full first. This plan does not repeat its reasoning.
- Branch: `claude/admiring-sagan-4lfwzp`. Commit each package separately with a clear message. Never push to another branch. Do not open a pull request.
- Implementer: a Sonnet-class model starting each package with fresh context. Each package is self-contained: read "Read first", then your package section, and touch only the files your package owns.
- Gate: after each package, run that package's acceptance checks and report the results to the user. The primary agent reviews before the next package starts. Do not start the next package on your own (AGENTS.md).

| Package | Content | Class / model |
|---|---|---|
| MR0 | Decision 0056, this plan | Done (primary agent) |
| MR1 | Engine choice rule, break measurement fix, reference script, unit tests, Golden regression test | Structural (Luna) / Sonnet |
| MR2 | Dialog intro text, documentation, full verification, closeout | Structural (Luna) / Sonnet. The text is fixed by Decision 0056 item 7, so no design judgment is needed. |

## Read first (both packages)

1. `AGENTS.md` and `codex.md`. `codex.md` has the commands, and the browser-test setup with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`.
2. Decision 0055 items 4, 7, 11 and 12, and Decision 0056.
3. `src/domain/autoBlocking.ts`:
   - `chainPass` (about lines 300 to 348). The candidate loop is at about lines 313 to 326.
   - `measureBuiltBlocks` (about lines 547 to 620). The break block is at about lines 558 to 579.
4. `src/domain/autoBlocking.test.ts`: the `outAndBack` fixture (about line 142), the "reference results from synthetic-check.py" tests (about line 198), and "measureBuiltBlocks and checkAgainstBuiltBlocks" (about line 395).
5. `src/application/autoBlocking.test.ts`: "previews the reference numbers without writing" (about line 100) and the creation test (about line 126).
6. `docs/implementation/automatic-blocking/synthetic-check.py`.
7. `src/testSupport/goldenBackup.ts`: `goldenRaw()` returns the Golden (Federal BRT) backup.

Repository rules for both packages:
- Use the file-edit tool for source and documentation edits. Do not use shell redirection or `sed` on files.
- Keep domain code free of React and IndexedDB.
- Do not change any other behaviour of automatic blocking or of hand blocking.

## Package MR1: engine, measurement, reference script and tests

### Files owned

- `src/domain/autoBlocking.ts`
- `src/domain/autoBlocking.test.ts`
- `src/domain/autoBlocking.golden.test.ts` (new)
- `src/application/autoBlocking.test.ts` (expected numbers only)
- `docs/implementation/automatic-blocking/synthetic-check.py`

### Steps

1. **Vehicle choice in `chainPass`.** Replace the comparison inside the candidate loop with this logic (Decision 0056 items 1 and 2). Keep the loop over `vehicles` in creation order.
   - `chosen` is replaced by `candidate` when any of these is true:
     - there is no `chosen` yet;
     - `candidate.direct` is true and `chosen.direct` is false;
     - `candidate.direct === chosen.direct` and `candidate.effectiveReady > chosen.effectiveReady`.
   - Use a strict `>` so an equal ready time keeps the earlier-created Block.
   - Do not change how candidates are found, the limits check (`fits`), breaks, deadhead writing, or new-Block creation.
   - Update the function's doc comment to say "the most recently ready Block; direct before deadhead".
2. **Break measurement in `measureBuiltBlocks`** (Decision 0056 item 4).
   - After `longest` is computed, keep only the entries whose gap length in whole minutes (`Math.floor((gap.end - gap.start) / 60)`) is greater than `largestMinimumMinutes + 5`. Call the result `breakGaps`.
   - If `breakGaps` is empty, there is no break rule. This is the current "no break" result.
   - Otherwise:
     - `lengthMinutes = floorTo(Math.min(...breakGaps gap lengths) / 60, 5)`;
     - mark `breakHere` from `breakGaps`, not from `longest`;
     - compute `first` from `breakGaps`.
   - Leave `withBreak`, `shortestSpan`, `intervals` and the rest of the break rule as they are.
   - Remove the old `lengthMinutes > largestMinimumMinutes + 5` test, which the filter replaces. Then check that the measurement line text for the break still reads correctly.
3. **Reference script.** In `synthetic-check.py`:
   - Change the choice to the most recently ready block, with ties going to the earlier-created block. Replace `_, i = min(ready)` with `_, i = max(ready, key=lambda r: (r[0], -r[1]))`, and update the comment on line 35.
   - Run `python3 docs/implementation/automatic-blocking/synthetic-check.py`. Replace the "Expected output" lines in the docstring with the printed results.
   - Add one sentence to the docstring saying that the rule follows Decision 0056.
4. **Domain tests (`autoBlocking.test.ts`).**
   - Change the three "reference results" tests to the new numbers printed in step 3: block count, total minutes, sorted spans, and blocks with a break.
   - Rename each test so its title states the new numbers.
   - Do not change a test's fixture or rules to make it pass.
   - The test "reads minimum layovers, can start/end, and a break from built blocks (matching by name)" must pass unchanged after step 2. If it does not, stop and report. Do not edit that test.
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
     - `revenueSeconds` equals the sum over the built Blocks of that day of (last revenue Trip's last stop time minus first revenue Trip's first stop time).
   - These equalities are the evidence in Decision 0056: about 311.59 h on Weekday, 280.95 h on Saturday, and 245.89 h on Sunday and Holiday. Compute the expected values in the test from the backup; do not hard-code hours.
6. **Application tests (`src/application/autoBlocking.test.ts`).** Change only the expected numbers that come from the 35-minute reference (`blockCount`, `revenueSeconds`, `blocksWithOneBreak`, and the stored `blockCount`) to the step 3 values. Do not change the test logic.

### Acceptance

- `pnpm typecheck` passes.
- `pnpm test` passes. Report the file and test counts.
- The Python script's printed output and the TypeScript reference tests agree, number for number.
- The Golden regression test passes on all four service days.
- `git diff --stat` lists only the files this package owns.

### Report

Report:
- the old and new expected numbers of each reference case;
- the test counts;
- any test you could not make pass without changing its fixture.

## Package MR2: dialog text, documentation, verification, closeout

### Files owned

- `src/ui/blocking/AutoBlockingDialog.tsx` (the intro sentence only)
- Any test that matches the old intro sentence (search `src` and `tests` for "waited longest")
- `docs/decisions/0055-automatic-blocking.md`
- `docs/decisions/0056-most-recently-ready-vehicle.md` (status line)
- `docs/implementation/automatic-blocking.md` (the intro text line, about line 490)
- `docs/implementation/most-recently-ready.md` (status lines)
- `architecture_overview.md`
- `docs/domain-glossary.md`
- `codex.md` (status paragraph)

### Steps

1. **Dialog.** In `AutoBlockingDialog.tsx` (about line 192), replace "Each departure takes the vehicle that has waited longest past its minimum layover; if none is ready, a new block starts." with "Each departure takes the vehicle that became ready most recently after its minimum layover, so spare vehicles finish early; if none is ready, a new block starts." The rest of the paragraph and all markup are unchanged.
2. **Decision 0055.**
   - Add to the header: `- Amended by: Decision 0056 (vehicle choice in item 4; break measurement in item 11)`.
   - In item 4, after the "Which vehicle takes a Trip" and "Deadhead" bullets, add: "Superseded by Decision 0056: the most recently ready vehicle, direct before deadhead." Do not delete the original text.
3. **Decision 0056.** Set the status to "Accepted (user acceptance of <date>); implemented". Use the date the user accepted it. Leave the date as `<date>` and say so in the report if the user did not give one.
4. **`architecture_overview.md`** (the automatic-blocking paragraph, about line 272). Replace "each Trip goes to the open Block that has been ready longest at its first node (arrived and waited its required layover, directly or through a deadhead connection)" with "each Trip goes to the open Block that became ready most recently at its first node (arrived and waited its required layover); a Block already at the node wins over one that needs a deadhead connection (Decision 0056)".
5. **`docs/domain-glossary.md`** (about line 173). Replace "gives each Trip to the open Block that has been ready longest at the Trip's first node" with "gives each Trip to the open Block that became ready most recently at the Trip's first node, preferring a Block already there over a deadhead (Decision 0056)".
6. **`docs/implementation/automatic-blocking.md`** (about line 490). Update the quoted intro text to the step 1 text, and add "(changed by Decision 0056)".
7. **`codex.md`.** Add one sentence to the current-status paragraph: "Decision 0056 (packages MR1 and MR2) changed automatic blocking to give each Trip to the most recently ready vehicle, direct before deadhead; on Golden the automatic Blocks now match the hand-built Blocks' hours." Add the unit-test and browser-test counts from step 8.
8. **Verification.**
   - Run `pnpm typecheck`, `pnpm test` and `pnpm build`.
   - Run `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`. `tests/ui/automatic-blocking.spec.ts` and `tests/ui/keyboard.spec.ts` must pass.
   - Visual check:
     - Start `pnpm dev`, load the Golden project, and open Blocking → Actions → "Build blocks automatically…".
     - Take a screenshot of the dialog and confirm that the intro sentence wraps cleanly at the dialog width.
     - Confirm that the Weekday preview row shows 18 blocks.
9. **Status lines.** Set this plan's status to "MR1 and MR2 implemented on <date>; awaiting user acceptance". Mark MR1 and MR2 done in the table.

### Acceptance

- Every check in step 8 passes. Report the counts.
- `grep -rn "waited longest\|ready longest" src tests docs architecture_overview.md` returns only the original Decision 0055 text, the "Superseded" note, and Decision 0056.
- `git diff --stat` lists only the files this package owns.

### Report

Report:
- the verification counts;
- the screenshot path;
- the Golden Weekday preview numbers seen in the dialog.

## Out of scope

- Break placement, such as deferring a break that would force a new Block. Decision 0056 notes this as the remaining error on Jeffco.
- Ending a Block when it is idle longer than a set time.
- Look-ahead or exact optimisation.
- Any change to stored `autoBlocking` records or to the backup schema.
