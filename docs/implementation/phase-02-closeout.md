# Phase 2 Closeout: Runtime and Trip Generation

## Status

Accepted on 2026-09-11. Phase 3 has not started.

## Accepted scope

- Pattern-specific runtime profiles use ordered half-open runtime bands and explicit service-day assignments.
- The Trips tab creates, previews, persists, regenerates, and displays materialized trips using 24-plus service time.
- Each generated departure resolves its own applicable runtime band before times are propagated across its pattern.
- Generated trip sequences retain stable logical positions. Regeneration preserves surviving trip IDs, removes deleted block references, and warns before overwriting manual shifts or pattern changes.
- Initial generation and regeneration atomically persist the generation set, affected trips, and affected blocks.
- Complete backup/import and scenario duplication include Phase 2 runtime and trip records as independent, validated graphs.
- The visible CSV export action now downloads stable Route and Phase 2 CSV files for the open route: runtime bands, generation sets, trips, scheduled points, and any blocks that reference its trips.

## Acceptance review

| Criterion | Result |
| --- | --- |
| Runtime selection per departure | Covered by runtime and trip-generation domain tests. |
| Rules outside React and Dexie | Confirmed by dependency and application-port review. |
| Instructions and trips persist | Confirmed by application and repository tests, including initial atomic generation. |
| Overrides visible and previewed | Confirmed by domain tests and Trips-tab review. |
| No write before regeneration confirmation | Confirmed by preview/apply service boundary and dialog wiring review. |
| Stable IDs and clean block references | Confirmed by regeneration and backup tests. |
| Independent duplication and import | Confirmed by backup, repository, and scenario tests. |
| Stable CSV and 24-plus time | Confirmed by serializer tests and export-action integration. |
| 500-trip capacity | Covered by the 500-trip generation test and prior Trips-tab browser review. |
| Reload and visual review | Local application reload and Phase 2F schedule review passed. |

## Verification

- Vitest: 12 files and 57 tests passed.
- TypeScript typecheck: passed.
- Production Vite build: passed.
- Browser review: local application reload, primary navigation, save-state text, and the Trips-tab prerequisite state passed. The Phase 2F review had already exercised a 138-trip, seven-minute schedule, generation preview, compact timepoint expansion, and dense schedule layout.
- Repository status: Git has not been initialized in this local directory, so no Git status or commit exists.

## Documentation review

- `architecture_overview.md`, `codex.md`, and the Phase 2 plan now record acceptance.
- `docs/data-schema.md`, `docs/domain-glossary.md`, the Phase 2 decisions, backup version documentation, and `docs/ui-conventions.md` already describe the accepted behavior. No new architectural decision was required by the final CSV wiring.

## Recommended next package

Phase 3 should define manual blocking domain behavior, block validation, and block-level revenue/platform-hour summaries. Recommend Luna for the bounded structural package after a Phase 3 plan is approved. A later Terra package should own blocking-page layout, trip-to-block interaction, and visual validation findings.
