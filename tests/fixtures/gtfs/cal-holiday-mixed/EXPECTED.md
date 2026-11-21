# cal-holiday-mixed — expected answers

Hand-worked under Decision 0089 items 15, 16, 18, 19 and 20. Two routes. Same calendar as `cal-holiday-saturday`, but on Monday 2026-01-19 `WKDY` is removed and a service `HOL` (not in `calendar.txt`) is added. `HOL` carries R1 trips that match R1's Saturday trip (stops A–B, 08:00) and R2 trips that match R2's Sunday trip (stops C–D, 10:00). R2's Saturday trip leaves at 08:15, so it differs.

- **Range:** 2026-01-05 to 2026-02-01, 28 dates.
- **Day groups, largest first:** `{WKDY}` 19 dates, 2 trips; `{SAT}` 4 dates; `{SUN}` 4 dates; `{HOL}` 1 date (0119), 2 trips, added `HOL`, removed `WKDY`, trip delta 0, routes R1 and R2.
- **Default dates:** weekday 2026-01-20, saturday 2026-01-17, sunday 2026-01-18.
- **Holiday candidates:** one, 2026-01-19. R1 is `saturday`, R2 is `sunday`. The routes disagree, so the scenario class is `unique`.
- **Holiday days proposed:** Holiday on 2026-01-19 (dates: 0119 only).
- **Annual counts (classes: 0119 = Holiday):** Weekday 19, Saturday 4, Sunday 4, Holiday 1 of 28. Scaled by 365 / 28: 247.68, 52.14, 52.14, 13.04 → floors 247, 52, 52, 13 (364); the one left goes to Weekday → 248, 52, 52, 13.
