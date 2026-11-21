# Direction names: closeout

- Plan: `docs/implementation/direction-names.md`. Rules: Decision 0088.
- Branch: `claude/sweet-allen-m3vw3x`. Closed 2026-11-21.
- Status: implemented. Gate C (user) is open.

## Packages

| Package | Model | Commit | Result |
|---|---|---|---|
| DN0 | Opus | 21d8001 | Decision 0088 and the plan |
| DN1 | Haiku | 562847a | `ensureManagedDirections` keeps a stored name; `directionDisplayName`, `directionNameProblem`; `renameDirection` on the service; 6 tests |
| DN2 | Opus | fafe561 | Route details two-column grid with Outbound name and Inbound name; `directionGroupLabel` and `sharedDirectionName`; blocking dialog labels; `tests/ui/direction-names.spec.ts` (2 tests); screenshots in `output/direction-names/` |
| DX | Opus | this commit | Documentation and closeout |

## Questions resolved during the work

- **DN1, missing other record.** `directionNameProblem` skips the clash check when the other group has no record. It cannot happen through `renameDirection`, which normalises both records first.
- **DN1, unchanged name.** `renameDirection` returns without writing when the stored name already equals the new one.

## Differences from the plan

- **Automatic blocking headings.** The dialog groups patterns by Route, so each Route's headings use that Route's own name ("Outbound (Southbound)") rather than a name shared by every Route. The minimum layover dialog covers all Routes and uses the shared name only. Decision 0088 records this.
- **Generated chip check.** The spec checks the generated short name through the Pattern short name placeholder on the Route tab ("SB"), not on the Trips tab. Both use `patternShortName`.
- **Field role.** The suggestion list makes the name fields comboboxes, so the spec finds them by that role.
- **Minimum layover title.** With default names the title stays "After outbound trips", as before; with a shared name it reads "After Outbound (Southbound) trips".

## Verification

- `pnpm typecheck`: clean.
- `pnpm test`: 105 files, 1781 tests passed.
- `pnpm build`: passed.
- Heights at 1440 and 1200 px: Route details 239 px (with the empty route name error showing), Annual service days 261 px. At 1024 px the panels stack.
- Full browser suite: running when this file was committed; the result is recorded in the next commit.

## Gate C (user)

1. On Federal BRT, open the Route tab. In Route details, type "Southbound" in Outbound name and "Northbound" in Inbound name.
2. Check the Trips tab Direction toggle, the side-by-side view and the pattern chips.
3. Export the stop schedule and check the direction titles.
