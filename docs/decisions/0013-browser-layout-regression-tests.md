# Decision 0013: Browser layout regression tests

## Status

Accepted on 2026-09-13.

## Context

The Trips schedule uses a dense HTML table with sticky columns and native selectors. CSS source assertions and TypeScript checks can verify that a rule exists, but they cannot verify the browser's final layout. In particular, the shared table width rule caused the Pattern column to expand to unused available width despite a narrower selector rule.

## Decision

Use Playwright for focused browser-rendered layout regression tests where geometry is part of the acceptance criteria.

The initial fixtures are isolated from IndexedDB and user projects. The Trips table fixture renders long pattern names and asserts that:

- the Pattern column is no wider than its selector, allowing one pixel for browser rounding;
- the selector remains no wider than 96 pixels;
- the schedule table uses its content width rather than expanding to its scroll region;
- the selector uses the compact 0.8 rem font size.

The Runtime table fixture verifies that From and To are adjacent compact fields, that its spacing buffer comes after To and before the runtime segments, and that the table does not stretch across unused width.

Run the test with `pnpm test:ui`. It starts a local Vite server and Chromium. Playwright saves a screenshot when the test fails.

## Consequences

- Geometry regressions can be detected before user review.
- UI changes that affect dense tables should add or update a browser layout test when they have a measurable size, overflow, sticky-position, or typography acceptance criterion.
- The test fixture must remain independent of a user's local IndexedDB records.
