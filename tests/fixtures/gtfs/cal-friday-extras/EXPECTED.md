# cal-friday-extras — expected answers

Hand-worked under Decision 0089 items 15, 16 and 20. One route, R1. `WKDY` (2 trips) Monday to Friday, `FRI` (1 extra trip) Fridays only, `SAT`, `SUN`, all 2026-01-05 to 2026-01-27. No `calendar_dates.txt`.

- **Range:** 2026-01-05 to 2026-01-27, 23 dates (17 Monday–Friday, 3 Saturdays, 3 Sundays). The middle is Friday 2026-01-16.
- **Typical sets:** Monday to Thursday `{WKDY}`; Friday `{FRI, WKDY}`; Saturday `{SAT}`; Sunday `{SUN}`.
- **Day groups, largest first:** `{WKDY}` 14 dates, 2 trips; `{FRI, WKDY}` 3 dates (0109, 0116, 0123), 3 trips; `{SAT}` 3 dates; `{SUN}` 3 dates. Every group is the typical set of its day, so no group has added or removed services.
- **Default dates:** weekday 2026-01-15. The typical Monday–Friday sets differ; `{WKDY}` covers 14 Monday–Friday dates and `{FRI, WKDY}` covers 3, so `{WKDY}` is used. The middle date 0116 has the Friday set and is skipped; Thursday 0115 is the nearest date with `{WKDY}`. Saturday 2026-01-17. Sunday 2026-01-18.
- **Holiday candidates:** none.
- **Annual counts (default classes):** Weekday 17, Saturday 3, Sunday 3 of 23 dates. Scaled by 365 / 23: 269.78, 47.61, 47.61 → floors 269, 47, 47 (363); the two left go to the largest remainders: Weekday, then Saturday (Saturday and Sunday tie; the earlier service day wins) → 270, 48, 47.
