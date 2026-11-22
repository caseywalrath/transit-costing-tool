# GTFS Export — Closeout

- Date: 2026-11-22
- Decision: `docs/decisions/0090-gtfs-export.md`
- Plan: `docs/implementation/gtfs-export-phase-e.md`; cards and as-built notes `docs/implementation/gtfs-export-phase-e-cards.md` (sections 9, 12)
- Branch: `claude/dazzling-tesla-znfnl8`

## What was built

- **Stop identity** (E1): one GTFS stop per stop ID within 30 m; generated IDs for stops and timepoints without one; conflicts and unlocated stops refuse.
- **Remembered settings** (E1b): `Scenario.gtfsExportSettings`, backup schema 18.
- **Feed builder** (E2): agency, stops, routes, trips, stop times (timepoints and derived stops), calendar and holidays, straight-line shapes, feed info, checks, report CSV.
- **Dialog, service and worker** (E4): Scenario menu and Project menu entries; live checks; problems table with "Open on Route tab" and "Download list"; ZIP and report download.
- **Read-back** (E5): every export imports back through phase I with the same trips, times, running hours and blocks.

## Results

- RTD whole feed (130 Routes, 26,139 trips, 1,961 blocks): export 4.6 s in Node (worker in the app), ZIP 54 MB uncompressed, read back identical on all 834 Route-day-direction groups and all blocks.
- Federal BRT: refused until its 56 timepoints get locations; with locations, 984 trips and 69 blocks export. Its Holiday equals Sunday, so on read-back the Holiday day becomes Sunday (Decision 0090 consequence; no trips lost on the other days).
- Fixed in E5: the dialog's block count counted block names across days (Federal 18, now 69).

## Not done (backlog)

See `docs/backlog.md`, "GTFS export follow-ups". Gate V-E (load an export in the Analysis app and the MobilityData validator) is the user's check and still open.

## Verification

- Unit tests: 2,361 passed; typecheck clean; build succeeds.
- Browser: see the final run below.
