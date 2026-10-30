# Decision 0048: Hide Timepoint Columns Without Trip Times

- Status: Accepted and implemented
- Date: 2026-10-30 (user request)
- Amends: Decision 0044 (Trips CSV columns)

## Context

The Trips table and Trips CSV showed every Direction timepoint, so a timepoint served by no displayed Trip (for example one reached only by a Pattern that has no Trips in the selected Trip Profile) appeared as a column of blanks.

## Decision

1. A Direction timepoint column is shown only if at least one displayed Trip has a time at it. One function, `columnsWithTimes`, applies the rule, and the Trips table and the Trips CSV both call it, so the file keeps mirroring the table.
2. When there are no Trips, every column is shown, so a new Direction still shows its structure and the CSV header is complete.
3. While a draft Trip row is open in the table, every column is shown, because the draft row's first-trip time input sits in a timepoint column that may not have a time yet.
4. The table shows no indication of hidden columns.

## Consequences

- Column sets in the CSV can differ between exports of different Service Days, Trip Profiles, or Directions, so exports are not column-aligned with one another.
- Column order, names, and the remaining Trips CSV columns are unchanged.
