# Phase 2TP Implementation Plan: Trip Profiles

## Status

Implementation complete and user-accepted on 2026-09-14. See `phase-02tp-closeout.md` for the implementation record and verification results.

This package must be completed before Phase 2R-E closeout, the rewritten service-day workflow, or manual blocking.

## Model and ownership

Luna is recommended for Packages 2TP-A through 2TP-C. The user has approved Luna for the limited UI wiring because the interaction and placement are fully specified below and introduce no new layout system. Luna must reuse existing controls, spacing, dialogs, and accessibility conventions without making independent visual-design decisions.

The primary agent owns Package 2TP-D integration review and final acceptance.

## Objective

Add named, scenario-wide timetable alternatives without coupling them to one Runtime profile. Users can maintain a Default Trip profile, rename it, copy it, and delete eligible alternatives. Every trip command and schedule query operates within the selected Trip profile. Future blocking receives one explicit source Trip profile and cannot mix competing timetable alternatives.

## User workflow

The shared Trips context keeps route, day, and direction selectors in the existing workspace row. Trip Profile and its lifecycle actions appear inside the Trips panel, directly below the Trips header and above the schedule table:

```text
Shared row: Route | Day | Direction
Trips panel: Trip Profile | Rename | Copy | Delete
```

- `Default` is selected automatically in a new or migrated Scenario.
- Rename changes only the Trip profile name.
- Copy requests a new name and duplicates the entire profile's Trips across all Routes and service days.
- Delete opens an impact dialog. It removes the profile and its complete trip branch only after confirmation.
- The last Trip profile cannot be deleted. The dialog states that another profile must be created by copying the current profile first.
- Switching Trip profile reloads the schedule for the selected Route, Day, and Direction and clears selected rows plus Trip shift undo/redo history.
- Runtime Pattern and Runtime Profile controls remain inside Runtimes. They are not filtered or changed by Trip profile selection.

## Proposed ownership rules

### Scenario-owned Trip profile

One Trip profile spans the full Scenario. This is deliberate even though the first UI edits one Route at a time.

```typescript
interface TripProfile extends EntityMetadata {
  id: EntityId;
  scenarioId: EntityId;
  name: string;
  sourceTripProfileId?: EntityId;
}
```

Names must be non-empty and unique within a Scenario after trimming and case normalization.

### Trip ownership

Add the required field:

```typescript
interface Trip {
  // existing fields
  tripProfileId: EntityId;
}
```

Every generation and direct-add request also carries `tripProfileId`. Trip queries must require it or explicitly document a cross-profile administrative use. UI queries must never return Trips from another profile.

### Runtime independence

Do not add `runtimeProfileId` or runtime-assignment ownership to `TripProfile`.

- Build and Add resolve the current Runtime assignment for Pattern and service day.
- Recalculate resolves the current assignment at execution time.
- Existing Trips remain fixed and retain calculation provenance.
- Copy preserves each Trip's recorded calculation source without creating or selecting Runtime profiles.
- Runtime profile deletion checks Trips across every Trip profile.

### Blocking boundary

Add required `tripProfileId` ownership to the current `Block` record. A Block may reference only Trips with the same `scenarioId`, `serviceDayId`, and `tripProfileId`.

This is not the future Blocking-scenario feature. Phase 4 must introduce named Blocking scenarios that each reference one Trip profile; multiple Blocking scenarios may use the same Trip profile. The Blocking workspace will select:

```text
Trip Profile | Blocking Scenario | Day
```

Direction is not a Blocking filter. Route may be an optional trip-list filter, but cannot constrain Block ownership because future Blocks may interline Routes.

## Lifecycle rules

### Default provisioning

- Creating a Scenario also creates one Trip profile named `Default`.
- Loading a legacy Scenario after migration always finds at least one profile.
- There is no separate New action in the first interface. Copy is the mechanism for creating an alternative with a complete known schedule state.

### Rename

- Rename updates metadata only.
- Trips and Blocks retain their identifiers and ownership.
- Duplicate names are rejected with `A Trip profile with this name already exists.`

### Copy

- Copy every Trip in the source profile across all Routes and service days.
- Allocate new Trip IDs. Copy each ordered scheduled-time value while retaining its shared Pattern-point reference.
- Preserve Pattern, service day, scheduled times, public label, creation method, manual shift, manually changed fields, and calculation-source values.
- Set `sourceTripProfileId` on the new profile.
- Do not copy Blocks or future Blocking scenarios.
- Commit the new profile and all copied Trips atomically.
- Select the new profile after success.

### Delete

The impact preview reports:

- Trip count by Route and service day;
- count of manually adjusted Trips;
- count of Trips whose Runtime source is currently stale;
- Block count and Block-activity count;
- whether this is the last Trip profile.

Deletion policy:

- block deletion of the last Trip profile;
- otherwise delete the profile and its Trips;
- delete Blocks owned by that profile, because the complete timetable branch is being removed;
- later, also delete its Blocking scenarios and their Blocks;
- retain Route, Pattern, Runtime profile, Runtime assignment, and service-day records;
- recalculate the impact at commit time and reject a stale preview;
- perform all removals in one transaction.

The destructive action is labeled `Delete Trip Profile`; Cancel performs no writes.

## Persistence and migration

### IndexedDB version 3

Add a `tripProfiles` table:

```text
id, scenarioId, [scenarioId+name], updatedAt
```

Update indexes:

```text
trips: id, scenarioId, tripProfileId, routeId, serviceDayId, patternId,
       [tripProfileId+routeId], [tripProfileId+serviceDayId],
       provenance.generationSetId, provenance.runtimeProfileId

blocks: id, scenarioId, tripProfileId, serviceDayId,
        [tripProfileId+serviceDayId], [serviceDayId+label]
```

Upgrade existing data as follows:

1. Create one `Default` Trip profile for every existing Scenario.
2. Assign every existing Trip and Block in that Scenario to its Default profile.
3. Validate that every revenue-trip Block activity still references a Trip in the same profile and service day.
4. Complete the migration atomically or leave version 2 data unchanged.

Add a focused migration test using a populated version 2 database.

### Snapshots, backup, and CSV

- Add `tripProfiles` to `ScenarioRecords`, `ProjectSnapshot`, and `DatabaseRecordMap`.
- Increment the JSON backup schema from version 3 to version 4.
- Version 1–3 imports create one Default profile per imported Scenario and assign legacy Trips and Blocks to it.
- Export and import-as-copy preserve and remap profile, Trip, Block, and revenue-trip references.
- Scenario duplication copies and remaps all Trip profiles, Trips, and Blocks.
- Trip CSV adds `tripProfileId` and `tripProfileName`.
- Block CSV adds the same two columns.
- No runtime CSV structure changes.

## Application contracts

Exact names may vary, but the application layer must expose equivalent behavior:

```typescript
listTripProfiles(scenarioId): Promise<TripProfile[]>
ensureDefaultTripProfile(scenarioId): Promise<TripProfile>
renameTripProfile(profileId, name): Promise<TripProfile>
copyTripProfile(profileId, name): Promise<TripProfileCopyResult>
previewTripProfileDeletion(profileId): Promise<TripProfileDeletionPreview>
deleteTripProfile(profileId, previewToken): Promise<void>
```

`previewTripProfileDeletion` returns a deterministic review token. The commit rechecks the branch and rejects a stale token before deleting anything.

All authoritative Trip commands and queries add `tripProfileId` explicitly. React must not infer profile ownership from the currently visible Trips.

## Work-package sequence

```text
2TP-A Domain model and migration — Luna
  -> structural verification gate
2TP-B Application lifecycle, persistence graph, backup, and CSV — Luna
  -> data-integrity verification gate
2TP-C Exact UI wiring — Luna by explicit user approval
  -> hands-on verification gate
2TP-D Primary-agent integration and Phase 2R closeout
```

## Package 2TP-A: Domain model and migration

### File ownership

- Trip-profile domain module and tests;
- domain types and validation;
- Dexie database declaration and migration tests;
- in-memory repository structural support;
- schema, glossary, and decision documentation.

### Deliverables

- Add `TripProfile` and required Trip/Block ownership.
- Add profile-name normalization and validation.
- Add pure copy and deletion-impact calculations.
- Reject cross-profile Block activities.
- Add Dexie version 3 migration and legacy default provisioning.
- Update existing fixtures without changing scheduling calculations.

### Required tests

- one Default profile per new and migrated Scenario;
- unique trimmed profile names;
- copied Trips receive new IDs and preserve schedule/provenance values;
- copied profiles include every Route and service day;
- Blocks cannot reference Trips from another profile;
- migration assigns existing Trips and Blocks to Default;
- forced migration failure leaves version 2 data intact;
- 2,000-Trip copy remains within a practical local-browser duration.

### Gate

Run focused domain and migration tests plus TypeScript typechecking. Stop for user verification before 2TP-B.

## Package 2TP-B: Application lifecycle and persistence

### File ownership

- application ports and profile service;
- repository implementations and transaction tests;
- authoritative Trip command/query scoping;
- route-safe editing and deletion impact integration;
- backup, restore, scenario duplication, and CSV serializers/tests.

### Deliverables

- Provision Default during Scenario creation.
- Implement list, rename, copy preview/commit, and delete preview/commit.
- Scope every Trip command and UI-facing query to one Trip profile.
- Clearly reject missing, wrong-Scenario, or stale profile references.
- Make copy and delete atomic.
- Count safe Route/Pattern edits and Runtime staleness across profiles.
- Keep Route deletion and Scenario deletion complete.
- Add export schema version 4 and legacy import normalization.

### Required tests

- Build, Add, shift, pattern change, regenerate, and delete affect only the selected profile;
- two profiles may contain Trips at identical times without duplicate warnings across profiles;
- copy preserves source data but has independent IDs;
- copy creates no Blocks;
- delete preview reports all dependent records;
- last-profile deletion is blocked;
- confirmed deletion removes the complete selected branch only;
- stale preview cannot commit;
- route deletion removes its Trips from every profile;
- Pattern reset affects matching Trips across every profile;
- runtime deletion finds calculation references across every profile;
- scenario duplication and backup round trips remap all references;
- legacy backup imports create Default profiles;
- forced transaction failures leave every profile branch unchanged.

### Gate

Run all domain, application, repository, backup, CSV, migration, and typechecking checks. Stop before UI wiring.

## Package 2TP-C: Exact UI wiring

### File ownership

- existing Trips workspace component;
- minimal existing CSS required to fit the specified controls;
- focused UI and browser-layout tests;
- UI conventions documentation.

### Required behavior

- On Trips only, place Trip Profile and Rename, Copy, and Delete in a compact row directly below the Trips section header and above the schedule table.
- Keep Route, Day, and Direction in the existing shared workspace row.
- Reuse the existing compact select and secondary button styles.
- Copy and Rename reuse the established name dialog.
- Delete uses the established destructive impact dialog with an explicit `Delete Trip Profile` action.
- Do not add a Trip-profile panel, card, descriptive paragraph, badge, or color system.
- Preserve the selected profile while changing Route, Day, or Direction within the same Scenario.
- Reset to that Scenario's Default or first profile when changing Scenario or Project.
- Clear selected Trips, draft Add row, open Shift controls, and shift undo/redo when changing profile.
- Empty profiles show the existing empty schedule message; no Trips are pre-generated.
- Runtimes remain visible and unchanged when profiles switch.
- Buttons and schedule are disabled while a copy or delete transaction is running.
- Controls have accessible names and full keyboard operation.

### Required tests

- Trip Profile and its actions appear below the Trips header and above the schedule table, while Route, Day, and Direction remain in the shared workspace row;
- controls appear only where specified;
- switching profile shows only its Trips;
- switching profile clears temporary selection and shift history;
- Rename does not alter Trips;
- Copy selects an independent complete schedule;
- Delete cancel performs no writes;
- last-profile deletion shows the required explanation;
- deletion confirmation reports Trip and Block impacts;
- no profile switch changes Runtime controls;
- compact workspace row remains usable at supported desktop widths.

### Gate

Run TypeScript typechecking, relevant Vitest and Playwright tests, production build, keyboard review, and visual inspection. Pause for hands-on user verification.

## Package 2TP-D: Integration and closeout

### Responsibility

Primary agent.

### Acceptance criteria

- One Scenario contains one or more independently selectable Trip profiles.
- Runtime profiles remain independent calculation inputs.
- Every Trip and Block has valid Trip-profile ownership.
- No Trip command or schedule query can leak across profiles.
- Copy duplicates all Route/day Trips with independent IDs and no Blocks.
- Delete is impact-reviewed, atomic, and cannot remove the last profile.
- Future Blocking scenarios are constrained to one Trip profile.
- Route/Pattern/runtime lifecycle behavior remains complete across profiles.
- Database version 3, export schema version 4, legacy import, scenario duplication, CSV, reload, and visual verification pass.

Record a Phase 2TP closeout and then complete Phase 2R-E. Do not start the service-day or Blocking phase automatically.

## Decisions to confirm at the review gate

The proposed defaults are:

1. Trip profiles are Scenario-owned and span all Routes and service days.
2. Copy duplicates Trips but no Blocks.
3. Existing Runtime assignments remain shared and independent.
4. The last Trip profile cannot be deleted.
5. Deleting a non-final Trip profile removes its owned Blocks as one complete branch.
6. Future Blocking scenarios each select one Trip profile and cannot mix profiles.
