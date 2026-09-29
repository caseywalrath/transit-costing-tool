// Validate a generated Federal BRT backup with the application's own domain code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const backupPath = process.argv[2];
if (!backupPath) throw new Error('Usage: node tools/validate_federal_brt_backup.mjs <backup.json>');

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { parseProjectBackup, exportProjectJson, cloneProjectSnapshot } = await vite.ssrLoadModule('/src/persistence/backup.ts');
  const { validateBlockingBlock, validateBlockingAssignments, summarizeBlock } = await vite.ssrLoadModule('/src/domain/blocking.ts');
  const { evaluateBlockEligibility } = await vite.ssrLoadModule('/src/domain/costing.ts');
  const { selectRuntimeBand } = await vite.ssrLoadModule('/src/domain/runtime.ts');
  const snapshot = parseProjectBackup(readFileSync(backupPath, 'utf8'));
  const roundTrip = parseProjectBackup(exportProjectJson(snapshot));
  for (const key of ['scenarios', 'serviceDays', 'routes', 'nodes', 'directions', 'patterns', 'runtimeProfiles', 'runtimeAssignments', 'tripProfiles', 'blockingScenarios', 'trips', 'blocks']) {
    assert.equal(roundTrip[key].length, snapshot[key].length, `${key} count changed after round trip`);
  }
  const importedCopy = parseProjectBackup(exportProjectJson(cloneProjectSnapshot(snapshot)));
  assert.notEqual(importedCopy.project.id, snapshot.project.id, 'Import copy did not get a new Project ID');
  assert.equal(importedCopy.trips.length, snapshot.trips.length);
  assert.equal(importedCopy.blocks.length, snapshot.blocks.length);

  assert.equal(snapshot.trips.length, 984);
  assert.equal(snapshot.blocks.length, 69);
  const scenario = snapshot.scenarios[0];
  const blockingScenario = snapshot.blockingScenarios[0];
  const context = { scenario, blockingScenario, trips: snapshot.trips, patterns: snapshot.patterns };
  const findings = snapshot.blocks.flatMap((block) => validateBlockingBlock(block, context));
  findings.push(...validateBlockingAssignments(blockingScenario, snapshot.blocks, snapshot.trips));
  assert.deepEqual(findings, [], 'Blocking structure or assignments have findings');

  const serviceDayIds = new Set(snapshot.serviceDays.map((day) => day.id));
  const totals = new Map(snapshot.serviceDays.map((day) => [day.id, { name: day.name, trips: 0, blocks: 0, revenueHours: 0, platformHours: 0 }]));
  for (const trip of snapshot.trips) totals.get(trip.serviceDayId).trips += 1;
  for (const block of snapshot.blocks) {
    const summary = summarizeBlock(block, context);
    assert.equal(summary.valid, true, `Invalid block ${block.label}: ${summary.findings.map((f) => f.ruleId).join(', ')}`);
    assert.equal(summary.connections.every((connection) => connection.status === 'valid'), true, `Invalid connection in block ${block.label}`);
    const eligibility = evaluateBlockEligibility(block, summary, scenario, blockingScenario, serviceDayIds);
    assert.equal(eligibility.eligible, true, `Costing excludes ${block.label}: ${eligibility.reasonCodes.join(', ')}`);
    const total = totals.get(block.serviceDayId);
    total.blocks += 1;
    total.revenueHours += summary.revenueHours;
    total.platformHours += summary.platformHours;
  }

  const profiles = new Map(snapshot.runtimeProfiles.map((profile) => [profile.id, profile]));
  const assignmentByDayPattern = new Map(snapshot.runtimeAssignments.map((assignment) => [`${assignment.serviceDayId}:${assignment.patternId}`, assignment]));
  for (const trip of snapshot.trips) {
    const assignment = assignmentByDayPattern.get(`${trip.serviceDayId}:${trip.patternId}`);
    assert.ok(assignment, `Missing runtime assignment for Trip ${trip.id}`);
    const band = selectRuntimeBand(profiles.get(assignment.runtimeProfileId), trip.stopTimes[0].time);
    assert.ok(band, `Missing runtime band for Trip ${trip.id}`);
    const durations = trip.stopTimes.slice(1).map((stop, index) => stop.time - trip.stopTimes[index].time);
    assert.deepEqual(durations, band.segmentRuntimeSeconds, `Runtime band differs from Trip ${trip.id}`);
  }

  console.log(JSON.stringify({ schemaVersion: 6, roundTrip: 'passed', importAsCopy: 'passed', blockFindings: findings.length, costingEligibleBlocks: snapshot.blocks.length, runtimeMatchingTrips: snapshot.trips.length, serviceDays: [...totals.values()] }, null, 2));
} finally {
  await vite.close();
}
