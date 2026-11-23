# cal-school-days — expected answers

Hand-worked under Decision 0089 items 15, 16 and 20. One route, R1. `BASE` runs Monday to Friday 2026-01-05 to 2026-02-06. `SCHOOL` adds a second trip Monday to Friday 2026-01-12 to 2026-01-23. No weekend service. No `calendar_dates.txt`.

- **Range:** 2026-01-05 to 2026-02-06, 33 dates (25 weekdays, 4 Saturdays, 4 Sundays).
- **Service sets:** school dates (10 weekdays, 0112–0123) `{BASE, SCHOOL}`; the other 15 weekdays `{BASE}`; the 8 weekend dates `{}`.
- **Typical sets:** every day of Monday to Friday `{BASE}` (each has 3 of 5 dates without school); Saturday and Sunday `{}`.
- **Day groups, largest first:** `{BASE}` 15 dates, 1 trip; `{BASE, SCHOOL}` 10 dates, 2 trips (added `SCHOOL`, trip delta +1, routes R1); `{}` 8 dates, 0 trips.
- **Default dates:** weekday 2026-01-26. The middle of the range is 2026-01-21, a school date, so it is skipped: school dates are the less common set and are not the typical set of any day. 0126 (Monday) is the nearest date with the typical set. No default for Saturday or Sunday (typical set is empty).
- **Holiday candidates:** none (no `calendar_dates` rows).
- **Annual counts (default classes):** Weekday 25, Saturday 4, Sunday 4 of 33 dates. The 8 weekend dates have no trips and are listed as unmatched. Scaled by 365 / 33: 276.52, 44.24, 44.24 → floors 276, 44, 44 (364), the one left goes to the largest remainder (Weekday) → 277, 44, 44.
