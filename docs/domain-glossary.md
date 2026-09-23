# Domain Glossary

This glossary defines the terms used in architecture, code, tests, and interface copy. Terms from the reference workbook may be mapped to these definitions but do not override them.

## Project organization

### Project

A locally saved planning file containing one or more scenarios. A project also contains project-wide display and unit settings.

### Scenario

An independently editable service-plan alternative within a project. Routes, trips, blocks, and cost assumptions belong to a scenario. Examples include existing service, a proposed service plan, or a future-year alternative.

Cloning a scenario creates an independent copy. Later changes do not flow between the source and clone.

## Route definition

### Route

A named transit service being planned. A route groups nodes, patterns, trips, and related summaries. The initial interface works on one selected route at a time.

### Direction group

One of the two application-managed schedule groups, Outbound or Inbound. Each route has both groups, and each owns the internal timetable columns shared by its patterns. A loop may use either group.

### Direction timetable column

A stable ordered column in a direction-level schedule. A pattern point maps to a column by identifier, allowing repeated visits to the same node to remain distinct.

### Node

A scheduling location used by one or more route patterns. A node may be a timepoint, terminal, garage, or another location required for blocking. The first release primarily uses scheduling timepoints and terminals.

A node is not necessarily every passenger stop on a route.

### Pattern

An ordered path through a selected set of nodes. A pattern defines one trip type, such as full outbound, inbound short turn, or counterclockwise loop.

The code name is `RoutePattern`.

### Pattern point

One occurrence of a node within a pattern. It contains an order and cumulative distance. A pattern point has a stable identifier distinct from the node identifier so a loop can visit the same node more than once.

### Segment

The directed connection between two adjacent pattern points. Segment distance is the difference between their cumulative mile values. Segment runtime is defined in a runtime band.

### Label

Optional user-entered text on a pattern, such as southbound, clockwise, or To Englewood. It is descriptive and does not determine its direction group or pattern structure.

### Reverse pattern

A new pattern created by reversing another pattern's ordered points and segment distances. It is independently editable. Runtime profiles are not created automatically in Phase 1.

## Service and time

### Service day

A category of scheduled service rather than a calendar date. Initial categories are weekday, Saturday, Sunday, and holiday.

The code name is `ServiceDayDefinition`.

### Annual service days

The number of times a service-day schedule operates during an analysis year. It is an editable input used to annualize daily quantities.

### Service time

An integer count of seconds from service-day midnight. It can exceed 86,400 seconds so the interface can display times such as 25:00.

### Duration

An integer number of seconds between two events. A duration is not a time of day.

### Operating span

The interval between the first and last scheduled service events for a route, pattern, or service day. Initial operating spans are derived from generated trips.

### Headway

The scheduled time between consecutive trip departures at a common reference point. Frequency may be displayed as trips per hour but headway is the authoritative generation input.

## Runtimes and trips

### Runtime profile

A named set of runtime bands for one pattern. A runtime profile contains a segment runtime for each segment in the pattern.

### Runtime band

A continuous departure-time interval with one set of segment runtimes. The start is inclusive and the end is exclusive. Disjoint time periods require separate bands.

### Runtime assignment

The association selecting a runtime profile for one pattern and service day.

### Calculation revision

The integer version of a runtime profile's band bounds and segment values. It increments when those calculation inputs change and remains unchanged when only the profile name changes. Trips record the revision used for their current times.

### Trip generation set (historical)

The former saved instruction used to generate a sequence of trips. Phase 2R replaces it with a transient Generate Trips request containing Pattern, First Trip, Headway, and Last Trip; the request is not authoritative saved data.

### Trip

One scheduled revenue movement using one route pattern on one service day. A trip contains an ordered scheduled time for each included pattern point.

### Trip profile

One named timetable alternative within a Scenario. A Trip profile spans Routes and service days and owns its Trips. It does not own Runtime profiles; each Trip separately records the Runtime profile and calculation revision used for its current times. Phase 2TP implements this as a scenario-wide timetable branch.

### Scheduled point

The scheduled service time at one pattern point for one trip. Phase 1 and the initial trip implementation use one time rather than separate arrival and departure values.

### Manual trip

A trip created with Add Trip or another direct schedule command rather than a Generate Trips request.

### Generated trip

A trip produced by a Generate Trips request. Trips are authoritative saved schedule records and retain the runtime profile and calculation revision used for their current times.

### Add Trip

The direct command that creates one trip from a selected direction, pattern, service day, and first-trip time using the pattern's assigned runtime profile.

### Trip creation method

The authoritative record of whether a trip was created by Generate Trips or Add Trip. It is separate from later manual shifts or pattern changes.

### Stale runtime source

A trip whose recorded runtime profile or calculation revision no longer matches the profile currently assigned to its pattern and service day. This is a review condition, not an automatic schedule mutation.

### Manual shift

A user-entered time adjustment applied to a trip after generation. Explicit recalculation may overwrite the shift after the user reviews its impact.

### Recalculation

Explicitly replacing selected trip times using the current runtime profile. Existing trips do not change automatically when runtime inputs are edited.

## Blocking

### Block

The ordered work performed by one vehicle on one service day within one Blocking Scenario. A Block derives its source Trip Profile through that Blocking Scenario. The data model can contain Trips from more than one Route, although the initial Phase 4 assignment interface intentionally works from one selected Route.

### Blocking scenario

One named arrangement of an immutable source Trip Profile into Blocks across all service days. Several Blocking Scenarios may use the same Trip Profile. A Blocking Scenario cannot combine Trips from competing Trip Profiles. A Scenario may contain no Blocking Scenarios. Users may create an empty arrangement or duplicate an existing one.

### Block label

A user-facing identifier such as `11`, `21`, or `A03`. It is not the database identifier.

### Block activity

An ordered item in a block. Initial activity types are pull-out, revenue trip, manual deadhead, and pull-in.

### Pull-out

A non-revenue movement or time allowance before the first revenue Trip in a Block. New and edited activities store a whole-minute offset before that Trip, so their resolved time changes with it. Legacy imported activities may retain explicit start and end times. A Block contains at most one pull-out and it is first.

### Pull-in

A non-revenue movement or time allowance after the last revenue Trip in a Block. New and edited activities store a whole-minute offset after that Trip, so their resolved time changes with it. Legacy imported activities may retain explicit start and end times. A Block contains at most one pull-in and it is last.

### Deadhead

A non-revenue movement between consecutive revenue Trips. New and edited deadheads store a whole-minute duration beginning when the preceding Trip ends; any remaining connection time before the successor Trip is derived layover. Nodes and optional miles are entered manually. Legacy imported activities may retain explicit times.

### Deadhead hours

The sum of pull-out, pull-in, and between-Trip deadhead durations. Layover is reported separately.

### Layover

Unallocated time remaining between connected block activities after any required deadhead. Layover is derived and is not stored as authoritative data.

### Revenue hours

Running time plus usable layover time between revenue Trips. Pull-out, pull-in, and deadhead time are excluded.

### Running time

The sum of scheduled revenue-Trip durations, excluding layover and non-revenue movements.

### Platform hours

The elapsed time from resolved Block pull-out start to resolved Block pull-in end. A Block without both valid boundary activities and adjacent revenue Trips cannot contribute complete platform hours.

### Platform miles

The sum of complete revenue miles plus pull-out, deadhead, and pull-in miles. Platform miles are incomplete when any required distance is missing.

### Revenue miles

The sum of route-pattern miles operated by revenue trips with complete distance data.

### Peak vehicles

The largest number of vehicles simultaneously required by valid blocks or service. It is deferred until blocking behavior is established.

### Spare vehicles

Additional vehicles added through a spare ratio or explicit input. This is deferred from the initial blocking implementation.

## Costing and validation

### Costing assumptions

The single Scenario-owned set of entered USD/Revenue-Hour rate, source year, service year, and annual escalation inputs. It applies to whichever Blocking Scenario is selected. The Phase 5 implementation plan specifies its persistence lifecycle.

### Cost estimate

A derived calculation for eligible Blocks using Revenue Hours, one entered USD/Revenue-Hour rate, and annual escalation. Platform Hours remain visible but are not a second cost estimate.

### Cost basis

The service quantity multiplied by a rate. Revenue Hours are the only initial cost basis. A platform-sensitive supplement is deferred and must not double count the Revenue-Hour estimate.

### NTD assumption

A manually entered rate or value sourced from National Transit Database information. The app stores source metadata but does not retrieve NTD data in the initial release.

### Validation finding

A structured error or warning produced by a domain rule. It identifies the rule and affected entity.

### Error

A validation finding that prevents an operation or indicates unusable data.

### Warning

A validation finding that allows the user to proceed after reviewing the consequence.

### Acknowledgment

A record that a user reviewed a warning. It does not remove or alter the underlying validation condition.
