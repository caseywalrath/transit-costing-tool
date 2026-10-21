# Decision 0033: Segment-Start Runtime Bands and Trip Table Time Display

- Status: Accepted
- Date: 2026-10-21

## Decision

Add `segmentStart` as a runtime-profile calculation method. The trip must start within a defined band. Each segment uses the duration from the band containing that segment's start time, even if the segment crosses a band boundary. At a gap or beyond the outer bands, use the nearest band, matching the prior blend's fallback. Durations are added as entered; the calculation does not introduce fractional seconds. Explicit seconds in a departure, headway, or segment runtime remain exact.

Keep the existing `blendSegments` method for saved profiles and trips. Label it as a legacy continuous blend in the Runtime Actions menu. Switching to `segmentStart` increments the profile calculation revision and requires explicit Trip regeneration. Existing saved Trip times are not rewritten.

The Trips Actions menu has an off-by-default **Round displayed times** option. It rounds table clock times to the nearest minute, with exactly 30 seconds rounded up. The default table view shows seconds whenever they are nonzero. Rounding affects only visible clock values in the Trips table; it does not change saved trips, runtime calculations, validation, previews, or exports. The band shading uses one color per segment for the `segmentStart` method when current profile calculations reproduce saved Trip times.

## Consequences

- Segment-start band changes appear as steps between timepoints rather than inside a segment.
- Existing continuous-blend profiles remain readable and keep their saved calculation meaning until the user changes their method.
- Table rounding can differ from exact Run Time or layover durations; those durations remain exact.
