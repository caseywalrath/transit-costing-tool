# Packages AB1 to AB5: Automatic blocking

- Status: AB1 to AB5 implemented on 2026-11-04; awaiting user acceptance.
- Requested by the user on 2026-11-03. Rules: Decision 0055 (`docs/decisions/0055-automatic-blocking.md`). Read it in full first; this plan does not repeat its reasoning.
- Branch: `claude/admiring-sagan-4lfwzp`. Commit each package separately with a clear message. Never push to another branch. Do not open a pull request.
- Implementer: a Sonnet-class model starting each package with fresh context. Every package below is self-contained: read the "Read first" list, then your package section, and touch only the files your package owns.
- Gate: after each package the implementer runs that package's acceptance checks and reports. The primary agent reviews before the next package starts. Do not start the next package on your own (AGENTS.md).

| Package | Content | Class / model |
|---|---|---|
| AB0 | Decision 0055, this plan, design reference | Done (primary agent) |
| AB1 | Types, rule validation, backup schema 8, copy and import remapping | Structural (Luna) / Sonnet; done 2026-11-04 |
| AB2 | Pure engine: defaults, build, summary, findings, measurement, check | Structural (Luna) / Sonnet; done 2026-11-04 |
| AB3 | Application service, context wiring, application tests | Structural (Luna) / Sonnet; done 2026-11-04 |
| AB4 | UI: menu item, dialog, provenance note, styles | UI (Sol) / Sonnet, layout fixed by the mock-up; done 2026-11-04 |
| AB5 | Browser test, documentation, closeout | Structural (Luna) / Sonnet; done 2026-11-04 |

## Read first (every package)

1. `AGENTS.md`, `codex.md` (commands, browser-test setup with the preinstalled Chromium, current status), `architecture_overview.md` (Blocking Model section).
2. Decisions 0019, 0022, 0023, 0036, 0042, 0050, 0052, 0055.
3. Design reference in `docs/implementation/automatic-blocking/`:
   - `mockups.html`: open it in a browser (no server is needed). It holds the approved screens drawn with the app's real CSS. Screens 1, 2, 2b, 3 and 4 match the PNG files next to it.
   - `screen-*.png`: still images of each screen.
   - `mockup-extra.css`: the mock-up's own CSS for the dialog and the provenance note. Use its layout rules. Do not copy the annotation rules (`.mk`, `.new`, the orange outlines and the `#fff4ec` highlights), which only mark proposed elements.
   - `synthetic-check.py`: a plain statement of the chaining rule with expected numbers. AB2's tests must reproduce them.
4. Code you will meet:
   - `src/domain/types.ts`: `Trip`, `RoutePattern`, `PatternPoint`, `Node` (`kind: 'timepoint' | 'terminal' | 'garage' | 'other'`), `BlockingScenario`, `BlockingBlock`, `BlockActivity` (`PullOutActivity`, `RevenueTripActivity`, `DeadheadActivity`, `PullInActivity`).
   - `src/domain/blocking.ts`: `MinimumLayoverRule` and `MinimumLayoverRules`, `createBlockingScenario`, `validateBlockingScenarioName`, `duplicateBlockingScenario`, `normalizeBlockActivities`, `validateBlockingBlock`, `assertStructurallyValidBlock`, `summarizeBlockingScenario`, and the percent-layover formula at about line 416.
   - `src/domain/directions.ts` (`DirectionGroup`, `patternDirectionGroups`), `src/domain/trips.ts` (`tripRunTimeSeconds`), `src/domain/patterns.ts` (`patternTotalMiles`), `src/domain/ids.ts` (`newId`).
   - `src/domain/blockingDayCopy.ts`: the most recent pure Blocking feature, to mirror for style, findings and tests.
   - `src/application/blockingService.ts` (`BlockingApplicationService`, `BlockingContextProvider`, `BLOCKING_WRITE_METHODS`), `src/application/ports.ts` (`BlockingCommands`, `BlockingQueries`), `src/main.tsx` (wiring).
   - `src/persistence/backup.ts` (`PROJECT_BACKUP_SCHEMA_VERSION`, `validateBlockingScenarios`, `parseProjectBackupWithReport`, `cloneProjectSnapshot`), `src/domain/project.ts` (the Scenario copy function documented "Clone all Phase 1 records owned by a scenario with remapped references", about line 145).
   - `src/ui/blocking/BlockingWorkspace.tsx` (menus at about line 366; the minimum-layover preference), `src/ui/blocking/BlockingDayCopyDialog.tsx` (a dialog to mirror), `src/ui/ModalDialog.tsx`, `src/ui/shared/surfaces.tsx` (`InlineNote`), `src/ui/MenuButton.tsx` (`MenuGroup`), `src/ui/modalDialogs.test.ts` (dialog inventory, currently 28).

Repository rules that apply to every package: use the file-edit tool for source edits (no shell redirection or `sed` on source files); keep domain code free of React and IndexedDB; preserve unrelated changes; do not change other features' behaviour.

## Shared types (defined in AB1, used by every later package)

Put these in `src/domain/autoBlocking.ts` (new file; AB2 adds the engine to the same file). Add the optional field to `BlockingScenario` in `src/domain/types.ts`.

```ts
// src/domain/types.ts
export interface BlockingScenario extends EntityMetadata {
  id: EntityId; scenarioId: EntityId; tripProfileId: EntityId; name: string; description?: string;
  /** Decision 0055: present when the Blocking Scenario was generated by "Build blocks automatically". */
  autoBlocking?: AutoBlockingRecord;
}
```

```ts
// src/domain/autoBlocking.ts
import type { MinimumLayoverRule } from './blocking';

/** One row per Pattern used by the Trip Profile. */
export interface AutoBlockingPatternRule {
  patternId: EntityId;
  /** Undefined = no minimum. Same shape and meaning as Decision 0050, applied after a Trip on this Pattern. */
  minimumLayover?: MinimumLayoverRule;
  breakAllowed: boolean;   // "Break here"
  canStart: boolean;       // "Block can start" at the Pattern's first node
  canEnd: boolean;         // "Block can end" at the Pattern's last node
}
export interface AutoBlockingBreakRule {
  lengthMinutes: number;            // whole minutes >= 1; includes the minimum layover
  minimumBlockHours: number;        // >= 0; blocks whose span is <= this get no break
  firstBreakAfterHours: number;     // >= 0; hours after the Block's first departure
  anotherBreakAfterHours?: number;  // > 0 when present; hours after the previous break ended
}
export interface AutoBlockingTerminalRule {
  nodeId: EntityId;
  pullOutMinutes: number;  // whole minutes >= 0, before the first Trip
  pullInMinutes: number;   // whole minutes >= 0, after the last Trip
  miles?: number;          // >= 0, each way; only used when the Route has a garage
}
export interface AutoBlockingGarage { routeId: EntityId; nodeId: EntityId }  // node of kind 'garage' on that Route
export interface AutoBlockingDeadheadRule {
  fromNodeId: EntityId; toNodeId: EntityId;  // different nodes of the same Route
  minutes: number;                           // whole minutes >= 0
  miles?: number;                            // >= 0
  bothWays: boolean;
}
export interface AutoBlockingRules {
  serviceDayIds: EntityId[];        // at least one; each has Trips in the Trip Profile
  patterns: AutoBlockingPatternRule[];
  break?: AutoBlockingBreakRule;    // undefined = no breaks
  maxRunningHours?: number;         // > 0 when present
  maxRevenueMiles?: number;         // > 0 when present
  garages: AutoBlockingGarage[];    // at most one per Route
  terminals: AutoBlockingTerminalRule[];
  deadheads: AutoBlockingDeadheadRule[];
}
export interface AutoBlockingRecord {
  rules: AutoBlockingRules;
  builtAt: string;                  // ISO timestamp; equals the generated Blocks' updatedAt
  tripCount: number;                // Trips placed in Blocks at build time
  blockCount: number;               // Blocks at build time
  sourceBlockingScenarioId?: EntityId;  // when rules were read from built blocks
}
```

## AB1: Types, rule validation, backup schema 8, remapping

**File ownership:**
- `src/domain/types.ts` (the `autoBlocking` field only);
- `src/domain/autoBlocking.ts` (types and `validateAutoBlockingRules` only);
- `src/domain/autoBlocking.test.ts` (validation tests only);
- `src/domain/blocking.ts` (only `duplicateBlockingScenario`, and a new exported helper `requiredLayoverSeconds`);
- `src/domain/project.ts` (Scenario copy remapping);
- `src/persistence/backup.ts` and its tests (`backup.test.ts`, `backupImportValidation.test.ts`);
- `src/domain/project.test.ts`;
- `docs/data-schema.md` (the `BlockingScenario` and backup sections).

Steps:

1. **Types.** Add the shared types above.
2. **`requiredLayoverSeconds`.** Extract the percent and minutes rule from `classifyBlockingInsertion` (about line 416 of `blocking.ts`) into:
   ```ts
   export function requiredLayoverSeconds(rule: MinimumLayoverRule | undefined, runtimeSeconds: number | undefined): number | undefined
   ```
   - Minutes: `value * 60`.
   - Percent: `Math.ceil(runtimeSeconds * value / 100)`, and `undefined` when the runtime is unknown or negative.
   - No rule: `0`.

   Make `classifyBlockingInsertion` use it without changing its behaviour. The existing tests must still pass.
3. **`validateAutoBlockingRules`.** Signature:
   ```ts
   export function validateAutoBlockingRules(rules: AutoBlockingRules, context: { patterns: RoutePattern[]; nodes: Node[]; serviceDayIds: EntityId[] }): ValidationFinding[]
   ```
   Pure. It returns error findings with entity type `autoBlocking`, rule IDs `autoBlocking.<problem>`, and a `field` path such as `patterns[2].minimumLayover`. It checks:
   - `serviceDayIds` is non-empty and every ID is in `context.serviceDayIds`;
   - every pattern rule references a known Pattern, with no duplicates;
   - minutes are whole numbers `>= 0`, and a percent is `0..100`;
   - break fields as typed in the shared types;
   - limits `> 0` when present;
   - each garage is a node of kind `garage` on its Route, at most one per Route;
   - each terminal row is a known node, with no duplicates;
   - each deadhead connects two different known nodes of the same Route, with whole minutes `>= 0` and miles `>= 0`;
   - every number is finite.
4. **`duplicateBlockingScenario`.** It already spreads the source scenario. When `source.scenario.autoBlocking` exists, set `autoBlocking.builtAt` to the duplicate's `now` (the copied Blocks get `now` too). The rules, counts and source stay the same.
5. **Scenario copy (`src/domain/project.ts`).** Where Blocking Scenarios are cloned (about line 246, `blockingScenarios = ...map(...)`), remap `autoBlocking`:
   - `rules.patterns[].patternId` with the Pattern ID map;
   - `garages[].routeId` with the Route ID map, and `garages[].nodeId`, `terminals[].nodeId`, `deadheads[].fromNodeId` and `toNodeId` with the Node ID map;
   - `serviceDayIds` with the service-day ID map;
   - `sourceBlockingScenarioId` with the Blocking Scenario ID map when the source is in the same copied set, otherwise drop the field.

   Drop any row whose reference has no mapping. Set `builtAt` to the copy's `now`. Find the existing maps in that function (`nodeIds`, the pattern map, the service-day map, `blockingScenarioIds`) and reuse them.
6. **Backup (`src/persistence/backup.ts`).**
   - **Schema version:** set `PROJECT_BACKUP_SCHEMA_VERSION = 8`. Add `7` to every list of accepted versions that currently ends with `PROJECT_BACKUP_SCHEMA_VERSION`. Search for `PROJECT_BACKUP_SCHEMA_VERSION].includes` and `[1, 2, 3, 4, 5, 6, PROJECT_BACKUP_SCHEMA_VERSION]`.
   - **Validation:** in `validateBlockingScenarios`, when `autoBlocking` is present, check its shape (object; `rules` object; arrays are arrays; `builtAt` a string; counts are non-negative integers). Then, after Patterns, Nodes and service days are validated, run `validateAutoBlockingRules` for that Scenario's records. Report a problem as `Invalid project backup: blockingScenarios[i].autoBlocking <problem>`.
   - **Older files:** a version 1–7 file never has `autoBlocking`. If one does, drop the field and do not fail.
   - **Remap on import:** in `cloneProjectSnapshot`, remap `autoBlocking` as in step 5, using that function's maps (`nodeIds`, `patternIds`, and so on), and set `builtAt` to `now`.
7. **`docs/data-schema.md`.** Document the field and the backup version 8 rule.

Tests:
- `autoBlocking.test.ts`: every validation rule, both valid and invalid cases.
- `project.test.ts`: a Scenario copy remaps every reference in `autoBlocking`, drops unknown rows, and resets `builtAt`.
- `backup.test.ts`:
  - a version 8 round trip keeps `autoBlocking`;
  - import remaps its IDs;
  - a version 7 file still imports;
  - a version 8 file with an invalid rule fails with a readable message.
- `blocking.test.ts`: duplicate keeps the record with the new `builtAt`; `requiredLayoverSeconds` cases.

Acceptance: `pnpm typecheck` and `pnpm test` pass. No UI changes. No IndexedDB version change (no store or index changes).

## AB2: Pure engine (`src/domain/autoBlocking.ts`)

**File ownership:** `src/domain/autoBlocking.ts` and `src/domain/autoBlocking.test.ts`. Nothing else.

### Exports

```ts
export interface AutoBlockingContext {
  scenarioId: EntityId;
  routes: Route[]; patterns: RoutePattern[]; nodes: Node[]; directions: RouteDirection[];
  serviceDays: ServiceDayDefinition[];
  trips: Trip[];                      // all Trips of the Trip Profile (any day)
}
export interface AutoBlockingBuildInput extends AutoBlockingContext {
  blockingScenario: BlockingScenario; // the new, unsaved scenario (id, scenarioId, tripProfileId)
  rules: AutoBlockingRules;
  now: string;
  newId?: () => EntityId;             // injectable for deterministic tests; defaults to ids.newId
}
export interface AutoBlockingDaySummary {
  serviceDayId: EntityId; tripCount: number; blockCount: number;
  revenueSeconds: number; runningSeconds: number; layoverSeconds: number; layoverPercent?: number;
  longestBlockSeconds: number;        // max over blocks of (last arrival - first departure)
  blocksWithOneBreak: number; blocksWithTwoOrMoreBreaks: number;
}
export interface AutoBlockingResult {
  blocks: BlockingBlock[];
  days: AutoBlockingDaySummary[];     // in service-day order (sortServiceDays)
  findings: ValidationFinding[];      // warnings and info only; see "Findings"
  blockFindings: ValidationFinding[]; // validateBlockingBlock on every generated block (expected empty of errors)
  passes: number;                     // build passes used by the minimum-block-length rule (1..5)
}
export function defaultAutoBlockingRules(context: AutoBlockingContext, tripProfileId: EntityId, preference?: MinimumLayoverRules): AutoBlockingRules;
export function buildAutoBlocks(input: AutoBlockingBuildInput): AutoBlockingResult;
export function describeBreakRule(rule: AutoBlockingBreakRule | undefined, lengthsHours?: number[]): Array<{ hours: number; breaks: number }>; // default lengths [4, 8, 16]
export function summarizeAutoBlockingRules(rules: AutoBlockingRules, patterns: RoutePattern[], nodes: Node[]): string;
export function measureBuiltBlocks(input: AutoBlockingMeasureInput): AutoBlockingMeasurement;
export function checkAgainstBuiltBlocks(input: AutoBlockingCheckInput): AutoBlockingCheck;
export function autoBlockingEditedCount(record: AutoBlockingRecord, blocks: BlockingBlock[]): { editedBlockCount: number; blockCountChanged: boolean };
```

### Trip facts (helpers inside the file)

For each in-scope Trip:
- **First departure:** the time of its lowest-`sequence` stop. **Last arrival:** the time of its highest-`sequence` stop.
- **Origin and destination nodes:** found through those stops' `patternPointId` in the Pattern's points.
- **Running seconds:** `tripRunTimeSeconds`.
- **Revenue miles:** `patternTotalMiles(pattern)`; `undefined` when incomplete. This matches `summarizeBlock`.

A Trip with no run time is skipped with an info finding `autoBlocking.tripWithoutTimes`.

### `defaultAutoBlockingRules` (Decision 0055 item 6)

- **Service days:** every service day that has at least one Trip of the Trip Profile.
- **Pattern rows:** one per Pattern used by those Trips, in Route name order, then direction group (outbound, inbound, none), then Pattern `sequence`, then name.
  - `canStart`: the Pattern's first point's node has kind `terminal` or `garage`.
  - `canEnd`: the same test on the last point's node.
  - `breakAllowed`: equal to `canEnd`.
  - `minimumLayover`: `preference?.[group]` for the Pattern's direction group, otherwise undefined.
- **Other fields:** `break` undefined; no limits; no garages; no deadheads.
- **Terminal rows:** `{ nodeId, pullOutMinutes: 0, pullInMinutes: 0 }` for every node that is the first node of a `canStart` Pattern or the last node of a `canEnd` Pattern, sorted by node name.

### `buildAutoBlocks`: the chaining rule (Decision 0055 items 4 to 10)

Scope:
- Trips with `scenarioId === input.scenarioId`, `tripProfileId === blockingScenario.tripProfileId`, `serviceDayId` in `rules.serviceDayIds`, and a run time.
- Each (service day, Route) pair is built separately. Blocks never mix days or Routes.

For one (day, Route):

1. **Sort** the Trips by first departure, then Trip `id`.
2. **Vehicle state:**
   ```
   { index, firstTripId, firstDeparture, atNodeId, readyAt, runningSeconds,
     revenueMiles (number | undefined), breaks, lastBreakEndAt?, lastPatternId,
     items: Array<{ trip, deadheadBefore?: AutoBlockingDeadheadRule (as used, oriented from->to) }> }
   ```
3. **For each Trip T** (origin O, destination D, pattern P, departure dep):
   - **Candidates:** every open vehicle V that passes the limits (step 4) and either:
     - **Direct:** `V.atNodeId === O && V.readyAt <= dep`. Its effective ready time is `V.readyAt`.
     - **Deadhead:** a connection from `V.atNodeId` to O exists, with `bothWays` allowing the reverse, and `V.readyAt + minutes*60 <= dep`. Its effective ready time is `V.readyAt + minutes*60`. If several connections fit, use the shortest.
   - **Choose:** the lowest effective ready time, then direct before deadhead, then the lowest `V.index`.
   - **No candidate:** start a new vehicle with `index = number of vehicles`. If P's rule has `canStart === false`, add a warning `autoBlocking.startNotAllowed` with parameters `{ tripId, patternId }`. The block is still created, so every Trip is placed.
4. **Limits:**
   - With `maxRunningHours`, a vehicle is a candidate only if `V.runningSeconds + run(T) <= maxRunningHours*3600`.
   - With `maxRevenueMiles` and known miles, the same test on miles.
   - If T alone breaks a limit, it starts its own vehicle, with a warning `autoBlocking.tripExceedsLimit`.
5. **After placing T on V:**
   - Update `atNodeId = D`, `runningSeconds`, `revenueMiles` and `lastPatternId = P`.
   - `wait = requiredLayoverSeconds(ruleOf(P).minimumLayover, run(T)) ?? 0`.
   - **Break**, only when `rules.break` is set, `ruleOf(P).breakAllowed`, and `V.firstTripId` is not in the suppressed set of this pass:
     - If `V.breaks === 0`: eligible when `arrival(T) - V.firstDeparture >= firstBreakAfterHours*3600`.
     - If `V.breaks >= 1`: eligible when `anotherBreakAfterHours` is set and `arrival(T) - V.lastBreakEndAt >= anotherBreakAfterHours*3600`.
     - If eligible: `wait = max(wait, lengthMinutes*60)`, `V.breaks += 1`, and `V.lastBreakEndAt = arrival(T) + lengthMinutes*60`.
   - `V.readyAt = arrival(T) + wait`.
6. **Minimum block length (multi-pass).** After a pass, collect the `firstTripId` of every vehicle with `breaks > 0` and span `<= minimumBlockHours*3600`, where span = last arrival − first departure. If that adds IDs to the suppressed set, rebuild the (day, Route) with the larger set. Stop when nothing is added, or after 5 passes; if the limit was reached, add an info finding `autoBlocking.breakPassesExhausted`. `passes` reports the most passes any (day, Route) used.
7. **Ending:** a vehicle whose `lastPatternId` rule has `canEnd === false` gets a warning `autoBlocking.endNotAllowed` with `{ blockLabel, patternId }`.

Writing the Blocks:
- **Order and labels:** order all vehicles of a day by Route name, then first departure, then `index`. Label them `Block 1`, `Block 2`, … per service day. With a single Route this is first-departure order.
- **Block fields:** `id = newId()`, `scenarioId`, `blockingScenarioId = blockingScenario.id`, `serviceDayId`, label, `createdAt = updatedAt = now`.
- **Activities,** each with `newId()` and then `normalizeBlockActivities`:
  - **Pull-out:** `{ type: 'pullOut', minutesBeforeFirstTrip: terminal(O1)?.pullOutMinutes ?? 0, fromNodeId: garage(route)?.nodeId ?? O1, toNodeId: O1, miles? }`, where O1 is the first Trip's origin. Include `miles` only when the Route has a garage and the terminal row has miles.
  - **For each item, in order:** if `deadheadBefore` is set, a `{ type: 'deadhead', minutesAfterPreviousTrip: dh.minutes, fromNodeId, toNodeId, miles? }`; then `{ type: 'revenueTrip', tripId }`. `minutesAfterPreviousTrip` is how the app stores a deadhead's duration (see `ActivityDialog` in `BlockingWorkspace.tsx`).
  - **Pull-in:** `{ type: 'pullIn', minutesAfterLastTrip: terminal(Dn)?.pullInMinutes ?? 0, fromNodeId: Dn, toNodeId?: garage nodeId, miles? }`. Leave out `toNodeId` when there is no garage. This is the same shape as the Jeffco baseline blocks.

Results:
- **`blockFindings`:** `validateBlockingBlock` on every generated Block, with context `{ scenario: { id: scenarioId }, blockingScenario, trips, patterns }`. These are expected to contain no errors. A test asserts this for every fixture.
- **`days`:** call `summarizeBlockingScenario(blockingScenario, dayBlocks, { trips, patterns })` for each day and copy `revenueSeconds` (sum the Blocks' `revenueSeconds`), running, layover and `layoverPercent`. `longestBlockSeconds` and the break counts come from the vehicle state of the final pass.

### Findings (warnings and info only)

| Rule ID | Severity | Meaning |
|---|---|---|
| `autoBlocking.tripWithoutTimes` | info | A Trip has no run time and was skipped |
| `autoBlocking.patternRuleMissing` | warning | A Trip's Pattern has no rule row; defaults from `defaultAutoBlockingRules` were used for it |
| `autoBlocking.startNotAllowed` | warning | A Trip had to start a Block on a Pattern that cannot start one |
| `autoBlocking.endNotAllowed` | warning | A Block ends after a Pattern that cannot end one |
| `autoBlocking.deadEndNode` | warning | Trips end at a node where no Trip of the Route departs and no deadhead connection leaves. Parameters `{ nodeId, tripCount, serviceDayId }`. Report once per node per day. |
| `autoBlocking.tripExceedsLimit` | warning | One Trip is over a block limit by itself |
| `autoBlocking.revenueMilesUnavailable` | warning | `maxRevenueMiles` is set but a Pattern in scope has incomplete miles; the miles limit is ignored |
| `autoBlocking.breakPassesExhausted` | info | The minimum-block-length rule did not settle in 5 passes |

### `describeBreakRule`

For each length L (default 4, 8 and 16 hours):
- `breaks = 0` when there is no rule or `L <= minimumBlockHours`.
- Otherwise count k = 1, 2, … while `first + (k-1) * (another + lengthMinutes/60) < L`. Only k = 1 is possible without `another`.

Example: rule (35 min, over 4 h, first 1 h, another 8 h) gives 4 h → 0, 8 h → 1, 16 h → 2. Test this exact case.

### `summarizeAutoBlockingRules`

A one-line plain-English summary for the provenance note. Example:

> Minimum layover: To Morrison none, To JeffCo 20 min · break: 35 min after To JeffCo, from 1 h, blocks over 4 h · Saturday and Sunday

- Name each Pattern by `name`.
- Add "· again after 8 h" when `anotherBreakAfterHours` is set.
- Add "· max 9 running h" or "· max 120 revenue mi" when limits are set.
- Add "· garage 9_Garage" when garages are set, and "· 2 deadhead connections" when deadheads are set.

### `measureBuiltBlocks` (Decision 0055 item 11)

```ts
export interface AutoBlockingMeasureInput {
  source: AutoBlockingContext & { blocks: BlockingBlock[] };   // the source Blocking Scenario's Blocks
  target: AutoBlockingContext;                                  // this Scenario
  targetRules: AutoBlockingRules;                               // current draft; unmeasured fields are kept
}
export type AutoBlockingMatchBasis = 'sameName' | 'sameDirection' | 'notMatched';
export interface AutoBlockingMeasurementLine { targetPatternId?: EntityId; basis?: AutoBlockingMatchBasis; text: string }
export interface AutoBlockingMeasurement { rules: AutoBlockingRules; lines: AutoBlockingMeasurementLine[] }
```

Measurements on the source. Only revenue Trips matter. A "gap" is the time between one Trip's arrival and the next Trip's departure in the same Block, when no deadhead activity lies between them.

- **Per source Pattern:**
  - **Minimum layover:** the shortest gap after its Trips. Whole minutes = `Math.floor(gap/60)`; 0 means no minimum.
  - **Can start / can end:** true when it is the first Trip's Pattern in some Block (start), or the last Trip's Pattern in some Block (end).
- **Break:**
  - **Length:** for each Block with at least 2 Trips, take its longest gap G_b. Break length = the minimum of all G_b, floored to 5 minutes, but only when that is greater than the largest measured minimum layover + 5 minutes. Otherwise there is no break.
  - **Break here:** true for the Patterns after which any G_b occurs.
  - **First break no earlier than:** the minimum over Blocks of (start of G_b − Block first departure), floored to 0.5 h.
  - **Only for blocks longer than:** the largest multiple of 0.5 h strictly below the shortest span among Blocks that have a gap of at least the break length.
  - **Another break after:** if some Block has two gaps of at least the break length, the minimum time from the end of the first to the start of the second, floored to 0.5 h. Otherwise undefined.
- **Matching to target Patterns:**
  - **Same name:** same Route name and Pattern name (trimmed, case-insensitive) takes that source Pattern's values (`sameName`).
  - **Same direction:** otherwise, the source Patterns with the same direction group give their combined values (`sameDirection`): the minimum of minimum layovers, `canStart`/`canEnd`/`breakAllowed` true if any of them is true.
  - **Not matched:** otherwise keep the target row unchanged (`notMatched`).
- **Lines:** one line per target Pattern, saying what was measured and what it maps to (see `mockups.html`, Screen 2, item 6, for tone), plus one line for the break and one for block lengths.
- **Expected values:** on a fixture that copies the Jeffco 2025 Baseline layovers (minimum layover 20 after inbound and 0 after outbound; the longest gaps per block are 50, 50, 50, 50, 50, 50 and 65 minutes), the break length must come out as 50. The mock-up's "35" is illustrative.

### `checkAgainstBuiltBlocks`

```ts
export interface AutoBlockingCheckInput { source: AutoBlockingContext & { blockingScenario: BlockingScenario; blocks: BlockingBlock[] }; rules: AutoBlockingRules; now: string }
export interface AutoBlockingCheck { days: Array<{ serviceDayId: EntityId; name: string; builtBlocks: number; builtRevenueSeconds: number; autoBlocks: number; autoRevenueSeconds: number }>; differencePercent?: number }
```

- **Mapping rules back:** map the target rules onto source Patterns by name, then by direction group. Use the same matching in reverse: each source Pattern takes the rule of its same-name target Pattern, otherwise the first target rule of its direction group, otherwise the defaults.
- **Days:** use the source days that have built Blocks.
- **Run:** call `buildAutoBlocks` on the source Trips with a throwaway Blocking Scenario on the source Trip Profile.
- **Compare:** use `summarizeBlockingScenario` for the built side. `differencePercent = (sum auto − sum built) / sum built * 100`.

### `autoBlockingEditedCount`

- `editedBlockCount`: the Blocks with `updatedAt > record.builtAt`.
- `blockCountChanged`: `blocks.length !== record.blockCount`.

### AB2 tests (`autoBlocking.test.ts`)

**Fixture.** Build a synthetic Route that mirrors `synthetic-check.py`:
- Nodes A and B, both kind `terminal`.
- Pattern `AB` (outbound, points A then B) and Pattern `BA` (inbound, B then A).
- Directions so that `patternDirectionGroups` maps them.
- 29 Trips each way on one service day, as in the script.
- Rules: `AB` with no minimum and no break; `BA` with 20 minutes and a break. Both patterns `canStart` and `canEnd` true. Break 35 min, over 4 h, first after 1 h.
- Use an injected counter for `newId`.

| Case | Expected |
|---|---|
| 35-min Trips | 7 blocks; sum of spans 2800 min; spans sorted `[385,385,385,385,385,400,475]` min; 7 with a break; total `revenueSeconds` 168000; `blockFindings` has no errors |
| 46-min Trips | 9 blocks; 3528 min; `[362,362,362,362,362,362,377,482,497]`; 9 with a break |
| 35-min, no break rule | 6 blocks; 2490 min; `[340,430,430,430,430,430]` |
| 35-min, `minimumBlockHours: 7` | 7 blocks; 2800 min; `[385,385,385,385,385,385,490]`; 1 with a break; `passes >= 2` |

Further tests:
- Percent rule: 50% on a 30-minute Trip requires 15 minutes of layover.
- **Deadhead connection:** Trips A→B, then C→A, with no Trip from B. Without a connection, every Trip starts a block and there is a `deadEndNode` finding for B. With connection B→C of 10 minutes, the Trips chain, and the deadhead activity has `minutesAfterPreviousTrip` 10.
- `bothWays` lets the reverse connection be used.
- `maxRunningHours` splits a long chain. `tripExceedsLimit` fires when one Trip is over the limit.
- `canStart: false` on `BA` produces `startNotAllowed` for a block that has to start at B. `canEnd: false` on `AB` produces `endNotAllowed`.
- **Garage:** the pull-out goes from the garage node with the terminal row's minutes and miles; the pull-in goes to the garage. With no garage, the pull-out goes from and to the terminal and the pull-in has no `toNodeId`.
- Labels are numbered per day by first departure. Two Routes on one day are numbered with the first Route's blocks first.
- Trips of other days, other Trip Profiles or other Scenarios are ignored.
- **Determinism:** shuffled Trip input with the same `newId` counter gives deep-equal output.
- `defaultAutoBlockingRules`: kinds drive start/end; the preference drives minimum layover; days without Trips are excluded.
- `describeBreakRule` and `summarizeAutoBlockingRules` examples.
- `measureBuiltBlocks` on a fixture that copies the Jeffco baseline gaps; name and direction matching.
- `checkAgainstBuiltBlocks` returns both sides.
- `autoBlockingEditedCount`.

Acceptance:
- `pnpm typecheck` and `pnpm test` pass.
- The numbers above match `python3 docs/implementation/automatic-blocking/synthetic-check.py`.
- No changes outside the owned files.

## AB3: Application service and wiring

**File ownership:**
- `src/application/ports.ts`;
- `src/application/blockingService.ts`;
- a new `src/application/autoBlocking.test.ts`;
- `src/main.tsx` (context wiring only);
- any in-memory test doubles of `BlockingContextProvider` that fail to compile.

1. **`BlockingContextProvider` gains optional methods:**
   - `listNodes?(scenarioId)`;
   - `listRoutes?(scenarioId)`;
   - `listProjectScenarios?(scenarioId): Promise<Scenario[]>`, which returns every Scenario of the same Project, including this one.

   Wire them in `src/main.tsx`:
   - nodes: `repository.db.nodes.where('scenarioId').equals(id).toArray()`;
   - routes: the same on `routes`;
   - project scenarios: read the Scenario, then `repository.db.scenarios.where('projectId').equals(projectId).toArray()`.

   Automatic-blocking methods refuse with a clear error when `listNodes` or `listRoutes` is missing.
2. **`BlockingQueries` additions:**
   ```ts
   getAutoBlockingSetup(scenarioId: string, tripProfileId: string, preference?: MinimumLayoverRules): Promise<AutoBlockingSetup>;
   previewAutoBlocking(request: AutoBlockingRequest): Promise<AutoBlockingPreview>;
   measureAutoBlockingSource(scenarioId: string, tripProfileId: string, sourceBlockingScenarioId: string, draft: AutoBlockingRules): Promise<AutoBlockingMeasurement>;
   getAutoBlockingStatus(blockingScenarioId: string): Promise<{ record: AutoBlockingRecord; editedBlockCount: number; blockCountChanged: boolean; summary: string } | undefined>;
   ```
   ```ts
   export interface AutoBlockingRequest { scenarioId: string; tripProfileId: string; name: string; rules: AutoBlockingRules; sourceBlockingScenarioId?: string }
   export interface AutoBlockingSetup {
     routes: Route[]; patterns: RoutePattern[]; nodes: Node[];
     patternGroups: Record<EntityId, DirectionGroup | undefined>;
     patternTripCounts: Record<EntityId, number>;
     serviceDays: Array<{ day: ServiceDayDefinition; tripCount: number }>;
     milesIncompletePatternIds: EntityId[];
     defaultRules: AutoBlockingRules;
     defaultName: string;                                   // "Automatic" + short rule summary, unique among siblings (add " 2", " 3" ...)
     sources: Array<{ blockingScenarioId: string; scenarioName: string; name: string; blockCount: number }>; // every Blocking Scenario in the Project with >= 1 Block, current Scenario first
   }
   export interface AutoBlockingPreview {
     result: AutoBlockingResult;
     ruleFindings: ValidationFinding[];   // validateAutoBlockingRules
     nameFindings: ValidationFinding[];   // validateBlockingScenarioName against siblings
     check?: AutoBlockingCheck;           // when sourceBlockingScenarioId is set
   }
   ```
3. **`BlockingCommands` addition:** `createAutoBlockingScenario(request: AutoBlockingRequest): Promise<BlockingScenario>`.
   1. Load the context and validate the rules and the name. Any error throws a `BlockingValidationError` with the findings.
   2. Create the Blocking Scenario with `createBlockingScenario`.
   3. Build with `buildAutoBlocks` on the server side; never trust a client preview.
   4. Run `assertStructurallyValidBlock` on every Block.
   5. Set `autoBlocking = { rules, builtAt: now, tripCount, blockCount, sourceBlockingScenarioId }`, with `now` equal to the Blocks' timestamps.
   6. Save with the existing `repository.saveBlockingScenarioGraphAtomically(scenario, blocks)`. No new repository method and no change to `BLOCKING_WRITE_METHODS` are needed.
   7. Return the new scenario.
4. **Tests (`autoBlocking.test.ts`, in-memory repositories as in `blockingService.test.ts`):**
   - the setup lists patterns, defaults, days with Trip counts, and sources across two Scenarios of one Project;
   - preview returns the AB2 numbers on the synthetic fixture;
   - create writes one Blocking Scenario with `autoBlocking` and its Blocks, leaves other Blocking Scenarios untouched, and refuses a duplicate name and invalid rules without writing;
   - measure reads a Blocking Scenario of another Scenario;
   - status reports edited Blocks after `updateBlock`.

Acceptance: `pnpm typecheck` and `pnpm test` pass. No UI changes.

## AB4: User interface

**File ownership:**
- new `src/ui/blocking/AutoBlockingDialog.tsx`;
- `src/ui/blocking/BlockingWorkspace.tsx` (menu item, dialog mount, provenance note, selecting the new scenario);
- `src/ui/styles/blocking.css`;
- `src/ui/modalDialogs.test.ts` (inventory 28 → 29, with a comment);
- `src/ui/blocking/BlockingWorkspace.test.ts`, only if it needs updating.

The approved layout is `docs/implementation/automatic-blocking/mockups.html`, Screens 1, 2, 2b and 3. Match it. Where this plan and the mock-up differ, this plan wins.

### Entry point (Screen 1)

In `blockingActionsMenu`, insert directly after the `new` item:

```ts
{ id: 'auto-build', label: 'Build blocks automatically…', restoreFocus: false, disabled: busy || !profile, onSelect: () => setAutoBlocking({ mode: 'new' }) }
```

### Dialog (`AutoBlockingDialog.tsx`, Screens 2 and 2b)

**Props:** `{ blockingService; scenarioId; tripProfileId; minimumLayover?: MinimumLayoverRules; initialRules?: AutoBlockingRules; onCreated: (scenario: BlockingScenario) => Promise<void>; onClose: () => void }`.

**Data flow:**
- **On open:** `getAutoBlockingSetup`. The draft rules start from `initialRules` (mapped to existing patterns and nodes; drop unknown rows; fill missing patterns from `defaultRules`), otherwise from `defaultRules`.
- **Preview:** call `previewAutoBlocking` 300 ms after the last change. Ignore responses older than the latest request (use a request counter).
- **Read rules:** choosing a source and pressing "Use these rules" calls `measureAutoBlockingSource` and replaces the draft with `measurement.rules`.
- **Create:** calls `createAutoBlockingScenario`, then `onCreated(scenario)`.

**Structure:**
- `ModalDialog as="form" label="Build blocks automatically" className="confirm-dialog auto-blocking-dialog"`.
- `h2` "Build blocks automatically".
- Intro paragraph (exact text): "Creates a new blocking scenario from the {n} trips in trip profile {name}. Each departure takes the vehicle that became ready most recently after its minimum layover, so spare vehicles finish early; if none is ready, a new block starts. The result is ordinary blocks that you can edit, rename or delete." (changed by Decision 0056)
- Body: a two-column grid (`minmax(0,1.85fr) minmax(0,1fr)`). The right column is sticky.

**Left column, in order:**

1. **Name and days row.**
   - "Blocking scenario name" text input (default `defaultName`).
   - "Service days" checkboxes, one per day, showing the trip count in a `small`. A day with 0 Trips is disabled, with "no trips".
   - The name findings show under the field.
2. **`<details open>` "Patterns".**
   - Summary text: "Minimum layover, breaks, and where blocks start and end".
   - For each Route: a heading with the Route name, only when there is more than one Route. Then one table each for "Outbound", "Inbound" and "No direction", omitting empty groups.
   - Columns: Pattern | Minimum layover after | Break here | Block can start | Block can end.
   - **Pattern cell:** the existing pattern pill (as in the Blocking tables), the Pattern name, and a second line "{first node short name} → {last node short name} · {n} trips".
   - **Minimum layover cell:** a select with "No minimum", "Minutes" and "% of trip", plus a number input. The input is disabled for No minimum.
   - **Break here:** a checkbox.
   - **Block can start:** a checkbox labelled "at {first node short name}". **Block can end:** a checkbox labelled "at {last node short name}".
   - Every control has an accessible name that includes the Pattern name.
3. **`<details open>` "Breaks".**
   - Summary: `summarizeAutoBlockingRules`-style text for the break only, or "No breaks".
   - Four number inputs: "Break length (min)", "Only for blocks longer than (h)", "First break no earlier than (h after start)", "Another break after (h without one)". A blank break length means no breaks, and the other three are then disabled.
   - Under the fields: "With these rules: a 4 h block gets {n} · an 8 h block gets {n} · a 16 h block gets {n}. Breaks are taken only after patterns marked Break here." Use `describeBreakRule` and "no break", "1", "2".
   - An info `InlineNote`: "Meal and relief breaks are normally set in run cutting. This puts them in the blocks as long layovers so that block hours include them."
4. **`<details>` "Block limits"** (closed by default).
   - Summary "No limits", or for example "Max 9 running h · max 120 revenue mi".
   - Inputs: "Maximum running per block (h)" and "Maximum revenue miles per block". The miles input is disabled when `milesIncompletePatternIds` is not empty, with a warn `InlineNote` naming those Patterns and "Enter cumulative miles on the Route tab."
5. **`<details>` "Pull-out and pull-in"** (closed).
   - Summary, for example: "No garage · blocks start and end at a terminal · 0 min".
   - One "Garage" select per Route, with "None · start and end at a terminal" plus that Route's `garage` nodes. If the Route has no garage node, add the helper text "This scenario has no garage nodes. Add one on the Route tab to pull out from it."
   - A table with Terminal | Pull-out (min before first trip) | Pull-in (min after last trip) | Miles each way. The rows are the nodes that some Pattern can currently start or end at; recompute them when checkboxes change and keep values typed for nodes that stay. Miles is disabled when that Route has no garage.
6. **`<details>` "Deadhead connections"** (closed).
   - Summary "None · trips connect only where one ends and the next starts", or "{n} connections".
   - A table with From | To | Minutes | Miles | Both ways | (remove button "Remove connection").
   - From lists every node of the Scenario as "{route} · {short name}". To lists the nodes of the From node's Route, except From itself.
   - "+ Add connection" appends a blank row.
   - Under the table: "A vehicle that ends a trip at the From node can take a trip from the To node once the deadhead and the minimum layover have passed. A connection is used only when it lets a block continue."

**Right column:**
- **Read rules from built blocks.**
  - A select labelled "Read rules from built blocks" with "None" plus each source as "{scenario} · {blocking scenario}".
  - When a source is selected, show `measurement.lines` as a bulleted list and the button "Use these rules".
  - Keep the selected source ID in state and send it as `sourceBlockingScenarioId` with the preview and create requests, so the check runs.
- **Preview.**
  - A table with Day | Blocks | Revenue (h) | Layover % | Longest (h) | 1 break | 2+ breaks, one row per selected day. Revenue and longest use two decimals; layover % uses one decimal.
  - Under it, warning `InlineNote`s for `result.findings` with severity warning. Write one plain sentence per rule ID; group repeats with a count, for example "3 trips had to start a block on To JeffCo, which cannot start one."
  - When `check` exists, an ok `InlineNote` per source day: "Same rules on {source scenario} {day} trips: {a} blocks, {h} h. Its built blocks: {b} blocks, {h2} h (automatic is {p}% higher/lower)."

**Footer:** `dialog-actions` with "Cancel" and the primary "Create blocking scenario". The primary button is disabled while setup or preview is loading, while any rule or name finding has severity error, or when no day is selected. While creating it reads "Creating…". Errors appear with `userFacingError` in a `field-error` paragraph.

**Styles:**
- Add the dialog rules to `src/ui/styles/blocking.css` under a comment `/* Decision 0055: Build blocks automatically dialog. */`.
- Take them from `mockup-extra.css`, renaming selectors to an `auto-blocking-` prefix:
  - `.auto-dialog` → `.auto-blocking-dialog`, `.auto-body` → `.auto-blocking-body`, `.auto-col` → `.auto-blocking-col`;
  - `.sec` → `.auto-blocking-section`, `.pat-table` → `.auto-blocking-table`;
  - `.auto-side` → `.auto-blocking-aside`, `.provenance` → `.auto-blocking-note`;
  - other classes keep their names with the prefix.
- Use only existing tokens from `src/ui/styles/tokens.css`. No new colours.
- The generic rule `.confirm-dialog > div:not(.activity-form)` turns direct child `div`s into right-aligned flex rows. Override it for the body grid with a more specific selector, as the mock-up does, or wrap the body in a `section`.
- The dialog is at most `calc(100vh - 32px)` tall and scrolls inside, like `.block-copy-dialog`.

**Keyboard and accessibility:**
- Standard `ModalDialog` behaviour; the first focus goes to the name input.
- `<details>` summaries are keyboard operable.
- The preview table has an `aria-label`.
- The axe checks in `tests/ui/keyboard.spec.ts` must still pass with the dialog open (AB5 adds the dialog to that run).

### After creating

The workspace sets the new Blocking Scenario as selected (the same state and preference as choosing it in the selector), closes the dialog, and reloads its data.

### Provenance note (Screen 3)

When the selected Blocking Scenario has `autoBlocking`, render above `.blocking-top` a `div.auto-blocking-note` containing:
- An info `InlineNote`: "**Built automatically** on {date as d MMM yyyy} from {tripCount} trips · {summary}. {No blocks edited since. | {n} blocks edited since. | Blocks added or deleted since.}". The data comes from `getAutoBlockingStatus`; reload it after any Blocking write.
- A `link-button` "Build again…", which opens the dialog with `initialRules = record.rules`.

Acceptance:
- `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- Visual check against `mockups.html` Screens 1, 2, 2b and 3 with the dev server (`pnpm dev`) and the golden project or any project with terminals. Save screenshots to the scratchpad, not the repository, and attach them to the report.

## AB5: Browser test, documentation, closeout

**File ownership:**
- new `tests/ui/automatic-blocking.spec.ts`;
- `tests/ui/keyboard.spec.ts` (add the dialog to the axe run);
- `architecture_overview.md`;
- `docs/ui-conventions.md`;
- `docs/domain-glossary.md`;
- `docs/data-schema.md` (if AB1 left anything);
- `codex.md` (current status);
- Decision 0055 status line;
- this plan's status line.

1. **`tests/ui/automatic-blocking.spec.ts`.** Seed the Federal BRT golden fixture as `tests/ui/blocking-day-copy.spec.ts` does (`seedSnapshot`, `goldenRaw`), then:
   1. open the Blocking tab;
   2. open "Blocking actions" and choose "Build blocks automatically…";
   3. check the dialog "Build blocks automatically" is visible and the preview table has at least one row with Blocks greater than 0;
   4. set a unique name and press "Create blocking scenario";
   5. check the Blocking scenario selector shows the new name;
   6. check the day summary reports at least 1 block, and Unassigned trips shows none left for that day;
   7. check the provenance note contains "Built automatically";
   8. check the Costing tab's Cost basis list contains "Blocked · {name}".

   Keep the assertions independent of exact golden-data counts.
2. **Documentation updates:**
   - **`architecture_overview.md`:** add to the Blocking Model section a paragraph on automatic blocking: where it lives (`src/domain/autoBlocking.ts`, `BlockingApplicationService`, `AutoBlockingDialog.tsx`), the chaining rule in one sentence, the stored `autoBlocking` record, backup version 8, and "no new cost basis".
   - **`docs/ui-conventions.md`:** the menu item, the dialog sections, and the provenance note.
   - **`docs/domain-glossary.md`:** "Automatic blocks", "Break rule", "Deadhead connection (automatic blocking)".
   - **`codex.md`:** a "Current implementation status" entry.
3. **Status lines:** Decision 0055 becomes "Accepted (user decisions of 2026-11-03); implemented, awaiting user acceptance".
4. **Full verification:** `pnpm typecheck`, `pnpm test`, `pnpm build`, and the full browser suite (`pnpm test:ui`, with the Chromium setup in `codex.md`). Report any known-flaky failures separately; `tests/ui/unified-action-layer.spec.ts:161` is known to be flaky.

## Out of scope (do not build)

- Replacing an existing Blocking Scenario's Blocks in place ("Rebuild").
- A day-level "Block unassigned trips automatically…" command.
- Interlining across Routes.
- Tiered break rules.
- Run cutting.
- Any Costing change.
