# Closeout: Timepoint Stop Names

- Plan: `docs/implementation/timepoint-stop-names.md`
- Decision: `docs/decisions/0092-timepoint-stop-names.md` (now "Accepted and implemented")
- Date: 2026-11-23. Base `141bfda`. Branch `claude/adoring-goldberg-hajvuq`.

## What was built

| Package | Commit | Model | Result |
|---|---|---|---|
| N0 documentation | `3099e71` | Opus | Architecture overview, data schema version 19, header notes on Decisions 0080, 0085, 0089, 0090, AGENTS.md exception |
| N1 storage and backup | `0ff8566` | Haiku high | `timepointStopNamesByPatternId`, normalize, display helper, prune, reconcile, remap, persistence checks, backup schema 19, `saveRouteStops` |
| N3 outputs and GTFS | `693e521` | Haiku high | `stopTimeRows` names; GTFS export `stop_name` and the `stopNameDiffers` warning; GTFS import stores the feed `stop_name`; export→import round trip |
| N2 Fill and Copy | `556ad37` | Haiku xhigh | `planNames`, `applyTimepointNamePlan`, service fill, copy, stale check |
| N4 Stops drawer | `b4670fb` | Haiku xhigh | Stop name field on each timepoint row, preview table and skip groups, location-import matching |
| N5 closeout | `760f9d5` and this commit | Opus | Review fixes, documents |

Every card ran once. None was returned to its worker.

## Deviations from the plan

- The user asked for the whole plan in one run, so the run did not stop at the end of each sitting. Gate G-N4 sent its screenshots and continued, as Part 2 allows.
- N1: a blank stored name is refused by the backup shape check ("must be a non-blank string") before the stop-set check runs. Both checks are tested.
- N3:
  - The round-trip test is in `readBack.test.ts`, the file the card named as an option.
  - `stopNameDiffers` also warns when a Route stop and a timepoint share a stop ID and have different names. This matches Decision 0092 item 8 ("records merged under one stop_id").
- N2: no placeholder plan objects were needed. Opus corrected the `nodeNames` comment.
- N4:
  - The copy-mode preview table has a Pattern column, as the stop ID table does.
  - The CSS was left unchanged, then fixed in N5 (see the review section).

## Verification

- Baseline: 2552 unit tests. Final: 2594 unit tests passed; typecheck passed; build passed.
- Full browser suite: 440 passed, 3 skipped (screenshot-only tests), 2 failed:
  - `keyboard.spec.ts:134`: a timeout waiting for the "Undo history…" menu item.
  - `route-save-race.spec.ts:33`: a node count read during a save race.

  Both specs passed when re-run alone (3 passed). Neither touches stop names. Both are timing failures under the full parallel run.
- After the CSS fix, `route-stops` and `route-stops-table` were re-run: 16 passed, 1 skipped.
- Golden GTFS fixtures: unchanged.

## `/code-review` (high) findings

| Finding | Outcome |
|---|---|
| The name input took the timepoint `th` label type (small semibold) | Fixed: `route.css` gives it body type and a small top margin |
| `architecture_overview.md` paragraph did not say how names are edited or name schema 19 | Fixed |
| `pruneRouteStopSets` comment named only stop IDs | Fixed |
| Plan log and status not updated | Fixed |
| The `stopNameDiffers` warning shows the differing name, not the exported one | Not fixed: the warning text says the first name is exported, and `stops.txt` shows it. Backlog. |
| Fill normalizes (trims) the whole draft name entry, not only the filled points | Not fixed: the stop ID Fill already does this (Decision 0080 code). Changing one and not the other would split the behavior. Backlog, for both. |

## Skipped items

- The G-N4 screenshots were sent at 1×, not 2×. The check was made at 1×, and the layout showed no wrapping and no horizontal scroll at 1280 px or 900 px.
- No `--repeat-each` flake runs were made on the new browser tests. The plan does not require them.
