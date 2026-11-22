# GTFS Import — Closeout

- Date: 2026-11-22
- Decision: `docs/decisions/0089-gtfs-import.md`
- Plans: `docs/implementation/gtfs-interoperability.md` (programme), `docs/implementation/gtfs-import-phase-i.md` (sub-plan, cards I0–I10 and as-built notes, sections 20, 22, 25, 26)
- Branch: `claude/dazzling-tesla-znfnl8`

## What was built

- **Reading feeds** (`src/persistence/gtfs/`): ZIP (stored or deflated, files in a folder) and CSV with BOM, CRLF and quoted fields.
- **Translation** (`src/domain/gtfs/`): calendars and day groups, default dates, holidays, part-year routes, annual counts; directions, patterns, timepoints, Nodes, stops and distances; run-time bands, trips (including frequencies), blocks (minutes required), and the import report with a fidelity check.
- **Import service and worker** (`src/application/gtfs/`): three levels (new Project, new Scenario, Routes added to the open Scenario), one transaction, a restore point for Undo.
- **Import dialog** (`src/ui/gtfs/`): five steps (feed, routes, days, options, review), from three menu entries; import note, "Feed" tag on trips, Cost summary footnote.
- **Per-route counts**: stored on the Route (backup schema 17), used by Costing on both bases, edited on the Route tab, marked in Costing; "Add service day…".
- **Converter**: `tools/gtfs_to_backup.mjs`.

## Scale (RTD, 130 Routes, 26,139 trips)

Translation about 1 s after the I10 fixes (was 4 s); browser import of the 82 MB backup about 8 s; Costing estimate about 9 s; Blocking under 0.5 s. No hard import limit; the warning above 40 Routes or 5,000 trips per day stays.

## Not done (backlog)

- Delete a custom service day, and a Day menu instead of buttons at five or more days (card I9c; user chose backlog 2026-11-22).
- Seed planned frequencies from `frequencies.txt` (option shown disabled).
- Holiday trips-and-hours difference report (item 19).
- Costing speed with 100+ Routes; Route switcher search (M1).
- Gate V-I (the user's check of the RTD backup) was deferred by the user and is still open.

## Verification

See the commit messages and the final results section below.
