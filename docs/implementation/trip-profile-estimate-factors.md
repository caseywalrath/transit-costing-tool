# Trip-Profile Estimate Factors and Implied Service: Closeout

- Decision: `docs/decisions/0062-trip-profile-estimate-factors-and-implied-service.md`
- Date: 2026-11-09
- Scope: items 1 (implied service check) and 2 (factors per Trip Profile) of the app changes proposed after the Westracks costing review. Items 3 to 5 (headway-based estimate, rate calibration helper, cross-scenario comparison) are not started.

## Packages

| Package | Class | Files | Result |
|---|---|---|---|
| TPF1 Domain | Structural | `src/domain/types.ts`, `src/domain/costing.ts`, `src/domain/estimatedCosting.ts`, `src/domain/project.ts` | `TripProfileEstimateFactors`; validation; `estimateFactorsForTripProfile`, `setTripProfileEstimateFactors`, copy and deletion helpers, remapping; `deriveImpliedService` and `impliedService` on each estimated daily row |
| TPF2 Application and persistence | Structural | `src/application/costingService.ts`, `src/application/costingContext.ts`, `src/application/ports.ts`, `src/main.tsx`, `src/persistence/backup.ts`, `src/persistence/dexieRepository.ts`, `src/persistence/inMemoryRepository.ts` | Per-Profile save; Patterns and Routes in the estimated context; backup schema 11; Trip Profile copy and deletion carry or remove the entry atomically |
| TPF3 Costing screen | Structural, reusing existing panels | `src/ui/costing/CostingWorkspace.tsx`, `src/ui/styles/costing.css` | Factors panel follows the selected basis's Trip Profile; basis-change guard; Implied service panel; lower grid holds two panels side by side when wide enough |

The screen work reuses the existing `WorkSurface`, `SupportPanel`, `InlineNote`, leave dialog, and Yearly outlook table style. It adds no new interaction pattern. A UI-design (Sol) review can still refine the placement and wording of the Implied service panel.

## Acceptance criteria

1. Saving factors with Trip Profile A selected changes neither Trip Profile B's factors nor the Scenario's shared factors. Verified by unit and browser tests.
2. A Trip Profile with no entry shows and uses the shared factors, labelled as such. After a save it shows "blank days use All days". Verified by a browser test.
3. Copying a Trip Profile copies its entry; deleting it removes the entry. Verified by repository contract tests on Dexie and in-memory.
4. Backup version 11 round trips the entries; import-as-copy and Scenario duplication remap them; invalid entries are refused; a version 10 file's field is dropped. Verified by unit tests.
5. With the Westracks backup, Dinosaur Lots at 15.6% shows a 79.0-minute running cycle, a 93.6-minute cycle with layover, a 15.0-minute headway, and 6.24 implied vehicles. Verified by a domain test with the same timetable shape, and by visual inspection of the imported backup at 1440 and 1024 px.

## Verification per package

| Package | Run | Skip | Do not cut |
|---|---|---|---|
| TPF1 | `pnpm typecheck`; `src/domain/tripProfileEstimateFactors.test.ts`; full unit suite | Browser suite (no screen change) | Existing `estimatedCosting` and `costing` tests |
| TPF2 | `pnpm typecheck`; `src/application/costingService.test.ts`, `costingContext.test.ts`, `src/persistence/backup.test.ts`, `repositoryContract.test.ts`; full unit suite | Full browser suite | Backup and repository contract tests (persistence and backup changed) |
| TPF3 | `pnpm typecheck`; `pnpm build`; `tests/ui/costing-trip-profile-factors.spec.ts`, `costing-estimated.spec.ts`, `costing-workspace.spec.ts`, `costing-summary.spec.ts`, `costing-rules-from-service.spec.ts`, `backup-import.spec.ts`, `drafts-and-preferences.spec.ts`, `trip-profile.spec.ts`; visual inspection at 1440 and 1024 px | Full browser suite: run at the closeout of items 3 to 5 | Costing browser specs |

## Notes

- `tests/ui/costing-estimated.spec.ts` now reads the saved factors from `tripProfileEstimateFactors`.
- The Westracks backup has no `tripProfileEstimateFactors`. Each of its Trip Profiles shows the Scenario's shared factors until the planner saves factors for it.
