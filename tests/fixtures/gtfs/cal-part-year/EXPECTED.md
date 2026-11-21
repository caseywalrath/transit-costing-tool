# cal-part-year — expected answers

Hand-worked under Decision 0089 items 15, 16, 17, 20 and 21. R1 runs all summer: `WKDY`, `SAT`, `SUN` 2026-06-01 to 2026-08-31. R2 runs only in July: `JULY`, Monday to Friday 2026-07-01 to 2026-07-31. 2026-06-01 is a Monday.

- **Range (both routes):** 2026-06-01 to 2026-08-31, 92 dates: 66 weekdays, 13 Saturdays, 13 Sundays. The middle falls between 2026-07-16 and 2026-07-17.
- **Typical sets:** Monday to Friday `{WKDY}` (July dates carry `{JULY, WKDY}` and are the minority on each day of the week), Saturday `{SAT}`, Sunday `{SUN}`.
- **Default dates:** weekday 2026-06-30 (July dates have the non-typical set, so the nearest typical date is 16.5 days from the middle; 2026-08-03 is 17.5), saturday 2026-07-18, sunday 2026-07-19.
- **Part-year routes:** R2 has no trip on 2026-06-30 but runs on other Monday–Friday dates, so it is flagged for `weekday`, with suggested date 2026-07-16 (the middle of R2's own range, July 1–31). R2 never runs on a Saturday or Sunday, so it is not flagged for those. R1 is not flagged.
- **Annual counts for the Scenario (default classes):** Weekday 66, Saturday 13, Sunday 13 of 92. Scaled by 365 / 92: 261.85, 51.58, 51.58 → floors 261, 51, 51 (363); the two left go to Weekday and Saturday (Saturday and Sunday tie; the earlier day wins) → 262, 52, 51.
- **R2's own counts (scenario range 92 dates):** its own range is 2026-07-01 to 2026-07-31, 31 dates: 23 weekdays, 4 Saturdays, 4 Sundays. Times 365 / 92: 91.25, 15.87, 15.87, total 31 × 365 / 92 = 122.99 → 123. Floors 91, 15, 15 (121); the two left go to the largest remainders, Saturday and Sunday → Weekday 91, Saturday 16, Sunday 16, Holiday 0 (total 123, not 365).
