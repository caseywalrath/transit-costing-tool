# Trip review, changed-trip markers, and runtime reconciliation

- Status: Accepted 2026-11-11. Packages not started.
- Decisions: 0071 (per-trip outcomes, skip, one review), 0072 (anchor diagnosis), 0073 (changed-trip marker), 0074 (band pairing for segment copy and fill), 0075 (runtime comparison view).
- Base: `main` at PR #57. Every file, line, and signature below was read at that commit. Line numbers drift as packages land. **Search for the quoted code and do not rely on line numbers alone.**

## Roles

| Role | Model | Use for |
| --- | --- | --- |
| Structural | Haiku | Packages marked Haiku: types, application methods, pure functions, tests, and wiring of props and state that the plan specifies exactly. |
| Delicate and UI | Opus | Packages marked Opus: the anchor solver search, all new visual or interaction design, and every review gate. |

Rules for Haiku packages:

1. Read `AGENTS.md`, `codex.md`, and the decision records named in the package before editing.
2. Do only what the package lists. When the code does not match the "Facts" section, stop and report the difference. Do not adapt the design.
3. Do not change layout, styles, wording of existing messages, or interaction. Where a package adds user-visible text, use the exact text given here.
4. Keep every existing test passing unchanged unless the package names the test to change.
5. Commit once per package, with `Verified:` lines that list what was run and what was skipped and why (`AGENTS.md`, Verification).

Each Opus UI package starts with a mock-up gate: Opus commits a static mock-up or screenshots under `docs/implementation/trip-review/`, and the user approves before the build.

## Facts the plan relies on (verified at PR #57)

Trips and review:

- F1. `TripGenerationService.previewRecalculateTrips(tripIds, anchorByTripId = {}, bandOverrideByTripId = {}, anchorTimeByTripId = {})` in `src/application/tripGenerationService.ts`. In its per-trip loop, `catch (error) { if (!(error instanceof TripGenerationError) || error instanceof AnchorBandChoiceError) throw error; findings.push(...) }`. After the loop: `if (findings.length) throw new TripGenerationError(findings);`. It returns `RecalculationPreview` (`src/domain/trips.ts`: `trips, impact, connections, findings, bandSelections?, anchorByTripId?, bandOverrideByTripId?, anchorTimeByTripId?, sourceSignature?`). The signature is `JSON.stringify([sources, blocks, connectedTrips, connectionPatterns])`.
- F2. Callers of `previewRecalculateTrips`: `applyRecalculationPreview` and `recalculateTrips` (same file), `RecalculationDialog` (`src/ui/trips/dialogs.tsx`), and the start-time edit in `src/ui/trips/TripsWorkspace.tsx` (`tripService.previewRecalculateTrips([trip.id], { [trip.id]: pointId }, {}, { [trip.id]: toSeconds })`). `src/application/authoritativeTripService.test.ts` asserts that it rejects (`.rejects.toThrow()` and `.rejects.toBeInstanceOf(AnchorBandChoiceError)`).
- F3. `applyRecalculationPreview(preview, confirm = false)` re-previews with `preview.impact.tripIds` and the three input maps, compares `sourceSignature`, throws on error findings, throws `TripRecalculationConfirmationError(current)` when `impact.requiresConfirmation && !confirm`, reads the before-Trips, and calls `this.persistWithUndo(beforeTrips, current.trips, 'regeneration')`.
- F4. `recalculateTripWithAnchor(trip, pattern, profile, now, anchorPointId?, chosenBandId?)` in `src/domain/trips.ts` throws `TripGenerationError` with ruleIds `trip.departureMissing`, `trip.anchorMissing`, `trip.anchorTimeMissing`, `trip.anchorBandChoiceInvalid`, `trip.anchorNoRuntime`, `trip.anchorAmbiguous`. It throws `AnchorBandChoiceError(tripId, choices, finding)` with ruleIds `trip.anchorAmbiguous`, `trip.anchorNearestTie`, `trip.anchorNoRuntime`. `AnchorBandChoice` is `{ bandId, bandLabel, startTime, endTime, departure, distanceSeconds, side? }`.
- F5. A band is pickable only for a profile whose `calculationMethod` is `undefined` or `'singleBand'`. This is the rule in `previewPatternChange` (`const pickable = profile.calculationMethod === undefined || profile.calculationMethod === 'singleBand'`) and in `RecalculationDialog` (`bandPickable`).
- F6. `calculateRecalculationConnections(selectedTrips, recalculatedTrips, allTrips, blocks, patterns)` and `calculateRecalculationImpact(trips, blocks)` are exported from `src/domain/trips.ts`. `tripRunTimeSeconds(trip)` is exported from the same file.
- F7. Batch pattern change. `BatchPatternChangeRequest` is `{ tripIds, targetPatternId, anchorNodeId? }` (`src/domain/serviceDayCopy.ts`). `buildBatchPatternChangePreview(request, trips, targetPattern, profilesByTripId, blocks, assignments, profiles, sourcePatternsByTripId)` calls `previewPatternChange(trip, targetPattern, profile, { sourcePattern, anchorNodeId: request.anchorNodeId })` for each trip. `eligibleTripIds` are changes without a finding and with `newStopTimes`. `ineligibleTripIds` are changes with a finding. Every change finding is pushed into `findings`. The signature `createBatchPatternChangeSignature` hashes the whole `request`, so any field added to the request is covered.
- F8. `TripGenerationService.applyBatchPatternChange(preview)` reloads, compares signatures, calls `assertNoCopyErrors(context.preview.findings)`, and maps **every** change through `applyPatternChange`. That function throws for a change with a finding or without `newStopTimes`.
- F9. `PatternChangeOptions` is `{ sourcePattern?, anchorNodeId?, chosenBandId?, now? }`. In the anchored path of `previewPatternChange`, `keptTime` is the Trip's saved time at the source point, and `seed` is the target pattern with every point at `keptTime`.
- F10. Single-Trip change: `previewTripPatternChange(tripId, targetPatternId, directionId, options: TripPatternChangeInputs = {})` and `changeTripPattern(preview)`. `TripPatternChangeInputs` is `{ anchorNodeId?, chosenBandId? }`. `tripPatternChangeSignature(...)` serializes `anchorNodeId: inputs.anchorNodeId ?? null, chosenBandId: inputs.chosenBandId ?? null`.
- F11. `persistWithUndo(beforeTrips, afterTrips, kind)` writes Trips and the undo snapshot together (Decision 0070).
- F12. `TripGenerationApplication` is a `Pick<TripGenerationService, ...>` type at the end of `tripGenerationService.ts`. A new public method must be added to that list before the UI can call it.
- F13. `USER_FACING_VALIDATION_MESSAGES` in `src/ui/shared/messages.ts` has no text for `trip.targetRuntimeUnavailable`, `trip.anchorNearestTie`, `trip.anchorBandChoiceInvalid`, `trip.patternRouteMismatch`, `trip.anchorMissing`, or `trip.anchorTimeMissing`, so these show "Review this item and correct it before trying again."

Trips table:

- F14. `ScheduleTable` (`src/ui/trips/ScheduleTable.tsx`) builds each row's class as `[selectedIds.includes(trip.id) && 'trip-row-selected', runtimesChanged && 'trip-row-runtime-changed', staged && 'trip-row-staged-shift'].filter(Boolean).join(' ')`. It keeps row elements in `rowElements.current` (a `Map<tripId, HTMLTableRowElement>`).
- F15. The moved-row style is in `src/ui/styles/tables.css`: `.row-moved` (accent bar and shading) and `.row-moved--0` / `.row-moved--1` (flash; alternate the two to replay it), turned off under `prefers-reduced-motion`. `RouteWorkspace.tsx` uses `` `row-moved row-moved--${movedPoint.tick % 2}` ``.
- F16. Marking points in `TripsWorkspace.tsx`:
  - `completeStagedShift()` calls `tripService.applyStagedTripShift(shiftPreview)`, which returns a `TripShiftPreview` with `shiftedTrips`;
  - `finishRecalculation()` is the `RecalculationDialog` `onDone`;
  - `completeTripCopy()` is the `onDone` of `TripPatternChangeDialog`, `BatchPatternChangeDialog`, and `TripDayCopyDialog`;
  - `applyStartTimeChange(preview)` applies a `RecalculationPreview`;
  - `undoRegeneration()` calls `tripService.undoLastTripRegeneration()`, which returns `Trip[]`;
  - `saveDraftTrip()` adds a Trip;
  - `BuildTripsDrawer` `onDone` is an inline closure.
- F17. Scope change: `useEffect(() => { setSelectedTripIds([]); ... }, [serviceDayId, directionId, tripProfileId, runtimeVersion]);`.

Segment runtimes:

- F18. `src/domain/segmentRuntimeMatching.ts`: `SegmentSkipReason = 'ambiguous' | 'bandMismatch' | 'noMatchingSegment' | 'unassigned' | 'conflict'`. `noMatchingSegment` is never produced. `sameBand(left, right)` compares `startTime` and `endTime`. `matchPair` builds `bands: Array<[openBand, otherBand]>` from `sameBand`. `planFillFromOthers` skips a cell when `openBand.segmentRuntimeSeconds[openIndex] !== 0 || !seconds`.
- F19. `RouteDefinitionService.describeSegmentRuntimePlan` (`src/application/routeDefinitionService.ts`) sets `bandRanges[band.id] = \`${formatServiceTime(band.startTime)}–${formatServiceTime(band.endTime)}\`` with no seconds. `formatServiceTime(value, includeSeconds = false)` is in `src/domain/time.ts`.
- F20. `applySegmentRuntimePlan(preview)` rebuilds the plan with `planSegmentRuntimes(current, preview.mode, preview.sourceProfileId, preview.excludedProfileIds)` and refuses when `JSON.stringify(plan.changes) !== JSON.stringify(preview.changes)`.
- F21. `SegmentRuntimeDialog` (`dialogs.tsx`) shows the skip groups `['ambiguous', 'bandMismatch', 'unassigned', 'conflict']` with titles in `SEGMENT_SKIP_TITLES`.

## Packages

| # | Package | Model | Depends on |
| --- | --- | --- | --- |
| R1 | Recalculation review with outcomes and skip | Haiku | — |
| R2 | `diagnoseAnchor` | Opus | — |
| R3 | Batch pattern change: per-trip inputs, skip, times | Haiku | — |
| R4 | Diagnosis wiring and messages | Haiku | R1, R2, R3 |
| G1 | User gate: unit-test summaries of R1–R4 | — | R4 |
| R5 | `TripReviewTable` and the three dialogs | Opus | G1 |
| R6 | Changed-trip marks: state and row class | Haiku | — |
| R7 | Changed-trip status line and scrolling | Opus | R6 |
| R8 | Segment fill reporting and default band pairing | Haiku | — |
| R9 | Band map in the Fill and Copy dialogs | Opus | R8 |
| R10 | `compareRouteRuntimes` | Haiku | R8 |
| R11 | Compare patterns view | Opus | R9, R10 |
| R12 | Closeout and integration review | Opus | all |

R6 and R8 do not depend on the other packages and may run at any point.

---

### R1 Recalculation review with outcomes and skip (Haiku)

Decision 0071 items 1 to 3. Files: `src/domain/trips.ts`, `src/application/tripGenerationService.ts`, `src/application/authoritativeTripService.test.ts`. No UI change.

1. In `src/domain/trips.ts`, after `RecalculationPreview`, add:

```ts
export type TripReviewStatus = 'ready' | 'needsChoice' | 'error' | 'skipped';
export interface TripReviewRow {
  tripId: string;
  status: TripReviewStatus;
  /** Present when status is 'ready'. */
  revisedTrip?: Trip;
  findings: ValidationFinding[];
  /** Present for an AnchorBandChoiceError. The UI offers them as choices only when `bandPickable`. */
  bandChoices?: AnchorBandChoice[];
  bandPickable?: boolean;
  bandSelection?: RecalculationBandSelection;
}
export interface RecalculationReviewInputs {
  anchorByTripId?: Record<string, string>;
  bandOverrideByTripId?: Record<string, string>;
  anchorTimeByTripId?: Record<string, ServiceSeconds>;
  skipTripIds?: string[];
}
/** `trips`, `impact`, `connections`, and `findings` cover only the ready, non-skipped Trips. `rows` covers every requested Trip, in request order. */
export interface RecalculationReview extends RecalculationPreview { rows: TripReviewRow[]; requestedTripIds: string[]; inputs: RecalculationReviewInputs }
```

2. In `TripGenerationService`, move the body of the per-trip loop of `previewRecalculateTrips` into a private method:

```ts
private async recalculateEach(trips: Trip[], anchorByTripId, bandOverrideByTripId, anchorTimeByTripId): Promise<{ sources: unknown[]; outcomes: Array<{ trip: Trip; result?: ReturnType<typeof recalculateTripWithAnchor>; error?: TripGenerationError; profile?: RuntimeProfile }> }>
```

   It keeps the `resolved` cache exactly as now. It catches only `TripGenerationError`, including `AnchorBandChoiceError`, and stores it in `error`. Any other error is rethrown, as now.

3. Rewrite `previewRecalculateTrips` on top of `recalculateEach` **with identical behavior**:
   - first, if any outcome's `error` is an `AnchorBandChoiceError`, throw the first such error in trip order;
   - otherwise, if any outcome has an `error`, throw `new TripGenerationError(all findings in trip order, each with entityType 'trip' and entityId set to the trip id)`;
   - the remainder is unchanged.

   This matches today: today a band-choice error is thrown the moment it is met, and the collected findings are dropped. Run `authoritativeTripService.test.ts` and `tripGenerationService.test.ts` before going on. They must pass unchanged.

4. Add the public method `reviewRecalculation(tripIds: string[], inputs: RecalculationReviewInputs = {}): Promise<RecalculationReview>`:
   - Load the Trips and Blocks as `previewRecalculateTrips` does. A missing Trip throws the same `Error`.
   - Skipped Trips (`inputs.skipTripIds`) are not passed to `recalculateEach`. Each gets a row `{ status: 'skipped', findings: [] }`.
   - Each other outcome becomes a row:
     - no error: `ready`, with `revisedTrip` and `bandSelection`;
     - an `AnchorBandChoiceError`: `needsChoice` when its profile is pickable (F5), otherwise `error`. In both cases set `bandChoices: error.choices` and `bandPickable`;
     - any other `TripGenerationError`: `error`.

     Findings carry `entityType: 'trip', entityId: trip.id`.
   - `trips` = the revised Trips of the ready rows. `impact = calculateRecalculationImpact(readyOriginalTrips, blocks)`. Connections and their findings come from `calculateRecalculationConnections(readyOriginalTrips, readyRevisedTrips, ...)`, built as today but with the ready Trips as the selection. Skipped and failed Trips are neighbors: add them to the connection trips the way `connectedTrips` are added today.
   - `findings` = the connection findings (warnings) only. Row errors stay in `rows`.
   - `sourceSignature = JSON.stringify([sources, blocks, connectedTrips, connectionPatterns, [...(inputs.skipTripIds ?? [])].sort(), rows.map((row) => [row.tripId, row.status])])`.
   - Return `{ ...preview fields, rows, requestedTripIds: tripIds, inputs: { ...inputs }, anchorByTripId, bandOverrideByTripId, anchorTimeByTripId }`.

5. Add `applyRecalculationReview(review: RecalculationReview, confirm = false): Promise<RecalculationReview>`:
   - `const current = await this.reviewRecalculation(review.requestedTripIds, review.inputs);`
   - Throw `new Error('Trips or runtimes changed. Review regeneration again.')` when the signatures differ. This is the existing text.
   - Throw `new Error('No trips are ready to regenerate.')` when `current.trips` is empty.
   - Throw `TripRecalculationConfirmationError(current)` when `current.impact.requiresConfirmation && !confirm`.
   - Read the before-Trips, check the count as `applyRecalculationPreview` does, and call `persistWithUndo(beforeTrips, current.trips, 'regeneration')`. Return `current`.

6. Add `'reviewRecalculation' | 'applyRecalculationReview'` to `TripGenerationApplication` (F12).

7. Tests in `authoritativeTripService.test.ts`. Reuse the fixtures of the existing anchor tests (search for `AnchorBandChoiceError` in that file):
   - three Trips, one with an `AnchorBandChoiceError` anchor: the review returns three rows, one of them `needsChoice` or `error`, and `trips` has two;
   - applying that review writes two Trips, and the third is unchanged in the repository;
   - `skipTripIds` gives a `skipped` row, and the skipped Trip is not in the undo snapshot (`getLastTripRegenerationUndo().afterTrips`);
   - an all-skipped review: `applyRecalculationReview` rejects with 'No trips are ready to regenerate.';
   - changing a Trip between review and apply rejects with the stale message.

Verification: `pnpm typecheck`; the two test files while working; full `pnpm test` at the end. Skip the browser suite (no UI change).

### R2 `diagnoseAnchor` (Opus)

Decision 0072 item 1. File: new `src/domain/anchorDiagnosis.ts` and `src/domain/anchorDiagnosis.test.ts`. Pure; it imports only from `./types`, `./trips`, and `./runtime`.

```ts
export interface AnchorSolution { anchorTime: ServiceSeconds; firstDeparture: ServiceSeconds; differenceSeconds: number }
export interface AnchorBoundary {
  time: ServiceSeconds;
  fromBand: { id: string; label: string };
  toBand: { id: string; label: string };
  /** Segments before the anchor whose runtime differs between the two bands, by segment index. */
  segmentChanges: { segmentIndex: number; fromSeconds: DurationSeconds; toSeconds: DurationSeconds }[];
}
export interface AnchorDiagnosis {
  anchorPointId: string;
  anchorTime: ServiceSeconds;
  /** gap: no departure reaches the time. overlap: more than one does. outside: the departure would fall outside every band or before 0:00. */
  kind: 'gap' | 'overlap' | 'outside';
  earlier?: AnchorSolution;
  later?: AnchorSolution;
  boundary?: AnchorBoundary;
  /** True when recalculating from the Trip's saved first departure gives a valid Trip. */
  firstDepartureWorks: boolean;
}
export function diagnoseAnchor(trip: Trip, pattern: RoutePattern, profile: RuntimeProfile, anchorPointId: string): AnchorDiagnosis | undefined;
```

- Returns `undefined` when the anchor is the first point, or when `recalculateTripWithAnchor(trip, pattern, profile, now, anchorPointId)` succeeds.
- The arrival at the anchor, for a departure `d`, is `propagatePatternTimes(pattern, d, profile).stopTimes[anchorIndex].time`. It is not monotone under segment-start profiles. Search integer seconds of `d` in a window bounded by the smallest and largest total runtime to the anchor over all bands, clamped at 0. Pick `earlier` as the largest arrival below the anchor time and `later` as the smallest arrival above it. On a tie, take the departure closest to the saved first departure.
- `boundary` is the band boundary between the departures of `earlier` and `later`, when they fall in different bands of the first segment that differs.
- Under the one-band-per-trip method, use the formula already in `recalculateTripWithAnchor` (anchor time minus the band's runtime to the anchor) instead of a scan.
- Performance: under 50 ms per Trip for a 12-point pattern with five bands. The review calls it only for failed Trips.
- Tests: a rising boundary (gap; check `earlier` and `later` to the second and that both are reachable: recalculating with `anchorTimeByTripId` set to `earlier.anchorTime` succeeds); a falling boundary (overlap); a gap that adds up over three segments; single-band too far; blended; an anchor time before every possible arrival (`outside`); and the first-point anchor (`undefined`).

Gate: the Opus reviewer confirms the search window and the tie rule in the commit message.

### R3 Batch pattern change: per-trip inputs, skip, and times (Haiku)

Decision 0071 items 2 to 4. Files: `src/domain/serviceDayCopy.ts`, `src/domain/trips.ts`, `src/application/tripGenerationService.ts`, and the tests named below. No UI change.

1. `BatchPatternChangeRequest` gains these optional fields:

```ts
skipTripIds?: EntityId[];
/** Overrides `anchorNodeId` for one Trip. '' means the first stop. */
anchorNodeIdByTripId?: Record<EntityId, string>;
chosenBandIdByTripId?: Record<EntityId, string>;
/** A new time at the anchor node for one Trip (Decision 0072 item 2). */
anchorTimeByTripId?: Record<EntityId, ServiceSeconds>;
```

2. `PatternChangeOptions` gains `anchorTime?: ServiceSeconds`. In the anchored path of `previewPatternChange`, use `options.anchorTime ?? keptTime` wherever `keptTime` is used after the `keptTime === undefined` check, including `anchorTime: ...` in `base`. The first-stop path ignores it. Add a test to `src/domain/tripPatternChangeAnchor.test.ts`: with `anchorTime` set, the target Trip's time at the anchor node equals it.
3. `PatternChangePreview` gains `skipped?: true`.
4. In `buildBatchPatternChangePreview`:
   - A skipped Trip gets the change `{ tripId, sourcePatternId, targetPatternId, oldStopTimes: [...trip.stopTimes], skipped: true }`, with no finding and no block lookup.
   - For the others, the anchor is `const perTrip = request.anchorNodeIdByTripId?.[trip.id]; const anchorNodeId = perTrip === undefined ? request.anchorNodeId : perTrip || undefined;`. Pass `{ sourcePattern, anchorNodeId, chosenBandId: request.chosenBandIdByTripId?.[trip.id], anchorTime: request.anchorTimeByTripId?.[trip.id] }`.
   - `eligibleTripIds` and `ineligibleTripIds` exclude skipped changes. Add `skippedTripIds: string[]` to `BatchPatternChangePreview`.
5. `BatchPatternChangePreview` gains `connections: RecalculationConnection[]` and `connectionFindings: ValidationFinding[]`. Fill them in `loadBatchPatternChange` (application) with `calculateRecalculationConnections(eligibleOriginalTrips, eligibleChangedTrips, connectionTrips, blocks, records.patterns)`:
   - `eligibleChangedTrips` are `{ ...trip, patternId: targetPattern.id, stopTimes: change.newStopTimes }`;
   - `connectionTrips` are the Trips of `records.trips` that appear in the blocks that hold an eligible Trip.

   The domain builder sets both fields to `[]`, and the application replaces them.
6. `applyBatchPatternChange` maps only changes with `!change.skipped && !change.finding && change.newStopTimes`. Before writing, throw `new Error('No trips are ready to change.')` when that list is empty. `assertNoCopyErrors` stays, so an unskipped ineligible Trip still refuses the whole apply. The UI skips error rows first.
7. Single-Trip: `TripPatternChangeInputs` gains `anchorTime?: ServiceSeconds`. Pass it through to `previewPatternChange` in both `previewTripPatternChange` and `changeTripPattern`. Add `anchorTime: inputs.anchorTime ?? null` to `tripPatternChangeSignature`. Carry it on `TripPatternChangeReview` the way `anchorNodeId` is carried (`...(inputs.anchorTime === undefined ? {} : { anchorTime: inputs.anchorTime })`). Note: `PatternChangePreview` already has a field `anchorTime` (the kept time). Name the review input `anchorTimeInput` on `TripPatternChangeReview` to avoid the clash, and map it to `TripPatternChangeInputs.anchorTime`.
8. Tests:
   - `src/domain/serviceDayCopy.test.ts`: a skipped Trip is in `skippedTripIds` only, and a per-trip anchor overrides the shared one;
   - `src/application/tripGenerationService.test.ts` (search for `applyBatchPatternChange`): with the ineligible Trip skipped, the apply writes the others, and the undo snapshot (`kind: 'patternChange'`) holds only them.

Verification: `pnpm typecheck`; the test files above while working; full `pnpm test`; skip the browser suite.

### R4 Diagnosis wiring and messages (Haiku)

Decision 0072 items 2 to 4. Files: `src/domain/trips.ts`, `src/application/tripGenerationService.ts`, `src/ui/shared/messages.ts`, and tests.

1. `TripReviewRow` (R1) and `PatternChangePreview` gain `diagnosis?: AnchorDiagnosis` (import the type from `./anchorDiagnosis`).
2. In `reviewRecalculation`, for each row with status `error` or `needsChoice` whose anchor (`inputs.anchorByTripId?.[tripId]`) is set and is not the pattern's first point, set `diagnosis = diagnoseAnchor(seed, pattern, profile, anchorPointId)`. `seed` is the Trip the loop recalculated (including `anchorTimeByTripId`). Have `recalculateEach` return `seed`, `pattern`, and `profile` per outcome.
3. In the anchored path of `previewPatternChange`, when the result has a finding with ruleId `trip.anchorNoRuntime`, `trip.anchorAmbiguous`, or `trip.anchorNearestTie`, set `diagnosis = diagnoseAnchor(seed, targetPattern, profile, targetPoint.id)`. `firstDepartureWorks` here describes the seed, so the UI ignores it for a pattern change and always offers *Use first stop*.
4. Add to `USER_FACING_VALIDATION_MESSAGES`, with this exact text:
   - `'trip.targetRuntimeUnavailable': 'The target pattern has no runtime profile for this service day. Assign one in Runtimes.'`
   - `'trip.anchorNearestTie': 'Two runtime bands are equally close to the calculated departure. Choose a band or another anchor.'`
   - `'trip.anchorBandChoiceInvalid': 'The chosen runtime band no longer applies. Review the trip again.'`
   - `'trip.patternRouteMismatch': 'Choose a pattern on the same route.'`
   - `'trip.anchorMissing': 'The anchor timepoint is not on this pattern. Choose another anchor.'`
   - `'trip.anchorTimeMissing': 'This trip has no saved time at the anchor timepoint. Choose another anchor.'`
5. Add `describeAnchorDiagnosis(diagnosis: AnchorDiagnosis, anchorName: string, segmentLabel: (segmentIndex: number) => string): string` to `messages.ts`. Times use `formatServiceTime(value, value % 60 !== 0)`, and differences use the sign rule of `formatPreviewTimeChange` in `dialogs.tsx`. Exact sentences:
   - gap with a boundary: `Keeping {anchorName} at {anchorTime} is not possible: runtimes change at {boundary.time} ({fromBand.label} to {toBand.label}). Nearest: {earlier.anchorTime} ({earlier.diff}) or {later.anchorTime} ({later.diff}).`
   - overlap: `Keeping {anchorName} at {anchorTime} is reached from more than one first departure because runtimes change at {boundary.time}. Nearest single solutions: {earlier.anchorTime} or {later.anchorTime}.`
   - outside: `Keeping {anchorName} at {anchorTime} needs a first departure outside every runtime band.`
   - Drop a "Nearest" part when its solution is absent. A gap without a boundary uses the outside sentence.
   - `segmentLabel` is used only by R5's Details list, which reads `{segmentLabel(i)}: {from} → {to}` per `segmentChanges` entry. Export a second function `describeAnchorSegmentChanges(diagnosis, segmentLabel): string[]` for that.
6. Tests: `src/ui/errorMessages.test.ts` or a new `src/ui/shared/messages.test.ts` for each sentence, and one application test that a failed anchored row carries a `diagnosis`.

Verification: `pnpm typecheck`; focused tests; full `pnpm test`; skip the browser suite.

### G1 User gate

The primary agent reports R1 to R4 to the user as unit-test summaries and example diagnosis sentences produced by the R4 tests. R5 waits for approval.

### R5 `TripReviewTable` and the three dialogs (Opus)

Decision 0071 item 5 and Decision 0072 items 2 and 3. Files: new `src/ui/trips/TripReviewTable.tsx`; `dialogs.tsx` (`RecalculationDialog`, `BatchPatternChangeDialog`, `TripPatternChangeDialog`); styles in the existing trips stylesheet.

- Mock-up gate first.
- Columns: Trip (pattern short name via `src/application/shortNames.ts` · first departure), Status, Anchor, Fixed time, First change, Last change, Run time change, Layover change, Action. The current Regenerate columns "First: current → new", "Last: current → new", and "Layover: current → new" move into each cell's title or a compact second line. Sol/Opus decides which.
- The Action select per row, with only the options that apply:
  - *Regenerate* or *Change pattern* (ready rows);
  - *Keep {earlier}* / *Keep {later}* (diagnosis solutions; they set `inputs.anchorTimeByTripId` for Regenerate, `request.anchorTimeByTripId` for batch Change pattern, and `anchorTime` for the single-Trip change);
  - *Use first departure* (Regenerate) or *Use first stop* (Change pattern);
  - *Band: {bandChoiceLabel}* per choice, when `bandPickable`;
  - *Skip — leave unchanged* (not in the single-Trip dialog).
- An error row shows `describeAnchorDiagnosis` or `userMessage` in the row, plus a **Details** disclosure for `describeAnchorSegmentChanges` with an **Open runtimes** button that closes the dialog and opens the Runtimes section.
- Header: "{n} trips · {ready} ready · {attention} need attention", **Skip all trips with errors**, and the existing bulk anchor buttons (Regenerate) or the Target pattern and shared Anchor selects (Change pattern).
- Footer primary button: "Regenerate {n} trips" or "Change {n} trips", plus "({s} skipped)" when skipped. It is disabled when nothing is ready.
- The review loads on open and on every input change. Keep the `live` guard pattern of the current `RecalculationDialog` `useEffect`.
- Regenerate uses `reviewRecalculation` / `applyRecalculationReview`. Batch uses `previewBatchPatternChange` / `applyBatchPatternChange` with the R3 fields. Single-Trip uses `previewTripPatternChange` / `changeTripPattern`.
- Keep the stale-review messages of each dialog as they are.
- Update the specs `recalculation-capacity`, `anchored-pattern-change`, `pattern-change-undo`, and `unified-action-layer` where they click the removed **Review change** button or read the removed text. Add the dialogs to the axe run of `keyboard.spec.ts` if they are not there.
- Acceptance: three problem trips among fifty are all shown at once; **Skip all trips with errors** and then the primary button regenerates forty-seven; the batch rows name each trip by departure; 500 trips still review in under one second (`recalculation-capacity.spec.ts`).

### R6 Changed-trip marks: state and row class (Haiku)

Decision 0073 items 1, 2 (class only), 4, and 6. Files: new `src/ui/trips/changedTrips.ts`, `TripsWorkspace.tsx`, `ScheduleTable.tsx`, and a unit test. No new styles and no new text.

1. `changedTrips.ts` exports:

```ts
export interface ChangedTripMarks { ids: ReadonlySet<string>; tick: number }
export const NO_MARKS: ChangedTripMarks = { ids: new Set(), tick: 0 };
export function markTrips(previous: ChangedTripMarks, ids: Iterable<string>): ChangedTripMarks { return { ids: new Set(ids), tick: previous.tick + 1 }; }
/** 'flash' when 1 to 5 marks, 'steady' when 6 or more. */
export function markStrength(marks: ChangedTripMarks): 'none' | 'flash' | 'steady';
export function markedRowClass(marks: ChangedTripMarks, tripId: string): string | undefined; // 'row-moved row-moved--{tick % 2}' for flash, 'row-moved' for steady, undefined when not marked
```

2. `TripsWorkspace.tsx`: `const [changedMarks, setChangedMarks] = useState(NO_MARKS);`. Set the marks at each point in F16, after the write succeeds and before `loadTrips()`:
   - shift: `applyStagedTripShift` returns the preview; mark `result.shiftedTrips.map((trip) => trip.id)`;
   - start-time edit: `preview.trips.map(...)`;
   - undo: the returned `Trip[]`;
   - Add trip: the trip that `saveDraftTrip` saved. Read how it calls `addTrip`, which returns `{ trip }`;
   - Regenerate and Change pattern: change the `onDone` props of the three dialogs to `onDone: (changedTripIds: string[]) => Promise<void>`. Pass the ids of the Trips written (`applyRecalculationReview` result `trips`; batch `eligibleTripIds`; single `changeTripPattern` result `id`). `finishRecalculation` and `completeTripCopy` take the ids and mark them. `TripDayCopyDialog` also calls `completeTripCopy`; give it a separate `onDone` that does what `completeTripCopy` does now, with no marks;
   - Build trips: `BuildTripsDrawer` `onDone` receives the generated ids. In `dialogs.tsx`, use the return value of `tripService.generateTrips(request)` (a `GenerateTripsPreview` with `trips`) and the equivalent plan-build call; read the drawer's submit code to find both.
3. Clear (`setChangedMarks(NO_MARKS)`) in the F17 effect, and when the Route or Scenario changes. The effect already depends on the values in F17; add route and scenario only if they are not covered. Read the effect's dependencies first.
4. `ScheduleTable` gets a prop `changedMarks?: ChangedTripMarks`. Append `markedRowClass(changedMarks, trip.id)` to the row-class array in F14.
5. Test `changedTrips.test.ts`: strength thresholds 0, 1, 5, 6; tick alternation.
6. Browser spec `tests/ui/changed-trip-marker.spec.ts`: shift one trip so it moves past other rows and find its row with class `row-moved`; change Day and find no `row-moved` in the Trips table.

Verification: typecheck; unit test; full `pnpm test`; build; the specs `changed-trip-marker`, `moved-row-marker`, `shift-drawer`, `trip-start-edit`, `trips-table-display`, and `add-trip-draft`.

### R7 Changed-trip status line and scrolling (Opus)

Decision 0073 items 2 (scroll), 3, and 5. Files: `TripsWorkspace.tsx`, `ScheduleTable.tsx`, the trips stylesheet, and the R6 spec.

- Mock-up gate first: the status line in the selection-bar slot, and how it coexists with the selection bar when trips are selected.
- Text: "{n} trips changed · {a} above, {b} below", with **Previous ↑**, **Next ↓**, **Select changed trips**, and **Clear marks**, plus "{m} changed trips are not in this view" when it applies. Use `rowElements.current` (F14) for positions.
- Flash strength: scroll the first marked row into view (`block: 'nearest'`) after the reload, unless the staged-shift scroll restore (`completeStagedShift`) applies. That restore wins only when the row is already visible.
- Acceptance: a 40-trip regeneration shows the line, and **Next ↓** visits each row in turn; reduced motion shows no animation; axe clean.

### R8 Segment fill reporting and default band pairing (Haiku)

Decision 0074 items 1, 3, and 4. Files: `src/domain/segmentRuntimeMatching.ts`, its test, `src/application/routeDefinitionService.ts`, `src/application/segmentRuntimeService.test.ts`, and `SEGMENT_SKIP_TITLES` in `dialogs.tsx` (text only).

1. Seconds in ranges (F19): `formatServiceTime(band.startTime, band.startTime % 60 !== 0)`, and the same for `endTime`.
2. `SegmentSkipReason` adds `'otherServiceDays' | 'emptySource'`.
   - In both plans, report each `otherPatternProfiles` profile that has an assignment but is not in `qualifyingProfiles` as `otherServiceDays`, once per profile.
   - In `matchPair`, when `segments.length === 0`, report `noMatchingSegment` once on `skipProfile`.
   - In `planFillFromOthers`, when the open cell is `0` and the source value is `0`, record the cell. After all sources, a cell with no non-zero value from any source is reported as `emptySource`, once per open band and segment.
3. Default pairing. Add to the module:

```ts
export type BandPairs = Record<EntityId /* other profile id */, Record<EntityId /* open band id */, EntityId | null /* other band id, null = none */>>;
export function defaultBandPairs(open: RuntimeProfile, others: RuntimeProfile[]): BandPairs;
```

   Rule (Decision 0074 item 1): for each open band, the partner is the other band with the longest overlap `max(0, min(ends) − max(starts))`, when that overlap is more than half of `open.endTime − open.startTime`. An identical band always wins. A tie of the longest overlap gives `null`.
4. `SegmentRuntimePlanInput` gains `bandPairs?: BandPairs`. In `matchPair`, replace the `sameBand` search with the pairing: `(bandPairs ?? defaultBandPairs(open, [other]))[other.id]?.[openBand.id]`. An open band with no partner is a `bandMismatch` on `skipProfile`, as now. Remove the second loop that reports the other profile's unmatched bands, because pairing makes it one-sided. Update the existing test `'6. a band that overlaps but is not identical is a band mismatch'`: with default pairing, an overlap of more than half now matches. Rename the test to `'6. a band is paired with the band that overlaps it most, if by more than half'` and add the under-half case as a mismatch.
5. `SegmentRuntimePreview` gains `bandPairs: BandPairs` (the pairs used). `previewSegmentRuntimeCopy(profileId, excludedProfileIds, bandPairs?)` and `previewSegmentRuntimeFill(profileId, bandPairs?)` pass them through. `applySegmentRuntimePlan(preview)` rebuilds with `preview.bandPairs` (F20).
6. `SEGMENT_SKIP_TITLES` adds `otherServiceDays: 'Profile is assigned to other service days only'`, `noMatchingSegment: 'No segment in common'`, and `emptySource: 'Other patterns have :00 for this segment'`. Add the three reasons to the `skipGroups` reason list in the same order.
7. Golden check: a test in `segmentRuntimeService.test.ts` or a new domain test using `goldenRaw()` from `src/testSupport/goldenBackup.ts`. For the Weekday profile of "Southbound: Westminster Station to Englewood", with every segment set to 0, `planFillFromOthers` returns more than 0 changes.

Verification: typecheck; the two test files; full `pnpm test`; the `segment-runtime-fill` spec (update its expectations only where pairing changes the counts, and say so in the commit).

### R9 Band map in the Fill and Copy dialogs (Opus)

Decision 0074 item 2. `SegmentRuntimeDialog`. Mock-up gate first. One block per other profile listing each open band (with seconds) and a select of that profile's bands plus *None*, defaulted from `preview.bandPairs`. A change re-previews with the edited `bandPairs`. Acceptance: on the golden project, Fill on a blanked profile lists the pairs and fills; axe clean; `segment-runtime-fill.spec.ts` covers changing a pair.

### R10 `compareRouteRuntimes` (Haiku)

Decision 0075 items 2 to 4. New `src/domain/runtimeComparison.ts` and its test. Pure.

```ts
export interface RuntimeComparisonInput { directionId: string; serviceDayId: string; patterns: RoutePattern[]; profiles: RuntimeProfile[]; assignments: RuntimeAssignment[]; directionColumnOrder: string[] /* nodeIds in timetable-column order */ }
export interface ComparisonSegment { key: SegmentKey; fromNodeId: string; toNodeId: string }
export interface ComparisonCell { patternId: string; profileId: string; bandId: string; segmentKey: SegmentKey; seconds: DurationSeconds; discrepancy: boolean; otherValues: { patternId: string; profileId: string; bandId: string; seconds: DurationSeconds }[] }
export interface RuntimeComparison {
  segments: ComparisonSegment[];
  stacked: { patternId: string; profileId: string; bands: { bandId: string; startTime: number; endTime: number; cells: (ComparisonCell | undefined)[] /* by segments index */ }[] }[];
  intervals: { startTime: number; endTime: number; cells: Record<SegmentKey, { patternId: string; seconds: DurationSeconds }[]> }[];
}
export function compareRouteRuntimes(input: RuntimeComparisonInput): RuntimeComparison;
```

- Patterns: those with `directionId`, each with the profile assigned for `serviceDayId`. A pattern without one is left out.
- `segments`: the union of `segmentKeys(pattern)` (import from `segmentRuntimeMatching.ts`), ordered by the position of `fromNodeId` in `directionColumnOrder`, then `toNodeId`. Keys that appear twice in one pattern (loops) are left out, as matching does.
- A discrepancy exists when another pattern has a band overlapping this band in time (overlap > 0) with a different non-zero value for the same key. A `:00` value is never a discrepancy.
- `intervals`: cut at every band boundary of the included profiles.
- Tests: two patterns with offset bands and one differing value give exactly the expected discrepant cells; loops are excluded; `:00` is ignored.

Read how the Trips workspace gets the Direction's timetable columns (`direction.columns` in `ScheduleTable`'s `direction` prop type) and document the source of `directionColumnOrder` in the test.

### R11 Compare patterns view (Opus)

Decision 0075 items 1, 2, 3, and 5. Mock-up gate first. Runtimes **Actions → Compare patterns…** beside the copy and fill items in `TripsWorkspace.tsx` (search `'fill-segments'`). Stacked view by default, with an **Align by time** toggle. **Use this value for…** builds a copy plan from the chosen cell's profile, restricted to that segment and to the chosen target profiles and bands. This needs a narrow application method. Define it in this package as `previewSegmentValueCopy(sourceProfileId, bandId, segmentKey, targets: { profileId, bandId }[])`, which returns a `SegmentRuntimePreview` and applies through `applySegmentRuntimePlan`. Opus specifies and tests it, or hands it back to a Haiku sub-package with exact rules. Acceptance: axe clean; the undo restores the values.

### R12 Closeout (Opus)

Integration review across R1 to R11. Update `architecture_overview.md` (the Trip Generation Model and Runtime Model paragraphs), `docs/ui-conventions.md` (the review table, the changed-trip marker, the band map), `docs/domain-glossary.md` if a term was added, and `codex.md`. Set Decisions 0071 to 0075 to "Accepted and implemented". Run the full browser suite.

## Verification per package

| Package | Run | Skip | Do not cut |
| --- | --- | --- | --- |
| R1 | typecheck; `authoritativeTripService.test.ts`, `tripGenerationService.test.ts`; full unit suite | Browser suite (no UI) | Existing `previewRecalculateTrips` rejection tests; undo tests |
| R2 | typecheck; `anchorDiagnosis.test.ts`, `tripAnchorGeneration.test.ts`; full unit suite | Browser suite | Existing anchor tests |
| R3 | typecheck; `serviceDayCopy.test.ts`, `tripPatternChangeAnchor.test.ts`, `tripGenerationService.test.ts`; full unit suite | Browser suite | Pattern-change undo tests (Decision 0070) |
| R4 | typecheck; message tests; application diagnosis test; full unit suite | Browser suite | `errorMessages.test.ts` |
| R5 | typecheck; build; full unit suite; `recalculation-capacity`, `anchored-pattern-change`, `pattern-change-undo`, `unified-action-layer`, `trips-runtime-presentation`, `impact-dialogs`, `keyboard`, `draggable-dialogs`, `trip-start-edit`; visual inspection | Blocking and Costing specs | `recalculation-capacity` (500 trips) |
| R6 | typecheck; `changedTrips.test.ts`; full unit suite; build; `changed-trip-marker`, `moved-row-marker`, `shift-drawer`, `trip-start-edit`, `trips-table-display`, `add-trip-draft`, `build-from-plan` | Blocking and Costing specs | `shift-drawer` scroll retention |
| R7 | typecheck; build; full unit suite; `changed-trip-marker`, `shift-drawer`, `trips-layout`, `trip-table-layout`, `keyboard`; visual inspection | Blocking and Costing specs | `shift-drawer` |
| R8 | typecheck; `segmentRuntimeMatching.test.ts`, `segmentRuntimeService.test.ts`; full unit suite; `segment-runtime-fill` | Other browser specs | Segment undo tests |
| R9 | typecheck; build; full unit suite; `segment-runtime-fill`, `keyboard`, `draggable-dialogs`; visual inspection | Blocking and Costing specs | `segment-runtime-fill` |
| R10 | typecheck; `runtimeComparison.test.ts`; full unit suite | Browser suite | — |
| R11 | typecheck; build; full unit suite; `runtime-grid`, `runtime-table-layout`, `segment-runtime-fill`, `keyboard`, new compare spec; visual inspection | Blocking and Costing specs | Segment undo tests |
| R12 | Full browser suite; full unit suite; build | — | Full browser suite |

## Recommended order

R8 (Haiku) → R1, R3 (Haiku) and R2 (Opus) in either order → R4 (Haiku) → G1 → R5 (Opus) → R6 (Haiku) → R7 (Opus) → R10 (Haiku) → R9, R11 (Opus) → R12 (Opus).
