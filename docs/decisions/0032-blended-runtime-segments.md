# Decision 0032: Blended Runtime Segments

- Status: Superseded for new profiles by Decisions 0033 and 0035 item 1; retained for saved legacy profiles
- Date: 2026-10-21
- Supersedes: Decision 0003 item 4 (one band for the full trip) for blend profiles
- Superseded in part by: Decision 0033 adds the `segmentStart` method; Decision 0035 item 1 makes `segmentStart` the default for new profiles; Decision 0045 makes every profile of a Route use one method

## Decision

Each runtime profile may use the existing single-band method or blended segments. Single-band remains the default for existing profiles. The blend method treats each band's segment duration as a rate for completing that segment. A segment crossing a boundary earns progress at the first band's rate until the boundary, then at the next band's rate. The segment's completion time is rounded to a whole second. At gaps, the nearer band supplies the rate. The edge bands continue beyond the profile's outer bounds once a trip has started within a defined band.

The calculation method is an authoritative profile input and changes its calculation revision. Existing trip times remain saved until explicit regeneration. Blended regeneration searches departures that reproduce the selected fixed timepoint. The optional Trips table shading colors each single-band Trip segment by the band containing its first departure. Blended segment contributions are shown only when current profile calculations reproduce the saved trip times. Cells without an attributable band retain normal table striping.

## Consequences

The Runtimes Actions menu owns the profile method. The Trips Actions menu owns the optional display setting. The blend does not use the single-band nearest-band or manual-band exceptions.
