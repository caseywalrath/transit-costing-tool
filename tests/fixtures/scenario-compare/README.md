# Scenario comparison test example

Two small made-up Scenarios with figures worked out by hand for the comparison (Decision 0091). Card V1's test builds both sides in code and checks every figure below. Hours and cost come from Costing in the app; here they are **given inputs** (as if read from Costing's Route rows), so V1 is tested without Costing. Card V2 checks against Costing itself.

## Shared settings

- Days on both sides: Weekday (kind weekday, 251 per year), Saturday (kind saturday, 52 per year).
- Rates: $100 per revenue hour, first service year 2027, on both sides. Counts: Baseline's (equal anyway).
- Times are service time; durations are first stop time to last.

## Baseline "Existing"

| Route | Key | Pattern (direction, miles) | Weekday departures | Saturday |
|---|---|---|---|---|
| R1 "Main Street", short `1`, gtfsRouteId `1` | `1` | Outbound A 0, B 2.5, C 6.0 (30 min) | 06:00, 06:30, 07:00, 09:00, 10:00 | — |
| | | Inbound C 0, B 3.5, A 6.0 (30 min) | 06:45, 07:45 | — |
| R2 "Crosstown", short `2` | `2` | Outbound D 0, E 4.0 (20 min) | 08:00 | 08:00 |
| R5 "Loop", short `5` | `5` | Outbound L 0, M 3.0 (15 min) | 08:00 | — |

Blocking scenario "Base blocks", Weekday (pull-out → pull-in):
- X1: R1 06:00 Out, R1 06:45 In; 05:50 → 07:25.
- X2: R1 06:30 Out, R1 07:45 In; 06:20 → 08:25.
- X3: R2 08:00; 07:50 → 08:30.

There are no Saturday blocks. The other trips are unblocked.

Given Costing inputs (revenue hours per day):
- Weekday: R1 3.50, R2 0.40, R5 0.25.
- Saturday: R2 0.40.

## Proposed "Redesign"

| Route | Key | Pattern | Weekday departures | Saturday |
|---|---|---|---|---|
| R1 "Main St", short `1`, gtfsRouteId `1` (renamed) | `1` | Outbound A 0, B 2.5, C 6.0, F 7.5 (36 min) | 06:00, 06:20, 06:40, 07:00, 09:00, 10:00 | 08:00 |
| | | Inbound as baseline (30 min) | 06:45, 07:45 | — |
| R3 "Airport", short `3`, gtfsRouteId `3` | `3` | Outbound G 0, H 12.0 (40 min) | 07:20 | — |
| R5 "Loop", short `5` | `5` | as baseline | 08:00 | — |

Blocking scenario "Draft blocks", Weekday:
- Y1: R1 06:00 Out, R1 06:45 In; 05:50 → 07:25.
- Y2: R1 06:20 Out, R1 07:45 In; 06:10 → 08:25.
- Y3: R1 06:40 Out, R3 07:20; 06:30 → 08:10. This block serves two routes, so it counts as Unattributed.

Given Costing inputs:
- Weekday: R1 3.10, R3 0.00, Unattributed 1.50, R5 0.25.
- Saturday: R1 0.60.

## Worked answers

**Matching:**
- R1 matches by gtfsRouteId and shows the Proposed name, "1 Main St".
- R5 matches by short name.
- R2 is Discontinued; R3 is New.

**Weekday, by route:**

| Route | Status | Trips | Miles | Rev hrs | Δ hrs | % | Peak | Cost/yr |
|---|---|---|---|---|---|---|---|---|
| 1 Main St | Changed | 7 → 8 (+1) | 42.0 → 57.0 (+15.0) | 3.50 → 3.10 | −0.40 | −11.4% | 2 → 2 | 87,850 → 77,810 (−10,040) |
| 2 Crosstown | Discontinued | 1 → — | 4.0 → — | 0.40 → — | −0.40 | — | 1 → — | 10,040 → — |
| 3 Airport | New | — → 1 | — → 12.0 | — → 0.00 | 0.00 | — | — → 0 | — → 0 |
| 5 Loop | Unchanged (folded) | 1 → 1 | 3.0 → 3.0 | 0.25 → 0.25 | 0.00 | 0.0% | 0 → 0 | 6,275 → 6,275 |
| Unattributed | Changed | 0 → 0 | — | 0.00 → 1.50 | +1.50 | — | 0 → 1 | 0 → 37,650 |

Order (Decision 0091 item 17): 1 and 2 (tie on 0.40, route order), then 3, then 5 (folded), then Unattributed. 3 Airport's peak is 0 because its only block is interlined.

**Weekday totals:**
- Trips 9 → 10 (+1, +11.1%).
- Miles 49.0 → 72.0 (+23.0, +46.9%).
- Revenue hours 4.15 → 4.85 (+0.70, +16.9%).
- Peak 2 → 3 (+1). Baseline: X1 and X2 overlap from 06:20 to 07:25; X3 starts at 07:50, after X1 has ended. Proposed: Y1, Y2 and Y3 all overlap from 06:30 to 07:25.
- Cost $104,165 → $121,735 (+$17,570, +16.9%).

**Span and headways, 1 Main St, Weekday:**
- Outbound span 06:00–10:30 → 06:00–10:36 (changed). Inbound 06:45–08:15 both sides.
- Outbound AM peak 30 → 20 (deps 06:00…07:00: 60 ÷ 2 and 60 ÷ 3). Midday 60 → 60. Other periods "—".
- Inbound AM peak 60 → 60.

**Saturday:**
- 1 Main St Changed (0 → 1 trip, 0 → 7.5 mi).
- 2 Crosstown Discontinued (1 → —).
- 3 Airport New (— → 0 trips).
- 5 Loop Unchanged (0 → 0).
- Peak 0 → 0 (no Saturday blocks).

**Annual** (Weekday × 251 + Saturday × 52):
- Trips 2,311 → 2,562 (+251, +10.9%).
- Miles 12,507.0 → 18,462.0 (+5,955.0, +47.6%).
- Revenue hours 1,062.45 → 1,248.55 (+186.10, +17.5%).
- Cost $106,245 → $124,855 (+$18,610, +17.5%).
- Peak 2 → 3, on Weekday.
