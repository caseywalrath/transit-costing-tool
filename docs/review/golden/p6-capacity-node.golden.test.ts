// Phase 6 measurement (6.1a): domain + application timings at OV-CAP-01 capacity in Node (no assertion of defects).
// Run: P6_SCRATCH=<dir> pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts p6-capacity-node
// Each operation is run 5 times; the median is reported. Backs P6-S1 performance measurements (container CPU).
import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { importProjectJson, exportProjectJson } from '../../../src/persistence/backup';
import { InMemoryRouteDefinitionRepository } from '../../../src/persistence/inMemoryRepository';
import { InMemoryBlockingRepository } from '../../../src/persistence/blockingRepository';
import { TripGenerationService } from '../../../src/application/tripGenerationService';
import { BlockingApplicationService } from '../../../src/application/blockingService';
import { CostingApplicationService } from '../../../src/application/costingService';
import { summarizeBlockingScenario, summarizeBlock } from '../../../src/domain/blocking';
import { capacityBackup } from './p6-capacity-fixture';

const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
async function time(name: string, runs: number, fn: () => unknown | Promise<unknown>, out: Record<string, any>) {
  const xs: number[] = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); await fn(); xs.push(performance.now() - t); }
  out[name] = { medianMs: +med(xs).toFixed(1), runs: xs.map((x) => +x.toFixed(1)) };
}

it('capacity timings (Node)', async () => {
  const out: Record<string, any> = {};
  const backup = capacityBackup({ tripsPerBlock: 5 });
  const text = JSON.stringify(backup);
  await time('importProjectJson(parse+validate, 5.2MB)', 5, () => importProjectJson(text), out);
  const snap = importProjectJson(text);
  await time('exportProjectJson(serialize)', 5, () => exportProjectJson(snap), out);

  const repo = new InMemoryRouteDefinitionRepository();
  await repo.saveProjectSnapshot(snap);
  const svc = new TripGenerationService(repo);
  const day = snap.serviceDays[0];
  const profile = snap.tripProfiles![0];
  const scenarioId = snap.scenarios[0].id; const routeId = snap.routes[0].id;
  const pat = snap.patterns[0];
  // Generation of 500 trips: preview-only (pure) and persisted (in-memory) timing.
  const req = { scenarioId, routeId, serviceDayId: day.id, patternId: pat.id, firstTrip: 14400, headwaySeconds: 120, tripCount: 500, tripProfileId: profile.id };
  await time('previewGenerateTrips(500)', 5, () => svc.previewGenerateTrips(req), out);
  const genRepo = new InMemoryRouteDefinitionRepository(); await genRepo.saveProjectSnapshot({ ...snap, trips: [], blocks: [] });
  const genSvc = new TripGenerationService(genRepo);
  const t0 = performance.now(); const gen = await genSvc.generateTrips(req); out['generateTrips(500) persisted, first run'] = { medianMs: +(performance.now() - t0).toFixed(1), tripCount: gen.trips.length };
  // Recalculate 500 trips of one day
  const dayTrips = snap.trips.filter((t) => t.serviceDayId === day.id);
  const ids = dayTrips.map((t) => t.id);
  expect(ids.length).toBe(500);
  await time('previewRecalculateTrips(500)', 3, () => svc.previewRecalculateTrips(ids), out);
  const rr = new InMemoryRouteDefinitionRepository(); await rr.saveProjectSnapshot(snap); const rs = new TripGenerationService(rr);
  const t1 = performance.now(); let recalc: any; try { recalc = await rs.recalculateTrips(ids, true); } catch (e: any) { recalc = { error: String(e?.message ?? e).slice(0, 200) }; }
  out['recalculateTrips(500, confirm) incl. persist'] = { medianMs: +(performance.now() - t1).toFixed(1), result: recalc?.error ?? recalc?.trips?.length };

  // Blocking summaries
  const bs = snap.blockingScenarios![0];
  const blocks = snap.blocks.filter((b) => b.blockingScenarioId === bs.id) as any[];
  const trips = snap.trips.filter((t) => t.tripProfileId === bs.tripProfileId);
  const ctx = { trips, patterns: snap.patterns };
  const oneDay = blocks.filter((b) => b.serviceDayId === day.id);
  await time('summarizeBlockingScenario(1 day, 100 blocks)', 5, () => summarizeBlockingScenario(bs, oneDay, ctx), out);
  await time('summarizeBlockingScenario(whole, 400 blocks)', 5, () => summarizeBlockingScenario(bs, blocks, ctx), out);
  await time('summarizeBlock(single, domain only)', 5, () => summarizeBlock(blocks[0], { ...ctx, blockingScenario: bs }), out);

  // Application: getBlockSummary per block as the costing context does (main.tsx:35)
  let listTripsCalls = 0; let listPatternsCalls = 0;
  const blockingRepo = new InMemoryBlockingRepository(snap.blockingScenarios!, blocks);
  const blocking = new BlockingApplicationService(blockingRepo, {
    getTrip: async (id) => trips.find((t) => t.id === id),
    listTrips: async (s, p) => { listTripsCalls++; return trips.filter((t) => t.scenarioId === s && t.tripProfileId === p); },
    getTripProfile: async (id) => snap.tripProfiles!.find((p) => p.id === id),
    listPatterns: async () => { listPatternsCalls++; return snap.patterns; },
  });
  await time('getScenarioSummary (app, whole)', 5, () => blocking.getScenarioSummary(bs.id), out);
  listTripsCalls = 0; listPatternsCalls = 0;
  await time('getBlockSummary x400 (costing context path)', 3, async () => { await Promise.all(blocks.map((b) => blocking.getBlockSummary(bs.id, b.id))); }, out);
  out['getBlockSummary x400 reads per run'] = { listTripsCalls: listTripsCalls / 3, listPatternsCalls: listPatternsCalls / 3 };

  // Domain-only cost of the 4-008 fan-out: 300 classifyInsertion calls over in-memory reads (no IndexedDB).
  { const assigned = new Set(blocks.flatMap((b: any) => b.activities.filter((a: any) => a.type === 'revenueTrip').map((a: any) => a.tripId)));
    void assigned; const un = trips.filter((t) => t.serviceDayId === day.id).slice(0, 300);
    const blk = blocks.find((b: any) => b.serviceDayId === day.id);
    await time(`classifyInsertion x${un.length} (in-memory reads, ${un.length} candidates)`, 3, () => Promise.all(un.map((t) => blocking.classifyInsertion(bs.id, blk.id, t.id))), out); }
  // Costing calc
  const costingCtx = async () => {
    const blockSummaries = (await Promise.all(blocks.map((b) => blocking.getBlockSummary(bs.id, b.id)))).filter(Boolean) as any[];
    return { scenario: snap.scenarios[0], serviceDays: snap.serviceDays, blockingScenario: bs, tripProfile: snap.tripProfiles![0], trips, blocks, blockSummaries };
  };
  const cctx = await costingCtx();
  const costing = new CostingApplicationService({ listBlockingScenarios: async () => [bs], getCostingCalculationContext: async () => cctx as any }, repo);
  const assumptions = { enteredRate: 150, rateYear: 2025, sourceType: 'user' as const, baseServiceYear: 2025, futureYearCount: 5, annualEscalation: 0.03 };
  await time('calculateEstimate (prebuilt ctx)', 5, () => costing.calculateEstimate({ scenarioId, blockingScenarioId: bs.id, assumptions: assumptions as any }), out);
  const r = await costing.calculateEstimate({ scenarioId, blockingScenarioId: bs.id, assumptions: assumptions as any });
  out['costing status'] = (r as any)?.status;
  console.log(JSON.stringify(out, null, 1));
  if (process.env.P6_SCRATCH) writeFileSync(`${process.env.P6_SCRATCH}/node-timings.json`, JSON.stringify(out, null, 1));
}, 300000);
