# Route stops table: closeout

- Plan: `docs/implementation/route-stops-table.md`. Rules: Decision 0087.
- Branch: `claude/sweet-allen-m3vw3x`. Closed 2026-11-20.
- Status: implemented. Gate C (user) is open.

## Packages

| Package | Model | Commit | Result |
|---|---|---|---|
| RS0 | Opus | ec1c67c | Decision 0087 and the plan |
| RS1 | Haiku | bcee24c | `src/domain/routeStopManagement.ts`: usage, edits, split, split all, delete, merge; 11 tests |
| RS2 | Haiku | 994fc1f | Service methods, restore point kinds and coverage, messages; 10 service tests, coverage and round-trip cases |
| RS3 | Opus | 17adca3 | Stops section and its four dialogs; `tests/ui/route-stops-table.spec.ts` (4 tests); screenshots in `output/route-stops-rs3/` |
| RS4 | Opus | 28a9aef | Route-wide location import; drawer link notice with Undo link; 2 tests; screenshot in `output/route-stops-rs4/` |
| RX | Opus | this commit | Documentation and closeout |

## Questions resolved during the work

- **RS1, split refusal.** Patterns without a direction neither move nor count as another direction. A stop used by one direction and by patterns without a direction cannot be split (Decision 0087 item 4).
- **RS1, test 6.** The plan's fixture could not show a keeper direction that does not use a shared stop. A third direction (D3, pattern P5, stop S4) was added.
- **RS2, error messages.** The three command messages live in the application layer (`routeStopCommandMessage`), because it must not import UI code.

## Differences from the plan

- **Placement.** The section is full width below Nodes and Patterns, not between them, so its seven columns fit. Decision 0087 records this.
- **Read-only while the drawer is open.** While a pattern's Stops drawer is open the section is read-only, so the two editors never write one stop set at once.
- **Pasting.** Pasting fills across all five editable columns (Stop through Speed), not only the location and ID columns.
- **Import dialog wording.** `StopLocationImportDialog` takes `scope="route"` for the section, so its rows are headed "Stop".
- **Undo link.** A row whose link was undone is not linked again by its typing.

## Verification

- `pnpm typecheck`: clean.
- `pnpm test`: 105 files, 1775 tests passed.
- `pnpm build`: passed.
- Full browser suite after RS4: 404 passed, 3 skipped. The skipped tests include the screenshot test, which runs only when `RS_SHOTS` names a folder.
- RX changes documentation only, so the suite was not run again.

## Gate C (user)

1. On Federal BRT, open Route tab → Stops → ⋯ → **Split all shared stops…**.
2. Keep Southbound, enter the suffixes "SB" and "NB", and tick "Add the suffix to the kept stops too".
3. Enter or import the Northbound stop IDs and locations.
4. Check the Stops drawers of both directions.
