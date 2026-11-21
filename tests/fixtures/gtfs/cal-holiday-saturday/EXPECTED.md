# cal-holiday-saturday — expected answers

Hand-worked under Decision 0089 items 15, 16, 18, 19 and 20. Two routes, R1 and R2, each with one trip per service. `WKDY` Monday to Friday 2026-01-05 to 2026-01-30, `SAT` and `SUN` to 2026-02-01. On Monday 2026-01-19 `WKDY` is removed and `SAT` is added.

- **Range:** 2026-01-05 to 2026-02-01, 28 dates.
- **Typical sets:** Monday to Friday `{WKDY}`, Saturday `{SAT}`, Sunday `{SUN}`.
- **Day groups, largest first:** `{WKDY}` 19 dates (every weekday but 0119), 2 trips; `{SAT}` 5 dates (four Saturdays and 0119; days of the week Monday and Saturday), 2 trips, added `SAT`, removed `WKDY`, trip delta 0, routes R1 and R2; `{SUN}` 4 dates, 2 trips.
- **Default dates:** weekday 2026-01-20 (0119 has an exception row and the other Saturday set), saturday 2026-01-17, sunday 2026-01-18.
- **Holiday candidates:** one, 2026-01-19. Added `SAT`, removed `WKDY`. R1 and R2 both run exactly their Saturday trips, so both are `saturday` and the scenario class is `saturday`.
- **Holiday days proposed:** none (no unique date).
- **Annual counts (default classes):** 0119 counts as a Saturday. Weekday 19, Saturday 5, Sunday 4 of 28. Scaled by 365 / 28: 247.68, 65.18, 52.14 → floors 247, 65, 52 (364); the one left goes to Weekday → 248, 65, 52.
