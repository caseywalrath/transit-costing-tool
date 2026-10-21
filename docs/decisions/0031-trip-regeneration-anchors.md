# Decision 0031: Trip Regeneration Anchors

- Status: Accepted
- Date: 2026-10-20

## Decision

Regeneration uses a one-time anchor selection in the review dialog. First departure is the default. Users may set all selected trips to first departure, last timepoint, or a shared served timepoint, then override individual trips. The saved anchor time remains fixed. The domain calculates other times with a runtime band applicable to the resulting first departure. Zero or multiple consistent departures stop the write. The application rechecks trip, pattern, runtime, assignment, and block inputs before applying an atomic update. Anchor choices are not stored on trips.
