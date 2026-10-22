// Golden loader: Federal BRT backup -> app parser -> in-memory restore -> Block summaries -> costing.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { importProjectJson } from '../../../src/persistence/backup';
import { ProjectBackupService } from '../../../src/persistence/backupRepository';
import { InMemoryRouteDefinitionRepository } from '../../../src/persistence/inMemoryRepository';
import { InMemoryBlockingRepository } from '../../../src/persistence/blockingRepository';
import { BlockingApplicationService } from '../../../src/application/blockingService';
import { CostingApplicationService } from '../../../src/application/costingService';
import { evaluateBlockEligibility } from '../../../src/domain/costing';
import { summarizeBlock } from '../../../src/domain/blocking';

const BACKUP = process.env.GOLDEN_BACKUP ?? fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url));
const OUT = process.env.GOLDEN_OUT ?? join(tmpdir(), 'golden-figures.json');
const BASE_YEAR = 2025;
const RATE = 100;

describe('Federal BRT golden dataset', () => {
  it('loads, restores, summarizes and costs', async () => {
    const payload = readFileSync(BACKUP, 'utf8');
    const parsed = importProjectJson(payload); // app parser/validator
    const repo = new InMemoryRouteDefinitionRepository();
    const backup = new ProjectBackupService((id) => repo.getProjectSnapshot(id), (s) => repo.saveProjectSnapshot(s));
    const project = await backup.importProject(payload, 'reject'); // app restore path
    const snap = (await repo.getProjectSnapshot(project.id))!;
    expect(snap.trips.length).toBe(parsed.trips.length);

    const out: any = { counts: {}, days: {}, perBlock: [], costing: {} };
    out.counts = { projects: (await repo.listProjects()).length, scenarios: snap.scenarios.length, serviceDays: snap.serviceDays.length, routes: snap.routes.length, nodes: snap.nodes.length, patterns: snap.patterns.length, runtimeProfiles: snap.runtimeProfiles.length, runtimeAssignments: snap.runtimeAssignments.length, tripProfiles: snap.tripProfiles?.length, blockingScenarios: snap.blockingScenarios?.length, trips: snap.trips.length, blocks: snap.blocks.length, costingAssumptions: snap.costingAssumptions?.length ?? 0 };

    const scenario = snap.scenarios[0];
    const bs = snap.blockingScenarios![0];
    const blockRepo = new InMemoryBlockingRepository(snap.blockingScenarios!, snap.blocks as any);
    const blocking = new BlockingApplicationService(blockRepo, {
      getTrip: async (id) => snap.trips.find((t) => t.id === id),
      listTrips: async (sid, tpid) => snap.trips.filter((t) => t.scenarioId === sid && t.tripProfileId === tpid),
      getTripProfile: async (id) => snap.tripProfiles?.find((p) => p.id === id),
      listPatterns: async (sid) => snap.patterns.filter((p) => p.scenarioId === sid),
    });
    const costing = new CostingApplicationService({
      listBlockingScenarios: (sid) => blocking.listBlockingScenarios(sid),
      getCostingCalculationContext: async (sid, bsid) => {
        const blockingScenario = (await blocking.listBlockingScenarios(sid)).find((c) => c.id === bsid);
        if (!blockingScenario) return undefined;
        const tripProfile = snap.tripProfiles!.find((p) => p.id === blockingScenario.tripProfileId)!;
        const trips = snap.trips.filter((t) => t.scenarioId === sid && t.tripProfileId === tripProfile.id);
        const blocks = await blocking.listBlockingBlocks(bsid);
        const blockSummaries = (await Promise.all(blocks.map((b) => blocking.getBlockSummary(bsid, b.id)))).filter((s): s is NonNullable<typeof s> => !!s);
        return { scenario, serviceDays: snap.serviceDays, blockingScenario, tripProfile, trips, blocks, blockSummaries };
      },
    });
    const assumptions = { enteredRate: RATE, rateYear: BASE_YEAR, sourceType: 'user' as const, baseServiceYear: BASE_YEAR, futureYearCount: 0, annualEscalation: 0.03 };
    const result = (await costing.calculateEstimate({ scenarioId: scenario.id, blockingScenarioId: bs.id, assumptions }))!;
    expect(result).toBeTruthy();

    // Independent per-Block summaries (domain function) and eligibility with reason codes.
    const ctx = { scenario, blockingScenario: bs, trips: snap.trips, patterns: snap.patterns };
    const dayIds = new Set(snap.serviceDays.map((d) => d.id));
    for (const day of snap.serviceDays) {
      const dayTrips = snap.trips.filter((t) => t.serviceDayId === day.id);
      const dayBlocks = (snap.blockingScenarios ? snap.blocks : []).filter((b) => b.serviceDayId === day.id);
      let rev = 0, plat = 0, run = 0, dh = 0, lay = 0, eligible = 0; const excluded: any[] = []; const statuses: Record<string, number> = {};
      for (const b of dayBlocks) {
        const s = summarizeBlock(b as any, ctx as any);
        const e = evaluateBlockEligibility(b as any, s, scenario, bs, dayIds);
        statuses[s.status] = (statuses[s.status] ?? 0) + 1;
        out.perBlock.push({ day: day.name, label: b.label, status: s.status, eligible: e.eligible, reasons: e.reasonCodes, revenueHours: s.revenueHours, runningHours: s.runningHours, platformHours: s.platformHours, deadheadHours: s.deadheadHours, layoverHours: s.layoverHours, findings: s.findings.map((f) => f.ruleId) });
        if (e.eligible) { eligible++; rev += s.revenueHours; plat += s.platformHours ?? 0; run += s.runningHours; dh += s.deadheadHours; lay += s.layoverHours; } else excluded.push({ label: b.label, reasons: e.reasonCodes, empty: e.empty });
      }
      const row = result.dailyRows.find((r) => r.serviceDayId === day.id);
      out.days[day.name] = { annualServiceDays: day.annualServiceDays, trips: dayTrips.length, blocks: dayBlocks.length, northOrSouthByDirection: undefined, blockStatuses: statuses, eligible, excluded, direct: { revenueHours: rev, platformHours: plat, runningHours: run, deadheadHours: dh, layoverHours: lay }, costingRow: row && { eligibleBlockCount: row.eligibleBlockCount, excludedBlockCount: row.excludedBlockCount, unassignedTripCount: row.unassignedTripCount, revenueHoursPerDay: row.revenueHoursPerDay, platformHoursPerDay: row.platformHoursPerDay, annualRevenueHours: row.annualRevenueHours, annualPlatformHours: row.annualPlatformHours, annualCostUsd: row.yearCosts[0]?.annualCostUsd } };
    }
    // trips by pattern per day
    out.tripsByDayPattern = {};
    for (const day of snap.serviceDays) for (const p of snap.patterns) { const n = snap.trips.filter((t) => t.serviceDayId === day.id && t.patternId === p.id).length; if (n) (out.tripsByDayPattern[day.name] ??= {})[p.name] = n; }
    out.patterns = snap.patterns.map((p) => ({ name: p.name, points: p.points?.length, totalMiles: p.points?.at(-1)?.cumulativeMiles }));
    out.costing = { state: result.state, noEstimateReason: result.noEstimateReason, findings: result.findings, eligibleBlockCount: result.eligibleBlockCount, excludedBlockCount: result.excludedBlockCount, unassignedTripCount: result.unassignedTripCount, exclusions: result.exclusions, yearRows: result.yearRows, rateUsd: RATE, rateYear: BASE_YEAR };
    const dirs = snap.directions ?? [];
    out.directionsByDay = {};
    for (const day of snap.serviceDays) for (const t of snap.trips.filter((x) => x.serviceDayId === day.id)) { const pat = snap.patterns.find((p) => p.id === t.patternId)!; const k = (pat as any).directionId ?? pat.name; out.directionsByDay[day.name] ??= {}; out.directionsByDay[day.name][k] = (out.directionsByDay[day.name][k] ?? 0) + 1; }
    out.directionNames = Object.fromEntries(dirs.map((d) => [d.id, d.name]));
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log('GOLDEN_FIGURES ' + JSON.stringify(out, null, 2));
  });
});
