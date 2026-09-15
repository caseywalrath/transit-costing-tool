# Phase 1 Closeout: Route Definition Foundation

## Status

Phase 1 is implemented and verified through Package 1C. Work is paused for user review. This document does not define or authorize the next phase.

## Delivered result

The application supports locally saved projects and scenarios, the four standard service-day definitions, routes, reusable nodes, full and short patterns, repeated-node loop patterns, deterministic pattern-point ordering, cumulative and derived segment miles, independent reverse patterns, JSON project backup and restore, and four route-definition CSV exports.

Package 1C added `RouteDefinitionService` as the application-layer facade. The React UI now sends route-definition use cases through that facade. The facade coordinates pure domain behavior, repository writes, validation, backup and CSV operations, derived segment miles, and visible save status.

New project creation and its initial scenario graph are saved in one project-snapshot transaction. Existing scenario, route-aggregate, and project-restore writes remain transactional.

## Architecture acceptance

- Domain modules do not import React or Dexie.
- The Route UI does not import Dexie, persistence serializers, or domain command implementations.
- The composition root creates the Dexie repository, backup service, and application service.
- Authoritative validation, reverse-pattern behavior, pattern normalization, and segment-mile derivation remain outside React.
- No IndexedDB schema change or data migration was required for Package 1C.
- No Phase 1 data-schema deviation was approved; `docs/data-schema.md` remains current.

## Verification record

Completed on 2026-09-10:

- TypeScript typecheck: passed.
- Vitest: 9 test files and 32 tests passed.
- Production build: passed; Vite transformed 45 modules.
- Application workflow test: project, four service days, route, nodes, pattern, reverse pattern, validation, persistence reload, segment miles, and CSV export set passed.
- Save-status test: idle, saving, saved, and failed-write behavior passed.
- JSON tests: complete graph round trip, copy-mode identifier remapping, collision handling, malformed input, unsupported version, and relationship validation passed.
- CSV tests: stable headers, escaping, decimal miles, and repeated pattern points passed.
- Browser reload: the selected project, scenario, route, service-day counts, nodes, and patterns persisted and reopened.
- Visual inspection: the accepted compact Route interface rendered correctly at the available desktop viewport.
- Representative data present in the local browser: full, short, loop, and reverse patterns, including repeated nodes and zero holiday service days.

The in-app browser did not surface application-created blob downloads as ordinary browser download events. The JSON and CSV controls executed without an application error; file contents and restore behavior are covered by the deterministic automated tests above.

## Closeout discussion topics

Before outlining subsequent work, review:

1. whether the current project, scenario, route, node, and pattern concepts match the intended planning workflow;
2. whether route-pattern editing is sufficiently clear for full, short-turn, staggered, and loop service;
3. whether local-only storage plus explicit JSON backup is acceptable for substantive planning work;
4. whether the compact table density and commit-on-blur editing behavior should remain the baseline;
5. which Phase 1 friction points should be corrected before extending the data model;
6. how the Federal Boulevard workbook should be used for the next user-verification example without copying its spreadsheet structure literally.

No subsequent implementation package should be drafted or started until this discussion is complete and the user explicitly approves that planning work.
