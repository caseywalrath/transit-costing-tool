# Federal Boulevard workbook conversion audit

Source: `Federal Blvd Service Plan 11-20-2024_ValuesOnly.xlsx`
Source SHA-256: `f1f91b588e74802413163807697e30e7a9f8a1008fece21555eebf316bed0b2b`

## Generated schedule

| Service day | Annual days | Trips | Blocks | Southbound | Northbound |
| --- | ---: | ---: | ---: | ---: | ---: |
| Weekday | 255 | 276 | 18 | 138 | 138 |
| Saturday | 52 | 260 | 17 | 130 | 130 |
| Sunday | 52 | 224 | 17 | 112 | 112 |
| Holiday | 6 | 224 | 17 | 112 | 112 |

Generated 984 authoritative Trips, 69 Blocks, 6 Patterns, 18 Runtime Profiles, and 24 Runtime Assignments.
The Holiday timetable duplicates Sunday service, with six separate annual Holiday days.
Trips retain their workbook times; Block summaries and Costing are derived by the app.
Pull-out and pull-in mileage is unknown. Blocks may display as incomplete for mileage while remaining eligible for Costing.
No Costing rate was imported.

## Saturday Block comparison

The timetable supplies authoritative first and last Trip times. Hours-sheet End, Revenue, and movement values are comparison inputs.

| Block | Timetable end | Hours end | Timetable Revenue | Hours Revenue | Pull-out used | Pull-in used |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 11 | 22:02:00 | 19:47:00 | 17:01:00 | 14:46:00 | 30 min | 30 min |
| 12 | 19:32:00 | 22:46:00 | 13:48:00 | 17:02:00 | 30 min | 30 min |
| 13 | 19:23:30 | 19:23:30 | 13:52:30 | 13:52:30 | 30 min | 30 min |
| 14 | 21:16:00 | 22:02:00 | 14:54:30 | 15:40:30 | 30 min | 30 min |
| 15 | 26:05:00 | 25:35:00 | 20:19:00 | 19:49:00 | 30 min | 30 min |
| 16 | 19:53:30 | 19:53:30 | 13:52:30 | 13:52:30 | 30 min | 30 min |
| 17 | 26:15:00 | 26:05:00 | 19:59:00 | 19:49:00 | 30 min | 30 min |
| 18 | 25:29:00 | 20:23:30 | 18:58:00 | 13:52:30 | 30 min | 30 min |
| 21 | 19:35:00 | 19:35:00 | 14:25:00 | 14:25:00 | 30 min | 30 min |
| 22 | 20:00:30 | 20:00:30 | 14:34:30 | 14:34:30 | 30 min | 30 min |
| 23 | 20:05:00 | 20:05:00 | 14:25:00 | 14:25:00 | 30 min | 30 min |
| 24 | 25:35:00 | 26:29:00 | 19:46:30 | 20:40:30 | 30 min | 30 min |
| 25 | 25:59:00 | 26:15:00 | 20:04:00 | 20:20:00 | 30 min | 30 min |
| 26 | 22:20:00 | 22:20:00 | 15:46:30 | 16:01:30 | 45 min | 30 min |
| 27 | 19:30:30 | 25:59:00 | 13:20:30 | 19:49:00 | 30 min | 30 min |
| 28 | 26:29:00 | 19:45:30 | 20:04:00 | 13:20:30 | 30 min | 30 min |
| 29 | 21:50:00 | 21:50:00 | 15:46:30 | 14:42:00 | 30 min | 30 min |

Saturday timetable Block spans total **280:57:00**; SA Hours revenue values total **277:02:00**. The difference is **03:55:00** per Saturday.

## Movement handling

Saturday boundary mode: `infer-30`.
- Saturday Block 11: pull-in set to 30 minutes after last Trip; SA Hours!E4 equals the Trip end
- Saturday Block 12: pull-in set to 30 minutes after last Trip; SA Hours!E5 equals the Trip end
- Saturday Block 13: pull-in set to 30 minutes after last Trip; SA Hours!E6 equals the Trip end
- Saturday Block 14: pull-in set to 30 minutes after last Trip; SA Hours!E7 equals the Trip end
- Saturday Block 15: pull-in set to 30 minutes after last Trip; SA Hours!E8 equals the Trip end
- Saturday Block 16: pull-in set to 30 minutes after last Trip; SA Hours!E9 equals the Trip end
- Saturday Block 17: pull-in set to 30 minutes after last Trip; SA Hours!E10 equals the Trip end
- Saturday Block 18: pull-in set to 30 minutes after last Trip; SA Hours!E11 equals the Trip end
- Saturday Block 21: pull-in set to 30 minutes after last Trip; SA Hours!E12 equals the Trip end
- Saturday Block 22: pull-in set to 30 minutes after last Trip; SA Hours!E13 equals the Trip end
- Saturday Block 23: pull-in set to 30 minutes after last Trip; SA Hours!E14 equals the Trip end
- Saturday Block 24: pull-in set to 30 minutes after last Trip; SA Hours!E15 equals the Trip end
- Saturday Block 25: pull-in set to 30 minutes after last Trip; SA Hours!E16 equals the Trip end
- Saturday Block 26: pull-in set to 30 minutes after last Trip; SA Hours!E17 equals the Trip end
- Saturday Block 27: pull-in set to 30 minutes after last Trip; SA Hours!E18 equals the Trip end
- Saturday Block 28: pull-in set to 30 minutes after last Trip; SA Hours!E19 equals the Trip end
- Saturday Block 29: pull-out set to 30 minutes before first Trip; SA Hours!B20 is inconsistent
- Saturday Block 29: pull-in set to 30 minutes after last Trip; SA Hours!E20 equals the Trip end

## Mileage handling

Pattern totals are 18.5, 13.5, and 21 miles, matching the timetable planning totals. Run Times segment distances set the proportional cumulative distance at each Pattern point.
- SA Times row 134 Northbound: listed 21.0 miles; Pattern total 13.5 miles.
- SU Times row 116 Northbound: listed 21.0 miles; Pattern total 13.5 miles.

## Comparison boundary

The workbook's BRT annual total includes an additional 4,427 Route 29 hours without a detailed Route 29 timetable here. Compare app results with the Federal BRT timetable subtotal rather than the combined grand total.
Weekday, Saturday, and Sunday/Holiday workbook revenue hours appear in `WK Hours!E25:H31`; the Route 29 addition appears in `WK Hours!E48:H51`.
