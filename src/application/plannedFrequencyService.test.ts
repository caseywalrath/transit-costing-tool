import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { ScenarioRecords } from '../domain/project';
import type { RoutePattern, Trip } from '../domain/types';
import { ProjectBackupService } from '../persistence/backupRepository';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { addTwoStopPattern } from '../testSupport/routeFixtures';
import { PlannedFrequencyPreviewStaleError, PlannedFrequencyService, PlannedFrequencyValidationError } from './plannedFrequencyService';
import { RouteDefinitionService } from './routeDefinitionService';
import { SaveStatusPublisher } from './saveStatus';

const at = '2026-11-05T09:00:00.000Z';
const hours = (h: number, m = 0) => h * 3600 + m * 60;

async function setup() {
  const repository = new InMemoryRouteDefinitionRepository();
  const publisher = new SaveStatusPublisher(() => at);
  const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
  const route = new RouteDefinitionService(repository, backup, () => at, publisher);
  const plans = new PlannedFrequencyService(repository, () => at, publisher);
  const created = await route.createProject('Plans');
  const withRoute = await route.addRoute(created.records);
  const aggregate = (await repository.getRouteDefinition(withRoute.route.id))!;
  const built = await addTwoStopPattern(route, aggregate, { names: ['Alpha', 'Beta'] });
  const records = (await repository.getScenarioRecords(created.records.scenario.id))!;
  const weekday = records.serviceDays.find((day) => day.kind === 'weekday')!;
  const saturday = records.serviceDays.find((day) => day.kind === 'saturday')!;
  const sunday = records.serviceDays.find((day) => day.kind === 'sunday')!;
  const direction = records.directions!.find((item) => item.id === built.pattern.directionId)!;
  return { repository, publisher, route, plans, records, routeId: withRoute.route.id, pattern: built.pattern, aggregate: built.aggregate, weekday, saturday, sunday, direction };
}

const draftPeriods = [{ startTime: hours(6), endTime: hours(8), headwaySeconds: 1800 }, { startTime: hours(8), endTime: hours(19), headwaySeconds: 900 }];

describe('PlannedFrequencyService', () => {
  it('saves a plan, reads it back, assigns period ids and keeps the plan id across edits', async () => {
    const s = await setup();
    const saved = (await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: {} }))!;
    expect(saved.periods).toHaveLength(2);
    expect(saved.periods.every((period) => !!period.id)).toBe(true);
    expect(await s.plans.getPlan(s.routeId, s.weekday.id)).toEqual(saved);
    const edited = (await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: [{ ...saved.periods[0], headwaySeconds: 1200 }], measureNodeIdByDirectionId: {} }))!;
    expect(edited.id).toBe(saved.id);
    expect(edited.createdAt).toBe(saved.createdAt);
    expect(edited.periods).toHaveLength(1);
    expect(edited.periods[0].id).toBe(saved.periods[0].id);
    expect((await s.repository.listPlannedFrequencies(s.records.scenario.id))).toHaveLength(1);
  });

  it('sorts periods by start time when saving', async () => {
    const s = await setup();
    const saved = (await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: [...draftPeriods].reverse(), measureNodeIdByDirectionId: {} }))!;
    expect(saved.periods.map((period) => period.startTime)).toEqual([hours(6), hours(8)]);
  });

  it('refuses invalid plans with findings and writes nothing', async () => {
    const s = await setup();
    const bad = s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: [{ startTime: hours(6), endTime: hours(8), headwaySeconds: 30 }, { startTime: hours(7), endTime: hours(9), headwaySeconds: 900 }], measureNodeIdByDirectionId: {} });
    await expect(bad).rejects.toBeInstanceOf(PlannedFrequencyValidationError);
    await bad.catch((error: PlannedFrequencyValidationError) => expect(error.findings.map((finding) => finding.ruleId).sort()).toEqual(['plannedFrequency.headwayTooShort', 'plannedFrequency.periodsOverlap']));
    expect(await s.plans.getPlan(s.routeId, s.weekday.id)).toBeUndefined();
  });

  it('refuses a measure node the direction does not serve, but keeps an unchanged stored one', async () => {
    const s = await setup();
    const beta = s.aggregate.nodes.find((node) => node.name === 'Beta')!;
    await expect(s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: { [s.direction.id]: 'no-such-node' } })).rejects.toBeInstanceOf(PlannedFrequencyValidationError);
    const saved = (await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: { [s.direction.id]: beta.id } }))!;
    expect(saved.measureNodeIdByDirectionId[s.direction.id]).toBe(beta.id);
    // The Pattern no longer serves Beta, but the stored value stays through a period edit.
    await s.repository.updateScenarioRecords(s.records.scenario.id, (current) => ({ ...current, patterns: current.patterns.map((pattern) => ({ ...pattern, points: pattern.points.filter((point) => point.nodeId !== beta.id) })) }));
    const edited = (await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: [draftPeriods[0]], measureNodeIdByDirectionId: { [s.direction.id]: beta.id } }))!;
    expect(edited.measureNodeIdByDirectionId[s.direction.id]).toBe(beta.id);
  });

  it('clears a plan, and does nothing when there is none; an empty period list clears too', async () => {
    const s = await setup();
    await s.plans.clearPlan(s.routeId, s.weekday.id);
    await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: {} });
    await s.plans.clearPlan(s.routeId, s.weekday.id);
    expect(await s.plans.getPlan(s.routeId, s.weekday.id)).toBeUndefined();
    await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: {} });
    expect(await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: [], measureNodeIdByDirectionId: {} })).toBeUndefined();
    expect(await s.repository.listPlannedFrequencies(s.records.scenario.id)).toEqual([]);
  });

  it('refuses a missing Route or Service day', async () => {
    const s = await setup();
    await expect(s.plans.savePlan({ routeId: 'missing', serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: {} })).rejects.toThrow('Route');
    await expect(s.plans.savePlan({ routeId: s.routeId, serviceDayId: 'missing', periods: draftPeriods, measureNodeIdByDirectionId: {} })).rejects.toThrow('Service day');
  });

  it('shows each write in the save status', async () => {
    const s = await setup();
    const states: string[] = [];
    s.publisher.subscribeToSaveStatus((status) => states.push(status.state));
    await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: {} });
    expect(states).toEqual(['saved', 'saving', 'saved']);
  });

  describe('copy from another Service day', () => {
    it('previews the periods and what is replaced, then applies with new period ids', async () => {
      const s = await setup();
      const source = (await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: {} }))!;
      const target = (await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.saturday.id, periods: [{ startTime: hours(9), endTime: hours(10), headwaySeconds: 1800 }], measureNodeIdByDirectionId: {} }))!;
      const preview = await s.plans.previewCopyFromDay(s.routeId, s.weekday.id, s.saturday.id);
      expect(preview.periods.map((period) => period.startTime)).toEqual([hours(6), hours(8)]);
      expect(preview.replaces?.id).toBe(target.id);
      const applied = await s.plans.applyCopyFromDay(preview);
      expect(applied.id).toBe(target.id);
      expect(applied.periods.map((period) => [period.startTime, period.endTime, period.headwaySeconds])).toEqual(source.periods.map((period) => [period.startTime, period.endTime, period.headwaySeconds]));
      expect(applied.periods.map((period) => period.id)).not.toEqual(source.periods.map((period) => period.id));
      expect(await s.plans.getPlan(s.routeId, s.saturday.id)).toEqual(applied);
      expect(await s.plans.getPlan(s.routeId, s.weekday.id)).toEqual(source);
    });

    it('creates the plan when the target day has none, and reports nothing replaced', async () => {
      const s = await setup();
      await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: {} });
      const preview = await s.plans.previewCopyFromDay(s.routeId, s.weekday.id, s.sunday.id);
      expect(preview.replaces).toBeUndefined();
      expect((await s.plans.applyCopyFromDay(preview)).serviceDayId).toBe(s.sunday.id);
    });

    it('refuses a stale preview and writes nothing', async () => {
      const s = await setup();
      await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: {} });
      await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.saturday.id, periods: [{ startTime: hours(9), endTime: hours(10), headwaySeconds: 1800 }], measureNodeIdByDirectionId: {} });
      const preview = await s.plans.previewCopyFromDay(s.routeId, s.weekday.id, s.saturday.id);
      await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: [{ startTime: hours(5), endTime: hours(6), headwaySeconds: 600 }], measureNodeIdByDirectionId: {} });
      await expect(s.plans.applyCopyFromDay(preview)).rejects.toBeInstanceOf(PlannedFrequencyPreviewStaleError);
      expect((await s.plans.getPlan(s.routeId, s.saturday.id))!.periods).toHaveLength(1);
    });

    it('refuses the same day and a source without a plan', async () => {
      const s = await setup();
      await expect(s.plans.previewCopyFromDay(s.routeId, s.weekday.id, s.weekday.id)).rejects.toThrow('different Service day');
      await expect(s.plans.previewCopyFromDay(s.routeId, s.weekday.id, s.saturday.id)).rejects.toThrow('no planned frequencies');
    });
  });

  describe('copy from another Scenario', () => {
    async function twoScenarios() {
      const s = await setup();
      const alpha = s.aggregate.nodes.find((node) => node.name === 'Alpha')!;
      const beta = s.aggregate.nodes.find((node) => node.name === 'Beta')!;
      await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: draftPeriods, measureNodeIdByDirectionId: { [s.direction.id]: beta.id } });
      await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.saturday.id, periods: [{ startTime: hours(8), endTime: hours(20), headwaySeconds: 1800 }], measureNodeIdByDirectionId: {} });
      const stored = (await s.repository.getScenarioRecords(s.records.scenario.id))!;
      // The source is a copy of the Scenario, so its Route, Nodes and Service days have new ids. The target is the original.
      const sourceCopy = await s.route.duplicateScenario(stored, 'Source');
      return { ...s, alpha, beta, sourceCopy, sourceRouteId: sourceCopy.routes[0].id };
    }

    it('lists other Scenarios of the Project with their Routes and plan counts', async () => {
      const s = await twoScenarios();
      const sources = await s.plans.listScenarioRouteSources(s.records.scenario.id);
      expect(sources).toHaveLength(1);
      expect(sources[0].scenarioName).toBe('Source');
      expect(sources[0].routes[0]).toMatchObject({ id: s.sourceRouteId, plannedDayCount: 2 });
      expect((await s.plans.listScenarioRouteSources(s.sourceCopy.scenario.id)).map((item) => item.scenarioId)).toEqual([s.records.scenario.id]);
    });

    it('matches days by kind even when the names differ, and nodes by name', async () => {
      const s = await twoScenarios();
      // Rename the source's weekday so only the kind can match it.
      await s.route.updateServiceDay(s.sourceCopy, s.sourceCopy.serviceDays.find((day) => day.kind === 'weekday')!.id, { name: 'Mon-Fri' });
      const preview = await s.plans.previewCopyFromScenario({ sourceScenarioId: s.sourceCopy.scenario.id, sourceRouteId: s.sourceRouteId, targetRouteId: s.routeId });
      expect(preview.days.map((day) => [day.targetServiceDayId, day.matchedBy, day.replaces])).toEqual(expect.arrayContaining([[s.weekday.id, 'kind', true], [s.saturday.id, 'kind', true]]));
      expect(preview.unmatchedDays).toEqual([]);
      expect(preview.unmatchedNodes).toEqual([]);
      const weekdayDay = preview.days.find((day) => day.targetServiceDayId === s.weekday.id)!;
      expect(weekdayDay.measureNodeIdByDirectionId).toEqual({ [s.direction.id]: s.beta.id });
    });

    it('applies all matched days in one write, replacing existing plans, and refuses a stale preview', async () => {
      const s = await twoScenarios();
      await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: [{ startTime: hours(5), endTime: hours(6), headwaySeconds: 600 }], measureNodeIdByDirectionId: {} });
      await s.plans.clearPlan(s.routeId, s.saturday.id);
      const preview = await s.plans.previewCopyFromScenario({ sourceScenarioId: s.sourceCopy.scenario.id, sourceRouteId: s.sourceRouteId, targetRouteId: s.routeId });
      expect(preview.days.find((day) => day.targetServiceDayId === s.weekday.id)!.replaces).toBe(true);
      expect(preview.days.find((day) => day.targetServiceDayId === s.saturday.id)!.replaces).toBe(false);
      const applied = await s.plans.applyCopyFromScenario(preview);
      expect(applied).toHaveLength(2);
      expect((await s.plans.getPlan(s.routeId, s.weekday.id))!.periods.map((period) => period.startTime)).toEqual([hours(6), hours(8)]);
      expect((await s.plans.getPlan(s.routeId, s.saturday.id))!.periods).toHaveLength(1);
      // The same preview no longer matches: the target plans changed.
      await expect(s.plans.applyCopyFromScenario(preview)).rejects.toBeInstanceOf(PlannedFrequencyPreviewStaleError);
    });

    it('refuses a preview when the source plan changed after the preview', async () => {
      const s = await twoScenarios();
      const preview = await s.plans.previewCopyFromScenario({ sourceScenarioId: s.sourceCopy.scenario.id, sourceRouteId: s.sourceRouteId, targetRouteId: s.routeId });
      await s.repository.updateScenarioRecords(s.sourceCopy.scenario.id, (current) => ({ ...current, plannedFrequencies: current.plannedFrequencies!.map((plan) => ({ ...plan, periods: plan.periods.map((period) => ({ ...period, headwaySeconds: 3600 })) })) }));
      await expect(s.plans.applyCopyFromScenario(preview)).rejects.toBeInstanceOf(PlannedFrequencyPreviewStaleError);
    });

    it('lists unmatched days and nodes that fall back, and keeps the target plans of unmatched days', async () => {
      const s = await twoScenarios();
      const target = (await s.repository.getScenarioRecords(s.records.scenario.id))!;
      // Source node names differ from the target's, and the source has a custom day that the target lacks.
      await s.repository.updateScenarioRecords(s.sourceCopy.scenario.id, (current) => ({
        ...current,
        nodes: current.nodes.map((node) => ({ ...node, name: `${node.name} (renamed)` })),
        serviceDays: [...current.serviceDays, { id: 'custom-day', scenarioId: current.scenario.id, kind: 'custom' as const, name: 'Festival', annualServiceDays: 1, sequence: 9, ...metadata(at) }],
        plannedFrequencies: [...current.plannedFrequencies!, { id: 'custom-plan', scenarioId: current.scenario.id, routeId: current.routes[0].id, serviceDayId: 'custom-day', periods: [{ id: 'cp', startTime: hours(10), endTime: hours(12), headwaySeconds: 1200 }], measureNodeIdByDirectionId: {}, ...metadata(at) }],
      }));
      await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.sunday.id, periods: [{ startTime: hours(9), endTime: hours(10), headwaySeconds: 1800 }], measureNodeIdByDirectionId: {} });
      const preview = await s.plans.previewCopyFromScenario({ sourceScenarioId: s.sourceCopy.scenario.id, sourceRouteId: s.sourceRouteId, targetRouteId: s.routeId });
      expect(preview.unmatchedDays.map((day) => day.name)).toEqual(['Festival']);
      expect(preview.unmatchedNodes).toHaveLength(1);
      expect(preview.unmatchedNodes[0]).toMatchObject({ nodeName: 'Beta (renamed)', targetDirectionId: s.direction.id });
      await s.plans.applyCopyFromScenario(preview);
      expect((await s.plans.getPlan(s.routeId, s.weekday.id))!.measureNodeIdByDirectionId).toEqual({});
      expect(await s.plans.getPlan(s.routeId, s.sunday.id)).toBeDefined();
      expect(target.serviceDays.some((day) => day.kind === 'custom')).toBe(false);
    });

    it('falls back to the short name when the names differ', async () => {
      const s = await twoScenarios();
      await s.repository.updateScenarioRecords(s.records.scenario.id, (current) => ({ ...current, nodes: current.nodes.map((node) => (node.id === s.beta.id ? { ...node, shortName: ' BTA ' } : node)) }));
      await s.repository.updateScenarioRecords(s.sourceCopy.scenario.id, (current) => ({ ...current, nodes: current.nodes.map((node) => ({ ...node, name: `${node.name}-x`, shortName: node.name === 'Beta' ? 'bta' : node.shortName })) }));
      const preview = await s.plans.previewCopyFromScenario({ sourceScenarioId: s.sourceCopy.scenario.id, sourceRouteId: s.sourceRouteId, targetRouteId: s.routeId });
      expect(preview.unmatchedNodes).toEqual([]);
      expect(preview.days.find((day) => day.targetServiceDayId === s.weekday.id)!.measureNodeIdByDirectionId).toEqual({ [s.direction.id]: s.beta.id });
    });

    it('refuses the same Scenario and a missing source', async () => {
      const s = await twoScenarios();
      await expect(s.plans.previewCopyFromScenario({ sourceScenarioId: s.records.scenario.id, sourceRouteId: s.routeId, targetRouteId: s.routeId })).rejects.toThrow('different Scenario');
      await expect(s.plans.previewCopyFromScenario({ sourceScenarioId: 'missing', sourceRouteId: s.routeId, targetRouteId: s.routeId })).rejects.toThrow('no longer exists');
    });
  });

  describe('comparePlan', () => {
    function trip(s: Awaited<ReturnType<typeof setup>>, id: string, tripProfileId: string, time: number, serviceDayId = s.weekday.id): Trip {
      const pattern: RoutePattern = s.pattern;
      return { id, scenarioId: s.records.scenario.id, routeId: s.routeId, serviceDayId, patternId: pattern.id, tripProfileId, stopTimes: pattern.points.map((point, index) => ({ patternPointId: point.id, sequence: index, time: time + index * 600 })), provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...metadata(at) };
    }

    it('returns no directions when the day has no plan', async () => {
      const s = await setup();
      const profileId = s.records.tripProfiles![0].id;
      expect(await s.plans.comparePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, tripProfileId: profileId })).toEqual({ directions: [] });
    });

    it('compares only the chosen Trip Profile and Service day, and writes nothing', async () => {
      const s = await setup();
      const profileId = s.records.tripProfiles![0].id;
      await s.plans.savePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, periods: [{ startTime: hours(6), endTime: hours(7), headwaySeconds: 1800 }], measureNodeIdByDirectionId: {} });
      const trips = [trip(s, 't1', profileId, hours(6)), trip(s, 't2', profileId, hours(6, 30)), trip(s, 'other-profile', 'other', hours(6, 10)), trip(s, 'other-day', profileId, hours(6, 10), s.saturday.id)];
      await s.repository.updateScenarioRecords(s.records.scenario.id, (current) => ({ ...current, trips }));
      const before = (await s.repository.getScenarioRecords(s.records.scenario.id))!;
      const result = await s.plans.comparePlan({ routeId: s.routeId, serviceDayId: s.weekday.id, tripProfileId: profileId });
      expect(result.directions).toHaveLength((s.records.directions ?? []).filter((direction) => direction.routeId === s.routeId).length);
      const compared = result.directions.find((item) => item.directionId === s.direction.id)!;
      expect(compared.comparison.periods).toHaveLength(1);
      expect(compared.comparison.periods[0]).toMatchObject({ status: 'matches', builtTrips: 2, plannedTrips: 2 });
      expect(await s.repository.getScenarioRecords(s.records.scenario.id)).toEqual(before as ScenarioRecords);
    });
  });
});
