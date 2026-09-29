# Federal Boulevard workbook conversion

This one-off converter builds a schema-6 project backup from the values-only Federal Boulevard service plan workbook. It reads the workbook without modifying it. The generated JSON can be restored through the app's project backup import.

## Run

Use Python 3 with `openpyxl` installed:

```powershell
python tools/federal_brt_to_backup.py --workbook "C:\path\to\Federal Blvd Service Plan 11-20-2024_ValuesOnly.xlsx" --output-dir output/federal-brt-import --saturday-boundaries infer-30
```

The output directory receives `federal-brt-project-backup.json`, `federal-brt-conversion-audit.md`, and `federal-brt-trip-trace.csv`. Validate the backup against the current app code before restoring it:

```powershell
node tools/validate_federal_brt_backup.mjs output/federal-brt-import/federal-brt-project-backup.json
```

Restore the JSON through the app's project menu. The app imports it as a new local project. The trace CSV connects generated Trips to workbook sheets and rows for review.

## Source decisions

- The `WK Times`, `SA Times`, and `SU Times` timetables determine Trip times and Block memberships. The Hours sheets supply movement boundaries and comparison figures; they do not override the timetable.
- Sunday and Holiday are separate service days with identical Trips and Blocks. The annual counts are 52 Sundays and 6 holidays, in addition to 255 weekdays and 52 Saturdays.
- Six Patterns follow the timetable point sequences. Their total distances use the workbook's 18.5, 13.5, and 21 mile planning figures. Intermediate Pattern distances are apportioned from the `Run Times` segment distances. Costs use Revenue Hours, so Pattern distance does not affect the estimate.
- Saturday pull-ins are inferred as 30 minutes after the last Trip. Saturday Block 29's inconsistent pull-out is inferred as 30 minutes before its first Trip. The other valid Saturday pull-outs and weekday and Sunday movements retain their source durations. The generated audit lists each inference.
- Runtime Profiles and bands reproduce the source Trip segment runtimes, while saved Trips remain the authoritative timetable. No Costing rate is set. The user must enter and save a rate in the Costing tab to calculate an estimate.
- Pull-out and pull-in mileage is unavailable in the source used here. The app may label Blocks incomplete for mileage, while the validation script confirms their hours are valid and all 69 Blocks remain eligible for Costing.
- Route 29's additional 4,427 annual hours are excluded because no Route 29 timetable is present in the supplied workbook. Compare app totals with the Federal BRT timetable subtotal.

This converter is specific to the named workbook layout. Review the generated audit before importing a workbook revision; changed sheet structure should cause a deliberate converter update.
