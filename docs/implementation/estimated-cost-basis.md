# Estimated Cost Basis: Implementation Plan

- Requested by the user on 2026-10-30. Design approved the same day: the Cost basis selector of mockup layout A and the Estimate factors panel of layout B. Decision 0051 records the rules.
- Mockups: see "Visual reference" below. Build the screens to match them closely.
- Every package is sized for one Sonnet session. Classes follow `AGENTS.md`: E1, E2, and E3 are structural (Luna); E3 and E4 wire UI that this plan and the mockups specify exactly, so they stay in the structural class and must not invent other visual or interaction patterns.
- Branch: the branch the user names for the session. Never push to another branch. Do not open a pull request unless the user asks.

## Outcome

1. Costing can cost a Trip Profile that has no Blocks. Revenue Hours = Running ÷ (1 − layover %); Platform Hours = Revenue ÷ (1 − deadhead %). The factors are typed per service day, with an All days row for any day left blank.
2. The Trips table shows column totals, and a line with the same totals for the service day in both directions.
3. The Blocking summary shows Layover % and Deadhead % for the selected day, and the All days values weighted by annual service days, so a baseline's factors can be copied.

## Packages and order

| Package | Class, model | Depends on | Content | Stop gate |
|---|---|---|---|---|
| E1 | Structural (Luna), Sonnet | none | Costing estimate: types, validation, calculation, application commands and queries | Unit tests pass; the user reviews the calculation examples |
| E2 | Structural (Luna), Sonnet | E1 | JSON backup version 7, Scenario copy and import-as-copy remapping, Costing CSV | Backup round trip and CSV tests pass |
| E3 | Structural (Luna) with specified UI wiring, Sonnet | none (can run before or after E1 and E2) | Trips totals and Blocking percentages | The user reviews the Trips and Blocking screens |
| E4 | Structural (Luna) with specified UI wiring, Sonnet | E1, E2 | Costing workspace: Cost basis selector, Estimate factors panel, estimated table and panels | The user reviews the Costing screen |
| E5 | Primary agent, Sonnet | E1 to E4 | Documentation, full verification, golden-data round trip, closeout | The user accepts the feature |

No package starts automatically after its gate. At each gate, report what was done and verified, and recommend the next package and model.

## Visual reference

The approved design is in the repository, in `docs/implementation/estimated-cost-basis/`:

| Screen | Markup and CSS (source) | Image | Package |
|---|---|---|---|
| Costing, estimated cost basis | `costing-estimated.html` | `costing-estimated.png` | E4 |
| Trips table totals | `trips-totals.html` | `trips-totals.png` | E3 |
| Blocking summary | `blocking-summary.html` | `blocking-summary.png` | E3 |

- Each HTML file loads the app's own stylesheets (`src/ui/styles/index.css`) and uses the app's existing classes, so opening it from the repository in a browser shows the real look. Each image was rendered from its HTML file at 1440 px.
- Each HTML file has one `<style>` block. Apart from the rules marked as mockup scaffolding (`.mock-*`), that block is the exact CSS the package adds, and a comment names the stylesheet it goes into. Copy those rules; do not restyle them.
- Copy the markup structure (elements, classes, headings, accessible names, text) into the React components. Replace the sample numbers with calculated values. The comments in the HTML mark the parts that are new.
- The user's design canvas, with the three layouts that were compared and the chosen one, is the claude.ai artifact https://claude.ai/artifact/J5kKeKWoKKFUHMs2KcUUmC. It is private to the user, so an agent may not be able to open it. The repository files above are the reference, and they carry the decisions taken after the canvas: the factor table is a spreadsheet grid like the Runtimes grid (the canvas drew boxed inputs), percentages read `17.8%` (`formatPercent`), and new values use the normal text colour.
- Where this plan and a mockup differ, the plan wins. Report any difference you find at the package gate.

## Read first (every package)

1. `AGENTS.md`, `codex.md`, `architecture_overview.md`, `docs/data-schema.md`, `docs/ui-conventions.md` (E3 and E4).
2. Decisions 0026, 0027, 0041, 0042, 0044, 0047, 0050, 0051.
3. `docs/implementation/phase-05-costing.md` (eligibility, rounding, CSV rules that stay in force).
4. The files named in the package.

## Terms used in this plan

- **Running seconds** of a Trip: `tripRunTimeSeconds(trip)` in `src/domain/trips.ts` (last scheduled time minus first). `undefined` means the Trip has no usable run time.
- **Layover fraction** `L`: the share of Revenue Hours that is layover. **Deadhead fraction** `D`: the share of Platform Hours that is not Revenue Hours (pull-out, pull-in, and deadhead). Both are stored as fractions in `[0, 1)` and shown as percentages with one decimal.
- **Estimated basis**: a Trip Profile costed from running hours. **Blocked basis**: a Blocking Scenario, costed as today.

---

## Package E1: Costing estimate, domain and application

### Files

- `src/domain/types.ts`
- `src/domain/costing.ts`
- `src/domain/estimatedCosting.ts` (new) and `src/domain/estimatedCosting.test.ts` (new)
- `src/application/ports.ts`, `src/application/costingContext.ts`, `src/application/costingService.ts`, `src/application/draftChangeCounts.ts`, and their tests
- `src/main.tsx` (wiring only)

### 1. Types (`src/domain/types.ts`)

```ts
/** Decision 0051. A value absent means "not entered". Fractions are in [0, 1). */
export interface CostingFactorPair { layoverFraction?: number; deadheadFraction?: number }
export interface CostingServiceDayFactors extends CostingFactorPair { serviceDayId: EntityId }
export interface CostingEstimateFactors { allDays: CostingFactorPair; serviceDays: CostingServiceDayFactors[] }
```

Add `estimateFactors?: CostingEstimateFactors` to `CostingAssumptions`, after `annualEscalation`.

### 2. Validation and shared helpers (`src/domain/costing.ts`)

- Add `estimateFactors?: CostingEstimateFactors` to `CostingAssumptionsInput`.
- `validateCostingAssumptions` adds, when `estimateFactors` is present:
  - `costing.estimateFactorInvalid` (error, field `estimateFactors`, parameters `{ serviceDayId: <id or 'allDays'>, factor: 'layover' | 'deadhead' }`) for a value that is not a finite number, is below 0, or is 1 or more;
  - `costing.estimateFactorDuplicateDay` (error, field `estimateFactors`, parameter `serviceDayId`) for a service day listed twice;
  - an `allDays` that is not an object, or a `serviceDays` that is not an array, gives `costing.estimateFactorInvalid` with `serviceDayId: 'allDays'`.
- Add `basis: 'blocked'` to `CostingCalculationResult`, and set it in `makeResult`.
- Move the applied-rate loop of `calculateCosting` into an exported `costingAppliedRates(assumptions): { serviceYear: number; rate: number }[]` and use it from both calculations. The blocked results must not change: every existing test in `src/domain/costing.test.ts` passes unchanged except for the added `basis` field.

### 3. Estimate calculation (`src/domain/estimatedCosting.ts`, new, pure)

```ts
export type CostingFactorSource = 'serviceDay' | 'allDays';
export interface ResolvedDayFactors {
  layoverFraction?: number; layoverSource?: CostingFactorSource;
  deadheadFraction?: number; deadheadSource?: CostingFactorSource;
}
export function resolveDayFactors(factors: CostingEstimateFactors | undefined, serviceDayId: string): ResolvedDayFactors;
/** Drops rows with no value and rows of days not in `serviceDayIds`; sorts rows in service-day order. Used before every save. */
export function normalizeEstimateFactors(factors: CostingEstimateFactors | undefined, serviceDays: ServiceDayDefinition[]): CostingEstimateFactors | undefined;

export interface EstimatedCostingContext { scenario: Scenario; serviceDays: ServiceDayDefinition[]; tripProfile: TripProfile; trips: Trip[] }
export interface EstimatedCostingInput extends EstimatedCostingContext { assumptions: CostingAssumptionsInput }

export interface EstimatedCostingDailyResult {
  serviceDayId: string; serviceDayName: string; serviceDayKind: ServiceDayDefinition['kind']; annualServiceDays: number;
  tripCount: number; tripsWithoutRunTimeCount: number;
  runningHoursPerDay: number; annualRunningHours: number;
  factors: ResolvedDayFactors;
  revenueHoursPerDay?: number; platformHoursPerDay?: number;
  annualRevenueHours?: number; annualPlatformHours?: number;
  yearCosts: CostingDailyYearResult[]; // empty without a rate or without revenue hours
}
export interface EstimatedCostingYearResult {
  serviceYear: number; appliedRateUsdPerRevenueHour: number;
  annualRunningHours: number; annualRevenueHours: number; annualPlatformHours?: number; annualCostUsd: number;
}
export type EstimatedCostingNoEstimateReason = 'noTrips' | 'layoverFactorMissing' | 'rateMissing';
export interface EstimatedCostingCalculationResult {
  basis: 'estimated'; tripProfileId: string;
  state: CostingEstimateState; noEstimateReason?: EstimatedCostingNoEstimateReason;
  sourceRate?: number; sourceRateYear: number; annualEscalation: number;
  tripCount: number; tripsWithoutRunTimeCount: number;
  findings: CostingFinding[];
  dailyRows: EstimatedCostingDailyResult[]; yearRows: EstimatedCostingYearResult[];
}
export function calculateEstimatedCosting(input: EstimatedCostingInput): EstimatedCostingCalculationResult;
```

Rules, in this order:

1. **Invalid.** Run `validateCostingAssumptions` and `validateAnnualServiceDays`. Add `costing.tripProfileMismatch` when the Trip Profile is not the Scenario's, and `costing.tripSourceMismatch` (as in `calculateCosting`) for a Trip of another Scenario, another Trip Profile, or an unknown service day, and `costing.duplicateTrip`. Any error gives `state: 'invalid'` with no rows.
2. **Unknown factor rows.** A `serviceDays` factor row whose day is not in `serviceDays` is ignored and adds the warning `costing.estimateFactorUnknownDay` (parameter `serviceDayId`).
3. **Running.** For each service day (sorted with `sortServiceDays`), add the whole running seconds of its Trips; count the Trips and the Trips whose `tripRunTimeSeconds` is `undefined`. Convert to hours once per day (as `buildCoverage` does), so hours stay exact.
4. **No trips.** If no Trip on any day has a run time: `noEstimate`, reason `noTrips`, with the daily rows (running 0) and no year rows.
5. **Factors.** `resolveDayFactors` takes each factor from the day's row, else from `allDays`, each factor independently, and records the source.
6. **Revenue.** A day with running seconds above 0 needs a layover fraction. Revenue hours = running hours ÷ (1 − L). A day with running 0 has revenue 0 and needs no factor. If any day with running above 0 has no layover fraction: `noEstimate`, reason `layoverFactorMissing`, with the daily rows (revenue `undefined` on the days that lack it) and no year rows.
7. **Platform.** Platform hours = revenue hours ÷ (1 − D) when a deadhead fraction resolves, else `undefined` with the warning `costing.deadheadFactorMissing` (parameter `serviceDayId`) for a day with running above 0. A day with revenue 0 has platform 0. The year rows' `annualPlatformHours` is `undefined` when any day's platform is `undefined`.
8. **Rate.** No entered rate: `noEstimate`, reason `rateMissing`, with the daily rows (all hours) and no year rows. Otherwise use `costingAppliedRates`; cost per day = revenue hours × rate, annual cost = cost per day × annual service days, exactly as `calculateCosting`.
9. **State.** `partial` when `tripsWithoutRunTimeCount > 0`, else `complete`. The non-finite and overflow checks of `calculateCosting` apply.

### 4. Ports (`src/application/ports.ts`)

```ts
export type CostBasis = { kind: 'blocked'; blockingScenarioId: string } | { kind: 'estimated'; tripProfileId: string };
export interface CostBasisOption { kind: CostBasis['kind']; id: string; name: string; tripProfileId: string; tripProfileName: string }
export type CostingResult = CostingCalculationResult | EstimatedCostingCalculationResult;
```

- `CostingContextSources`: add `listTripProfiles(scenarioId)`.
- `CostingCalculationContextQueries`: add `listServiceDays(scenarioId)`, `listTripProfiles(scenarioId)`, and `getEstimatedCostingContext(scenarioId, tripProfileId): Promise<EstimatedCostingContext | undefined>`.
- `CostingQueries`: add `listCostBases(scenarioId): Promise<CostBasisOption[]>`. `calculateEstimate` and `exportEstimateCsv` take `{ scenarioId; basis: CostBasis; assumptions }` and `calculateEstimate` returns `CostingResult | undefined`. Keep `listBlockingScenarios`.
- `CostingCommands`: add `saveEstimateFactors(scenarioId, factors: CostingEstimateFactors | undefined, assumptionsIfNew: CostingAssumptionsInput): Promise<CostingAssumptions>`.

### 5. Context and service

- `src/application/costingContext.ts`: `buildEstimatedCostingContext(sources, scenarioId, tripProfileId)` reads the Scenario, its service days, the Trip Profile, and the Profile's Trips once each (`listTrips(scenarioId, tripProfileId)`). It returns `undefined` when the Trip Profile is not the Scenario's. Wire `listTripProfiles` in `src/main.tsx` from the repository's existing Trip Profile read for a Scenario.
- `CostingApplicationService`:
  - `listCostBases`: the Blocking Scenarios first (in the order `listBlockingScenarios` returns them, `name` = Blocking Scenario name, with its Trip Profile's name), then every Trip Profile (in name order, `id` = Trip Profile id).
  - `calculateEstimate`: a blocked basis runs today's path; an estimated basis builds the estimated context and runs `calculateEstimatedCosting`.
  - `saveAssumptions` must never change `estimateFactors`: remove it from the input and keep the stored value.
  - `saveEstimateFactors`: read the service days; refuse a factor row whose day is not in the Scenario with `Error('A service day of the estimate factors is not in this scenario.')`; refuse invalid factors with the first finding's rule; normalize with `normalizeEstimateFactors`; when a record exists, write it with only `estimateFactors` and `updatedAt` changed; when none exists, create one from `assumptionsIfNew` plus the factors. Normalized-away factors (all blank) remove the field.
  - `exportEstimateCsv` with an estimated basis throws `Error('Estimated cost basis CSV is not available yet.')` until E2 replaces it.
- `src/application/draftChangeCounts.ts`: `countEstimateFactorChanges(saved?: CostingEstimateFactors, draft?: CostingEstimateFactors): number`, one per cell (All days and each day, each factor) whose value differs.

### 6. Tests

`src/domain/estimatedCosting.test.ts`, with small hand-built Trips. Use exact numbers:

1. One Weekday Trip of 8 h, `L = 0.2`, `D = 0.2`, 255 days, rate 100: revenue 10 h, platform 12.5 h, cost per day 1,000, annual cost 255,000.
2. Holiday blank and All days `L = 0.25`: Holiday uses 0.25 with source `allDays`; Weekday keeps its own value with source `serviceDay`; a day with its own deadhead and no layover takes layover from All days and keeps its own deadhead.
3. Running above 0, no layover anywhere: `noEstimate`, `layoverFactorMissing`; running hours present; revenue `undefined`.
4. No deadhead anywhere: platform `undefined`, warning `costing.deadheadFactorMissing`, state `complete`, cost unchanged.
5. A Trip with one stop time: counted in `tripsWithoutRunTimeCount`, state `partial`.
6. No Trips: `noTrips`. A day with no Trips and no factors gives no finding and revenue 0.
7. No rate: `rateMissing` with hours.
8. Factor 1, −0.1, `NaN`, a duplicate day: `invalid` with the field `estimateFactors`.
9. A factor row for an unknown day: ignored, with the warning.
10. A Trip of another Trip Profile: `invalid`.
11. **Round trip.** Build two Weekday Blocks with pull-out, Trips, and pull-in, run `summarizeBlockingScenario` and `calculateCosting`, take `L = (V − R) ÷ V` and `D = (P − V) ÷ P` from the eligible Blocks, and run `calculateEstimatedCosting` on the same Trips: revenue, platform, and cost equal the blocked values within `1e-9`.
12. Year rows: the applied rates equal those of `calculateCosting` for the same assumptions.

Application tests: `listCostBases` order and names; `calculateEstimate` with each basis; `saveEstimateFactors` creating a record from `assumptionsIfNew`, keeping the other fields of an existing record, refusing an unknown day, and normalizing; `saveAssumptions` keeping stored factors; `countEstimateFactorChanges`. `costingContext.test.ts`: the estimated context reads the Trips once.

### Acceptance

- `pnpm typecheck` and `pnpm test` pass. Existing Costing tests pass with only the `basis` field added.
- No UI change. No persistence format change other than the optional field in the type.

---

## Package E2: Backup, Scenario copies, and Costing CSV

### Files

`src/persistence/backup.ts`, `src/domain/project.ts`, `src/persistence/csv.ts`, `src/application/costingService.ts`, their tests, `src/persistence/repositoryContract.test.ts`, `docs/data-schema.md`.

### 1. JSON backup version 7

- Set `PROJECT_BACKUP_SCHEMA_VERSION = 7` and accept versions 1 to 7.
- **Watch for this:** many checks are written as `[3, 4, 5, PROJECT_BACKUP_SCHEMA_VERSION].includes(...)`. Raising the constant drops version 6 from every such list. Add `6` to each list explicitly. The Costing assumptions read (`parsed.exportSchemaVersion === PROJECT_BACKUP_SCHEMA_VERSION`) must become versions 6 and 7.
- Validate `estimateFactors` in `validateCostingAssumptions` (backup) whenever it is present: an object; `allDays` an object; `serviceDays` an array; each row's `serviceDayId` a non-empty string naming a service day of the same Scenario; each fraction absent or finite in `[0, 1)`; no day twice. Each failure throws `Invalid project backup: costingAssumptions[<index>].estimateFactors …` naming the problem.
- The Dexie schema does not change (version 9). `docs/data-schema.md` states this.

### 2. Copies

- `duplicateScenario` (`src/domain/project.ts`): map each factor row's `serviceDayId` through `serviceDayIds` (defined before the Costing assumptions copy).
- Import as copy (`src/persistence/backup.ts`, the function that builds `costingAssumptions` before `serviceDayIds`): build `serviceDayIds` first, then map each factor row's `serviceDayId`.

### 3. Costing CSV (`costingCsvFiles`)

Change the signature to take the basis:

```ts
type CostingCsvBasis = { kind: 'blocked'; blockingScenario: BlockingScenario; tripProfile: TripProfile } | { kind: 'estimated'; tripProfile: TripProfile };
costingCsvFiles(scenario, basis: CostingCsvBasis, assumptions, result: CostingResult)
```

- `costing-assumptions.csv`: insert `costBasisKind` (`blocked` or `estimated`) after `tripProfileName`; append `allDaysLayoverFraction` and `allDaysDeadheadFraction` before `roundingNote`. For an estimated basis, `blockingScenarioId` and `blockingScenarioName` are blank.
- `costing-results.csv`: insert `costBasisKind` after `tripProfileName`; insert after `unassignedTripCount`: `tripCount`, `tripsWithoutRunTimeCount`, `runningHoursPerDay`, `annualRunningHours`, `layoverFraction`, `layoverFactorSource`, `deadheadFraction`, `deadheadFactorSource`. Blocked rows leave these blank. Estimated rows leave the Block counts blank, and leave platform blank when it is `undefined`. Fractions are rounded to 6 decimals with `roundCostingDisplay`; hours and USD keep their current rounding.
- `costing-exclusions.csv`: append `tripsWithoutRunTimeCount`. An estimated basis writes one row per service day whose count is above 0, with the Block columns blank.
- The free-text columns stay `scenarioName`, `blockingScenarioName`, `tripProfileName`, `sourceNote`; the CSV formula-protection test must pass unchanged.
- `CostingApplicationService.exportEstimateCsv` builds the estimated files (replacing E1's error).

### 4. Tests

- Backup: a version 7 round trip with factors; version 6 and older files still import (existing tests); each invalid factor shape is refused with its message; a factor naming another Scenario's service day is refused; import as copy remaps the service-day IDs.
- `duplicateScenario`: the copy's factor rows name the copy's service days.
- Repository contract: save and read assumptions with factors, in both repositories.
- CSV: the headers of all three files; one blocked and one estimated example, row by row; a fraction tie rounded away from zero.

### Acceptance

`pnpm typecheck`, `pnpm test`, and `pnpm build` pass. The JSON round trip keeps every factor.

---

## Package E3: Trips totals and Blocking percentages

Mockups: `trips-totals.png`, `blocking-summary.png`. The golden Federal Boulevard project (`tests/ui/support/goldenFixture.ts`) gives the numbers below; confirm them in the browser tests.

### 1. Trips totals (`src/application/tripsWorkspaceView.ts`)

```ts
export interface TripTableTotals { tripCount: number; runningSeconds: number; runTimeMissingCount: number; layoverSeconds?: number; deadheadSeconds?: number }
export function summarizeTripTable(
  trips: Trip[],
  connections?: ReadonlyMap<string, { connection: BlockConnection; deadheadSeconds?: number }>,
  assignedTripIds?: ReadonlySet<string>,
): TripTableTotals;
```

- `runningSeconds` adds `tripRunTimeSeconds`; `runTimeMissingCount` counts `undefined`.
- Layover and deadhead follow the table cells exactly: a Trip counts only when it is in `assignedTripIds` and has a connection; layover adds `connection.usableLayoverSeconds` when defined; deadhead adds `deadheadSeconds` when `connection.deadhead` is set and `deadheadSeconds` is defined.
- With `connections` `undefined` (no Blocking Scenario), `layoverSeconds` and `deadheadSeconds` are `undefined`.

`TripGenerationService.listRouteDayTrips(routeId, serviceDayId, tripProfileId)`: `repository.listTrips(serviceDayId, tripProfileId)` filtered to the Route. Add it to the Trips application port.

### 2. Trips UI (`src/ui/trips/TripsWorkspace.tsx`, `src/ui/trips/ScheduleTable.tsx`)

- `loadTrips` also reads `listRouteDayTrips` in the same `Promise.all` and keeps it in state.
- Compute both totals with `useMemo`: the shown Trips and the Route's day Trips, each with `tripConnections` (when a Blocking Scenario is selected) and the assigned Trip ids from `tripBlockByTripId`.
- `ScheduleTable` gets a `totals?: TripTableTotals` prop and renders a `<tfoot>` when there is at least one saved Trip:
  - a `<th scope="row">` spanning the selection and Pattern columns, plus Departs when headways are shown: `Total · 138 trips`, and ` · 2 without run time` when `runTimeMissingCount > 0`;
  - one empty `<td>` spanning the timepoint columns;
  - Run time, Layover, and Deadhead cells in their columns, as hours with two decimals and the unit (`withUnit(formatHours(seconds / 3600, 'daily'), 'h')`, for example `129.60 h`); Layover and Deadhead empty when `undefined`;
  - empty Next trip, Block, and actions cells.
  - Style: the `<style>` rules of `trips-totals.html`, added to `src/ui/styles/trips-workflow.css` (a sunken bold row with a top border; the label cell is pinned to the left).
- Under the table, inside the Trips work surface, an `InlineNote` (info): `Weekday, both directions: 276 trips · running 256.28 h · layover 55.31 h · deadhead between trips 0.00 h`. Leave out the layover and deadhead parts without a Blocking Scenario. Use the service day's name. Show nothing when the Route has no Trips that day.
- The totals use saved Trips: a draft row is not counted, and a staged Shift does not change them until it is committed. The Trips CSV does not change (Decision 0044).

### 3. Blocking percentages

- `src/domain/blocking.ts`: `deadheadPercent(revenueHours: number, platformHours: number | undefined): number | undefined`, `(platform − revenue) ÷ platform × 100` when platform is above 0. Add `deadheadPercent?: number` to `BlockingSummary`, set in `summarizeBlockingScenario` from its `revenueHours` and `platformHours`. The Blocking CSV does not change.
- `weightedEstimateFactors(days: Array<{ annualServiceDays: number; summary: BlockingSummary }>): { layoverPercent?: number; deadheadPercent?: number }`. Only days with `annualServiceDays > 0` and revenue above 0 count. Layover % = Σ n·(V − R) ÷ Σ n·V. Deadhead % = Σ n·(P − V) ÷ Σ n·P, and `undefined` when a counted day's platform is `undefined`.
- `BlockingApplicationService.getEstimateFactorSummary(blockingScenarioId, serviceDays: ServiceDayDefinition[])`: reads the Blocks, Trips, and Patterns once, summarizes each service day, and returns `weightedEstimateFactors`. Add it to the Blocking query port.
- `BlockingWorkspace.tsx`: read it in `loadBlocks` with the other reads. `SummaryPanel`:
  - a "Layover %" tile after "Layover" and a "Deadhead %" tile after "Deadhead", each with a second caption line in `<small>` (`of revenue hours`, `of platform hours`), values through `formatPercent`;
  - the panel aside: `All days, weighted by annual service days: layover 18.2% · deadhead 5.6%`, with `—` for an undefined value.
  - `blocking.css`: the `<style>` rule of `blocking-summary.html` (`.stat-strip dt small`). Follow the markup of that file.

### 4. Tests

- Unit: `summarizeTripTable` (assigned and unassigned Trips, a deadhead, no connections, a Trip without run time); `deadheadPercent`; `weightedEstimateFactors` (a zero-day service day ignored; an undefined platform).
- Browser, new `tests/ui/trips-totals.spec.ts` (golden project, Weekday Southbound, Blocking Scenario selected): footer `Total · 138 trips`, `129.60 h`, `26.69 h`; the day line `276 trips · running 256.28 h · layover 55.31 h`; deleting one Trip changes the count to 137; with no Blocking Scenario the Layover and Deadhead totals are empty.
- Browser, extend `tests/ui/blocking-presentation.spec.ts`: Weekday tiles `17.8%` and `5.5%`; the aside shows `18.2%` and `5.6%`.
- Run the new spec ten times with eight workers (`codex.md`).

### Acceptance

Typecheck, unit tests, build, and the browser suite pass. Screenshots at 1024 and 1440 px match the mockups; the page never scrolls sideways at 1024 px.

---

## Package E4: Costing workspace

Mockup: `costing-estimated.html` (markup and CSS) and `costing-estimated.png`. Add the `<style>` rules of the HTML file to `src/ui/styles/costing.css`, and add `.costing-top-grid` to the existing `max-width: 1100px` single-column rule in `responsive.css`. The Cost basis control is a native `<select>` with option groups, not the custom menu drawn on the canvas's "Cost basis menu open" board.

### 1. Scope bar (`src/ui/costing/CostingWorkspace.tsx`)

- Replace the "Blocking scenario" `ContextField` with "Cost basis" (`maxWidth={280}`), a `<select aria-label="Cost basis">` filled from `listCostBases`:
  - `<optgroup label="Blocked hours">` with one option per Blocking Scenario, text `Blocked · <name>`, value `blocked:<id>` (omit the group when there are none);
  - `<optgroup label="Estimated from running time">` with one option per Trip Profile, text `Estimated · <name>`, value `estimated:<id>`.
- "Trip profile" stays a read-only `ContextField`, showing the basis's Trip Profile.
- Remember the choice per Scenario in `localStorage` key `transit-costing-tool.costing-basis.v1` (a map from Scenario id to option value) through `src/ui/preferences.ts`. On load use the remembered value when it still exists, else the first blocked option, else the first estimated option. It is never in a backup.
- The "Requires a blocking scenario" prerequisite screen goes, because every Scenario has a Trip Profile. Remove the `onOpenBlocking` prop from `CostingWorkspace` and from its use in `src/ui/App.tsx`. In `tests/ui/onboarding.spec.ts`, replace "Costing without a blocking scenario offers Open Blocking" with a test that such a Scenario opens Costing on `Estimated · <Trip profile>`.
- Focus moves to the Cost breakdown heading after a change, as today.

### 2. Top row

- Wrap Costing assumptions and a new Estimate factors work surface in `.costing-top-grid` (assumptions about 60% of the width, factors about 40%; one column below 1100 px). Inside it, `.costing-assumptions-grid` keeps three narrower columns. The rules are in the HTML file.
- Costing assumptions: subtitle `Shared by every cost basis in <Scenario>`. Otherwise unchanged; its save bar saves the assumptions only.

### 3. Estimate factors work surface

- Title `Estimate factors`, subtitle `Blank days use All days`. Shown for both kinds of basis.
- A spreadsheet grid like the Runtimes grid (`src/ui/trips/RuntimeEditor.tsx`): `<div class="table-scroll data-grid costing-factor-grid"><table class="grid-table" role="grid" aria-label="Estimate factors">`. A heading row with an empty first cell (visually hidden text `Factor`), then `All days` and each service day in service-day order; rows `Layover %` and `Deadhead %` (`<th scope="row">`). The All days cells carry `costing-factor-fallback`.
- Each value cell is a `td.grid-cell` driven by `useGridNavigation` (`src/ui/shared/useGridNavigation.ts`), exactly as the Runtimes cells: the value in a `<span>` at rest, a `grid-cell__input` while editing (with `inputMode="decimal"`), `grid-cell--edited` for an unsaved cell, `data-invalid` for a cell that does not parse, and `data-cell` and the input's accessible name `<Day> layover percent` or `<Day> deadhead percent` (`All days layover percent` for the first column). Arrow keys move, Enter commits and moves down, Tab moves right.
- A value shows the fraction × 100 with up to two decimals and no trailing zeros (`17.8`). A blank day cell shows the resolved All days value in `<span class="grid-cell__placeholder">`.
- Parsing: add `parseEstimateFactorPercent(text): { fraction?: number; error?: string }` to `src/domain/estimatedCosting.ts` with tests. Blank gives no value. A number from 0 up to but not including 100 gives the fraction. Anything else is an error: the cell gets `data-invalid`, and the grid message under the table (`grid-message`, as in the Runtimes grid) reads `Enter a percentage from 0 up to 100, or leave the cell blank.`
- Hint under the table: `Layover % is of revenue hours; deadhead % is of platform hours, as on the Blocking summary.`
- Save bar while the factors differ from the stored ones: `<n> unsaved change(s) · the estimate below already includes it/them`, Discard, and `Save factors` (disabled while a cell is invalid). Save calls `saveEstimateFactors` with the loaded default assumptions as `assumptionsIfNew`; never the edited, unsaved assumptions.
- The estimate always uses the draft factors and draft assumptions, as the assumptions do today.
- Navigation guard and `beforeunload`: unsaved means the assumptions or the factors differ. The dialog text becomes `Costing assumptions or estimate factors have unsaved changes.`; its Save saves the assumptions, then the factors, and navigates only when both succeed.

### 4. Cost breakdown

- Badge: `Estimated` (new `.costing-state.estimated`, in the HTML file) when an estimated result is `complete`; `Partial estimate`, `Invalid inputs`, and `No estimate yet` as today.
- Subtitle for an estimated basis: `Applied rate $152.40 per revenue hour · revenue and platform hours estimated from running time`.
- An estimated basis uses ten columns: Service day, Days, Trips, Daily running (h), Daily revenue (h), Daily platform (h), Daily cost, Annual revenue (h), Annual platform (h), Annual cost. Daily revenue and Daily platform headings carry a second line `estimated` (`.costing-est-mark`, caption size, `var(--color-accent-strong)`).
- Under a day name, a caption in `var(--color-warn)` when a factor came from All days: `All days factors` (both), `All days layover %`, or `All days deadhead %`.
- An undefined value shows `—`. The Total row: Days, Trips, the three annual totals (platform `—` when undefined). The rounding note stays.
- No estimate notes: `layoverFactorMissing` → `Enter a layover % for <days> or for All days to estimate revenue hours. Running hours are shown below.`; `noTrips` → `Trip profile <name> has no trips with run times.`; `rateMissing` as today.
- A blocked basis keeps today's nine columns and panels.

### 5. Lower row

- For an estimated basis, an `Estimate basis` supporting panel replaces Exclusions. Aside: `Trip profile <name> · <n> trips · no blocks used`. Notes, in order:
  1. info: `Running hours add each trip's first-to-last time in trip profile <name>.`
  2. info: `Revenue hours = running ÷ (1 − layover %). Platform hours = revenue ÷ (1 − deadhead %).`
  3. warn, when any day falls back: `Holiday uses All days: 18.2% layover, 5.6% deadhead.` (`use` for more than one day; the values through `formatPercent`).
  4. warn, when Trips lack run times: `<n> trips have no run time and are not counted.`
  5. warn, when a deadhead factor is missing: `No deadhead % for <days>: platform hours are not estimated.`
- Yearly outlook: unchanged, fed by the estimated year rows.
- Export costing CSV works for both kinds of basis; the file name uses the basis name.

### 6. Tests

- `tests/ui/support/ui.ts`: add `'Cost basis'` to `ScopeFieldName`. `tests/ui/app-shell.spec.ts`: Costing scope fields become `['Cost basis', 'Trip profile', 'View year']`. Update the Costing specs that choose a Blocking Scenario.
- New `tests/ui/costing-estimated.spec.ts` (golden project):
  - choose `Estimated · Default`; type Weekday layover 17.8 and deadhead 5.5: Weekday daily revenue is within 0.5 h of the blocked 311.59 h;
  - leave Holiday blank and set All days: the Holiday caption reads `All days factors` and the Estimate basis panel names Holiday;
  - clear every layover value: the no-estimate note appears and running hours stay;
  - Save factors, reload: the values are kept, and the remembered basis is still selected; Discard restores the saved values;
  - leaving the tab with unsaved factors opens the guard dialog;
  - the export contains `costBasisKind` `estimated`;
  - an invalid cell (`100`, `abc`) is marked `data-invalid`, shows the grid message, and disables Save factors;
  - at 1024 px the ten-column table shows Annual cost without scrolling the table, and the page never scrolls sideways (extend the AC7 test).
- `keyboard.spec.ts` axe run passes on the Costing tab with both bases.
- Run the new spec ten times with eight workers. Take the visual tour (`UI_TOUR=1`) and compare with the mockup.

### Acceptance

Typecheck, unit tests, build, and the browser suite pass. Visual inspection at 1024 and 1440 px matches the mockup.

---

## Package E5: Integration and closeout

1. Documentation:
   - `architecture_overview.md`: the Summary and Cost Model (estimated basis, factors, formulas), the Domain Hierarchy line for Costing assumptions, the Costing toolbar (`Cost basis`), the Trips totals and the Blocking percentages, backup schema 7.
   - `docs/domain-glossary.md`: Running hours, Layover %, Deadhead %, Estimate factors, Cost basis (blocked, estimated).
   - `docs/ui-conventions.md`: the Costing layout, the totals row of the Trips table.
   - `docs/implementation/phase-05-costing.md`: a dated note that Decision 0051 amends the selector and adds an estimated basis.
   - Decision 0051 status: `Accepted and implemented`. Decision 0027's header line on Decision 0051: remove "(not yet implemented)".
   - `codex.md`: the status line, test counts, and this plan's location.
2. Verification: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:ui`; the new specs ten times with eight workers.
3. Round trip on the golden project, reported to the user: the estimated basis of Trip Profile Default with factors typed from the Blocking summary gives annual revenue hours within 0.5% of the blocked 108,327.
4. Report and stop. The user accepts the feature.

## Out of scope

- A link to, or a snapshot of, another Scenario's factors.
- Factors per Route, per direction, or per time of day.
- The layover step-up from headway and cycle time, and a minimum-layover floor.
- Estimated vehicle counts or platform miles.
- A table that compares Scenarios.
