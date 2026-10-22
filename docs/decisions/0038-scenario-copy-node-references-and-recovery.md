# Decision 0038: Scenario Duplication Remaps Node References, and Earlier Copies Are Recovered

- Status: Accepted and implemented
- Date: 2026-10-22

## Context

The code review (issues I-004 and I-005; findings 3-002, 3-006, and A-004) found two defects in `duplicateScenario`.

1. It did not apply its Node map to the `fromNodeId` and `toNodeId` of pull-out, deadhead, and pull-in activities. In a duplicated Scenario all 138 such references in the Federal BRT project pointed at the source Scenario's Nodes. The Blocking tables showed those Nodes as blank, the activity edit dialog showed "Select Node" while still holding the source ID, bulk deadhead apply matched nothing, and a copied Block with a deadhead failed the Node-continuity check and dropped out of Costing. After the source Scenario was deleted, the references named Nodes that no longer existed.
2. It stamped every copied Block with the first Trip Profile of the copy. With Blocking Scenarios on two Trip Profiles, saving the copy failed with "Block ... cannot reference a Trip from another Trip profile". With one profile it added a Trip Profile to every normalized Block, against Decision 0019 item 9.

User decision 4 asked for automatic repair of Scenarios that were already duplicated. User decision C8 settled what to do when the source of such a copy no longer exists.

## Decision

1. `duplicateScenario` applies the Node map to the `fromNodeId` and `toNodeId` of every non-revenue activity, as backup import-as-copy already does.
2. A copied Block that has a Blocking Scenario stores no `tripProfileId`; its Trip Profile follows from the copied Blocking Scenario. A legacy Block without a Blocking Scenario keeps its Trip Profile, remapped to the copy's Trip Profile (the copy's first Trip Profile when the Block had none).
3. `recoverScenarioCopyNodeReferences` (domain, pure) repairs Scenarios copied by the older code. It touches only the Blocks of a Scenario that records a `sourceScenarioId`, and within them only `fromNodeId` and `toNodeId` of non-revenue activities. Metadata, labels, revenue activities, timing, and miles are not changed, and `updatedAt` is not bumped.
4. A reference to a Node of another Scenario is mapped to the copy's Node, taking "the same Route, the same position in the Route's Node order, and the same name" (decision 4) as follows. The Route is the one with the same name in both Scenarios. A Node whose name is unique in the Route in both Scenarios maps by name. A repeated name maps by position, and only when the two Routes list the same names in the same order; otherwise the reference is left alone. The Route's Node order is the order in which the Route's Patterns first visit its Nodes (Patterns ordered by sequence, then name), followed by the Nodes no Pattern visits, by name; a Node whose name is shared with another Node outside every Pattern has no position. Matching by name first means that renaming or reordering a Pattern after duplication does not stop the repair, and the position rule keeps look-alike Nodes apart. A reference that does not map stays as it was and produces a finding. The rule does not depend on which Scenario owns the Node, so a copy of a copy is repaired too. One case cannot be detected: two Nodes with the same name whose places were swapped by a reordering that leaves the list of names unchanged, such as a Pattern reversed over a name list that reads the same both ways. Those references may move to the look-alike Node.
5. Decision C8: when a Scenario in the copy's `sourceScenarioId` chain no longer exists (the copy's own source, or the source of that source) and the activity names a Node that exists nowhere, the Node is inferred from the adjacent revenue Trips: pull-out To is the first Trip's first Node, pull-in From is the last Trip's last Node, deadhead From is the preceding Trip's last Node, and deadhead To is the following Trip's first Node. Pull-out From and pull-in To are optional garage ends that no Trip determines; when they name a missing Node they are cleared, because the Node record no longer exists and the field is optional, and a finding names the Block. A required end with no adjacent Trip is left as it is and also produces a finding. When the chain is intact, a Node that exists nowhere is not inferred; it is left as it is and produces a finding. A Scenario with no `sourceScenarioId` is never touched.
6. Findings use the `ValidationFinding` shape with rule `scenarioCopy.nodeUnresolved`, severity warning, category operational, entity type `block`, the field `<activity type>.<end>`, and the Block label in the parameters. They are returned by the recovery; they are not stored.
7. The recovery runs in two places, each once per data set: the Dexie version 7 upgrade (all Scenarios in the database; no store changes) and `parseProjectBackupWithReport`, before the Block checks, so a backup exported after a leaky duplication loads clean. The report carries the number of repaired references and the findings. The upgrade runs in whichever tab opens the database first, including a read-only tab, because the write guard of Decision 0037 lets writes through in `versionchange` mode.

## Consequences

- A duplicated Scenario evaluates its Blocks as its source does, and its Blocking tables and edit dialogs show the Nodes. Costing includes the copied Blocks that have deadheads.
- Duplication succeeds when Blocking Scenarios use different Trip Profiles.
- Existing copies are repaired without user action when the app first opens at database version 7, and a backup of such a copy imports repaired.
- Recovery never removes information that still exists. It clears only an optional garage end whose Node record is gone.
- A copy whose Routes or Nodes were renamed or removed after duplication may leave references unrepaired. Those references stay as they were and are reported as findings; the planner re-selects the Node.
- A Scenario that was imported as a copy by an earlier version, from a file whose source Scenario was missing, lost its `sourceScenarioId` and is not recognized as a copy. Its references stay as they are.
- A recovery that throws is logged and skipped by the version 7 upgrade, so the database still opens.
- The findings from the database upgrade are not shown anywhere yet, because the upgrade has no interface. The same findings can be recomputed from the stored data by running the recovery again. Presenting them, and a Blocking rule that flags an activity Node outside its Scenario, belong to the data-safety packages (U02) and the Blocking rule packages (P12, P14).
- Backup import validation of Node ownership is Package P04. Because recovery runs first, a file with leaked references from a deleted source loads. A reference in a Scenario copy that cannot be repaired is reported and the file still imports (Decision 0039); a wrong reference in a Scenario that is not a copy rejects the file.
