# Decision 0002: Service-Day Time Model

- Status: Accepted
- Date: 2026-09-10

## Context

Transit schedules commonly represent after-midnight service as part of the prior service day. The application must display times such as 25:00 and must not depend on calendar dates for routine schedule calculations.

## Decision

Store schedule times as non-negative integer seconds from service-day midnight. Store durations as integer seconds. Convert to and from display strings through shared domain utilities.

Examples:

```text
23:45 -> 85,500 seconds
25:00 -> 90,000 seconds
27:30 -> 99,000 seconds
```

Runtime bands use half-open intervals: start is inclusive and end is exclusive.

## Consequences

- Time comparisons and arithmetic work across midnight without date handling.
- The interface can display hours above 24.
- Duration values cannot be confused with formatted clock strings.
- CSV export must use a 24-plus formatter rather than ordinary locale time formatting.
- Parsing must reject invalid minutes and seconds while permitting extended hours.
- A later GTFS exporter can translate the same representation directly.

## Deferred items

- A maximum supported displayed hour.
- Separate arrival and departure timestamps at timepoints.
- Calendar-date exceptions beyond service-day categories.
