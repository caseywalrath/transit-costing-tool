# cal-holiday-unique — expected answers

Hand-worked under Decision 0089 items 15, 16, 18, 19 and 20. One route, R1, with `WKDY` (2 trips), `SAT`, `SUN` and two holiday services: `HOL1` (2 trips, 09:30 and 12:00) and `HOL2` (1 trip, 10:30). `WKDY` Monday to Friday 2026-01-05 to 2026-01-30, `SAT` and `SUN` to 2026-02-01. `WKDY` is removed on 2026-01-19, 2026-01-26 and 2026-01-28. `HOL1` is added on 0119 and 0128, `HOL2` on 0126.

- **Range:** 2026-01-05 to 2026-02-01, 28 dates.
- **Day groups, largest first:** `{WKDY}` 17 dates, 2 trips; `{SAT}` 4; `{SUN}` 4; `{HOL1}` 2 dates (0119, 0128), 2 trips, trip delta 0; `{HOL2}` 1 date (0126), 1 trip, trip delta −1.
- **Default dates:** weekday 2026-01-20, saturday 2026-01-17, sunday 2026-01-18.
- **Holiday candidates:** 0119, 0126, 0128. None of their trips is a Saturday, Sunday or weekday trip, so every candidate is `unique` for R1 and for the scenario.
- **Holiday days proposed:** Holiday on 2026-01-19 (2 trips; ties with 0128, the earlier date wins) with dates 0119 and 0128 (same trips); Holiday 2 (key `custom1`) on 2026-01-26 (1 trip, different trips).
- **Annual counts (classes: 0119, 0128 = Holiday; 0126 = Holiday 2):** Weekday 17, Saturday 4, Sunday 4, Holiday 2, `custom1` 1 of 28. Scaled by 365 / 28: 221.61, 52.14, 52.14, 26.07, 13.04 → floors 221, 52, 52, 26, 13 (364); the one left goes to Weekday → 222, 52, 52, 26, 13.
