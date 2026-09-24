import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { ProjectSnapshot } from '../domain/types';
import { ProjectBackupService } from './backupRepository';
import { InMemoryRouteDefinitionRepository } from './inMemoryRepository';
import { exportProjectJson } from './backup';

const snapshot: ProjectSnapshot = {
  project: { id: 'project', name: 'Demo', distanceUnit: 'miles', currencyCode: 'USD', ...metadata('2026-01-01T00:00:00.000Z') },
  scenarios: [{ id: 'scenario', projectId: 'project', name: 'Base', ...metadata('2026-01-01T00:00:00.000Z') }],
  serviceDays: [],
  routes: [],
  nodes: [],
  patterns: [],
  runtimeProfiles: [],
  runtimeAssignments: [],
  tripProfiles: [{ id: 'trip-profile', scenarioId: 'scenario', name: 'Default', ...metadata('2026-01-01T00:00:00.000Z') }],
  costingAssumptions: [{ id: 'costing', scenarioId: 'scenario', currencyCode: 'USD', enteredRate: 125.5, rateYear: 2024, sourceType: 'ntd', sourceNote: 'NTD source', baseServiceYear: 2026, futureYearCount: 2, annualEscalation: 0.03, ...metadata('2026-01-01T00:00:00.000Z') }],
  generationSets: [],
  trips: [],
  blocks: [],
};

describe('project backup service', () => {
  it('supports explicit replace and copy collision modes', async () => {
    let stored: ProjectSnapshot | undefined = snapshot;
    const service = new ProjectBackupService(async () => stored, async (value) => { stored = value; });
    const payload = await service.exportProject(snapshot.project.id);
    await expect(service.importProject(payload)).rejects.toThrow(/choose replace or copy/);
    const replaced = await service.importProject(payload, 'replace');
    expect(replaced.id).toBe(snapshot.project.id);
    const copied = await service.importProject(payload, 'copy');
    expect(copied.id).not.toBe(snapshot.project.id);
    expect(stored?.scenarios[0].projectId).toBe(copied.id);
    expect(stored?.costingAssumptions?.[0].id).not.toBe(snapshot.costingAssumptions?.[0].id);
    expect(stored?.costingAssumptions?.[0].scenarioId).toBe(stored?.scenarios[0].id);
  });

  it('round trips a saved graph through the repository', async () => {
    const sourceRepository = new InMemoryRouteDefinitionRepository();
    await sourceRepository.saveProjectSnapshot(snapshot);
    const sourceService = new ProjectBackupService(sourceRepository.getProjectSnapshot.bind(sourceRepository), sourceRepository.saveProjectSnapshot.bind(sourceRepository));
    const payload = await sourceService.exportProject(snapshot.project.id);
    const destinationRepository = new InMemoryRouteDefinitionRepository();
    const destinationService = new ProjectBackupService(destinationRepository.getProjectSnapshot.bind(destinationRepository), destinationRepository.saveProjectSnapshot.bind(destinationRepository));
    const imported = await destinationService.importProject(payload, 'replace');
    expect(await destinationRepository.getProjectSnapshot(imported.id)).toEqual(snapshot);
  });

  it('rejects invalid runtime references before any repository write', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    await repository.saveProjectSnapshot(snapshot);
    const service = new ProjectBackupService(repository.getProjectSnapshot.bind(repository), repository.saveProjectSnapshot.bind(repository));
    const invalid = JSON.parse(exportProjectJson(snapshot)) as Record<string, unknown>;
    invalid.runtimeAssignments = [{ id: 'assignment', scenarioId: 'scenario', patternId: 'missing-pattern', serviceDayId: 'missing-day', runtimeProfileId: 'missing-profile', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
    await expect(service.importProject(JSON.stringify(invalid), 'replace')).rejects.toThrow(/missing record/);
    expect(await repository.getProjectSnapshot(snapshot.project.id)).toEqual(snapshot);
  });

  it('rejects invalid costing assumptions before replacing a saved project', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    await repository.saveProjectSnapshot(snapshot);
    const service = new ProjectBackupService(repository.getProjectSnapshot.bind(repository), repository.saveProjectSnapshot.bind(repository));
    const invalid = JSON.parse(exportProjectJson(snapshot)) as { costingAssumptions: Array<Record<string, unknown>>; [key: string]: unknown };
    invalid.costingAssumptions[0].currencyCode = 'CAD';
    await expect(service.importProject(JSON.stringify(invalid), 'replace')).rejects.toThrow(/currencyCode must be USD/);
    expect(await repository.getProjectSnapshot(snapshot.project.id)).toEqual(snapshot);
  });
});
