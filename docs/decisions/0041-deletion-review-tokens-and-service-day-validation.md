# Decision 0041: Deletion Review Tokens, Service Day Validation, and Atomic Default Runtime Provisioning

- Status: Accepted and implemented
- Date: 2026-10-23

## Context

The code review (Package P09; issues I-009, I-018, I-027, I-052, I-078; findings A-005, 4-005, 3-007, 4-011, 4-012, 1-006, 4-020) found these defects in the application layer:

- `updateServiceDay` saved any count (above 365, negative, fractional, `NaN`) and any name (blank or untrimmed). The Costing estimate then turned invalid with no edit-time message.
- Deleting a Node in the Node editor left pull-out, pull-in, and deadhead activities pointing at the deleted Node, and the review did not report them.
- Only Trip profile deletion took a review token. It was optional, and it ignored Blocking Scenarios, so an empty Blocking Scenario created after the review was deleted silently. `deleteTrips` recomputed its Block impact at commit and removed activities the review had not shown. Route, Scenario, Runtime profile, and Project deletions had no token.
- `renameScenario` accepted a blank name.
- `ensureDefaultRuntimeProfile` checked and then wrote in separate steps. The Trips tab calls it twice at once on its first visit (React `StrictMode` in development, and after a Runtime save), so two calls could store a second Default profile or a duplicate assignment ("Duplicate runtime assignment"). It was found while repairing the browser suite (Package P05 hand-off) and assigned to this package by the user.

## Decision

1. **Service day edits are validated.** `updateServiceDay` accepts only a name and an annual count. A name must not be blank, and is trimmed. A count must be a whole number of 0 or more. The counts of all Service days of the Scenario must not total more than 365 (Phase 5 plan, PL05-07). A refused edit throws `ServiceDayValidationError`, whose `findings` carry the rule, the Service day, and the field (`serviceDay.nameRequired`, `serviceDay.annualServiceDaysInvalid`, `serviceDay.annualServiceDaysExceed365`) so a screen can show each message beside its field. Its message is plain language. A refused edit writes nothing and publishes no save status. A total that is already above 365, saved before this check, may be reduced in steps but not raised, so a planner can always correct it. A patch that matches the stored Service day still writes nothing.
2. **`renameScenario` rejects a blank name** with the message `createScenario` and `duplicateScenario` already use.
3. **Deleting a Node removes the pull-out, pull-in, and deadhead activities that name it.** The Blocks stay and their remaining activities are renumbered. `NodeChangePreview.nonRevenueImpact` reports the affected Block ids and the activity count. The route-edit signature now also covers Blocks that name a Node of the Route, so a Block changed after the review makes the commit refuse.
4. **Every deletion takes a required review token.** The review (`getProjectDeletionImpact`, `getScenarioDeletionImpact`, `getRouteDeletionImpact`, `getRuntimeProfileDeletionImpact`, `previewTripDeletion`, and, as before, `previewTripProfileDeletion`) returns a token, a fingerprint (`src/application/reviewToken.ts`) of every stored record that the deletion would delete or change. The deleting command (`deleteProject`, `deleteScenario`, `deleteRoute`, `deleteRuntimeProfile`, `deleteTrips`, `deleteTripProfile`) takes the token as a required argument, reads the same records again, and refuses with `DeletionReviewStaleError` ("The <thing> deletion review is out of date. Review the impact again.") when the token is missing or differs. Nothing is changed in that case. What each token covers:
   - Project: the Project and everything it holds.
   - Scenario: the Scenario and everything it holds.
   - Route: the Route's own records, its Trips, and every Block that loses a Trip or a Node activity.
   - Runtime profile: the profile, the assignments that name it, and the Trips that record it as their source. The replacement profile is chosen after the review and is not part of the token.
   - Trips: the Trips and every Block that would lose one of their activities.
   - Trip profile: the profile, all profiles of the Scenario (whether it is the last), its Trips, its Blocks, **its Blocking Scenarios**, and its stale Trips.
   The tokens are an optimistic-concurrency check, not a security feature. Under the single-writer model of Decision 0037 they catch a change made by another part of the same tab, or a review left open while the data changed.
5. **Default Runtime provisioning is one transaction.** `ensureDefaultRuntimeProfile` computes what is missing (the Default profile, the segment count of an existing profile, one assignment per standard Service day) from the stored Scenario and, only when something is missing, applies the same computation inside `updateScenarioRecords`, which re-reads the stored records in the write transaction. Two calls at once leave one Default profile and one assignment per standard Service day. A call that finds everything in place writes nothing and publishes no save status. The in-memory repository's `updateScenarioRecords` now reads, changes, and writes without yielding, so overlapping calls run one after the other as Dexie's transaction makes them.
6. **A query lists the Service days that share a Runtime profile.** `listRuntimeProfileServiceDays(profileId)` returns them in the canonical order (02R-AC18). A screen (Package U07, I-041) uses it.

## Consequences

- The deletion commands of the application interface changed signature. `App.tsx` passes the token from the review it already shows; no layout or interaction changed. After a refusal the Runtime profile and Trips delete dialogs stay open with the old review (the confirmation dialogs of the other deletions close). Closing or refreshing them belongs to a UI package.
- Pattern deletion (`deletePattern`) had no token when this decision was made. Package P17 added it (see the addendum).
- The legacy per-field route mutators (`updatePattern`, `addNode`, and similar) were unchanged when this decision was made. Package P17 deleted them (see the addendum).
- `ensureDefaultRuntimeProfile` writes through `saveScenarioRecords`, which validates every Runtime profile of the Scenario, not only the new one. A Scenario that already holds an invalid profile cannot get a new Default profile until it is corrected. Such a profile cannot be created through the application (`saveRuntimeProfile` refuses it).
- The single-flight load in `App.tsx` (the other half of the first-visit race) and the two helper steps in `tests/ui/support/tripsWorkspace.ts` remain for Package U07.

## Addendum (Package P17, 2026-10-23)

1. **`deletePattern` takes a required review token.** `getPatternDeletionImpact(patternId)` returns `reviewToken`, a fingerprint of the Pattern, its Runtime profiles and assignments, its Generation sets, its Trips, and the Blocks that hold a revenue activity of one of those Trips. `deletePattern(patternId, reviewToken)` reads the stored records again, recomputes the fingerprint, and refuses with the same "deletion review is out of date" message when it differs or the token is missing. Review and command share one private plan (`planPatternDeletion`), so the counts shown and the records removed come from the same computation. `App.tsx` passes the token of the review the confirmation dialog shows.
2. **The legacy per-field mutators are deleted.** `addNode`, `updateNode`, `addPattern`, `updatePattern`, `addPatternPoint`, `updatePatternPoint`, `movePatternPoint`, `removePatternPoint`, `createReversePattern`, `duplicatePattern`, `addDirection`, `updateDirection`, `addDirectionColumn`, and `assignPatternDirection` are removed from `RouteDefinitionService` and from `RouteDefinitionApplication`. They saved without the preview and without Pattern validation (the second half of finding 4-020), and the application no longer called them. Test setups that used them now go through `src/testSupport/routeFixtures.ts`, which saves Nodes and Patterns through `previewNodeChanges` and `previewPatternChange` with their commits, so a fixture meets the validation a planner's edit meets. The domain functions the mutators called (`makePatternPoint`, `createDirectionColumn`, `createRouteDirection`, `mapPatternPointsToDirection`) stay; the domain still uses most of them.
3. **A backup with a repeated Block label is refused with the cause and the way out.** The file is not repaired on import (user decision, 2026-10-23). The message names the Blocking Scenario, the label, and the service day, says how many other labels repeat in the file, says that nothing was imported, and says to rename the repeated labels in the project where the file was exported, export again, and import the new file.
