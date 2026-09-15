# Decision 0004: Trip Regeneration and Manual Changes

- Status: Superseded for Phase 2R by Decision 0010
- Date: 2026-09-10

## Context

Users will generate repeated trips, then may shift individual trips or change their patterns. Changing a generation set can conflict with those edits and with later block assignments.

## Decision

Regeneration overwrites manual trip-time shifts and manual pattern changes within the affected generation set. Before writing, the application presents an impact preview and requires confirmation.

The operation executes in one transaction.

Generated trips use a stable logical key consisting of generation-set ID and generation sequence. When a logical position survives regeneration, reuse its trip ID. Preserve block references to surviving trip IDs and rerun block validation. Remove deleted trip references from blocks. Add new trips without block assignments.

## Required preview information

- trips added;
- trips removed;
- trips whose scheduled times change;
- manual time shifts overwritten;
- manual pattern changes overwritten;
- affected blocks;
- block references that will be removed.

## Consequences

- The generation set remains authoritative for its generated trips.
- Regeneration does not silently discard manual work.
- Stable IDs reduce unnecessary loss of block assignments.
- A regenerated schedule can invalidate a previously valid block, so validation must run after the transaction.
- Undo is not included by this decision; complete project backup remains the recovery mechanism until undo is designed.

## Deferred items

- Selective preservation of individual manual overrides.
- Locking trips against regeneration.
- Interactive merge of generated and manual schedules.
