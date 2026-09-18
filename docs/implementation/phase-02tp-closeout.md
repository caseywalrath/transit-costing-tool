# Phase 2TP Closeout: Trip Profiles

## Status

Implemented and user-accepted on 2026-09-14. The later Phase 2R integration work and Phase 3 gates are complete; Blocking remains deferred to Phase 4 planning.

## Delivered

- Added scenario-wide `TripProfile` records with a provisioned `Default` profile for new scenarios and legacy imports.
- Added Trip-profile ownership to authoritative Trips and Blocks while retaining Runtime profiles as independent calculation inputs.
- Scoped authoritative Trip generation, Add, pattern changes, recalculation, shifting, deletion, schedule queries, and CSV exports to the selected Trip profile.
- Added compact Trip Profile controls below the Trips section header and above the schedule table; Route, Day, and Direction remain in the shared workspace row.
- Implemented named profile copy across all Routes and service days with fresh Trip IDs, preserved times/provenance, no copied Blocks, atomic persistence, and automatic selection of the new profile.
- Implemented impact-reviewed profile deletion with stale-review protection, complete branch deletion, Block activity counts, and last-profile protection.
- Added Dexie schema version 3 indexes and migration provisioning, JSON backup schema version 4 normalization/remapping, and Trip/Block CSV profile IDs and names.
- Updated the architecture, data schema, glossary, UI conventions, and Decision 0016 to reflect the accepted implementation.

## Verification

- TypeScript typecheck: passed.
- Vitest: 17 files, 106 tests passed.
- Playwright UI regression: 6 tests passed with one worker, including the Trip-profile lifecycle regression.
- Production build: passed. Vite reports the existing single-bundle size warning (about 510 kB minified).
- Browser review: Trip Profile controls render below the Trips header and above the schedule table, with Weekday/Saturday/Sunday/Holiday ordering, an empty profile showing the existing empty schedule state, and Runtime controls remaining in Runtimes.

## Review gate

Hands-on verification of profile creation through Copy, switching, Rename, Delete/cancel, last-profile protection, and profile isolation across Trips was accepted on 2026-09-14. Blocking remains a separate Phase 4 effort and requires an updated plan and approved Package 4A before implementation.
